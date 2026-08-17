// Banc du socle 3.0 : conversion (toutes les écritures 2.0) + règles. Sans DOM, sans
// fichiers externes — les fixtures encodent ici les variantes réelles des trois livres.
import assert from 'node:assert/strict';
import { normalise } from '../src/atelier/convert.js';
import { valide, lamPoints, lamLignes, ligneBande, bandGuide, poseRect, chantEdges, issuesPlaque, epOf } from '../src/atelier/regles.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

/* ── un livre 2.0 qui exerce TOUTES les écritures historiques ─────────── */
const v2 = {
  schemaVersion: '2.0', projet: 'TST', titre: 'fixture',
  materiaux: [{ id: 'M', ep: 19, plaque: { l: 2800, h: 2070 }, derasage: 10 }],
  meta: { kerf: 4, decorUni: true, sensFil: 'libre' },
  pieces: [
    // CÔTÉ : niveaux (face) + produit croisé sur les bouts (abouts en u) + chants 2.0
    { etiquette: 'TST-A-CÔTÉ-1', module: 'A', role: 'CÔTÉ', longueur: 800, largeur: 400,
      reglageFS: 400, panneau: 'P1', colonne: 'C1', chants: ['avant', 'abouts'],
      preparations: [
        { type: 'lamello', niveaux: [{ h: 300, connecteurs: [{ t: 'tenso', w: 50 }, { t: 'biscuit', w: 350 }] }] },
        { type: 'lamello', ref: { long: 'about' }, abouts: [0, 800], connecteurs: [{ t: 'tenso', w: 200 }] },
      ] },
    // horizontal : produit croisé dont les lignes SONT les rives (la tablette du garage)
    { etiquette: 'TST-A-TAB-1', module: 'A', role: 'TAB', longueur: 600, largeur: 408,
      preparations: [{ type: 'lamello', abouts: [0, 408], connecteurs: [{ t: 'tenso', w: 50 }, { t: 'tenso', w: 550 }] }] },
    // horizontal : sur=face explicite en lignes-objets (0.70.0), types mêlés
    { etiquette: 'TST-A-BAS-1', module: 'A', role: 'BAS', longueur: 700, largeur: 500,
      preparations: [{ type: 'lamello', sur: 'face', abouts: [
        { a: 50, connecteurs: [{ t: 'tenso', w: 10 }, { t: 'tenso', w: 690 }] },
        { a: 250, connecteurs: [{ t: 'biscuit', w: 350 }] } ] }] },
    // rive avec connecteurs nus (TRAV-AR 2.0)
    { etiquette: 'TST-A-TRAV-1', module: 'A', role: 'TRAV', longueur: 500, largeur: 100,
      preparations: [{ type: 'lamello', sur: 'rive-arriere', connecteurs: [{ t: 'biscuit', w: 250 }] }] },
  ],
  debit: [{ plaque: 'P1', materiau: 'M', etapes: [
    { id: 'P1-r1', type: 'refente', entree: 'plaque', sens: 'court',
      bandes: [{ id: 'P1-B1', largeur: 410, x: 10, y: 10, longueur: 2050 }] },
    { id: 'P1-t1', type: 'tronconnage', entree: 'P1-B1', pieces: [
      { etiquette: 'TST-A-CÔTÉ-1', x: 10, y: 10, rot: false },     // 2.0 : largeur (400) en x
      { etiquette: 'TST-A-TAB-1', x: 10, y: 814, rot: false } ] },  // 2.0 : largeur (408) en x
    { id: 'P1-r2', type: 'refente', entree: 'plaque', sens: 'court',
      bandes: [{ id: 'P1-B2', largeur: 510, x: 430, y: 10, longueur: 2050 }] },
    { id: 'P1-t2', type: 'tronconnage', entree: 'P1-B2', pieces: [
      { etiquette: 'TST-A-BAS-1', x: 430, y: 10, rot: false },      // largeur (500) en x
      { etiquette: 'TST-A-TRAV-1', x: 430, y: 714, rot: true } ] }, // longueur (500) en x
  ] }],
  calepinage: [{ panneau: 'P1' }],
  assemblage: [{ module: 'A', titre: 'Caisson A', fond: 'x', niveaux: [
    { h: 300, note: 'tablette basse' }, { h: 600, connecteurs: '2 Tenso' } ],
    sequence: ['Monter le caisson', 'Poser la tablette — une étape volontairement longue pour vérifier le passage titre/detail au-delà de soixante-douze caractères'] }],
};

const wb = normalise(v2);

/* ── structure générale ─────────────────────────────────────────────── */
ok(wb.schemaVersion === '3.0', 'version 3.0');
ok(!('calepinage' in wb), 'calepinage 1.0 supprimé');
const cote = wb.pieces[0], tab = wb.pieces[1], bas = wb.pieces[2], trav = wb.pieces[3];
ok(!('reglageFS' in cote) && !('panneau' in cote) && !('colonne' in cote), 'doublons 1.0 supprimés');
eq(cote.chants, ['rive-avant', 'abouts'], 'chants renommés');
eq(cote.materiau, 'M', 'matériau remonté sur la pièce');

/* ── bandes : rectangle + axe, guide = transverse ───────────────────── */
const b1 = wb.debit[0].etapes[0].bandes[0];
eq({ x: b1.x, y: b1.y, w: b1.w, h: b1.h, axe: b1.axe }, { x: 10, y: 10, w: 410, h: 2050, axe: 'y' }, 'bande court → rect + axe y');
eq(bandGuide(b1), 410, 'guide = transverse');
ok(wb.debit[0].etapes.map((e) => e.id).join() === 'P1-r1,P1-t1,P1-r2,P1-t2', 'ids d’étapes préservés');

/* ── rot inversé : 2.0 false (largeur en x) → 3.0 true ──────────────── */
const poses = wb.debit[0].etapes[1].pieces;
eq(poses.map((p) => p.rot), [true, true], 'rot inversé à la conversion');
eq(poseRect(cote, poses[0]), { x: 10, y: 10, w: 400, h: 800 }, 'empreinte 3.0 : rot=true → largeur en x');

/* ── lamello : chaque écriture aboutit aux mêmes points, bien placés ── */
const surs = (p) => p.preparations.map((x) => x.sur).sort();
eq(surs(cote), ['about-droit', 'about-gauche', 'face'], 'CÔTÉ : face + un prépa PAR bout');
const pts = (p) => p.preparations.flatMap((pr) => lamPoints(pr, p, epOf(wb, p)));
const ptsCote = pts(cote);
eq(ptsCote.length, 4, 'CÔTÉ : 4 points préservés');
ok(ptsCote.every((q) => q.u >= 0 && q.u <= 800 && q.v >= 0 && q.v <= 400), 'CÔTÉ : tous les points dans la pièce');
eq(surs(tab), ['rive-arriere', 'rive-avant'], 'tablette du garage : lignes d’extrémité routées vers les RIVES');
ok(pts(tab).every((q) => q.u <= 600 && q.v <= 408), 'tablette : plus de w=550 hors pièce');
const basPr = bas.preparations[0];
eq(basPr.lignes.length, 2, 'BAS : lignes-objets conservées');
eq(pts(bas).map((q) => q.t).sort(), ['biscuit', 'tenso', 'tenso'], 'BAS : types mêlés par ligne');
// LE SABOT : la fente tombe au MILIEU de la planche qui arrive, la cote reste son bord
ok(pts(bas).every((q) => q.v === 59.5 || q.v === 259.5), 'BAS : fente au milieu de la planche (bord + ép/2)');
{ const li = lamLignes(basPr, 19)[0], b = ligneBande(li, bas.largeur);
  eq({ pos: li.pos, a: b.a, b: b.b, mid: b.mid }, { pos: 50, a: 50, b: 69, mid: 59.5 }, 'bande de planche depuis le bord de référence');
  const but = ligneBande({ axe: 'v', pos: 0, ep: 19, depuis: 'rive-avant' }, bas.largeur);
  eq(but.a, 0, 'planche en butée : cote 0');
  const haut = ligneBande({ axe: 'v', pos: 0, ep: 19, depuis: 'rive-arriere' }, bas.largeur);
  eq(haut.b, bas.largeur, 'butée depuis l’autre bord : la planche colle à ce bord'); }
eq(pts(trav), [{ u: 250, v: 0, t: 'biscuit' }], 'rive : connecteurs nus repris en u');

/* ── assemblage hérité → scène minimale valide ──────────────────────── */
const sc = wb.assemblage[0];
ok(sc.cadre && sc.noeuds.length >= 5, 'scène minimale : cadre + nœuds');
eq(sc.sequence.length, 2, 'séquence reprise');
ok(sc.sequence[1].titre.endsWith('…') && sc.sequence[1].detail, 'étape longue : titre coupé + detail');

/* ── valide() : le converti passe, les fautes mordent ───────────────── */
eq(valide(wb), [], 'la fixture convertie valide sans erreur');
const casse = JSON.parse(JSON.stringify(wb));
casse.pieces[0].chants = ['devant'];
casse.pieces[2].preparations[0].lignes.push({ u: 1, v: 2, points: [] });
casse.debit[0].etapes[2].entree = 'FANTOME';
const errs = valide(casse);
ok(errs.some((e) => e.includes('chant inconnu')), 'chant hors vocabulaire refusé');
ok(errs.some((e) => e.includes('UNE coordonnée')), 'ligne à double clé refusée');
ok(errs.some((e) => e.includes('n’existe pas encore') || e.includes("n'existe pas encore")), 'chaîne cassée refusée');

/* ── issuesPlaque : kerf + calque ───────────────────────────────────── */
const lay = { poses: { 'TST-A-TAB-1': { x: 10, y: 812, rot: true, bande: 'P1-B1' } }, bandes: {} };
const iss = issuesPlaque(wb, wb.debit[0], lay);
ok([...iss.values()].flat().some((m) => m.includes('trait de scie')), 'kerf mangé détecté via le calque');

console.log(`${n}/${n}`);
console.log('ATELIER OK');
