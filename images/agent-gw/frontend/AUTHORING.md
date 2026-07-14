# Écrire du contenu pour la PWA Alfred — guide agent

> **Destinataires : les agents qui rédigent la mémoire** (Alfred ; demain Nestor s'il alimente
> une mémoire partagée). Ce guide est le pendant *écriture* du moteur de rendu
> (`src/blocks.js`) : il décrit ce que tu peux écrire pour que le front l'affiche. Il reste
> synchro avec le moteur — un bloc ici ⇔ un bloc dans `blocks.js`.

## Règle d'or

Tu écris **uniquement** : markdown standard **+ frontmatter YAML + les blocs ci-dessous**.
**Jamais de HTML ni de CSS.** Un bloc ou un attribut hors de ce catalogue est **rejeté** par le
moteur (pas rendu de travers) — c'est ce qui garantit une apparence homogène. Tu ne choisis pas
la mise en forme (couleurs, marges) : tu choisis des *blocs*, le moteur les habille.

Une fiche = un fichier `.md`. Un fait par fichier (discipline mémoire habituelle).

## Frontmatter (en tête de fichier, entre `---`)

```yaml
---
type: projet            # fiche | projet | recette | contact | cadeau | achat |
                        # savoir-faire | machine | outil | tache | espace
domaine: projets        # atelier | projets | maison | cuisine | achats | cadeaux | contacts | admin
titre: Rangement garage # sinon le nom de fichier
status: en-cours        # en-cours | bloqué | clos  (achat: veille|à-acheter|acheté ;
                        #                             cadeau: idée|acheté|offert)
tags: [menuiserie, garage]
créé: 2026-07-14
maj: 2026-07-14
---
```

Champs selon le besoin (ils alimentent les listes, facettes, cartes — ne les invente pas, utilise
ceux-ci) :

- **Regroupement** : `cat` (catégorie majeure d'un projet : `menuiserie|bricolage|electronique|dev`),
  `aspects: [métiers secondaires]`, `groupBy` (clé de regroupement d'une collection : `person`…).
- **Liens/références** (base unique, jamais de copie) : `projet: <id>` (sur une tâche = étape de
  projet), `tools: [debit]` (outils activés d'un projet), `refs: [<ids de tâches>]` (liste de focus).
- **Tâche** : `due`, `est`, `dep`, `blk`, `pri`, `done`, `sub: [<ids enfants>]`.
- **Par type** : recette `temps`/`difficulté` ; contact `tel`/`role` ; cadeau `person`/`prix` ; achat `prix`.

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

{% web url="https://exemple.com/article" titre="Titre lisible" /%}   {# aperçu + lecteur intégré #}

{% piece-jointe fichier="assets/plan.pdf" /%}   {# carte de téléchargement #}

Lien vers une autre fiche : [[voiles-lego-impression]] ou [[voiles-lego-impression|texte affiché]]
```

**Embarquer un module (fonctionnalité codée)** — le bloc adosse un vrai composant :

```markdown
{% outil id="debit" projet="rangement-garage" /%}   {# le plan de débit / suivi menuiserie #}
```

Blocs standard aussi : titres `#`, listes `-` / `1.`, gras `**`, tableaux, code — markdown normal.

## Espace multi-pages

Une fiche riche peut être un **dossier** de plusieurs `.md` (ex. `maison/piscine/` avec
`index.md`, `entretien.md`, `hivernage.md`…). Le front affiche alors une navigation entre les
pages. Les pages se lient entre elles par `[[piscine/entretien]]`. Mets `type: espace` sur l'index.

## Ce qu'il ne faut pas faire

- Pas de HTML/CSS, pas de `<div>`, pas de style inline.
- Pas de bloc inventé : si un rendu manque, il faut ajouter un bloc **côté moteur** (demande à
  Skippy) — ne le contourne pas en HTML.
- Pas de duplication : une tâche/idée vit une fois dans sa base ; on la **référence** (`refs`,
  `projet`), on ne la recopie pas.
