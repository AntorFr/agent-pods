/* Ce qu'un plugin emprunte au lanceur passe par `api` — ou ne passe pas.
   ═══════════════════════════════════════════════════════════════════════════

   LE BUG QUE CE BANC AURAIT ÉVITÉ, et qu'aucun autre ne pouvait voir.

   Le 2026-08-20, les vues `atelier` et `voyages` ont quitté `launcher/main.js`
   pour leur plugin. Elles y référençaient `page`, `IC`, `memInfo`, `memIndex` —
   des liaisons de module, parfaitement légitimes tant qu'on était DEDANS. Une
   fois dehors, ce sont des variables libres, c'est-à-dire des globales.

   Ça n'a rien cassé sur le moment, et c'est toute la leçon : esbuild concatène
   tous les modules dans UN scope. Sans `--minify`, la liaison de `main.js` garde
   son nom, la référence libre du plugin tombe dessus, et l'écran s'affiche. Le
   build qu'on LIVRE, lui, minifie : `page` devient `Le`, la référence libre ne
   suit pas, et le premier rendu jette `ReferenceError: page is not defined` —
   fil d'Ariane correct, écran blanc, cinq jours sans que personne le voie.

   Aucun banc ne minifie. Celui-ci le fait, et il ne compte sur aucun lexeur
   maison : `--define:<nom>=…` ne remplace QUE les références libres (esbuild
   laisse intact ce qu'une portée locale lie). On définit donc chaque nom déclaré
   au premier niveau de `main.js`, et on cherche la balise dans la sortie. Zéro
   faux positif possible : une chaîne, un nom de propriété, un `const` local du
   plugin ne bougent pas.

   La liste des noms interdits est DÉRIVÉE de `main.js`, jamais recopiée : une
   primitive ajoutée au lanceur entre dans la garde le jour même.

   Sans réseau, sans navigateur. Lancer depuis frontend :  node test/plugin-globals-test.mjs */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

let ko = 0;
const check = (nom, cond, detail) => {
  console.log((cond ? '✓ ' : '✗ ') + nom);
  if (!cond) { ko++; if (detail) console.log('    ' + detail); }
};

const FRONTEND = resolve('.');
const PLUGINS = resolve(FRONTEND, '..', 'plugins');
const SKINS = resolve(FRONTEND, '..', 'skins');

/* ── Les noms du lanceur, dérivés de sa source ────────────────────────── */
// Premier niveau seulement : ce sont les seules liaisons qu'un module extrait de
// `main.js` pouvait référencer sans s'en rendre compte.
const MAIN = readFileSync(join(FRONTEND, 'src', 'launcher', 'main.js'), 'utf8');
const NOMS = [...new Set(
  [...MAIN.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1]),
)];

check('les noms interdits sont dérivés de main.js, pas recopiés',
  NOMS.length > 50 && NOMS.includes('page') && NOMS.includes('memInfo'),
  `${NOMS.length} nom(s) relevés`);

const BALISE = (nom) => `__GW_FUITE_${nom.replace(/\$/g, 'S')}__`;
const DEFINE = Object.fromEntries(NOMS.map((n) => [n, JSON.stringify(BALISE(n))]));

/* ── Les modules qu'un plugin ou un skin livre au navigateur ──────────── */
function modules() {
  const out = [];
  const ajoute = (racine, id, ...rel) => {
    const p = join(racine, id, ...rel);
    try { if (statSync(p).isFile()) out.push({ id, chemin: p, rel: [id, ...rel].join('/') }); } catch {}
  };
  const dossiers = (racine) => { try { return readdirSync(racine).sort(); } catch { return []; } };
  // Les mêmes conventions que `build/registry.mjs` : ce que le build ramasse est
  // exactement ce que ce banc inspecte, sans seconde liste à tenir d'accord.
  for (const id of dossiers(PLUGINS)) {
    for (const f of ['app.js', 'blocks.js', 'chrome.js']) ajoute(PLUGINS, id, 'web', f);
  }
  for (const id of dossiers(SKINS)) ajoute(SKINS, id, 'skin.js');
  return out;
}

const MODULES = modules();
check('des modules de plugin/skin sont trouvés à inspecter',
  MODULES.length >= 5, MODULES.map((m) => m.rel).join(', '));

/* ── La garde ─────────────────────────────────────────────────────────── */
for (const m of MODULES) {
  let sortie;
  try {
    const r = await build({
      entryPoints: [m.chemin],
      bundle: true,
      write: false,
      format: 'esm',
      // Minifier n'est PAS un détail de confort ici : c'est la seule
      // configuration où une référence libre cesse de tomber par accident sur
      // la liaison homonyme d'un autre module du bundle.
      minify: true,
      define: DEFINE,
      logLevel: 'silent',
      loader: { '.css': 'empty' },
    });
    sortie = r.outputFiles.map((f) => f.text).join('\n');
  } catch (e) {
    check(`${m.rel} — se construit`, false, String(e.message || e).split('\n')[0]);
    continue;
  }
  const fuites = NOMS.filter((n) => sortie.includes(BALISE(n)));
  check(`${m.rel} — n’emprunte rien au lanceur hors de son \`api\``,
    fuites.length === 0,
    fuites.length
      ? `variable(s) libre(s) : ${fuites.join(', ')} — passer par \`api\` (cf. le contrat en tête de apps/index.js)`
      : '');
}

console.log();
if (ko) { console.log(`${ko} échec(s)`); process.exit(1); }
console.log('PLUGIN GLOBALS OK');
