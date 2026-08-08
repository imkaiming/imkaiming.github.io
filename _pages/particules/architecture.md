---
permalink: /project/particules/architecture/
title: "Particules - Architecture"
layout: single
author_profile: false
---

{% include particules-nav.html %}

<div class="lang-en" markdown="1">

# PART 2: ARCHITECTURE AND MESSAGE PASSING

Particules draws inspiration from the **Model-View-Controller** pattern. However, this model is limited in a real‑time audio processing context. The audio thread must never be blocked (no mutex, no allocation), which makes concurrent access to the model dangerous.

With JUCE, two main threads coexist:

* the **audio thread**, executed in `processBlock`. It does not depend on the UI thread.
* the **message thread (UI)**, responsible for the interface and user interactions.

It is therefore necessary to implement a non‑blocking communication strategy, guaranteeing strict isolation of the audio thread.

---
## 2.1 ORCHESTRATION

JUCE provides the `PluginProcessor` and `PluginEditor` classes as entry points.  
To avoid coupling the internal logic to JUCE, Particules introduces a central class: **`PluginCore`**, which acts as an orchestrator.

Its role is:
* to initialise the DSP components
* to centralise state
* to configure communication flows

This makes it possible to separate:
* business logic (DSP, state, communication)
* from the JUCE infrastructure

---
## 2.2 STATE

The plugin’s state is split into several specialised structures:

* **ParameterState:** provides access to parameters as atomic pointers to the `AudioProcessorValueTreeState` defined in `PluginCore`. It creates an immutable snapshot (`ParameterSnapshot`) captured at the start of every audio block for the DSP to read parameters.

* **AudioState:** contains primitive atomic data related to the audio domain (e.g. the number of active grains). This data is written by the audio thread and read by the UI.

* **UIState:** contains data related to the interface (e.g. `AudioThumbnail`, the current file). It also acts as an event source for the UI.

These structures are **not used directly between threads**.  
They serve as storage, but synchronisation is ensured by dedicated mechanisms (lock‑free buffers, facades).

---
## 2.3 POLLING

To read telemetry from the DSP engine, the interface uses a **polling mechanism via `juce::Timer`** (~30 Hz).

Polling only strictly reads data stored in the state classes (primitive atomics or visual snapshots).

This guarantees that:
* the UI never blocks the audio thread (no need to synchronise threads)
* data is read opportunistically and does not cause any computations on the audio thread
* the visual refresh rate can be controlled independently of the audio block execution speed.

{% highlight cpp %}
void AudioFilePanel::timerCallback()
{
    const int numGrains = audioState.getNumActiveGrains();
    if(numGrains != lastNumGrains)
    {
        numGrainsLabel.setText(str::formatted("%d", numGrains), juce::dontSendNotification);
        lastNumGrains = numGrains;
    }

    const double totalSamples = static_cast<double>(audioState.getNumSamples());
    const double sampleRate = audioState.getSampleRate();

    if(posParam != nullptr)
    {
        const float posVal = posParam->load(std::memory_order_relaxed);
        if(posVal != lastPos)
        {
            const double absolutePosSamples = static_cast<double>(posVal) * totalSamples;
            posLabel.setText(
                "POS: " + utils::formatSamplesToTime(absolutePosSamples, sampleRate), juce::dontSendNotification);
            lastPos = posVal;
        }
    }

    if(spanParam != nullptr)
    {
        const float spanVal = spanParam->load(std::memory_order_relaxed);
        if(spanVal != lastSpan)
        {
            const double absoluteSpanSamples = static_cast<double>(spanVal) * totalSamples;
            spanLabel.setText(
                "SPAN: " + utils::formatSamplesToTime(absoluteSpanSamples, sampleRate), juce::dontSendNotification);
            lastSpan = spanVal;
        }
    }

    grainVisualComponent.repaint();
}
{% endhighlight %}

---
## 2.4 EVENT-BASED COMMUNICATION

`UIState` derives from `ChangeBroadcaster`. It acts as the broadcaster. This allows the interface to be notified of significant events. UI components register themselves as listeners of `UIState` and will be notified of changes announced by the broadcaster.

The broadcaster is only called from the UI thread to notify graphic components of a state change (e.g. loading a new audio file).

{% highlight cpp %}
void UIState::setSource(const juce::File& f) noexcept
{
    audioThumbnail.setSource(new juce::FileInputSource(f));
    currentFile = f;
    setFileLoaded(true);
}

void UIState::setFileLoaded(bool b)
{
    fileLoaded.store(b, std::memory_order_relaxed);
    sendChangeMessage(); // "a file has been successfully loaded now update graphic components"
}
{% endhighlight %}

{% highlight cpp %}
void AudioFilePanel::changeListenerCallback(juce::ChangeBroadcaster* source)
{
    if(source == &uiState)
    {
        if(uiState.isFileLoaded())
        {
            numSamples = audioState.getNumSamples();
            const juce::File& currentFile = uiState.getCurrentFile();

            sliderOnWaveform->setAudioLoaded(true);
            sliderOnWaveform->setEnabled(true);
            sliderOnWaveform->setAlpha(1.0f);

            grainVisualComponent.setNumSamples(numSamples);

            fileNameLabel.setText(currentFile.getFileName(), juce::dontSendNotification);
            fileNameLabel.setVisible(true);
            fileNameLabel.setVisible(true);
            grainsLabel.setVisible(true);
            numGrainsLabel.setVisible(true);
            posTitleLabel.setVisible(true);
            posLabel.setVisible(true);
            spanTitleLabel.setVisible(true);
            spanLabel.setVisible(true);
        }
        else
        {
            sliderOnWaveform->setAudioLoaded(false);
            sliderOnWaveform->setEnabled(false);
            sliderOnWaveform->setAlpha(0.2f);

            fileNameLabel.setVisible(false);
            grainsLabel.setVisible(false);
            numGrainsLabel.setVisible(false);
            posTitleLabel.setVisible(false);
            posLabel.setVisible(false);
            spanTitleLabel.setVisible(false);
            spanLabel.setVisible(false);
        }
    }
}
{% endhighlight %}

---
## 2.5 FACADES

The **`FromAudio`** and **`FromUI`** classes act as communication facades.

Goals:
* prevent direct access to internal state
* encapsulate synchronisation details
* reduce coupling between DSP and UI
* provide a clear separation of responsibilities

Examples:
* `FromAudio` exposes write functions to `AudioState`
* `FromUI` encapsulates callbacks triggered by the interface

{% highlight cpp %}
PluginCore::PluginCore(juce::AudioProcessor& p)
   : proc{p}, apvts(p, nullptr, "Parameters", createParameterLayout()), paramState{}, granularEngine{faudio}, audioState{},
    uiState{}, uic{apvts, paramState, audioState, uiState, fui, faudio}, loader{}, debugPresetLoaded{false},
    incomingBuffer{}, garbageCollector{}, currentPayload{nullptr}, wasAuditioning{false},
    synchronizer{currentPayload, garbageCollector, audioState, uiState}, faudio{audioState, visualBuffer}
{
    onAudioLoadedCallback = [this](std::unique_ptr<AudioBuffer> buffer, const juce::File& loadedFile) {
        AudioPayload* newPayload = new AudioPayload();

        newPayload->buffer = std::move(buffer);
        newPayload->numSamples = newPayload->buffer->getNumSamples() - 1; // minus the guard sample 
        newPayload->numChannels = newPayload->buffer->getNumChannels();
        newPayload->file = loadedFile;

        incomingBuffer.push(newPayload);
    };

    fui.onLoadFile = [this] { loader.loadFile(onAudioLoadedCallback, uiState.getCurrentFile()); };
    fui.onLoadFilePath = [this](const str& path) { loader.loadFile(path, onAudioLoadedCallback, uiState.getCurrentFile()); };
    fui.onSetPlaying = [this](bool play) {
        if(juce::RangedAudioParameter* param = apvts.getParameter(params::play::id))
        {
            param->beginChangeGesture();
            param->setValueNotifyingHost(param->convertTo0to1(play ? 1.0f : 0.0f));
            param->endChangeGesture();
        }
    };
    fui.onIsPlaying = [this]() -> float { return paramState.getPlay() > 0.5f ? 1.0f : 0.f; };

    synchronizer.start(10);
}
{% endhighlight %}

</div>

<div class="lang-fr" markdown="1">

# PARTIE 2 : ARCHITECTURE ET PASSAGE DE MESSAGES

Particules s'inspire du modèle **Modèle-Vue-Contrôleur**. ce modèle est limité dans un contexte de traitement audio temps réel. Le thread audio ne doit pas être bloqué (pas de mutex, pas d'allocation), ce qui rend les accès concurrents au modèle dangereux.

Avec JUCE, deux threads principaux coexistent :

* le **thread audio**, exécuté dans `processBlock`. Il ne dépend pas du thread UI.
* le **message thread (UI)**, responsable de l'interface et des interactions utilisateur

Il est donc nécessaire de mettre en place une stratégie de communication non bloquante, garantissant l'isolation stricte du thread audio.

---
## 2.1 ORCHESTRATION

JUCE fourni les classes `PluginProcessor` et `PluginEditor` comme points d'entrée.
Pour éviter de coupler la logique interne à JUCE, Particules introduit une classe centrale : **`PluginCore`** qui agit comme un orchestrateur.

Son rôle est :
* d'initialiser les composants DSP
* centraliser les états
* configurer les flux de communication

Cela permet de séparer :
* la logique métier (DSP, états, communication)
* de l'infrastructure JUCE

---
## 2.2 ETATS

L'état du plugin est découpé en plusieurs structures spécialisées :

* **ParameterState :** fournit un accès aux paramètres sous forme de pointeurs atomiques vers les paramètres `AudioProcessorValueTreeState` définie dans le `PluginCore`. Il créé un snapshot non-mutable (`ParameterSnapshot`) capturé au début de chaque bloc audio pour la lecture des paramètres par le DSP.

* **AudioState :** contient des données atomiques primitives liées au domaine audio (e.g. le nombre de grains actifs). Ces données sont écrites par le thread audio et lues par l'UI.

* **UIState :** contient les données liées à l'interface (e.g. `AudioThumbnail`, le fichier courant). Il agit également comme source d'événements pour l'UI.

Ces structures ne sont **pas utilisées directement entre threads**.
Elles servent de stockage, mais la synchronisation est assurée par des mécanismes dédiés (buffers lock-free, façades).

---
## 2.3 POLLING

Pour lire la télémétrie du moteur DSP, l'interface utilise un mécanisme de **polling via `juce::Timer`** (~30 Hz).

Le polling ne fait que strictement lire les données stockées dans les classes d'êtats (atomiques primitives ou snapshot visuels).

Cela garantit que :
* l'UI ne bloque jamais le thread audio (pas besoin de synchroniser les threads)
* les données sont lues de manière opportuniste et n'engendre pas de calculs de la part du thread audio
* contrôler la fréquence de rafraîchissement visuel indépendamment de la vitesse d'exécution des blocs audio.


{% highlight cpp %}
void AudioFilePanel::timerCallback()
{
    const int numGrains = audioState.getNumActiveGrains();
    if(numGrains != lastNumGrains)
    {
        numGrainsLabel.setText(str::formatted("%d", numGrains), juce::dontSendNotification);
        lastNumGrains = numGrains;
    }

    const double totalSamples = static_cast<double>(audioState.getNumSamples());
    const double sampleRate = audioState.getSampleRate();

    if(posParam != nullptr)
    {
        const float posVal = posParam->load(std::memory_order_relaxed);
        if(posVal != lastPos)
        {
            const double absolutePosSamples = static_cast<double>(posVal) * totalSamples;
            posLabel.setText(
                "POS: " + utils::formatSamplesToTime(absolutePosSamples, sampleRate), juce::dontSendNotification);
            lastPos = posVal;
        }
    }

    if(spanParam != nullptr)
    {
        const float spanVal = spanParam->load(std::memory_order_relaxed);
        if(spanVal != lastSpan)
        {
            const double absoluteSpanSamples = static_cast<double>(spanVal) * totalSamples;
            spanLabel.setText(
                "SPAN: " + utils::formatSamplesToTime(absoluteSpanSamples, sampleRate), juce::dontSendNotification);
            lastSpan = spanVal;
        }
    }

    grainVisualComponent.repaint();
}
{% endhighlight %}

---
## 2.4 COMMUNICATION EVENEMENTIELLE 

`UIState` dérive de `ChangeBroadcaster`. Il s'agit de l'émetteur. Cela permet de notifier l'interface lors d'événements significatifs. Les composants UI s'enregistrent en tant que auditeur du `UIState` et seront attentif aux changements annoncés par l'émetteur.

Il est uniquement appelé depuis le thread UI afin de notifier les composants graphiques d'un changement d'état (e.g. chargement d'un nouveau fichier audio).

{% highlight cpp %}
void UIState::setSource(const juce::File& f) noexcept
{
    audioThumbnail.setSource(new juce::FileInputSource(f));
    currentFile = f;
    setFileLoaded(true);
}

void UIState::setFileLoaded(bool b)
{
    fileLoaded.store(b, std::memory_order_relaxed);
    sendChangeMessage(); // "a file has been successfully loaded now update graphic components"
}
{% endhighlight %}

{% highlight cpp %}
void AudioFilePanel::changeListenerCallback(juce::ChangeBroadcaster* source)
{
    if(source == &uiState)
    {
        if(uiState.isFileLoaded())
        {
            numSamples = audioState.getNumSamples();
            const juce::File& currentFile = uiState.getCurrentFile();

            sliderOnWaveform->setAudioLoaded(true);
            sliderOnWaveform->setEnabled(true);
            sliderOnWaveform->setAlpha(1.0f);

            grainVisualComponent.setNumSamples(numSamples);

            fileNameLabel.setText(currentFile.getFileName(), juce::dontSendNotification);
            fileNameLabel.setVisible(true);
            fileNameLabel.setVisible(true);
            grainsLabel.setVisible(true);
            numGrainsLabel.setVisible(true);
            posTitleLabel.setVisible(true);
            posLabel.setVisible(true);
            spanTitleLabel.setVisible(true);
            spanLabel.setVisible(true);
        }
        else
        {
            sliderOnWaveform->setAudioLoaded(false);
            sliderOnWaveform->setEnabled(false);
            sliderOnWaveform->setAlpha(0.2f);

            fileNameLabel.setVisible(false);
            grainsLabel.setVisible(false);
            numGrainsLabel.setVisible(false);
            posTitleLabel.setVisible(false);
            posLabel.setVisible(false);
            spanTitleLabel.setVisible(false);
            spanLabel.setVisible(false);
        }
    }
}
{% endhighlight %}


---
## 2.5 FACADES

Les classes **`FromAudio`** et **`FromUI`** agissent comme des façades de communication.

Objectifs :
* empêcher l'accès direct aux états internes
* encapsuler les détails de synchronisation
* réduire le couplage entre DSP et UI
* une séparation claire des responsabilités

Exemples :
* `FromAudio` expose des fonctions d'écriture vers `AudioState`
* `FromUI` encapsule des callbacks déclenchés par l'interface


{% highlight cpp %}
PluginCore::PluginCore(juce::AudioProcessor& p)
   : proc{p}, apvts(p, nullptr, "Parameters", createParameterLayout()), paramState{}, granularEngine{faudio}, audioState{},
    uiState{}, uic{apvts, paramState, audioState, uiState, fui, faudio}, loader{}, debugPresetLoaded{false},
    incomingBuffer{}, garbageCollector{}, currentPayload{nullptr}, wasAuditioning{false},
    synchronizer{currentPayload, garbageCollector, audioState, uiState}, faudio{audioState, visualBuffer}
{
    onAudioLoadedCallback = [this](std::unique_ptr<AudioBuffer> buffer, const juce::File& loadedFile) {
        AudioPayload* newPayload = new AudioPayload();

        newPayload->buffer = std::move(buffer);
        newPayload->numSamples = newPayload->buffer->getNumSamples() - 1; // minus the guard sample 
        newPayload->numChannels = newPayload->buffer->getNumChannels();
        newPayload->file = loadedFile;

        incomingBuffer.push(newPayload);
    };

    fui.onLoadFile = [this] { loader.loadFile(onAudioLoadedCallback, uiState.getCurrentFile()); };
    fui.onLoadFilePath = [this](const str& path) { loader.loadFile(path, onAudioLoadedCallback, uiState.getCurrentFile()); };
    fui.onSetPlaying = [this](bool play) {
        if(juce::RangedAudioParameter* param = apvts.getParameter(params::play::id))
        {
            param->beginChangeGesture();
            param->setValueNotifyingHost(param->convertTo0to1(play ? 1.0f : 0.0f));
            param->endChangeGesture();
        }
    };
    fui.onIsPlaying = [this]() -> float { return paramState.getPlay() > 0.5f ? 1.0f : 0.f; };

    synchronizer.start(10);
}
{% endhighlight %}

</div>