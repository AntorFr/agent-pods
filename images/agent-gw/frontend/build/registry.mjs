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
const SORTIE_VUES = join(FRONTEND, 'src', 'launcher', 'apps', 'registry.generated.js');
// ⚠️ DEUX registres, et ce n'est pas de la symétrie gratuite : les vues entrent
// dans le bundle du LANCEUR, les blocs dans celui du MOTEUR. Un seul fichier
// ferait entrer `carte.js` (1094 lignes) et ses styles dans le lanceur, qui n'en
// a que faire — un import CSS a un effet de bord, le tree-shaking ne l'enlève pas.
const SORTIE_BLOCS = join(FRONTEND, 'src', 'blocks.generated.js');
// Les feuilles des blocs, à part. Elles ne peuvent PAS voyager avec le module :
// les bancs importent le moteur dans node, qui n'a pas de chargeur CSS. Ce
// fichier-ci n'est importé que par `src/main.js`, l'entrée d'esbuild.
const SORTIE_STYLES = join(FRONTEND, 'src', 'blocks.styles.generated.js');

/** Les plugins qui apportent `web/<fichier>`, triés — ordre stable = diff lisible.
    `app.js` donne une vue du lanceur, `blocks.js` des blocs du moteur. */
export function scanner(racine = PLUGINS, fichier = 'app.js') {
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
      statSync(join(base, 'web', fichier));
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

export function rendre(vues, { fichier = 'app.js', profondeur = 4 } = {}) {
  const remonte = '../'.repeat(profondeur);
  const imports = vues
    .map((v, i) => `import vue${i} from '${remonte}plugins/${v.id}/web/${fichier}';`)
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
  const vues = scanner(PLUGINS, 'app.js');
  mkdirSync(dirname(SORTIE_VUES), { recursive: true });
  writeFileSync(SORTIE_VUES, rendre(vues, { fichier: 'app.js', profondeur: 4 }), 'utf8');

  // `src/blocks.generated.js` est deux crans moins profond que
  // `src/launcher/apps/…`, d'où la profondeur explicite.
  const blocs = scanner(PLUGINS, 'blocks.js');
  mkdirSync(dirname(SORTIE_BLOCS), { recursive: true });
  writeFileSync(SORTIE_BLOCS, rendre(blocs, { fichier: 'blocks.js', profondeur: 2 }), 'utf8');

  const feuilles = scanner(PLUGINS, 'blocks.css');
  writeFileSync(SORTIE_STYLES,
    '/* GÉNÉRÉ par build/registry.mjs — les feuilles des blocs de plugin.\n'
    + "   Importé par src/main.js SEULEMENT : node n'a pas de chargeur CSS. */\n"
    + feuilles.map((f) => `import '../../plugins/${f.id}/web/blocks.css';`).join('\n')
    + '\n', 'utf8');

  return { vues, blocs, feuilles };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { vues, blocs } = generer();
  const dire = (quoi, l) => `${quoi} : ${l.length} plugin(s) — ${l.map((v) => v.id).join(', ') || 'aucun'}`;
  console.log(dire('registre des vues ', vues));
  console.log(dire('registre des blocs', blocs));
}
