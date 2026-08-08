---
permalink: /project/particules/profiling/
title: "Particules - Profiling"
layout: single
author_profile: false
---

{% include particules-nav.html %}

<div class="lang-en" markdown="1">

# PART 5 : PROFILING



</div>

<div class="lang-fr" markdown="1">

# PARTIE 5 : ANALYSE

La synthèse granulaire nécessite de générer des centaines de grains simultanément, elle est de nature très exigeante. Il faut donc mettre en place des protocoles de mesures rigoureux pour comprendre ce qu'il se passe exactement dans le code. 

Comme cee qui fonctionne sur une configuration peut ne potentiellement pas fonctionner sur une autre, on essaye de prouver les performances et la logique du code mathématiquement.

---

# 5.1 TESTS UNITAIRE COMPORTEMENTAUX

Les calculs audio doivent être déterministes. Alors que Tracy prouve que le code est *rapide*, Catch2 est utilisé ici pour prouver que le code est *correct*.

*   **Indépendance à la fréquence d'échantillonnage :** La logique DSP (comme l'accumulation de phase) se brise souvent lorsqu'on bascule entre 44,1 kHz, 48 kHz ou 96 kHz. Tester cela garantit que les algorithmes d'ordonnancement s'adaptent parfaitement à la fréquence de l'hôte sans dérive.
*   **Logique de phase & bouclage aux limites :** Lorsqu'un grain lit un fichier audio et atteint la fin d'une boucle, le pointeur de lecture doit revenir au début de manière transparente. Les erreurs de décalage d'un échantillon sont courantes et provoquent des clics audibles. Les tests Catch2 vérifient que le calcul de ces bouclages est précis à l'échantillon près.
*   **Cycles de vie des grains – épuisement :** Lorsqu'un grain se termine, il doit retourner proprement au pool d'objets. Si un grain est interrompu avant que son enveloppe d'amplitude n'atteigne le zéro absolu (0,0f), cela crée une discontinuité (clic). Tester cela garantit que la logique d'enveloppe est mathématiquement parfaite et que la mémoire est recyclée en toute sécurité.

---

# 5.2 BENCHMARKS


limitation : Un test Catch2 exécute une fonction précise (ex: calculer 500 grains) dans le vide, de manière synchrone. Il prouve la complexité algorithmique et l'exactitude mathématique. Cependant, il ignore totalement le système d'exploitation. Il n'y a pas d'interface graphique en cours de rendu, pas de DAW qui interrompt le thread, et pas de gestion mémoire concurrente.

---

# 5.3 TESTS DE CONFORMITÉ (DAW) 

Un plugin peut fonctionner parfaitement en mode autonome ou dans une DAW spécifique, mais planter complètement dans une autre. Les DAWs (Ableton, Logic, Reaper, FL Studio) gèrent les threads audio, les tailles de buffer et l'automatisation des paramètres différemment.

*   **`pluginval` :** C'est un outil open-source de Tracktion conçu spécifiquement pour faire échouer les plugins audio. Il soumet le plugin à des cas extrêmes : tailles de buffer de 0, blocs massifs d'automatisation de paramètres, basculement rapide lecture/stop, et interruptions aléatoires de threads.
*   **Sécurité mémoire & thread :** `pluginval` signalera agressivement si le plugin effectue des appels système interdits sur le thread audio (comme l'allocation mémoire / `new`, les verrous/mutex, ou les entrées/sorties fichier).
*   **Intégration dans le pipeline CI :** Exécuter ces tests en intégration continue (par ex. GitHub Actions) signifie que chaque commit est automatiquement soumis à `pluginval`. Si un développeur introduit accidentellement une condition de concurrence ou une fuite mémoire, le pipeline CI échoue la construction avant que le code puisse être fusionné.

---

## 5.4 ANALYSE CONTEXTUELLE

L'outil `Tracy` est utilisé pour analyser le comportement réel du plugin *Particules* en conditions d'exécution **temps réel**. Cela permet de confronter les résultats empiriques avec nos tests théoriques de manière complémentaire.

Contrairement aux approches synthétiques :

* Visual Studio en mode DEBUG introduit un overhead significatif qui invalide les mesures temporelles fines
* Catch2 exécute des tests isolés, sans contraintes temps réel ni interaction inter-threads (headless, synchrone)

Ainsi, `Catch2` valide la justesse mathématique et algorithmique, tandis que `Tracy` mesure les performances et le respect strict des contraintes de temps réel (deadlines audio).

L'objectif de cette section est de :
1. Valider le comportement du moteur dans son contexte d'exécution (cycle de vie, threads).
2. Isoler les biais introduits par le système d'exploitation et les drivers audio.
3. Identifier et quantifier techniquement l'origine des coûts CPU mesurés dans l'algorithme.


#### Protocole d'évaluation sous charge maximale (Worst-Case Execution Time)
Afin d'analyser le moteur sous une contrainte de calcul maximale, le protocole de test suivant est défini :
* Configuration matérielle : buffer de 512 échantillons (sauf si mention contraire) et fréquence d'échantillonnage de 48 kHz, l'attaque doit être a 0 et le release à 10.
* Émission et durée de vie des grains (duration) paramétrées au maximum.
* Déclenchement d'une note MIDI (C3) maintenue en continu. 
* Saturation du système pour atteindre et maintenir **500 grains actifs simultanément**.
* relacher la note et attendre que le release de l'ADSR se termine.
* arrêter la capture de Tracy et selectionner la bonne zone temporel pour les statistiques.

Ce scénario permet d'atteindre un **régime stationnaire**, condition requise pour évaluer le coût nominal maximum du moteur DSP.

#### charge DSP vs charge CPU 

**DSP Load**  
Le DSP load représente la proportion du temps alloué à un tampon audio qui est effectivement utilisée par le traitement numérique du signal. Il s’agit d’une mesure strictement liée au thread audio en temps réel. Lorsque la durée d’exécution du callback dépasse la durée du buffer, une interruption audio (xrun) se produit. Le DSP load évalue donc directement la capacité du système à maintenir un traitement audio sans artefacts.

**System CPU Load**  
Le system CPU load correspond à la charge globale du processeur, calculée par le système d’exploitation sur l’ensemble des cœurs et des processus. Cette mesure reflète l’activité générale de la machine, indépendamment du traitement audio. Elle permet d’estimer la probabilité que d’autres tâches du système interfèrent avec le thread audio, mais n’indique pas directement le risque de glitch.

* Le DSP load mesure la performance du traitement audio par buffer (indicateur direct de stabilité audio)
* le system CPU load mesure l’activité globale du processeur (indicateur contextuel de disponibilité des ressources)


#### Choix des métriques

Le CPU système :
* représente une moyenne temporelle
* potentiellement répartie sur plusieurs cœurs
* inclut l’OS, le DAW, les drivers et les autres threads

Cette valeur ne correspond donc pas directement :
* au coût réel du callback audio
* ni au DSP load temps réel

Par conséquent :
> une faible utilisation CPU globale ne garantit absolument pas la sécurité temps réel.


---

### 5.4.1 Cycle de vie et changement de buffer

#### Objectif
Comprendre comment le moteur réagit à un changement de configuration audio, et vérifier que :

* aucune mutation critique n’est effectuée dans le thread audio
* le cycle de vie JUCE est respecté

#### Procédure
Modification de la taille de buffer dans le DAW : `512 → 256 → 512 échantillons`.

<img class="zoomable" src="/images/tracy/tracy_bufferSize_changing.png" alt="Tracy" style="max-width: 100%; height: auto; border-radius: 4px;">

#### Observations

* interruption nette de la timeline du thread audio dans Tracy
* apparition d’une nouvelle timeline
* activité continue du thread UI
* appels à `releaseResources` puis `prepareToPlay`

#### Interprétation

On observe un **cycle de réinitialisation complet du moteur audio**.

Note :
* il n’est pas possible d’affirmer que le thread est détruit au niveau OS
* ce comportement dépend de l’hôte et du driver
> Ce qui est conforme a ce qui est stipulé par le framework JUCE.


### 5.4.2 L'importance du choix des APIs

**Objectif** : Identifier les biais introduits par les drivers audio (API Audio de Windows), afin d’analyser le DSP de la manière la plus limpide possible.

#### Cas 1 — DirectSound

Un buffer de 512 échantillons à 48 kHz offre un budget temporel d’environ 10.667 ms. Les benchmarks `Catch2` indiquent que le coût moyen du DSP reste largement inférieur à cette limite.

**Observations :**
* les appels `processBlock` apparaissent regroupés en agrégats
* irrégularité temporelle entre les callbacks audio
* aucun glitch perceptible

**Statistiques — `PluginCore::processBlock`**

* moyenne = 3.11 ms
* médiane = 2.58 ms
* mode = 6.12 ms

Percentiles :
* P75 = 6.03 ms
* P90 = 6.29 ms
* P99 = 7.16 ms
* P99.9 = 8.53 ms

On reste inférieurs au budget théorique de 10.667 ms.


<img class="zoomable" src="/images/tracy/tracy_worst_case_scenario_direct_sound.png" alt="Tracy" style="max-width: 100%; height: auto; border-radius: 4px;">

##### Interprétation

La capture Tracy révèle une forte irrégularité temporelle au niveau de l'ordonnancement. Certains callbacks sont appelé tardivement et plusieurs blocs sont être exécutés consécutivement probablement afin de rattraper le retard accumulé ou par anticipation.

les irrégularités proviennent principalement de l’API audio et du scheduling système.

##### Conclusion

le coût du DSP n’est probablement pas le facteur limitant dans cette configuration. DirectSound privilégie la compatibilité et le mixage système plutôt qu’un comportement faible latence strictement déterministe.

Cette API est donc peu adaptée à l’analyse rigoureuse des performances temps réel d’un moteur DSP.

#### Cas 2 — Windows Audio Exclusive Mode

##### Observation

Avec `DirectSound`, les irrégularités du scheduling rendaient difficile l’interprétation des timings observés.

En mode exclusif, les callbacks deviennent plus réguliers temporellement et le phénomène d'agrégat de callback disparaît largement. Le bruit systémique diminue fortement.

Cependant, les statistiques globales (`P75`, `P99`, `P99.9`) restent très proches de celles observées avec `DirectSound`.

Cela indique que les statistiques mesurées ne proviennent pas principalement du scheduler audio Windows, mais existaient déjà intrinsèquement dans le moteur DSP.

Le mode exclusif ne réduit donc pas significativement le coût du traitement lui-même (dans notre contexte) mais il permet surtout d’observer ce coût dans un environnement plus stable et plus déterministe.

<img class="zoomable" src="/images/tracy/tracy_worst_case_scenario_exclusive_mode.png" alt="Tracy" style="max-width: 100%; height: auto; border-radius: 4px;">

##### Analyse Statistiques — `PluginCore::processBlock`

* moyenne = 2.67 ms
* médiane = 1.62 ms
* mode = 5.48 ms

Percentiles :
* P75 = 5.57 ms
* P90 = 6.19 ms
* P99 = 7.17 ms
* P99.9 = 8 ms

**La moyenne basse mais trompeuse** : une moyenne de `2.67 ms` pourrait laisser penser que le moteur est très léger. Cependant, on constate que le mode est `5.48 ms` et le P75 est de `5.57 ms`. Cela indique qu’un grand nombre de callbacks se regroupent autour de ~5.5 ms.

> le comportement dominant du moteur sous charge n’est pas proche de la moyenne, mais plutôt proche du mode (~5–6 ms).

#### Interprétation

La moyenne pourrait être artificiellement abaissée par le commencement du protocol du pire scenario. Le synthétiseur granulaire met plusieurs secondes avant d'atteindre les 500 grains actifs. On a pas de moyen d'activer 500 grains instantannément à l'heure actuelle.

Dans Tracy, même après avoir filtré la zone de capture pour nettoyer les échantillons non pertinents, on distingue dans l'histogramme, deux concentrations de callbacks clairement séparés :
* un premier régime autour de ~10-100 µs
* un second régime dominant autour de ~5-6 ms

Cette séparation visible dans la timeline et dans l’histogramme confirme expérimentalement la présence de plusieurs régimes de charge DSP distincts au sein du moteur.

**hypothèse** :
* les callbacks courts pourraient correspondre aux phases où le nombre de grains actifs reste faible
* tandis que le regroupement principal autour de ~5–6 ms correspondrait au régime stationnaire proche de la saturation (~500 grains actifs)

### Conclusion

Le mode `Windows Audio Exclusive` améliore significativement la régularité des callbacks audio et réduit le bruit systémique observé avec `DirectSound`.

Cette configuration révèle plusieurs propriétés importantes du moteur :
* le DSP ne semble pas présenter de comportement chaotique ou instable
* les coûts élevés sont reproductibles et cohérents
* le coût nominal sous saturation réelle semble se situer autour de ~5–6 ms

Malgré une charge CPU système relativement faible :
* les percentiles élevés (~7–8 ms) montrent que le moteur approche déjà une part importante du budget temps réel disponible (`10.667 ms`)


### 5.4.3 Révélation du Goulot d'Étranglement (Windows Audio Low Latency Mode)


<img class="zoomable" src="/images/tracy/tracy_worst_case_scenario_low_latency.png" alt="Tracy" style="max-width: 100%; height: auto; border-radius: 4px;">


**Observations :**
* **Une amélioration radicale de la médiane :** La majorité des appels `processBlock` s'exécute désormais en **14 µs** (contre plus de 42 µs avec les mauvais drivers). Le centile P75 s'est effondré à **133 µs**. Le driver propre a éliminé le bruit systémique ; pendant 75% du temps, le moteur tourne de manière fonctionnelle.
* **Le vrai problème mis à nu :** Malgré un environnement sain, la "bosse" tout à droite de l'histogramme persiste. Les centiles P90 et P99 pointent toujours vers des exécutions très lentes (entre 6 et 8 millisecondes).
* a 512 echantillons et 48kHz notre budget de temps est respecté mais si l'utilisateur test le worst case scenario avec une taille de buffer inferieur l'audio glitchera.

**Diagnostic Final :**
Puisque le driver n'est plus en cause, ce pic de latence isole formellement un goulot d'étranglement dans le code source de `Particules` lors de l'itération des 500 grains. Ces données permettent d'en déduire que l'architecture de la boucle de rendu (calcul "échantillon par échantillon" causant du *Cache Thrashing*) provoque un effondrement des performances (cache misses) dès que le CPU doit itérer sur la totalité du pool mémoire simultanément.

Des axes d'amélioration des performances pourrait être :
* batch processer le calculs arithmétiques avec SIMD
* passer d'une boucle principal samples-based a block-based 
* trop de requete de pointeurs 

### 5.4.4 Profilage Temporel et Coût du DSP




Pour comprendre le comportement du moteur sous charge maximale (500 grains à 512 samples), nous avons poussé l'instrumentation `Tracy` à une granularité micro-temporelle. L'objectif est de mesurer le coût net des opérations DSP par rapport au temps global du callback audio.

L'analyse statistique de la fonction principale `processBlock` révèle les métriques suivantes :
*   **Moyenne :** 4.76 ms
*   **Médiane :** 6.47 ms
*   **Centile P75 :** 6.69 ms
*   **Centiles P90 / P99 :** ~7 à 8 ms

Parallèlement, la mesure de la fonction interne `GrainProcessor::process` (qui calcule un seul échantillon pour l'ensemble des grains actifs) indique un coût moyen d'environ **12 µs**.

**Diagnostic : La Stabilité Déterministe**
Contrairement à l'hypothèse initiale d'un "jitter" ou d'une instabilité liée au cache, ces données décrivent un comportement parfaitement linéaire et déterministe. 
Le calcul est implacable : `12 µs × 512 échantillons = ~6.14 ms`. 
En ajoutant le léger overhead du reste du framework, nous retombons exactement sur la médiane de **6.47 ms**. 

La distribution des temps d'exécution est bimodale :
1.  **Le Régime Lourd (La Médiane à 6.5 ms) :** C'est le comportement stationnaire du moteur lorsque les 500 grains sont pleinement instanciés et calculés.
2.  **Le Régime Léger (Tirant la moyenne vers le bas) :** Ce sont les phases transitoires (attaques, relâchements, silences) où le nombre de grains réels est inférieur au maximum théorique.

**Conclusion et Résolution Architecturale :**
Le moteur de *Particules* ne souffre d'aucune anomalie ou pic de charge inexpliqué. Ses performances sont prévisibles. Cependant, ce coût nominal de ~6.5 ms, bien qu'acceptable pour un buffer de 512 samples (deadline à 10.6 ms), devient bloquant pour des tailles de buffers adaptées au jeu en temps réel (ex: 128 samples, avec une deadline stricte de 2.6 ms).

Le moteur consomme ~45% du budget CPU en moyenne, avec des pics à ~68% dans le pire cas (P99), ce qui reste compatible avec un buffer de 512 samples mais incompatible avec des tailles plus faibles.

Le goulot d'étranglement structurel réside dans le paradigme du **Sample-by-Sample Processing**. Le coût cumulatif de l'itération et des appels de fonctions 256 000 fois par bloc (500 grains × 512 samples) est trop élevé. 

Pour rendre le moteur compatible avec des opérations ultra-basse latence (64 ou 128 samples), l'architecture de la boucle de rendu doit être transformée vers un modèle de **Block Processing**. Cette refactorisation (traiter des blocs entiers d'échantillons par grain plutôt qu'un échantillon par grain) permettra d'amortir le coût des boucles et d'exploiter la vectorisation (instructions SIMD) du processeur, réduisant ainsi drastiquement le coût nominal de l'algorithme.

---

## 5. BIG-0 NOTATION

</div>