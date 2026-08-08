---
permalink: /project/violence/production/
title: "Violence - Production"
layout: single
author_profile: false
---
{% include violence-nav.html %}



<div class="lang-fr" markdown="1">

## Pipeline de Production

### Perforce

* Verrous (*checkout exclusif*) : Pour éviter les conflits et les corruptions, nous utilisions les verrous de Perforce pour garantir qu’un fichier ne soit modifié que par une seule personne à la fois. 
* Pas de streams ni de branches : Pour ce projet, nous étions une équipe de 6 personnes avec un workflow simple et peu de travail parallèle sur les mêmes fichiers. Un seul dépôt central suffisait : le système de checkout exclusif couvrait nos besoins. Ce choix nous a permis de garder un pipeline léger et efficace sans complexité inutile.

<img class="zoomable" src='/images/violence/perforce.png' width='100%'>

### Notion

Suivi de production agile pour piloter les tâches en cours, gérer les priorités par sprint, respecter les jalons (**milestones**) et documenter l’architecture des mécaniques sonores du projet.

#### Calendrier

<img class="zoomable" src='/images/violence/notion-calendar.png' width='100%'>

#### Tâches

<img class="zoomable" src='/images/violence/notion-tasks.png' width='100%'>

* Suivre les tâches en cours  
* Assigner des collaborateurs sur certaines tâches  
* Demander des validations
* Lister les bugs trouvés durant les playthrough
* Documentation du projet

</div>