---
name: workbook-json
description: >
  Le CONTRAT DE DONNÉES de l'app Atelier — le format de
  `projets/<projet>/assets/workbook.json`, que la PWA rend en quatre vues liées
  (Débit, Prépas, Assemblage, Suivi) plus un mode atelier plein écran. À consulter
  dès que tu produis ou modifies un workbook : schéma 2.0, conventions d'axes,
  sémantique des colonnes. Livré par l'image avec le module qui le lit. Le métier —
  concevoir un meuble, choisir une matière — reste dans ton workspace.
---

# `workbook.json` — le contrat de données

**Le JSON est la source de vérité unique.** Il vit dans
`projets/<projet>/assets/workbook.json` ; le front le détecte tout seul (`rglob`), sans
déclaration nulle part, et le rend en **quatre vues liées par l'étiquette**
(`PROJ-MODULE-RÔLE-REPÈRE`) : Débit (calepinage à l'échelle), Prépas (par pièce),
Assemblage (par module), Suivi (cases par groupe de réglage). L'avancement est stocké
côté serveur dans un `workbook-state.json` voisin — **le front ne touche jamais ton
JSON.**

## Racine

`schemaVersion` (`"2.0"`), `projet` (trigramme), `titre`, `note`, `materiaux[]`, `meta`,
`pieces[]`, `debit[]`, `assemblage[]`, `stations[]` (optionnel).

## `stations[]` — la barre du workbook, déclarée

La barre d'onglets n'est plus figée : **`stations[]` la déclare**, dans l'ordre du fichier —
chaque type **zéro, une ou plusieurs fois**. C'est toi qui écris l'ordre réel de l'atelier.

```json
"stations": [
  { "type": "debit", "titre": "Plaques CP", "plaques": ["P1", "P2"] },
  { "type": "tronconnage", "titre": "Tronçons CP", "plaques": ["P1", "P2"] },
  { "type": "rainure" },
  { "type": "lamello", "modules": ["B1"] },
  { "type": "assemblage", "modules": ["B1", "B2"] },
  { "type": "suivi" }
]
```

- **`type`** — vocabulaire FERMÉ : `debit` · `tronconnage` · `rainure` · `lamello` ·
  `assemblage` · `suivi`. Inconnu → station ignorée en silence.
- **`titre`** (optionnel) — le libellé de l'onglet ; défaut : Plaques / Tronçons / Rainures /
  Lamello / Assemblage / Suivi. Indispensable quand un type revient deux fois (« Tronçons
  CP » / « Tronçons MDF »).
- **Portée** (optionnelle) — ce que l'instance montre : **`plaques: [ids]`** pour `debit` et
  `tronconnage` ; **`modules: [ids]`** pour `rainure`, `lamello` (filtre les pièces par leur
  `module`) et `assemblage` (filtre les entrées par leur `module` — une scène du contrat
  ouvert **sans** champ `module` n'apparaît que dans une station non scopée). Absente → tout.
- `suivi` est toujours global. La progression d'en-tête et le Mode atelier ne dépendent pas
  des stations : ils suivent les étapes du débit, comme avant.

**Sans `stations[]`** (tous les workbooks existants) : barre **dérivée** — l'ordre historique
Plaques → Tronçons → Rainures → Lamello → Assemblage → Suivi, **moins les stations sans
contenu** (pas de rainure dans le projet ⇒ pas d'onglet Rainures). Déclare `stations[]` dès
que l'ordre réel s'écarte de ça, pas pour reproduire le défaut.

**`meta`** : `matiere`, `decorUni`, `sensFil`, `plaque` (ex. `"2800 × 2070 mm"` — sert de
cadre au dessin de débit), `kerf` (mm), `chant`, `installation`.

## `pieces[]`

```json
{ "etiquette": "GAR-B1-DESSOUS", "projet": "GAR", "module": "B1", "role": "DESSOUS",
  "repere": "…", "largeur": 620, "longueur": 480, "ep": 19, "reglageFS": 620,
  "panneau": "P4", "colonne": "C4",
  "chants": ["avant"],
  "preparations": [ { "type": "rainure|lamello|perçage", "cotes": "…", "pos": "…" } ],
  "placeAssemblage": "…" }
```

### `chants[]` — les côtés plaqués, et eux seuls

Déclare **quels côtés de la pièce reçoivent un chant** (plaqueuse). Vocabulaire **FERMÉ**,
dans le **repère du dessin Tronçons** (longueur en x, AVANT en haut) : `avant` · `arriere` ·
`gauche` · `droite` · `abouts` (= les deux bouts d'un coup). Hors liste → ignoré en silence.

Le front surligne **uniquement ces côtés-là**, en trait **orange épais** posé sur l'arête —
jamais tout le contour, jamais la cote — dans la vue **Tronçons** (légende en pied de page),
et l'annonce dans la fiche pièce et la fiche colonne. Deux colonnes par ailleurs identiques
ne se **regroupent pas** si leurs chants diffèrent : au poste de plaquage, ce n'est pas la
même colonne. La vue Débit ne les dessine pas : ses colonnes tournent les pièces (`sens`,
`rot`), le repère avant/arrière n'y est plus fiable — on ne surligne pas un côté qu'on ne
sait pas placer. `meta.chant`, lui, reste le résumé libre du projet (matière du chant,
politique) ; `chants[]` est la vérité pièce par pièce.

### ⚠️ Préparation `lamello` — la convention d'axes, et le piège

```json
{ "type": "lamello", "sur": "face", "ref": {"long": …, "trav": …}, "abouts": [a1, a2],
  "connecteurs": [{ "t": "tenso|biscuit", "w": … }], "note": "…" }
```

**`sur` — la surface fraisée** (optionnel, vocabulaire FERMÉ) : `face` · `contre-face` ·
`abouts` · `rive-avant` · `rive-arriere`. Dès qu'une prépa d'une pièce le déclare, la vue
Lamello passe en **fiche multi-vues** pour cette pièce : la face au centre, chaque surface
fendue **rabattue** autour en projection alignée — bande d'about à gauche/droite (l'`abouts[]`
choisit le bout : `0` → gauche, `≈longueur` → droite), rive au-dessus/dessous, contre-face en
dessous **par transparence** (même orientation, mêmes cotes). **Tout à l'échelle commune,
jamais de zoom local** : dans une bande d'épaisseur la fente est un trait d'axe, et la
vérification passe par les cotes écrites, mesurées depuis les mêmes références dans toutes
les vues — on fait des plans, pas du dessin d'art. C'est le seul moyen d'écrire « fentes de
part et d'autre » (`face` + `contre-face`) : sans `sur`, la donnée ne sait pas le dire, et la
pièce garde sa carte à plat historique (migration au fil de l'eau).

- **`connecteurs[].w` est une cote le long de la PROFONDEUR** (la `longueur` de la
  pièce), mesurée depuis le bord AVANT. **Jamais** le long de la largeur.
- **`abouts` = positions en LARGEUR** des deux lignes de connecteurs.
- Le rendu mappe donc `w` → axe profondeur, `abouts` → axe largeur. Sur le dessin de
  **débit**, `pose.rot` échange en plus ces deux axes (cf. `debit[]`).

**Symptôme d'une transposition d'axes** (constatée le 2026-07-23) : une pièce sort **hors
de la plaque**. Repro — `GAR-B1-DESSOUS`, 480 prof × 620 larg, posée en P4-C4 à `y=1502` :
l'about `620` porté à tort sur l'axe profondeur donne `y = 2122`, pour une plaque haute de
2070. Le même défaut est plus discret sur les tablettes (un Tenso `w=550` sur une pièce
large de 412) : il ne sort pas du cadre, il place juste faux.

## `debit[]` — schéma 2.0, « modèle A »

La plaque est le tronc, le débit se lit en étapes : `dérasage → refente → tronçonnage`,
en **positions absolues sur la plaque brute**.

`{ "plaque": …, "materiau": …, "etapes": [ … ] }`, une étape valant :

- `derasage`
- `refente` : `{ entree, sens, bandes: [{ id, largeur, x, y, longueur }] }`
- `tronconnage` : `{ entree, pieces: [{ etiquette, x, y, rot? }] }`

`x`/`y` sont **absolus sur la plaque brute**, origine au coin haut-gauche : `x` le long de
`materiaux[].plaque.l`, `y` le long de `.h`.

**`sens` sur une refente :**

| `sens` | La bande | Le tronçonnage | Dessin |
|---|---|---|---|
| `"court"` (défaut, rétrocompatible) | court le long de `y` | tronçons empilés en `y` | `largeur` en x, `longueur` en y |
| `"long"` | court le long de `x` | tronçons alignés en `x` | **`longueur` en x, `largeur` en y** |

**Pourquoi `long`** : la refente y fait du **long bord de la bande la façade des pièces** —
le chant se plaque en une passe, le tronçonnage arase les abouts ensuite. `sens` ne décrit
donc pas un choix de dessin, mais ce que la bande va devenir.

**`rot` sur une pose de tronçonnage** : `true` tourne la pièce d'un quart de tour — elle
occupe `longueur` en **x** et `largeur` en **y** (absent ou `false` : `largeur` en x,
`longueur` en y). Sert à coucher une pièce plus profonde que la bande pour qu'elle y tienne.

⚠️ **`rot` et `sens` sont INDÉPENDANTS et se combinent.** `sens` oriente la **bande**
(géométrie de la colonne) ; `rot` oriente **une pièce** dans sa bande. Les `x`/`y` d'une pose
restent absolus et **sens-agnostiques** : c'est toi qui les poses justes, le front ne calcule
aucun nesting. `rot` n'est lu que par la vue **Débit** — la vue Lamello dessine toujours la
pièce à plat (`longueur` en x), il n'y entre pas.

## `calepinage[]` — schéma 1.0, et sa sémantique trompeuse

`{ panneau, ep, dims, colonnes: [{ largeur, reglageFS, pieces: [etiquettes] }] }`

⚠️ **Une « colonne » est un GROUPE DE RÉGLAGE FS-PA** (une largeur = un groupe), **pas**
une position physique sur la plaque. Le front en tire un **nesting indicatif** à l'échelle
et l'annonce comme tel — ne le lis jamais comme un plan de coupe exact.

*(Les workbooks émis depuis juillet 2026 sont tous en 2.0 ; 1.0 reste rendu.)*

## `assemblage[]`

`{ module, titre, fond, niveaux: [{ niveau, h, connecteurs }], sequence: [ … ] }`
