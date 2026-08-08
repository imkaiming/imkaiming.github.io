---
permalink: /project/particules/dsp/
title: "Particules - dsp"
layout: single
author_profile: false
---

{% include particules-nav.html %}

<div class="lang-en" markdown="1">

# PART 1: AUDIO DSP

The granular engine relies on deterministic synthesis with sample-accurate scheduling and a fixed input buffer.

---
## 1.1 GRANULAR ENGINE

This is the DSP orchestrator. It is responsible for the lifecycle of internal components and for processing data at the start of each audio block.

{% highlight cpp %}
void GranularEngine::process(AudioBuffer& outputBuffer, juce::MidiBuffer& midiBuffer, AudioPayload* payload, int bufferSize,
    float* const* outputPtrs, int outputNumChannels, const ParameterSnapshot& ps)
{
    if(!payload)
        return;
    
    AudioBuffer* inputBuffer = payload->buffer.get();

    // midi setup
    juce::MidiBuffer::Iterator midiIterator(midiBuffer);
    juce::MidiMessage midiMsg;
    int midiSamplePosition = 0;
    bool hasMidiEvent = midiIterator.getNextEvent(midiMsg, midiSamplePosition);

    // parameters
    AudioBlock outputBlock(outputBuffer);

    const int inputNumsChannels = inputBuffer->getNumChannels();

    // security
    jassert(inputNumsChannels == outputNumChannels);

    posMod.setParameters(ps.traversalMode, ps.traversalFreq);
    voiceManager.setParameters(ps.attack, ps.decay, ps.sustain, ps.release, ps.emission);

    // main loop
    for(int currentSample = 0; currentSample < bufferSize; currentSample++)
    {
        while(midiSamplePosition == currentSample && hasMidiEvent)
        {
            if(midiMsg.isNoteOn() && midiMsg.getVelocity() > 0)
            {
                voiceManager.noteOn(midiMsg.getNoteNumber(), midiMsg.getFloatVelocity());
            }
            else if(midiMsg.isNoteOff() || midiMsg.isNoteOn(0))
            {
                voiceManager.noteOff(midiMsg.getNoteNumber());
            }
            else if(midiMsg.isAllNotesOff())
            {
                voiceManager.allNotesOff();
            }
            hasMidiEvent = midiIterator.getNextEvent(midiMsg, midiSamplePosition);
        }
        voiceManager.process(currentSample, ps, payload /*, smoothedParams*/);
        grainProcessor.process(currentSample, outputNumChannels, outputPtrs /*, smoothedParams*/);
    }
    posMod.advanceBlock(bufferSize);
    gainProcess(outputBlock, ps.linearGain);
}
{% endhighlight %}

The engine processes MIDI events and then delegates:
* voice management to `VoiceManager`
* grain generation to `GrainProcessor`

---
## 1.2 POLYPHONY

Granular synthesis is triggered by MIDI events. Each note activates a voice, and each voice has its own scheduler and an ADSR.

A total of 8 voices are available. The ADSR state modulates the overall gain of all grains associated with a voice.

When the limit is exceeded (9th note), a voice stealing strategy is applied: the oldest voice is reassigned.

{% highlight cpp %}
void VoiceManager::noteOn(int midiNoteNumber, float velocity)
{
    GranularVoice* voice = findVoiceByNote(midiNoteNumber);

    // find next available voice
    if(voice == nullptr)
        voice = findFreeVoice();

    // voice stealing
    if(voice == nullptr)
        voice = findOldestVoice();

    // trigger the midi note
    if(voice != nullptr)
    {
        int safeNote = std::clamp(midiNoteNumber, 0, 127);
        float pitch = pitchRatioLUT[safeNote];
        voice->noteOn(midiNoteNumber, velocity, pitch, globalSampleCounter);
    }
}
{% endhighlight %}

---
### 1.3 SCHEDULING

The scheduler advances at the sample rate. At the start of each block, the emission frequency is set, which determines an emission interval in samples.

When this interval is reached, a callback triggers grain creation.

{% highlight cpp %}
void Scheduler::setEmission(float e) noexcept
{
    emission = std::clamp(e, params::emission::min, params::emission::max);

    if(sampleRate > 0.0) // in case sample rate hasnt been initialized yet
        interOnSet = sampleRate / (double)emission;
    else
        interOnSet = 0.0;

    if(phase > interOnSet)
        phase = interOnSet;
}
void Scheduler::tick(SpawnGrainCallback spawn, const ParameterSnapshot& ps, AudioPayload* payload, int indexVoice, float pitchRatio, float gain)
{
    // doing nothing is scheduler hasnt been initialized
    if(interOnSet <= 0.0)
        return;

    if(phase >= interOnSet) // sample accuracy trigger
    {
        spawn(ps, payload, indexVoice, pitchRatio, gain);
        phase -= interOnSet;
    }
    phase++;
}
{% endhighlight %}

---
## 1.4 GRAIN POOL

* `GrainPool` has a fixed array of `Grain` and a `freeIndexes` array of primitive integers, both of strictly equal size.  
* `GrainProcessor` maintains a list of active `GrainHandle`s, which ensures that objects are never moved in memory. It also has an active handle counter.

{% highlight cpp %}
Grain* GrainPool::get(const GrainHandle handle)
{
    if(!handle.isValid() || handle.index >= SIZE) // check if index is not 0xFFFF
        return nullptr;

    Grain& g = grains[handle.index];
    if((g.getGeneration() == handle.gen) && g.getActive())
        return &g;
    else
        return nullptr; // return the grain only if the generation matches
}
GrainHandle GrainPool::acquire()
{
    if(nextFree >= SIZE)
        return GrainHandle::getInvalidState();

    const int i = freeIndices[nextFree++];
    Grain& g = grains[i];
    g.setActive(true);
    return GrainHandle{(uint16_t)i, g.getGeneration()};
}
{% endhighlight %}


Using `GrainHandle` means never touching the order of `Grain`s within the pool itself. Only the order of indices in `freeIndexes` is modified.

{% highlight cpp %}
struct GrainHandle
{
    uint16_t index = 0xFFFF;
    uint16_t gen = 0;
    GrainHandle(uint16_t i, uint16_t g) : index{i}, gen{g} {}
    GrainHandle() = default;
    bool isValid() const noexcept { return index != 0xFFFF; }
    static GrainHandle getInvalidState() noexcept { return {0xFFFF, 0}; }
};
{% endhighlight %}

If the pool is saturated, new grain requests are ignored to preserve real-time guarantees.

In a context of very high grain density (500 active grains), the impact is generally barely audible.

{% highlight cpp %}
void GrainProcessor::spawn(const ParameterSnapshot& ps, AudioPayload* payload, int indexVoice, float pitchRatio, float gain)
{
    if(activeCount >= SIZE)
        return; // cannot spawn any more grains

    if(!payload)
        return;

    GrainHandle handle = pool.acquire();
    Grain* grain = pool.get(handle);
    
    if(grain == nullptr)
        return;
    
    grain->payload = payload;
    grain->payload->activeReaders.fetch_add(1, std::memory_order_relaxed);

    visualY[handle.index] = juce::Random::getSystemRandom().nextFloat();
    // init the grain here before process with the snapshot

    grain->config(ps, posMod.getPhase(), indexVoice, static_cast<int>(ps.envMode), pitchRatio, gain);
    activeHandles[activeCount++] = handle;
}
{% endhighlight %}

To create the LIFO behavior, when the `GrainProcessor` decides to release an active `GrainHandle`, before deactivating it, it swaps its position in the array with the last active one. It also decrements the active handle counter. This allows that exact handle to be reused on the next grain spawn.

The last released handle will therefore be the first available. This improves cache locality (L1/L2) by reusing the most recent indices.

---
## 1.5 ENVELOPE

Envelopes are based on symmetric windowing functions (Hann, Gaussian, Exp, etc.), precomputed as LUTs.

Each grain receives an envelope ID at creation, preventing any modification during its lifecycle.

{% highlight cpp %}
void GrainEnvelope::initTableData()
{
    hannLUT.populate(dsp::initHann);
    linearLUT.populate(dsp::initLinear);
    sqrtLUT.populate(dsp::initSqrt);
    gaussianLUT.populate(dsp::initGaussian);
    expLUT.populate(dsp::initExp);
}
void GrainEnvelope::initTablePtr()
{
    tables[static_cast<int>(EnvelopeMode::Hann)] = &hannLUT;
    tables[static_cast<int>(EnvelopeMode::Linear)] = &linearLUT;
    tables[static_cast<int>(EnvelopeMode::Sqrt)] = &sqrtLUT;
    tables[static_cast<int>(EnvelopeMode::Gaussian)] = &gaussianLUT;
    tables[static_cast<int>(EnvelopeMode::Exp)] = &expLUT;
}
{% endhighlight %}

Since the windows are symmetric, a transformation is applied to introduce a controllable plateau. Each grain therefore has three phases:

* fade-in
* plateau
* fade-out

This approach corresponds to a temporal remapping of a symmetric window, rather than the direct use of a pure Hann window as conventionally used in spectral analysis (FFT).

{% highlight cpp %}
    const float Grain::getPhase() const noexcept
    {
        if(durationSamples <= 0)
            return 0.f;

        const float elapsed = static_cast<float>(elapsedSamples);

        if(elapsed < static_cast<float>(fadeInSamples))
            return 0.5f * (elapsed * invFadeInSamples);
        else if(elapsed < static_cast<float>(fadeOutSamples))
            return 0.5f;
        else
        {
            const float stepsIntoRelease = elapsed - static_cast<float>(fadeOutSamples);
            const float releaseProgress = stepsIntoRelease * invFadeInSamples;
            return 0.5f + 0.5f * releaseProgress;
        }
    }
{% endhighlight %}

---
## 1.6 BUFFER

At the start of each block, a pointer to an `AudioPayload` is retrieved. This structure contains the audio buffer and its associated metadata.

Each grain keeps a pointer to the payload assigned at birth, ensuring memory consistency and preventing out‑of‑bounds reads if the buffer is replaced.

---
## 1.7 LINEAR INTERPOLATION

When reading the buffer, a variable pitch is applied per voice, which changes the grain's read speed. Interpolation is then applied to the values written into the output buffer.

**Linear interpolation** reduces read discontinuities and quantization noise while keeping CPU cost minimal.

{% highlight cpp %}
    const float* const* inputPtrs = buffer->getArrayOfReadPointers();
    const int inputNumSamples = buffer->getNumSamples();
    const float envelopeValue = envLut.getEnvelopeModeValue(g->getEnvID(), g->getPhase()) * g->getGain();
    const float readPos = g->getReadPosition();

    int index = static_cast<int>(readPos);
    float frac = readPos - (float)index;

    for(int channel = 0; channel < outputNumChannels; ++channel)
    {
        // interpolating read position
        const float* sample = inputPtrs[channel];
        const float s0 = sample[index] * envelopeValue;

        // buffer is safe because we added one value before setting the input
        const float s1 = sample[index + 1] * envelopeValue;

        outputPtrs[channel][currentSample] += lerp(s0, s1, frac);
    }
{% endhighlight %}

Safe access to `index + 1` relies on adding an extra sample (`numSamples + 1`) that is equal to the value of the very first sample at `index = 0`. This deliberately avoids the need for a modulo check in the main loop.

</div>


<div class="lang-fr" markdown="1">

# PARTIE 1 : DSP AUDIO

Le moteur granulaire repose sur une synthèse déterministe à ordonnancement basée sur une résolution à l'échantillon prêt et un buffer d'entré fixe.

---
## 1.1 MOTEUR GRANULAIRE

c'est l'orchestrateur de la partie DSP. Il est responsable du cycle de vie des composants internes et du traitement des données au début de chaque bloc audio.

{% highlight cpp %}
void GranularEngine::process(AudioBuffer& outputBuffer, juce::MidiBuffer& midiBuffer, AudioPayload* payload, int bufferSize,
    float* const* outputPtrs, int outputNumChannels, const ParameterSnapshot& ps)
{
    if(!payload)
        return;
    
    AudioBuffer* inputBuffer = payload->buffer.get();

    // midi setup
    juce::MidiBuffer::Iterator midiIterator(midiBuffer);
    juce::MidiMessage midiMsg;
    int midiSamplePosition = 0;
    bool hasMidiEvent = midiIterator.getNextEvent(midiMsg, midiSamplePosition);

    // parameters
    AudioBlock outputBlock(outputBuffer);

    const int inputNumsChannels = inputBuffer->getNumChannels();

    // security
    jassert(inputNumsChannels == outputNumChannels);

    posMod.setParameters(ps.traversalMode, ps.traversalFreq);
    voiceManager.setParameters(ps.attack, ps.decay, ps.sustain, ps.release, ps.emission);

    // main loop
    for(int currentSample = 0; currentSample < bufferSize; currentSample++)
    {
        while(midiSamplePosition == currentSample && hasMidiEvent)
        {
            if(midiMsg.isNoteOn() && midiMsg.getVelocity() > 0)
            {
                voiceManager.noteOn(midiMsg.getNoteNumber(), midiMsg.getFloatVelocity());
            }
            else if(midiMsg.isNoteOff() || midiMsg.isNoteOn(0))
            {
                voiceManager.noteOff(midiMsg.getNoteNumber());
            }
            else if(midiMsg.isAllNotesOff())
            {
                voiceManager.allNotesOff();
            }
            hasMidiEvent = midiIterator.getNextEvent(midiMsg, midiSamplePosition);
        }
        voiceManager.process(currentSample, ps, payload /*, smoothedParams*/);
        grainProcessor.process(currentSample, outputNumChannels, outputPtrs /*, smoothedParams*/);
    }
    posMod.advanceBlock(bufferSize);
    gainProcess(outputBlock, ps.linearGain);
}
{% endhighlight %}

Le moteur traite les événements MIDI puis délègue :
* la gestion des voix au `VoiceManager`
* la génération des grains au `GrainProcessor`

---
## 1.2 POLYPHONIE

Les événements MIDI déclenchent la synthèse granulaire. Chaque note active une voix, et chaque voix possède son propre ordonnanceur ainsi qu'un ADSR.

Au total 8 voix sont disponible. L'état de l'ADSR module le gain global des grains associés à une voix.

En cas de dépassement (9e note), un principe de vol de voix est appliqué : la voix la plus ancienne est réassignée.

{% highlight cpp %}
void VoiceManager::noteOn(int midiNoteNumber, float velocity)
{
    GranularVoice* voice = findVoiceByNote(midiNoteNumber);

    // find next available voice
    if(voice == nullptr)
        voice = findFreeVoice();

    // voice stealing
    if(voice == nullptr)
        voice = findOldestVoice();

    // trigger the midi note
    if(voice != nullptr)
    {
        int safeNote = std::clamp(midiNoteNumber, 0, 127);
        float pitch = pitchRatioLUT[safeNote];
        voice->noteOn(midiNoteNumber, velocity, pitch, globalSampleCounter);
    }
}
{% endhighlight %}

---
### 1.3 ORDONNANCEMENT

l'ordonnanceur avance à la vitesse de la fréquence d'échantillonnage. À chaque début de bloc, la fréquence d'émission est configurée, ce qui détermine un intervalle d'émission en nombre d'échantillons.

Lorsque cet intervalle est atteint, un callback déclenche la création d'un grain.

{% highlight cpp %}
void Scheduler::setEmission(float e) noexcept
{
    emission = std::clamp(e, params::emission::min, params::emission::max);

    if(sampleRate > 0.0) // in case sample rate hasnt been initialized yet
        interOnSet = sampleRate / (double)emission;
    else
        interOnSet = 0.0;

    if(phase > interOnSet)
        phase = interOnSet;
}
void Scheduler::tick(SpawnGrainCallback spawn, const ParameterSnapshot& ps, AudioPayload* payload, int indexVoice, float pitchRatio, float gain)
{
    // doing nothing is scheduler hasnt been initialized
    if(interOnSet <= 0.0)
        return;

    if(phase >= interOnSet) // sample accuracy trigger
    {
        spawn(ps, payload, indexVoice, pitchRatio, gain);
        phase -= interOnSet;
    }
    phase++;
}
{% endhighlight %}

---
## 1.4 GRAIN POOL 

* `GrainPool` possède un tableau de `Grain` fixe et un tableau `freeIndexes` d'entier primitif, tout deux de taille strictement égale.  
* `GrainProcessor` maintient une liste de `GrainHandle` actifs, ce qui permet de ne jamais déplacer les objets en mémoire. Il a aussi un compteur de handle actif.

{% highlight cpp %}
Grain* GrainPool::get(const GrainHandle handle)
{
    if(!handle.isValid() || handle.index >= SIZE) // check if index is not 0xFFFF
        return nullptr;

    Grain& g = grains[handle.index];
    if((g.getGeneration() == handle.gen) && g.getActive())
        return &g;
    else
        return nullptr; // return the grain only if the generation matches
}
GrainHandle GrainPool::acquire()
{
    if(nextFree >= SIZE)
        return GrainHandle::getInvalidState();

    const int i = freeIndices[nextFree++];
    Grain& g = grains[i];
    g.setActive(true);
    return GrainHandle{(uint16_t)i, g.getGeneration()};
}
{% endhighlight %}


Utiliser des `GrainHandle` permet de ne jamais toucher à l'ordre des `Grains` au sein même du pool. On modifie seulement l'ordre des indexes dans `freeIndexes`

{% highlight cpp %}
struct GrainHandle
{
    uint16_t index = 0xFFFF;
    uint16_t gen = 0;
    GrainHandle(uint16_t i, uint16_t g) : index{i}, gen{g} {}
    GrainHandle() = default;
    bool isValid() const noexcept { return index != 0xFFFF; }
    static GrainHandle getInvalidState() noexcept { return {0xFFFF, 0}; }
};
{% endhighlight %}

Si le pool est saturé, les nouvelles demandes de grains sont ignorées afin de préserver les garanties temps réel. 

Dans un contexte de forte très forte densité de grains (500 grains actifs), l'impact est généralement peu audible.

{% highlight cpp %}
void GrainProcessor::spawn(const ParameterSnapshot& ps, AudioPayload* payload, int indexVoice, float pitchRatio, float gain)
{
    if(activeCount >= SIZE)
        return; // cannot spawn any more grains

    if(!payload)
        return;

    GrainHandle handle = pool.acquire();
    Grain* grain = pool.get(handle);
    
    if(grain == nullptr)
        return;
    
    grain->payload = payload;
    grain->payload->activeReaders.fetch_add(1, std::memory_order_relaxed);

    visualY[handle.index] = juce::Random::getSystemRandom().nextFloat();
    // init the grain here before process with the snapshot

    grain->config(ps, posMod.getPhase(), indexVoice, static_cast<int>(ps.envMode), pitchRatio, gain);
    activeHandles[activeCount++] = handle;
}
{% endhighlight %}

Pour créer le comportement LIFO, il faut que dans le `GrainProcessor`, lorsqu'on décide de relacher le `GrainHandle` actif, avant de le rendre inactif, on échange sa position dans le table avec le dernier actif. On décrémente également le compteur de nombre de handle actif. Cela permet de recupérer cet exact handle au moment du prochain spawn de `Grains`.

Le dernier handle relaché sera donc le premier disponible. Cela favorise la localité cache (L1/L2) en réutilisant les derniers indices.

---
## 1.5 ENVELOPPE 

les enveloppes sont basées sur des fonctions de fenêtrage symétriques (Hann, Gaussian, Exp, etc.), pré-calculées sous forme de LUT.

Chaque grain reçoit un identifiant d'enveloppe à sa création, ce qui évite toute modification pendant son cycle de vie.

{% highlight cpp %}
void GrainEnvelope::initTableData()
{
    hannLUT.populate(dsp::initHann);
    linearLUT.populate(dsp::initLinear);
    sqrtLUT.populate(dsp::initSqrt);
    gaussianLUT.populate(dsp::initGaussian);
    expLUT.populate(dsp::initExp);
}
void GrainEnvelope::initTablePtr()
{
    tables[static_cast<int>(EnvelopeMode::Hann)] = &hannLUT;
    tables[static_cast<int>(EnvelopeMode::Linear)] = &linearLUT;
    tables[static_cast<int>(EnvelopeMode::Sqrt)] = &sqrtLUT;
    tables[static_cast<int>(EnvelopeMode::Gaussian)] = &gaussianLUT;
    tables[static_cast<int>(EnvelopeMode::Exp)] = &expLUT;
}
{% endhighlight %}

Les fenêtres étant symétriques, une transformation est appliquée pour introduire un plateau contrôlable. Chaque grain possède donc trois phases :

* fade-in
* plateau
* fade-out

Cette approche correspond plus à une remapping temporel d'une fenêtre symétrique, et non à l'utilisation directe d'une Hann pure utilisée classiquement en analyse spectrale (FFT).

{% highlight cpp %}
    const float Grain::getPhase() const noexcept
    {
        if(durationSamples <= 0)
            return 0.f;

        const float elapsed = static_cast<float>(elapsedSamples);

        if(elapsed < static_cast<float>(fadeInSamples))
            return 0.5f * (elapsed * invFadeInSamples);
        else if(elapsed < static_cast<float>(fadeOutSamples))
            return 0.5f;
        else
        {
            const float stepsIntoRelease = elapsed - static_cast<float>(fadeOutSamples);
            const float releaseProgress = stepsIntoRelease * invFadeInSamples;
            return 0.5f + 0.5f * releaseProgress;
        }
    }
{% endhighlight %}

---
## 1.6 BUFFER 

au début de chaque bloc, un pointeur vers un AudioPayload est récupéré. Cette structure contient le buffer audio ainsi que ses métadonnées.

Chaque grain conserve un pointeur vers le payload associé à sa naissance, garantissant la cohérence mémoire et évitant toute lecture hors limites si le buffer est remplacé.

---
## 1.7 INTERPOLATION LINEAIRE 

Lors de la lecture du buffer, sur chaque voix un pitch variable est appliqué, ce qui modifie la vitesse de lecture du grain. On applique alors une interpolation sur les valeurs écrites dans la mémoire tampon de sortie.

**L'interpolation linéaire** réduit les discontinuités de lecture et le bruit de quantification tout en conservant un coût CPU minimal.

{% highlight cpp %}
    const float* const* inputPtrs = buffer->getArrayOfReadPointers();
    const int inputNumSamples = buffer->getNumSamples();
    const float envelopeValue = envLut.getEnvelopeModeValue(g->getEnvID(), g->getPhase()) * g->getGain();
    const float readPos = g->getReadPosition();

    int index = static_cast<int>(readPos);
    float frac = readPos - (float)index;

    for(int channel = 0; channel < outputNumChannels; ++channel)
    {
        // interpolating read position
        const float* sample = inputPtrs[channel];
        const float s0 = sample[index] * envelopeValue;

        // buffer is safe because we added one value before setting the input
        const float s1 = sample[index + 1] * envelopeValue;

        outputPtrs[channel][currentSample] += lerp(s0, s1, frac);
    }
{% endhighlight %}

La sécurité d'accès `index + 1` repose sur l'ajoute d'un sample supplémentaire de `numSamples + 1` qui est égale à la valeur du tout premier sample a `index = 0`. De ce fait, on s'évite volontairement la vérification nécessitant un modulo dans la boucle principale.

</div>