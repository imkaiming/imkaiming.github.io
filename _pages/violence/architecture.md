---
permalink: /project/violence/architecture/
title: "Violence - Architecture"
layout: single
author_profile: false
---
{% include violence-nav.html %}

<div class="lang-fr" markdown="1">

## SoundClass

Pour mieux contrôler et regrouper les sons en flux logique, on met en place une hierarchie de `SoundClass`.
L'objectif est de catégoriser les sorties des assets audio de manière cohérente pour appliquer des effets dynamiquement, gérer le comportement de chargemet en mémoire, contrôler le volume/pitch de groupes de sons entiers.

<img class="zoomable" src='/images/violence/sound-classes.png' width='100%'>

## Sound Submix

On utilise les `Sound Submix` pour gérer des envois additionnels dans le but de faciliter certains traitement sans être contraint par les `SoundClass`. De manière analogue à des pistes auxiliares, les Submix permettent un plus grand contrôle des effets du jeu, comme les reverberations, mais également pour le système de sidechain pendant certaines phases de gameplay.

## Sidechain dynamique (ducking)

Pour garantir un mix intelligible lors des phases de combat intenses, le système s'appuie sur une architecture de sidechain dynamique au niveau des bus de mixage.

Dans Unreal Engine 5, le **Submix de la musique** reçoit un effet **Dynamics Processor**. Le **Submix des armes du joueur** est routé comme clé de sidechain (*Sidechain Input*). Chaque coup de feu déclenche ainsi une compression du volume musical. Le temps de *release* est fixé à 1 seconde dans cette démonstration.

Cette logique est également appliquée aux tirs ennemis : le Submix des armes du joueur agit comme clé de sidechain sur le Submix des armes des PNJ afin de maintenir les actions du joueur au premier plan du mix.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
 <iframe src="https://res.cloudinary.com/dfq1crbth/video/upload/e_volume:1000/Recording_2026-06-12_023352_ih30xa.mp4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allow="fullscreen;" allowfullscreen></iframe>
</div>


---

## Mode d'instanciation

Le choix entre ces deux nœuds d'instanciation est dicté par la gestion du cycle de vie requise :

- **Play Sound at Location** : Utilisé pour les sons courts et fixes (fire-and-forget). Il ne peut pas être manipulé (stop, fade, update de paramètres) une fois lancé.
- **Spawn Sound Attached** : Crée un `AudioComponent` persistant. Obligatoire pour les sons continus, pour injecter des paramètres dynamiques en temps réel, ou pour s'assurer que la source sonore 3D suive les déplacements de l'acteur. (Note : Spawn Sound at Location est utilisé pour les émetteurs persistants statiques, car il ne suit pas un acteur en mouvement).

## Architecture MetaSound

Les graphes MetaSound sont conçus pour être **thread-safe**, **légers**, et **réutilisables**, en exploitant pleinement les capacités temps réel d’UE5.4.

### Player aléatoire

L'objectif est de concevoir un conteneur aléatoire performant pour éviter la répétition mécanique des sons (indispensable pour les bruits de pas ou les impacts). Ce graphe MetaSound exécute une variation procédurale à chaque déclenchement, appliquant une modulation aléatoire de pitch et de volume directement au niveau du thread audio.

<img class="zoomable" src='/images/violence/metasound-randomizer.png' width='100%'>


---

## Quartz

Le Game Thread d'un jeu pouvant générer de la latence ou des chutes de framerate, la synchronisation stricte de pistes musicales n'est jamais garantie. Pour pallier cela, l'implémentation s'appuie sur le système **Quartz**. Il permet de planifier et d'aligner les événements audio directement sur le thread de rendu audio (Audio Render Thread), éliminant la gigue (jitter) pour que les boucles s'enchaînent précisément à la quantification de la mesure sélectionnée.

<img class="zoomable" src='/images/violence/start-quartz.png' width='100%'>

<img class="zoomable" src='/images/violence/quartz-queue-next-loop.png' width='100%'>

<img class="zoomable" src='/images/violence/quartz-retrigger-loop.png' width='100%'>

> Résultat : transitions musicales parfaitement synchronisées même sous charge CPU.

</div>
