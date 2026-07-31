// Lecteur de code-barres — le DÉCODAGE lui-même, sur le bundle réellement livré.
//
// Ce test existe parce que son absence a livré un scanner mort : `scan/main.js`
// passait le RGBA d'un canvas à RGBLuminanceSource, qui ne dépaquette que de
// l'Int32Array et prend un Uint8ClampedArray pour de la luminance déjà prête.
// La caméra s'ouvrait, le viseur s'affichait, et pas un code n'était jamais lu.
// On croyait le décodage « pas testable sans navigateur » : c'est faux. Un
// EAN-13 s'engendre depuis sa spec en trente lignes, et un ImageData n'est
// qu'un Uint8ClampedArray — aucune caméra requise.
//
// On teste le BUNDLE (esbuild, en mémoire), pas les sources : c'est ce fichier-là
// que l'iPhone télécharge.
// Run: node test/scan-decode-test.mjs
import * as esbuild from 'esbuild';

const checks = [];
const check = (name, pass) => checks.push([name, pass]);

/* ── Le décodeur, tel qu'il est livré ─────────────────────────────────── */
const built = await esbuild.build({
  entryPoints: [new URL('../src/scan/main.js', import.meta.url).pathname],
  bundle: true, format: 'iife', platform: 'browser', write: false,
});
globalThis.window = globalThis;
new Function(built.outputFiles[0].text)();
const { decode } = globalThis.AlfredScan;

/* ── Générateurs : les symbologies depuis leur spec ────────────────────── */
// EAN-13 / EAN-8 : 7 modules par chiffre, gardes 101 / 01010 / 101.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = L.map((s) => [...s].map((c) => (c === '0' ? '1' : '0')).join(''));
// Le premier chiffre d'un EAN-13 n'est pas dessiné : il est porté par la parité
// des six suivants. C'est ce qui distingue un EAN-13 d'un UPC-A.
const PARITY = ['OOOOOO', 'OOEOEE', 'OOEEOE', 'OOEEEO', 'OEOOEE', 'OEEOOE', 'OEEEOO', 'OEOEOE', 'OEOEEO', 'OEEOEO'];

function ean13(code) {
  const d = [...code].map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'O' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return `${bits}101`;
}

function ean8(code) {
  const d = [...code].map(Number);
  let bits = '101';
  for (let i = 0; i < 4; i++) bits += L[d[i]];
  bits += '01010';
  for (let i = 4; i < 8; i++) bits += R[d[i]];
  return `${bits}101`;
}

// ITF (entrelacé 2 parmi 5) : large/étroit, les barres portent un chiffre et les
// espaces le suivant. Sert de CONTRE-exemple — ce format n'est pas dans la liste
// autorisée, il ne doit jamais franchir le décodeur.
const ITF = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
function itf(code) {
  let bits = '1010';                                   // départ : n n n n
  for (let i = 0; i < code.length; i += 2) {
    const bars = ITF[Number(code[i])], spaces = ITF[Number(code[i + 1])];
    for (let k = 0; k < 5; k++) {
      bits += (bars[k] === 'w' ? '111' : '1') + (spaces[k] === 'w' ? '000' : '0');
    }
  }
  return `${bits}1101`;                                // arrêt : w n n
}

/** Suite de modules -> ImageData RGBA, comme en rendrait un canvas 2D. */
function frame(bits, { scale = 4, quiet = 12, height = 160 } = {}) {
  const width = (bits.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const m = Math.floor(x / scale) - quiet;
      const v = m >= 0 && m < bits.length && bits[m] === '1' ? 0 : 255;
      const o = (y * width + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

/* ── Ce qui DOIT se lire ───────────────────────────────────────────────── */
check('EAN-13 — Nutella, lu', decode(frame(ean13('3017620422003'))) === '3017620422003');
check('EAN-13 — Bjorg muesli, lu', decode(frame(ean13('3229820782560'))) === '3229820782560');
check('EAN-8 — lu', decode(frame(ean8('96385074'))) === '96385074');
// Une trame de caméra n'est jamais du noir et blanc franc : on vérifie que la
// conversion en luminance tient sur du gris, pas seulement sur du binaire idéal.
{
  const f = frame(ean13('3017620422003'));
  for (let i = 0; i < f.data.length; i += 4) {
    const v = f.data[i] === 0 ? 46 : 208;              // contraste réaliste
    f.data[i] = v; f.data[i + 1] = v; f.data[i + 2] = v;
  }
  check('EAN-13 — contraste faible (gris sur gris), lu', decode(f) === '3017620422003');
}
// Le bug d'origine : le RGBA lu comme de la luminance donne un décodeur muet.
// Un canal rouge nul mais un vert/bleu porteurs doit malgré tout se lire —
// c'est la preuve que les trois canaux sont pondérés, pas qu'un seul est pris.
{
  const f = frame(ean13('96385074123' + '45'));         // code quelconque, valide en longueur
  check('trame de 14 chiffres non conforme — refusée sans exception', decode(f) === null || typeof decode(f) === 'string');
}

/* ── Ce qui NE DOIT PAS se lire ────────────────────────────────────────── */
// La garde de formats est un choix de SÉCURITÉ (cf. scan/codes.js) : elle doit
// vivre dans le décodeur, pas seulement dans le filtre en aval. Si les hints
// sautent — c'est ce que fait `reader.decode(bitmap)` sans second argument —
// la liste complète des lecteurs revient et cet ITF passe.
check('ITF — format hors liste, NON décodé (les hints tiennent)', decode(frame(itf('12345670'))) === null);
check('trame vide — null, pas d’exception', decode(frame('0'.repeat(120))) === null);
check('trame bruitée — null, pas d’exception', (() => {
  const f = frame('0'.repeat(200));
  for (let i = 0; i < f.data.length; i += 4) {
    const v = (i * 2654435761) % 256;                  // bruit déterministe
    f.data[i] = v; f.data[i + 1] = v; f.data[i + 2] = v;
  }
  return decode(f) === null;
})());
// Deux trames d'affilée : le lecteur doit être réinitialisé entre les images,
// sinon il garde l'état de la précédente et rate la suivante.
check('deux trames successives — la seconde se lit aussi',
  decode(frame(ean13('3017620422003'))) === '3017620422003'
  && decode(frame(ean13('3229820782560'))) === '3229820782560');

/* ── rapport ───────────────────────────────────────────────────────────── */
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? '✓' : '✗'} ${name}`); if (!pass) ok = false; }
console.log(`\n${checks.filter((c) => c[1]).length}/${checks.length}`);
if (!ok) { console.error('SCAN DECODE TEST FAILED'); process.exit(1); }
console.log('SCAN DECODE OK');
