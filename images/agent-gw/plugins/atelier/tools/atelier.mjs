// ../plugins/atelier/web/cli.js
import { readFileSync, writeFileSync } from "node:fs";

// ../plugins/atelier/web/convert.js
var CHANT_RENOM = { avant: "rive-avant", arriere: "rive-arriere", gauche: "about-gauche", droite: "about-droit", abouts: "abouts" };
var SUR_RENOM = { face: "face", "contre-face": "contre-face", "rive-avant": "rive-avant", "rive-arriere": "rive-arriere" };
function normalise(wb2) {
  if (!wb2 || wb2.schemaVersion === "3.0") return wb2;
  const out = JSON.parse(JSON.stringify(wb2));
  out.schemaVersion = "3.0";
  const matByEtq = /* @__PURE__ */ new Map();
  for (const pl of out.debit || []) for (const st of pl.etapes || []) if (st.type === "tronconnage")
    for (const po of st.pieces || []) matByEtq.set(po.etiquette, pl.materiau);
  for (const p of out.pieces || []) {
    delete p.reglageFS;
    delete p.panneau;
    delete p.colonne;
    if (!p.materiau) p.materiau = matByEtq.get(p.etiquette) || (out.materiaux || [])[0]?.id;
    if (p.chants) p.chants = p.chants.map((c) => CHANT_RENOM[c] || c);
    const estCote = p.role === "C\xD4T\xC9";
    p.preparations = (p.preparations || []).flatMap((pr) => pr.type === "lamello" ? lamello3(pr, p, estCote) : [pr]);
  }
  for (const pl of out.debit || []) {
    for (const st of pl.etapes || []) {
      if (st.type === "refente") {
        const long = st.sens === "long";
        delete st.sens;
        st.bandes = (st.bandes || []).map((b) => ({
          id: b.id,
          label: b.label || String(b.id).split("-").pop(),
          x: b.x || 0,
          y: b.y || 0,
          w: long ? b.longueur || 0 : b.largeur || 0,
          h: long ? b.largeur || 0 : b.longueur || 0,
          axe: long ? "x" : "y"
        }));
      } else if (st.type === "tronconnage") {
        for (const po of st.pieces || []) po.rot = !po.rot;
      }
    }
  }
  delete out.calepinage;
  out.assemblage = (out.assemblage || []).map((a) => a.noeuds || a.cadre ? a : sceneMinimale(a, out));
  return out;
}
function lamello3(pr, piece, estCote) {
  const sur2 = pr.sur;
  const base = { type: "lamello" };
  if (pr.note) base.note = pr.note;
  const aLignes = () => (pr.abouts || []).map((a) => a && typeof a === "object" ? { pos: a.a, cs: a.connecteurs || [] } : { pos: a, cs: pr.connecteurs || [] });
  if (sur2 === "abouts") {
    const len = piece.longueur || 0, parBout = /* @__PURE__ */ new Map();
    for (const l of aLignes()) {
      const bout = l.pos <= len / 2 ? "about-gauche" : "about-droit";
      if (!parBout.has(bout)) parBout.set(bout, []);
      for (const c of l.cs) parBout.get(bout).push({ v: c.w, t: c.t });
    }
    return [...parBout.entries()].map(([sur, points]) => ({ ...base, sur, points }));
  }
  if (sur2 === "rive-avant" || sur2 === "rive-arriere") {
    const points = [];
    for (const n of pr.niveaux || []) for (const c of n.connecteurs || []) points.push({ u: n.h, t: c.t });
    if (!pr.niveaux) {
      if ((pr.abouts || []).length) for (const l of aLignes()) for (const c of l.cs) points.push({ u: c.w, t: c.t });
      else for (const c of pr.connecteurs || []) points.push({ u: c.w, t: c.t });
    }
    return [{ ...base, sur: sur2, points }];
  }
  if (SUR_RENOM[sur2]) {
    const lignes2 = [];
    for (const n of pr.niveaux || []) lignes2.push({ u: n.h, points: (n.connecteurs || []).map((c) => ({ v: c.w, t: c.t })) });
    for (const l of aLignes())
      lignes2.push(estCote ? { u: l.pos, points: l.cs.map((c) => ({ v: c.w, t: c.t })) } : { v: l.pos, points: l.cs.map((c) => ({ u: c.w, t: c.t })) });
    return [{ ...base, sur: SUR_RENOM[sur2], lignes: lignes2 }];
  }
  const tol = 1, edges = /* @__PURE__ */ new Map(), lignes = [];
  for (const n of pr.niveaux || []) lignes.push({ u: n.h, points: (n.connecteurs || []).map((c) => ({ v: c.w, t: c.t })) });
  for (const l of (pr.niveaux || []).length ? [] : aLignes()) {
    const dim = estCote ? piece.longueur || 0 : piece.largeur || 0;
    const surEdge = l.pos <= tol ? estCote ? "about-gauche" : "rive-avant" : l.pos >= dim - tol ? estCote ? "about-droit" : "rive-arriere" : null;
    if (surEdge) {
      if (!edges.has(surEdge)) edges.set(surEdge, []);
      edges.get(surEdge).push(...l.cs.map((c) => estCote ? { v: c.w, t: c.t } : { u: c.w, t: c.t }));
    } else lignes.push(estCote ? { u: l.pos, points: l.cs.map((c) => ({ v: c.w, t: c.t })) } : { v: l.pos, points: l.cs.map((c) => ({ u: c.w, t: c.t })) });
  }
  const out = [...edges.entries()].map(([sur, points]) => ({ ...base, sur, points }));
  if (lignes.length || !out.length) out.push({ ...base, sur: "face", lignes });
  return out;
}
function sceneMinimale(a, wb2) {
  const cote = (wb2.pieces || []).find((p) => p.role === "C\xD4T\xC9" && p.module === a.module) || { longueur: 1920, largeur: 620 };
  const L = cote.longueur || 1920, H = cote.largeur || 620;
  const noeuds = [{ type: "piece", id: "cote", ref: cote.etiquette, x: 0, y: 0, w: L, h: H, label: a.module || "module" }];
  const niv = (a.niveaux || []).slice().sort((x, y) => x.h - y.h);
  niv.forEach((n, i) => {
    noeuds.push({ type: "trait", pts: [[n.h, 0], [n.h, H]] });
    if (i > 0) noeuds.push({ type: "cote", de: [niv[i - 1].h, H], a: [n.h, H], offset: 18 });
    const txt = n.note || (n.connecteurs ? `${n.h} \xB7 ${n.connecteurs}` : String(n.h));
    noeuds.push({ type: "repere", at: [Math.min(n.h + 8, L - 8), 14 + i % 3 * 16], texte: txt.slice(0, 60), vers: [n.h, 24] });
  });
  const sequence = (a.sequence || []).map((s, i) => ({
    key: `asm-${a.module || "x"}-${i + 1}`,
    titre: String(s).length > 72 ? String(s).slice(0, 70) + "\u2026" : String(s),
    detail: String(s).length > 72 ? String(s) : void 0,
    cible: []
  }));
  return {
    module: a.module,
    titre: a.titre || `Assemblage ${a.module || ""}`,
    vue: "face",
    cadre: { w: L, h: H },
    noeuds,
    ...sequence.length ? { sequence } : {}
  };
}

// ../plugins/atelier/web/regles.js
var SURFACES = ["face", "contre-face", "rive-avant", "rive-arriere", "about-gauche", "about-droit"];
var CHANTS = ["rive-avant", "rive-arriere", "about-gauche", "about-droit", "abouts"];
var APPUIS = ["face", "contre-face"];
var estChant = (sur) => String(sur || "").startsWith("about") || String(sur || "").startsWith("rive");
var GESTES = ["poser", "coller", "assembler", "visser", "serrer", "verifier"];
var ST_TYPES = ["debit", "tronconnage", "rainure", "lamello", "assemblage", "suivi"];
var matOf = (wb2, id) => (wb2.materiaux || []).find((m) => m.id === id) || {};
var pieceMat = (wb2, p) => matOf(wb2, p.materiau).id ? matOf(wb2, p.materiau) : (wb2.materiaux || [])[0] || {};
var epOf = (wb2, p) => p.ep || pieceMat(wb2, p).ep || 19;
var kerfOf = (wb2) => wb2.meta?.kerf ?? 4;
function zoneUtile(wb2, pl) {
  const m = matOf(wb2, pl.materiau);
  const L = m.plaque?.l || 2800, H = m.plaque?.h || 2070, d = m.derasage || 0;
  return { x0: d, y0: d, x1: L - d, y1: d ? H - d : H, L, H, d };
}
var bandBox = (b) => ({ x: b.x || 0, y: b.y || 0, w: b.w || 0, h: b.h || 0 });
function poseRect(piece, pose) {
  const u = piece?.longueur || 0, v = piece?.largeur || 0;
  return { x: pose.x || 0, y: pose.y || 0, w: pose.rot ? v : u, h: pose.rot ? u : v };
}
var ligneAxe = (l) => l.u != null ? "u" : "v";
function lamLignes(pr, epDefaut) {
  return (pr.lignes || []).map((l) => {
    const axe = ligneAxe(l);
    return {
      axe,
      pos: (axe === "u" ? l.u : l.v) || 0,
      ep: l.ep ?? epDefaut,
      depuis: l.depuis || (axe === "u" ? "about-gauche" : "rive-avant"),
      points: l.points || []
    };
  });
}
function ligneBande(li, dim) {
  const loin = li.depuis === "about-droit" || li.depuis === "rive-arriere";
  const a = loin ? dim - li.pos - li.ep : li.pos;
  return { a, b: a + li.ep, mid: a + li.ep / 2, loin };
}
function lamPoints(pr, piece, epDefaut) {
  const out = [];
  const L = piece?.longueur || 0, V = piece?.largeur || 0;
  for (const li of lamLignes(pr, li0(epDefaut, piece))) {
    const { mid } = ligneBande(li, li.axe === "u" ? L : V);
    for (const q of li.points) out.push(li.axe === "u" ? { u: mid, v: q.v ?? 0, t: q.t, fixe: "u" } : { u: q.u ?? 0, v: mid, t: q.t, fixe: "v" });
  }
  const fixeChant = String(pr.sur || "").startsWith("about") ? "u" : "v";
  for (const q of pr.points || []) out.push({ u: q.u ?? 0, v: q.v ?? 0, t: q.t, fixe: fixeChant });
  return out;
}
var li0 = (epDefaut, piece) => Number.isFinite(epDefaut) ? epDefaut : Number.isFinite(piece?.ep) ? piece.ep : 19;
var axeDe = (bord) => String(bord || "").startsWith("about") ? "u" : "v";
var axeChant = (sur) => String(sur || "").startsWith("about") ? "v" : "u";
function jonctionPreps(j) {
  const out = [];
  const po = j.porte || {}, ar = j.arrive || {};
  const cs = j.connecteurs || [];
  if (po.piece && po.sur) {
    const axe = axeDe(po.depuis), autre = axe === "u" ? "v" : "u";
    out.push([po.piece, {
      type: "lamello",
      sur: po.sur,
      jonction: j.id,
      lignes: [{
        [axe]: po.pos ?? 0,
        depuis: po.depuis,
        ...po.ep != null ? { ep: po.ep } : {},
        points: cs.map((c) => ({ [autre]: c.a, t: c.t }))
      }],
      ...j.note ? { note: j.note } : {}
    }]);
  }
  if (ar.piece && ar.sur) {
    const o = ar.origine || 0, libre = axeChant(ar.sur);
    out.push([ar.piece, {
      type: "lamello",
      sur: ar.sur,
      jonction: j.id,
      ...ar.appui ? { appui: ar.appui } : {},
      points: cs.map((c) => ({ [libre]: ar.inverse ? o - c.a : c.a - o, t: c.t })),
      ...j.note ? { note: j.note } : {}
    }]);
  }
  return out;
}
function prepsDe(wb2, piece) {
  const out = [...piece.preparations || []];
  for (const j of wb2.jonctions || [])
    for (const [et, pr] of jonctionPreps(j)) if (et === piece.etiquette) out.push(pr);
  return out;
}
function plaqueBands(wb2, pl, layout) {
  const bands = /* @__PURE__ */ new Map();
  for (const st of pl.etapes || []) if (st.type === "refente")
    for (const b of st.bandes || []) bands.set(b.id, { ...b, poses: [], stepOf: null });
  for (const [id, ov] of Object.entries(layout?.bandes || {})) {
    if (ov.supprime) {
      bands.delete(id);
      continue;
    }
    const base = bands.get(id);
    if (base) bands.set(id, { ...base, ...ov, poses: [] });
    else if (ov.cree && ov.plaque === pl.plaque) bands.set(id, { id, axe: "y", x: 0, y: 0, w: 0, h: 0, ...ov, poses: [] });
  }
  return bands;
}
function plaquePoses(wb2, pl, layout, bands) {
  const byEtq = new Map((wb2.pieces || []).map((p) => [p.etiquette, p]));
  const out = [];
  for (const st of pl.etapes || []) if (st.type === "tronconnage") {
    for (const pose of st.pieces || []) {
      const eff = { ...pose, ...(layout?.poses || {})[pose.etiquette] || {} };
      const p = byEtq.get(pose.etiquette) || {};
      const r = poseRect(p, eff);
      r.et = pose.etiquette;
      r.rot = !!eff.rot;
      r.bande = eff.bande || st.entree;
      r.stepId = st.id;
      r.chants = (p.chants || []).filter((c) => CHANTS.includes(c));
      out.push(r);
      if (bands) bands.get(r.bande)?.poses.push(r);
    }
  }
  return out;
}
function bandesMeres(pl) {
  const s = /* @__PURE__ */ new Set();
  for (const st of pl.etapes || []) if (st.type === "refente" && st.entree && st.entree !== "plaque") s.add(st.entree);
  return s;
}
function issuesPlaque(wb2, pl, layout) {
  const kerf = kerfOf(wb2), uzn = zoneUtile(wb2, pl);
  const bands = plaqueBands(wb2, pl, layout);
  const poses = plaquePoses(wb2, pl, layout, bands);
  const iss = /* @__PURE__ */ new Map();
  const add = (k, m) => {
    if (!iss.has(k)) iss.set(k, []);
    if (!iss.get(k).includes(m)) iss.get(k).push(m);
  };
  for (const r of poses) {
    if (r.x < uzn.x0 - 0.01 || r.y < uzn.y0 - 0.01 || r.x + r.w > uzn.x1 + 0.01 || r.y + r.h > uzn.y1 + 0.01) add(r.et, "hors zone utile");
    const b = bands.get(r.bande);
    if (!b) add(r.et, `colonne inconnue \xAB ${r.bande} \xBB`);
    else {
      const bb = bandBox(b);
      if (r.x < bb.x - 0.01 || r.y < bb.y - 0.01 || r.x + r.w > bb.x + bb.w + 0.01 || r.y + r.h > bb.y + bb.h + 0.01) add(r.et, `d\xE9borde de ${b.id}`);
    }
  }
  const kerfPair = (a, b, ka, kb) => {
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
      add(ka, `chevauche ${kb}`);
      add(kb, `chevauche ${ka}`);
      return;
    }
    const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
    const gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    const m = `trait de scie < ${kerf} mm`;
    if (gy < -0.01 && gx > -0.01 && gx < kerf - 0.01 || gx < -0.01 && gy > -0.01 && gy < kerf - 0.01) {
      add(ka, m);
      add(kb, m);
    }
  };
  for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++)
    kerfPair(poses[i], poses[j], poses[i].et, poses[j].et);
  const meres = bandesMeres(pl);
  const feuilles = [...bands.values()].filter((b) => !meres.has(b.id));
  for (const b of feuilles) {
    const r = bandBox(b), k = "\u25AD " + b.id;
    if (!(r.w > 0) || !(r.h > 0)) {
      add(k, "largeur ou longueur nulle");
      continue;
    }
    if (r.x < uzn.x0 - 0.01 || r.y < uzn.y0 - 0.01 || r.x + r.w > uzn.x1 + 0.01 || r.y + r.h > uzn.y1 + 0.01) add(k, "hors zone utile");
  }
  for (let i = 0; i < feuilles.length; i++) for (let j = i + 1; j < feuilles.length; j++)
    kerfPair(bandBox(feuilles[i]), bandBox(feuilles[j]), "\u25AD " + feuilles[i].id, "\u25AD " + feuilles[j].id);
  return iss;
}
function valide(wb2) {
  const E = [];
  if (wb2.schemaVersion !== "3.0") E.push(`schemaVersion \xAB ${wb2.schemaVersion} \xBB \u2014 valider s'applique au 3.0 (passer par normalise/migre)`);
  const etqs = /* @__PURE__ */ new Set();
  for (const p of wb2.pieces || []) {
    if (etqs.has(p.etiquette)) E.push(`pi\xE8ce dupliqu\xE9e : ${p.etiquette}`);
    etqs.add(p.etiquette);
    if (!(p.longueur > 0) || !(p.largeur > 0)) E.push(`${p.etiquette} : longueur/largeur > 0 requis`);
    for (const c of p.chants || []) if (!CHANTS.includes(c)) E.push(`${p.etiquette} : chant inconnu \xAB ${c} \xBB (${CHANTS.join(", ")})`);
    for (const pr of prepsDe(wb2, p)) {
      if (pr.type !== "lamello") continue;
      if (!SURFACES.includes(pr.sur)) E.push(`${p.etiquette} : lamello.sur \xAB ${pr.sur} \xBB hors vocabulaire (${SURFACES.join(", ")})`);
      const surFace = pr.sur === "face" || pr.sur === "contre-face";
      if (surFace && !(pr.lignes || []).length) E.push(`${p.etiquette} : lamello sur ${pr.sur} sans lignes[]`);
      if (!surFace && !(pr.points || []).length) E.push(`${p.etiquette} : lamello sur ${pr.sur} sans points[]`);
      for (const l of pr.lignes || []) {
        if (l.u == null === (l.v == null)) E.push(`${p.etiquette} : une ligne fixe UNE coordonn\xE9e (u: OU v:)`);
        for (const q of l.points || []) if (l.u != null && q.u != null || l.v != null && q.v != null)
          E.push(`${p.etiquette} : point qui r\xE9p\xE8te la coordonn\xE9e fix\xE9e par sa ligne`);
      }
      if (!surFace) for (const q of pr.points || []) {
        const libre = pr.sur.startsWith("about") ? "v" : "u";
        if (q[libre] == null) E.push(`${p.etiquette} : sur ${pr.sur}, un point porte \xAB ${libre} \xBB`);
      }
      for (const q of lamPoints(pr, p, epOf(wb2, p))) {
        if (q.u < -0.01 || q.u > (p.longueur || 0) + 0.01 || q.v < -0.01 || q.v > (p.largeur || 0) + 0.01)
          E.push(`${p.etiquette} : point lamello (${q.u}, ${q.v}) hors de la pi\xE8ce`);
      }
    }
  }
  const placed = /* @__PURE__ */ new Map();
  for (const pl of wb2.debit || []) {
    if (!matOf(wb2, pl.materiau).id) {
      E.push(`plaque ${pl.plaque} : materiau inconnu \xAB ${pl.materiau} \xBB`);
      continue;
    }
    const sources = /* @__PURE__ */ new Set(["plaque"]), bandIds = /* @__PURE__ */ new Set();
    for (const st of pl.etapes || []) {
      if (!st.id) E.push(`plaque ${pl.plaque} : \xE9tape sans id (les cl\xE9s d'avancement en d\xE9pendent)`);
      if (st.type === "refente") {
        if (!sources.has(st.entree)) E.push(`${pl.plaque}/${st.id} : entree \xAB ${st.entree} \xBB n'existe pas encore dans la cha\xEEne`);
        if (st.id) sources.add(st.id);
        for (const b of st.bandes || []) {
          if (bandIds.has(b.id)) E.push(`${pl.plaque} : bande dupliqu\xE9e \xAB ${b.id} \xBB`);
          bandIds.add(b.id);
          sources.add(b.id);
          if (b.axe !== "x" && b.axe !== "y") E.push(`${pl.plaque}/${b.id} : axe \xAB ${b.axe} \xBB (x|y)`);
        }
      } else if (st.type === "tronconnage") {
        if (!bandIds.has(st.entree)) E.push(`${pl.plaque}/${st.id} : entree \xAB ${st.entree} \xBB n'est pas une bande de cette plaque`);
        if (st.id) sources.add(st.id);
        for (const pose of st.pieces || []) {
          placed.set(pose.etiquette, (placed.get(pose.etiquette) || 0) + 1);
          if (!etqs.has(pose.etiquette)) E.push(`${pl.plaque}/${st.id} : \xE9tiquette hors catalogue \xAB ${pose.etiquette} \xBB`);
        }
      } else if (st.type !== "derasage") E.push(`${pl.plaque}/${st.id} : type d'\xE9tape inconnu \xAB ${st.type} \xBB`);
    }
    for (const [k, ms] of issuesPlaque(wb2, pl, null)) for (const m of ms) E.push(`${pl.plaque} : ${k} \u2014 ${m}`);
  }
  for (const et of etqs) {
    const n = placed.get(et) || 0;
    if (n === 0) E.push(`pi\xE8ce jamais d\xE9bit\xE9e : ${et}`);
    else if (n > 1) E.push(`pi\xE8ce plac\xE9e ${n} fois : ${et}`);
  }
  for (const [i, s] of (wb2.stations || []).entries()) {
    if (!s || !ST_TYPES.includes(s.type)) E.push(`stations[${i}] : type inconnu \xAB ${s && s.type} \xBB`);
  }
  E.push(...valideScenes(wb2));
  E.push(...valideJonctions(wb2));
  return E;
}
function valideScenes(wb2) {
  const E = [], etqs = new Set((wb2.pieces || []).map((p) => p.etiquette));
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const seenKeys = /* @__PURE__ */ new Set();
  for (const [i, sc] of (wb2.assemblage || []).entries()) {
    const tag = `sc\xE8ne[${i}]`;
    if (!num(sc.cadre?.w) || !num(sc.cadre?.h)) {
      E.push(`${tag} : cadre {w,h} requis (le format h\xE9rit\xE9 n'existe plus en 3.0)`);
      continue;
    }
    const ids = /* @__PURE__ */ new Set();
    for (const n of sc.noeuds || []) if (n.type === "piece" && n.id) {
      if (ids.has(n.id)) E.push(`${tag} : id dupliqu\xE9 \xAB ${n.id} \xBB`);
      ids.add(n.id);
    }
    const chkA = (a, w) => {
      if (a == null) return E.push(`${tag}/${w} : ancre manquante`);
      if (Array.isArray(a)) {
        if (!num(a[0]) || !num(a[1])) E.push(`${tag}/${w} : ancre [x,y] num\xE9rique`);
        return;
      }
      if (typeof a === "object") {
        if (!a.ref || !ids.has(a.ref)) E.push(`${tag}/${w} : ancre \u2192 id inconnu \xAB ${a.ref} \xBB`);
        return;
      }
      E.push(`${tag}/${w} : ancre invalide`);
    };
    for (const n of sc.noeuds || []) {
      if (n.type === "piece") {
        for (const k of ["x", "y", "w", "h"]) if (!num(n[k])) E.push(`${tag}/piece ${n.id || "?"} : ${k} num\xE9rique (mm)`);
        if (n.ref && !etqs.has(n.ref)) E.push(`${tag}/piece ${n.id || "?"} : ref \xAB ${n.ref} \xBB hors catalogue`);
      } else if (n.type === "cote") {
        chkA(n.de, "cote.de");
        chkA(n.a, "cote.a");
      } else if (n.type === "feature") {
        if (n.forme === "rainure") {
          chkA(n.de, "rainure.de");
          chkA(n.a, "rainure.a");
        } else chkA(n.at, `${n.forme}.at`);
      } else if (n.type === "note" || n.type === "repere") chkA(n.at, n.type + ".at");
      else if (n.type !== "trait" && n.type !== "groupe") E.push(`${tag} : type de n\u0153ud inconnu \xAB ${n.type} \xBB`);
    }
    for (const [j, st] of (sc.sequence || []).entries()) {
      if (!st.key) E.push(`${tag}/sequence[${j}] : key requise`);
      else if (seenKeys.has(st.key)) E.push(`${tag}/sequence[${j}] : key dupliqu\xE9e \xAB ${st.key} \xBB`);
      else seenKeys.add(st.key);
      if (!st.titre) E.push(`${tag}/sequence[${j}] : titre requis`);
      if (st.geste != null && !GESTES.includes(st.geste)) E.push(`${tag}/sequence[${j}] : geste \xAB ${st.geste} \xBB`);
      for (const c of st.cible || []) if (!ids.has(c)) E.push(`${tag}/sequence[${j}] : cible \xAB ${c} \xBB inconnue`);
    }
  }
  return E;
}
function valideJonctions(wb2) {
  const E = [];
  const P = new Map((wb2.pieces || []).map((p) => [p.etiquette, p]));
  const vus = /* @__PURE__ */ new Set();
  for (const [i, j] of (wb2.jonctions || []).entries()) {
    const tag = `jonction[${i}]${j.id ? " \xAB " + j.id + " \xBB" : ""}`;
    if (!j.id) E.push(`${tag} : \xAB id \xBB requis`);
    else if (vus.has(j.id)) E.push(`${tag} : id dupliqu\xE9`);
    else vus.add(j.id);
    const po = j.porte || {}, ar = j.arrive || {};
    const pp = P.get(po.piece), pa = P.get(ar.piece);
    if (!pp) E.push(`${tag} : porte.piece inconnue \xAB ${po.piece} \xBB`);
    if (!pa) E.push(`${tag} : arrive.piece inconnue \xAB ${ar.piece} \xBB`);
    if (po.sur !== "face" && po.sur !== "contre-face") E.push(`${tag} : porte.sur doit \xEAtre une FACE (vu \xAB ${po.sur} \xBB)`);
    if (!estChant(ar.sur)) E.push(`${tag} : arrive.sur doit \xEAtre un CHANT \u2014 about ou rive (vu \xAB ${ar.sur} \xBB)`);
    if (!SURFACES.includes(po.depuis) || po.depuis === "face" || po.depuis === "contre-face")
      E.push(`${tag} : porte.depuis doit nommer un BORD (about-*/rive-*)`);
    if (!ar.appui) E.push(`${tag} : arrive.appui requis \u2014 sans lui, on ne sait pas quelle face coucher sur l'\xE9tabli`);
    else if (!APPUIS.includes(ar.appui)) E.push(`${tag} : arrive.appui \xAB ${ar.appui} \xBB (face|contre-face)`);
    if (!(j.connecteurs || []).length) E.push(`${tag} : aucun connecteur`);
    for (const [et, pr] of jonctionPreps(j)) {
      const pc = P.get(et);
      if (!pc) continue;
      for (const q of lamPoints(pr, pc, epOf(wb2, pc))) {
        if (q.u < -0.01 || q.u > (pc.longueur || 0) + 0.01 || q.v < -0.01 || q.v > (pc.largeur || 0) + 0.01)
          E.push(`${tag} : un connecteur tombe hors de ${et} (${+q.u.toFixed(1)}, ${+q.v.toFixed(1)})`);
      }
    }
  }
  return E;
}

// ../plugins/atelier/web/cli.js
var [cmd, path, ...opts] = process.argv.slice(2);
if (!cmd || !path) {
  console.error("usage: atelier.mjs valide <workbook.json> | migre <workbook.json> [--ecrit]");
  process.exit(2);
}
var brut = JSON.parse(readFileSync(path, "utf8"));
var wb = normalise(brut);
if (cmd === "valide") {
  const errs = valide(wb);
  const meta = `workbook ${wb.projet || "?"} ${brut.schemaVersion === "3.0" ? "3.0" : brut.schemaVersion + " (normalis\xE9 3.0)"} \u2014 ${(wb.pieces || []).length} pi\xE8ces, ${(wb.debit || []).length} plaques`;
  console.log(meta);
  if (errs.length) {
    console.log(`
\u2717 ${errs.length} erreur(s) :`);
    for (const e of errs) console.log("  \u2022", e);
    process.exit(1);
  }
  console.log("\n\u2713 valide.");
} else if (cmd === "migre") {
  const errs = valide(wb);
  if (errs.length) {
    console.error(`\u2717 le converti ne valide pas (${errs.length} erreurs) \u2014 on n'\xE9crit pas du faux :`);
    for (const e of errs) console.error("  \u2022", e);
    process.exit(1);
  }
  const txt = JSON.stringify(wb, null, 1) + "\n";
  if (opts.includes("--ecrit")) {
    writeFileSync(path, txt);
    console.log(`\u2713 ${path} r\xE9\xE9crit en 3.0.`);
  } else process.stdout.write(txt);
} else {
  console.error(`commande inconnue \xAB ${cmd} \xBB`);
  process.exit(2);
}
