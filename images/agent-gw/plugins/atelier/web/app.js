/* The Atelier view — woodworking workbook, four linked stations.
   ═══════════════════════════════════════════════════════════════════════════

   This lived in `launcher/main.js` (1001 lines) until 2026-08-20, and its shared
   modules under `frontend/src/atelier/`. Both are now the plugin's, which also
   fixes an oddity: `convert.js` and `regles.js` are what the plugin's OWN CLI
   (`tools/atelier.mjs`) executes, so the core was hosting a plugin's logic and
   handing it back at build time.

   ONE source of truth, two consumers: the browser view renders with the very
   rules the CLI validates and migrates against (ATELIER-3.md D4). They cannot
   disagree, because they are the same file.

   THE CONTRACT — `(api) => ({ routes })`. `atelier` is the hub, `atelier/<path>`
   one workbook. The domain tiles `diy` and `atelier` are intercepted by the hub
   on purpose: a workbook is not a folder of notes.

   ⚠️ `api.page` is a GETTER and must not be destructured — the node does not
   exist yet when views are instantiated. Correct breadcrumb, blank screen, no
   error: the failure this rule prevents was found by a screenshot, nothing else. */

import { normalise } from './convert.js';
import {
  SURFACES, CHANTS, epOf, kerfOf, zoneUtile, bandBox, bandGuide, bandLong,
  chantEdges, lamPoints, lamLignes, ligneBande, prepsDe, plaqueBands, plaquePoses, bandesMeres, issuesPlaque,
} from './regles.js';

export default function createAtelierApp(api) {
  const { esc, crumbs, headers, add, chipsOf } = api;

  let wb = null;       // {path, data, state, byEtq}
  let wbTab = 0;       // index dans wbStations() — la barre est propre à chaque workbook
  const wbDone = (id) => !!(wb.state.fait || {})[id];   // id = identifiant d'ÉTAPE (modèle A)
  const pieceDims = (p) => `${p.longueur}×${p.largeur}`;
  // Côtés plaqués d'une pièce — vocabulaire 3.0 (rive-avant/rive-arriere/about-gauche/
  // about-droit/abouts), repère et arêtes résolus par le socle (atelier/regles.js).
  const pieceChants = (p) => (p.chants || []).filter((c) => CHANTS.includes(c));
  /* Le HAUT en configuration montée (`haut` sur la pièce) : la surface qui regarde le plafond.
     Sur une arête, on pose un liseré et un « ▲ HAUT » ; sur une face, la mention suffit (la
     pièce est vue de dessus, on ne peut pas la flécher). Rendu dans le repère du DESSIN :
     `uAlongX` dit si la longueur de la pièce court à l'horizontale. */
  function hautMark(haut, r, uAlongX, fs) {
    if (!haut || haut === 'face' || haut === 'contre-face') return '';
    const [e] = chantEdges([haut], r, uAlongX);
    if (!e) return '';
    const [x1, y1, x2, y2] = e, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const vertical = Math.abs(x2 - x1) < 0.5;   // arête verticale → texte couché
    const tr = vertical ? ` transform="rotate(-90 ${mx} ${my})"` : '';
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--proj)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="6 3"/>`
      + `<text x="${mx}" y="${my + (vertical ? 0 : (y1 < r.y + r.h / 2 ? 9 : -3))}"${tr} text-anchor="middle" fill="var(--proj)" font-family="var(--f-mono)" font-size="${fs}" font-weight="700" paint-order="stroke" stroke="var(--surface)" stroke-width="3">▲ HAUT</text>`;
  }
  const chantSVG = (edges, sw) => edges.map(([x1, y1, x2, y2]) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--warn)" stroke-width="${sw}" stroke-linecap="round"/>`).join('');
  // L'échelle 3.0 : UN px/mm pour tout le workbook — chaque vue compose son viewBox sur la
  // même largeur de référence wb.WG (calculée à l'index), au même WS mm→unités.
  const WS = 0.33;
  // …et UNE échelle typographique, en unités de viewBox. Puisque toutes les vues partagent le
  // même px/mm, un corps donné rend à la même taille partout : trois niveaux, pas plus.
  //   T1 = ce qu'on lit pour scier (cotes chiffrées, noms de pièce)
  //   T2 = les repères (identifiant de colonne, graduations)
  //   T3 = les mentions (nom de surface, butée, axes)
  const FS = { cote: 11.5, nom: 11.5, rep: 9.5, note: 8 };
  // Chaque dessin n'occupe que la FRACTION de largeur qui lui revient : son viewBox fait sa
  // taille réelle, et sa largeur CSS vaut sa part de la référence commune. Le px/mm reste
  // identique partout (c'est l'invariant), mais une petite pièce cesse de flotter au milieu
  // d'un cadre taillé pour la plus grande plaque.
  const wbPart = (vbW) => `style="width:${Math.min(100, vbW / wb.WG * 100).toFixed(2)}%;height:auto;display:block"`;
  const fitNom = (place, txt) => Math.max(8.5, Math.min(FS.nom, place / (String(txt).length * 0.68)));

  // Conteneurs créés une fois : modale pièce + mode atelier plein écran.
  const pieceModal = document.createElement('div');
  pieceModal.className = 'modal'; pieceModal.hidden = true;
  pieceModal.innerHTML = '<div class="card"><div class="piece-body" id="piece-body"></div></div>';
  pieceModal.addEventListener('click', (e) => { if (e.target === pieceModal) pieceModal.hidden = true; });
  document.body.appendChild(pieceModal);
  const atelierFull = document.createElement('div');
  atelierFull.className = 'atelier-full'; atelierFull.hidden = true;
  atelierFull.innerHTML = '<button class="close" id="atelier-close">✕</button><div id="atelier-body"></div>';
  atelierFull.querySelector('#atelier-close').addEventListener('click', () => { atelierFull.hidden = true; });
  document.body.appendChild(atelierFull);

  async function renderAtelierHub() {
    crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'L’Atelier', hash: '#/atelier' }]);
    page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
    let list;
    try { const r = await fetch('/api/workbook/list', { headers: headers(false), cache: 'no-store' }); list = (await r.json()).workbooks; }
    catch { page.innerHTML = '<div class="wrap"><div class="empty">Atelier indisponible.</div></div>'; return; }
    let html = `<div class="wrap" style="--dc:var(--shop)"><div class="chead"><div class="aico" style="--dc:var(--shop)">${IC.shop}</div><div><h1>L’Atelier</h1><div class="lede">Suivi menuiserie — vos plans de débit.</div></div></div>`;
    if (!list.length) { page.innerHTML = html + '<div class="empty">Aucun workbook — demandez à Alfred d’en générer un (skill menuiserie).</div></div>'; return; }
    html += '<div class="grouplabel">Workbooks</div><div class="cards">';
    for (const w of list) {
      const tot = w.total || w.pieces || 0;
      const pct = tot ? Math.round(100 * w.done / tot) : 0;
      const last = w.lastActivity ? new Date(w.lastActivity).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'jamais';
      html += `<a class="card" href="#/atelier/${encodeURIComponent(w.path)}"><div class="ct">${esc(w.titre)}</div><div class="cmeta">${w.done}/${tot} étapes · ${w.pieces} pièces · ${esc(last)}</div><div class="bar"><i style="width:${pct}%"></i></div></a>`;
    }
    page.innerHTML = html + '</div></div>';
  }

  async function renderWorkbook(path) {
    crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'L’Atelier', hash: '#/atelier' }, { label: '…', hash: '#/atelier/' + encodeURIComponent(path) }]);
    page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
    let data, state, layout;
    try {
      const [rd, rs, rl] = await Promise.all([
        fetch('/api/memory/raw/' + path, { headers: headers(false), cache: 'no-store' }),
        fetch('/api/workbook/state?wb=' + encodeURIComponent(path), { headers: headers(false), cache: 'no-store' }),
        fetch('/api/workbook/layout?wb=' + encodeURIComponent(path), { headers: headers(false), cache: 'no-store' }),
      ]);
      if (!rd.ok) throw new Error(rd.status);
      data = normalise(await rd.json()); state = await rs.json();
      layout = rl.ok ? await rl.json() : { poses: {}, bandes: {} };
    } catch (e) { page.innerHTML = '<div class="wrap"><div class="empty">Workbook illisible (' + esc(String(e)) + ').</div></div>'; return; }
    if (!wb || wb.path !== path) { wbTab = 0; wbEditOn = false; wbSel = null; }   // autre workbook = autre barre, l'index ne se transpose pas
    wb = { path, data, state, layout, byEtq: new Map((data.pieces || []).map((p) => [p.etiquette, p])) };
    buildWbIndex();
    crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'L’Atelier', hash: '#/atelier' }, { label: data.titre || data.projet || 'Workbook', hash: '#/atelier/' + encodeURIComponent(path) }]);
    renderWb();
  }

  async function tick(id, done) {   // id = étape ; POST direct au serveur, jamais le LLM
    try { const r = await fetch('/api/workbook/state', { method: 'POST', headers: headers(true), body: JSON.stringify({ wb: wb.path, key: id, done }) }); if (r.ok) wb.state = await r.json(); } catch {}
    renderWb();
    if (!atelierFull.hidden) renderShop();
  }

  // Index dérivés du modèle A : matériaux, étapes à plat (ordonnées), pièce → son étape.
  function buildWbIndex() {
    const d = wb.data;
    wb.matById = new Map((d.materiaux || []).map((m) => [m.id, m]));
    wb.steps = [];
    wb.pieceStep = new Map();
    let maxMM = 0;
    for (const pl of d.debit || []) {
      maxMM = Math.max(maxMM, wb.matById.get(pl.materiau)?.plaque?.l || 2800);
      for (const st of pl.etapes || []) {
        wb.steps.push({ ...st, plaque: pl.plaque, materiau: pl.materiau });
        if (st.type === 'tronconnage') for (const pose of st.pieces || [])
          wb.pieceStep.set(pose.etiquette, { plaque: pl.plaque, materiau: pl.materiau, stepId: st.id });
      }
    }
    for (const p of d.pieces || []) maxMM = Math.max(maxMM, p.longueur || 0);
    for (const sc of d.assemblage || []) maxMM = Math.max(maxMM, sc.cadre?.w || 0);
    // la largeur de référence commune à TOUTES les vues (marge pour cotes et rabattues)
    wb.WG = Math.round(maxMM * WS) + 100;
  }
  // La barre de stations. DÉCLARÉE par Alfred (`stations[]` à la racine : ordre libre, zéro ou
  // plusieurs fois chaque type, `titre` et portée optionnels) ; à défaut, DÉRIVÉE — la barre
  // historique, moins les stations sans contenu (« zéro fois » sans rien déclarer). Le type est
  // un vocabulaire fermé : inconnu → station ignorée, on ne dessine pas un onglet mort.
  const ST_LABELS = { debit: 'Plaques', tronconnage: 'Tronçons', rainure: 'Rainures', lamello: 'Lamello', assemblage: 'Assemblage', suivi: 'Suivi' };
  function wbStations() {
    const d = wb.data;
    const declared = (Array.isArray(d.stations) ? d.stations : []).filter((s) => s && ST_LABELS[s.type]);
    if (declared.length) return declared.map((s) => ({ ...s, titre: s.titre || ST_LABELS[s.type] }));
    const hasPrep = (t) => (d.pieces || []).some((p) => (p.preparations || []).some((pr) => pr.type === t));
    const out = [];
    if ((d.debit || []).length) out.push({ type: 'debit' }, { type: 'tronconnage' });
    if (hasPrep('rainure')) out.push({ type: 'rainure' });
    if (hasPrep('lamello')) out.push({ type: 'lamello' });
    if ((d.assemblage || []).length) out.push({ type: 'assemblage' });
    out.push({ type: 'suivi' });
    return out.map((s) => ({ ...s, titre: ST_LABELS[s.type] }));
  }
  // Portée d'une station : `plaques` restreint le débit (Plaques/Tronçons), `modules` les
  // pièces (Rainures/Lamello) et les entrées d'assemblage. Absente → tout, comme avant.
  const stPlaques = (st) => { const all = wb.data.debit || []; return Array.isArray(st?.plaques) && st.plaques.length ? all.filter((pl) => st.plaques.includes(pl.plaque)) : all; };
  const stModOk = (st, m) => !(Array.isArray(st?.modules) && st.modules.length) || st.modules.includes(m);
  function renderWb() {
    const d = wb.data;
    const total = (wb.steps || []).length;
    const done = (wb.steps || []).filter((s) => wbDone(s.id)).length;
    const pct = total ? Math.round(100 * done / total) : 0;
    const stations = wbStations();
    if (wbTab >= stations.length) wbTab = 0;
    const cur = stations[wbTab] || { type: 'suivi', titre: 'Suivi' };
    page.innerHTML = `<div class="wrap" style="--dc:var(--shop)">
      <div class="chead"><div class="aico" style="--dc:var(--shop)">${IC.shop}</div><div><h1>${esc(d.titre || d.projet || 'Workbook')}</h1><div class="lede">Workbook menuiserie · ${done}/${total} étapes</div></div><span style="flex:1"></span><button class="tag" id="shopmode" style="cursor:pointer;padding:8px 14px;border-color:var(--shop);color:var(--shop)">▶ Mode atelier</button></div>
      <div class="prog"><i style="width:${pct}%"></i></div>
      <div class="wbtabs">${stations.map((s, i) => `<button class="wbtab${wbTab === i ? ' on' : ''}" data-w="${i}">${esc(s.titre)}</button>`).join('')}</div>
      <div id="wbbody"></div></div>`;
    const body = $('wbbody');
    if (cur.type === 'debit') renderDebit(body, cur);
    else if (cur.type === 'tronconnage') renderTronconnage(body, cur);
    else if (cur.type === 'rainure') renderRainurage(body, cur);
    else if (cur.type === 'lamello') renderLamello(body, cur);
    else if (cur.type === 'assemblage') renderAsm(body, cur);
    else renderSuivi(body);
    page.querySelectorAll('.wbtab').forEach((t) => t.addEventListener('click', () => { wbTab = +t.dataset.w; renderWb(); }));
    $('shopmode').addEventListener('click', () => { atelierFull.hidden = false; renderShop(); });
  }

  // Vue Débit (modèle A) — la plaque est le tronc. Chaque plaque de `debit[]` est dessinée
  // à l'échelle RÉELLE (materiau.plaque) et à une échelle COMMUNE (plaque la plus large du
  // projet) : une plaque plus petite se dessine plus petite. On trace la plaque BRUTE
  // (pointillé, bords abîmés), la zone UTILE (trait plein, après dérasage), puis chaque pièce
  // à sa position ABSOLUE fournie par Alfred. La surface non couverte EST la chute. Le front
  // ne calcule aucun nesting : il pose ce qu'Alfred a posé.
  /* ── L'ÉTABLI : remanier le calepinage à la main ──────────────────────
     La proposition d'Alfred vit dans `workbook.json` (mémoire, git). Le geste de Monsieur
     vit dans `workbook-layout.json` VOISIN (hors git), superposé pose par pose — même
     frontière que les cases cochées : le front ne réécrit jamais un fichier de mémoire, et
     Alfred consolide sur demande. `wbBands` / `wbPosesEff` rendent l'état EFFECTIF
     (fichier + calque), seul état que le dessin et les contrôles connaissent. */
  let wbEditOn = false, wbSel = null, wbSelB = null;
  const wbPoses = () => (wb.layout && wb.layout.poses) || {};
  const wbBandes = () => (wb.layout && wb.layout.bandes) || {};
  /* Adaptateurs vers le socle (atelier/regles.js) : on passe le workbook courant et le
     calque, le socle rend l'état EFFECTIF et les griefs — les règles ne vivent qu'à un
     seul endroit, partagées avec le CLI valide/migre. */
  const wbTroncStep = (pl) => { const m = new Map(); for (const e of pl.etapes || []) if (e.type === 'tronconnage') m.set(e.entree, e.id); return m; };
  function wbBands(pl) {
    const bands = plaqueBands(wb.data, pl, wb.layout);
    const ts = wbTroncStep(pl);
    for (const b of bands.values()) { b.stepId = ts.get(b.id) || null; b.done = b.stepId ? wbDone(b.stepId) : false; }
    return bands;
  }
  const wbPosesEff = (pl, bands) => plaquePoses(wb.data, pl, wb.layout, bands);
  const wbIssues = (pl) => issuesPlaque(wb.data, pl, wb.layout);
  // AIMANTATION : les arêtes s'attirent, mais bord à bord ajoute TOUJOURS le trait de scie —
  // deux pièces jointives sont physiquement insciables. L'affleurement de bande, lui, est
  // sans kerf : son bord EST la coupe.
  function wbSnap(pl, et, x, y, w, h) {
    const kerf = kerfOf(wb.data), uz = zoneUtile(wb.data, pl), tol = 14;
    const xs = [uz.x0, uz.x1 - w], ys = [uz.y0, uz.y1 - h];
    for (const o of wbPosesEff(pl)) {
      if (o.et === et) continue;
      xs.push(o.x + o.w + kerf, o.x - w - kerf, o.x, o.x + o.w - w);
      ys.push(o.y + o.h + kerf, o.y - h - kerf, o.y, o.y + o.h - h);
    }
    for (const b of wbBands(pl).values()) {
      const r = bandBox(b);
      xs.push(r.x, r.x + r.w - w); ys.push(r.y, r.y + r.h - h);
    }
    const near = (v, cands) => { let bv = v, bd = tol; for (const c of cands) { const d = Math.abs(c - v); if (d < bd) { bd = d; bv = c; } } return bv; };
    return { x: Math.round(near(x, xs) * 2) / 2, y: Math.round(near(y, ys) * 2) / 2 };
  }
  async function wbSavePose(body) {
    try {
      const r = await fetch('/api/workbook/layout', { method: 'POST', headers: headers(true), body: JSON.stringify({ wb: wb.path, ...body }) });
      if (r.ok) wb.layout = await r.json();
    } catch {}
    renderWb();
  }

  function plaqueSVG(pl) {
    const mat = wb.matById.get(pl.materiau) || {};
    const L = mat.plaque?.l || 2800, H = mat.plaque?.h || 2070, d = mat.derasage || 0;
    const S = WS, pad = 40, top = 46;
    const SW = L * S, SH = H * S;
    // La COLONNE (bande) est l'objet : refente = géométrie, tronçonnage = poses + done (par colonne).
    const bands = wbBands(pl);
    wbPosesEff(pl, bands);                 // remplit band.poses avec l'état EFFECTIF (fichier + calque)
    const issues = wbEditOn ? wbIssues(pl) : new Map();
    const parents = bandesMeres(pl);
    const vw = SW + pad * 2, vh = SH + top + pad;   // taille réelle ; la part de largeur fait l'échelle
    let g = `<g transform="translate(${pad},${top})"><rect x="0" y="0" width="${SW}" height="${SH}" rx="3" fill="var(--surface)" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    if (d > 0) g += `<rect x="${d * S}" y="${d * S}" width="${(L - 2 * d) * S}" height="${(H - 2 * d) * S}" rx="2" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
    for (const band of bands.values()) {
      // en lecture on ne montre que ce qui porte des pièces ; à l'établi on montre aussi les
      // colonnes VIDES (pour y déposer), mais jamais les bandes mères, qui seront recoupées
      if (!band.poses.length && !(wbEditOn && !parents.has(band.id))) continue;
      const done = band.done;
      // à débiter = sarcelle vif ; débité = gris estompé + ✓ (contraste par la clarté, pas la teinte).
      const badB = issues.has('▭ ' + band.id), selB = wbEditOn && wbSelB === band.id;
      const cc = badB ? 'var(--crit)' : selB ? 'var(--proj)' : done ? 'var(--ink-faint)' : 'var(--shop)';
      // 3.0 : la bande est un rectangle + un axe — les cotes suivent l'axe, le guide est la transverse
      const long = band.axe === 'x';
      const bb = bandBox(band);
      const bx = bb.x * S, byo = bb.y * S, bw = bb.w * S, bh = bb.h * S;
      const cid = pl.plaque + (band.label || String(band.id).split('-').pop()), len = Math.round(bandLong(band));
      g += `<g class="colc" data-band="${esc(band.id)}"${wbEditOn ? ' style="cursor:move"' : ''}>`;
      // le conteneur = LA colonne (contour fort, cliquable)
      g += `<rect class="colbox" x="${bx}" y="${byo}" width="${bw}" height="${bh}" rx="3" fill="${cc}" fill-opacity="${done ? .07 : .09}" stroke="${cc}" stroke-width="${selB || badB ? 3.5 : 2.5}"${selB || badB ? '' : ''}/>`;
      // tronçons (pièces) — subordonnés : bloc + nom CLIQUABLE + cote (positions absolues)
      for (const r of band.poses) {
        const pc = wb.byEtq.get(r.et) || {};
        const px = r.x * S, py = r.y * S, pw = r.w * S, ph = r.h * S;
        const short = r.et.replace(/^[^-]+-/, '');
        // Pièce plus haute que large (une lame de 100 debout) : le texte se couche le long
        // d'elle, comme le fait déjà la cote d'une bande verticale — sinon nom et cote
        // débordent sur les voisines et se mélangent en bouillie.
        const vert = ph > pw * 1.25;
        const cx = px + pw / 2, cy = py + ph / 2;
        const tr = vert ? ` transform="rotate(-90 ${cx} ${cy})"` : '';
        const fontE = fitNom(vert ? ph : pw, short);
        const bad = issues.has(r.et), sel = wbEditOn && wbSel === r.et;
        const pk = bad ? 'var(--crit)' : sel ? 'var(--proj)' : cc;
        // en mode établi chaque pièce est son propre <g> : le glissé la déplace par transform,
        // sans redessiner la plaque à chaque pixel
        g += `<g class="dragp" data-et="${esc(r.et)}" data-band="${esc(r.bande || '')}"${wbEditOn ? ' style="cursor:grab"' : ''}>`;
        g += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="2" fill="${pk}" fill-opacity="${bad ? .3 : done ? .12 : .2}" stroke="${pk}" stroke-width="${bad || sel ? 2.5 : 1}" stroke-opacity="${bad || sel ? 1 : .45}"/>`;
        g += `<text class="pname" data-et="${esc(r.et)}" x="${cx}" y="${cy - 1}"${tr} text-anchor="middle" fill="${done ? 'var(--ink-faint)' : 'var(--ink)'}" font-family="var(--f-mono)" font-size="${fontE}" font-weight="700" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(short)}</text>`;
        // La cote de la pièce se lit à l'établi, penché sur une tablette : même corps et même
        // encre que les cotes de bande (11,5 gras, halo sur le fond de colonne), pas le gris
        // discret d'une mention secondaire — c'est un chiffre qu'on va scier.
        g += `<text x="${cx}" y="${cy + 15}"${tr} text-anchor="middle" fill="${done ? 'var(--ink-faint)' : 'var(--ink)'}" font-family="var(--f-mono)" font-size="11.5" font-weight="800" paint-order="stroke" stroke="var(--surface)" stroke-width="4">${pc.longueur}×${pc.largeur}</text>`;
        // CHANTS sur la plaque : ce sont eux qui décident de l'orientation au calepinage (un
        // chant sur le long bord d'une bande se plaque en UNE passe avant tronçonnage).
        if (!done && r.chants.length) g += chantSVG(chantEdges(r.chants, { x: px, y: py, w: pw, h: ph }, !r.rot), 2.5);
        if (!done) g += hautMark(pc.haut, { x: px, y: py, w: pw, h: ph }, !r.rot, FS.note);
        if (done) g += `<text x="${px + 5}" y="${py + 14}" fill="var(--good)" font-family="var(--f-mono)" font-size="13" font-weight="700">✓</text>`;
        g += `</g>`;
      }
      // POIGNÉE de colonne — dessinée APRÈS les pièces, donc toujours au-dessus : une bande
      // pleine est entièrement recouverte par ses tronçons, sans elle on ne peut plus l'attraper.
      // (Elle n'arrête pas la propagation : le glissé de bande est câblé sur le groupe.)
      if (wbEditOn) g += `<rect class="bgrab" x="${bx + 2.5}" y="${byo + 2.5}" width="13" height="13" rx="2.5" fill="${cc}" fill-opacity=".95" stroke="var(--surface)" stroke-width="1.5"/>`;
      // Cotes façon plan — l'axe suit le SENS : id + LARGEUR sur l'arête courte, LONGUEUR (flèches) sur l'axe long.
      const a = 4;
      if (long) {
        // largeur = arête gauche (verticale) ; longueur = arête haute (horizontale, flèches)
        const lx = Math.max(bx - 5, 9);
        g += `<line x1="${lx - 3}" y1="${byo + 1}" x2="${lx + 3}" y2="${byo + 1}" stroke="${cc}" stroke-width="1.5"/><line x1="${lx - 3}" y1="${byo + bh - 1}" x2="${lx + 3}" y2="${byo + bh - 1}" stroke="${cc}" stroke-width="1.5"/>`;
        g += `<text x="${lx}" y="${byo + bh / 2}" transform="rotate(-90 ${lx} ${byo + bh / 2})" text-anchor="middle" fill="${cc}" font-family="var(--f-mono)" font-size="${FS.rep}" font-weight="700" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(cid)} · ${bandGuide(band)}</text>`;
        const dy = byo + 15, mx = bx + bw / 2;
        g += `<line x1="${bx + 1}" y1="${dy}" x2="${bx + bw - 1}" y2="${dy}" stroke="var(--ink-soft)" stroke-width="1"/>`;
        g += `<path d="M${bx} ${dy} l${a} ${-a} M${bx} ${dy} l${a} ${a} M${bx + bw} ${dy} l${-a} ${-a} M${bx + bw} ${dy} l${-a} ${a}" stroke="var(--ink-soft)" stroke-width="1.2" fill="none"/>`;
        g += `<text x="${mx}" y="${dy - 4}" text-anchor="middle" fill="var(--ink)" font-family="var(--f-mono)" font-size="${FS.cote}" font-weight="800" paint-order="stroke" stroke="var(--surface)" stroke-width="4">${len} mm</text>`;
      } else {
        // court : id + largeur en tête (arête haute) ; longueur en flèches verticales
        const wy = Math.max(byo - 4, 9);
        g += `<line x1="${bx + 1}" y1="${wy + 3}" x2="${bx + 1}" y2="${wy - 3}" stroke="${cc}" stroke-width="1.5"/><line x1="${bx + bw - 1}" y1="${wy + 3}" x2="${bx + bw - 1}" y2="${wy - 3}" stroke="${cc}" stroke-width="1.5"/>`;
        g += `<text x="${bx + bw / 2}" y="${wy}" text-anchor="middle" fill="${cc}" font-family="var(--f-mono)" font-size="${FS.rep}" font-weight="700" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(cid)} · ${bandGuide(band)}</text>`;
        // colonne étroite : l'étiquette de pièce occupe déjà l'axe médian — la cote de bande
        // remonte en tête plutôt que de s'imprimer par-dessus (la ligne de cote, elle, court
        // sur toute la hauteur, comme il se doit)
        const dx = bx + 17, my = byo + (bw < 46 ? bh * 0.18 : bh / 2);
        g += `<line x1="${dx}" y1="${byo + 1}" x2="${dx}" y2="${byo + bh - 1}" stroke="var(--ink-soft)" stroke-width="1"/>`;
        g += `<path d="M${dx} ${byo} l${-a} ${a} M${dx} ${byo} l${a} ${a} M${dx} ${byo + bh} l${-a} ${-a} M${dx} ${byo + bh} l${a} ${-a}" stroke="var(--ink-soft)" stroke-width="1.2" fill="none"/>`;
        g += `<text x="${dx}" y="${my}" transform="rotate(-90 ${dx} ${my})" text-anchor="middle" fill="var(--ink)" font-family="var(--f-mono)" font-size="${FS.cote}" font-weight="800" paint-order="stroke" stroke="var(--surface)" stroke-width="4">${len} mm</text>`;
      }
      g += `</g>`;
    }
    const sub = d > 0 ? ` · dérasage ${d} · tronçon +${wb.data.meta?.tronconnage || 10}` : '';
    return `<svg viewBox="0 0 ${vw} ${vh}" ${wbPart(vw)}><text x="${pad + SW / 2}" y="${top - 30}" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--f-mono)" font-size="${FS.rep}">plaque ${L} × ${H} mm${sub}</text>${g}</g></svg>`;
  }
  // Quelle colonne accueille une pièce lâchée ici ? Celle qui contient son CENTRE — à défaut,
  // la pièce garde la sienne (une pièce posée dans la chute n'est pas orpheline, elle est fausse).
  function wbBandAt(pl, cx, cy) {
    const parents = bandesMeres(pl);   // on ne dépose pas dans une bande mère : elle sera recoupée
    for (const b of wbBands(pl).values()) {
      if (parents.has(b.id)) continue;
      const r = bandBox(b);
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return b.id;
    }
    return null;
  }
  // Aimantation d'une BANDE : contre ses sœurs feuilles, toujours avec le trait de scie —
  // deux bandes jointives sont le même défaut que deux pièces jointives, à l'échelle du dessus.
  function wbSnapB(pl, id, x, y, w, h) {
    const kerf = kerfOf(wb.data), uz = zoneUtile(wb.data, pl), tol = 14, parents = bandesMeres(pl);
    const xs = [uz.x0, uz.x1 - w], ys = [uz.y0, uz.y1 - h];
    for (const b of wbBands(pl).values()) {
      if (b.id === id || parents.has(b.id)) continue;
      const r = bandBox(b);
      xs.push(r.x + r.w + kerf, r.x - w - kerf, r.x, r.x + r.w - w);
      ys.push(r.y + r.h + kerf, r.y - h - kerf, r.y, r.y + r.h - h);
    }
    const near = (v, c) => { let bv = v, bd = tol; for (const q of c) { const d = Math.abs(q - v); if (d < bd) { bd = d; bv = q; } } return bv; };
    return { x: Math.round(near(x, xs) * 2) / 2, y: Math.round(near(y, ys) * 2) / 2 };
  }
  function wbWireEdit(scope, plaques) {
    const S = WS;
    scope.querySelectorAll('.blueprint[data-plaque]').forEach((bp) => {
      const pl = plaques.find((p) => p.plaque === bp.dataset.plaque);
      const svgEl = bp.querySelector('svg');
      if (!pl || !svgEl) return;
      bp.querySelectorAll('.dragp').forEach((gEl) => gEl.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const et = gEl.dataset.et;
        const p0 = wbPosesEff(pl).find((p) => p.et === et);
        if (!p0) return;
        wbSel = et;
        const box = svgEl.getBoundingClientRect();
        const vbw = svgEl.viewBox.baseVal.width || box.width;
        const mmPerPx = (vbw / box.width) / S;      // px écran → mm réels, quelle que soit la taille rendue
        const sx = ev.clientX, sy = ev.clientY;
        let cur = { x: p0.x, y: p0.y }, moved = false;
        try { gEl.setPointerCapture(ev.pointerId); } catch {}
        const onMove = (e2) => {
          const nx = p0.x + (e2.clientX - sx) * mmPerPx, ny = p0.y + (e2.clientY - sy) * mmPerPx;
          if (Math.abs(nx - p0.x) > 1.5 || Math.abs(ny - p0.y) > 1.5) moved = true;
          cur = wbSnap(pl, et, nx, ny, p0.w, p0.h);
          gEl.setAttribute('transform', `translate(${((cur.x - p0.x) * S).toFixed(2)},${((cur.y - p0.y) * S).toFixed(2)})`);
        };
        const onUp = () => {
          gEl.removeEventListener('pointermove', onMove);
          if (!moved) { renderWb(); return; }       // pas bougé = simple sélection
          wbSavePose({ etiquette: et, pose: { x: cur.x, y: cur.y, rot: p0.rot, bande: wbBandAt(pl, cur.x + p0.w / 2, cur.y + p0.h / 2) || p0.bande } });
        };
        gEl.addEventListener('pointermove', onMove);
        gEl.addEventListener('pointerup', onUp, { once: true });
        gEl.addEventListener('pointercancel', onUp, { once: true });
      }));
      // La BANDE se déplace aussi — et elle EMPORTE ses pièces : la lâcher sur place en les
      // laissant derrière viderait la colonne de son contenu au premier geste.
      bp.querySelectorAll('.colc').forEach((gEl) => gEl.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        const id = gEl.dataset.band;
        const bands = wbBands(pl); wbPosesEff(pl, bands);
        const b0 = bands.get(id); if (!b0) return;
        wbSelB = id; wbSel = null;
        const r0 = bandBox(b0);
        const kids = b0.poses.map((p) => ({ et: p.et, x: p.x, y: p.y, rot: p.rot, bande: p.bande }));
        const box = svgEl.getBoundingClientRect();
        const mmPerPx = ((svgEl.viewBox.baseVal.width || box.width) / box.width) / S;
        const sx = ev.clientX, sy = ev.clientY;
        let cur = { x: r0.x, y: r0.y }, moved = false;
        try { gEl.setPointerCapture(ev.pointerId); } catch {}
        const onMove = (e2) => {
          const nx = r0.x + (e2.clientX - sx) * mmPerPx, ny = r0.y + (e2.clientY - sy) * mmPerPx;
          if (Math.abs(nx - r0.x) > 1.5 || Math.abs(ny - r0.y) > 1.5) moved = true;
          cur = wbSnapB(pl, id, nx, ny, r0.w, r0.h);
          gEl.setAttribute('transform', `translate(${((cur.x - r0.x) * S).toFixed(2)},${((cur.y - r0.y) * S).toFixed(2)})`);
        };
        const onUp = () => {
          gEl.removeEventListener('pointermove', onMove);
          if (!moved) { renderWb(); return; }
          const dx = cur.x - r0.x, dy = cur.y - r0.y;
          wbSavePose({ bande: { id, x: cur.x, y: cur.y }, poses: Object.fromEntries(kids.map((k) => [k.et, { x: k.x + dx, y: k.y + dy, rot: k.rot, bande: k.bande }])) });
        };
        gEl.addEventListener('pointermove', onMove);
        gEl.addEventListener('pointerup', onUp, { once: true });
        gEl.addEventListener('pointercancel', onUp, { once: true });
      }));
    });
  }
  function renderDebit(body, st) {
    const plaques = stPlaques(st);
    if (!plaques.length) { body.innerHTML = '<div class="empty">Pas de plan de débit.</div>'; return; }
    const refL = Math.max(...plaques.map((pl) => (wb.matById.get(pl.materiau)?.plaque?.l) || 2800));
    const remanie = Object.keys(wbPoses()).length;
    // La ROTATION est bridée par la matière : sur un panneau à fil, tourner une pièce change
    // le sens du veinage — ce n'est pas un choix de calepinage, c'est un défaut.
    const libre = !wb.data.meta?.sensFil || wb.data.meta.sensFil === 'libre' || wb.data.meta.decorUni;
    // la bande sélectionnée, avec ses pièces résolues (pour savoir si elle est vide)
    let selB = null, selPl = null;
    if (wbEditOn && wbSelB) for (const pl of plaques) {
      const bs = wbBands(pl); wbPosesEff(pl, bs);
      if (bs.has(wbSelB)) { selB = bs.get(wbSelB); selPl = pl; break; }
    }
    const inp = 'style="width:5em;background:transparent;border:0;border-bottom:1px solid currentColor;color:inherit;font:inherit;text-align:right"';
    let bar = `<div class="tgcols" style="margin-bottom:10px"><button class="colchip${wbEditOn ? ' done' : ''}" id="wbedit">${wbEditOn ? '✓ Établi ouvert' : '✎ Remanier'}</button>`;
    if (wbEditOn) {
      bar += `<button class="colchip" id="wbrot"${wbSel && libre ? '' : ' disabled style="opacity:.45"'} title="${libre ? 'Quart de tour' : 'Interdit : ' + esc(String(wb.data.meta.sensFil)) + ' — le fil du panneau impose le sens'}">⟲ Tourner${wbSel ? ' ' + esc(wbSel.replace(/^[^-]+-/, '')) : ''}</button>`;
      if (selB) {
        // La LARGEUR d'une bande est un réglage de guide : ça se saisit au chiffre, pas à la
        // souris — et c'est ce qui marche au doigt sur la tablette d'atelier.
        bar += `<span class="colchip" style="border-color:var(--proj);color:var(--proj)">▭ ${esc(selB.label || selB.id)}</span>`;
        bar += `<span class="colchip">guide <input id="wbbl" type="number" step="0.5" min="1" value="${+bandGuide(selB)}" ${inp}></span>`;
        bar += `<span class="colchip">long. <input id="wbbL" type="number" step="0.5" min="1" value="${+bandLong(selB)}" ${inp}></span>`;
        bar += `<button class="colchip" id="wbbsens" title="Bande debout (tronçons empilés) ou couchée">⇄ ${selB.axe === 'x' ? 'couchée' : 'debout'}</button>`;
        bar += selB.poses.length
          ? `<span class="colchip" style="opacity:.45" title="Sortez d’abord ses ${selB.poses.length} pièce(s)">✕ Supprimer</span>`
          : `<button class="colchip" id="wbbdel">✕ Supprimer</button>`;
      }
      bar += `<button class="colchip" id="wbbnew">＋ Colonne</button>`;
      if (remanie) bar += `<button class="colchip" id="wbreset" title="Reprendre la proposition d'Alfred">↺ Rendre la main (${remanie})</button>`;
    }
    bar += '</div>';
    const allIss = wbEditOn ? plaques.map((pl) => [pl, wbIssues(pl)]).filter(([, m]) => m.size) : [];
    body.innerHTML = bar + plaques.map((pl) => {
      const mat = wb.matById.get(pl.materiau) || {};
      const n = (pl.etapes || []).reduce((s, st) => s + (st.type === 'tronconnage' ? (st.pieces || []).length : 0), 0);
      return `<div class="blueprint" data-plaque="${esc(pl.plaque || '')}"><div class="bp-inner"><div class="bp-h"><b>PLAQUE ${esc(pl.plaque || '')}</b><span>${esc(mat.label || pl.materiau || '')} · ${n} pièces</span></div><div class="cutwrap">${plaqueSVG(pl)}</div></div></div>`;
    }).join('')
      + (allIss.length ? `<div class="blueprint"><div class="bp-inner"><div class="bp-h"><b style="color:var(--crit)">À corriger</b><span>le débit ne passera pas en l'état</span></div><div style="font-size:12.5px;line-height:1.6;margin-top:8px">${allIss.map(([pl, m]) => [...m.entries()].map(([et, ms]) => `<div><b style="font-family:var(--f-mono)">${esc(pl.plaque)} · ${esc(et.replace(/^[^-]+-/, ''))}</b> — ${esc(ms.join(' · '))}</div>`).join('')).join('')}</div></div></div>` : '')
      + `<div class="legend"><span><i class="sw" style="background:var(--shop);opacity:.6"></i>à débiter</span><span><i class="sw" style="background:var(--ink-faint);opacity:.6"></i>débité ✓</span><span><i class="sw" style="background:var(--warn)"></i>arête à plaquer (chant)</span><span style="color:var(--ink-faint)">${wbEditOn ? 'glisser une pièce · les bords s’aimantent en ajoutant le trait de scie' : 'clic colonne → détail/débiter · clic sur le nom → la pièce'}</span></div>`;
    $('wbedit').addEventListener('click', () => { wbEditOn = !wbEditOn; wbSel = null; wbSelB = null; renderWb(); });
    if (wbEditOn) {
      wbWireEdit(body, plaques);
      $('wbrot')?.addEventListener('click', () => {
        const pl = plaques.find((p) => wbPosesEff(p).some((q) => q.et === wbSel));
        const p0 = pl && wbPosesEff(pl).find((q) => q.et === wbSel);
        if (p0) wbSavePose({ etiquette: wbSel, pose: { x: p0.x, y: p0.y, rot: !p0.rot, bande: p0.bande } });
      });
      const bnum = (el, quoi) => el?.addEventListener('change', () => {
        const v = parseFloat(el.value);
        if (!Number.isFinite(v) || v <= 0) return;
        const transv = selB.axe === 'x' ? 'h' : 'w';
        wbSavePose({ bande: { id: selB.id, [quoi === 'guide' ? transv : (transv === 'h' ? 'w' : 'h')]: v } });
      });
      bnum($('wbbl'), 'guide'); bnum($('wbbL'), 'long');
      // tourner la bande d'un quart de tour : l'axe bascule ET le rectangle pivote
      $('wbbsens')?.addEventListener('click', () => wbSavePose({ bande: { id: selB.id, axe: selB.axe === 'x' ? 'y' : 'x', w: bandBox(selB).h, h: bandBox(selB).w } }));
      $('wbbdel')?.addEventListener('click', () => { const id = selB.id; wbSelB = null; wbSavePose({ bande: { id, supprime: true } }); });
      $('wbbnew')?.addEventListener('click', () => {
        const pl = selPl || plaques[0]; if (!pl) return;
        const kerf = kerfOf(wb.data), uz = zoneUtile(wb.data, pl), parents = bandesMeres(pl);
        const leaves = [...wbBands(pl).values()].filter((b) => !parents.has(b.id)).map(bandBox);
        // à droite de ce qui existe, d'un trait de scie — sinon au bord de la zone utile
        const x = Math.min(leaves.reduce((m, r) => Math.max(m, r.x + r.w + kerf), uz.x0), Math.max(uz.x0, uz.x1 - 100));
        let n = 1; while (wbBandes()[`${pl.plaque}-N${n}`]) n++;
        const id = `${pl.plaque}-N${n}`;
        wbSelB = id;
        wbSavePose({ bande: { id, cree: true, plaque: pl.plaque, axe: 'y', x, y: uz.y0, w: 100, h: Math.min(600, uz.y1 - uz.y0) } });
      });
      $('wbreset')?.addEventListener('click', () => {
        if (confirm('Abandonner votre calepinage et reprendre celui d’Alfred ?')) { wbSel = null; wbSelB = null; wbSavePose({ reset: true }); }
      });
    } else {
      body.querySelectorAll('.colc').forEach((gEl) => gEl.addEventListener('click', () => showColonne(gEl.dataset.band)));
      body.querySelectorAll('.pname').forEach((t) => t.addEventListener('click', (e) => { e.stopPropagation(); showPiece(t.dataset.et); }));
    }
  }
  // Vue TRONÇONS (2ᵉ station) : la plaque refendue, on raisonne PAR COLONNE. On regroupe les
  // colonnes identiques (même largeur + mêmes longueurs de tronçons) → une bande horizontale
  // cotée par type, avec la longueur de chaque tronçon ET la position de coupe cumulée (butée),
  // et une pastille cochable par colonne (= son tronçonnage fait).
  function renderTronconnage(body, st) {
    const groups = new Map();
    for (const pl of stPlaques(st)) {
      // on groupe par BANDE (l'objet réel de l'atelier), pas par étape : une pièce déplacée à
      // l'établi change de colonne, et c'est dans sa nouvelle colonne qu'elle doit apparaître
      const bands = wbBands(pl);
      wbPosesEff(pl, bands);
      for (const band of bands.values()) {
        if (!band.poses.length) continue;
        const long = band.axe === 'x';
        const bb = bandBox(band);
        // Positions RÉELLES ramenées dans le repère de la BANDE : `a` court le long, `c` en
        // travers — le cumul d'autrefois écrasait le « deux pièces côte à côte en travers ».
        const troncs = band.poses.map((r) => ({
          et: r.et,
          a0: long ? r.x - bb.x : r.y - bb.y,
          c0: long ? r.y - bb.y : r.x - bb.x,
          al: long ? r.w : r.h, cr: long ? r.h : r.w,
          swap: long ? !r.rot : !!r.rot,   // la longueur (u) de la pièce court-elle le long de la bande ?
          chants: r.chants,
          haut: (wb.byEtq.get(r.et) || {}).haut,
        })).sort((u, v) => u.a0 - v.a0 || u.c0 - v.c0);
        const largeur = bandGuide(band);
        // la GÉOMÉTRIE entre dans la signature (et les chants) : deux colonnes ne se regroupent
        // que si elles se débitent vraiment pareil
        const sig = largeur + '|' + troncs.map((t) => `${t.a0},${t.c0},${t.al},${t.cr}${t.chants.length ? ':' + t.chants.join('+') : ''}${t.haut ? '^' + t.haut : ''}`).join('-');
        if (!groups.has(sig)) groups.set(sig, { largeur, troncs, colonnes: [] });
        groups.get(sig).colonnes.push({ id: pl.plaque + (band.label || String(band.id).split('-').pop()), stepId: band.stepId, done: band.done, etqs: troncs.map((t) => t.et) });
      }
    }
    if (!groups.size) { body.innerHTML = '<div class="empty">Pas de colonnes.</div>'; return; }
    const S2 = WS, pad = 24;
    const sorted = [...groups.values()].sort((a, b) => b.largeur - a.largeur);
    const tot = (g) => g.troncs.reduce((m, t) => Math.max(m, t.a0 + t.al), 0);   // étendue réelle de la bande
    const W0 = Math.max(...sorted.map(tot)) * S2 + pad * 2;   // le plus large des groupes
    let html = `<div class="lede" style="margin-bottom:12px">Plaques refendues → tronçonnage. Chaque type de colonne (identiques regroupées ×N), ses tronçons cotés, et la position de coupe cumulée (butée) — <b>à la même échelle</b> d'une bande à l'autre. Cocher une colonne = tronçonnée.</div>`;
    for (const g of sorted) {
      const total = tot(g);
      const bh = Math.round(g.largeur * S2), top = 12, Hc = bh + top + 62;   // hauteur = largeur RÉELLE (même échelle) → ratio fidèle ; +place pour les cotes et la butée
      let svg = `<svg viewBox="0 0 ${Math.round(W0)} ${Hc}" ${wbPart(W0)}><g transform="translate(${pad},${top})">`;
      svg += `<rect x="0" y="0" width="${total * S2}" height="${bh}" rx="3" fill="var(--shop)" fill-opacity=".07" stroke="var(--shop)" stroke-width="2"/>`;
      // largeur cotée sur le flanc (façon plan : largeur en Y, longueur en X)
      // COTE largeur sur le flanc — style cote : ligne + empattements + valeur (unité incluse)
      const fx = -7;
      svg += `<line x1="${fx}" y1="0" x2="${fx}" y2="${bh}" stroke="var(--ink-soft)" stroke-width="1"/><line x1="${fx - 3}" y1="0" x2="${fx + 3}" y2="0" stroke="var(--ink-soft)" stroke-width="1"/><line x1="${fx - 3}" y1="${bh}" x2="${fx + 3}" y2="${bh}" stroke="var(--ink-soft)" stroke-width="1"/>`;
      svg += `<text x="${fx - 6}" y="${bh / 2}" transform="rotate(-90 ${fx - 6} ${bh / 2})" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--f-mono)" font-size="${FS.rep}">${g.largeur} mm</text>`;
      for (const t of g.troncs) {
        const x = t.a0 * S2, y = t.c0 * S2, w = t.al * S2, h = t.cr * S2;
        const short = t.et.replace(/^[^-]+-/, '');
        const tv = h > w * 1.25, tcx = x + w / 2, tcy = y + h / 2;   // même convention qu'en vue Plaques
        const ttr = tv ? ` transform="rotate(-90 ${tcx.toFixed(1)} ${tcy.toFixed(1)})"` : '';
        const nf = fitNom(tv ? h : w, short);
        svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="var(--shop)" fill-opacity=".15" stroke="var(--shop)" stroke-width="1" stroke-opacity=".5"/>`;
        // chants : SEULES les arêtes plaquées se surlignent, placées par `swap`
        if (t.chants.length) svg += chantSVG(chantEdges(t.chants, { x: x + 1.5, y: y + 1.5, w: w - 3, h: h - 3 }, t.swap), 3);
        svg += hautMark(t.haut, { x: x + 2, y: y + 2, w: w - 4, h: h - 4 }, t.swap, FS.note);
        svg += `<text class="pname" data-et="${esc(t.et)}" x="${tcx.toFixed(1)}" y="${(tcy + 3).toFixed(1)}"${ttr} text-anchor="middle" fill="var(--ink)" font-family="var(--f-mono)" font-size="${nf.toFixed(1)}" font-weight="700" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(short)}</text>`;
      }
      // COTES : une par TRANCHE le long de la bande — deux pièces en travers partagent la leur,
      // c'est une seule coupe de tronçonnage. Puis la BUTÉE : la position cumulée de chaque trait.
      const slices = [];
      for (const t of g.troncs) if (!slices.some((s) => Math.abs(s.a0 - t.a0) < 0.01 && Math.abs(s.al - t.al) < 0.01)) slices.push({ a0: t.a0, al: t.al });
      slices.sort((u, v) => u.a0 - v.a0);
      const cy = bh + 15;
      let lastCx = -1e9, crow = 0;
      for (const s of slices) {
        const x = s.a0 * S2, w = s.al * S2;
        // tranche étroite collée à la précédente : la cote descend d'un rang plutôt que de
        // s'imprimer par-dessus sa voisine (le corps a grossi, l'encombrement aussi)
        crow = (x - lastCx) < 46 ? 1 - crow : 0;
        lastCx = x;
        svg += `<line x1="${(x + 2).toFixed(1)}" y1="${cy}" x2="${(x + w - 2).toFixed(1)}" y2="${cy}" stroke="var(--ink-soft)" stroke-width="1"/><line x1="${(x + 2).toFixed(1)}" y1="${cy - 3}" x2="${(x + 2).toFixed(1)}" y2="${cy + 3}" stroke="var(--ink-soft)" stroke-width="1"/><line x1="${(x + w - 2).toFixed(1)}" y1="${cy - 3}" x2="${(x + w - 2).toFixed(1)}" y2="${cy + 3}" stroke="var(--ink-soft)" stroke-width="1"/>`;
        svg += `<text x="${(x + w / 2).toFixed(1)}" y="${cy - 4 + crow * 12}" text-anchor="middle" fill="var(--ink)" font-family="var(--f-mono)" font-size="${FS.cote}" font-weight="800" paint-order="stroke" stroke="var(--surface)" stroke-width="4">${+s.al.toFixed(1)} mm</text>`;
      }
      // Une butée par TRAIT, pas par arête : la fin d'une tranche et le début de la suivante ne
      // sont séparés que du trait de scie — c'est la même coupe, une seule position de guide.
      const kerf = wb.data.meta?.kerf ?? 4;
      const butees = [];
      for (const b of [...new Set(slices.flatMap((s) => [s.a0, s.a0 + s.al]))].sort((u, v) => u - v))
        if (!butees.length || b - butees[butees.length - 1] > kerf + 0.01) butees.push(b);
      let lastBx = -1e9, brow = 0;
      for (const b of butees) {
        const bx = b * S2;
        brow = bx - lastBx < 24 ? 1 - brow : 0;   // encore trop serré → deux rangs, jamais l'un sur l'autre
        lastBx = bx;
        svg += `<text x="${bx.toFixed(1)}" y="${cy + 17 + brow * 10}" text-anchor="middle" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="${FS.note}">${+b.toFixed(1)}</text>`;
      }
      svg += `</g></svg>`;
      const chips = g.colonnes.map((c) => c.stepId
        ? `<button class="colchip${c.done ? ' done' : ''}" data-tick="${esc(c.stepId)}" title="${esc(c.etqs.join(', '))}">${c.done ? '✓ ' : ''}${esc(c.id)}</button>`
        : `<span class="colchip" style="opacity:.5" title="colonne sans étape de tronçonnage — à consolider par Alfred">${esc(c.id)}</span>`).join('');
      html += `<div class="blueprint"><div class="bp-inner"><div class="bp-h"><b>Guide ${g.largeur} mm</b><span>${g.troncs.length} tronçon${g.troncs.length > 1 ? 's' : ''} · ×${g.colonnes.length} colonne${g.colonnes.length > 1 ? 's' : ''}</span></div><div class="cutwrap">${svg}</div><div class="tgcols">${chips}</div></div></div>`;
    }
    // même pied de page que Plaques : la légende des conventions de la vue
    html += `<div class="legend"><span><i class="sw" style="background:var(--shop);opacity:.6"></i>tronçon</span><span><i class="sw" style="background:var(--warn)"></i>côté plaqué (chant)</span><span style="color:var(--ink-faint)">cocher une pastille = colonne tronçonnée · clic sur le nom → la pièce</span></div>`;
    body.innerHTML = html;
    body.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', () => tick(b.dataset.tick, !wbDone(b.dataset.tick))));
    body.querySelectorAll('.pname[data-et]').forEach((t) => t.addEventListener('click', () => showPiece(t.dataset.et)));
  }
  // Vue RAINURAGE (station) : pièces rainurées regroupées par réglage, schéma coté de la
  // rainure (section + position), pastille cochable par pièce (clé synthétique rainure-<étq>).
  function renderRainurage(body, st) {
    const groups = new Map();
    for (const p of wb.data.pieces || []) if (stModOk(st, p.module)) for (const pr of p.preparations || []) if (pr.type === 'rainure') {
      const sig = (pr.pos || '') + '|' + (pr.cotes || '');
      if (!groups.has(sig)) groups.set(sig, { pos: pr.pos || '', cotes: pr.cotes || '', pieces: [] });
      groups.get(sig).pieces.push(p);
    }
    if (!groups.size) { body.innerHTML = '<div class="empty">Aucune rainure.</div>'; return; }
    const S2 = 0.33, padL = 42, padR = 14, padT = 16;   // MÊME format que les autres vues (dessus, échelle commune)
    const W = Math.max(...[...groups.values()].map((g) => g.pieces[0].longueur || 1)) * S2 + padL + padR;
    let html = `<div class="lede" style="margin-bottom:12px">Vue de dessus du panneau, <b>à l'échelle</b> : la rainure (<span style="color:var(--proj)">▬</span> bande) court le long, à 10 mm du bord <b>arrière</b> — minuscule sur la largeur (620−10−8). Traversante d'un bout, arrêt de l'autre · profondeur en cote écrite (invisible de dessus). Cocher = rainurée.</div>`;
    for (const g of groups.values()) {
      const p0 = g.pieces[0], len = p0.longueur, larg = p0.largeur;
      const gw = +((g.cotes.match(/largeur\s*(\d+)/) || [])[1]) || 8, gd = +((g.cotes.match(/prof\.?\s*~?\s*(\d+)/) || [])[1]) || 9, off = +((g.pos.match(/(\d+)\s*mm/) || [])[1]) || 10;
      const bh = larg * S2, botC = 22, gTop = bh - (off + gw) * S2;   // rainure à `off` du bord ARRIÈRE (bas)
      let svg = `<svg viewBox="0 0 ${Math.round(W)} ${Math.round(padT + bh + botC)}" style="max-width:100%;height:auto"><g transform="translate(${padL},${padT})">`;
      svg += `<rect x="0" y="0" width="${len * S2}" height="${bh}" rx="3" fill="var(--shop)" fill-opacity=".06" stroke="var(--shop)" stroke-width="1.5"/>`;
      svg += `<rect x="0" y="${gTop}" width="${len * S2 - off * S2}" height="${Math.max(gw * S2, 2)}" fill="var(--proj)" fill-opacity=".6" stroke="var(--proj)" stroke-width="1"/>`;
      svg += `<line x1="-9" y1="${bh}" x2="-9" y2="${gTop + gw * S2}" stroke="var(--ink-soft)" stroke-width="1"/><line x1="-12" y1="${bh}" x2="-6" y2="${bh}" stroke="var(--ink-soft)" stroke-width="1"/><line x1="-12" y1="${gTop + gw * S2}" x2="-6" y2="${gTop + gw * S2}" stroke="var(--ink-soft)" stroke-width="1"/><text x="-14" y="${(bh + gTop + gw * S2) / 2 + 3}" text-anchor="end" fill="var(--ink-soft)" font-family="var(--f-mono)" font-size="8.5">${off}</text>`;
      svg += `<text x="-14" y="9" text-anchor="end" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="8">avant</text><text x="-14" y="${bh - 1}" text-anchor="end" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="8">arr.</text>`;
      svg += `<text x="0" y="${bh + 15}" fill="var(--ink-soft)" font-family="var(--f-mono)" font-size="8.5">panneau ${len}×${larg} · rainure largeur ${gw} · profondeur ${gd} mm · traversante ◀ arrêt ▶ ${off}</text>`;
      svg += `</g></svg>`;
      const chips = g.pieces.map((p) => `<button class="colchip${wbDone('rainure-' + p.etiquette) ? ' done' : ''}" data-tick="rainure-${esc(p.etiquette)}">${wbDone('rainure-' + p.etiquette) ? '✓ ' : ''}${esc(p.etiquette.replace(/^[^-]+-/, ''))}</button>`).join('');
      html += `<div class="blueprint"><div class="bp-inner"><div class="bp-h"><b>Rainure — largeur ${gw} · prof. ${gd} mm</b><span>${g.pieces.length} pièces · ex. ${esc(p0.role)} ${len}×${larg}</span></div><div class="cutwrap">${svg}</div><div class="tgcols">${chips}</div></div></div>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', () => tick(b.dataset.tick, !wbDone(b.dataset.tick))));
  }
  /* ── Vue LAMELLO — plan par pièce, TOUT à l'échelle commune. En 3.0 il n'y a plus qu'UN
     régime : chaque prépa porte `sur` et ses points (u,v) dans le repère de la pièce — la
     fiche multi-vues rabat chaque surface fendue autour de la face, axes partagés. Dans une
     bande d'épaisseur la fente est un trait d'axe ; la vérité est dans les cotes écrites. */
  function renderLamello(body, st) {
    const groups = new Map();
    for (const p of wb.data.pieces || []) {
      if (!stModOk(st, p.module)) continue;
      const preps = prepsDe(wb.data, p).filter((pr) => pr.type === 'lamello');   // écrites + dérivées des jonctions
      if (!preps.length) continue;
      const sig = JSON.stringify({ L: p.longueur, l: p.largeur, e: epOf(wb.data, p), pr: preps, rep: p.repere || 0, role: p.role });
      if (!groups.has(sig)) groups.set(sig, { p0: p, preps, pieces: [] });
      groups.get(sig).pieces.push(p);
    }
    if (!groups.size) { body.innerHTML = '<div class="empty">Aucun lamello.</div>'; return; }
    const S2 = WS, padL = 50, padR = 14, padT = 24, gap = 8;
    const W0 = Math.max(...[...groups.values()].map((g) => (g.p0.longueur || 0) * S2)) + padL + padR + 2 * (gap + 12);
    const mk = (x, y, t) => t === 'biscuit'
      ? `<path d="M${x} ${y - 4.5} L${x + 4.5} ${y} L${x} ${y + 4.5} L${x - 4.5} ${y} Z" fill="var(--warn)" stroke="var(--warn)" stroke-width="1"/>`
      : `<circle cx="${x}" cy="${y}" r="3.6" fill="var(--shop)" fill-opacity=".45" stroke="var(--shop)" stroke-width="1.4"/>`;
    const chipsOf = (pieces) => pieces.map((p) => `<button class="colchip${wbDone('lamello-' + p.etiquette) ? ' done' : ''}" data-tick="lamello-${esc(p.etiquette)}">${wbDone('lamello-' + p.etiquette) ? '✓ ' : ''}${esc(p.etiquette.replace(/^[^-]+-/, ''))}</button>`).join('');
    let html = `<div class="lede" style="margin-bottom:12px">Plan par pièce, <b>tout à la même échelle</b> — les surfaces fendues (about, rive, contre-face) rabattues en projection alignée : la fente y est un trait, la cote fait foi. <b style="color:var(--proj)">En pointillé bleu</b> : la planche qui vient se poser, cotée depuis son bord de référence — <b>une planche en butée lit 0</b>, c'est la cote qu'on règle au sabot (jamais l'axe de la fente). <b style="color:var(--agenda)">▬ établi</b> : sur un chant, la face à poser sur le banc — la lamelleuse cote depuis elle. <span style="color:var(--shop)">●</span> Tenso/Clamex · <span style="color:var(--warn)">◆</span> biscuit · <span style="color:var(--proj)">▬</span> rainure fond.</div>`;
    const SURLBL = { face: 'face', 'contre-face': 'contre-face', 'about-gauche': 'ab. G', 'about-droit': 'ab. D', 'rive-avant': 'rive av.', 'rive-arriere': 'rive ar.' };
    for (const g of groups.values()) {
      const { p0, preps } = g, len = p0.longueur || 0, larg = p0.largeur || 0, ep = epOf(wb.data, p0);
      const bh = larg * S2, es = Math.max(ep * S2, 4);
      // les points par surface, en mm dans le repère de la pièce (u en x, v en y)
      const M = { face: [], contre: [], aG: [], aD: [], rAv: [], rAr: [] }, surs = [];
      const DST = { face: M.face, 'contre-face': M.contre, 'about-gauche': M.aG, 'about-droit': M.aD, 'rive-avant': M.rAv, 'rive-arriere': M.rAr };
      const bandes = [];   // les planches qui viennent se poser (face / contre-face)
      const APP = {};      // face posée sur l'ÉTABLI, par surface de chant (cf. `appui`)
      for (const pr of preps) {
        if (!DST[pr.sur]) continue;
        if (!surs.includes(pr.sur)) surs.push(pr.sur);
        DST[pr.sur].push(...lamPoints(pr, p0, ep));
        if (pr.appui) APP[pr.sur] = pr.appui;
        if (pr.sur === 'face' || pr.sur === 'contre-face')
          for (const li of lamLignes(pr, ep))
            bandes.push({ sur: pr.sur, li, b: ligneBande(li, li.axe === 'u' ? len : larg) });
      }
      const topE = M.rAv.length ? es + gap : 0;
      const coteBase = bh + (M.rAr.length ? es + gap : 0);
      const hasContre = M.contre.length > 0;
      const yC = coteBase + 38;
      const Hc = padT + topE + (hasContre ? yC + bh + 12 : coteBase + 30);
      let svg = `<svg viewBox="0 0 ${Math.round(W0)} ${Math.round(Hc)}" ${wbPart(W0)}><g transform="translate(${padL + es + gap},${padT + topE})">`;
      // la FACE — le repère commun : tout se rabat autour d'elle, axes partagés
      svg += `<rect x="0" y="0" width="${len * S2}" height="${bh}" rx="3" fill="var(--shop)" fill-opacity=".06" stroke="var(--shop)" stroke-width="1.5"/>`;
      svg += `<text x="3" y="10" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="${FS.note}">face</text>`;
      const rain = prepsDe(wb.data, p0).find((x) => x.type === 'rainure');
      if (rain) {
        const roff = +((String(rain.pos).match(/(\d+)\s*mm/) || [])[1]) || 10;
        const rwd = +((String(rain.cotes).match(/largeur\s*(\d+)/) || [])[1]) || 8;
        const gy = bh - (roff + rwd) * S2;
        svg += `<rect x="0" y="${gy}" width="${len * S2 - roff * S2}" height="${Math.max(rwd * S2, 2)}" fill="var(--proj)" fill-opacity=".6" stroke="var(--proj)" stroke-width="1"/>`;
      }
      // LA PLANCHE QUI ARRIVE : deux traits pointillés à ses faces, et la cote prise depuis le
      // bord de référence jusqu'à la face la plus proche — une planche en butée lit 0. C'est
      // cette cote qu'on règle au sabot, jamais l'axe de la fente.
      const planche = (yOff, sur) => {
        let o = '';
        for (const { li, b } of bandes.filter((x) => x.sur === sur)) {
          const uAxe = li.axe === 'u';
          const p1 = b.a * S2, p2 = b.b * S2, near = b.loin ? p2 : p1;
          const L1 = uAxe ? `<line x1="${p1.toFixed(1)}" y1="${yOff}" x2="${p1.toFixed(1)}" y2="${yOff + bh}"` : `<line x1="0" y1="${(yOff + p1).toFixed(1)}" x2="${len * S2}" y2="${(yOff + p1).toFixed(1)}"`;
          const L2 = uAxe ? `<line x1="${p2.toFixed(1)}" y1="${yOff}" x2="${p2.toFixed(1)}" y2="${yOff + bh}"` : `<line x1="0" y1="${(yOff + p2).toFixed(1)}" x2="${len * S2}" y2="${(yOff + p2).toFixed(1)}"`;
          const st = ` stroke="var(--proj)" stroke-width="1.4" stroke-dasharray="5 3"/>`;
          o += L1 + st + L2 + st;
          // ligne de cote depuis le bord de référence (0 = butée)
          const orig = b.loin ? (uAxe ? len * S2 : bh) : 0;
          if (uAxe) {
            const cyl = yOff + bh - 9;
            o += `<line x1="${orig}" y1="${cyl}" x2="${near.toFixed(1)}" y2="${cyl}" stroke="var(--proj)" stroke-width="1"/>`;
            o += `<text x="${((orig + near) / 2).toFixed(1)}" y="${cyl - 3}" text-anchor="middle" fill="var(--proj)" font-family="var(--f-mono)" font-size="${FS.cote}" font-weight="800" paint-order="stroke" stroke="var(--surface)" stroke-width="4">${+li.pos.toFixed(1)}</text>`;
          } else {
            const cxl = 12;
            o += `<line x1="${cxl}" y1="${(yOff + orig).toFixed(1)}" x2="${cxl}" y2="${(yOff + near).toFixed(1)}" stroke="var(--proj)" stroke-width="1"/>`;
            o += `<text x="${cxl}" y="${(yOff + (orig + near) / 2).toFixed(1)}" transform="rotate(-90 ${cxl} ${(yOff + (orig + near) / 2).toFixed(1)})" text-anchor="middle" fill="var(--proj)" font-family="var(--f-mono)" font-size="${FS.cote}" font-weight="800" paint-order="stroke" stroke="var(--surface)" stroke-width="4">${+li.pos.toFixed(1)}</text>`;
          }
        }
        return o;
      };
      svg += planche(0, 'face');
      for (const c of M.face) svg += mk(c.u * S2, c.v * S2, c.t);
      // le HAUT du meuble monté : liseré sur l'arête concernée, ou mention quand c'est une face
      svg += hautMark(p0.haut, { x: 0, y: 0, w: len * S2, h: bh }, true, FS.note);
      // bandes d'about rabattues (axe v partagé) — la fente est un trait qui traverse
      /* L'ARÊTE D'APPUI. Fraiser un CHANT se fait la planche couchée : la lamelleuse cote
         depuis son embase, donc depuis la face posée sur l'établi. Poser l'autre face décale
         la fente dans l'épaisseur et la jonction ne tombe plus en face. Le rabattement place
         la FACE du côté du dessin principal — on marque donc l'arête voulue en conséquence. */
      const appuiEdge = (x0, sur, versDessin) => {
        const a = APP[sur]; if (!a) return '';
        const xFace = versDessin ? x0 + es : x0;
        const x = a === 'face' ? xFace : (versDessin ? x0 : x0 + es);
        return `<line x1="${x}" y1="0" x2="${x}" y2="${bh}" stroke="var(--agenda)" stroke-width="3" stroke-linecap="round"/>`
          + `<text x="${x}" y="${bh / 2}" transform="rotate(-90 ${x} ${bh / 2})" text-anchor="middle" fill="var(--agenda)" font-family="var(--f-mono)" font-size="${FS.note}" font-weight="700" paint-order="stroke" stroke="var(--surface)" stroke-width="3">\u25ac \u00e9tabli</text>`;
      };
      const strip = (x0, marks) => { let o = `<rect x="${x0}" y="0" width="${es}" height="${bh}" rx="2" fill="var(--shop)" fill-opacity=".1" stroke="var(--shop)" stroke-width="1.2"/>`; for (const m of marks) o += `<line x1="${x0}" y1="${(m.v * S2).toFixed(1)}" x2="${x0 + es}" y2="${(m.v * S2).toFixed(1)}" stroke="var(--shop)" stroke-width="2"/>`; return o; };
      if (M.aG.length) svg += strip(-gap - es, M.aG) + appuiEdge(-gap - es, 'about-gauche', true) + `<text x="${-gap - es}" y="-4" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="${FS.note}">ab. G</text>`;
      if (M.aD.length) svg += strip(len * S2 + gap, M.aD) + appuiEdge(len * S2 + gap, 'about-droit', false) + `<text x="${len * S2 + gap + es}" y="-4" text-anchor="end" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="${FS.note}">ab. D</text>`;
      // rives rabattues (axe u partagé)
      const appuiRive = (y0, sur, versDessin) => {
        const a = APP[sur]; if (!a) return '';
        const yFace = versDessin ? y0 + es : y0;
        const y = a === 'face' ? yFace : (versDessin ? y0 : y0 + es);
        return `<line x1="0" y1="${y}" x2="${len * S2}" y2="${y}" stroke="var(--agenda)" stroke-width="3" stroke-linecap="round"/>`
          + `<text x="${len * S2 / 2}" y="${y - 3}" text-anchor="middle" fill="var(--agenda)" font-family="var(--f-mono)" font-size="${FS.note}" font-weight="700" paint-order="stroke" stroke="var(--surface)" stroke-width="3">\u25ac \u00e9tabli</text>`;
      };
      const rive = (y0, marks) => { let o = `<rect x="0" y="${y0}" width="${len * S2}" height="${es}" rx="2" fill="var(--shop)" fill-opacity=".1" stroke="var(--shop)" stroke-width="1.2"/>`; for (const m of marks) o += `<line x1="${(m.u * S2).toFixed(1)}" y1="${y0}" x2="${(m.u * S2).toFixed(1)}" y2="${y0 + es}" stroke="var(--shop)" stroke-width="2"/>`; return o; };
      if (M.rAv.length) svg += rive(-gap - es, M.rAv) + appuiRive(-gap - es, 'rive-avant', true) + `<text x="2" y="${-gap - es - 3}" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="${FS.note}">rive av.</text>`;
      if (M.rAr.length) svg += rive(bh + gap, M.rAr) + appuiRive(bh + gap, 'rive-arriere', false) + `<text x="2" y="${bh + gap + es + 9}" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="${FS.note}">rive ar.</text>`;
      // contre-face — PAR TRANSPARENCE (même orientation) : les cotes se lisent pareil
      if (hasContre) {
        svg += `<rect x="0" y="${yC}" width="${len * S2}" height="${bh}" rx="3" fill="var(--shop)" fill-opacity=".06" stroke="var(--shop)" stroke-width="1.5" stroke-dasharray="6 3"/>`;
        svg += `<text x="3" y="${yC + 10}" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="${FS.note}">contre-face (par transparence)</text>`;
        svg += planche(yC, 'contre-face');
        for (const c of M.contre) svg += mk(c.u * S2, yC + c.v * S2, c.t);
      }
      // cotes écrites — u sous le bloc, v à sa gauche. CHAQUE bloc porte les siennes : une
      // contre-face sans graduations est un dessin qu'on ne peut pas vérifier.
      const lx0 = -es - gap - 9;
      const grads = (yOff, base, pts, axe) => {
        let o = '';
        if (axe !== 'v') {
          // seulement les marques qu'on TRACE : un axe déduit (milieu de bande, bord imposé)
          // ne se cote pas, puisque la machine ne sait pas le viser — cf. le sabot
          const us = [...new Set(pts.filter((m) => m.u != null && m.fixe !== 'u').map((m) => m.u))].sort((a2, b2) => a2 - b2);
          o += `<line x1="0" y1="${base + 7}" x2="${len * S2}" y2="${base + 7}" stroke="var(--ink-soft)" stroke-width="0.8"/>`;
          let lastG = -1e9, grow = 0;
          for (const uv of us) {
            const x = uv * S2;
            grow = x - lastG < 26 ? 1 - grow : 0; lastG = x;
            o += `<line x1="${x}" y1="${base + 4}" x2="${x}" y2="${base + 10}" stroke="var(--ink-soft)" stroke-width="0.8"/><text x="${x}" y="${base + 19 + grow * 10}" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--f-mono)" font-size="${FS.rep}">${uv}</text>`;
          }
        }
        const vs = [...new Set(pts.filter((m) => m.v != null && m.fixe !== 'v').map((m) => m.v))].sort((a2, b2) => a2 - b2);
        o += `<line x1="${lx0}" y1="${yOff}" x2="${lx0}" y2="${yOff + bh}" stroke="var(--ink-soft)" stroke-width="0.8"/>`;
        vs.forEach((vv, i) => { const y = yOff + vv * S2, lx = lx0 - 4 - (i % 2 ? 11 : 0); o += `<line x1="${lx0 - 3}" y1="${y}" x2="${lx0 + 3}" y2="${y}" stroke="var(--ink-soft)" stroke-width="0.8"/><text x="${lx}" y="${y + 3}" text-anchor="end" fill="var(--ink-soft)" font-family="var(--f-mono)" font-size="${FS.rep}">${vv}</text>`; });
        o += `<text x="${lx0 + 3}" y="${yOff - 6}" text-anchor="end" fill="var(--ink-faint)" font-family="var(--f-mono)" font-size="${FS.note}">avant↓</text>`;
        return o;
      };
      svg += grads(0, coteBase, [...M.face, ...M.rAv, ...M.rAr, ...M.aG, ...M.aD]);
      if (hasContre) svg += grads(yC, yC + bh, M.contre);
      svg += `</g></svg>`;
      const npts = Object.values(M).reduce((n2, l) => n2 + l.length, 0);
      const hautTxt = p0.haut ? ` · haut : ${esc(SURLBL[p0.haut] || p0.haut)}` : '';
      html += `<div class="blueprint"><div class="bp-inner"><div class="bp-h"><b>${esc(p0.role || '')} · ${len} × ${larg} mm</b><span>${surs.map((x) => esc(SURLBL[x] || x)).join(' + ')} · ${npts} points · ×${g.pieces.length}${hautTxt}</span></div><div class="cutwrap">${svg}</div><div class="tgcols">${chipsOf(g.pieces)}</div></div></div>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-tick]').forEach((b2) => b2.addEventListener('click', () => tick(b2.dataset.tick, !wbDone(b2.dataset.tick))));
  }
  // Vue ASSEMBLAGE — élévation du caisson À L'ÉCHELLE : niveaux (tablettes) cotés en hauteur
  // depuis le bas + connecteurs, à côté de la séquence de montage. Done par module.
  // ————— Vue ASSEMBLAGE « ouverte » : moteur de rendu de SCÈNE (contrat front-assemblage v0.1).
  // Alfred compose une scène { cadre, noeuds } en mm ; le front calcule UNE échelle px/mm et
  // dessine le vocabulaire fermé (piece/trait/cote/feature/note/repere). Les cotes sont MESURÉES
  // depuis leurs ancres — jamais un pixel, jamais une valeur en dur côté Alfred.
  function sceneSVG(scene) {
    const cad = scene.cadre || { w: 1000, h: 1000 };
    const S = WS;              // l'échelle COMMUNE du workbook — un meuble se compare à sa plaque
    const M = 48;              // marge (cotes/notes hors cadre)
    const idx = {};
    for (const n of scene.noeuds || []) if (n.type === 'piece' && n.id) idx[n.id] = n;
    // ancre → point [x,y] en mm : [x,y] absolu, ou { ref, coin|bord, t?, du?, dv? } relatif
    const anc = (a) => {
      if (Array.isArray(a)) return [a[0] || 0, a[1] || 0];
      const p = a && a.ref && idx[a.ref]; if (!p) return [0, 0];
      let x = p.x, y = p.y;
      if (a.coin) { if (/droite/.test(a.coin)) x = p.x + p.w; if (/bas/.test(a.coin)) y = p.y + p.h; if (a.coin === 'centre') { x = p.x + p.w / 2; y = p.y + p.h / 2; } }
      if (a.bord) { const t = a.t == null ? 0.5 : a.t;
        if (a.bord === 'haut') { x = p.x + p.w * t; y = p.y; }
        else if (a.bord === 'bas') { x = p.x + p.w * t; y = p.y + p.h; }
        else if (a.bord === 'gauche') { x = p.x; y = p.y + p.h * t; }
        else if (a.bord === 'droite') { x = p.x + p.w; y = p.y + p.h * t; } }
      return [x + (a.du || 0), y + (a.dv || 0)];
    };
    const X = (mm) => (mm * S).toFixed(1);
    let g = '';
    for (const n of scene.noeuds || []) {
      if (n.type === 'piece') {
        const fant = n.fill === 'fantome';
        const skin = fant ? 'fill="none" stroke-dasharray="5 4"' : 'fill="var(--surface)" fill-opacity=".55"';
        const ref = n.ref ? ` class="pname" data-et="${esc(n.ref)}" style="cursor:pointer"` : '';
        const nid = n.id ? ` data-nid="${esc(n.id)}"` : '';   // cible du surlignage séquence (v0.2)
        g += `<rect${ref}${nid} x="${X(n.x)}" y="${X(n.y)}" width="${X(n.w)}" height="${X(n.h)}" rx="2" ${skin} stroke="var(--shop)" stroke-width="1.5"/>`;
        if (n.label) g += `<text x="${X(n.x + n.w / 2)}" y="${X(n.y + n.h / 2)}" text-anchor="middle" dominant-baseline="middle" fill="var(--ink)" font-family="var(--f-mono)" font-size="${FS.rep}" font-weight="600">${esc(n.label)}</text>`;
      } else if (n.type === 'trait') {
        const pts = (n.pts || []).map((p) => `${X(p[0])},${X(p[1])}`).join(' ');
        const dash = n.style === 'axe' ? 'stroke-dasharray="9 3 2 3"' : n.style === 'pointille' ? 'stroke-dasharray="3 3"' : '';
        g += `<polyline points="${pts}" fill="none" stroke="var(--ink-soft)" stroke-width="1.2" ${dash}/>`;
      } else if (n.type === 'cote') {
        const a = anc(n.de), b = anc(n.a), off = n.offset == null ? 28 : n.offset;
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        // le demi-millimètre existe (une colonne de 331,5) — on mesure au 0,5 près, pas à l'entier
        const dist = String(Math.round(L * 2) / 2).replace('.', ','), nx = -dy / L, ny = dx / L;
        const a2 = [a[0] + nx * off, a[1] + ny * off], b2 = [b[0] + nx * off, b[1] + ny * off];
        const mx = (a2[0] + b2[0]) / 2, my = (a2[1] + b2[1]) / 2, ang = Math.atan2(dy, dx) * 180 / Math.PI;
        g += `<line x1="${X(a[0])}" y1="${X(a[1])}" x2="${X(a2[0])}" y2="${X(a2[1])}" stroke="var(--ink-soft)" stroke-width="0.7"/>`;
        g += `<line x1="${X(b[0])}" y1="${X(b[1])}" x2="${X(b2[0])}" y2="${X(b2[1])}" stroke="var(--ink-soft)" stroke-width="0.7"/>`;
        g += `<line x1="${X(a2[0])}" y1="${X(a2[1])}" x2="${X(b2[0])}" y2="${X(b2[1])}" stroke="var(--ink)" stroke-width="1"/>`;
        g += `<text x="${X(mx)}" y="${X(my)}" transform="rotate(${ang.toFixed(0)} ${X(mx)} ${X(my)})" text-anchor="middle" dy="-3" fill="var(--ink)" font-family="var(--f-mono)" font-size="${FS.cote}" font-weight="800" paint-order="stroke" stroke="var(--surface)" stroke-width="4">${esc(n.texte || dist + ' mm')}</text>`;
      } else if (n.type === 'feature') {
        if (n.forme === 'lamello') {
          const [x, y] = anc(n.at);
          g += n.stampe === 'biscuit'
            ? `<rect x="${(x * S - 4.5).toFixed(1)}" y="${(y * S - 4.5).toFixed(1)}" width="9" height="9" transform="rotate(45 ${X(x)} ${X(y)})" fill="var(--warn)"/>`
            : `<circle cx="${X(x)}" cy="${X(y)}" r="4.5" fill="var(--shop)"/>`;
        } else if (n.forme === 'rainure') {
          const a = anc(n.de), b = anc(n.a);
          g += `<line x1="${X(a[0])}" y1="${X(a[1])}" x2="${X(b[0])}" y2="${X(b[1])}" stroke="var(--proj)" stroke-opacity=".55" stroke-width="${Math.max(2, (n.largeur || 8) * S).toFixed(1)}" stroke-linecap="round"/>`;
        } else if (n.forme === 'percage') {
          const [x, y] = anc(n.at), r = Math.max(2.5, (n.diametre || 5) * S / 2);
          g += `<circle cx="${X(x)}" cy="${X(y)}" r="${r.toFixed(1)}" fill="none" stroke="var(--ink)" stroke-width="1"/><line x1="${(x * S - r - 2).toFixed(1)}" y1="${X(y)}" x2="${(x * S + r + 2).toFixed(1)}" y2="${X(y)}" stroke="var(--ink)" stroke-width="0.6"/><line x1="${X(x)}" y1="${(y * S - r - 2).toFixed(1)}" x2="${X(x)}" y2="${(y * S + r + 2).toFixed(1)}" stroke="var(--ink)" stroke-width="0.6"/>`;
        }
      } else if (n.type === 'note') {
        const [x, y] = anc(n.at), w = (n.w || 170) * S, t = String(n.texte || '');
        g += `<rect x="${X(x)}" y="${X(y)}" width="${w.toFixed(0)}" height="22" rx="3" fill="var(--surface)" stroke="var(--ink-soft)" stroke-width="0.8"/>`;
        g += `<text x="${(x * S + 6).toFixed(1)}" y="${(y * S + 15).toFixed(1)}" fill="var(--ink)" font-family="var(--f-mono)" font-size="${FS.note}">${esc(t.length > 42 ? t.slice(0, 40) + '…' : t)}</text>`;
      } else if (n.type === 'repere') {
        const [x, y] = anc(n.at);
        if (n.vers) { const [vx, vy] = anc(n.vers); g += `<line x1="${X(x)}" y1="${X(y)}" x2="${X(vx)}" y2="${X(vy)}" stroke="var(--ink-soft)" stroke-width="0.7"/>`; }
        const ta = x > cad.w * 0.6 ? 'end' : 'start';   // près du bord droit → texte aligné à droite (anti-débordement)
        g += `<text x="${X(x)}" y="${X(y)}" text-anchor="${ta}" fill="var(--ink)" font-family="var(--f-mono)" font-size="${FS.rep}" font-weight="600" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(n.texte || '')}</text>`;
      }
    }
    const vw = Math.round(cad.w * S + 2 * M), vh = (cad.h * S + 2 * M).toFixed(0);
    return `<svg viewBox="0 0 ${vw} ${vh}" ${wbPart(vw)}><g transform="translate(${M},${M})">${g}</g></svg>`;
  }
  // Glyphes des gestes de montage (vocabulaire fermé v0.2) — inconnu ⇒ puce neutre.
  const ASMG = { poser: '▽', coller: '≋', assembler: '⋈', visser: '✱', serrer: '⊏⊐', verifier: '⊾' };
  // Surligne les pièces `ids` dans la scène `scope` (DOM direct — pas de re-render).
  function asmHi(scope, ids) {
    const set = new Set(ids);
    scope.querySelectorAll('[data-nid]').forEach((r) => {
      const on = set.has(r.getAttribute('data-nid'));
      r.setAttribute('stroke', on ? 'var(--proj)' : 'var(--shop)');
      r.setAttribute('stroke-width', on ? '3' : '1.5');
      if (r.getAttribute('fill') !== 'none') r.setAttribute('fill-opacity', on ? '.85' : '.55');
    });
  }
  function renderScenes(body, scenes) {
    const hasSeq = scenes.some((sc) => Array.isArray(sc.sequence) && sc.sequence.length);
    let html = `<div class="lede" style="margin-bottom:12px">Assemblage — <b>scène à l'échelle</b> (contrat ouvert v0.2). Cotes mesurées depuis la géométrie ; clic pièce → détail ; ${hasSeq ? 'clic étape → pièces surlignées ; cocher chaque étape.' : 'cocher = monté.'}</div>`;
    scenes.forEach((sc, si) => {
      const seq = Array.isArray(sc.sequence) ? sc.sequence : [];
      let side;
      if (seq.length) {
        const dn = seq.filter((s) => wbDone(s.key)).length;
        const rows = seq.map((s, i) => {
          const done = wbDone(s.key);
          const cib = (s.cible || []).join(',');
          const meta = [s.detail, s.outil].filter(Boolean).map((x) => `<i>${esc(x)}</i>`).join('');
          return `<div class="asmstep${done ? ' done' : ''}" data-cible="${esc(cib)}">`
            + `<button class="cbox" data-tick="${esc(s.key)}">${done ? '✓' : ''}</button>`
            + `<span class="asmno">${i + 1}</span>`
            + `<span class="asmg" title="${esc(s.geste || '')}">${ASMG[s.geste] || '•'}</span>`
            + `<span class="asmt"><b>${esc(s.titre || s.key)}</b>${meta}</span></div>`;
        }).join('');
        side = `<div class="asmseq"><div class="asmseqh">Montage — ${dn}/${seq.length}</div>${rows}</div>`;
      } else {
        const dk = 'asm-' + (sc.id || sc.titre || 'scene');
        side = `<div class="tgcols"><button class="colchip${wbDone(dk) ? ' done' : ''}" data-tick="${esc(dk)}">${wbDone(dk) ? '✓ ' : ''}Monté</button></div>`;
      }
      html += `<div class="blueprint" data-scene="${si}"><div class="bp-inner"><div class="bp-h"><b>${esc(sc.titre || 'Assemblage')}</b><span>${esc(sc.vue || '')}</span></div><div class="asmgrid"><div class="cutwrap">${sceneSVG(sc)}</div>${side}</div></div></div>`;
    });
    body.innerHTML = html;
    body.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); tick(b.dataset.tick, !wbDone(b.dataset.tick)); }));
    body.querySelectorAll('.pname[data-et]').forEach((t) => t.addEventListener('click', () => showPiece(t.dataset.et)));
    // clic sur une étape → surligne ses pièces cibles dans la scène (l'étape devient active)
    body.querySelectorAll('.asmstep').forEach((row) => row.addEventListener('click', () => {
      const bp = row.closest('.blueprint');
      bp.querySelectorAll('.asmstep.active').forEach((r) => r.classList.remove('active'));
      row.classList.add('active');
      asmHi(bp, (row.dataset.cible || '').split(',').filter(Boolean));
    }));
    // à l'affichage : surligne la 1re étape non faite de chaque scène (l'étape « en cours »)
    body.querySelectorAll('.blueprint[data-scene]').forEach((bp) => {
      const cur = [...bp.querySelectorAll('.asmstep')].find((r) => !r.classList.contains('done'));
      if (cur) { cur.classList.add('active'); asmHi(bp, (cur.dataset.cible || '').split(',').filter(Boolean)); }
    });
  }
  function renderAsm(body, st) {
    // 3.0 : l'assemblage EST une scène (le convertisseur fabrique une scène minimale pour
    // les vieux livres à élévation) — portée par module ; une scène sans module n'appartient
    // qu'aux stations non scopées.
    const scenes = (wb.data.assemblage || []).filter((x) => x && stModOk(st, x.module));
    if (!scenes.length) { body.innerHTML = '<div class="empty">Pas de scène d’assemblage.</div>'; return; }
    renderScenes(body, scenes);
  }
  function renderSuivi(body) {
    let html = '';
    for (const pl of wb.data.debit || []) {
      const steps = pl.etapes || [];
      const open = steps.filter((s) => !wbDone(s.id)).length;
      html += `<div class="sgrp"><div class="sh">Plaque ${esc(pl.plaque)} · ${open ? open + ' étape' + (open > 1 ? 's' : '') + ' restante' + (open > 1 ? 's' : '') : '✓ terminé'}</div>`;
      for (const st of steps) {
        html += `<div class="srow${wbDone(st.id) ? ' done' : ''}"><button class="cbox" data-tick="${esc(st.id)}">${wbDone(st.id) ? '✓' : ''}</button><span class="lbl">${esc(st.titre || st.id)}</span><span class="dim">${esc(st.type)}</span></div>`;
      }
      html += '</div>';
    }
    body.innerHTML = html || '<div class="empty">Aucune étape.</div>';
    body.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', () => tick(b.dataset.tick, !wbDone(b.dataset.tick))));
  }
  // Résout une bande (colonne) : sa géométrie (refente) + son étape de tronçonnage.
  function findBand(bandId) {
    for (const pl of wb.data.debit || []) {
      let band = null, troncStep = null;
      for (const st of pl.etapes || []) {
        if (st.type === 'refente') for (const b of st.bandes || []) if (b.id === bandId) band = b;
        if (st.type === 'tronconnage' && st.entree === bandId) troncStep = st;
      }
      if (band) return { plaque: pl.plaque, mat: wb.matById.get(pl.materiau) || {}, band, troncStep };
    }
    return null;
  }
  // Pop-up COLONNE : l'objet réel du débit — longueur, refente, tronçons (liens), débiter d'un bloc.
  function showColonne(bandId) {
    const f = findBand(bandId); if (!f) return;
    const { plaque, mat, band, troncStep } = f;
    const stepId = troncStep && troncStep.id;
    const on = stepId ? wbDone(stepId) : false;
    const troncs = ((troncStep && troncStep.pieces) || []).map((pose) => { const p = wb.byEtq.get(pose.etiquette) || {}; return { et: pose.etiquette, longueur: p.longueur, chants: pieceChants(p) }; });
    const body = pieceModal.querySelector('#piece-body');
    body.innerHTML = `<h2>Colonne ${esc(plaque + bandId.split('-').pop())}</h2>
      <div class="prow"><b>Plaque</b><span>${esc(plaque)}</span></div>
      <div class="prow"><b>Refente</b><span>guide ${esc(String(bandGuide(band)))} · longueur ${esc(String(Math.round(bandLong(band))))} mm${mat.ep ? ' · ép. ' + mat.ep : ''}</span></div>
      <div class="prow"><b>Matière</b><span>${esc(mat.label || '')}</span></div>
      <div class="prow"><b>Tronçons (${troncs.length})</b><span>${troncs.map((t) => `<button class="lnk" data-piece="${esc(t.et)}" style="background:none;border:0;padding:0;color:var(--accent);cursor:pointer;text-decoration:underline;font:inherit">${esc(t.et.replace(/^[^-]+-/, ''))}</button> <span style="color:var(--ink-faint)">${t.longueur}</span>${t.chants.length ? ` <span style="color:var(--warn)" title="chants">▮ ${t.chants.map(esc).join('+')}</span>` : ''}`).join('<br>')}</span></div>`;
    const actions = document.createElement('div'); actions.className = 'actions';
    if (stepId) {
      const btn = document.createElement('button');
      btn.textContent = on ? 'Colonne à refaire' : `Débiter la colonne (${troncs.length}) ✓`;
      btn.addEventListener('click', () => { pieceModal.hidden = true; tick(stepId, !on); });
      actions.append(btn);
    }
    const close = document.createElement('button'); close.textContent = 'Fermer';
    close.addEventListener('click', () => { pieceModal.hidden = true; });
    actions.append(close); body.appendChild(actions);
    body.querySelectorAll('.lnk[data-piece]').forEach((b) => b.addEventListener('click', () => showPiece(b.dataset.piece)));
    pieceModal.hidden = false;
  }
  function showPiece(etq) {
    const p = wb.byEtq.get(etq); if (!p) return;
    const loc = wb.pieceStep.get(etq) || {};
    const mat = wb.matById.get(loc.materiau) || {};
    const stepId = loc.stepId;
    const step = (wb.steps || []).find((s) => s.id === stepId);
    const sibs = step ? (step.pieces || []).map((pp) => pp.etiquette.replace(/^[^-]+-/, '')) : [];
    const body = pieceModal.querySelector('#piece-body');
    body.innerHTML = `<h2>${esc(etq)}</h2>
      <div class="prow"><b>Dimensions</b><span>${esc(pieceDims(p))} mm${mat.ep ? ' · ép. ' + mat.ep : ''}</span></div>
      ${pieceChants(p).length ? `<div class="prow"><b>Chants</b><span style="color:var(--warn)">${pieceChants(p).map(esc).join(' · ')}</span></div>` : ''}
      ${p.haut ? `<div class="prow"><b>Haut (monté)</b><span style="color:var(--proj)">▲ ${esc(p.haut)}</span></div>` : ''}
      <div class="prow"><b>Matière</b><span>${esc(mat.label || loc.materiau || '—')}</span></div>
      <div class="prow"><b>Colonne</b><span>${esc(step?.entree || '?')} · plaque ${esc(loc.plaque || '?')}</span></div>
      ${sibs.length > 1 ? `<div class="prow"><b>Tronçons</b><span>${sibs.map(esc).join(' · ')}</span></div>` : ''}
      ${(p.preparations || []).length ? `<div class="prow"><b>Préparations</b><span>${p.preparations.map((pr) => esc(`${pr.type}${pr.sur ? ' (sur ' + pr.sur + ')' : ''} ${pr.cotes || ''} ${pr.pos || ''}`)).join('<br>')}</span></div>` : ''}
      ${p.placeAssemblage ? `<div class="prow"><b>Assemblage</b><span>${esc(p.placeAssemblage)}</span></div>` : ''}`;
    const actions = document.createElement('div'); actions.className = 'actions';
    if (stepId) {
      const on = wbDone(stepId);
      const tickBtn = document.createElement('button');
      tickBtn.textContent = on ? 'Colonne à refaire' : `Débiter la colonne (${sibs.length} pièce${sibs.length > 1 ? 's' : ''}) ✓`;
      tickBtn.addEventListener('click', () => { pieceModal.hidden = true; tick(stepId, !on); });
      actions.append(tickBtn);
    }
    const close = document.createElement('button'); close.textContent = 'Fermer';
    close.addEventListener('click', () => { pieceModal.hidden = true; });
    actions.append(close); body.appendChild(actions);
    pieceModal.hidden = false;
  }
  function renderShop() {
    const bodyEl = atelierFull.querySelector('#atelier-body');
    const steps = wb.steps || [];
    const total = steps.length;
    const remaining = steps.filter((s) => !wbDone(s.id));
    if (!remaining.length) { bodyEl.innerHTML = `<div class="etq">Terminé 🎉</div><div class="dims">${total} étapes faites</div>`; return; }
    const cur = remaining[0];
    const doneCount = total - remaining.length;
    const detail = cur.type === 'tronconnage'
      ? (cur.pieces || []).map((p) => p.etiquette.replace(/^[^-]+-/, '')).join(' · ')
      : cur.type === 'refente'
        ? 'bandes ' + (cur.bandes || []).map((b) => bandGuide(b)).join(' · ') + ' mm'
        : '';
    bodyEl.innerHTML = `<div class="reg">Plaque ${esc(cur.plaque)} · ${esc(cur.type)}</div><div class="etq">${esc(cur.titre || cur.id)}</div>
      <div class="dims">${esc(detail)}</div>`;
    const btn = document.createElement('button'); btn.className = 'done-btn'; btn.textContent = 'FAIT ✓';
    btn.addEventListener('click', () => tick(cur.id, true)); bodyEl.appendChild(btn);
    bodyEl.insertAdjacentHTML('beforeend', `<div class="progress"><div style="width:${Math.round(100 * doneCount / total)}%"></div></div><div class="pcount">${doneCount}/${total} étapes</div>`);
  }

  return {
    routes: {
      atelier: () => renderAtelierHub(),
      'atelier/': (reste) => renderWorkbook(reste),
    },
  };
}
