# Plugin `planning` — l'agenda transverse

La vue Planning : **semaine** en vue principale (7 colonnes, bandes de présence en
travers, cartes complètes dans les colonnes), **mois** en zoom arrière (grille,
bandes, puces horodatées, jour détaillé au clic). Sur mobile, la semaine se
verticalise : une pile de cartes par jour, présences en rails sur le côté, creux
repliés en une ligne.

## La donnée

`memory/planning/planning.json`, écrit par l'agent, lu tel quel par la vue via
`GET /api/memory/raw/planning/planning.json`. **Pas d'API propre, pas d'overlay de
gestes** : la vue lit, l'agent écrit. Le jour où un geste d'UI existera, il suivra
le modèle voyages (overlay frère consolidé par l'agent) — pas avant.

Le contrat de format fait foi dans `skills/planning-json/SKILL.md` (livré par
l'image, comme `voyage-json`). L'essentiel :

- trois primitives — `suivis` (voie nommée : couleur + nom), `periodes`
  (intervalle sur un suivi), `elements` (carte typée sur un jour) ;
- champs aux noms d'iCalendar / JSCalendar (`uid`, `title`, `start`, `end`,
  `description`, `location`, `color`, `name`) ; extensions maison : `type`,
  `ico`, `genre`, `suivi`, `gmail`, `fiche` ;
- **`end` exclusif partout** (le DTEND daté d'iCalendar) — l'hébergement n'a pas
  de règle spéciale : `end` = jour du départ ;
- `color` = jeton de thème uniquement — le front (`tok()`) refuse le reste ;
- un `start` sans heure fait une bande, un `start` horodaté fait une carte.

## Ce que le rendu dérive (et ne stocke jamais)

- les chips d'heure (`08:04 → 10:38`) depuis `start`/`end` ;
- la chip 📧 depuis la présence de `gmail`, la chip 📄 depuis `fiche` ;
- la **découpe des bandes aux bords de semaine** : les capsules (coins ronds) ne
  marquent que les vraies bornes, la coupe franche au bord de la fenêtre dit
  « ça continue » — c'est le `overflow:hidden` de la grille qui coupe, aucune
  donnée découpée ;
- le repli des jours vides (mobile) : un jour sans carte et hors de toute
  période se replie avec ses voisins en une ligne « … rien de prévu ».

## Robustesse

Une période dont le `suivi` est inconnu, dont les bornes manquent ou sont
inversées est **ignorée** (elle perd sa bande, pas la page). Une `color` qui
n'est pas un jeton retombe sur le défaut du type. Fichier absent (404) = état
vide expliqué, pas une erreur.

## Activation

`planning` dans `GW_APPS` du pod (le défaut historique ne l'inclut pas). La tuile
montre la semaine qui vient : prochain élément en statut, compteurs `n cette
semaine` (ambre) et périodes en cours.
