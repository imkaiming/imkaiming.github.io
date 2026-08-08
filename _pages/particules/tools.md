---
permalink: /project/particules/tools/
title: "Particules - Tools"
layout: single
author_profile: false
---

{% include particules-nav.html %}

<div class="lang-en" markdown="1">

# PART 6: INFRASTRUCTURE & TOOLING

The project relies on a scalable, cross-platform infrastructure optimized for rapid iteration.

## Version Control: Git

**Branches:** `main`, `dev`, and feature branches. Work is never done directly on `main`. Feature branches are merged into `dev`, which acts as a stability layer before merging into `main`.

**Tags:** Semantic versioning (`major.minor.patch`). Tags mark stable checkpoints. The workflow is: push `dev` → CI/CD validates → merge into `main` → push → CI/CD validates → create tag with incremented version.

## Modular Target Strategy (CMake)

Build is segmented into decoupled static libraries (`Base`, `Core`, `Gui`) and a `SharedCode` interface, enabling independent compilation and minimal rebuild times.

## Fast UI Iteration

A standalone `GuiApp` executable allows rebuilding and testing the interface independently, bypassing the DAW wrapper compilation overhead.

## Automated CI/CD

GitHub Actions pipeline ensures cross-platform compilation (Windows, macOS, Linux) and automated test execution on every push.

</div>


<div class="lang-fr" markdown="1">

# PARTIE 6 : INFRASTRUCTURE & OUTILLAGE

Le projet repose sur une infrastructure évolutive et multiplateforme optimisée pour l'itération rapide.

## Contrôle de version : Git

**Branches :** `main`, `dev` et branches feature. Le travail ne se fait jamais directement sur `main`. Les branches feature sont mergées dans `dev`, qui sert de couche de stabilité avant le merge dans `main`.

**Tags :** Versionnage sémantique (`majeur.mineur.correctif`). Les tags marquent des points de stabilité. Le workflow : push `dev` → CI/CD valide → merge dans `main` → push → CI/CD valide → création du tag avec version incrémentée.

## Stratégie de cibles modulaire (CMake)

La compilation est segmentée en bibliothèques statiques découplées (`Base`, `Core`, `Gui`) et une interface `SharedCode`, permettant une compilation indépendante et un temps de rebuild minimal.

## Itération rapide de l'UI

Un exécutable standalone `GuiApp` permet de recompiler et tester l'interface indépendamment, contournant le surcoût de compilation du wrapper DAW.

## CI/CD automatisé

Le pipeline GitHub Actions garantit une compilation multiplateforme (Windows, macOS, Linux) et l'exécution automatisée des tests à chaque push.

</div>
