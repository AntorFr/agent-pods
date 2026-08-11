---
name: fiches-format
description: >
  Le CONTRAT DE FORMAT du contenu affiché par la PWA — frontmatter YAML typé et
  vocabulaire de blocs Markdoc FERMÉ ({% callout %}, {% galerie %}, {% web %},
  {% piece-jointe %}, {% outil %}, {% graphique %}, {% parcours %}, wikilinks), zéro
  HTML, zéro CSS.
  À consulter dès que tu écris ou modifies un fichier destiné à être RENDU par la
  PWA (fiche, projet, todo, index de domaine). Ce document est livré par l'image
  avec le moteur de rendu : il fait foi sur la FORME. Le métier — quoi ranger où,
  quand créer un domaine — reste dans le CLAUDE.md de ton workspace.
---

# Format des fiches rendues par la PWA

Ce contrat est livré **par l'image du corps**, avec le moteur Markdoc qui le lit
(`frontend/src/blocks.js`). Un bloc existe ici si et seulement s'il existe dans le
moteur : les deux voyagent dans le même tag d'image, ils ne peuvent pas diverger.

**Portée.** La FORME, et rien d'autre. Ce que tu ranges, où, et pourquoi, relève de
ton workspace — ce fichier ne le sait pas et n'a pas à le savoir.

## Règle d'or

Tu écris **uniquement** : markdown standard **+ frontmatter YAML + les blocs
ci-dessous**. **Jamais de HTML ni de CSS.** Un bloc ou un attribut hors catalogue est
**rejeté** par le moteur (pas rendu de travers) — c'est ce qui garantit une apparence
homogène. Tu ne choisis pas la mise en forme : tu choisis des *blocs*, le moteur les
habille.

Une fiche = un fichier `.md`.

## 1. Frontmatter — en tête, entre `---`

```yaml
---
type: <voir table>
domaine: <le dossier réel sous domaines/>
titre: <titre lisible>
status: <selon le type>
tags: [<mot>, <mot>]
---
```

**`type`** (fermé) : `fiche` · `projet` · `recette` · `contact` · `cadeau` · `achat` ·
`savoir-faire` · `machine` · `outil` · `tache` · `liste` · `espace` · `planif`.

**`status`** dépend du type :
- `projet` : `idée` | `en-cours` | `bloqué` | `clos`
- `achat` : `veille` | `à-acheter` | `acheté`
- `cadeau` : `idée` | `acheté` | `offert`
- `machine`, `savoir-faire`, `outil` : **pas de `status`**
- `planif` : **pas de `status`** — `actif:` (booléen) fait foi

Un statut **terminal** (`clos` ; `offert` ; `acheté` sur un `achat`) range la carte tout
seul dans la section **Archive** du domaine, repliée sous les fiches vivantes. N'invente
donc jamais de statut « archivé » ni de dossier d'archive sous `domaines/` : le statut
fermé suffit, l'interface fait le rangement.

⚠️ **Le statut vit en frontmatter, JAMAIS seulement en prose.** Écrire
« **Statut : en cours** » dans le corps ne produit ni pastille, ni facette, ni filtre :
l'interface ne lit **que** le frontmatter. Une phrase en prose peut s'y ajouter pour le
contexte humain, mais le champ structuré doit être là.

### Attributs par type

| Type | Attributs propres |
|---|---|
| `projet` | `cat:` (`menuiserie`\|`bricolage`\|`electronique`\|`dev`), `aspects`, `groupBy` |
| `tache` | `projet:<id>`, `due`, `est`, `dep`, `blk`, `pri`, `done`, `sub:[<ids>]` |
| `liste` | `ico` (emoji), `desc`, `refs:[<ids>]` (**par référence, jamais recopiés**) |
| `espace` | `titre`, `ico` (un emoji), `couleur` (vocabulaire fermé — §3) |
| focus | `tools:[<ids>]`, `refs:[<ids>]` |
| `recette` | `temps`, `difficulté` |
| `contact` | `tel`, `role` |
| `cadeau` | `person`, `prix` |
| `achat` | `prix` |
| `planif` | `quand` (cron 5 champs, entre guillemets), `tz`, `actif` (bool) |

⚠️ **`planif` est le seul type dont le CORPS est exécuté** : à l'heure dite, la gateway
ouvre un tour avec le corps de la fiche pour prompt. Donc pas de préambule décoratif,
pas de bloc, pas de wikilink pour faire joli — ce qui s'affiche est mot pour mot ce qui
tourne.

## 2. Blocs — vocabulaire FERMÉ

Tu n'inventes pas de bloc. Un bloc sans contenu se ferme par `/%}`.

```markdoc
{% callout type="note" %}
Un aparté. type ∈ note | astuce | attention.
{% /callout %}

![texte alternatif](assets/schema.png)      ← image, chemin RELATIF

{% galerie %}
![vue 1](assets/a.png)
![vue 2](assets/b.png)
{% /galerie %}

{% web url="https://…" titre="…" /%}        ← lien enrichi (une URL YouTube devient
                                               un lecteur intégré, automatiquement)
{% piece-jointe fichier="assets/notice.pdf" /%}
{% outil id="debit" projet="<id-projet>" /%}   ← branche un module codé

{% parcours source="assets/boucle-vannes.parcours.json" /%}   ← trace, profil et repères
{% parcours source="assets/ile-aux-moines.parcours.json" vue="lien" /%}   ← carte compacte

{% graphique type="barres" titre="…" unite="€" couleur="vert" %}
libellé: valeur
{% /graphique %}
```

**Wikilinks :** `[[cible]]` ou `[[cible|texte affiché]]`. Un nom court se résout par
nom de fichier dans toute la mémoire ; pour une cible au nom générique, écris le chemin
complet. Un wikilink vers une **image** (`[[assets/photo.jpg]]`) l'affiche embarquée.

**Lier ou mentionner ?** Un lien est une invitation à cliquer : n'en fais que vers ce
qui se **consulte**. La plomberie — script générateur, `.json` brut — se mentionne en
`code` inline, sans lien.

**Un rendu te manque ?** Tu **demandes un bloc**. Pas de HTML de contrebande.

### 2.1 Le graphique

Le dessin est produit au transform, sans bibliothèque : rien ne s'exécute depuis un
contenu mémoire.

| Attribut | Valeurs | Rôle |
|---|---|---|
| `type` | `barres` (défaut) · `ligne` | comparer / suivre une évolution |
| `titre` | texte libre | il n'y a **pas de légende** : le titre dit ce qu'on regarde |
| `unite` | `€`, `kg`, `pas`… | collée à chaque valeur |
| `couleur` | les douze teintes de §3 | décoratif. **JAMAIS un code hexa** |

Le corps porte les données : une paire `libellé: valeur` par ligne. Les nombres se
lisent à la française comme à l'anglaise ; si un libellé contient un `:`, c'est le
**dernier** qui sépare.

**Ce que le bloc refuse** (il l'écrit à l'écran plutôt que de dessiner faux) : une ligne
sans `:` ou dont la valeur n'est pas un nombre ; une **valeur négative en `barres`** ;
une **courbe à un seul point**.

**Quatre règles d'écriture :**

1. **UNE SEULE SÉRIE par graphique.** Les douze teintes sont des jetons d'identité de
   domaine, pas une palette catégorielle : passées au validateur, elles échouent dans
   les deux thèmes (`emeraude`↔`turquoise` à ΔE 7,3 en vision normale). Deux mesures ⇒
   deux blocs.
2. **Un graphique est un jugement CONSIGNÉ ET DATÉ, pas un miroir vivant.** Il duplique
   des chiffres qui vivent ailleurs : il porte donc sa source et la date du relevé, juste
   sous le bloc.
3. **Une seule valeur n'est pas un graphique** — c'est une phrase, écris la phrase.
4. **En `ligne`, les points sont espacés régulièrement** quel que soit l'écart réel entre
   les dates. Sur des relevés irréguliers, dis-le.

### 2.2 Le parcours

| Attribut | Valeurs | Rôle |
|---|---|---|
| `source` | chemin d'un `*.parcours.json`, **relatif au dossier de la fiche** | **obligatoire** |
| `vue` | `carte` (défaut) · `lien` | la carte dessinée, ou une vignette qui y mène |

Rend la trace sur une carte, son profil altimétrique et ses repères numérotés — **tous lus
dans le `.parcours.json`**, jamais dans la fiche. Le bloc **ancre**, il ne dessine pas : une
boucle de 3 km fait plus de trois cents points, les inliner remettrait toute la géométrie
dans le modèle à chaque retouche de la fiche — exactement le coût que le fichier de parcours
existe pour éviter. Même contrat qu'`outil` : le chemin est résolu au transform, le front
charge et peint au montage. `source` absente ⇒ le bloc l'écrit à l'écran.

**Un parcours n'a pas de maison.** Il s'accroche à la fiche qui a une raison d'en parler —
un week-end, une forêt, un voyage — et reste adressable seul par `#/parcours/<chemin>` :
c'est ce qui évite d'inventer un domaine « balades ». Une fiche qui en cite trois pose trois
`vue="lien"`, pas trois cartes.

## 3. Espace multi-pages et habillage

Un sujet qui déborde une page → un **dossier** : un fichier index en `type: espace`, des
pages liées par `[[dossier/page]]`.

L'apparence d'un domaine (tuile, fil d'Ariane, en-tête) est **déclarative** — dans le
frontmatter de son `INDEX.md` :

```yaml
---
type: espace
domaine: sante
titre: Santé
ico: ❤️
couleur: rouge
---
```

Les trois champs sont indépendants et facultatifs.

**`couleur` — vocabulaire FERMÉ, douze teintes :** `rouge` · `orange` · `ambre` · `vert` ·
`emeraude` · `turquoise` · `bleu` · `indigo` · `violet` · `rose` · `gris` · `ardoise`.

**Jamais un hexadécimal, jamais un nom hors liste** (ignoré en silence). Deux raisons :
la palette est thémée clair/sombre **et** repeinte par les chartes d'agent — un hexa figé
ignorerait les deux ; et la valeur finit dans un attribut `style`, donc le vocabulaire
fermé est ce qui interdit d'injecter du CSS depuis un contenu d'origine douteuse.

**`ico` est un emoji**, échappé avant affichage — pas un glyphe SVG.

## 4. Todo — une base, des vues

- **La base = les tâches.** Une fiche `type: tache` par tâche, avec ses attributs. Elle
  vit à **un seul endroit**.
- **Une liste curée = une fiche `type: liste`** qui ne porte que `titre`, `ico` et
  **`refs:[<ids>]`** — jamais le texte d'une tâche. L'ordre des `refs` est l'ordre affiché.
  Une même tâche peut figurer dans plusieurs listes : plusieurs `refs`, **zéro copie**.
- **Les listes dynamiques ne s'écrivent pas** (« En retard », « Rapides », « Bloquées ») :
  elles sont calculées par le front sur les attributs. Ne crée pas de fiche pour elles.

Cocher une tâche, l'ajouter à une liste : ce sont des **gestes** que le front transmet en
message — c'est l'agent qui édite la fiche (`done:`) ou le `refs:` de la liste. **Le front
ne touche jamais la mémoire.**
