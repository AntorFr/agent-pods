# Écrire du contenu pour la PWA Alfred — guide agent

> **Destinataires : les agents qui rédigent la mémoire** (Alfred ; demain Nestor s'il alimente
> une mémoire partagée). Ce guide est le pendant *écriture* du moteur de rendu
> (`src/blocks.js`) : il décrit ce que tu peux écrire pour que le front l'affiche. Il reste
> synchro avec le moteur — un bloc ici ⇔ un bloc dans `blocks.js`. **Source de vérité unique** :
> en cas de doute sur le format, c'est ce fichier qui tranche, pas une fiche existante (une
> fiche existante peut être une erreur pas encore corrigée).

## Règle d'or

Tu écris **uniquement** : markdown standard **+ frontmatter YAML + les blocs ci-dessous**.
**Jamais de HTML ni de CSS.** Un bloc ou un attribut hors de ce catalogue est **rejeté** par le
moteur (pas rendu de travers) — c'est ce qui garantit une apparence homogène. Tu ne choisis pas
la mise en forme (couleurs, marges) : tu choisis des *blocs*, le moteur les habille.

Une fiche = un fichier `.md`. Un fait par fichier (discipline mémoire habituelle).

## Frontmatter (en tête de fichier, entre `---`) — OBLIGATOIRE dès qu'une fiche a un statut

⚠️ **Règle non négociable : le statut vit en frontmatter (`status:`), JAMAIS seulement en
prose.** Écrire « **Statut : en cours** » dans le corps du texte ne produit ni pastille, ni
facette, ni filtre dans l'interface — le front ne lit QUE le frontmatter pour ça, jamais le
texte libre. Tu peux *en plus* garder une phrase en prose pour le contexte humain (« abandonné
faute de temps », « en attente d'une baisse de prix »…), c'est même bienvenu — mais le champ
structuré doit être là, sinon la fiche est invisible dans les facettes et sans pastille sur sa
carte.

```yaml
---
type: projet             # projet | achat | cadeau | contact | recette | savoir-faire | machine |
                         # outil | tache | espace | voyage
domaine: diy          # le nom du dossier RÉEL sous domaines/ (achats|cadeaux|contacts|cuisine|diy|maison|…)
titre: Rangement garage   # optionnel — sinon le nom de fichier, mis en forme automatiquement
status: en-cours           # vocabulaire FERMÉ, voir tableau ci-dessous — omis si le type n'en a pas
tags: [menuiserie, garage]
---
```

### Vocabulaire de `status` — fermé, par type (n'invente pas de synonyme)

| `type` | valeurs possibles, dans l'ordre du cycle de vie |
|---|---|
| `projet` | `idée` → `en-cours` → `bloqué` ou `clos` (un projet terminé reste `clos` même archivé de longue date — précise en prose si utile, mais ne crée pas de statut « archivé ») |
| `achat` | `veille` (en comparaison, rien de tranché) → `à-acheter` (choix fait, pas encore acquis) → `acheté` |
| `cadeau` | `idée` → `acheté` → `offert` |
| `tache` | pas de `status` ici — l'état est la case `- [ ]` / `- [x]` dans `todo/taches.md` (contrat séparé, voir plus bas) |
| `machine`, `savoir-faire`, `outil` | **pas de `status`** — fiches de connaissance/possession, sans cycle de vie. Ne pas en inventer un « toujours disponible » ou autre. |
| `voyage` | **pas de `status` en frontmatter** — le cycle (`idée → prépa → en-cours → clos`) vit dans `assets/voyage.json`, source unique (voir « Le contrat voyage » plus bas). |

**N'utilise QUE ces valeurs, exactement orthographiées.** Si la situation réelle ne colle à
aucune (par exemple un achat empêché par un fournisseur en rupture), garde le statut le plus
proche du vocabulaire fermé et mets le détail en prose — ne crée pas de nouvelle valeur. Si le
vocabulaire te semble vraiment insuffisant pour un cas récurrent, dis-le à Skippy plutôt que
d'inventer : le composant qui peint les pastilles ne reconnaît que ces mots-là, un statut hors
liste s'affiche gris par défaut, sans être filtrable proprement.

### Autres champs (selon le besoin — n'en invente pas d'autres)

- **Regroupement des projets** : `cat` — **uniquement** sur `type: projet`, une des 4 valeurs
  fermées : `menuiserie | bricolage | electronique | dev`. C'est le métier *majeur* du projet ;
  si un projet touche plusieurs métiers (un meuble avec de l'électronique embarquée), `cat` reste
  le métier principal et les autres vont dans `aspects: [Électronique]` (libellés secondaires,
  texte libre cette fois). Un projet sans `cat` n'apparaît dans aucune catégorie de la vue
  « Projets » — mets-le toujours.
- **Liens/références** (base unique, jamais de copie) : `projet: <id-du-fichier>` (sur une tâche,
  la relie comme étape d'un projet), `tools: [debit]` (outils codés activés sur un projet),
  `refs: [<ids de tâches>]` (une liste de focus todo — référence, pas copie).
- **Par type** : recette `temps` / `difficulté` ; contact `tel` / `role` ; cadeau `person` / `prix` ;
  achat `prix` (optionnel, texte libre : `"~350 €"`, `"2 799 $"`…).

## Le contrat todo (`todo/taches.md`) — format à part, pas de frontmatter

La todo n'est PAS un frontmatter par tâche : c'est un fichier unique (`todo/taches.md`, dont
l'en-tête fait foi en cas de divergence avec ce guide), sections `##`, cases à cocher. Format
d'une ligne :

```markdown
- [ ] Description de la tâche — (échéance: 2026-07-20) (durée: ~20 min) [[lien]]
```

- **Échéance** : `(échéance: AAAA-MM-JJ)` — un attribut consultable, **jamais un déclencheur** (tu
  ne rappelles rien tout seul). Alimente automatiquement la vue « En retard » si la date est
  dépassée et la case pas cochée.
- **Durée** : `(durée: 10 min)`, `(durée: ~20 min)` ou `(durée: 3 h)` — travail effectif, hors
  délais d'attente (livraison…). **Écris-la quand tu la connais**, elle alimente la vue
  « Rapides » (tâches ≤ 30 min). Une tâche sans durée n'apparaît jamais dans cette vue, même si
  elle est objectivement courte — ce n'est pas deviné, c'est écrit. Le `~` est toléré (estimation
  approximative) ; unité `min` ou `h` uniquement.
- **Lien projet** : `[[domaines/diy/projets/rangement-garage]]` en fin de ligne fait de cette
  tâche une étape du projet (le lien suffit, pas besoin d'un champ séparé).
- Sections reconnues : `## En cours`, `## À faire`, `## Fait` — ne pas en inventer d'autres, la
  todo groupe dessus.

## Blocs (vocabulaire fermé)

Les blocs sans contenu se ferment par `/%}` ; ceux avec contenu par `{% /nom %}`.

```markdown
{% callout type="note" %}          {# type: note | astuce | attention #}
Texte important, mis en évidence.
{% /callout %}

![Légende de l'image](assets/photo.png)   {# chemin RELATIF à la fiche → résolu tout seul #}

{% galerie %}
![](assets/a.png)
![](assets/b.png)
{% /galerie %}

{% web url="https://exemple.com/article" titre="Titre lisible" /%}   {# aperçu carte + lien externe #}

{% piece-jointe fichier="assets/plan.pdf" /%}   {# carte de téléchargement #}

Lien vers une autre fiche : [[voiles-lego-impression]] ou [[voiles-lego-impression|texte affiché]]
```

### Images — deux façons d'en mettre une, un seul comportement voulu

- **`![légende](assets/photo.png)`** (markdown standard) → image embarquée dans la page,
  chemin **relatif à la fiche**. C'est la façon normale d'illustrer une fiche.
- **`[[assets/photo.png]]`** (wikilink vers un fichier image) → **aussi embarquée**
  automatiquement (le moteur détecte l'extension image et rend une `<img>`, pas un lien texte).
  Pratique quand tu veux citer une photo qui vit ailleurs dans la mémoire (ex. une photo prise
  pour une tâche todo, réutilisée dans une fiche machine) : `[[todo/assets/piece-cassee.jpg]]`.
- Un wikilink vers autre chose qu'une image (`[[une-autre-fiche]]`) reste un **lien de
  navigation**, comme d'habitude.
- **Libellé** : un wikilink **sans alias** est affiché avec le **titre de la cible**
  (frontmatter `titre:`), pas son chemin — `[[domaines/maison/piscine/poollab]]` se lit
  « PoolLab 2.0 — photomètre ». L'alias (`[[cible|texte]]`) reste préférable quand la phrase
  demande une formulation précise.
- **Résolution** : un wikilink **court** (`[[rangement-garage]]`, sans chemin) est résolu par
  nom de fichier dans toute la mémoire (style Obsidian, premier trouvé). Ça marche, mais si deux
  fiches portaient le même nom, le lien deviendrait ambigu — pour une cible dont le nom est
  générique (`journal`, `index`…), écris le chemin complet (`[[domaines/maison/piscine/journal]]`).

### Lier ou mentionner ? — ne lie que ce qui se consulte

Un **lien** est une invitation à cliquer. N'en fais un que vers ce qui se **consulte** : une
fiche, une page HTML autonome, un PDF, une image. La **plomberie** (script générateur, données
brutes `.json`, fichiers techniques) se mentionne en `code` inline — `assets/workbook.json`,
`assets/gen_workbook_json.py` — sans lien : l'information de provenance est là pour l'agent qui
retouchera la fiche, pas pour que Monsieur ouvre un `.py` dans son navigateur.

### Vidéo YouTube — embarquée, pas juste un lien

Écris `{% web %}` avec une URL YouTube (`youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`) : le
moteur détecte automatiquement que c'est YouTube et rend un **lecteur intégré** (vignette + bouton
lecture ; la vidéo ne se charge — ni ne pistfe — qu'au clic du visiteur) au lieu d'une simple
carte-lien.

```markdown
{% web url="https://www.youtube.com/watch?v=8FQ7LSB7K3w" titre="Impression de voiles LEGO sur tissu" /%}
```

Aucune autre syntaxe : c'est le même bloc `{% web %}` que pour un lien externe classique, seule
l'URL change le rendu. N'essaie **jamais** d'écrire une balise `<iframe>` toi-même — le moteur
la supprime (sécurité), la vidéo n'apparaîtrait pas.

**Embarquer un module (fonctionnalité codée)** — le bloc adosse un vrai composant :

```markdown
{% outil id="debit" projet="rangement-garage" /%}   {# le plan de débit / suivi menuiserie #}
```

Blocs standard aussi : titres `#`, listes `-` / `1.`, gras `**`, tableaux, code — markdown normal.

## Espace multi-pages

Une fiche riche peut être un **dossier** de plusieurs `.md` (ex. `maison/piscine/` avec
`index.md`, `entretien.md`, `hivernage.md`…). Le front affiche alors une navigation entre les
pages. Les pages se lient entre elles par `[[piscine/entretien]]`. Mets `type: espace` sur
l'index. **Placement** : un espace lié à un domaine existant vit en sous-dossier de ce domaine,
pas en domaine séparé — ex. la piscine vit dans `domaines/maison/piscine/` (`domaine: maison`
dans son frontmatter), pas un domaine `piscine` à part (erreur corrigée le 2026-07-17 : elle
avait été promue à tort). La navigation par cartes de sous-domaine s'en charge automatiquement,
aucun code à demander.

## Le contrat voyage (`domaines/voyages/<id>/`)

Un voyage est un **app-module** (timeline + suggestions dans la PWA), pas une fiche : sa
donnée vit dans **`assets/voyage.json`**, source unique — titre, `status`, `debut`/`fin`,
`lieux` (géocodés une fois), `items` (cartes : hébergement, resto, activité, visite,
trajet-résa). Le contrat détaillé du JSON est dans `images/agent-gw/VOYAGES.md` (repo
`agent-pods`) — en cas de doute, c'est lui qui tranche.

- **Ne duplique pas** dates/statut dans un frontmatter : le front lit le JSON.
- Une **fiche `.md` optionnelle** (`type: voyage`, prose libre : contexte, envies) peut
  accompagner le dossier — sans `status`.
- Les **documents** (carte d'embarquement, confirmation — pièces jointes des mails de
  résa) se classent dans `assets/` et se référencent dans l'item (`docs`).
- **Consolidation** : l'UI écrit les gestes (confirmer/déplacer/écarter) dans un overlay
  `assets/voyage-state.json`, **hors git**. À chaque passage sur un dossier voyage :
  fusionne l'overlay dans `voyage.json` (statut/jour/creneau par item), supprime
  l'overlay, puis commit — c'est ainsi que les gestes entrent dans l'historique.

## Ce qu'il ne faut pas faire

- Pas de HTML/CSS, pas de `<div>`, pas de style inline, pas de `<iframe>` fait main.
- **Pas de statut en prose seule** — c'est l'erreur la plus fréquente constatée (« **Statut : en
  réflexion** » dans le texte) : ça se lit très bien à l'humain, mais l'interface n'y voit rien.
  Le frontmatter `status:` est ce qui pilote pastilles/facettes/filtres.
- Pas de bloc inventé : si un rendu manque, il faut ajouter un bloc **côté moteur** (demande à
  Skippy) — ne le contourne pas en HTML.
- Pas de duplication : une tâche/idée vit une fois dans sa base ; on la **référence** (`refs`,
  `projet`), on ne la recopie pas.
