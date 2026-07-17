# Voyages — spec v1 (planificateur de vacances)

> Spec figée le 2026-07-18 (session de cadrage, décisions utilisateur incluses). Le cap vient
> de D25 côté cerveau : croiser les mails de résa (Gmail), l'agenda (Calendar) et `maps`
> (trajets + météo) — « celui-là sera une skill ». Ici : le contrat de données et l'app-module
> côté corps. Mockup à venir dans l'artifact « Alfred — App » avant toute ligne de code.

## Décisions structurantes

- **Domaine `voyages`** : la vue domaine est une collection de cartes, une par voyage.
- **Un voyage = une date de début + une date de fin, toujours.** Un seul lieu de résidence ou
  plusieurs (périple), au choix. Pas de dates → pas de voyage : une envie sans dates reste un
  sujet côté cerveau, le dossier naît quand les dates existent (même approximatives).
- **App-module dès la v1** : le drag & drop suggestions → timeline est le cœur du besoin, c'est
  du *comportement*, donc du code (jamais du Markdoc passif).
- **Vue approximative assumée** : jour + créneau, pas de grille horaire. C'est les vacances,
  pas un Gantt — une heure ferme (ferry) s'affiche telle quelle, mais rien ne l'exige.
- **Mobile : la règle du shell ne bouge pas** (mobile = chat plein écran, pas de canvas).
  En voyage, Alfred fait la conciergerie **par message** en lisant le dossier (« le programme
  de demain ? »). Aucun rendu mobile de la timeline. *(Décision utilisateur, 2026-07-18.)*
- **Trajets = cartes de la timeline en v1** : confirmés quand une résa existe (sourcée du
  mail), estimés sinon (`travel_time`, estimation **datée**). La journée « on roule » se voit.
- **Météo par jour : régime dérivé, jamais stockée** (détail plus bas).
- **Suggestions écartées conservées** (statut `ecartee`, masquées) — anti re-proposition.

## Arborescence mémoire (raccord au contrat AUTHORING)

```
domaines/voyages/
└── corse-2026/
    ├── index.md            # type: voyage — la fiche consultable (prose, notes, liens)
    └── assets/voyage.json  # la donnée du module (plomberie : mentionnée, jamais liée)
```

- `index.md` : frontmatter **`type: voyage`** — extension du vocabulaire fermé, donc un acte
  codé (moteur + AUTHORING.md + skill, en un geste coordonné). Champs : `debut:` / `fin:`
  (AAAA-MM-JJ, obligatoires), `status:` au cycle **`prépa → en-cours → clos`**, `titre:`, `tags:`.
- La **vue domaine** est dérivée du frontmatter (cartes : titre, dates, statut, compteur de
  cartes confirmées) — la collection générique suffit, zéro vue spécifique.
- Le module s'embarque dans la fiche, patron du plan de débit :
  `{% outil id="voyage" voyage="corse-2026" /%}`.

## `voyage.json` — le contrat de données

```json
{
  "version": 1,
  "titre": "Corse — été 2026",
  "debut": "2026-08-08",
  "fin": "2026-08-22",
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
      "duree": "5 h 45", "gmail": "thread:188ff…" },
    { "id": "resto-anna", "type": "resto", "statut": "suggestion",
      "titre": "Chez Anna", "creneau": "soir", "duree": "~2 h",
      "lieu": "calvi", "place_id": "ChIJxx…", "prix": "~60 €" }
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
  jour) ; la skill demande le jour avant de confirmer en chat.
- **Créneaux** : `matin | midi | apres-midi | soir` — optionnel, c'est le rangement visuel
  dans le bloc jour. `heure` et `duree` sont du texte libre affiché tel quel.
- **Traçabilité, zéro duplication** : `gmail` (fil source d'une résa — la vérité de la résa
  reste dans Gmail), `place_id` (maps — la vérité du lieu reste chez maps). Un trajet sans
  résa porte `duree_estimee` + `estimee_le` : l'estimation est **datée**, le temps réel se
  redemande en chat le jour J, il ne pourrit pas dans un fichier.
- `lieu` : référence un `lieux[].id` du voyage (optionnel — rattache la carte à une étape,
  sert aussi à la météo). Les `lieux` sont géocodés une fois par Alfred à la création.
- `prix`, `notes` : optionnels, texte libre.

## L'app-module (front)

- **Vue voyage = timeline verticale par jour**, du début à la fin : un bloc par jour —
  date + **picto météo** + cartes ponctuelles rangées par créneau. Les **continus** en bandeau
  latéral le long de leurs jours (l'hébergement se lit d'un coup d'œil), les **trajets** dans
  le flux du jour.
- **Tray « Suggestions »** à côté de la timeline : les cartes `suggestion`, filtrables par type.
- **Gestes** :
  - drag tray → jour : la carte devient `confirme`, gagne le `jour` (et le créneau selon la
    zone de dépôt) ;
  - drag jour → jour : elle glisse (le calage change, rien d'autre) ;
  - écarter : statut `ecartee`, la carte sort du tray sans disparaître du fichier.
- **Chaque geste écrit `voyage.json` via l'API d'état** (patron `/api/workbook/state`) —
  persisté, historisé git, **zéro LLM au rendu ni dans le geste**.

## Météo — dérivée, jamais stockée

- **Endpoint gateway** (même source que le MCP `maps` : l'API météo Google, appelée en direct
  par le corps), **cache ~1 h** — un picto par jour coûte zéro et reste frais.
- **Le lieu du jour est dérivé des données** : l'hébergement actif ce jour-là, sinon l'étape
  courante (fenêtres `arrivee`/`depart` des `lieux`), sinon le lieu unique du voyage. Rien à saisir.
- **Fenêtre de fiabilité : aujourd'hui → J+10** (limite API). Hors fenêtre : **pas de picto**
  — l'absence plutôt que la fiction ; les pictos apparaissent d'eux-mêmes à l'approche du départ.
- Piège connu (D25) : `day[0]` = journée **en cours**, jamais « hier ».

## La skill `voyages` (cerveau — hors de ce repo, pour la frontière)

Elle vivra dans le repo Alfred (`.claude/skills/voyages/`), sur le gabarit `correspondance` :

1. **Cadre** le voyage (dates obligatoires, lieux géocodés) et crée le dossier.
2. **Résas Gmail** → cartes `confirme` sourcées. Gardes `correspondance` intégrales
   (D17/D18/D24) : lecture à la demande, un mail ne déclenche jamais rien.
3. **Suggestions** (`search_places` + jugement + mémoire des goûts) → cartes vers le **tray**.
   Alfred **ne place jamais rien sur la timeline de sa propre initiative** — le placement est
   un geste de l'utilisateur (app) ou une demande explicite (chat).
4. **Calendar** : sur demande seule, création par défaut, modif/suppr = confirmation.
5. **En voyage** : le canal mobile est le chat — Alfred lit `voyage.json` et répond par message.

## Hors v1

Réservation / achat (jamais) ; veille de prix ; grille horaire ; notifications ; rendu mobile
de la timeline ; carte géographique des étapes (candidate v2 naturelle : les items portent déjà
`place_id`, les lieux des coordonnées).

## Ordre de construction

1. **Mockup** timeline + tray dans l'artifact « Alfred — App » — valider les gestes avant le code.
2. **Figer `voyage.json`** après le mockup (le geste révèle les champs).
3. **Corps** : `type: voyage` (moteur + AUTHORING.md), module timeline + API d'état, endpoint météo.
4. **Cerveau** : skill `voyages` + entrée DECISIONS.md.
