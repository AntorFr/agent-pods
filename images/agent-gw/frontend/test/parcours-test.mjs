// {% parcours %} — l'ancre, la projection, le décodage et les refus.
// Le rendu peint (tuiles, pastilles) demande un DOM : il est couvert par le
// test node du GPX côté serveur et par l'œil. Ici on prouve ce qui se prouve
// sans navigateur — et surtout que le fichier de parcours ne peut RIEN exécuter.
// Run: node test/parcours-test.mjs
import Markdoc from '@markdoc/markdoc';
import { renderPage } from '../src/render.js';
import { config } from '../src/blocks.js';
import { decode } from '../src/parcours.js';

const checks = [];
const check = (name, pass) => checks.push([name, pass]);
const r = (body) => renderPage(body, { baseDir: 'domaines/voyages/baden-2026' });

/* ── le bloc : une ancre, pas un dessin ──────────────────────────────── */
const p = r('{% parcours source="assets/vannes.parcours.json" /%}');
check('pas d\'erreur de schéma', p.errors.length === 0);
check('rend une ancre .parcours', p.html.includes('class="parcours"'));
check('le chemin est résolu contre le dossier de la fiche',
  p.html.includes('data-src="/api/memory/raw/domaines/voyages/baden-2026/assets/vannes.parcours.json"'));
// L'ancre ne doit porter AUCUNE géométrie : c'est tout le propos (cf. PARCOURS.md).
check('l\'ancre ne porte aucune coordonnée', !/\d{2}\.\d{4}/.test(p.html));
check('l\'ancre est légère (moins de 200 octets)', p.html.length < 200);

const abs = r('{% parcours source="/api/memory/raw/x/y.parcours.json" /%}');
check('un chemin absolu passe intact', abs.html.includes('data-src="/api/memory/raw/x/y.parcours.json"'));

// ⚠️ `renderPage` ne remonte que les erreurs de niveau `critical` ; Markdoc
// classe l'attribut manquant et l'attribut inconnu en `error`. Ils ne sont donc
// PAS visibles dans `.errors` — on vérifie le comportement réel, pas celui
// qu'on aimerait. La validation de schéma elle-même est testée juste après.
const sans = r('{% parcours /%}');
check('source manquante — la fiche rend quand même (pas de plantage)',
  sans.html.includes('il manque'));
check('source manquante — aucune ancre à charger', !sans.html.includes('data-src'));

const inconnu = r('{% parcours source="a.json" fond="satellite" /%}');
check('un attribut hors vocabulaire est jeté du rendu', !inconnu.html.includes('satellite'));

const niveaux = (src) => Markdoc.validate(Markdoc.parse(src), config).map((e) => e.error.id);
check('le schéma signale bien la source manquante',
  niveaux('{% parcours /%}').includes('attribute-missing-required'));
check('le schéma signale bien l\'attribut inconnu',
  niveaux('{% parcours source="a.json" fond="sat" /%}').includes('attribute-undefined'));

/* ── le décodeur : il doit rendre EXACTEMENT ce que le hub a encodé ──── */
// Encodeur de référence, réécrit depuis l'algorithme : un bug partagé avec le
// décodeur passerait autrement inaperçu.
const chunk = (d0) => {
  let d = d0 < 0 ? ~(d0 << 1) : (d0 << 1);
  let s = '';
  while (d >= 0x20) { s += String.fromCharCode((0x20 | (d & 0x1f)) + 63); d >>= 5; }
  return s + String.fromCharCode(d + 63);
};
const encodePath = (pts) => {
  let plat = 0; let plng = 0; let s = '';
  for (const [lat, lng] of pts) {
    const ilat = Math.round(lat * 1e5); const ilng = Math.round(lng * 1e5);
    s += chunk(ilat - plat) + chunk(ilng - plng);
    plat = ilat; plng = ilng;
  }
  return s;
};
const encodeSerie = (vals) => {
  let prev = 0; let s = '';
  for (const v of vals) { const c = Math.round(v); s += chunk(c - prev); prev = c; }
  return s;
};

const PTS = [[47.65356, -2.75921], [47.6546605, -2.758024], [47.6559693, -2.7570677],
  [-33.8688, 151.2093], [0, 0]];
const got = decode(encodePath(PTS));
check('le décodage rend autant de points', got.length === PTS.length);
check('aucun point ne dérive au-delà de l\'arrondi (1e-5°)',
  PTS.every(([a, b], i) => Math.abs(a - got[i][0]) < 1e-5 && Math.abs(b - got[i][1]) < 1e-5));
check('les latitudes sud et longitudes est passent (signes négatifs)',
  Math.abs(got[3][0] + 33.8688) < 1e-5 && Math.abs(got[3][1] - 151.2093) < 1e-5);

const ALT = [4, 4, 12, 118, 3, 0, 1201];
const alts = decode(encodeSerie(ALT), 1, 1).map((v) => v[0]);
check('les altitudes reviennent en mètres entiers', JSON.stringify(alts) === JSON.stringify(ALT));

check('une chaîne vide ne rend rien plutôt que de boucler', decode('').length === 0);
check('aucun NaN dans un décodage nominal', !got.flat().some((v) => Number.isNaN(v)));

/* ── rapport ─────────────────────────────────────────────────────────── */
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? '✓' : '✗'} ${name}`); if (!pass) ok = false; }
console.log(`\n${checks.filter((c) => c[1]).length}/${checks.length}`);
if (!ok) { console.error('PARCOURS TEST FAILED'); process.exit(1); }
console.log('PARCOURS OK');
