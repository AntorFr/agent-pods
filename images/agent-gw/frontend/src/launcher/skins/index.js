/* Registre des skins — l'habillage d'un corps.
   ═══════════════════════════════════════════════════════════════════════════

   Les images sont agent-agnostiques ; le lanceur l'est désormais aussi. Un skin
   décrit UNIQUEMENT ce qui change d'un corps à l'autre. Tout le reste — chat,
   mémoire, fiches, réglages, bouclier — est partagé et ne se duplique jamais.

   AJOUTER UN THÈME, en trois gestes :
     1. `skins/<id>.js`  → une fabrique `(api) => skin` (contrat ci-dessous) ;
     2. `skins/<id>.css` → ses jetons, scopés `:root[data-agent="<id>"]` ;
     3. une ligne ici (`FACTORIES`) et une dans `skins/themes.css`.
   Puis `GW_THEME=<id>` sur le pod. Rien d'autre à toucher.

   POURQUOI UNE FABRIQUE ET PAS UN IMPORT CROISÉ : le skin a besoin des primitives
   du lanceur (`page`, `crumbs`, `esc`…) qui vivent dans `main.js`, lequel importe
   le registre. Un import circulaire marcherait en ESM mais dépend de l'ordre
   d'initialisation — fragile et pénible à déboguer. On injecte donc un `api`
   explicite : la dépendance est visible, testable, et unidirectionnelle.

   LE CONTRAT — tous les champs sont optionnels, l'absence = comportement d'Alfred :

     id            string    identifiant, = la valeur de GW_THEME
     brand         string    nom affiché dans la coque
     title         string    titre du document (onglet)
     placeholder   string    invite du composeur
     idleLabel     string    infobulle du témoin d'activité au repos
     busyLabel     string    libellé affiché pendant qu'un tour tourne
     busyNode      () => Node|null   témoin de travail ; null ⇒ les trois points
     console       (api, info) => Node|null   bandeau d'état, inséré en tête de la
                             colonne apps ; `info` = la réponse de /api/version
     home          () => void        rendu de la racine ; absent ⇒ accueil d'Alfred
     routes        { [préfixe]: (reste) => void }   routes propres au skin, testées
                             AVANT les routes communes. Une clé « repos » attrape
                             `#/repos` ; une clé « repo/ » attrape `#/repo/<x>` et
                             reçoit `<x>`.
*/

import createSkippy from './skippy.js';

const FACTORIES = {
  skippy: createSkippy,
};

/** Le skin neutre : aucun champ, donc tout retombe sur le comportement d'Alfred.
    Alfred n'est pas « un skin parmi d'autres » par accident — c'est le socle, et
    le garder implicite garantit qu'un pod existant ne bouge pas d'un pixel. */
const NEUTRAL = { id: 'alfred' };

export function resolveSkin(id, api) {
  const make = FACTORIES[id];
  if (!make) return NEUTRAL;
  try {
    return { ...NEUTRAL, ...make(api), id };
  } catch (e) {
    // Un skin cassé ne doit jamais rendre la PWA inutilisable : on retombe sur
    // le socle et on le dit dans la console du navigateur.
    console.error('skin « ' + id +' » ignoré :', e);
    return NEUTRAL;
  }
}

export function knownSkins() {
  return Object.keys(FACTORIES);
}
