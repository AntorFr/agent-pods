---
name: voyage-json
description: >
  Le CONTRAT DE DONNÉES de l'app Voyages — le format de `assets/voyage.json`, que la
  PWA rend en timeline par jour et en tray de suggestions (glisser-déposer). À
  consulter dès que tu crées ou modifies un voyage : types d'item fermés, statuts,
  invariant de calage, traçabilité. Livré par l'image avec le module qui le lit. Le
  métier — comment cadrer un voyage, quoi proposer — reste dans ton workspace.
---

# `voyage.json` — le contrat de données

Un dossier par voyage ; `assets/voyage.json` est la **source unique**. La PWA le rend
en timeline (un flux par jour) et en tray de suggestions déplaçables. Ce fichier est
livré par l'image avec le module qui le lit : ils ne peuvent pas diverger.

```json
{
  "version": 1,
  "titre": "Corse — été 2026",
  "debut": "2026-08-08",
  "fin": "2026-08-22",
  "modes": ["marche", "voiture"],
  "lieux": [
    { "id": "calvi", "nom": "Calvi", "lat": 42.567, "lng": 8.757,
      "arrivee": "2026-08-08", "depart": "2026-08-15" }
  ],
  "items": [
    { "id": "hotel-calvi", "type": "hebergement", "statut": "confirme",
      "titre": "Hôtel U Carabellu", "debut": "2026-08-08", "fin": "2026-08-15",
      "lieu": "calvi", "gmail": "thread:189ab42…", "notes": "petit-déj inclus" },
    { "id": "ferry-aller", "type": "trajet", "statut": "confirme",
      "titre": "Ferry Toulon → L'Île-Rousse", "jour": "2026-08-08", "heure": "08:00",
      "duree": "5 h 45", "ico": "⛴",
      "docs": [{ "fichier": "assets/embarquement.pdf", "titre": "Cartes d'embarquement" }] },
    { "id": "resto-anna", "type": "resto", "statut": "suggestion",
      "titre": "Chez Anna", "creneau": "soir", "lieu": "calvi",
      "place_id": "ChIJxx…", "prix": "~60 €", "web": "https://…",
      "desc": "Terrasse sous les remparts, cuisine corse simple — réserver dès 19 h." }
  ]
}
```

## Les règles qui mordent

- **Types d'item FERMÉS** : `hebergement | resto | activite | visite | trajet`.
- **Statuts** : `suggestion | confirme | ecartee`.
- **La nature se déduit des champs, pas du type.** `jour` (+ `heure` optionnelle) ⇒
  **ponctuel**, carte dans le flux du jour. `debut` + `fin` ⇒ **continu**, bandeau qui
  court sur la plage. Un stage de voile de trois jours est une `activite` continue.
- **Invariant de calage** : un item `confirme` porte **toujours** un calage (`jour` ou
  `debut`/`fin`) ; une `suggestion` n'en porte **jamais**. Confirmer, c'est changer le
  statut **et** poser le calage — jamais copier la carte, c'est la même de bout en bout.
  *Corollaire :* dans un voyage sans dates, tout item est `suggestion` ou `ecartee` — il
  n'y a pas de jour à poser, la confirmation est mécaniquement impossible.
- **`ordre` et `heure`** : `ordre` est le rang de la carte dans son jour, posé par la
  position de dépôt et **fractionnaire** (insérer entre deux voisins ne renumérote
  personne) — l'ordre des cartes EST le déroulé du jour. `heure` est une **annotation**
  optionnelle, jamais une grille. `creneau` (`matin`/`midi`/`soir`) survit comme simple
  conseil sur une suggestion, et sert de repli de tri. `duree` est du texte libre.
- **Traçabilité, zéro duplication** : `gmail` (fil source d'une résa — la vérité reste
  dans Gmail), `place_id` (la vérité du lieu reste chez maps). Un item `trajet` n'existe
  **que** porté par une résa ; un trajet routier estimé est une **liaison**, dérivée au
  rendu, jamais un item.
- **Rien de dérivable ne se stocke.** La météo et les temps de trajet se calculent à
  l'affichage. En revanche `desc` — deux ou trois phrases sur le pourquoi de la
  proposition — est un **jugement, donc durable, donc stocké**.
- **`ico`** : un emoji, qui remplace le glyphe du type partout où la carte se rend. Le
  `type` **classe** (couleur, facettes, décompte des nuits) mais ne doit pas dicter le
  dessin — son vocabulaire est fermé et grossier, si bien qu'un marché provençal tombe
  en `activite` et s'affiche en aviron. Optionnel ; échappé au rendu.
- **`docs`** : `[{ "fichier": "assets/…", "titre": "…" }]` — les pièces jointes des mails
  de résa, classées dans `assets/` du dossier voyage. Le fil Gmail reste la *source* ; le
  document est un fichier de la mémoire, sous la main le jour J.
- **`modes`** : moyens de déplacement du voyage, déclarés au cadrage (défaut
  `["marche", "voiture"]`). Ils bornent le choix de mode des liaisons.
- **`lieux`** : géocodés **une fois**, à la création. `items[].lieu` référence un
  `lieux[].id` — rattache la carte à une étape et sert à la météo.

## Les gestes de l'interface ne passent pas par toi

Déplacer une carte, la confirmer d'un glisser-déposer, l'écarter : le front écrit ces
gestes dans un `voyage-state.json` voisin, **jamais** dans `voyage.json`. C'est toi qui
consolides ensuite. Même frontière que les workbooks et la todo : **le front ne touche
jamais la mémoire.**
