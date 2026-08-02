/* Registre des app-modules — ce que le lanceur sait OUVRIR.
   ═══════════════════════════════════════════════════════════════════════════

   Symétrique du registre des skins, et la symétrie est le propos : un skin dit à
   quoi un corps RESSEMBLE, une app dit ce qu'il sait FAIRE. Les deux axes se sont
   mélangés une fois — la vue `repos` déclarée en `routes` par le skin Skippy,
   donc invisible sous tout autre thème alors que son API répondait partout. Le
   contrat de skin a perdu `routes` ; c'est ici qu'elles vivent.

   AJOUTER UNE APP, en quatre gestes :
     1. `apps/<id>.js`   → une fabrique `(api) => { routes: {…} }` ;
     2. `apps/<id>.css`  → ses règles, si elle en a, importée depuis `<id>.js` ;
     3. une ligne ici (`FACTORIES`) ;
     4. une entrée dans `APP_META` (main.js) pour la tuile.
   Puis `<id>` dans `GW_APPS` sur le pod. Rien d'autre à toucher.

   LE CONTRAT :
     routes  { [préfixe]: (reste) => void }
             Une clé « repos » attrape `#/repos` ; une clé « repo/ » attrape
             `#/repo/<x>` et reçoit `<x>` décodé. Les routes d'une app ne sont
             consultées QUE si `appOn(<id>)` — un module éteint perd sa tuile ET
             sa route, sans quoi un marque-page ressusciterait un écran absent.

   POURQUOI UNE FABRIQUE ET PAS UN IMPORT CROISÉ : comme pour les skins, la vue a
   besoin des primitives du lanceur (`page`, `crumbs`, `esc`, `headers`) qui
   vivent dans `main.js`, lequel importe ce registre. On injecte donc un `api`
   explicite : dépendance visible, testable, unidirectionnelle.

   ⚠️ Les quatre autres modules (`todo`, `projets`, `atelier`, `planif`,
   `voyages`) vivent encore dans `main.js`. Ce registre naît avec `repos` et les
   accueillera au fil de l'eau — on ne déplace pas deux mille lignes pour la
   symétrie, on les déplace quand on y touche de toute façon. */

import createRepos from './repos.js';

const FACTORIES = {
  repos: createRepos,
};

/** Instancie toutes les apps connues. Une fabrique qui jette n'emporte pas les
    autres : le lanceur perd une vue, pas la page. */
export function resolveApps(api) {
  const out = {};
  for (const [id, make] of Object.entries(FACTORIES)) {
    try {
      out[id] = make(api);
    } catch (e) {
      console.error('app « ' + id + ' » ignorée :', e);
    }
  }
  return out;
}

export function knownApps() {
  return Object.keys(FACTORIES);
}
