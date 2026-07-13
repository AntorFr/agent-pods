# agent-gw — notes de refonte (design system + plateforme)

> Direction arrêtée en session de design (mockups à l'appui, pas encore implémentée).
> Sert de cahier des charges quand on attaque le vrai code. À faire évoluer.

## Architecture — contenu vs présentation vs comportement

Séparation stricte, c'est le pilier :

- **Contenu** → Alfred. Markdown enrichi + **blocs typés** + frontmatter. Vocabulaire *fermé*,
  jamais de HTML/CSS libre. Alfred rédige *au moment de l'écriture* (fichiers dans le repo).
- **Présentation** → code (Skippy). Design system (tokens + composants) + moteur de rendu.
  Rend *au moment de la lecture*, dans le navigateur, **zéro LLM dans le chemin d'affichage**.
- **Comportement** → code. Les fonctions interactives (todo, atelier SVG, agenda).

**L'unicité est garantie parce qu'Alfred ne peut PAS toucher le pixel** (vocabulaire de blocs
contraint), pas parce qu'il aurait un design system « à compléter ». Il apprend le vocabulaire
via une skill ; ajouter un bloc = un acte codé + une ligne de skill.

## Moteur de rendu — **Markdoc** (décidé)

- Markdoc (Stripe) : markdown + tags custom **validés par schéma**, renderer HTML (sans React).
  Un tag mal formé est rejeté, pas rendu de travers. Tag = peut adosser un composant codé
  (`{% atelier projet="rangement-garage" /%}` → module SVG) → unifie contenu ET apps.
- **Étape de bundle esbuild** dans le Dockerfile (node déjà présent). Build **une fois à la
  construction de l'image**, JAMAIS à l'édition d'une page. Le contenu se rend en direct.
- **DOMPurify** conservé en défense-en-profondeur sur le HTML final.
- Repli si besoin : markdown-it + markdown-it-container (`html:false`), zéro build, vendorable.

## Métaphore app-store

- **Launcher / mosaïque d'apps** comme point d'entrée. Chaque app = une tuile (Todo, Ateliers,
  Projets, Domaines, Agenda, Cadeaux, Contacts, Recherche…) avec son état en direct.
- **Plupart des domaines = contenu** (moteur md générique) → un nouveau domaine = zéro code.
- **Quelques domaines = apps codées** (Todo, Menuiserie/Atelier, Agenda…) derrière un **registre**.
- **Chemin de promotion** : un domaine naît en contenu ; quand il mérite une UX dédiée, il devient
  un module codé (rime avec la doctrine sujet→projet d'Alfred).

## L'Atelier, Projets, Outils (la zone la plus complexe — arrêtée)

- **« L'Atelier »** (remplace « DIY ») = domaine de **connaissance + capacités**, PAS les projets :
  - **Savoir-faire** (techniques réutilisables) ;
  - **Machines** (leur *usage* est un savoir-faire) ;
  - **Outils** = les fonctionnalités codées activables (plan de débit/suivi menuiserie ; demain
    un générateur de boîtes laser…).
- **« Projets »** = domaine à part, **rangé par catégorie MAJEURE** : Menuiserie, Bricolage,
  Électronique, Développement. Un projet peut être transverse (un meuble avec de l'électronique) —
  la catégorie affichée est le métier *principal* ; les autres métiers sont des « aspects ».
- **Un outil = un module attaché à des projets**, en **double entrée** :
  1. depuis la **fiche projet** (section « Outils du projet », si activé) ;
  2. depuis **L'Atelier › Outils**.
  Même module, deux chemins (le fil d'Ariane reflète l'origine).
- Les fiches savoir-faire/machine sont **référencées** par les projets qui les emploient.

## Trois régimes de contenu (à ne pas confondre)

- **Dérivé** (requête live sur le frontmatter) : galeries, facettes, vues dynamiques todo,
  compteurs des tuiles. Calculé par le front/gateway, toujours à jour, ~0 coût, pas de LLM.
- **Matérialisé curé** (jugement d'Alfred) : **la « une » / « Reprendre » de la home**, la
  liste de focus « Aujourd'hui ». Un **sous-agent Alfred** choisit les 3-4 éléments à mettre
  en avant **+ une raison** et écrit un artefact (`home/brief.json`). Le front le lit *cheap*.
  **Pas de LLM au render.** Rafraîchi sur **déclencheurs réactifs** : rituel du matin,
  « rafraîchis ma une », ou à l'ouverture si le brief a plus de N heures (1 appel throttlé).
  Alfred reste réactif — aucune tâche de fond.
- **Rédigé** (contenu) : fiches/pages en md+blocs, rendues à la lecture sans LLM.

⚠️ Piège : « Reprendre » n'est PAS un tri par date-de-modif (requête bête) — c'est du jugement,
donc régime *matérialisé curé*, comme la liste de focus todo (même mécanisme).

## Vue collection générique (LE composant transverse)

Presque tous les domaines suivent le même patron : **cartes + recherche/facettes → détail**.
Donc UN seul composant « collection », configuré par domaine — pas un écran par domaine.

- **Collection plate** : Cuisine (recettes), Contacts, Achats, Projets. Cartes issues du
  frontmatter, **recherche** (nom/tags/type) + **facettes** (une propriété du frontmatter :
  catégorie, rôle, statut…). Régime *dérivé* (requête live).
- **Collection groupée** : Cadeaux → on entre par **personne** (niveau de regroupement), puis
  la liste. Même composant + une clé `groupBy`.
- **Config par domaine** : quels champs sur la carte, quelle(s) facette(s), regroupé ou non.
  Idéalement déduite du frontmatter + une petite config de domaine.

## Derrière une carte : page unique OU espace multi-pages

Le détail d'un élément n'est pas toujours une page :

- **Page unique** : une recette, un contact, un volet roulant → une fiche md+blocs.
- **Espace multi-pages** : un projet complexe, un cluster de connaissances (ex. **Piscine** :
  vue d'ensemble, entretien, hivernage, matériel PoolLAB, traitement). = un **dossier de pages**
  avec sa **navigation interne** (TOC latérale) et des **cross-links** `[[piscine/poollab]]`.
- Côté mémoire : page unique = un `.md` ; espace = un **dossier** de `.md` (une page = index).
  Le front détecte l'un ou l'autre et rend la fiche ou l'espace+TOC. Même moteur de rendu.

## Shell & ergonomie

- **Pas de barre de navigation centrale** (l'ancienne arbo). Navigation = mosaïque + recherche.
- **Retour à l'accueil / navigation profonde** : un **fil d'Ariane** qui commence toujours par
  « Accueil » (cliquable), chaque segment cliquable (Accueil › Maison › Piscine › Entretien) ;
  **+ le blason Alfred = bouton accueil** ; **+ retour d'un cran**. Trois chemins cohérents.
- **Chat d'Alfred = première classe, rail permanent à gauche** (pas un tiroir escamotable).
  Défaut ~1/3 de l'écran.
- **⚠️ Le rail de chat doit être REDIMENSIONNABLE par l'utilisateur** : poignée à glisser entre
  chat et canvas, largeur persistée (localStorage). Le 1/3 n'est qu'une valeur par défaut.
- **Mobile** = chat plein écran uniquement (le canvas de droite disparaît). Règle historique.
- Arbo profonde (si conservée quelque part) : indentation resserrée + troncature `…` + tooltip.

## Recherche & facettes

- **Recherche universelle** (barre ⌘K) : nom, tag, type, statut → résultats plats.
- **Facettes** (statut × type) alimentées par le **frontmatter** des fiches (`status:`, `type:`,
  `tags:`). Vue « Projets » en galerie de cartes facettée (pleine page).
- À trancher : recherche uniquement en barre, ou aussi une app « Recherche » plein écran.

## Palette & typo

- **Froid, moderne. PAS de crème / jaune / « papier jauni années 70 ».**
- Châssis neutre froid (obsidienne bleutée en sombre, gris frais en clair) ; **la couleur vient
  des apps** (chaque tuile sa teinte), pas d'un accent unique dominant.
- Deux thèmes (clair/sombre) à parité.
- Typo : sans système pour le corps, serif lettré (Iowan/Palatino) réservé au nom/titres pour la
  touche majordome, mono pour la donnée technique (étiquettes, cotes, métadonnées).

## App Todo — modèle de données (référence, ZÉRO duplication)

Besoin utilisateur : la liste complète est longue/effrayante. Le matin, avec Alfred, on se
donne des objectifs (jour / week-end) et on suit une **liste de focus** — mais tout en
**référence**, une seule base, pas de copie.

- **Base unique** : `todo/taches.md`. Chaque tâche a un **id stable** (`^id`), statut,
  métadonnées (échéance, estimation, tags, lien projet/domaine). Seule source de vérité.
- **Liste de focus = liste d'ids** vers la base (`todo/focus/<nom>.md`). Aucune copie du texte
  ni de l'état ; à l'affichage on résout les ids → tâches vivantes.
- **L'état (fait/pas fait) vit sur la tâche de la base.** Cocher dans un focus bascule *la*
  tâche, partout. Désync impossible.
- **Deux natures de vues** :
  - **Focus curées** (toi + Alfred au petit-déj) = liste d'ids **stockée** (une décision, non dérivable).
  - **Vues dynamiques** (en retard, < 15 min, par domaine) = **requêtes** dérivées, rien de stocké.
- **Vue par défaut de l'app = le focus du jour** (court, calme), PAS la base complète. La grande
  liste ne s'ouvre qu'à la curation.
- **Rituel** : « objectifs du jour » → Alfred propose depuis la base (échéances, quick wins,
  non bloquées) → validation → il écrit la liste de focus → app affiche « Aujourd'hui ».
- **Sous-tâches** (hiérarchie) = même mécanisme de référence (tâche → tâches enfants). Secondaire.
- Intégrité : un focus ne tient que des ids ; ids disparus/faits ignorés à la résolution.

## Vues à réaliser

- **Todo** : app-module. Défaut = focus du jour ; base groupée par domaine accessible à la
  curation ; bandeau focus (retards, contraintes) ; chips (échéance/dep/est/blocage) ; priorité.
- **Atelier (Menuiserie)** : plan de débit **SVG à l'échelle** (dérasage matérialisé, pièces colorées
  par famille, étiquette+cotes, cliquables → détail), élévation d'assemblage SVG, préparations, suivi
  par réglage FS-PA. API d'état déjà existante (`/api/workbook/state`) = le patron des app-modules.
- **Fiche mémoire** : blocs `::: image`, `::: galerie`, `::: callout/note`, `::: web` (lecteur intégré),
  pièce jointe, `[[wikilinks]]`, barre de propriétés (statut/type/tags depuis le frontmatter).
- **Projets** : galerie facettée.

## Ordre de construction proposé

1. Moteur md + design system (bundle Markdoc + composants) — améliore tout le contenu, nouveaux
   domaines gratuits. Spike d'abord : rendre une vraie fiche mémoire de bout en bout.
2. App-modules derrière un registre — Todo puis Menuiserie.
3. Facettes / recherche transverses.
