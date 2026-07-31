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

// Ajoute un code au panier s'il est valide et pas déjà là.
// Retourne true si le panier a changé — c'est ce qui déclenche le retour haptique.
export function addCode(basket, code) {
  const s = String(code || '').trim();
  if (!validCode(s) || basket.includes(s)) return false;
  basket.push(s);
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
