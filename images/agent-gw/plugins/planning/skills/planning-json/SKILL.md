---
name: planning-json
description: >
  Le CONTRAT DE DONNÉES de l'app Planning — le format de `planning/planning.json`,
  que la PWA rend en vue semaine (colonnes + bandes de présence) et en vue mois
  (grille + jour détaillé). À consulter dès que tu crées ou modifies le planning :
  trois primitives (suivi, période, élément), champs aux noms d'iCalendar, end
  exclusif, couleurs en jetons de thème. Livré par l'image avec le module qui le
  lit. Le métier — quoi mettre au planning, quand — reste dans ton workspace.
---

# `planning.json` — le contrat de données

`memory/planning/planning.json` est la **source unique** de la vue Planning : un
agenda transverse — trains, nuits d'hôtel, présences (les jours à Paris, ceux de
Laurine), et tout suivi du même genre. La PWA le rend en **semaine** (vue
principale : 7 colonnes, bandes en travers, cartes dans les colonnes) et en
**mois** (zoom arrière : grille, bandes, puces horodatées, jour détaillé au clic).
Ce fichier est livré par l'image avec le module qui le lit : ils ne peuvent pas
diverger.

```json
{
  "version": 1,
  "suivis": [
    { "uid": "moi-paris", "name": "vous · Paris",    "color": "--accent" },
    { "uid": "laurine",   "name": "Laurine · Paris", "color": "--cadeaux" },
    { "uid": "nuits",     "name": "nuits d'hôtel",   "color": "--maison", "genre": "hebergement" }
  ],
  "periodes": [
    { "uid": "p1", "suivi": "moi-paris", "start": "2026-09-07", "end": "2026-09-11" },
    { "uid": "p2", "suivi": "laurine",   "start": "2026-09-08", "end": "2026-09-10" },
    { "uid": "p3", "suivi": "nuits",     "start": "2026-09-07", "end": "2026-09-10",
      "title": "Mercure Montparnasse", "gmail": "thread:18c9f2ab44e07d31" }
  ],
  "elements": [
    { "uid": "e1", "type": "trajet", "start": "2026-09-07T08:04", "end": "2026-09-07T10:38",
      "title": "TGV 8317", "description": "Nantes → Montparnasse · voit. 12 · pl. 56",
      "gmail": "thread:18c9f2ab44e07d31" },
    { "uid": "e2", "type": "repas", "start": "2026-09-08T20:00", "title": "Dîner avec Laurine" },
    { "uid": "e3", "type": "rdv", "start": "2026-09-10T09:30", "end": "2026-09-10T12:00",
      "title": "Comité produit", "location": "bureau de Paris" }
  ]
}
```

## Les trois primitives

1. **Le suivi** — une voie nommée : qui ou quoi l'on suit. Il porte la couleur et
   le nom partout où ses périodes apparaissent (pilule de légende, bande, rail
   mobile). `genre: "hebergement"` est la seule variante : ses périodes sont des
   nuits — bandeau « nuit ici » dans les jours détaillés, `end` = jour du départ.
2. **La période** — un intervalle `start`/`end` rattaché à un suivi par son
   `uid`. Elle ne porte **ni couleur ni style** : tout vient du suivi. `title`
   optionnel (affiché en tête de bande : le nom de l'hôtel), sources optionnelles.
3. **L'élément** — une carte typée sur un jour : train, rdv, repas… Rendue en
   carte complète (semaine, jour détaillé) ou en puce horodatée (mois).

## Les règles qui mordent

- **Les noms de champs viennent de la norme des agendas** (iCalendar RFC 5545 /
  JSCalendar RFC 8984) : `uid`, `title`, `start`, `end`, `description`,
  `location`, `color`, `name`. On n'en invente pas d'autres pour ce qu'elle
  couvre déjà. Hors norme, en conscience : `type`, `ico`, `genre`, `suivi`,
  `gmail`, `fiche`, `docs` — elle n'a pas nos sémantiques.
- **`end` est EXCLUSIF, partout** — le DTEND d'un événement daté d'iCalendar.
  Présent du 7 au 10 inclus → `end: "2026-09-11"`. Nuits du 7, 8 et 9 →
  `end: "2026-09-10"` (le jour du départ). Une seule convention, aucune exception.
- **ISO 8601 partout** : une date `AAAA-MM-JJ`, un instant `AAAA-MM-JJTHH:MM`.
  Un `start` sans heure fait une bande ou une carte sans heure ; un `start`
  horodaté fait une carte à l'heure. Un champ absent est **absent**, jamais un
  zéro ni une chaîne vide.
- **`color` est un JETON du thème, jamais un hex** : `--accent`, `--proj`,
  `--agenda`, `--maison`, `--cuisine`, `--cadeaux`, `--diy`, `--voyage`… C'est ce
  qui rend le light/dark gratuit ; le front refuse toute autre forme et retombe
  sur le défaut.
- **Le `type` d'un élément est un vocabulaire fermé** : `trajet` (🚆, `--proj`),
  `rdv` (💼, `--agenda`), `repas` (🍽️, `--cuisine`), `activite` (🚣, `--diy`) —
  tout autre `type` rend en ◆ `--agenda`. `ico` surcharge le glyphe à l'unité
  (⛴, ✈️, 🚌…), `color` la teinte.
- **Le dérivé ne se stocke pas.** La chip d'heure, la chip 📧 résa (déduite de la
  présence de `gmail`), la découpe d'une bande qui enjambe deux semaines, les
  capitales des noms de bande : c'est du rendu. N'écris jamais ces informations
  en double.
- **Mêmes sources que voyage.json** : `gmail: "thread:…"` pour une résa retrouvée
  dans la boîte, `fiche: "<chemin dans memory/>"` pour une fiche rédigée — la
  carte devient cliquable et s'ouvre sur la fiche.
- **Générique par construction** : « les jours de télétravail », « la garde du
  chien », « les astreintes » = un suivi + des périodes ; un ferry, un pot de
  départ, un rdv médical = un élément. Aucun code nouveau — seulement des données.
- **Un planning, pas un agenda.** Google Calendar reste l'agenda de Monsieur ;
  ce fichier est le modèle de VUE des présences et déplacements. Ne pas y
  recopier tout l'agenda — y poser ce qui doit se voir en bandes et en cartes.
