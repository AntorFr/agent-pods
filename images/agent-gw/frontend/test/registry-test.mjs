/* Le registre des vues de plugin — ce qui remplace une liste en dur.
   ═══════════════════════════════════════════════════════════════════════════
   Ce banc tient la propriété qui fait tout l'intérêt du mécanisme : le lanceur
   ne connaît AUCUNE vue par son nom. Elle se casse en silence — il suffit qu'un
   `import` de complaisance revienne dans `apps/index.js` pour que le dossier
   `plugins/` redevienne décoratif, sans qu'aucun écran ne bronche.

   Sans réseau, sans navigateur. Lancer depuis frontend :  node test/registry-test.mjs */

import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scanner, rendre } from '../build/registry.mjs';

let ko = 0;
const check = (nom, cond) => {
  console.log((cond ? '✓ ' : '✗ ') + nom);
  if (!cond) ko++;
};

/* ── La découverte, sur une arborescence fabriquée ────────────────────── */

const racine = mkdtempSync(join(tmpdir(), 'plugins-'));
const poser = (id, opts = {}) => {
  mkdirSync(join(racine, id, 'web'), { recursive: true });
  if (opts.vue !== false) writeFileSync(join(racine, id, 'web', 'app.js'), 'export default () => ({});');
  if (opts.manifeste !== false) {
    writeFileSync(join(racine, id, 'gw-plugin.json'), JSON.stringify(opts.manifeste || { id, kind: 'app' }));
  }
};

poser('avec-tuile', { manifeste: { id: 'avec-tuile', kind: 'app', vue: { label: 'Avec', ico: '🛰️', color: 'proj' } } });
poser('sans-tuile');                    // une vue, pas de tuile : atteignable par sa route
mkdirSync(join(racine, 'sans-vue'));    // un plugin de contrat pur (fiches, git)
writeFileSync(join(racine, 'sans-vue', 'gw-plugin.json'), '{"id":"sans-vue","kind":"socle"}');
poser('manifeste-casse', { manifeste: false });

const vues = scanner(racine);
const ids = vues.map((v) => v.id);

check('les plugins porteurs d’une vue sont trouvés',
  ids.includes('avec-tuile') && ids.includes('sans-tuile'));
check('un plugin SANS web/app.js n’est pas une vue (fiches, git ne sont pas des écrans)',
  !ids.includes('sans-vue'));
check('un manifeste illisible ne fait pas perdre la vue — elle passe sans tuile',
  ids.includes('manifeste-casse')
  && vues.find((v) => v.id === 'manifeste-casse').tuile === null);
check('ordre stable (un diff de registre doit rester lisible)',
  JSON.stringify(ids) === JSON.stringify([...ids].sort()));
check('une racine absente rend un registre vide, jamais une exception',
  scanner(join(racine, 'nexiste-pas')).length === 0);

/* ── Le rendu ─────────────────────────────────────────────────────────── */

const code = rendre(vues);
check('chaque vue est importée depuis plugins/<id>/web/app.js',
  code.includes("from '../../../../plugins/avec-tuile/web/app.js'")
  && code.includes("from '../../../../plugins/sans-tuile/web/app.js'"));
check('seules les vues déclarant `vue` posent une tuile',
  code.includes('"avec-tuile": {') && !/"sans-tuile":\s*\{"label/.test(code));
check('une tuile de plugin est un MODULE du lanceur (pas un domaine de mémoire)',
  /"avec-tuile":\s*\{[^}]*"module":true/.test(code));

/* ── La propriété à ne pas casser ─────────────────────────────────────── */

const INDEX = readFileSync(resolve('src/launcher/apps/index.js'), 'utf8');
check('le registre n’importe QUE le fichier généré (aucune app nommée en dur)',
  (INDEX.match(/^import .*/gm) || []).every((l) => l.includes('registry.generated.js')));

const MAIN = readFileSync(resolve('src/launcher/main.js'), 'utf8');
check('le lanceur ne code plus la tuile d’une vue de plugin en dur',
  !/repos:\s*\{\s*label:/.test(MAIN) && MAIN.includes('appTiles()'));

console.log();
if (ko) { console.log(`${ko} échec(s)`); process.exit(1); }
console.log('REGISTRY OK');
