/* ── 1.0 / 2.0 → 3.0 : le convertisseur (cf. plugins/atelier/ATELIER-3.md §4) ────────────
   C'est l'UNIQUE endroit où les vieilles conventions ont encore le droit d'exister :
   les heuristiques de rôle, le produit croisé, le `sens` des bandes, le `rot` inversé —
   tout entre ici une dernière fois et n'en ressort qu'en repère 3.0. Utilisé par le
   front au chargement (compatibilité durable des livres dormants — décision de Monsieur,
   seul imp3d migre en fichier) et par le CLI `migre` (réécriture définitive). */

const CHANT_RENOM = { avant: 'rive-avant', arriere: 'rive-arriere', gauche: 'about-gauche', droite: 'about-droit', abouts: 'abouts' };
const SUR_RENOM = { face: 'face', 'contre-face': 'contre-face', 'rive-avant': 'rive-avant', 'rive-arriere': 'rive-arriere' };

export function normalise(wb) {
  if (!wb || wb.schemaVersion === '3.0') return wb;
  const out = JSON.parse(JSON.stringify(wb));
  out.schemaVersion = '3.0';

  // matériau par pièce : depuis sa pose (2.0 le portait sur la plaque seulement)
  const matByEtq = new Map();
  for (const pl of out.debit || []) for (const st of pl.etapes || []) if (st.type === 'tronconnage')
    for (const po of st.pieces || []) matByEtq.set(po.etiquette, pl.materiau);

  for (const p of out.pieces || []) {
    delete p.reglageFS; delete p.panneau; delete p.colonne;              // doublons 1.0
    if (!p.materiau) p.materiau = matByEtq.get(p.etiquette) || (out.materiaux || [])[0]?.id;
    if (p.chants) p.chants = p.chants.map((c) => CHANT_RENOM[c] || c);
    const estCote = p.role === 'CÔTÉ';                                    // l'heuristique meurt ICI
    p.preparations = (p.preparations || []).flatMap((pr) => pr.type === 'lamello' ? lamello3(pr, p, estCote) : [pr]);
  }

  for (const pl of out.debit || []) {
    for (const st of pl.etapes || []) {
      if (st.type === 'refente') {
        const long = st.sens === 'long';
        delete st.sens;
        st.bandes = (st.bandes || []).map((b) => ({
          id: b.id, label: b.label || String(b.id).split('-').pop(),
          x: b.x || 0, y: b.y || 0,
          w: long ? (b.longueur || 0) : (b.largeur || 0),
          h: long ? (b.largeur || 0) : (b.longueur || 0),
          axe: long ? 'x' : 'y',
        }));
      } else if (st.type === 'tronconnage') {
        // rot 3.0 : false = u (longueur) le long de x — l'INVERSE du défaut 2.0
        for (const po of st.pieces || []) po.rot = !po.rot;
      }
    }
  }

  delete out.calepinage;                                                  // schéma 1.0
  out.assemblage = (out.assemblage || []).map((a) => (a.noeuds || a.cadre) ? a : sceneMinimale(a, out));
  return out;
}

/* Une prépa lamello 2.0 (niveaux | produit croisé | lignes-objets) → prépas 3.0.
   2.0, dans le repère du dessin : x = longueur (u), y = travers (v).
     CÔTÉ      : niveaux.h et abouts → u ; connecteurs.w → v
     autre rôle: abouts → v ; connecteurs.w → u   (la transposition qui a mordu 4 fois)
   `sur: "abouts"` 2.0 couvrait les deux bouts → une prépa 3.0 PAR bout. */
function lamello3(pr, piece, estCote) {
  const sur2 = pr.sur;
  const base = { type: 'lamello' };
  if (pr.note) base.note = pr.note;
  // les lignes portées par `abouts[]` (nombre nu = produit croisé ; objet = ses connecteurs)
  const aLignes = () => (pr.abouts || []).map((a) => (a && typeof a === 'object') ? { pos: a.a, cs: a.connecteurs || [] } : { pos: a, cs: pr.connecteurs || [] });

  if (sur2 === 'abouts') {
    const len = piece.longueur || 0, parBout = new Map();
    for (const l of aLignes()) {
      const bout = l.pos <= len / 2 ? 'about-gauche' : 'about-droit';
      if (!parBout.has(bout)) parBout.set(bout, []);
      for (const c of l.cs) parBout.get(bout).push({ v: c.w, t: c.t });
    }
    return [...parBout.entries()].map(([sur, points]) => ({ ...base, sur, points }));
  }
  if (sur2 === 'rive-avant' || sur2 === 'rive-arriere') {
    const points = [];
    for (const n of pr.niveaux || []) for (const c of n.connecteurs || []) points.push({ u: n.h, t: c.t });
    if (!pr.niveaux) {
      if ((pr.abouts || []).length) for (const l of aLignes()) for (const c of l.cs) points.push({ u: c.w, t: c.t });
      else for (const c of pr.connecteurs || []) points.push({ u: c.w, t: c.t });   // connecteurs nus (TRAV-AR 2.0)
    }
    return [{ ...base, sur: sur2, points }];
  }
  // face / contre-face explicites (0.65.0+) : niveaux → lignes u, abouts → l'axe du rôle
  if (SUR_RENOM[sur2]) {
    const lignes = [];
    for (const n of pr.niveaux || []) lignes.push({ u: n.h, points: (n.connecteurs || []).map((c) => ({ v: c.w, t: c.t })) });
    for (const l of aLignes())
      lignes.push(estCote ? { u: l.pos, points: l.cs.map((c) => ({ v: c.w, t: c.t })) }
                          : { v: l.pos, points: l.cs.map((c) => ({ u: c.w, t: c.t })) });
    return [{ ...base, sur: SUR_RENOM[sur2], lignes }];
  }
  // Prépa 2.0 SANS `sur` (la carte à plat historique). Chaque ligne se ROUTE par sa
  // position, pas par un mot : une ligne posée SUR une extrémité de son axe est une fente
  // de chant (about pour un CÔTÉ, rive pour un horizontal — cf. la tablette du garage,
  // abouts [0, 408] sur 408 de large) ; une ligne intermédiaire est une ligne de face.
  const tol = 1.0, edges = new Map(), lignes = [];
  for (const n of pr.niveaux || []) lignes.push({ u: n.h, points: (n.connecteurs || []).map((c) => ({ v: c.w, t: c.t })) });
  for (const l of (pr.niveaux || []).length ? [] : aLignes()) {
    const dim = estCote ? (piece.longueur || 0) : (piece.largeur || 0);
    const surEdge = l.pos <= tol ? (estCote ? 'about-gauche' : 'rive-avant')
      : l.pos >= dim - tol ? (estCote ? 'about-droit' : 'rive-arriere') : null;
    if (surEdge) {
      if (!edges.has(surEdge)) edges.set(surEdge, []);
      edges.get(surEdge).push(...l.cs.map((c) => estCote ? { v: c.w, t: c.t } : { u: c.w, t: c.t }));
    } else lignes.push(estCote ? { u: l.pos, points: l.cs.map((c) => ({ v: c.w, t: c.t })) }
                               : { v: l.pos, points: l.cs.map((c) => ({ u: c.w, t: c.t })) });
  }
  const out = [...edges.entries()].map(([sur, points]) => ({ ...base, sur, points }));
  if (lignes.length || !out.length) out.push({ ...base, sur: 'face', lignes });
  return out;
}

/* L'élévation héritée (module/niveaux/sequence) → une scène v0.2 MINIMALE (décision de
   Monsieur : suffisante pour les livres dormants ; une vraie scène le jour où ils rebougent).
   Le côté couché en rect, un trait par niveau, sa note en repère, la séquence en étapes. */
function sceneMinimale(a, wb) {
  const cote = (wb.pieces || []).find((p) => p.role === 'CÔTÉ' && p.module === a.module) || { longueur: 1920, largeur: 620 };
  const L = cote.longueur || 1920, H = cote.largeur || 620;
  const noeuds = [{ type: 'piece', id: 'cote', ref: cote.etiquette, x: 0, y: 0, w: L, h: H, label: a.module || 'module' }];
  const niv = (a.niveaux || []).slice().sort((x, y) => x.h - y.h);
  niv.forEach((n, i) => {
    noeuds.push({ type: 'trait', pts: [[n.h, 0], [n.h, H]] });
    if (i > 0) noeuds.push({ type: 'cote', de: [niv[i - 1].h, H], a: [n.h, H], offset: 18 });
    const txt = n.note || (n.connecteurs ? `${n.h} · ${n.connecteurs}` : String(n.h));
    noeuds.push({ type: 'repere', at: [Math.min(n.h + 8, L - 8), 14 + (i % 3) * 16], texte: txt.slice(0, 60), vers: [n.h, 24] });
  });
  const sequence = (a.sequence || []).map((s, i) => ({
    key: `asm-${a.module || 'x'}-${i + 1}`,
    titre: String(s).length > 72 ? String(s).slice(0, 70) + '…' : String(s),
    detail: String(s).length > 72 ? String(s) : undefined,
    cible: [],
  }));
  return { module: a.module, titre: a.titre || `Assemblage ${a.module || ''}`, vue: 'face',
    cadre: { w: L, h: H }, noeuds, ...(sequence.length ? { sequence } : {}) };
}
