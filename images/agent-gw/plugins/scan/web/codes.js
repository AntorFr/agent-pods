// Logique pure du lecteur de code-barres : validation, accumulation, message.
// Séparée de la caméra et du DOM pour être testable sans navigateur
// (frontend/test/scan-test.mjs). Importée par le lanceur — quelques lignes,
// aucune raison de la charger paresseusement.

// Les seuls formats acceptés, et c'est une GARDE, pas une préférence : EAN/UPC
// n'encodent que des chiffres. Autoriser le QR ferait entrer du texte arbitraire
// dans le composer d'Alfred — un autocollant hostile sur un rayon deviendrait une
// injection de prompt. Un code produit ne peut être qu'un nombre.
export const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

const DIGITS = /^\d{8,14}$/;

// Clé de contrôle EAN/UPC : somme pondérée 3-1 en partant de la droite.
// Les décodeurs la vérifient déjà ; on la revérifie parce que le coût est nul et
// qu'un chiffre inventé partirait sinon interroger Open Food Facts pour rien.
export function validCode(code) {
  const s = String(code || '').trim();
  if (!DIGITS.test(s)) return false;
  if (s.length !== 8 && s.length !== 12 && s.length !== 13 && s.length !== 14) {
    return true; // longueur exotique : on ne prétend pas savoir la contrôler
  }
  const d = [...s].map(Number);
  const key = d.pop();
  let sum = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += d[i] * w;
  return (10 - (sum % 10)) % 10 === key;
}

// ── Le panier, et pourquoi une lecture ne vaut pas une CERTITUDE ───────────
//
// Un lecteur 1D décode UNE LIGNE de pixels. Sur une trame bruitée (main qui
// bouge, mise au point qui cherche, reflet), une ligne peut se décoder en un
// EAN-13 dont la clé de contrôle tombe juste : un code parfaitement valide et
// parfaitement inventé. La clé ne rattrape pas ça — elle a une chance sur dix
// de passer au hasard, et on tire huit fois par seconde. Constaté en rayon le
// 2026-08-04 : des codes fantômes dans le panier, à côté des vrais.
//
// Durcir la clé ne sert à rien (elle est déjà maximale). Ce qui distingue un
// vrai code du bruit, c'est qu'il SE RÉPÈTE : posé devant l'objectif, il se
// relit trame après trame ; le bruit, lui, ne retombe pas deux fois sur la même
// valeur. D'où la corroboration : CONFIRM lectures identiques, et rapprochées —
// sinon deux coïncidences séparées d'une minute finiraient par s'additionner.
export const CONFIRM = 3;   // lectures identiques exigées avant d'entrer au panier
export const FORGET = 8;    // trames sans revoir un code -> son compteur repart de zéro

/** État d'un scan. `codes` est le panier (ce qui partira dans le composer) ;
    le reste sert à trier le vrai du bruit et ne sort jamais d'ici. */
export function createBasket() {
  return { codes: [], tick: 0, seen: new Map(), dropped: new Set() };
}

/** Une trame décodée : `read` sont les codes lus DESSUS (le plus souvent aucun).
    À appeler à chaque trame, même vide — c'est ce qui fait avancer l'horloge, et
    donc oublier les corroborations trop vieilles.
    Retourne true si le PANIER a changé : c'est ce qui déclenche le retour haptique. */
export function scanFrame(b, read) {
  b.tick++;
  let changed = false;
  for (const raw of new Set(read || [])) {
    const s = String(raw || '').trim();
    if (!validCode(s) || b.codes.includes(s) || b.dropped.has(s)) continue;
    const prev = b.seen.get(s);
    const n = prev && b.tick - prev.tick <= FORGET ? prev.n + 1 : 1;
    if (n < CONFIRM) { b.seen.set(s, { n, tick: b.tick }); continue; }
    b.seen.delete(s);
    b.codes.push(s);
    changed = true;
  }
  return changed;
}

/** Retire un code lu à tort. Il ne rentrera PLUS pendant ce scan : la caméra est
    encore braquée dessus, et un code qui revient aussitôt ferait de la croix un
    gadget. Vaut aussi pour un vrai code dont Monsieur ne veut pas. */
export function dropCode(b, code) {
  const s = String(code || '').trim();
  const i = b.codes.indexOf(s);
  if (i < 0) return false;
  b.codes.splice(i, 1);
  b.dropped.add(s);
  b.seen.delete(s);
  return true;
}

// Le scanner est BÊTE : il dépose, il n'envoie pas et il ne décide de rien.
// Le préfixe est le strict minimum de sens (« ces chiffres sont des codes-barres »)
// pour qu'Alfred sache quoi appeler ; ce que Monsieur a déjà tapé reste devant, et
// c'est CE contexte qui dit quoi en faire — fiche nutritionnelle, courses, autre.
export function composeMessage(existing, basket) {
  if (!basket.length) return String(existing || '');
  const label = basket.length > 1 ? 'codes-barres' : 'code-barres';
  const scan = `${label} : ${basket.join(', ')}`;
  const before = String(existing || '').trim();
  return before ? `${before}\n${scan}` : scan;
}
