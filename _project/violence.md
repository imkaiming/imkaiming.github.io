---
title: "Violence"
excerpt: "A first-person shooter exploring two interpretations of violence in games — one classical, one rooted in cruelty and brutality.<br/><a href='/project/violence/'><img src='/images/violence/Presentation.png' width='100%'></a>"
permalink: /project/violence/
collection: project
---

{% include violence-nav.html %}

<div class="lang-en" markdown="1">

## VIOLENCE — THE GAME

**Violence** is a doctoral research-creation FPS exploring how camera movement, heartbeats, breathing, and sound design can generate embodied sensations of violence in the player.

The project presents two contrasting interpretations: a classical militaristic approach and an approach centered on cruelty, difficulty, and sensory brutality.

### My Contribution

The gameplay systems were developed by the programming team. My contribution focused on audio integration and audio-facing implementation in Unreal Engine 5.4, in collaboration with creative director **[Christopher Noël](https://www.linkedin.com/in/christopherno%C3%ABl/)** and the programmers.

- Data-driven audio integration for weapons, footsteps, impacts, and gameplay feedback
- Sound Class and Submix routing, dynamic sidechain, spatialization, and Audio Volumes
- MetaSound graphs for procedural and gameplay-driven sound
- Quartz-based musical synchronization
- Audio profiling with `stat audio` and `stat audiomixer`
- Compression, loading behavior, concurrency, and virtualization of audio assets
- Blueprint integration through Anim Notifies, Gameplay Abilities, and collision events

### Technical Note

The systems are tested and validated in dedicated test levels before integration into the full game levels. The portfolio demonstrations are captured in these focused environments because the complete levels exceed the capabilities of my laptop.

</div>

<div class="lang-fr" markdown="1">

## VIOLENCE — LE JEU

**Violence** est un FPS de recherche-création doctorale qui explore la manière dont les mouvements de caméra, les pulsations cardiaques, la respiration et la conception sonore peuvent générer des sensations incarnées de la violence chez le joueur.

Le projet présente deux interprétations contrastées : une approche classique inspirée du militarisme et une approche centrée sur la cruauté, la difficulté et la brutalité sensorielle.

### Ma contribution

Les systèmes de gameplay ont été développés par l'équipe de programmation. Ma contribution porte principalement sur l'intégration audio et les implémentations liées à l'audio dans Unreal Engine 5.4, en collaboration avec le directeur créatif **[Christopher Noël](https://www.linkedin.com/in/christopherno%C3%ABl/)** et les programmeurs.

- Intégration audio data-driven pour les armes, les bruits de pas, les impacts et les feedbacks gameplay
- Routing avec les Sound Classes et les Submixes, sidechain dynamique, spatialisation et Audio Volumes
- Graphes MetaSound pour le son procédural et conditionné par le gameplay
- Synchronisation musicale avec Quartz
- Profilage audio avec `stat audio` et `stat audiomixer`
- Compression, comportement au chargement, concurrence et virtualisation des assets audio
- Intégration Blueprint avec les Anim Notifies, les Gameplay Abilities et les événements de collision

### Note technique

Les systèmes sont testés et validés dans des niveaux de test dédiés avant leur intégration dans les niveaux complets. Les démonstrations du portfolio sont capturées dans ces environnements ciblés, car les niveaux complets dépassent les capacités de mon ordinateur portable.

</div>

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
  <iframe src="https://www.youtube.com/embed/8m3qtHeiq6Y" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>
