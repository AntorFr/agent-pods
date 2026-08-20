/* Registre des skins — l'habillage d'un corps.
   ═══════════════════════════════════════════════════════════════════════════

   Les images sont agent-agnostiques ; le lanceur l'est désormais aussi. Un skin
   décrit UNIQUEMENT ce qui change d'un corps à l'autre. Tout le reste — chat,
   mémoire, fiches, réglages, bouclier — est partagé et ne se duplique jamais.

   AJOUTER UN THÈME, en trois gestes :
     1. `skins/<id>.js`  → une fabrique `(api) => skin` (contrat ci-dessous) ;
     2. `skins/<id>.css` → ses jetons, scopés `:root[data-agent="<id>"]` — et RIEN
        d'autre. Le contrat CSS complet (la liste des jetons, et pourquoi une
        feuille de thème n'a pas le droit d'écrire une règle) est en tête de
        `launcher.css` ; `test/theme-lint.mjs` le fait respecter au build ;
   ⚠️ CE FICHIER NE NOMME PLUS AUCUN SKIN. Ils vivent dans `skins/<id>/`, un arbre
   FRÈRE de `plugins/` — même principe de découverte, objet différent : un plugin
   AJOUTE une capacité et plusieurs sont actifs ; un skin HABILLE, et il n'y en a
   qu'un. Les confondre aurait demandé une sorte de plugin dont l'axe n'est pas
   une liste mais une valeur, c'est-à-dire une exception qui vide la règle.

   AJOUTER UN THÈME, en trois fichiers et zéro ligne à modifier ailleurs :
     skins/<id>/gw-skin.json  { id, description }
     skins/<id>/skin.js       la fabrique `(api) => skin` (contrat ci-dessous)
     skins/<id>/skin.css      ses jetons, scopés `:root[data-agent="<id>"]`
     skins/<id>/assets/…      icon.svg et manifest.json, servis AVANT le JS
   Puis `GW_THEME=<id>` sur le pod.

   POURQUOI UNE FABRIQUE ET PAS UN IMPORT CROISÉ : le skin a besoin des primitives
   du lanceur (`page`, `crumbs`, `esc`…) qui vivent dans `main.js`, lequel importe
   le registre. Un import circulaire marcherait en ESM mais dépend de l'ordre
   d'initialisation — fragile et pénible à déboguer. On injecte donc un `api`
   explicite : la dépendance est visible, testable, et unidirectionnelle.

   LE CONTRAT — tous les champs sont optionnels, l'absence = comportement d'Alfred :

     id            string    identifiant, = la valeur de GW_THEME
     brand         string    nom affiché dans la coque
     crest         string    markup SVG du blason de l'en-tête. En `currentColor` :
                             le bouton hérite de la couleur du rail. Le FAVICON et
                             le MANIFESTE ne passent PAS par ici — le navigateur les
                             réclame avant tout JavaScript ; ils vivent côté serveur
                             sous `static/skins/<id>/{icon.svg,manifest.json}`.
     title         string    titre du document (onglet)
     placeholder   string    invite du composeur
     idleLabel     string    infobulle du témoin d'activité au repos
     busyLabel     string    libellé affiché pendant qu'un tour tourne
     busyNode      () => Node|null   témoin de travail ; null ⇒ les trois points
     console       (api, info) => Node|null   bandeau d'état, inséré en tête de la
                             colonne apps ; `info` = la réponse de /api/version
     home          () => void        rendu de la racine ; absent ⇒ accueil d'Alfred

   PAS DE `routes`, et c'est délibéré (2026-08-02). Le contrat en acceptait, ce
   qui revenait à loger une APP dans un habillage : la vue `repos` n'existait que
   sous la livrée Skippy, alors que `/api/repos` répond quel que soit le thème et
   que `repos` était déjà un module déclarable. Poser `GW_APPS=repos` sur un pod
   en livrée neutre donnait donc une route morte. Une route est une app : elle
   vit dans la coque, sous `appOn()`. L'accueil reste la seule vue qu'un thème
   fournisse — c'est le seul écran dont la forme EST l'identité du corps.
*/

import { FABRIQUES } from './registry.generated.js';

/** Le repli, quand `GW_THEME` désigne un thème que l'image ne porte pas.
    Vide À DESSEIN : tout retombe alors sur ce que dit `app.html` et sur le
    comportement du socle, c'est-à-dire une PWA parfaitement utilisable. Alfred,
    lui, n'est plus ce repli — il est un skin comme les deux autres, déclaré dans
    `skins/alfred/`. Il l'était par ABSENCE, ce qui rendait un des trois corps
    illisible : on pouvait ouvrir un fichier pour Skippy et Nestor, pas pour lui. */
const NEUTRAL = { id: 'alfred' };

/* Le contrat, en liste BLANCHE — pas en prose seulement.
   La frontière « un thème habille, il ne route pas » était déjà écrite plus haut,
   et elle a dérivé quand même : le skin `skippy` déclarait `routes`, et la vue de
   la flotte s'est retrouvée prisonnière d'une livrée pendant des semaines. Une
   convention que rien ne vérifie n'est pas une convention. On jette donc ce qui
   n'est pas au contrat, et — surtout — on le DIT : un champ silencieusement
   ignoré est une heure perdue à chercher pourquoi « ça ne marche pas ». */
const FIELDS = [
  'brand', 'crest', 'title', 'placeholder',
  'idleLabel', 'busyLabel', 'busyNode', 'console', 'home',
];

export function resolveSkin(id, api) {
  const make = FABRIQUES[id];
  if (!make) return NEUTRAL;
  try {
    const declared = make(api) || {};
    const kept = {}, dropped = [];
    for (const [k, v] of Object.entries(declared)) {
      if (FIELDS.includes(k)) kept[k] = v;
      else dropped.push(k);
    }
    if (dropped.length) {
      console.warn(
        'skin « ' + id + ' » : hors contrat, ignoré(s) — ' + dropped.join(', ')
        + '. Une route est une app, pas un habillage : voir apps/index.js.',
      );
    }
    return { ...NEUTRAL, ...kept, id };
  } catch (e) {
    // Un skin cassé ne doit jamais rendre la PWA inutilisable : on retombe sur
    // le socle et on le dit dans la console du navigateur.
    console.error('skin « ' + id +' » ignoré :', e);
    return NEUTRAL;
  }
}

export function knownSkins() {
  return Object.keys(FABRIQUES);
}
