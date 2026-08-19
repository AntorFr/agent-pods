/* ── Le contrat workbook 3.0, en code exécutable (cf. plugins/atelier/ATELIER-3.md) ──────────
   UNE source pour trois consommateurs : l'établi (bundlé dans le lanceur), le CLI
   valide/migre (node, livré par l'image), et la conversion au chargement. Écrire une
   règle ici, c'est l'écrire partout — c'est le point du chantier 3.0.

   Le repère de pièce (D1) :
     u : 0 → longueur (about-gauche → about-droit)
     v : 0 → largeur  (rive-avant → rive-arriere)
     faces : face / contre-face
   Une pose : rot=false → u le long de x (la pièce posée comme elle se dessine).
   Une bande (D2) : rectangle {x,y,w,h} + axe ("y" = debout, tronçons empilés en y). */

export const SURFACES = ['face', 'contre-face', 'rive-avant', 'rive-arriere', 'about-gauche', 'about-droit'];
export const CHANTS = ['rive-avant', 'rive-arriere', 'about-gauche', 'about-droit', 'abouts'];
// `haut` : la surface qui regarde le PLAFOND une fois le meuble monté. Ce n'est PAS
// déductible du débit (un flan couché sur la plaque ne dit pas comment il se dresse) — c'est
// une donnée d'assemblage, et c'est ce qui évite de fraiser une pièce à l'envers.
export const HAUTS = SURFACES;
// `appui` : sur une prépa de CHANT (about ou rive), la face qu'on pose sur l'établi. La
// lamelleuse prend sa cote depuis son embase, donc depuis cette face — la choisir à l'envers
// décale la fente dans l'épaisseur et la jonction ne tombe plus en face. Elle doit être celle
// qui regarde le bord de référence utilisé par la prépa de FACE d'en face (`depuis`).
export const APPUIS = ['face', 'contre-face'];
export const estChant = (sur) => String(sur || '').startsWith('about') || String(sur || '').startsWith('rive');
export const GESTES = ['poser', 'coller', 'assembler', 'visser', 'serrer', 'verifier'];
export const ST_TYPES = ['debit', 'tronconnage', 'rainure', 'lamello', 'assemblage', 'suivi'];

/* ── accès géométrie ─────────────────────────────────────────────────── */
export const matOf = (wb, id) => (wb.materiaux || []).find((m) => m.id === id) || {};
export const pieceMat = (wb, p) => matOf(wb, p.materiau).id ? matOf(wb, p.materiau) : ((wb.materiaux || [])[0] || {});
export const epOf = (wb, p) => p.ep || pieceMat(wb, p).ep || 19;
export const kerfOf = (wb) => wb.meta?.kerf ?? 4;

export function zoneUtile(wb, pl) {
  const m = matOf(wb, pl.materiau);
  const L = m.plaque?.l || 2800, H = m.plaque?.h || 2070, d = m.derasage || 0;
  return { x0: d, y0: d, x1: L - d, y1: d ? H - d : H, L, H, d };
}

export const bandBox = (b) => ({ x: b.x || 0, y: b.y || 0, w: b.w || 0, h: b.h || 0 });
// le réglage du guide EST la dimension transverse — il ne peut pas mentir
export const bandGuide = (b) => (b.axe === 'x' ? b.h || 0 : b.w || 0);
export const bandLong = (b) => (b.axe === 'x' ? b.w || 0 : b.h || 0);

// empreinte d'une pose sur la plaque — rot=false : u (longueur) le long de x
export function poseRect(piece, pose) {
  const u = piece?.longueur || 0, v = piece?.largeur || 0;
  return { x: pose.x || 0, y: pose.y || 0, w: pose.rot ? v : u, h: pose.rot ? u : v };
}

// les arêtes d'un jeu de chants, sur un rect posé (uAlongX = !rot)
export function chantEdges(chants, r, uAlongX) {
  const top = [r.x, r.y, r.x + r.w, r.y], bot = [r.x, r.y + r.h, r.x + r.w, r.y + r.h];
  const lef = [r.x, r.y, r.x, r.y + r.h], rig = [r.x + r.w, r.y, r.x + r.w, r.y + r.h];
  const out = [];
  for (const c of chants || []) {
    if (c === 'rive-avant') out.push(uAlongX ? top : lef);
    else if (c === 'rive-arriere') out.push(uAlongX ? bot : rig);
    if (c === 'about-gauche' || c === 'abouts') out.push(uAlongX ? lef : top);
    if (c === 'about-droit' || c === 'abouts') out.push(uAlongX ? rig : bot);
  }
  return out;
}

/* ── lamello 3.0 : une surface + des lignes (faces) ou des points (chants) ──
   Une ligne fixe UNE coordonnée (sa clé `u:` ou `v:` nomme l'axe), ses points donnent
   l'autre. Sur un chant, la coordonnée transverse est imposée par la surface : les
   points portent la seule libre (v sur un about, u sur une rive).

   ⚠️ LE SABOT. Sur une face, une ligne ne décrit PAS l'axe des fentes : elle dit où vient
   se poser la planche voisine. La Zeta se cale au **sabot** contre une face de cette
   planche — on ne vise jamais un axe. Donc :
     `pos` (la valeur de `u:`/`v:`) = distance du bord de RÉFÉRENCE à la face la plus
        proche de la planche qui arrive → une planche en butée sur le bord vaut 0 ;
     `depuis` = ce bord de référence (défaut : l'origine de l'axe) ;
     `ep` = épaisseur de la planche qui arrive (défaut : celle de la pièce).
   La fente tombe au MILIEU de cette bande — c'est ce que rend `lamPoints`. */
export const ligneAxe = (l) => (l.u != null ? 'u' : 'v');
export function lamLignes(pr, epDefaut) {
  return (pr.lignes || []).map((l) => {
    const axe = ligneAxe(l);
    return { axe, pos: (axe === 'u' ? l.u : l.v) || 0, ep: l.ep ?? epDefaut,
      depuis: l.depuis || (axe === 'u' ? 'about-gauche' : 'rive-avant'), points: l.points || [] };
  });
}
// la bande occupée par la planche qui arrive, en absolu sur l'axe (dim = longueur ou largeur)
export function ligneBande(li, dim) {
  const loin = li.depuis === 'about-droit' || li.depuis === 'rive-arriere';
  const a = loin ? dim - li.pos - li.ep : li.pos;
  return { a, b: a + li.ep, mid: a + li.ep / 2, loin };
}
// Chaque point rend AUSSI `fixe` : la coordonnée qui est DÉDUITE (le milieu de la bande, ou
// le bord imposé par la surface) et non pointée à la main. L'autre est une marque qu'on trace
// vraiment sur la pièce. La distinction compte : l'outil ne sait viser qu'une référence, donc
// on ne cote jamais un axe déduit — il se dessine, il ne s'écrit pas.
export function lamPoints(pr, piece, epDefaut) {
  const out = [];
  const L = piece?.longueur || 0, V = piece?.largeur || 0;
  for (const li of lamLignes(pr, li0(epDefaut, piece))) {
    const { mid } = ligneBande(li, li.axe === 'u' ? L : V);
    for (const q of li.points) out.push(li.axe === 'u'
      ? { u: mid, v: q.v ?? 0, t: q.t, fixe: 'u' } : { u: q.u ?? 0, v: mid, t: q.t, fixe: 'v' });
  }
  // sur un chant, la surface impose la coordonnée transverse : v sur un about, u sur une rive
  const fixeChant = String(pr.sur || '').startsWith('about') ? 'u' : 'v';
  for (const q of pr.points || []) out.push({ u: q.u ?? 0, v: q.v ?? 0, t: q.t, fixe: fixeChant });
  return out;
}
const li0 = (epDefaut, piece) => (Number.isFinite(epDefaut) ? epDefaut : Number.isFinite(piece?.ep) ? piece.ep : 19);

/* ── D8 : `jonctions[]`, la source unique d'une jonction ─────────────────
   Une jonction s'usine sur DEUX pièces. Écrite deux fois, rien ne garantissait qu'elle le
   soit des deux bords, ni que les deux moitiés s'accordent, ni que l'`appui` d'un côté
   réponde au `depuis` de l'autre. Elle s'écrit désormais UNE fois et les préparations en
   DÉRIVENT — c'est ce qui rend ces trois fautes structurellement impossibles.

     porte  : la pièce qui reçoit sur sa face  { piece, sur, pos, depuis }
     arrive : la pièce qui arrive par son chant { piece, sur, appui, origine?, inverse? }
     connecteurs[].a : la position LE LONG de la jonction, dans le repère de la porteuse.
   Chez l'arrivante, la même fente vaut `a - origine` (ou `origine - a` si `inverse`). */

// `depuis` nomme un bord ⇒ la ligne de la porteuse court sur l'axe perpendiculaire, et les
// positions `a` tombent sur l'axe restant. L'axe se déduit, il ne se déclare jamais.
export const axeDe = (bord) => (String(bord || '').startsWith('about') ? 'u' : 'v');
const axeChant = (sur) => (String(sur || '').startsWith('about') ? 'v' : 'u');

export function jonctionPreps(j) {
  const out = [];
  const po = j.porte || {}, ar = j.arrive || {};
  const cs = j.connecteurs || [];
  if (po.piece && po.sur) {
    const axe = axeDe(po.depuis), autre = axe === 'u' ? 'v' : 'u';
    out.push([po.piece, {
      type: 'lamello', sur: po.sur, jonction: j.id,
      lignes: [{ [axe]: po.pos ?? 0, depuis: po.depuis, ...(po.ep != null ? { ep: po.ep } : {}),
        points: cs.map((c) => ({ [autre]: c.a, t: c.t })) }],
      ...(j.note ? { note: j.note } : {}),
    }]);
  }
  if (ar.piece && ar.sur) {
    const o = ar.origine || 0, libre = axeChant(ar.sur);
    out.push([ar.piece, {
      type: 'lamello', sur: ar.sur, jonction: j.id,
      ...(ar.appui ? { appui: ar.appui } : {}),
      points: cs.map((c) => ({ [libre]: ar.inverse ? o - c.a : c.a - o, t: c.t })),
      ...(j.note ? { note: j.note } : {}),
    }]);
  }
  return out;
}

// Les préparations EFFECTIVES d'une pièce : celles écrites à la main + celles dérivées des
// jonctions. Le rendu et le suivi ne voient que cette somme.
export function prepsDe(wb, piece) {
  const out = [...(piece.preparations || [])];
  for (const j of wb.jonctions || [])
    for (const [et, pr] of jonctionPreps(j)) if (et === piece.etiquette) out.push(pr);
  return out;
}

/* ── l'état EFFECTIF d'une plaque : fichier + calque de l'établi ─────────
   `layout` = workbook-layout.json ({poses, bandes}) ; absent → l'état du fichier. */
export function plaqueBands(wb, pl, layout) {
  const bands = new Map();
  for (const st of pl.etapes || []) if (st.type === 'refente')
    for (const b of st.bandes || []) bands.set(b.id, { ...b, poses: [], stepOf: null });
  for (const [id, ov] of Object.entries(layout?.bandes || {})) {
    if (ov.supprime) { bands.delete(id); continue; }
    const base = bands.get(id);
    if (base) bands.set(id, { ...base, ...ov, poses: [] });
    else if (ov.cree && ov.plaque === pl.plaque) bands.set(id, { id, axe: 'y', x: 0, y: 0, w: 0, h: 0, ...ov, poses: [] });
  }
  return bands;
}

export function plaquePoses(wb, pl, layout, bands) {
  const byEtq = new Map((wb.pieces || []).map((p) => [p.etiquette, p]));
  const out = [];
  for (const st of pl.etapes || []) if (st.type === 'tronconnage') {
    for (const pose of st.pieces || []) {
      const eff = { ...pose, ...((layout?.poses || {})[pose.etiquette] || {}) };
      const p = byEtq.get(pose.etiquette) || {};
      const r = poseRect(p, eff);
      r.et = pose.etiquette; r.rot = !!eff.rot;
      r.bande = eff.bande || st.entree; r.stepId = st.id;
      r.chants = (p.chants || []).filter((c) => CHANTS.includes(c));
      out.push(r);
      if (bands) bands.get(r.bande)?.poses.push(r);
    }
  }
  return out;
}

// les bandes CONSOMMÉES par une refente aval : leurs filles vivent dedans, elles ne
// comptent pas dans le pavage (le dégrossissage du claustra est légal)
export function bandesMeres(pl) {
  const s = new Set();
  for (const st of pl.etapes || []) if (st.type === 'refente' && st.entree && st.entree !== 'plaque') s.add(st.entree);
  return s;
}

/* ── les règles physiques, appliquées à une plaque effective ─────────────
   Rend Map<clé → griefs[]> ; clé = étiquette de pièce, ou "▭ <id>" pour une bande. */
export function issuesPlaque(wb, pl, layout) {
  const kerf = kerfOf(wb), uzn = zoneUtile(wb, pl);
  const bands = plaqueBands(wb, pl, layout);
  const poses = plaquePoses(wb, pl, layout, bands);
  const iss = new Map();
  const add = (k, m) => { if (!iss.has(k)) iss.set(k, []); if (!iss.get(k).includes(m)) iss.get(k).push(m); };

  for (const r of poses) {
    if (r.x < uzn.x0 - 0.01 || r.y < uzn.y0 - 0.01 || r.x + r.w > uzn.x1 + 0.01 || r.y + r.h > uzn.y1 + 0.01) add(r.et, 'hors zone utile');
    const b = bands.get(r.bande);
    if (!b) add(r.et, `colonne inconnue « ${r.bande} »`);
    else {
      const bb = bandBox(b);
      if (r.x < bb.x - 0.01 || r.y < bb.y - 0.01 || r.x + r.w > bb.x + bb.w + 0.01 || r.y + r.h > bb.y + bb.h + 0.01) add(r.et, `déborde de ${b.id}`);
    }
  }
  const kerfPair = (a, b, ka, kb) => {
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) { add(ka, `chevauche ${kb}`); add(kb, `chevauche ${ka}`); return; }
    const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
    const gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    const m = `trait de scie < ${kerf} mm`;
    if ((gy < -0.01 && gx > -0.01 && gx < kerf - 0.01) || (gx < -0.01 && gy > -0.01 && gy < kerf - 0.01)) { add(ka, m); add(kb, m); }
  };
  for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++)
    kerfPair(poses[i], poses[j], poses[i].et, poses[j].et);

  const meres = bandesMeres(pl);
  const feuilles = [...bands.values()].filter((b) => !meres.has(b.id));
  for (const b of feuilles) {
    const r = bandBox(b), k = '▭ ' + b.id;
    if (!(r.w > 0) || !(r.h > 0)) { add(k, 'largeur ou longueur nulle'); continue; }
    if (r.x < uzn.x0 - 0.01 || r.y < uzn.y0 - 0.01 || r.x + r.w > uzn.x1 + 0.01 || r.y + r.h > uzn.y1 + 0.01) add(k, 'hors zone utile');
  }
  for (let i = 0; i < feuilles.length; i++) for (let j = i + 1; j < feuilles.length; j++)
    kerfPair(bandBox(feuilles[i]), bandBox(feuilles[j]), '▭ ' + feuilles[i].id, '▭ ' + feuilles[j].id);
  return iss;
}

/* ── la validation complète d'un workbook 3.0 (structure + physique) ───── */
export function valide(wb) {
  const E = [];
  if (wb.schemaVersion !== '3.0') E.push(`schemaVersion « ${wb.schemaVersion} » — valider s'applique au 3.0 (passer par normalise/migre)`);
  const etqs = new Set();
  for (const p of wb.pieces || []) {
    if (etqs.has(p.etiquette)) E.push(`pièce dupliquée : ${p.etiquette}`);
    etqs.add(p.etiquette);
    if (!(p.longueur > 0) || !(p.largeur > 0)) E.push(`${p.etiquette} : longueur/largeur > 0 requis`);
    for (const c of p.chants || []) if (!CHANTS.includes(c)) E.push(`${p.etiquette} : chant inconnu « ${c} » (${CHANTS.join(', ')})`);
    for (const pr of prepsDe(wb, p)) {
      if (pr.type !== 'lamello') continue;
      if (!SURFACES.includes(pr.sur)) E.push(`${p.etiquette} : lamello.sur « ${pr.sur} » hors vocabulaire (${SURFACES.join(', ')})`);
      const surFace = pr.sur === 'face' || pr.sur === 'contre-face';
      if (surFace && !(pr.lignes || []).length) E.push(`${p.etiquette} : lamello sur ${pr.sur} sans lignes[]`);
      if (!surFace && !(pr.points || []).length) E.push(`${p.etiquette} : lamello sur ${pr.sur} sans points[]`);
      for (const l of pr.lignes || []) {
        if ((l.u == null) === (l.v == null)) E.push(`${p.etiquette} : une ligne fixe UNE coordonnée (u: OU v:)`);
        for (const q of l.points || []) if ((l.u != null && q.u != null) || (l.v != null && q.v != null))
          E.push(`${p.etiquette} : point qui répète la coordonnée fixée par sa ligne`);
      }
      if (!surFace) for (const q of pr.points || []) {
        const libre = pr.sur.startsWith('about') ? 'v' : 'u';
        if (q[libre] == null) E.push(`${p.etiquette} : sur ${pr.sur}, un point porte « ${libre} »`);
      }
      for (const q of lamPoints(pr, p, epOf(wb, p))) {
        if (q.u < -0.01 || q.u > (p.longueur || 0) + 0.01 || q.v < -0.01 || q.v > (p.largeur || 0) + 0.01)
          E.push(`${p.etiquette} : point lamello (${q.u}, ${q.v}) hors de la pièce`);
      }
    }
  }
  const placed = new Map();
  for (const pl of wb.debit || []) {
    if (!matOf(wb, pl.materiau).id) { E.push(`plaque ${pl.plaque} : materiau inconnu « ${pl.materiau} »`); continue; }
    const sources = new Set(['plaque']), bandIds = new Set();
    for (const st of pl.etapes || []) {
      if (!st.id) E.push(`plaque ${pl.plaque} : étape sans id (les clés d'avancement en dépendent)`);
      if (st.type === 'refente') {
        if (!sources.has(st.entree)) E.push(`${pl.plaque}/${st.id} : entree « ${st.entree} » n'existe pas encore dans la chaîne`);
        if (st.id) sources.add(st.id);
        for (const b of st.bandes || []) {
          if (bandIds.has(b.id)) E.push(`${pl.plaque} : bande dupliquée « ${b.id} »`);
          bandIds.add(b.id); sources.add(b.id);
          if (b.axe !== 'x' && b.axe !== 'y') E.push(`${pl.plaque}/${b.id} : axe « ${b.axe} » (x|y)`);
        }
      } else if (st.type === 'tronconnage') {
        if (!bandIds.has(st.entree)) E.push(`${pl.plaque}/${st.id} : entree « ${st.entree} » n'est pas une bande de cette plaque`);
        if (st.id) sources.add(st.id);
        for (const pose of st.pieces || []) {
          placed.set(pose.etiquette, (placed.get(pose.etiquette) || 0) + 1);
          if (!etqs.has(pose.etiquette)) E.push(`${pl.plaque}/${st.id} : étiquette hors catalogue « ${pose.etiquette} »`);
        }
      } else if (st.type !== 'derasage') E.push(`${pl.plaque}/${st.id} : type d'étape inconnu « ${st.type} »`);
    }
    for (const [k, ms] of issuesPlaque(wb, pl, null)) for (const m of ms) E.push(`${pl.plaque} : ${k} — ${m}`);
  }
  for (const et of etqs) {
    const n = placed.get(et) || 0;
    if (n === 0) E.push(`pièce jamais débitée : ${et}`);
    else if (n > 1) E.push(`pièce placée ${n} fois : ${et}`);
  }
  for (const [i, s] of (wb.stations || []).entries()) {
    if (!s || !ST_TYPES.includes(s.type)) E.push(`stations[${i}] : type inconnu « ${s && s.type} »`);
  }
  E.push(...valideScenes(wb));
  E.push(...valideJonctions(wb));
  return E;
}

/* ── scènes d'assemblage (contrat ouvert v0.2 — seul format en 3.0) ────── */
export function valideScenes(wb) {
  const E = [], etqs = new Set((wb.pieces || []).map((p) => p.etiquette));
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const seenKeys = new Set();
  for (const [i, sc] of (wb.assemblage || []).entries()) {
    const tag = `scène[${i}]`;
    if (!num(sc.cadre?.w) || !num(sc.cadre?.h)) { E.push(`${tag} : cadre {w,h} requis (le format hérité n'existe plus en 3.0)`); continue; }
    const ids = new Set();
    for (const n of sc.noeuds || []) if (n.type === 'piece' && n.id) {
      if (ids.has(n.id)) E.push(`${tag} : id dupliqué « ${n.id} »`);
      ids.add(n.id);
    }
    const chkA = (a, w) => {
      if (a == null) return E.push(`${tag}/${w} : ancre manquante`);
      if (Array.isArray(a)) { if (!num(a[0]) || !num(a[1])) E.push(`${tag}/${w} : ancre [x,y] numérique`); return; }
      if (typeof a === 'object') { if (!a.ref || !ids.has(a.ref)) E.push(`${tag}/${w} : ancre → id inconnu « ${a.ref} »`); return; }
      E.push(`${tag}/${w} : ancre invalide`);
    };
    for (const n of sc.noeuds || []) {
      if (n.type === 'piece') {
        for (const k of ['x', 'y', 'w', 'h']) if (!num(n[k])) E.push(`${tag}/piece ${n.id || '?'} : ${k} numérique (mm)`);
        if (n.ref && !etqs.has(n.ref)) E.push(`${tag}/piece ${n.id || '?'} : ref « ${n.ref} » hors catalogue`);
      } else if (n.type === 'cote') { chkA(n.de, 'cote.de'); chkA(n.a, 'cote.a'); }
      else if (n.type === 'feature') { if (n.forme === 'rainure') { chkA(n.de, 'rainure.de'); chkA(n.a, 'rainure.a'); } else chkA(n.at, `${n.forme}.at`); }
      else if (n.type === 'note' || n.type === 'repere') chkA(n.at, n.type + '.at');
      else if (n.type !== 'trait' && n.type !== 'groupe') E.push(`${tag} : type de nœud inconnu « ${n.type} »`);
    }
    for (const [j, st] of (sc.sequence || []).entries()) {
      if (!st.key) E.push(`${tag}/sequence[${j}] : key requise`);
      else if (seenKeys.has(st.key)) E.push(`${tag}/sequence[${j}] : key dupliquée « ${st.key} »`);
      else seenKeys.add(st.key);
      if (!st.titre) E.push(`${tag}/sequence[${j}] : titre requis`);
      if (st.geste != null && !GESTES.includes(st.geste)) E.push(`${tag}/sequence[${j}] : geste « ${st.geste} »`);
      for (const c of st.cible || []) if (!ids.has(c)) E.push(`${tag}/sequence[${j}] : cible « ${c} » inconnue`);
    }
  }
  return E;
}

/* ── les jonctions : les contrôles qu'un objet de premier rang rend possibles ── */
export function valideJonctions(wb) {
  const E = [];
  const P = new Map((wb.pieces || []).map((p) => [p.etiquette, p]));
  const vus = new Set();
  for (const [i, j] of (wb.jonctions || []).entries()) {
    const tag = `jonction[${i}]${j.id ? ' « ' + j.id + ' »' : ''}`;
    if (!j.id) E.push(`${tag} : « id » requis`);
    else if (vus.has(j.id)) E.push(`${tag} : id dupliqué`);
    else vus.add(j.id);
    const po = j.porte || {}, ar = j.arrive || {};
    const pp = P.get(po.piece), pa = P.get(ar.piece);
    if (!pp) E.push(`${tag} : porte.piece inconnue « ${po.piece} »`);
    if (!pa) E.push(`${tag} : arrive.piece inconnue « ${ar.piece} »`);
    if (po.sur !== 'face' && po.sur !== 'contre-face') E.push(`${tag} : porte.sur doit être une FACE (vu « ${po.sur} »)`);
    if (!estChant(ar.sur)) E.push(`${tag} : arrive.sur doit être un CHANT — about ou rive (vu « ${ar.sur} »)`);
    if (!SURFACES.includes(po.depuis) || po.depuis === 'face' || po.depuis === 'contre-face')
      E.push(`${tag} : porte.depuis doit nommer un BORD (about-*/rive-*)`);
    if (!ar.appui) E.push(`${tag} : arrive.appui requis — sans lui, on ne sait pas quelle face coucher sur l'établi`);
    else if (!APPUIS.includes(ar.appui)) E.push(`${tag} : arrive.appui « ${ar.appui} » (face|contre-face)`);
    if (!(j.connecteurs || []).length) E.push(`${tag} : aucun connecteur`);
    // chaque point doit tomber dans les DEUX pièces — le contrôle croisé, impossible avant
    for (const [et, pr] of jonctionPreps(j)) {
      const pc = P.get(et); if (!pc) continue;
      for (const q of lamPoints(pr, pc, epOf(wb, pc))) {
        if (q.u < -0.01 || q.u > (pc.longueur || 0) + 0.01 || q.v < -0.01 || q.v > (pc.largeur || 0) + 0.01)
          E.push(`${tag} : un connecteur tombe hors de ${et} (${+q.u.toFixed(1)}, ${+q.v.toFixed(1)})`);
      }
    }
  }
  return E;
}
