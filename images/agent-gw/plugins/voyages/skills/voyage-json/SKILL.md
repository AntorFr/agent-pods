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
  "status": "prépa",
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
      "hint": "Terrasse sous les remparts",
      "desc": "Terrasse sous les remparts, cuisine corse simple — réserver dès 19 h." },
    { "id": "boucle-calvi", "type": "activite", "statut": "suggestion",
      "titre": "La citadelle à pied", "creneau": "matin", "lieu": "calvi",
      "hint": "3 km, une heure, tout en haut",
      "fiche": "assets/citadelle-calvi.parcours.json" }
  ]
}
```

## Les règles qui mordent

- **Types d'item FERMÉS** : `hebergement | resto | activite | visite | trajet`.
- **Statuts** : `suggestion | confirme | ecartee`.
- **`status` à la RACINE** — l'état du voyage, à ne pas confondre avec le `statut` d'un
  item : `idée | prépa | en-cours | clos`. Rendu **tel quel**, en pastille sur la liste
  des voyages et dans l'en-tête du voyage. **`idée` ⇔ ni `debut` ni `fin`** : sans dates,
  la page rend le **tray seul**, sans timeline, et le serveur **refuse** toute
  confirmation. ⚠️ Le module se cale sur les **dates**, jamais sur ce champ : c'est à toi
  de les tenir d'accord — un `en-cours` sans dates rend une page qui annonce « à l'état
  d'idée ». La teinte de la pastille connaît `idée`, `en-cours` et `clos` ; `prépa` prend
  la teinte par défaut, celle d'`en-cours`.
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
- **`hint`** : l'accroche **courte**, affichée sous le titre sur la carte du tray (et en
  sous-titre des cartes de suggestion d'un voyage sans dates). Distincte de `desc`, la
  fiche rédigée que rend la modale — à défaut de `desc`, la modale se rabat sur `hint`.
  Une ligne : **rien ne la tronque**, une accroche trop longue fait grandir la carte.
- **`fiche`** : le seul lien **INTERNE** d'une carte — chemin **relatif au dossier du
  voyage** vers la page qu'elle ouvre (`vannes-a-pied.md`,
  `assets/ile-aux-moines-nord.parcours.json`). La route se déduit de l'**extension** :
  `.parcours.json` → `#/parcours/…`, sinon `#/mem/…` ; la carte porte alors une pastille
  `🗺 parcours` ou `📄 fiche`, pour qu'on sache qu'elle mène quelque part sans l'ouvrir.
  Une **URL y est ignorée** (aucun bouton) : l'externe, c'est `web`, et il le dit
  (« ↗ Ouvrir la page », nouvel onglet). Sans ce champ, une balade préparée dans le
  dossier n'est atteignable par aucune carte de la timeline.
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
