---
permalink: /project/particules/memory/
title: "Particules - Memory"
layout: single
author_profile: false
---


{% include particules-nav.html %}

<div class="lang-en" markdown="1">

# PART 3 : MEMORY, THREADS, AND REAL-TIME CONSTRAINTS

In a real‑time audio context, all inter‑thread communication must be **non‑blocking and deterministic**.  
Using mutexes, dynamic allocations, or uncontrolled shared structures introduces **audio glitch** risks.

Communication between threads relies on:

* lock‑free structures, to prevent blocking
* a producer/consumer model that transmits data without temporal dependency
* explicit memory management, avoiding allocations inside the audio thread

---
## 3.1 RING BUFFER

The audio file loaded in memory can be dynamically replaced by the user at any time.  
A strategy is therefore needed to manage this dynamic data (`AudioPayload`).  
To do this, the data is passed through a **Single Producer / Single Consumer** structure.

* **Producer**: the UI thread loads the file and constructs the payload
* **Consumer**: the audio thread (`processBlock`) retrieves the current payload at the start of each block

{% highlight cpp %}
bool push(T item) noexcept
{
    const int currentWrite = writePos.load(std::memory_order_relaxed);
    const int nextWrite = (currentWrite + 1) % Size;

    if(nextWrite == readPos.load(std::memory_order_acquire))
        return false; // queue is full

    buffer[currentWrite] = item;
    writePos.store(nextWrite, std::memory_order_release);   
    return true;
}

T pop() noexcept
{
    const int currentRead = readPos.load(std::memory_order_relaxed);

    if(currentRead == writePos.load(std::memory_order_acquire))
        return nullptr; // queue is empty

    T item = buffer[currentRead];
    readPos.store((currentRead + 1) % Size, std::memory_order_release);
    return item;
}
{% endhighlight %}

* **std::memory_order_release**: all previous writes are visible before the index is published
* **std::memory_order_acquire**: the reader thread sees those writes after reading the index

{% highlight cpp %}
    AudioPayload* payload = currentPayload.load(std::memory_order_relaxed);
    bool fileSwappedThisBlock = false;

    // 1. new payload verification
    while(AudioPayload* next = incomingBuffer.pop())
    {
        if(payload)
            garbageCollector.push(payload);

        payload = next;
    }

    // 2. set the new payload as the current
    currentPayload.store(payload, std::memory_order_release);

    if(payload == nullptr)
        return;
{% endhighlight %}

Note: we instantiate `AudioPayload` pointers with this template.

This allows:

* Allocations are done on the UI thread and used on the audio thread
* No mutex needed to retrieve the current payload (constant‑time access)
* Unidirectional communication: the ring buffer never retrieves the payload back
* No interruption of the ongoing processing

---
## 3.2 DEFERRED DESTRUCTION

When an `AudioPayload` becomes obsolete, the audio thread cannot free memory (`delete`).

It is pushed into a **destruction queue** (Garbage Queue) – a second `RingBuffer` of the same size – that will be emptied by the UI.

Inside `PluginCore::processBlock()`:
{% highlight cpp %}
    // 1. new payload verification
    while(AudioPayload* next = incomingBuffer.pop())
    {
        if(payload)
            garbageCollector.push(payload);

        payload = next;
    }
{% endhighlight %}

To empty the destruction queue containing `AudioPayload` pointers, we create a `StateSynchronizer` that derives from `juce::Timer` (~10 Hz).

However, if grains are active in the pool and still reading an old payload, we risk clicks due to a sudden phase change, as well as reading beyond the limits of the new buffer. It is therefore essential to ensure that the active grains no longer point to the old buffer before deleting it.

{% highlight cpp %}
    // 1. emptying the garbage collector
    while(AudioPayload* oldPayload = releaseQueue.pop())
        pendingDeletions.push_back(oldPayload);

    // 2. verifying no grains are currently reading the payload before deleting it
    pendingDeletions.erase(std::remove_if(pendingDeletions.begin(), pendingDeletions.end(),
            [](AudioPayload* p) {
                if(p->activeReaders.load(std::memory_order_acquire) == 0)
                {
                    delete p;
                    return true;
                }
            return false; // some grains are still active. The deletion is delayed to the next tick.
            }),
        pendingDeletions.end());

    // 3. state syncing
    AudioPayload* playingNow = currentPayload.load(std::memory_order_acquire);
    if(playingNow != nullptr && playingNow != lastSeenPayload)
    {
        audioState.setNumSamples(playingNow->numSamples);
        audioState.setNumChannels(playingNow->numChannels);
        uiState.setSource(playingNow->file); // retrigger the new audio thumbnail repaint
        lastSeenPayload = playingNow;
    }
{% endhighlight %}

The integer `activeReaders` is decremented gradually at the end of each grain's life. Only when it reaches zero does the `StateSynchronizer` allow the old payload to be deleted.

Inside `GrainProcessor::process()`:
{% highlight cpp %}
    g->nextReadPosition();
    if(g->isExhausted() || voiceManager.isVoiceDead(g->getVoiceID()))
    {
        if(p != nullptr)
        {
            g->payload->activeReaders.fetch_sub(1, std::memory_order_acq_rel);
            g->payload = nullptr;
        }
        pool.release(h);
        removeVoice(i);
    }
{% endhighlight %}

---
## 3.3 PING‑PONG BUFFER

To display the active grains being read on the waveform of the loaded file, we need to collect the position of active grains and fill a structure called `GrainVisual` that only contains `xAxis` and `yAxis` floats. Communication therefore goes from the Audio (producer) to the UI (consumer). The stakes are the same as for the ring buffer, except that we don't need a queue in this case, nor do we need to delete data. We simply overwrite the data on the UI side.

Principle:
* only the Audio thread can write
* the UI thread can only read the data

{% highlight cpp %}
template <typename T>
class PingPongBuffer
{
    static_assert(
        std::is_trivially_copyable<T>(), "PingPongBuffer<T> : T must be trivially copyable. No vector or array");

public:
    PingPongBuffer() = default;

    // Audio Thread ; single producer
    T& beginWriteBuffer() noexcept { return buffers[writeIndex]; }

    // swapping index value to confirm the data has been published
    void endWriteBuffer() noexcept
    {
        readIndex.store(writeIndex, std::memory_order_release);
        writeIndex = 1 - writeIndex;
    }

    // GUI thread : single consumer
    const T& getReadBuffer() const noexcept { return buffers[readIndex.load(std::memory_order_acquire)]; }

    PingPongBuffer(const PingPongBuffer&) = delete; // no copy constructor
    PingPongBuffer& operator=(const PingPongBuffer&) = delete; // no assignment
private:
    T buffers[2];
    int writeIndex = 0; // strictly for the audio thread
    std::atomic<int> readIndex{0}; 
};
{% endhighlight %}

Note: we do not wish to transfer ownership, so we instantiate values by copy (`PingPongBuffer<VisualSnapshot>`).  
Note: to avoid writing to the `VisualSnapshot` at the end of every sample block, we synchronise the audio DSP with a counter that estimates the UI refresh rate in Hz, because the `PingPongBuffer` is called from the UI via the polling system.

The audio thread is responsible for writing to the `PingPongBuffer`, and the `FromAudio` class encapsulates the write methods.

{% highlight cpp %}
VisualSnapshot& beginWriteVisualSnapshot() const noexcept { return visualBuffer.beginWriteBuffer(); }
void endWriteVisualSnapshot() const noexcept { visualBuffer.endWriteBuffer(); }
{% endhighlight %}

</div>


<div class="lang-fr" markdown="1">

# PARTIE 3 : MEMOIRE, THREADS ET CONTRAINTES TEMPS REEL

Dans un contexte audio temps réel, toute communication entre threads doit être **non bloquante et déterministe**. L'utilisation de mutex, d'allocations dynamiques ou de structures partagées non contrôlées introduit des risques de **glitchs audio**.

La communication entre les threads repose sur :
* des structures lock‑free, pour prévenir les blocages
* un modèle émetteur / récepteur permettant de transmettre des données sans dépendance temporelle
* une gestion explicite de la mémoire, évitant les allocations dans le thread audio

---
## 3.1 RINGBUFFER

Le fichier audio chargé en memoire peut être dynamiquement remplacé a tout moment par l'utilisateur. Il faut donc une stratégie de gestion de cette données dynamique (`AudioPayload`). Pour cela on fait transiter cette donné via une structure **Single Producer / Single Consumer**.

* **Producteur** : le thread UI charge le fichier puis construit le payload
* **Consommateur** : le thread audio (`processBlock`) récupere le payload courant au debut de chaque bloc

{% highlight cpp %}
bool push(T item) noexcept
{
    const int currentWrite = writePos.load(std::memory_order_relaxed);
    const int nextWrite = (currentWrite + 1) % Size;

    if(nextWrite == readPos.load(std::memory_order_acquire))
        return false; // queue is full

    buffer[currentWrite] = item;
    writePos.store(nextWrite, std::memory_order_release);   
    return true;
}

T pop() noexcept
{
    const int currentRead = readPos.load(std::memory_order_relaxed);

    if(currentRead == writePos.load(std::memory_order_acquire))
        return nullptr; // queue is empty

    T item = buffer[currentRead];
    readPos.store((currentRead + 1) % Size, std::memory_order_release);
    return item;
}
{% endhighlight %}

* **std::memory_order_release** : toutes les écritures précédentes sont visibles avant la publication de l'index.
* **std::memory_order_acquire** : le thread lecteur observe ces écritures après lecture de l'index.

{% highlight cpp %}

    AudioPayload* payload = currentPayload.load(std::memory_order_relaxed);
    bool fileSwappedThisBlock = false;

    // 1. new payload verification
    while(AudioPayload* next = incomingBuffer.pop())
    {
        if(payload)
            garbageCollector.push(payload);

        payload = next;
    }

    // 2. set the new payload as the current
    currentPayload.store(payload, std::memory_order_release);

    if(payload == nullptr)
        return;

{% endhighlight %}

Note : on instancie des pointeurs de `AudioPayload` avec ce template.

Cela permet :

* Les allocations sont faites sur le thread UI et utilisée sur le thread Audio
* Pas besoin de mutex pour récupérer le payload courant (accès en temps constant)
* Communication unidirectionnelle : le RingBuffer ne recupère jamais le payload
* Aucune interruption du traitement en cours

---
## 3.2 DESTRUCTION DIFEREE

Lorsqu'un `AudioPayload` devient obsolète, le thread audio ne peut pas libérer de mémoire (`delete`).

Il est poussé dans une **file de destruction** (Garbage Queue) un second `RingBuffer` de la même taille qui devra être appelé par l'UI.

Dans le `PluginCore::processBlock()` : 
{% highlight cpp %}
    // 1. new payload verification
    while(AudioPayload* next = incomingBuffer.pop())
    {
        if(payload)
            garbageCollector.push(payload);

        payload = next;
    }
{% endhighlight %}

Pour vider la file de destruction contennant des pointers de AudioPayload, on créer un `StateSynchronizer` derivant un `Timer` (~10Hz).

Cependant, si des grains sont actifs dans le `Pool` et lisent un ancien payload alors on risque des clics du à la phase qui se modifie brutalement mais également de lire au dela des limites accordées par le nouveau `Buffer`. Il est donc impératifs de s'assurer que les grains en cours ne pointent plus vers l'ancien buffer avant de le supprimer.

{% highlight cpp %}
    // 1. emptying the garabage collector
    while(AudioPayload* oldPayload = releaseQueue.pop())
        pendingDeletions.push_back(oldPayload);

    // 2. verifying no grains are currently reading the payload before deleting it
    pendingDeletions.erase(std::remove_if(pendingDeletions.begin(), pendingDeletions.end(),
            [](AudioPayload* p) {
                if(p->activeReaders.load(std::memory_order_acquire) == 0)
                {
                    delete p;
                    return true;
                }
            return false; // some grains are still actives. The deletion is delayed to the next tick.
            }),
        pendingDeletions.end());

    // 3. state syncing
    AudioPayload* playingNow = currentPayload.load(std::memory_order_acquire);
    if(playingNow != nullptr && playingNow != lastSeenPayload)
    {
        audioState.setNumSamples(playingNow->numSamples);
        audioState.setNumChannels(playingNow->numChannels);
        uiState.setSource(playingNow->file); // retrigger the new audio thumbnail repaint
        lastSeenPayload = playingNow;
    }
{% endhighlight %}

On décremente progressivement l'entier activeReaders à la fin de vie de chaque grain. Seulement quand on atteint 0 on permet au `StateSynchronizer` de supprimer l'ancien payload.

Dans `GrainProcessor::process()` :
{% highlight cpp %}
    g->nextReadPosition();
    if(g->isExhausted() || voiceManager.isVoiceDead(g->getVoiceID()))
    {
        if(p != nullptr)
        {
            g->payload->activeReaders.fetch_sub(1, std::memory_order_acq_rel);
            g->payload = nullptr;
        }
        pool.release(h);
        removeVoice(i);
    }
{% endhighlight %}

---
## 3.3 BUFFER PING-PONG

Pour afficher les grains actifs en lecture sur la forme d'onde du fichier chargé on a besoin de collecter la position des grains actifs et de remplir une struct appelée `GrainVisual` qui ne contient que des float xAxis et yAxis. On communique donc depuis l'Audio (producteur) vers l'UI (consommateur). Les enjeux sont les mêmes que pour le RingBuffer sauf que l'on a pas besoin de Queue dans ce cas de figure ni de supprimer les données. On écrit simplement par dessus les données du côté UI.

Principe :
* seul le thread Audio peut écrire
* le thread UI ne peut que lire les données


{% highlight cpp %}
template <typename T>
class PingPongBuffer
{
    static_assert(
        std::is_trivially_copyable<T>(), "PingPongBuffer<T> : T must be trivially copyable. No vector or array");

public:
    PingPongBuffer() = default;

    // Audio Thread ; single producer
    T& beginWriteBuffer() noexcept { return buffers[writeIndex]; }

    // swapping index value to confirm the data has been publish
    void endWriteBuffer() noexcept
    {
        readIndex.store(writeIndex, std::memory_order_release);
        writeIndex = 1 - writeIndex;
    }

    // gui thread : single consummer
    const T& getReadBuffer() const noexcept { return buffers[readIndex.load(std::memory_order_acquire)]; }

    PingPongBuffer(const PingPongBuffer&) = delete; // no copy constructor
    PingPongBuffer& operator=(const PingPongBuffer&) = delete; // no assignation
private:
    T buffers[2];
    int writeIndex = 0; // strictly for the audio thread
    std::atomic<int> readIndex{0}; 
};
{% endhighlight %}

Note : on ne souhaite pas transfere la propriété donc instancie les valeurs par copie (`PingPongBuffer<VisualSnapshot>`) 
Note : pour ne pas à écrire dans le `VisualSnapshot` à la fin de chaque bloc d'échantillons, on synchronise le DSP audio avec un compteur qui estime en Hz le taux de rafraîchissement de la UI car le `PingPongBuffer` est appelé depuis la UI via le système de `Polling`.

Le thread audio est responsable d'écrire dans le `PingPonBuffer` et la classe `FromAudio` ici encapsule les méthodes d'écriture.

{% highlight cpp %}
VisualSnapshot& beginWriteVisualSnapshot() const noexcept { return visualBuffer.beginWriteBuffer(); }
void endWriteVisualSnapshot() const noexcept { visualBuffer.endWriteBuffer(); }
{% endhighlight %}

</div>