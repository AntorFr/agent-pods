---
name: workbook-json
description: >
  Le CONTRAT DE DONNÉES de l'app Atelier — `projets/<projet>/assets/workbook.json`,
  schéma 3.0 : UN repère par pièce, bandes en rectangle + axe, lamello en lignes typées,
  assemblage en scène. À consulter dès que tu produis ou modifies un workbook. Livré par
  l'image avec le moteur qui le lit ET l'outil qui le valide/migre
  (`plugins/atelier/tools/atelier.mjs`). Le métier reste dans ton workspace.
---

# `workbook.json` — le contrat 3.0

**Le JSON est la source de vérité unique.** Il vit dans `projets/<projet>/assets/`, le front
le détecte seul (`rglob`) et le rend en vues liées par l'étiquette (`PROJ-MODULE-RÔLE-REPÈRE`).
L'avancement (`workbook-state.json`) et le calepinage remanié à l'établi
(`workbook-layout.json`) vivent À CÔTÉ, hors git — **le front n'écrit jamais ton JSON**, et
c'est toi qui consolides les calques sur demande.

**Valide TOUJOURS avant de commiter** : `node plugins/atelier/tools/atelier.mjs valide <fichier>`
— c'est EXACTEMENT le code que l'établi exécute (une règle = un seul endroit). `migre`
réécrit un vieux 2.0 en 3.0 (le front convertit aussi les 2.0 au chargement — les livres
dormants restent lisibles sans migration).

## D1 — LE REPÈRE : une pièce, six surfaces, tout s'exprime dedans

```
u : 0 → longueur   (about-gauche → about-droit)
v : 0 → largeur    (rive-avant → rive-arriere)
faces : face / contre-face
```

Vocabulaire FERMÉ des surfaces, partagé par tout le contrat :
`face` · `contre-face` · `rive-avant` · `rive-arriere` · `about-gauche` · `about-droit`
(+ `abouts` = les deux abouts, pour `chants[]` seulement).

**Le rôle est un libellé.** Aucun comportement n'en dépend — plus jamais d'axe choisi
« parce que la pièce s'appelle CÔTÉ ». Ce qui a une position la donne en `(u, v)`.

## Racine

`schemaVersion: "3.0"`, `projet`, `titre`, `note`, `materiaux[]`, `meta`, `pieces[]`,
`debit[]`, `stations[]?`, `assemblage[]?`.

**`materiaux[]`** : `{ id, label, ep, plaque: {l, h}, derasage, decorUni?, sensFil? }`.
**`meta`** : `kerf` (mm), `tronconnage` (surcote), `chant` (résumé libre — la vérité pièce
par pièce est `chants[]`), `installation`.

## `pieces[]`

```json
{ "etiquette": "IMP-C1-BAS", "module": "C1", "role": "BAS", "repere": "…",
  "longueur": 720, "largeur": 670, "materiau": "MEL19",
  "chants": ["rive-avant"], "haut": "face",
  "preparations": [ … ] }
```

**`haut`** (optionnel, vocabulaire des surfaces) : la surface qui regarde le **plafond une
fois le meuble monté**. Ce n'est PAS déductible du débit — un flan couché sur la plaque ne
dit pas comment il se dresse — et c'est ce qui évite de fraiser une pièce à l'envers. Les
vues la signalent (liseré bleu « ▲ HAUT » sur l'arête, ou mention quand c'est une face).
Déclare-la sur toute pièce qui n'est pas symétrique haut/bas.

- `materiau` porte l'épaisseur (pas de `ep` recopié). Les champs 1.0 (`reglageFS`,
  `panneau`, `colonne`) **n'existent plus** — `debit[]` dit déjà tout ça.
- `chants[]` : les arêtes plaquées, dans le vocabulaire des surfaces. Les vues les
  surlignent en orange ; deux colonnes aux chants différents ne se regroupent pas.

### Préparation `lamello` — une surface, des lignes (ou des points)

```json
{ "type": "lamello", "sur": "face",
  "lignes": [
    { "v": 50,  "points": [ {"u": 9.5, "t": "tenso"}, {"u": 360, "t": "tenso"} ] },
    { "v": 335, "points": [ {"u": 360, "t": "biscuit"} ] } ] }
```

- **Sur `face`/`contre-face` : `lignes[]`.** La clé de la ligne (`u:` ou `v:`) NOMME l'axe
  fixé ; ses points donnent l'autre coordonnée. Le type peut varier ligne à ligne — on
  n'éclate JAMAIS une prépa pour ça : une pièce, une surface, une préparation.

  ⚠️ **UNE LIGNE = UNE PLANCHE QUI ARRIVE.** Pas « une rangée de fentes ». Trois montants
  qui se plantent sur un fond, ce sont **trois lignes** (une par montant), chacune portant
  ses points de connecteur — et non une ligne par rangée de profondeur avec les montants en
  points. La clé de la ligne (`u:`/`v:`) nomme donc l'axe **le long duquel se mesure la
  position de cette planche**. Se tromper d'axe se voit à l'écran : les pointillés
  n'affleurent pas les bords qu'ils devraient affleurer.

  ⚠️ **LE SABOT — une ligne dit où arrive la PLANCHE, pas où passe l'axe.** La Zeta se cale
  au sabot contre une face de la planche voisine ; on ne vise jamais un axe. Donc la valeur
  de `u:`/`v:` est la **distance du bord de référence à la face la plus proche de la planche
  qui arrive** — une planche posée en butée sur le bord vaut **0**. Deux attributs de ligne
  accompagnent ça : **`ep`** (la dimension que la planche qui arrive occupe SUR CETTE SURFACE —
  son épaisseur quand elle arrive de chant, sa largeur quand elle est couchée à plat ;
  défaut : l'épaisseur de la pièce) et **`depuis`** (le bord de référence ; défaut `about-gauche` pour une ligne `u:`,
  `rive-avant` pour une `v:`). Mesure-t-on depuis le haut ? `depuis: "about-droit"`, et la
  cote redevient 0 pour une planche en butée en haut. Le front dessine la planche en
  pointillé, cote son bord de référence, et place la fente **au milieu** de la bande.
- **Sur un chant : `points[]`** portant la seule coordonnée libre — `v` sur un about,
  `u` sur une rive (le validateur refuse l'autre).

  ⚠️ **`appui` — LA FACE POSÉE SUR L'ÉTABLI, et elle n'est pas libre.** On fraise un chant la
  planche **couchée** : la lamelleuse cote depuis son embase, donc depuis la face qui touche
  le banc. Poser l'autre face décale la fente dans l'épaisseur, et la jonction ne tombe plus
  en face — c'est le pendant exact du sabot, sur l'autre axe. Déclare-la : `appui: "face"` ou
  `"contre-face"` (refusé sur une prépa de face, où la question ne se pose pas).

  **Comment la choisir — ce n'est pas un goût, c'est une déduction.** La prépa de FACE d'en
  face a mesuré la planche `depuis` un bord de référence ; la face de la planche qui **regarde
  ce bord** est celle qui doit toucher l'établi. Exemple : une tablette positionnée sur le
  côté `depuis: "about-gauche"` (le bas) a son **dessous** comme référence → on couche la
  tablette **dessous contre le banc** pour fraiser ses abouts. Croiser `haut` te dit lequel
  de `face`/`contre-face` est ce dessous. Les deux abouts d'une même pièce partagent
  normalement le même appui (on retourne bout pour bout, jamais face pour face).
- Chaque point doit tomber DANS la pièce (`0 ≤ u ≤ longueur`, `0 ≤ v ≤ largeur`) — c'est le
  contrôle qui attrape les transpositions d'axes, la plaie du 2.0.
- `note` : texte libre. `ref` n'existe plus (le repère EST la référence de cotation).
- Une prépa `rainure`/`perçage` garde ses `cotes`/`pos` en texte (inchangé).

## `jonctions[]` — une jonction s'écrit UNE fois (préférer à la main)

Une jonction s'usine sur **deux** pièces. Écrite deux fois, rien ne garantit qu'elle le soit
des deux bords, ni que les deux moitiés s'accordent, ni que l'`appui` réponde au `depuis`.
Déclare-la donc **ici**, et les préparations des deux pièces en **dérivent** :

```jsonc
{ "id": "J-cote-travAR",
  "porte":  { "piece": "IMP-C1-CÔTÉ-G", "sur": "face", "pos": 0, "depuis": "about-droit" },
  "arrive": { "piece": "IMP-C1-TRAV-AR", "sur": "about-gauche", "appui": "face", "origine": 551 },
  "connecteurs": [ { "t": "tenso", "a": 601 } ] }
```

- **`porte`** : la pièce qui reçoit **sur sa face**. `pos` + `depuis` = la cote au sabot.
- **`arrive`** : la pièce qui arrive **par son chant**. `appui` = la face couchée sur l'établi.
- **`connecteurs[].a`** : la position le long de la jonction, **dans le repère de la
  porteuse**. Écrite une seule fois — les deux moitiés ne peuvent plus diverger.
- **`arrive.origine`** : la coordonnée, chez la porteuse, du **zéro de l'arrivante** ; chez
  elle la fente vaut `a − origine`. Défaut 0. ⚠️ C'est le nombre qui évite le pire piège :
  la traverse arrière est à **601** vue du côté et à **50** vue d'elle-même — recopier 601
  raterait de 551 mm. (`inverse: true` si son repère court à contresens.)
- **L'axe se déduit** de `depuis` et du chant : tu ne le déclares jamais, donc tu ne peux
  plus le transposer.

**Ce que le validateur vérifie alors, et qu'il ne pouvait pas avant** : les deux pièces
existent ; la porteuse présente bien une face et l'arrivante un chant ; `appui` est là ;
et **chaque connecteur tombe dans les DEUX pièces**. Une jonction ne peut plus être écrite
à moitié.

`preparations[]` reste pour ce qui n'est PAS une jonction (rainure, perçage) — les deux se
cumulent à l'affichage.

## `debit[]` — la plaque est le tronc, les étapes forment une CHAÎNE

`{ "plaque": "P1", "label"?, "materiau", "etapes": [...] }` — types : `derasage`,
`refente`, `tronconnage`. **Chaque étape a un `id`** (c'est la clé d'avancement) et un
`label?` (l'affichage — plus de nom déduit en découpant l'id).

**`entree` = ce qu'on met sous la scie** : `"plaque"` | id d'une bande | id d'une étape de
tronçonnage (redéligner un tronçon — deux pièces posées côte à côte en travers, séparées à
l'étape suivante). Une source doit exister avant d'être reprise. Dégrossissage, orientations
mixtes et deux-en-travers en découlent sans vocabulaire de plus.

**Une bande = un rectangle + un axe** :

```json
{ "id": "P1-B1", "label": "B1", "x": 0, "y": 0, "w": 668, "h": 2800, "axe": "y" }
```

`axe` = la direction le long de laquelle courent les tronçons (`"y"` = debout, `"x"` =
couchée). **Le réglage du guide n'est pas un champ : c'est la dimension transverse**
(`axe:"y"` → `w`) — il ne peut pas mentir.

**Une pose** : `{ "etiquette", "x", "y", "rot"? }` — absolue sur la plaque brute, origine
en haut-gauche. **`rot: false` (défaut) = u (longueur) le long de x** — la pièce posée
comme elle se dessine ; `true` = quart de tour. ⚠️ C'est l'INVERSE du défaut 2.0 : ne relis
jamais un vieux fichier avec les yeux du 3.0 — `schemaVersion` tranche, `migre` convertit.

**Le trait de scie n'est pas optionnel** : deux pièces (ou deux bandes feuilles) qui se font
face laissent au moins `meta.kerf` mm — jointives, elles sont insciables. Les colonnes d'un
dégrossissage vivent DANS leur bande mère (modèle enchaîné, pas un chevauchement) : seules
les **feuilles** — que plus aucune refente ne reprend — doivent paver la plaque.

## `stations[]` — la barre déclarée (inchangé)

`{ type, titre?, plaques?|modules? }`, types : `debit` · `tronconnage` · `rainure` ·
`lamello` · `assemblage` · `suivi`, zéro ou plusieurs fois, dans l'ordre du fichier.
Sans déclaration : barre historique moins les stations vides.

## `assemblage[]` — la scène, SEUL format

Le contrat ouvert v0.2 (cadre mm, `noeuds[]` : piece/trait/cote/feature/note/repere,
`sequence[]` cochable qui surligne ses `cible[]`). Les cotes se MESURENT depuis les ancres,
jamais écrites. L'élévation héritée (module/niveaux) n'existe plus — le convertisseur en
fait une scène minimale pour les vieux livres.

## L'ÉCHELLE — un seul px/mm par workbook

Toutes les vues (Plaques, Tronçons, Lamello, Assemblage) composent leur viewBox sur la même
largeur de référence : une tablette de 331,5 a la même taille dans chaque onglet, et un
meuble se compare à sa plaque. Jamais de zoom local — la lisibilité des petits objets passe
par les cotes écrites. On fait des plans, pas du dessin d'art.

## L'établi et les calques — ce que tu consolides

La vue Plaques a un mode **établi** : Monsieur déplace pièces ET colonnes (une colonne
emporte ses pièces), règle le guide au clavier, tourne (bridé par `decorUni`/`sensFil`),
crée et supprime des colonnes. Ses gestes vont dans `workbook-layout.json` :

```jsonc
{ "poses":  { "IMP-C1-BAS": { "x": 690, "y": 54, "rot": true, "bande": "P2-C3" } },
  "bandes": { "P2-C3": { "w": 260 },
              "P2-N1": { "cree": true, "plaque": "P2", "axe": "y", "x": 1604, "y": 50, "w": 100, "h": 600 },
              "P2-C7": { "supprime": true } } }
```

Quand Monsieur demande de « ranger le calepinage » :
1. **poses** → reporte `x`, `y`, `rot` dans `debit[]`, et déplace la pose vers la bonne
   étape de tronçonnage si `bande` a changé.
2. **bande amendée** → reporte le rectangle/axe dans sa refente (un `w` qui change est un
   réglage de guide — vérifie la fiche projet).
3. **bande `cree`** → crée sa refente (avec la bonne `entree`) ET son étape de tronçonnage.
4. **bande `supprime`** → retire-la de sa refente, supprime son étape (l'établi refuse déjà
   de supprimer une colonne qui porte des pièces).
5. **Vide le calque, commite, et repasse `valide`** — l'établi contrôle en direct, mais
   c'est le fichier consolidé qui fait foi.
