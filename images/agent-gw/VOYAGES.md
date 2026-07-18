# Voyages — spec v1 (planificateur de vacances)

> Spec figée le 2026-07-18 (session de cadrage, décisions utilisateur incluses). Le cap vient
> de D25 côté cerveau : croiser les mails de résa (Gmail), l'agenda (Calendar) et `maps`
> (trajets + météo) — « celui-là sera une skill ». Ici : le contrat de données et l'app-module
> côté corps. Mockup à venir dans l'artifact « Alfred — App » avant toute ligne de code.

## Décisions structurantes

- **Domaine `voyages`** : la vue domaine est une collection de cartes, une par voyage.
- **Un voyage se compose entre un début et une fin** — un seul lieu de résidence ou plusieurs
  (périple), au choix. Mais il peut **naître sans dates** (statut `idée`, amendement
  2026-07-18) : on y **liste des suggestions**, rien de plus — **rien ne se confirme tant que
  début/fin ne sont pas posés**. Poser les dates fait apparaître la timeline et ouvre la
  confirmation.
- **App-module dès la v1** : le drag & drop suggestions → timeline est le cœur du besoin, c'est
  du *comportement*, donc du code (jamais du Markdoc passif).
- **Vue approximative assumée** : jour + créneau, pas de grille horaire. C'est les vacances,
  pas un Gantt — une heure ferme (ferry) s'affiche telle quelle, mais rien ne l'exige.
- **Mobile : la règle du shell ne bouge pas** (mobile = chat plein écran, pas de canvas).
  En voyage, Alfred fait la conciergerie **par message** en lisant le dossier (« le programme
  de demain ? »). Aucun rendu mobile de la timeline. *(Décision utilisateur, 2026-07-18.)*
- **Trajets : pas de cartes estimées** *(descopé 2026-07-18 — décision utilisateur)*. Le type
  `trajet` ne sert qu'aux **résas réelles** (ferry, vol, train — sourcées Gmail). Entre deux
  cartes, le temps de trajet est une **liaison dérivée** calculée au rendu (section
  « Liaisons ») — jamais une carte à maintenir, jamais une donnée stockée.
- **Météo par jour : régime dérivé, jamais stockée** (détail plus bas).
- **Suggestions écartées conservées** (statut `ecartee`, masquées) — anti re-proposition.

## Arborescence mémoire (raccord au contrat AUTHORING)

```
domaines/voyages/
└── corse-2026/
    ├── index.md            # type: voyage — la fiche consultable (prose, notes, liens)
    └── assets/voyage.json  # la donnée du module (plomberie : mentionnée, jamais liée)
```

- *(Amendé à l'implémentation, 2026-07-18.)* **`voyage.json` est la source unique** — titre,
  `status` (cycle **`idée → prépa → en-cours → clos`**, `idée` ⇔ pas de dates), `debut`/`fin`,
  lieux, items. **Pas de double vérité** : la fiche `.md` est *optionnelle* (prose libre,
  `type: voyage`, sans `status` ni dates). Le type `voyage` est ajouté au vocabulaire
  AUTHORING avec cette règle.
- La **vue domaine est le hub de l'app** (`#/dom/voyages` intercepté par le module, comme
  la tuile L'Atelier) : cartes dérivées de `/api/voyage/list` — dates, statut, compteurs.
- Le module est routé (`#/voyage/<chemin>`), patron des workbooks — pas de tag
  `{% outil %}` : c'est ainsi que les app-modules existants s'embarquent réellement.

## `voyage.json` — le contrat de données

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
      "duree": "5 h 45", "gmail": "thread:188ff…",
      "docs": [{ "fichier": "assets/embarquement-aller.pdf", "titre": "Cartes d'embarquement" }] },
    { "id": "resto-anna", "type": "resto", "statut": "suggestion",
      "titre": "Chez Anna", "creneau": "soir", "duree": "~2 h",
      "lieu": "calvi", "place_id": "ChIJxx…", "prix": "~60 €",
      "desc": "Terrasse sous les remparts, cuisine corse simple et juste — réserver dès 19 h.",
      "web": "https://chez-anna.example" }
  ]
}
```

**Règles du contrat :**

- **Types d'item fermés** : `hebergement | resto | activite | visite | trajet`.
- **La nature se déduit des champs, pas du type** : `jour` (+ `creneau`/`heure` optionnels)
  ⇒ **ponctuel** (carte dans le flux du jour) ; `debut` + `fin` ⇒ **continu** (bandeau qui
  court sur la plage de jours). Un stage de voile de 3 jours est une `activite` continue.
- **Statuts** : `suggestion | confirme | ecartee`. Confirmer = **changer le statut + poser un
  calage temporel** — jamais de copie, la carte est la même de bout en bout.
- **Invariant** : un item `confirme` porte toujours un calage (`jour` ou `debut`/`fin`) ;
  une `suggestion` n'en porte jamais. L'app le garantit par construction (le drop assigne le
  jour) ; la skill demande le jour avant de confirmer en chat. **Corollaire** : dans un voyage
  `idée` (sans dates), tout item est `suggestion` ou `ecartee` — la confirmation est
  mécaniquement impossible, il n'y a pas de jour à poser.
- **Créneaux** : `matin | midi | apres-midi | soir` — optionnel, c'est le rangement visuel
  dans le bloc jour. `heure` et `duree` sont du texte libre affiché tel quel.
- **Traçabilité, zéro duplication** : `gmail` (fil source d'une résa — la vérité de la résa
  reste dans Gmail), `place_id` (maps — la vérité du lieu reste chez maps). Un item `trajet`
  n'existe **que** porté par une résa ; le trajet routier estimé est une **liaison** (dérivée
  au rendu), jamais un item.
- **`modes`** : les moyens de déplacement du voyage, déclarés au cadrage — défaut
  `["marche", "voiture"]` ; `velo` / `transport` seulement si l'utilisateur les annonce (« on
  emporte les vélos », « tout à pied et en métro »). Ils bornent le choix de mode des liaisons.
- `lieu` : référence un `lieux[].id` du voyage (optionnel — rattache la carte à une étape,
  sert aussi à la météo). Les `lieux` sont géocodés une fois par Alfred à la création.
- `prix`, `notes` : optionnels, texte libre.
- **`desc` + `web` — la fiche de la carte.** `desc` : 2-3 phrases rédigées par Alfred au moment
  où il crée la carte (pourquoi c'est proposé, le conseil pratique). C'est un **jugement
  consigné, durable — donc stocké**, contrairement à la météo et aux liaisons qui, elles, se
  dérivent. `web` : lien vers la page du lieu (site officiel, tiré des détails maps ou du mail
  de résa).
- **`docs` — les documents de la carte** : `[{ "fichier": "assets/…", "titre": "…" }]`. Les
  fichiers vivent dans `assets/` du dossier voyage, **classés là par Alfred** — typiquement la
  pièce jointe du mail de résa (carte d'embarquement, confirmation, billet, contrat de
  location). Le fil Gmail reste la *source* de la résa ; le document, lui, est un fichier de
  la mémoire, sous la main le jour J. La fiche les rend en cartes de téléchargement (même
  rendu que `{% piece-jointe %}`).

## L'app-module (front)

- **Vue voyage = timeline verticale par jour**, du début à la fin : un bloc par jour —
  date + **picto météo** + cartes ponctuelles rangées par créneau. Les **continus** en bandeau
  latéral le long de leurs jours (l'hébergement se lit d'un coup d'œil), les **trajets** dans
  le flux du jour.
- **Liaisons** entre cartes consécutives d'un même jour : un mince connecteur « 🚶 12 min » /
  « 🚗 35 min · 24 km », dérivé au rendu (section « Liaisons ») — recalculé au drag, le chip
  suit le geste.
- **Tray « Suggestions »** à côté de la timeline : les cartes `suggestion`, filtrables par type.
- **Voyage `idée`** (sans dates) : pas de timeline — le tray seul, avec une invite « posez les
  dates pour composer ».
- **Gestes** :
  - drag tray → jour : la carte devient `confirme`, gagne le `jour` (et le créneau selon la
    zone de dépôt) ;
  - drag jour → jour : elle glisse (le calage change, rien d'autre) ;
  - drag planning → tray (ou « ↩ Rendre aux suggestions » dans la fiche) : elle redevient
    `suggestion` et **son calage saute** (invariant) — on change d'avis sans rien perdre ;
  - écarter : statut `ecartee`, la carte sort du tray sans disparaître du fichier ;
  - **ouvrir** (clic) : la carte se déplie en **fiche** — description d'Alfred (`desc`),
    calage, source (fil Gmail / maps), **documents** (`docs` : carte d'embarquement,
    confirmation…) et lien « ouvrir la page » (`web`). Consultation en surimpression : on ne
    quitte pas la timeline.
- **Chaque geste passe par l'API d'état** (`POST /api/voyage/state`, patron workbook) —
  validé côté serveur (item existant, jour dans le voyage, jamais un continu) et écrit dans
  un **overlay `voyage-state.json` frère, hors git** : la gateway n'écrit jamais la mémoire
  *(amendé à l'implémentation — c'est la frontière établie du corps)*. **Alfred consolide**
  l'overlay dans `voyage.json` à son prochain passage sur le dossier, puis commit : les
  gestes entrent dans l'historique par lui. **Zéro LLM au rendu ni dans le geste.**

## Météo — dérivée, jamais stockée

- **Endpoint gateway** (même source que le MCP `maps` : l'API météo Google, appelée en direct
  par le corps), **cache ~1 h** — un picto par jour coûte zéro et reste frais.
- **Le lieu du jour est dérivé des données** : l'hébergement actif ce jour-là, sinon l'étape
  courante (fenêtres `arrivee`/`depart` des `lieux`), sinon le lieu unique du voyage. Rien à saisir.
- **Fenêtre de fiabilité : aujourd'hui → J+10** (limite API). Hors fenêtre : **pas de picto**
  — l'absence plutôt que la fiction ; les pictos apparaissent d'eux-mêmes à l'approche du départ.
- Piège connu (D25) : `day[0]` = journée **en cours**, jamais « hier ».

## Liaisons — temps de trajet dérivés, jamais stockés

Le temps de trajet entre deux cartes est une donnée **positionnelle** : elle dépend de l'ordre
du jour, que le drag & drop change en permanence. La stocker à la création de la carte serait
faux dès le premier déplacement — donc même régime que la météo : **calculée au rendu**.

- **Origine** : la carte précédente du jour (ordre créneau/heure) ; pour la **première carte
  du jour, l'hébergement actif** ce jour-là. Pas de liaison entre deux jours.
- **Endpoint gateway** `/api/route` (Google Routes, appelée en direct par le corps), **sans
  trafic** — l'approximation est le contrat des vacances — donc cache long (~24 h) par paire
  origine/destination/mode.
- **Choix du mode, en trois temps** :
  1. **Filtre** : seulement les `modes` déclarés du voyage.
  2. **Présélection à vol d'oiseau** (gratuite, zéro appel) : ≤ 2 km → marche ; ≤ 6 km → vélo
     s'il est déclaré ; au-delà → voiture, sinon transport.
  3. **Vérification et escalade** : on calcule le mode présélectionné ; s'il crève son plafond
     (marche > 30 min, vélo > 45 min) → mode motorisé suivant. En zone grise (marche 20–30 min
     et voiture déclarée), afficher **les deux** — « 🚶 25 min · 🚗 7 min », l'utilisateur tranche
     en la lisant.
- **Carte sans coordonnées** (`place_id`/`lieu` absents) → pas de liaison. L'absence plutôt
  que la fiction, comme la météo.
- En chat, Alfred peut annoncer un temps de trajet en passant (réflexe `maps`, D25) — il ne
  l'écrit nulle part.

## La skill `voyages` (cerveau — hors de ce repo, pour la frontière)

Elle vivra dans le repo Alfred (`.claude/skills/voyages/`), sur le gabarit `correspondance` :

1. **Cadre** le voyage et crée le dossier : dates si elles existent (sinon voyage `idée`,
   tray seul), lieux géocodés, et **demande les modes de déplacement** (« vous aurez une
   voiture ? des vélos ? ») plutôt que de les deviner.
2. **Résas Gmail** → cartes `confirme` sourcées, et les **documents utiles classés** dans
   `assets/` (carte d'embarquement, confirmation — la pièce jointe du mail rejoint le dossier).
   Gardes `correspondance` intégrales (D17/D18/D24) : lecture à la demande, un mail ne
   déclenche jamais rien.
3. **Suggestions** (`search_places` + jugement + mémoire des goûts) → cartes vers le **tray**,
   chacune livrée avec sa fiche (`desc` rédigée + `web`).
   Alfred **ne place jamais rien sur la timeline de sa propre initiative** — le placement est
   un geste de l'utilisateur (app) ou une demande explicite (chat).
4. **Calendar** : sur demande seule, création par défaut, modif/suppr = confirmation.
5. **En voyage** : le canal mobile est le chat — Alfred lit `voyage.json` et répond par message.
6. **Consolidation** : à chaque passage sur un dossier voyage, fusionner l'overlay
   `voyage-state.json` (gestes de l'UI) dans `voyage.json`, supprimer l'overlay, commit.

## Hors v1

Réservation / achat (jamais) ; veille de prix ; grille horaire ; notifications ; rendu mobile
de la timeline ; carte géographique des étapes (candidate v2 naturelle : les items portent déjà
`place_id`, les lieux des coordonnées).

## Ordre de construction

1. ✅ **Mockup** timeline + tray dans l'artifact « Alfred — App » — gestes validés.
2. ✅ **`voyage.json` figé** (le geste a révélé `desc`/`web`/`docs` et l'overlay d'état).
3. ✅ **Corps** (2026-07-18) : `app/voyages.py` (list, état/gestes, météo, routes), module
   launcher (`renderVoyagesHub`/`renderVoyage`), type `voyage` dans AUTHORING.md.
4. **Cerveau** : skill `voyages` + entrée DECISIONS.md.
