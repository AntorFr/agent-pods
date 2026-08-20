/* Génère le registre des vues de plugin, lu par `apps/index.js`.
   ═══════════════════════════════════════════════════════════════════════════

   POURQUOI UN FICHIER GÉNÉRÉ, et pas une découverte à l'exécution : esbuild
   assemble UN bundle, à la construction de l'image. Un `import()` dynamique sur
   un chemin calculé ne se résout pas — il faudrait servir le JS du plugin à part
   et l'exécuter depuis le navigateur, c'est-à-dire charger du code hors bundle
   dans une page qui porte la session. On ramasse donc au BUILD : le plugin entre
   dans le même tag d'image que le moteur qui l'affiche, exactement comme son
   contrat de format entre dans le même tag que le code qui le lit.

   CE QU'ON RAMASSE — la convention, et rien à déclarer ailleurs :

     plugins/<id>/web/app.js    la fabrique `(api) => ({ routes: {…} })`
     plugins/<id>/web/app.css   ses règles, importées depuis app.js
     plugins/<id>/gw-plugin.json   sa tuile, sous la clé `vue`

   Un plugin sans `web/app.js` n'apporte pas de vue : ce n'est pas une erreur,
   c'est le cas de `fiches` (un contrat) ou de `git` (un outil).

   ⚠️ Le fichier produit est dans `.gitignore`. Le régénérer fait partie du build
   ET du banc (`npm test`) : un registre périmé donnerait des tests verts sur un
   monde qui n'existe plus. */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(ICI, '..');
const PLUGINS = resolve(FRONTEND, '..', 'plugins');
const SORTIE = join(FRONTEND, 'src', 'launcher', 'apps', 'registry.generated.js');

/** Les plugins qui apportent une vue, triés — ordre stable = diff lisible. */
export function scanner(racine = PLUGINS) {
  const vues = [];
  let dossiers;
  try {
    dossiers = readdirSync(racine).sort();
  } catch {
    return vues; // pas de plugins/ : on rend un registre vide, pas une erreur
  }
  for (const id of dossiers) {
    const base = join(racine, id);
    try {
      if (!statSync(base).isDirectory()) continue;
      statSync(join(base, 'web', 'app.js'));
    } catch {
      continue; // ni dossier, ni vue
    }
    let manifeste = {};
    try {
      manifeste = JSON.parse(readFileSync(join(base, 'gw-plugin.json'), 'utf8'));
    } catch {
      // Un manifeste illisible n'est pas une raison de perdre la vue : le banc
      // Python le signale déjà, et le corps l'ignorera de son côté.
    }
    vues.push({ id, tuile: manifeste.vue || null });
  }
  return vues;
}

export function rendre(vues) {
  const imports = vues
    .map((v, i) => `import vue${i} from '../../../../plugins/${v.id}/web/app.js';`)
    .join('\n');
  const fabriques = vues.map((v, i) => `  ${JSON.stringify(v.id)}: vue${i},`).join('\n');
  const tuiles = vues
    .filter((v) => v.tuile)
    // `module: true` est implicite : une vue de plugin EST un module du lanceur,
    // c'est ce qui la distingue d'un domaine de mémoire dans la mosaïque.
    .map((v) => `  ${JSON.stringify(v.id)}: ${JSON.stringify({ ...v.tuile, module: true })},`)
    .join('\n');

  return `/* GÉNÉRÉ par build/registry.mjs — ne pas éditer, ne pas versionner.
   Source : plugins/<id>/web/app.js + la clé \`vue\` de leur gw-plugin.json. */
${imports}

export const FABRIQUES = {
${fabriques}
};

export const TUILES = {
${tuiles}
};
`;
}

/** Écrit le registre. Appelé quand ce fichier est LANCÉ, pas quand il est importé :
    le banc importe `scanner`/`rendre` pour les éprouver, et un import qui réécrit un
    fichier du dépôt au passage est un effet de bord qu'on finit par payer. */
export function generer() {
  const vues = scanner();
  mkdirSync(dirname(SORTIE), { recursive: true });
  writeFileSync(SORTIE, rendre(vues), 'utf8');
  return vues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const vues = generer();
  console.log(
    `registre des vues : ${vues.length} plugin(s) — ${vues.map((v) => v.id).join(', ') || 'aucun'}`,
  );
}
