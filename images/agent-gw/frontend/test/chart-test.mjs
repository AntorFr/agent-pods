// {% graphique %} — parsing, geometry, formatting, and the refusals.
// Run: node test/chart-test.mjs
import { renderPage } from '../src/render.js';

const NNBSP = ' ';
const checks = [];
const check = (name, pass) => checks.push([name, pass]);
const r = (body) => renderPage(body, { baseDir: 'domaines/diy' });
const all = (re, s) => [...s.matchAll(re)];

/* ── barres — le cas nominal ─────────────────────────────────────────── */
const bar = r(`{% graphique type="barres" titre="Coût par place" unite="€" couleur="vert" %}
PAX 150 gainé: 26
IVAR: 17
BROR: 28
{% /graphique %}`);

check('barres — pas d\'erreur de schéma', bar.errors.length === 0);
check('barres — figure + teinte', bar.html.includes('<figure class="chart chart-barres" data-teinte="vert">'));
check('barres — titre en figcaption', bar.html.includes('<figcaption>Coût par place</figcaption>'));
// Les barres sont du HTML : aucun SVG, donc aucun texte mis à l'échelle du viewBox.
check('barres — aucun SVG (le texte ne doit pas rétrécir avec le conteneur)', !bar.html.includes('<svg'));
check('barres — 3 libellés, 3 valeurs, 3 barres',
  all(/class="rlbl"/g, bar.html).length === 3
  && all(/class="rval"/g, bar.html).length === 3
  && all(/<i style="width:/g, bar.html).length === 3);
check('barres — libellé long conservé tel quel', bar.html.includes('<div class="rlbl">PAX 150 gainé</div>'));
check('barres — valeur avec unité collée en espace fine', bar.html.includes(`<div class="rval">26${NNBSP}€</div>`));
check('barres — la plus grande vaut 100 %, les autres au prorata',
  bar.html.includes('width:100.00%') && bar.html.includes(`width:${(17 / 28 * 100).toFixed(2)}%`));
// Le % est le SEUL nombre qui atteint un attribut style : il doit rester purement
// numérique, DOMPurify ne filtrant pas le CSS (mesuré).
check('barres — le style ne contient qu\'un pourcentage numérique',
  all(/style="([^"]*)"/g, bar.html).every((m) => /^width:\d+(\.\d+)?%$/.test(m[1])));

/* ── les trois écritures du corps donnent le même dessin ─────────────── */
const asList = r(`{% graphique %}
- PAX: 26
- IVAR: 17
{% /graphique %}`);
const asPara = r(`{% graphique %}
PAX: 26
IVAR: 17
{% /graphique %}`);
const asFence = r(`{% graphique %}
\`\`\`
PAX: 26
IVAR: 17
\`\`\`
{% /graphique %}`);
check('corps — paragraphe, liste et bloc de code sont équivalents',
  asList.html === asPara.html && asPara.html === asFence.html);

/* ── ligne ───────────────────────────────────────────────────────────── */
const li = r(`{% graphique type="ligne" titre="Poids" unite="kg" %}
janv: 82,4
févr: 81,1
mars: 80,6
avril: 79,8
{% /graphique %}`);
check('ligne — polyligne à 4 points', /class="line" points="([\d.,]+ ){3}[\d.,]+"/.test(li.html));
check('ligne — grille pleine (jamais pointillée)', li.html.includes('class="grid"') && !li.html.includes('stroke-dasharray'));
check('ligne — points marqués r=4 + anneau', all(/class="dot"/g, li.html).length === 4 && li.html.includes('r="4"'));
check('ligne — une seule étiquette de valeur, au bout', all(/class="val"/g, li.html).length === 1
  && li.html.includes(`>79,8${NNBSP}kg</text>`));
check('ligne — graduations en nombres ronds', all(/class="tick"[^>]*>([\d,]+)</g, li.html).length >= 2);
check('ligne — libellés d\'axe ancrés aux bords', li.html.includes('text-anchor="start"') && li.html.includes('text-anchor="end"'));

// Beaucoup de points : pas de forêt de pastilles, pas de forêt d'étiquettes d'axe.
const dense = r(`{% graphique type="ligne" %}\n${Array.from({ length: 30 }, (_, i) => `j${i}: ${50 + (i % 7)}`).join('\n')}\n{% /graphique %}`);
check('ligne dense — une seule pastille (le bout)', all(/class="dot"/g, dense.html).length === 1);
// Les libellés de l'axe x sont ceux posés sous le tracé (y = 14+150+16) ; les
// graduations de l'axe y partagent la classe mais pas cette ordonnée.
check('ligne dense — au plus 6 libellés d\'axe x, premier et dernier compris',
  (() => { const xs = all(/class="tick" x="([\d.]+)" y="180"/g, dense.html);
    return xs.length <= 6 && dense.html.includes('>j0</text>') && dense.html.includes('>j29</text>'); })());

/* ── formatage des nombres (français, sans dépendre d'ICU) ───────────── */
const num = r(`{% graphique %}
Grand: 1234567,25
Rond: 1000
Décimal: 0,5
{% /graphique %}`);
check('nombres — milliers en espace fine, virgule décimale',
  num.html.includes(`1${NNBSP}234${NNBSP}567,25`) && num.html.includes(`1${NNBSP}000<`) && num.html.includes('0,5<'));

/* ── les refus ───────────────────────────────────────────────────────── */
const refus = [
  ['ligne sans deux-points', '{% graphique %}\nPAX 26\n{% /graphique %}', 'libellé: valeur'],
  ['valeur non numérique', '{% graphique %}\nPAX: cher\n{% /graphique %}', 'n\'est pas un nombre'],
  ['corps vide', '{% graphique %}\n{% /graphique %}', 'aucune donnée'],
  ['négatif en barres', '{% graphique %}\nA: 5\nB: -3\n{% /graphique %}', 'les valeurs négatives'],
  ['courbe à un seul point', '{% graphique type="ligne" %}\nA: 5\n{% /graphique %}', 'au moins deux points'],
];
for (const [name, src, needle] of refus) {
  const h = r(src).html;
  check(`refus — ${name}`, h.includes('class="chart-err"') && h.includes(needle) && !h.includes('<svg'));
}

/* ── surface d'attaque ───────────────────────────────────────────────── */
const hostile = r(`{% graphique titre="<img src=x onerror=alert(1)>" unite="&quot;><script>" %}
<script>alert(2)</script>: 5
"><g onload="alert(3)": 7
{% /graphique %}`);
// Le seul contrôle qui vaille : ÉNUMÉRER les balises réellement produites. Chercher
// « <script » à l'aveugle laisse passer, et faire échouer, du texte échappé comme
// « &lt;img src=x onerror=… &gt; » — inerte, mais qui déclenche une regex naïve.
const VOCAB = new Set(['article', 'figure', 'figcaption', 'div', 'svg', 'title', 'desc', 'text', 'path', 'line', 'polyline', 'circle', 'g', 'i']);
check('sécurité — aucune balise hors du vocabulaire du bloc',
  all(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g, hostile.html).every((m) => VOCAB.has(m[1].toLowerCase())));
check('sécurité — le contenu hostile reste du texte échappé',
  hostile.html.includes('&lt;script&gt;') && hostile.html.includes('&lt;img src=x onerror=alert(1)&gt;'));

// ⚠️ Markdoc classe `attribute-value-invalid` au niveau `error`, et renderPage ne
// remonte que les `critical` : une valeur hors vocabulaire est détectée puis FILTRÉE.
// Ce qui protège vraiment, c'est la revérification dans chart.js — donc on la teste.
const teinte = r('{% graphique couleur="fuchsia" %}\nA: 1\nB: 2\n{% /graphique %}');
check('sécurité — teinte hors vocabulaire non émise (défense en code)',
  !teinte.html.includes('data-teinte') && teinte.html.includes('class="bars"'));
check('sécurité — type hors vocabulaire retombe sur barres',
  r('{% graphique type="camembert" %}\nA: 1\n{% /graphique %}').html.includes('<i style="width:100.00%"'));
const raw = await import('@markdoc/markdoc').then(async (M) => {
  const { config } = await import('../src/blocks.js');
  return M.default.validate(M.default.parse('{% graphique couleur="fuchsia" type="camembert" %}\nA: 1\n{% /graphique %}'), config);
});
check('sécurité — Markdoc voit bien les deux valeurs invalides (niveau error)',
  raw.length === 2 && raw.every((e) => e.error.id === 'attribute-value-invalid' && e.error.level === 'error'));

/* ── dégénérescences ─────────────────────────────────────────────────── */
check('bord — toutes valeurs nulles : aucune barre, les libellés restent',
  (() => { const h = r('{% graphique %}\nA: 0\nB: 0\n{% /graphique %}').html;
    return !h.includes('<i ') && all(/class="rlbl"/g, h).length === 2; })());
check('bord — libellé contenant un deux-points : le dernier sépare',
  r('{% graphique %}\nLot 3: gauche: 12\n{% /graphique %}').html.includes('<div class="rlbl">Lot 3: gauche</div>'));
check('bord — courbe plate ne divise pas par zéro',
  (() => { const h = r('{% graphique type="ligne" %}\nA: 7\nB: 7\n{% /graphique %}').html;
    return h.includes('class="line"') && !/NaN|Infinity/.test(h); })());
check('bord — aucun NaN nulle part', ![bar, li, dense, num].some((x) => /NaN|Infinity|undefined/.test(x.html)));

/* ── rapport ─────────────────────────────────────────────────────────── */
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? '✓' : '✗'} ${name}`); if (!pass) ok = false; }
console.log(`\n${checks.filter((c) => c[1]).length}/${checks.length}`);
if (!ok) { console.error('CHART TEST FAILED'); process.exit(1); }
console.log('CHART OK');
