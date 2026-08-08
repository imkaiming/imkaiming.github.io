---
permalink: /project/violence/mix/
title: "Violence - Mix"
layout: single
author_profile: false
---
{% include violence-nav.html %}


<div class="lang-fr" markdown="1">

# Systèmes Audio Spatialisés

L'espace acoustique est géré via une combinaison de **SoundClasses**, **Submixes**, **Audio Volumes** et **Courbes d'atténuation**.

## Ambiances 2D

Les ambiances stéréo sont configurées avec des formes d'atténuation personnalisées. L'objectif est de gérer les transitions de manière fluide et naturelle pour garantir un fondu enchaîné (crossfade) totalement imperceptible pour le joueur lors des changements de zones.

<img class="zoomable" src='/images/violence/map-amb2d-v1.png' width='100%'>

Démonstration d'une sphère d'atténuation appliquée sur un Ambient Sound 2D :

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
 <iframe src="https://res.cloudinary.com/dfq1crbth/video/upload/e_volume:1000/Recording_2026-06-08_204941_sp0yci.mp4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allow="fullscreen;" allowfullscreen></iframe>
</div>

## Création d'une ambiance 2D modulaire

Il est possible de réunir plusieurs graphe metasound dans un graphe orchestrateur qui invoque les sous graphes selon des règles predefinies.

<img class="zoomable" src='/images/violence/metasound-amb3d1.png' width='100%'>

<img class="zoomable" src='/images/violence/metasound-amb3d2.png' width='100%'>

Dans ce graphe maître, avec des variables exposées, on module la periode avant de retrigger les graphes enfants. Cela permet de rendre l'ambiance plus dense en sons avec des répétitions plus rapides, ou à l'inverse plus éparse avec des appels plus éloignés.


<img class="zoomable" src='/images/violence/metasound_urban_ambiance.png' width='100%'>

## Ambiances 3D

Les ambiances 3D sont des sources mono spatialisées dans le but de sonoriser les éléments concrets du décor (ex: ventilateurs, lumières). Chacun possédant sa propre courbe d'atténuation.  
Afin d'éviter l'encombrement du mix, on peut limiter les concurrences des sons.  
Selon l'état du gameplay, on peut également faire en sorte qu'aucun son d'une soundclass en particulier ne soit joué (ex: en phase de combat, on ne joue pas les sons d'ambiance).

<img class="zoomable" src='/images/violence/map-amb3d-v1.png' width='100%'>


## Audio Volumes

Utilisation des **Audio Volumes** pour gérer l'isolation acoustique entre l'intérieur et l'extérieur (Occlusion/Obstruction). Cet outil permet également de router instantanément les sons internes vers l'effet de réverbération du bâtiment et d'appliquer un filtre passe-bas dynamique sur les ambiances extérieures.

<img class="zoomable" src='/images/violence/audio-volumes.png' width='100%'>

Démonstration — Audio Volumes & Réverbération :  
Les audio volumes servent à filtrer les ambiances extérieures lorsqu'on rentre dans un bâtiment et à router les sons qui spawn dans le volume pour leur attribuer la réverbération du bâtiment.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
 <iframe src="https://res.cloudinary.com/dfq1crbth/video/upload/e_volume:1000/demonstration-audio-volumes-reverb_nzvnnw.mp4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allow="fullscreen;" allowfullscreen></iframe>
</div>

Dans cette démonstration :  
- **En dehors du volume** : on entend le vent et les tirs n'ont pas de réverbération.  
- **Dans le volume** : le vent disparaît et les tirs sont réverbérés.

## Contrôle du volume dans le menu pause

On laisse la possibilité au joueur de changer le mix général du son. 

<img class="zoomable" src='/images/violence/menu-son.png' width='100%'>

On controle le volume des soundsclass via des sliders provenant d'un Widget.

<img class="zoomable" src='/images/violence/W_OptionMenu_Sliders.png' width='100%'>

Chaque clics de souris appelle la fonction `Save Options`, on utilise la sturcutre `SSoundSettings` qui est réutilisée dans le `BP_GameInstance`.

<img class="zoomable" src='/images/violence/W_OptionsMenu_SaveEvent.png' width='100%'>

Dans `BP_GameInstance`, un évenement `ApplySoundSettings` overwrite le volume dans les `SoundClass` respectives (`SC_Master`, `SC_Music`, `SC_SFX`, `SC_Ambiance`).

<img class="zoomable" src='/images/violence/BP_GameInstance_ApplySoundSettings.png' width='100%'>

Cette approche permet recalculer dynamiquement le mixage audio. Les paramètres sont sérialisés dans `BP_SaveGame`, pour garantir la persistance des préférences au chargement des niveaux.


</div>