---
permalink: /project/violence/performance/
title: "Violence - Performance"
layout: single
author_profile: false
---
{% include violence-nav.html %}


<div class="lang-en" markdown="1">

## Audio Profiling and Optimization

The audio performance capture was carried out in level `vA` of the game, during a combat scene involving about ten enemies.

---

## 1. Real-Time Budget

* **Buffer Size**: 1024 samples (Windows).
* **Sample Rate**: 48 kHz.
* **Audio CPU Budget**: `1024 / 48000 = 21.33 ms`. This is the absolute limit the audio thread must not exceed.

The audio render thread runs independently of the rendering pipeline. However, all DSP effect computation, voice decoding, and spatialization must strictly stay within the 21.33 ms per block limit. Exceeding this time causes an **Audio Underrun** (glitches and artefacts).

### Initial Situation (Before Optimization)

The game profiling was done using the `stat audio` and `stat audiomixer` commands. This data is essential for understanding real-time bottlenecks.

<img class="zoomable" src='/images/violence/stat-audio-avant.png' width='100%'>

* **`Audio Memory Used`**: 15.68 MB during the capture.

<img class="zoomable" src='/images/violence/stat-audiomixer-avant.png' width='100%'>

* **`Render Audio` (Max: 54.21 ms)**: The audio block computation time exceeds the 21.33 ms budget, representing a non-compliant real-time condition.
<!-- At 60 fps (16.6 ms per frame), a 54 ms underrun corresponds to roughly 3.25 frames, which is clearly perceptible to the player. -->

* **`Source Buffers` (Max: 28.16 ms)**: The cost of reading and mixing buffers for each voice is abnormally high.

* **`Submix Graph Effect Processing` (Max: 15.91 ms)**: This cost is far too high for a reverb and a dynamic sidechain.

**Diagnosis:**
At this point, I realize that audio assets are all set to `Inherited` for `Loading Behavior` and `Bink Audio` for `Compression`. I had no strategy for compression, memory management (I/O), or asynchronous source loading. Furthermore, reverbs were using `Reverb Effect` actors (which instantiate a DSP plugin per voice) instead of processing on the global bus.

**Objective:** Relieve CPU calculations by using RAM intelligently, take advantage of a genuine occurrence limiting (Concurrency) strategy, and optimize asynchronous loading.

---

## 2. Optimization Strategy

### A. Compression and Memory Management Rules (I/O)

Implementation of a strict strategy to arbitrate between CPU cost (decoding) and RAM footprint.

| SoundClass       | Loading Behavior | Compression | Justification |
|------------------|------------------|-------------|---------------|
| **Voice / Music** | Prime on Load    | Bink        | Long files. Streamed from disk to save RAM. |
| **Amb 2D / 3D**   | Prime on Load    | ADPCM       | Long ambiences but requiring fast start-up. |
| **Weapon / Foley / SFX** | Retain on Load   | ADPCM       | Short, critical SFX. Loaded in RAM for zero latency and zero I/O stall. |
| **UI**            | Force Inline     | PCM         | Micro-sounds (< 20 KB) baked into the `.uasset` to avoid disk fragmentation. |

The 2D and 3D ambience SoundClasses are also set to Always Play: False.

<!-- previous table commented out -->

### B. Standardization and Sample Rate Conversion (SRC)

Some music files were in **44.1kHz 16-bit**, while audio assets were in **48kHz 24-bit**. To prevent the engine from resampling in real-time on the Audio Thread, all assets were converted offline via `ffmpeg` to **48kHz 16-bit**.

Since the sound design was done using `Ableton Live 11`, all audio assets were exported in stereo by default. The 3D audio assets (foley, weapon, sfx, some dialogue) were therefore all converted to Mono to avoid unnecessary stereo computation.

Certain voices, such as those of Gods A and B representing the game's creator speaking directly to the player, were kept in stereo to take advantage of a stylistic width. These voices are not physically localized but originate in the mind of the character embodied by the player.

### C. DSP Architecture and Submixes

Migration from `Reverb Effect` to `Submix Effect Reverb` that apply at the `Audio Volume` level across the whole Submix. This avoids duplicating and computing a DSP plugin for each active voice, explaining the drastic drop in effect cost.

<!-- voice culling threshold comment -->

### D. Concurrency and Virtualization

* **Sound Concurrency Global**: Added occurrence limits to `metasound` graphs via Concurrency assets.

Example:
- Limitation of 2 maximum simultaneous global occurrences for the player's assault rifle gunshots, to ensure no audio overlap accumulates during the burst.
- Limitation of 4 max occurrences for enemy assault rifles. Since the sound is very short, when the player sprays, we only want the closest enemy shots. We also prioritize the nearest sounds. `Limit to Owner` is unchecked to apply the limitation globally across the level rather than per actor.

* **Virtualize when Silent**: For lifecycle management, all `Ambient Sounds` (2D and 3D ambiences) are virtualized. This allows the sound to be virtualized if the player quickly enters and exits `Sound Attenuation` boundaries, avoiding consumption of non-audible active voices.

* **Container Simplification**: Although `MetaSound` patches offer flexibility, to limit their overhead they have been simplified as much as possible to save `Source Init` time. For example, they were converted to Mono or nested graphs were avoided.

Conversion of `Reverb Effect` to `Submix Effect Reverb` for all `Audio Volumes` on the map.

<!-- commented staggering load section -->

---

## 3. Performance Report (After Optimization)

<img class="zoomable" src='/images/violence/stat-audio-apres.png' width='100%'>
<img class="zoomable" src='/images/violence/stat-audiomixer-apres.png' width='100%'>

### Metrics Comparison

| Metric | Before (Max/Avg) | After (Max/Avg) | Savings / Impact |
| --- | --- | --- | --- |
| **Decompressed Streamed (Avg)** | 0.89 ms | 0.64 ms | **-28.1 %** |
| **Decompressed Streamed (Max)** | 1.87 ms | 1.49 ms | **-20.3 %** |
| **Processing Sources (Avg)** | 0.13 ms | 0.12 ms | **-7.7 %** |
| **Processing Sources (Max)** | 0.42 ms | 0.36 ms | **-14.3 %** |
| **Gathering WaveInstances (Avg)** | 0.14 ms | 0.14 ms | 0 % |
| **Gathering WaveInstances (Max)** | 0.31 ms | 0.31 ms | 0 % |
| **Updating Sources (Avg)** | 0.10 ms | 0.09 ms | **-10.0 %** |
| **Updating Sources (Max)** | 0.26 ms | 0.20 ms | **-23.1 %** |
| **Source Init (Avg)** | 0.04 ms | 0.04 ms | 0 % |
| **Source Init (Max)** | 0.19 ms | 0.13 ms | **-31.6 %** |
| **AudioComponent Play (Avg)** | 0.01 ms | 0.01 ms | 0 % |
| **AudioComponent Play (Max)** | 0.09 ms | 0.09 ms | 0 % |
| **Audio Evaluate Concurrency (Avg)** | 0.01 ms | 0.02 ms | **+100 %** |
| **Audio Evaluate Concurrency (Max)** | 0.04 ms | 0.04 ms | 0 % |
| **Finished delegates time (Avg)** | 0.03 ms | 0.02 ms | **-33.3 %** |
| **Finished delegates time (Max)** | 0.36 ms | 0.36 ms | 0 % |
| **Finding Nearest Location (Avg)** | 0.00 ms | 0.00 ms | 0 % |
| **Finding Nearest Location (Max)** | 0.01 ms | 0.01 ms | 0 % |
| **Render Audio (Avg)** | 17.64 ms | 8.26 ms | **-53.2 %** |
| **Render Audio (Max)** | 54.21 ms | 13.75 ms | **-74.6 %** |
| **Source Manager Update (Avg)** | 10.06 ms | 6.17 ms | **-38.7 %** |
| **Source Manager Update (Max)** | 33.19 ms | 10.61 ms | **-68.0 %** |
| **Source Buffers (Avg)** | 8.41 ms | 5.85 ms | **-30.4 %** |
| **Source Buffers (Max)** | 28.16 ms | 9.45 ms | **-66.5 %** |
| **Submix Graph (Avg)** | 7.11 ms | 1.93 ms | **-72.8 %** |
| **Submix Graph (Max)** | 19.64 ms | 3.74 ms | **-81.0 %** |
| **Submix Graph Child Processing (Avg)** | 6.81 ms | 1.83 ms | **-73.1 %** |
| **Submix Graph Child Processing (Max)** | 18.60 ms | 3.57 ms | **-80.8 %** |
| **Submix Graph Effect Processing (Avg)** | 6.06 ms | 1.63 ms | **-73.1 %** |
| **Submix Graph Effect Processing (Max)** | 15.91 ms | 3.23 ms | **-79.7 %** |
| **Submix Reverb (Avg)** | 3.15 ms | 1.03 ms | **-67.3 %** |
| **Submix Reverb (Max)** | 8.64 ms | 2.06 ms | **-76.2 %** |
| **Submix Dynamics (Avg)** | 2.50 ms | 0.51 ms | **-79.6 %** |
| **Submix Dynamics (Max)** | 5.91 ms | 1.02 ms | **-82.7 %** |
| **Source Effect Buffers (Avg)** | 0.52 ms | 0.14 ms | **-73.1 %** |
| **Source Effect Buffers (Max)** | 1.73 ms | 0.35 ms | **-79.8 %** |
| **Source Output Buffers (Avg)** | 0.30 ms | 0.10 ms | **-66.7 %** |
| **Source Output Buffers (Max)** | 1.05 ms | 0.40 ms | **-61.9 %** |
| **Submix Graph Source Mixing (Avg)** | 0.21 ms | 0.07 ms | **-66.7 %** |
| **Submix Graph Source Mixing (Max)** | 0.95 ms | 0.13 ms | **-86.3 %** |
| **Submix Buffer Listeners (Avg)** | 0.04 ms | 0.01 ms | **-75.0 %** |
| **Submix Buffer Listeners (Max)** | 0.10 ms | 0.02 ms | **-80.0 %** |
| **Submix Graph Endpoint (Avg)** | 0.01 ms | 0.00 ms | **-100 %** |
| **Submix Graph Endpoint (Max)** | 0.03 ms | 0.01 ms | **-66.7 %** |
| **Audio Memory Used** | 15.68 MB | 46.11 MB | **+194.2 %** |
| **Audio Buffer Time (w/ Channels)** | 10 183.38 | 9 716.43 | **-4.6 %** |
| **Audio Buffer Time** | 5 152.68 | 5 121.03 | **-0.6 %** |
| **Active Sounds (Avg)** | 12.46 | 5.87 | **-52.9 %** |
| **Audio Sources (Avg)** | 11.83 | 5.53 | **-53.2 %** |
| **Wave Instances (Avg)** | 11.83 | 5.45 | **-53.9 %** |
| **Virtualized Loops (Avg)** | 47.00 | 0.00 | **-100 %** |
| **Finished delegates called (Avg)** | 0.10 | 0.05 | **-50.0 %** |
| **Max Channels** | 32 | 32 | 0 % |
| **Max Stopping Sources** | 8 | 8 | 0 % |
| **Audible Wave Instances Dropped (Avg)** | 0.00 | 0.00 | 0 % |
| **Wave Instances Dropped (Avg)** | 0.00 | 0.00 | 0 % |

*Note: These figures must be put into perspective as they represent a capture from a specific situation in a given level. The important thing is the architectural trend.*

### Conclusion

* **End of Underruns**: The audio render time (`Render Audio`) is more than halved on average, and the max peak drops from 54 ms to under 14 ms, comfortably below the strict 21.33 ms budget.
* **DSP Optimization**: The entire submixing chain (Submix Graph, Reverb, Dynamics) shows gains of 65% to over 80%, considerably freeing up the audio thread thanks to the global Submix routing.
* **Polyphony Management**: The number of active sounds and wave instances has halved thanks to a better Concurrency strategy.
* **RAM vs. CPU Trade-off**: In return, audio memory usage has tripled (15.68 MB ➔ 46.11 MB). This is a classic and accepted trade-off in audio engineering: we sacrificed RAM (which was available) to save CPU time on the Audio Thread (which was the critical bottleneck). On a AAA project, this strategy would be combined with the Asset Manager to load/unload these 46 MB asynchronously according to the area of the level.

</div>


<div class="lang-fr" markdown="1">

## Profilage et Optimisation Audio

La capture de performance audio a été effectuée dans le niveau `vA` du jeu, pendant une scène de combat impliquant une dizaine d'ennemis.

---

## 1. Budget Temps Réel

* **Taille du Buffer** : 1024 échantillons (Windows).
* **Fréquence d'échantillonnage** : 48 kHz.
* **Budget CPU Audio** : `1024 / 48000 = 21.33 ms`. Il s'agit de la limite absolue à ne pas dépasser pour le thread audio.

Le thread de rendu audio fonctionne indépendamment du pipeline de rendu. Cependant, le calcul de tous les effets DSP, le décodage vocal et la spatialisation doivent impérativement restées dans la limite de 21,33 ms par bloc. Le dépassement de ce délai entraîne un **Audio Underrun**  (saccades et artefacts).

### État des lieux initial (Avant Optimisation)

Le profilage du jeu a été effectué via les commandes `stat audio` et `stat audiomixer`. Ces données sont essentielles pour comprendre les goulets d'étranglement en temps réel.

<img class="zoomable" src='/images/violence/stat-audio-avant.png' width='100%'>

* **`Audio Memory Used`** : 15,68 MB pendant la capture.

<img class="zoomable" src='/images/violence/stat-audiomixer-avant.png' width='100%'>

* **`Render Audio` (Max: 54.21 ms)** : Le temps de calcul du bloc audio dépasse le budget de 21,33 ms, ce qui constitue une condition temps réel non conforme.
<!-- À 60 fps (16.6 ms par frame), un underrun de 54 ms correspond à environ 3.25 frames, ce qui est clairement percevable pour le joueur. -->

* **`Source Buffers` (Max: 28.16 ms)** : Le coût de lecture et de mixage des buffers de chaque voix est anormalement élevé.

* **`Submix Graph Effect Processing` (Max: 15.91 ms)** : Ce coût est beaucoup trop important pour de une réverbération et un sidechain dynamique.

**Diagnostic :**
À ce stade, je réalise que les assets audio sont tous en `Inherited` pour le `Loading Behavior`, et en `Bink Audio` pour la `Compression`. Je n'avais aucune stratégie de compression, de gestion mémoire (I/O), ni de chargement asynchrone des sources. De plus, les réverbérations utilisaient des acteurs `Reverb Effect` (qui instancient un plugin DSP par voix) au lieu de traiter le bus global.

**Objectif :** Soulager les calculs CPU en utilisant la RAM de manière intelligente, tirer profit d'une vraie stratégie de limitation d'occurrences (Concurrency) et optimiser le chargement asynchrone.

---


## 2. Stratégie d'Optimisation

### A. Règles de compression et gestion mémoire (I/O)

Mise en place d'une stratégie stricte pour arbitrer entre coût CPU (décodage) et empreinte RAM.

| SoundClass | Loading Behavior | Compression | Justification |
|------------|------------------|-------------|---------------|
| **Voice / Music** | Prime on Load | Bink | Fichiers longs. Streamés depuis le disque pour sauver la RAM. |
| **Amb 2D / 3D** | Prime on Load | ADPCM | Ambiances longues mais nécessitant un démarrage rapide. |
| **Weapon / Foley / SFX** | Retain on Load | ADPCM | SFX courts et critiques. Chargés en RAM pour latence zéro et zéro stall I/O. |
| **UI** | Force Inline | PCM | Micro-sons (< 20 Ko) intégrés au `.uasset` pour éviter la fragmentation disque. |

On passe également la SoundClass des ambiences 2D et 3D en Always Play : False.

<!-- SoundClass | Loading Behavior | Compression |
-----------|------------------|-------------|
Voice      | Prime on Load    | Bink        |
Music      | Prime on Load    | Bink        |
Amb 2D     | Prime on Load    | ADPCM       |
Amb 3D     | Retain on Load   | ADPCM       |
SFX        | Retain on Load   | PCM         |
Foley      | Retain on Load   | PCM         |
Weapon     | Retain on Load   | PCM         |
UI         | Force Inline     | PCM         | -->


### B. Uniformisation et Sample Rate Conversion (SRC)

Certains fichiers musicaux étaient en **44.1kHz 16-bit**, tandis que les assets audio étaient en **48kHz 24-bit**. Pour éviter que le moteur ne rééchantillonne en temps réel sur l'Audio Thread, tous les assets ont été convertis offline via `ffmpeg` en **48kHz 16-bit**. 

La conception sonore ayant été faite en utilisant `Ableton Live 11`, tous les assets audio furent exportés en stéréo par defaut. Les assets audio 3D (foley, weapon, sfx, certains dialogue) ont donc tous été converti en Mono pour éviter le calcul stéréo inutiles.

Certaines voix, comme les voix des Dieux A et B représentant le créateur du jeux s'adressant directement aux joueurs sont réstées en stéréo profitant d'une largeur stylisé. Ces voix ne sont pas localisées physiquement mais prennent source dans l'esprit du personnage incarné par le joueur.

### C. Architecture DSP et Submixes

Migration des `Reverb Effect` vers des `Submix Effect Reverb` qui s'appliquent au niveau des `Audio Volumes` à l'échelle du Submix. Cela évite de dupliquer et calculer un plugin DSP pour chaque voix active, expliquant la chute drastique du coût des effets.

<!-- * voice culling threshold pour les sound attenuation ?? -->

### D. Concurrency et Virtualisation

* **Sound Concurrency Global** : Ajout de limite d'occurrences des graphe `metasound` via des assets de Concurrency. 

Exemple : 
- limitation de 2 occurences maximum simultannée globale pour les coups de feu de fusil d'assault du joueur. Afin de s'assurer qu'il n'y ait pas d'overlap audio s'accumulant pendant la rafale.
- limitation de 4 occurences max pour le fusil d'assault des ennemis. Le son étant très court, quand le joueur mitraille, on veut entre les tirs ennemis les plus proches seulement. On priorise également les sons les plus proches. On décoche `Limit to Owner` pour appliquer la limitation au niveau global du niveau et non par acteur.


* **Virtualize when Silent** : Pour la gestion du cycle de vie, on virtualise tous les `Ambient Sounds` (ambiances 2D et 3D). Cela permet de virtualiser le son si le joueur rentre et sort rapidement des limites des `Sound Attenuations`, évitant de consommer des voix actives non audibles.

* **Simplification des conteneurs** : Bien que les patches `MetaSound` apportent de la flexibilité, pour limiter leur overhead, ils ont été simplifiés au maximum pour économiser le temps de `Source Init`. Par exemple, ils ont été converti en Mono ou évité les graphes imbriqués.

Transformation du `Reverb Effect` en `Submix Effect Reverb` pour tous les `Audio Volumes` dans sur la map

<!-- ### E. Lissage du BeginPlay dans le temps (Staggering Load)

Un point non capturé dans les tableaux est le phénomène du tout début du chargement du niveau. Dès les premières frames, on observe un gros pic sur `AudioComponent Play` atteignant 200-300 ms. Il s'agit de tous les `BeginPlay` des acteurs de la map s'exécutant simultanément.

**Solution :** Création un Blueprint Manager `BP_AudioStaggerManager` récupèrant tous les `Ambient Sounds` (avec auto-play désactivé) et les active dans une boucle. Chaque itération envoie un appel à un custom event qui retarde l'appel avec une valeur aléatoire (entre 0.01s et 0.3s). Les `BeginPlay` sont ainsi étalés, soulageant le CPU.

Dans les Blueprints, le nœud Delay n'est pas bloquant (non-blocking). Il met la latence en veille (via un timer interne) et rend immédiatement la main au Game Thread. Cela signifie que ta boucle ForEachLoop va s'exécuter en 0.001 ms, créer 150 timers virtuels en mémoire, et se terminer instantanément sans freezer le jeu. C'est exactement ce qu'on cherche. -->
---

## 3. Rapport de Performance (Après Optimisation)

<img class="zoomable" src='/images/violence/stat-audio-apres.png' width='100%'>
<img class="zoomable" src='/images/violence/stat-audiomixer-apres.png' width='100%'>

### Comparaison des Métriques

| Métrique | Avant (Max/Avg) | Après (Max/Avg) | Économies / Impact |
| --- | --- | --- | --- |
| **Decompressed Streamed (Avg)** | 0.89 ms | 0.64 ms | **-28.1 %** |
| **Decompressed Streamed (Max)** | 1.87 ms | 1.49 ms | **-20.3 %** |
| **Processing Sources (Avg)** | 0.13 ms | 0.12 ms | **-7.7 %** |
| **Processing Sources (Max)** | 0.42 ms | 0.36 ms | **-14.3 %** |
| **Gathering WaveInstances (Avg)** | 0.14 ms | 0.14 ms | 0 % |
| **Gathering WaveInstances (Max)** | 0.31 ms | 0.31 ms | 0 % |
| **Updating Sources (Avg)** | 0.10 ms | 0.09 ms | **-10.0 %** |
| **Updating Sources (Max)** | 0.26 ms | 0.20 ms | **-23.1 %** |
| **Source Init (Avg)** | 0.04 ms | 0.04 ms | 0 % |
| **Source Init (Max)** | 0.19 ms | 0.13 ms | **-31.6 %** |
| **AudioComponent Play (Avg)** | 0.01 ms | 0.01 ms | 0 % |
| **AudioComponent Play (Max)** | 0.09 ms | 0.09 ms | 0 % |
| **Audio Evaluate Concurrency (Avg)** | 0.01 ms | 0.02 ms | **+100 %** |
| **Audio Evaluate Concurrency (Max)** | 0.04 ms | 0.04 ms | 0 % |
| **Finished delegates time (Avg)** | 0.03 ms | 0.02 ms | **-33.3 %** |
| **Finished delegates time (Max)** | 0.36 ms | 0.36 ms | 0 % |
| **Finding Nearest Location (Avg)** | 0.00 ms | 0.00 ms | 0 % |
| **Finding Nearest Location (Max)** | 0.01 ms | 0.01 ms | 0 % |
| **Render Audio (Avg)** | 17.64 ms | 8.26 ms | **-53.2 %** |
| **Render Audio (Max)** | 54.21 ms | 13.75 ms | **-74.6 %** |
| **Source Manager Update (Avg)** | 10.06 ms | 6.17 ms | **-38.7 %** |
| **Source Manager Update (Max)** | 33.19 ms | 10.61 ms | **-68.0 %** |
| **Source Buffers (Avg)** | 8.41 ms | 5.85 ms | **-30.4 %** |
| **Source Buffers (Max)** | 28.16 ms | 9.45 ms | **-66.5 %** |
| **Submix Graph (Avg)** | 7.11 ms | 1.93 ms | **-72.8 %** |
| **Submix Graph (Max)** | 19.64 ms | 3.74 ms | **-81.0 %** |
| **Submix Graph Child Processing (Avg)** | 6.81 ms | 1.83 ms | **-73.1 %** |
| **Submix Graph Child Processing (Max)** | 18.60 ms | 3.57 ms | **-80.8 %** |
| **Submix Graph Effect Processing (Avg)** | 6.06 ms | 1.63 ms | **-73.1 %** |
| **Submix Graph Effect Processing (Max)** | 15.91 ms | 3.23 ms | **-79.7 %** |
| **Submix Reverb (Avg)** | 3.15 ms | 1.03 ms | **-67.3 %** |
| **Submix Reverb (Max)** | 8.64 ms | 2.06 ms | **-76.2 %** |
| **Submix Dynamics (Avg)** | 2.50 ms | 0.51 ms | **-79.6 %** |
| **Submix Dynamics (Max)** | 5.91 ms | 1.02 ms | **-82.7 %** |
| **Source Effect Buffers (Avg)** | 0.52 ms | 0.14 ms | **-73.1 %** |
| **Source Effect Buffers (Max)** | 1.73 ms | 0.35 ms | **-79.8 %** |
| **Source Output Buffers (Avg)** | 0.30 ms | 0.10 ms | **-66.7 %** |
| **Source Output Buffers (Max)** | 1.05 ms | 0.40 ms | **-61.9 %** |
| **Submix Graph Source Mixing (Avg)** | 0.21 ms | 0.07 ms | **-66.7 %** |
| **Submix Graph Source Mixing (Max)** | 0.95 ms | 0.13 ms | **-86.3 %** |
| **Submix Buffer Listeners (Avg)** | 0.04 ms | 0.01 ms | **-75.0 %** |
| **Submix Buffer Listeners (Max)** | 0.10 ms | 0.02 ms | **-80.0 %** |
| **Submix Graph Endpoint (Avg)** | 0.01 ms | 0.00 ms | **-100 %** |
| **Submix Graph Endpoint (Max)** | 0.03 ms | 0.01 ms | **-66.7 %** |
| **Audio Memory Used** | 15.68 MB | 46.11 MB | **+194.2 %** |
| **Audio Buffer Time (w/ Channels)** | 10 183.38 | 9 716.43 | **-4.6 %** |
| **Audio Buffer Time** | 5 152.68 | 5 121.03 | **-0.6 %** |
| **Active Sounds (Avg)** | 12.46 | 5.87 | **-52.9 %** |
| **Audio Sources (Avg)** | 11.83 | 5.53 | **-53.2 %** |
| **Wave Instances (Avg)** | 11.83 | 5.45 | **-53.9 %** |
| **Virtualized Loops (Avg)** | 47.00 | 0.00 | **-100 %** |
| **Finished delegates called (Avg)** | 0.10 | 0.05 | **-50.0 %** |
| **Max Channels** | 32 | 32 | 0 % |
| **Max Stopping Sources** | 8 | 8 | 0 % |
| **Audible Wave Instances Dropped (Avg)** | 0.00 | 0.00 | 0 % |
| **Wave Instances Dropped (Avg)** | 0.00 | 0.00 | 0 % |

*Note : Il faut relativiser ces chiffres car il s'agit d'une capture d'une situation précise dans un niveau donné. Il faut surtout observer la tendance architecturale.*

### Conclusion

* **Fin des Underruns** : Le temps de rendu audio (`Render Audio`) est divisé par plus de deux en moyenne, et le pic max passe de 54 ms à moins de 14 ms, repassant largement sous le budget strict de 21.33 ms.
* **Optimisation DSP** : Toute la chaîne de sous-mixage (Submix Graph, Reverb, Dynamics) affiche des gains de 65 % à plus de 80 %, libérant considérablement le thread audio grâce au routage par Submix global.
* **Gestion de la polyphonie** : Le nombre de sons actifs et de wave instances a diminué de moitié grâce à une meilleure stratégie de Concurrency.
* **Le Trade-off RAM vs CPU** : En contrepartie, la mémoire audio utilisée a triplé (15.68 MB ➔ 46.11 MB). C'est un trade-off classique et assumé en ingénierie audio : nous avons sacrifié de la RAM (qui était disponible) pour sauver le CPU de l'Audio Thread (qui était le goulot d'étranglement critique). Sur un projet AAA, cette stratégie serait combinée avec l'Asset Manager pour charger/décharger ces 46 MB de manière asynchrone selon la zone du niveau.


</div>
