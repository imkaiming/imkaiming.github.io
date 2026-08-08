---
permalink: /project/violence/integration/
title: "Violence - Audio Piloté par les Données"
layout: single
author_profile: false
---
{% include violence-nav.html %}

<div class="lang-fr" markdown="1">

# Audio Piloté par les Données

L'ensemble du système audio repose sur une architecture **data-driven** : la logique métier est dissociée des assets sonores via des **Data Assets** et des **Data Tables**, permettant des itérations rapides et une maintenance à long terme.

## Bruits de pas (Foley)

L'objectif est de créer un système de bruits de pas modulaire, entièrement découplé des assets d'animation, pour servir nativement le joueur comme les IA sans duplication de code. 

1. L'animation du mouvement du personnage déclenche l'AnimNotify générique `BP_AnimNotify_FoleyEvent`.

<img class="zoomable" src='/images/violence/animation_notify_events.png' width='100%'>

<img class="zoomable" src='/images/violence/BP_notify_foley.png' width='100%'>

2. Le Notify appelle sa fonction `GetAudioBank` pour récupérer la banque audio contextuelle de l'acteur (`DABP_FoleyAudioBank`).

<img class="zoomable" src='/images/violence/foley_data_soundbank.png' width='100%'>

3. Elle invoque `GetSoundFromFoleyEvent` avec un **GameplayTag** spécifique (ex: `Foley.Footstep.Run`) pour obtenir le son exact.
Le MetaSound récupéré est exécuté instantanément. Il pioche des échantillons de manière aléatoire et applique des micro-variations de pitch et d'amplitude à chaque appel pour éviter les répétitions sonores.

<img class="zoomable" src='/images/violence/metasound_foley.png' width='100%'>

## Détection de surface

Le système repose actuelle sur un simple bruit de pas générique sans détection de matière.

Pour implémenter la détection de matière, l'`AnimNotify` devrait exécuter un `LineTrace` vertical afin d'extraire le `SurfaceType` du **Physical Material** au sol. 
Pour éviter de superposer inutilement un bruit générique avec un bruit de texture, ce qui serait du gachis de ressource, la fonction de résolution audio croiserait alors le **GameplayTag** d'animation et la surface détectée pour instancier directement le graphe `MetaSound` spécifique à la texture via des Data Assets dédiés par matière (ex: `DABP_Foley_Run_Concrete`).

---

## Armes

La gestion audio des armes repose en premier lieu sur l'arme actuellement équippé par le joueur. Chaque arme possède son propre **Data Asset** (`BP_GunData`) dans lequel est réuni tous les sons relatif à l'armes. Cette approche *polymorphique* permet aux Blueprints d'interroger dynamiquement les assets sonores sans duplication de logique. 

<img class="zoomable" src='/images/violence/gun_data.png' width='100%'>

### Coup de feu
La logique de tir est identique pour les joueurs et les PNJ, et produit un son localisé dans l'espace (`Spawn Sound At Location`). 

1. Les inputs sont gérés vie le `BP_PlayerCharacter`
2. On interroge l'état de l'arme dans le `BP_EquipedGunComponent` (ex. : le tir ne se déclenche pas si le chargeur est vide). 
3. Le personnage se réfère alors la **Gameplay Ability** `GA_Shooting` qui était active lorsque l'arme a été équippé. 
4. Dans ce Blueprint, on lit l'identifiant audio stocké dans le Data Asset, puis on exécute un nœud `Spawn Sound Attached` sur le socket à l'extrémité du canon. Le moteur audio prend le relais, appliquant automatiquement l'atténuation et la spatialisation temps réel

Les sons de coups de feu des armes sont composés de plusieurs `Metasound Random Player` piochant dans 8 sons pour l'attaque, la mecanique, un sweetener et la tail du tir. Un dernier graphe metasound maître s'occupe avec un trigger delay de jouer d'abord le player du tir et ensuite le player de la tail, l'un après l'autre. Cela permet d'avoir plusieurs variations qui se déclenchent de manière aléatoire sans se chevaucher.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
 <iframe src="https://res.cloudinary.com/dfq1crbth/video/upload/e_volume:1000/demonstration-metasound-shotgun_lcrv20.mp4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allow="fullscreen;" allowfullscreen></iframe>
</div>

On prend soin de bien couper le son avec un trigger accumulate qui attend que les graphe metasounds enfants finissent pour couper le parent.

### Rechargement

Dans `BP_EquipedGunComponent`, la fonction `RechargeEquippedGun` met à jour le nombre de munitions disponible. Dans ce cas de figure, l'audio est appelé dans l'animation de rechargement pour des raisons de synchronisation. Des `Anim Notify` (`Play Sound at Location`) sont insérés directement dans la timeline de l'animation de rechargement. Cela permet de synchroniser précisément chaque bruit mécanique (éjection, insertion du chargeur, armement) sur la bonne frame du mouvement, garantissant un feedback parfait même en cas d'interruption de l'animation.

### Attaque de mêlée

Les attaques au corps à corps exploitent les données configurées directement dans le **Data Asset**, qui stocke un tableau d'animations (`CharMeleeAttack`) et une valeur de dégâts. L'audio se divise en deux étapes : 

- **Le whoosh :** décrivant le mouvement de l'attaque dans le vide déclenché via une `Anim Notify` dans l'animation de l'attaque
- **L'impact :** qui signifie au joueur si l'attaque à réussi ou non. On fait un tests de chevauchement de sphère (`SphereOverlapActors`) pour vérifier la présence d'ennemis dans la zone d'attaque. Le son n'est instancié si la détection de collision confirme qu'un ennemi a été touché avec un `PlaySoundAtLocation`.

<img class="zoomable" src='/images/violence/BP_MeleeAttack.png' width='100%'>

### Sifflement de balle (Fly-by)

Lorsqu'on déclenche un tir, on spawn une balle (acteur physique) à la position de l'arme. Le sifflement s'active dès que la sphère de collision (`AudibleSphere`) entre en contact avec le joueur. Si un impact direct est détecté, le sifflement est avorté pour prioriser le son d'impact. Sinon, on invoque un `Play Sound at Location` basé sur la position de la balle.

<img class="zoomable" src='/images/violence/BP_Bullet_FlyBy.png' width='100%'>

L'objectif étant de désorienter le joueur, le réalisme spatial strict est sacrifié au profit d'un design sonore psychoacoustique.

<img class="zoomable" src='/images/violence/MS_FlyBy.png' width='100%'>

Dans ce graphe `MetaSound` :
- Un player aléatoire pioche dans un tableau de sons.
- La durée de chaque son est divisée par 2, puis inversée pour obtenir une fréquence de LFO dont le pic arrive à mi-son.
- Cette valeur pilote la panoramique gauche/droite.
- Un booléen inversé échange aléatoirement les canaux pour accentuer la désorientation spatiale.

### Impacts de Balle

Pour simuler l'impact sur l'environnement, la fonction `BulletImpact` extrait le `SurfaceType` depuis le *Physical Material* obtenu via le *Hit Result* de la collision. Cette valeur sert de clé d'interrogation pour la Data Table `DT_BulletRetroAction`.

<img class="zoomable" src='/images/violence/DT_BulletRetroaction.png' width='100%'>

La table renvoie un Data Asset de configuration, qui encapsule le graphe **MetaSound** d'impact dédié à la nature physique de la surface touchée (métal, béton, bois, etc.). Le Blueprint de la balle extrait cette donnée audio pour l'instancier instantanément via un nœud `Play Sound at Location`.

<img class="zoomable" src='/images/violence/BP_Bullet_BulletImpact.png' width='100%'>

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
 <iframe src="https://res.cloudinary.com/dfq1crbth/video/upload/e_volume:1000/demonstration_bullet_impact_ahlbaw.mp4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allow="fullscreen;" allowfullscreen></iframe>
</div>

Cette approche **data-driven** découple entièrement la logique balistique intrinsèque de `BP_Bullet` de la gestion des ressources sonores. Cela permet d'ajouter ou de modifier des comportements de surface directement dans la table de données, sans jamais avoir à altérer le code du projectile.

---

## Feedback & Événements Contextuels

### Portail de choix des mondes

Le portail émet une nappe sonore en boucle (loop) représentant son aura magique. Le composant audio est attaché à l'acteur parent (`AttachToComponent`) et partage son cycle de vie, garantissant sa destruction automatique et l'absence de fuite mémoire à la fermeture du portail.

<img class="zoomable" src='/images/violence/BP_PortalVA.png' width='100%'>

### Générateur d'ennemis

Dans le Blueprint `BP_Spawner_Enemy_Base`, l'événement personnalisé `PlaySpawnSound` est invoqué au tout début de la fonction de spawn afin de fournir un feedback immédiat au joueur, avant même l'instanciation physique de l'ennemi.

Le son du générateur se construit avec une séquence de trois couches distinctes :

1. **Début du spawn :** Un `Play Sound at Location` déclenche le MetaSound `MS_Ennemy_SpawnV2` à l'emplacement du spawner.
2. **Processus de création :** Le composant audio continu `SpawnSound` est activé et modulé en temps réel par une **Timeline**. Ses courbes de *Pitch* et de *Volume* dessinent une montée en puissance pendant 1,35 seconde, avant d'être coupées net via un nœud `Stop`.
3. **Fin de création :** En parallèle, un nœud `Delay` de 1,35 seconde synchronise l'impact final. Un second `Play Sound at Location` exécute `SFX_Vefects_Vignettes_Water_End` pour marquer l'apparition physique et définitive de l'ennemi.

<img class="zoomable" src='/images/violence/spawner-ennemie.png' width='100%'>

### Pick Up Ammo

Lorsque le joueur n'est pas au maximum de munitions et qu'il entre en collision avec une caisse, celle-ci est consommée et déclenche un son *non-diégétique* (UI/Feedback) indiquant la récupération.

<img class="zoomable" src='/images/violence/bp_ammo_pickup.png' width='100%'>

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
 <iframe src="https://res.cloudinary.com/dfq1crbth/video/upload/e_volume:1000/demonstration-ammo-pickup_y0azr6.mp4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allow="fullscreen;" allowfullscreen></iframe>
</div>

### Menu UI

#### Widget Boutton Personnalisé

Dans le blueprint `WB_CustomButton`, on a simplement les évènements `OnMouseHovered` et `OnClicked` sur lesquels on se branche pour faire un `Play Sound 2D`. Ce sont des évenements natifs qui détecte l'interaction avec la souris.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
 <iframe src="https://res.cloudinary.com/dfq1crbth/video/upload/e_volume:1000/demonstration-menu-ui_rm6yk2.mp4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allow="fullscreen;" allowfullscreen></iframe>
</div>


---

## Gestion Centralisée de la Narration

### Voice Manager

Le composant `BP_VoiceManager` est un Actor Component qui centralise la lecture, la priorisation et la spatialisation des dialogues. L'architecture est data-driven, elle s'appuie sur des structures de données (`SVoiceLineData`) résolues dynamiquement par le Blueprint.

<img class="zoomable" src='/images/violence/PlayVoiceLine.png' width='100%'>

#### Vecteurs d'entrée

Le système accepte deux modes de déclenchement :
* **Appel direct** : via la fonction `PlayVoiceLine`.
* **Écoute passive** : via une Action Asynchrone (`ListenForGameplayMessages`) surveillant le canal `Audio.VoiceLines`.

<img class="zoomable" src='/images/violence/VoiceLineListener.png' width='100%'>

#### Règle de priorité

Avant toute lecture, le nœud `AudioComponent.IsPlaying()` vérifie l'état du canal. L'interruption n'est autorisée que si la priorité de la nouvelle ligne (`SVoiceLineData.Priority`) est strictement supérieure à la variable d'état `ActiveSoundPriority`. Sinon, la requête est silencieusement annulée pour éviter les collisions audio.

#### Spatialisation conditionnelle

La génération du son utilise `SpawnSoundAttached` avec un routage logique :
* **Cas par défaut** : Le son s'attache au `SceneComponent` fourni en paramètre.
* **Cas narratif critique** : Si le nom de la ligne contient les mots-clés "Luci" ou "Anxiete", le système force un rattachement au `TransformComponent` du `PlayerCameraManager`. Cela garantit une intelligibilité maximale. Le but étant que ces lignes soient dans l'esprit du joueur.

---

## Déclencheur de Voix Contextuel

### BP_VoiceTriggerOnEvent

Cet `Actor` sert de pont entre les événements de gameplay (dégâts et mort) et le système audio centralisé. Il est conçu pour être attaché directement à une entité spécifique, comme component enfant, agissant comme un auditeur dédié et attentif.

#### Initialisation

Le BP possède une petite `BoxExtent` de taille 1x1x1. Cela permet lors de l'événement `BeginPlay`, d'exécuter un `BoxOverlapActors` filtré sur la classe `BP_Enemy_Base`. C'est de la sorte qu'on instancie le système d'écoute d'évènements des ennemies.

Cette astuce permet ainsi de lier les évenements `TriggerOnDamage` et `TriggerOnDeath` ce qui correspond au **Pattern Observateur**. Ce qui évite de se reposer sur `Event Tick` pour les vérifications d'état, ce qui serait très couteux en ressources.

#### Probabilité de jouer

On ne déclenche pas toutes les lignes de voix pour éviter rendu très mécanique et prévisible. Chaque évènements, on a une variabele `ChanceToTrigger` qui modifie la probabilité de la ligne de jouer réellement.

#### Spatialisation

Le message est ensuite diffusé de manière totalement découplée via le `GameplayMessageSubsystem` sur le canal `Audio.VoiceLines`, laissant le `BP_VoiceManager` gérer la spatialisation audio 3D précise au point d'impact.

---

## Mécanique d'essouflement limitant le temps de course du personnage

### Architecture et Déclenchement

L'Ability System gère le Gameplay Effect `GE_OutOfBreath`, ce dernier déclenche l'évènement `OutOfBreath`. 

Plutôt que de vérifier la stamina dans un `Event Tick`, le système écoute le delegate `OnStaminaRunOut` ou réagit à l'override de fonction `OutOfBreath`. Cette approche événementielle garantit un coût CPU nul en attente et un déclenchement instantané.

#### 2. Gestion Robuste du Composant Audio

Le son de respiration est géré via un `AudioComponent` dédié. Avant toute tentative de lecture, le Blueprint exécute une vérification `IsPlaying()`. Pour empêcher le re-démarrage brutal du son causant des coupures et préservant ainsi la continuité de la boucle de respiration et l'immersion.

#### 3. Couplage Audio-Visuel

Le système sélectionne l'asset adapté avec la variable `IntensityBreathing`, garantissant une synchronisation parfaite entre la fatigue auditive et la perturbation de la caméra. Ces variables vont ainsi piloter le graphe metasound relatif aux sons de respirations.

<img class="zoomable" src='/images/violence/MS_Breath.png' width='100%'>

Dans le metasound on déclare deux variables constante `SlowThreshold` et `FastTreshold` étant des float entre 0.f et 1.f. Et on compare la variable `IntensityBreathing` par rapport aux constantes pour choisir dans quel tableau de son jouer les respirations.

De plus on map la variable `IntensityBreathing` à la sortie du graphe pour créer une augmentation de volume. Plus l'intensité augmente plus les respirations sont fortes.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
 <iframe src="https://res.cloudinary.com/dfq1crbth/video/upload/e_volume:1000/demonstration_outofbreath_ae9cnk.mp4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" allow="fullscreen;" allowfullscreen></iframe>
</div>


</div>