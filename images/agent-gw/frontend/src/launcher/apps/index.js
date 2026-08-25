/* Registre des app-modules — ce que le lanceur sait OUVRIR.
   ═══════════════════════════════════════════════════════════════════════════

   Symétrique du registre des skins, et la symétrie est le propos : un skin dit à
   quoi un corps RESSEMBLE, une app dit ce qu'il sait FAIRE. Les deux axes se sont
   mélangés une fois — la vue `repos` déclarée en `routes` par le skin Skippy,
   donc invisible sous tout autre thème alors que son API répondait partout. Le
   contrat de skin a perdu `routes` ; c'est ici qu'elles vivent.

   ⚠️ CE FICHIER NE NOMME PLUS AUCUNE APP. Les vues sont DÉCOUVERTES sous
   `plugins/<id>/web/app.js` et ramassées au build par `build/registry.mjs`.
   C'est la même propriété que côté corps (`app/plugins.py`) : ni le lanceur ni la
   gateway ne connaissent un plugin par son nom, ce qui est la seule façon d'en
   déposer un venu d'un autre dépôt.

   AJOUTER UNE VUE, en deux gestes :
     1. `plugins/<id>/web/app.js`  → une fabrique `(api) => ({ routes: {…} })` ;
        `plugins/<id>/web/app.css` → ses règles, importées depuis `app.js` ;
     2. la clé `vue` de son `gw-plugin.json` → `{ label, ico, color }` pour la tuile.
   Puis `<id>` dans `GW_APPS` sur le pod. Rien à enregistrer nulle part.

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

   ⚠️ ET SEULEMENT PAR LÀ. Écrire `page` tout court dans une vue n'est pas un
   raccourci vers la même chose : c'est une variable libre, donc une globale. Le
   bundle range tous les modules dans UN scope, si bien qu'un build non minifié
   la fait tomber sur la liaison de `main.js` et l'écran s'affiche — pendant que
   le build LIVRÉ, minifié, renomme cette liaison et jette `ReferenceError` au
   premier rendu. `atelier` et `voyages` ont passé cinq jours en écran blanc
   ainsi, après être sorties de `main.js` le 2026-08-20. Il manque une primitive ?
   On l'AJOUTE à `EXT_API`, délibérément. `test/plugin-globals-test.mjs` minifie
   chaque vue, chaque bloc et chaque skin, et refuse tout nom déclaré par le
   lanceur.

   ⚠️ Les cinq modules historiques (`todo`, `projets`, `atelier`, `planif`,
   `voyages`) vivent encore dans `main.js`. On les déplace quand on y touche de
   toute façon, pas pour la symétrie — décision tenue depuis l'extraction de
   `repos`. */

import { FABRIQUES, TUILES } from './registry.generated.js';

/** Instancie toutes les vues découvertes. Une fabrique qui jette n'emporte pas
    les autres : le lanceur perd une vue, pas la page. */
export function resolveApps(api) {
  const out = {};
  for (const [id, make] of Object.entries(FABRIQUES)) {
    try {
      out[id] = make(api);
    } catch (e) {
      console.error('app « ' + id + ' » ignorée :', e);
    }
  }
  return out;
}

/** Les tuiles déclarées par les plugins, fusionnées dans `APP_META` par le
    lanceur. Une vue sans clé `vue` n'a pas de tuile — elle reste atteignable par
    sa route, ce qui est le cas d'une vue de détail. */
export function appTiles() {
  return TUILES;
}
