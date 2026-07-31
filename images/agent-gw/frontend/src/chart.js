// Charts, drawn at transform time — no library, no canvas, no JS.
//
// TWO FORMS, TWO TECHNIQUES, AND THE MEASUREMENT THAT DECIDED IT. Text inside an
// SVG scales with the viewBox. Measured in Chrome: a 660-unit chart renders at
// 0.98× in a 820px column (labels 12.2px, fine) but at 0.59× on a 390px phone —
// labels at 7.4px, bars at 8.3px. The PWA lives on that phone, so:
//   · `barres` is plain HTML/CSS. Labels are real text at a constant size that
//     wraps instead of shrinking, bars are 14 CSS px whatever the screen, and the
//     values are natively selectable and screen-readable. Simpler AND better.
//   · `ligne` genuinely needs geometry, so it stays SVG — clamped to a legible
//     scale band (min-width 560 / max-width 660) and allowed to scroll sideways on
//     a narrow screen, exactly as .agent-doc tables already do.
//
// WHY NOT A CHARTING LIB. The engine's hard invariant is that nothing executes from
// a memory file: render.js emits an HTML *string* that DOMPurify sanitises before it
// ever reaches innerHTML (main.js). A lib would need a mount pass, i.e. code running
// against fiche-provided data — the exact thing the pipeline is built to forbid.
// Inline SVG rides the existing path untouched:
//   · measured — DOMPurify keeps svg/g/rect/path/polyline/line/circle/text/title/desc
//     plus role, aria-*, stroke-*, text-anchor, dominant-baseline, and strips every
//     event handler, javascript: href and foreignObject;
//   · measured — Markdoc's html renderer lowercases every attribute name
//     (index.js:8129), so `viewBox` ships as `viewbox`; the HTML parser's foreign
//     content adjustment restores it (svg.viewBox.baseVal reads 0,0,W,H in Chrome).
//     Never rely on a camelCase SVG attribute that lacks such an adjustment.
//   · themable — marks wear var(--serie), so light/dark and the data-agent skins
//     repaint charts for free. A canvas would bake pixels and die in dark mode.
//
// WHY ONE SERIES PER CHART. Not a v1 shortcut — a constraint measured with the
// dataviz palette validator. Alfred's 12 tints are *identity* tokens for domains,
// and they fail every categorical check as a series ramp (light: shop↔achats ΔE 7.3
// even in normal vision; dark: agenda↔proj ΔE 1.2 under protanopia). Two series in
// those colours would be indistinguishable. One series = no adjacent pair = no
// failure. Adding series means re-running the validator and picking a real
// categorical ramp first, not appending a colour.
//
// Three light tints sit under 3:1 against the light surface, which the validator
// says obliges "visible labels or a table view". Both ship here by construction:
// every bar carries its value, and <desc> restates the whole series as text.
import Markdoc from '@markdoc/markdoc';

const { Tag } = Markdoc;

// Closed tint vocabulary — the same 12 names a domain uses for `couleur`, mapped in
// CSS, never interpolated into a style attribute. Memory content can be untrusted
// (a mail summarised into a fiche), so the value reaches the DOM only as a
// data-teinte token the stylesheet knows; an unknown name simply falls back.
export const TINTS = ['rouge', 'orange', 'ambre', 'vert', 'emeraude', 'turquoise',
  'bleu', 'indigo', 'violet', 'rose', 'gris', 'ardoise'];
const TYPES = ['barres', 'ligne'];

const W = 660;              // viewBox width; the svg scales to its container
const NNBSP = ' ';     // narrow no-break space — French thousands + unit gap
const MINUS = '−';

const r2 = (n) => Math.round(n * 100) / 100;

// French number: narrow-nbsp thousands, comma decimal, at most 2 decimals, no
// trailing zeros. Hand-rolled rather than Intl: identical in node and browser
// whatever the ICU build, so tests pin what users actually see.
function fmtNum(v) {
  const s = Math.abs(v).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const [int, dec] = s.split('.');
  return (v < 0 ? MINUS : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP) + (dec ? `,${dec}` : '');
}
const fmtVal = (v, unite) => fmtNum(v) + (unite ? NNBSP + unite : '');

// Gather the block body as plain text. Markdown shapes it differently depending on
// how it was written — a paragraph with softbreaks, a bullet list, or a fenced
// block — so walk the AST and rebuild one line per entry instead of assuming one.
function rawText(node) {
  let out = '';
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'text') { out += n.attributes?.content ?? ''; return; }
    if (n.type === 'softbreak' || n.type === 'hardbreak') { out += '\n'; return; }
    if (n.type === 'fence' || n.type === 'code') { out += `${n.attributes?.content ?? ''}\n`; return; }
    for (const k of n.children || []) walk(k);
    if (n.type === 'item' || n.type === 'paragraph') out += '\n';
  };
  for (const c of node.children || []) walk(c);
  return out;
}

const NUM = /^-?\d[\d\s  ]*(?:[.,]\d+)?$/;

// "label: value" per line. The LAST colon separates, so a label may contain one.
// Returns {points} or {error} — a malformed line is reported, never silently
// dropped: a chart missing a row is worse than a chart that says why.
function parseSeries(text) {
  const points = [];
  for (const line of text.split('\n')) {
    const s = line.trim().replace(/^[-*+]\s+/, '');
    if (!s) continue;
    const cut = s.lastIndexOf(':');
    if (cut < 1) return { error: `ligne « ${s} » — il manque « libellé: valeur ».` };
    const label = s.slice(0, cut).trim();
    const raw = s.slice(cut + 1).trim();
    if (!label) return { error: `ligne « ${s} » — libellé vide.` };
    if (!NUM.test(raw)) return { error: `ligne « ${s} » — « ${raw} » n'est pas un nombre.` };
    const v = parseFloat(raw.replace(/[\s  ]/g, '').replace(',', '.'));
    if (!Number.isFinite(v)) return { error: `ligne « ${s} » — valeur illisible.` };
    points.push({ label, v });
  }
  return points.length ? { points } : { error: 'aucune donnée dans le bloc.' };
}

const err = (msg) => new Tag('div', { class: 'chart-err' }, [`Graphique : ${msg}`]);

// Room reserved for SVG text, in viewBox units. Measuring rendered text is
// impossible in a pure transform, so it is estimated per character — and the
// estimate must use the LARGEST size the text can take, not its nominal one: the
// container query below 430px scales the tick to 19 and the value to 21 user units
// to stay legible on a phone, so a gutter sized for 11/12.5 clips the end label
// exactly where it must not. Verified against real getBBox measurements, not maths.
const CH_TICK = 11.0, CH_VAL = 12.2;
const gutterFor = (label) => Math.min(240, Math.max(44, 12 + label.length * CH_VAL));

// Bars in HTML: a two-column grid, the label spanning both. The value column is
// shared by every row, which is what guarantees all bars are drawn to the SAME
// scale — a per-row gutter would silently give each bar its own. That shared
// column is why the value sits in a column rather than riding the bar tip: the
// spec prefers the tip, but not at the cost of comparability or of a label that
// overflows on the longest bar.
//
// ⚠️ The width % is the one number that reaches a style attribute. Measured:
// DOMPurify does NOT parse CSS — `url(javascript:…)` and `expression(…)` pass
// through it untouched (both inert in a modern browser, but *unfiltered*). So the
// guarantee here comes from the generator, never from the sanitiser: only a parsed
// float through toFixed ever goes in. Never interpolate a label into a style.
function bars(points, unite) {
  // A negative bar would have to grow leftwards from a baseline this layout does
  // not have. Rather than half-draw it, say so and name the form that handles
  // signed values.
  if (points.some((p) => p.v < 0)) return err('les valeurs négatives ne se lisent pas en barres — utilise type="ligne".');
  const vmax = Math.max(...points.map((p) => p.v));
  const kids = [];
  for (const p of points) {
    const pct = vmax > 0 ? (p.v / vmax) * 100 : 0;
    kids.push(new Tag('div', { class: 'rlbl' }, [p.label]));
    // No bar at all for a zero value — a 3px stub would read as "a little".
    kids.push(new Tag('div', { class: 'bar' }, pct > 0 ? [new Tag('i', { style: `width:${pct.toFixed(2)}%` }, [])] : []));
    kids.push(new Tag('div', { class: 'rval' }, [fmtVal(p.v, unite)]));
  }
  return new Tag('div', { class: 'bars' }, kids);
}

// A "nice" axis step (1, 2, 5 × 10ⁿ) so ticks land on round numbers.
function niceStep(range, target) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

const PAD_T = 14, PLOT_H = 150, PAD_B = 24;

function line(points, unite, titre) {
  if (points.length < 2) return err('une courbe demande au moins deux points.');
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  // A line may float off zero (weight, temperature) — that is not the truncated-axis
  // anti-pattern, which is about bars. But when the data already sits near zero,
  // include it rather than magnify noise into a cliff.
  if (lo >= 0 && lo <= 0.35 * hi) lo = 0;
  if (hi === lo) { hi = lo + 1; lo -= 1; }
  const step = niceStep(hi - lo, 3);
  const y0 = Math.floor(lo / step) * step;
  const y1 = Math.max(Math.ceil(hi / step) * step, y0 + step);
  // Ticks are right-aligned at PAD_L − 8 and grow leftwards, so the left margin is
  // sized on the longest of them: a fixed 46 clips "15 000" off the canvas.
  const ticks = [];
  for (let t = y0; t <= y1 + 1e-9; t += step) ticks.push(fmtNum(t));
  const PAD_L = Math.max(46, 10 + Math.max(...ticks.map((t) => t.length)) * CH_TICK);
  const plotW = W - PAD_L - gutterFor(fmtVal(points.at(-1).v, unite));
  const X = (i) => PAD_L + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotW);
  const Y = (v) => PAD_T + PLOT_H - ((v - y0) / (y1 - y0)) * PLOT_H;

  const kids = [];
  for (let t = y0; t <= y1 + 1e-9; t += step) {
    const y = Y(t);
    kids.push(new Tag('line', { class: 'grid', x1: r2(PAD_L), y1: r2(y), x2: r2(PAD_L + plotW), y2: r2(y) }, []));
    kids.push(new Tag('text', { class: 'tick', x: r2(PAD_L - 8), y: r2(y), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, [fmtNum(t)]));
  }
  // At most 6 x labels, first and last always, anchored so the edges stay inside.
  const every = Math.max(1, Math.ceil((points.length - 1) / 5));
  points.forEach((p, i) => {
    if (i !== 0 && i !== points.length - 1 && i % every) return;
    if (i !== points.length - 1 && points.length - 1 - i < every / 2) return;
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    kids.push(new Tag('text', { class: 'tick', x: r2(X(i)), y: r2(PAD_T + PLOT_H + 16), 'text-anchor': anchor }, [p.label]));
  });
  kids.push(new Tag('polyline', { class: 'line', points: points.map((p, i) => `${r2(X(i))},${r2(Y(p.v))}`).join(' ') }, []));
  // Dots on every point only while they stay readable; the end dot is always there
  // because it anchors the one direct label a line chart gets.
  const dotted = points.length <= 14;
  points.forEach((p, i) => {
    if (!dotted && i !== points.length - 1) return;
    kids.push(new Tag('circle', { class: 'dot', cx: r2(X(i)), cy: r2(Y(p.v)), r: '4' },
      [new Tag('title', {}, [`${p.label} : ${fmtVal(p.v, unite)}`])]));
  });
  const last = points.at(-1);
  kids.push(new Tag('text', {
    class: 'val', x: r2(PAD_L + plotW + 10),
    y: r2(Math.min(Math.max(Y(last.v), PAD_T + 5), PAD_T + PLOT_H)), 'text-anchor': 'start', 'dominant-baseline': 'middle',
  }, [fmtVal(last.v, unite)]));

  // role=img + title/desc: unlike the HTML bars, an SVG plot carries no readable
  // text of its own, so the whole series is restated here. No value is gated
  // behind a hover tooltip, and the chart is never colour-only.
  const svg = new Tag('svg', {
    class: 'chart-svg', viewBox: `0 0 ${W} ${PAD_T + PLOT_H + PAD_B}`, role: 'img',
  }, [
    new Tag('title', {}, [titre || 'Graphique']),
    new Tag('desc', {}, [points.map((p) => `${p.label} ${fmtVal(p.v, unite)}`).join(', ')]),
    ...kids,
  ]);
  return svg;
}

export function chart(node, cfg) {
  const a = node.transformAttributes(cfg);
  const type = TYPES.includes(a.type) ? a.type : 'barres';
  const unite = (a.unite || '').trim();
  const titre = (a.titre || '').trim();

  const parsed = parseSeries(rawText(node));
  if (parsed.error) return err(parsed.error);
  const { points } = parsed;

  const drawn = type === 'ligne' ? line(points, unite, titre) : bars(points, unite);
  if (drawn.name === 'div' && drawn.attributes.class === 'chart-err') return drawn;

  return new Tag('figure', {
    class: `chart chart-${type}`,
    ...(TINTS.includes(a.couleur) ? { 'data-teinte': a.couleur } : {}),
  }, titre ? [new Tag('figcaption', {}, [titre]), drawn] : [drawn]);
}
