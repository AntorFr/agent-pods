// Lecteur de code-barres — logique pure (validation, panier, message) : tout ce
// qui décide de ce qui ATTEINT le composer d'Alfred. C'est la partie qui compte,
// car un scan finit en texte dans un prompt.
// Le DÉCODAGE, lui, se teste dans test/scan-decode-test.mjs. On l'a cru hors de
// portée sans navigateur — c'est ainsi qu'un décodeur mort est parti en prod.
// Run: node test/scan-test.mjs
import {
  FORMATS, CONFIRM, validCode, createBasket, scanFrame, dropCode, composeMessage,
} from '../src/scan/codes.js';

/** Montre `code` au panier autant de fois qu'il faut pour qu'il soit corroboré.
    Retourne true si le panier a changé au moins une fois. */
const showN = (b, code, n = CONFIRM) => {
  let changed = false;
  for (let i = 0; i < n; i++) changed = scanFrame(b, [code]) || changed;
  return changed;
};

const checks = [];
const check = (name, pass) => checks.push([name, pass]);

/* ── la garde : seuls des chiffres peuvent sortir d'un scan ──────────── */
// Le vrai risque du scan n'est pas la caméra, c'est le QR code : il encode du
// TEXTE ARBITRAIRE. Autorisé, un autocollant hostile collé sur un rayon
// deviendrait une injection de prompt dans le composer. La liste des formats est
// donc une garde, pas un réglage — et elle est verrouillée ici.
check('formats — uniquement des symbologies NUMÉRIQUES (ni QR, ni datamatrix)',
  FORMATS.every((f) => /^(ean|upc)_/.test(f)) && !FORMATS.some((f) => /qr|data_matrix|aztec|pdf417|code_128/.test(f)));
check('formats — les quatre du produit alimentaire',
  ['ean_13', 'ean_8', 'upc_a', 'upc_e'].every((f) => FORMATS.includes(f)));

/* ── clé de contrôle ─────────────────────────────────────────────────── */
check('EAN-13 — Nutella (clé juste)', validCode('3017620422003'));
check('EAN-13 — Bjorg muesli (clé juste)', validCode('3229820782560'));
check('EAN-13 — dernier chiffre faux, refusé', !validCode('3017620422004'));
check('EAN-8 — clé juste', validCode('96385074'));
check('EAN-8 — clé fausse, refusé', !validCode('96385075'));
check('non numérique refusé', !validCode('ABC12345678'));
check('trop court refusé', !validCode('1234'));
check('vide / nul refusés', !validCode('') && !validCode(null) && !validCode(undefined));
// Une longueur hors norme (ITF-14 tronqué, code interne magasin) n'est pas
// contrôlable par cette clé : on ne la rejette pas sous un prétexte inventé.
check('longueur exotique — acceptée sans prétendre la contrôler', validCode('1234567890'));

/* ── panier ──────────────────────────────────────────────────────────── */
{
  const b = createBasket();
  check('panier — un code valide entre et le signale', showN(b, '3017620422003') === true);
  // Une boucle de scan relit le MÊME code dix fois par seconde : sans dédup, le
  // panier se remplirait de doublons et l'addon paierait dix fois le quota.
  check('panier — le même code relu ne rentre pas deux fois', scanFrame(b, ['3017620422003']) === false);
  check('panier — un code invalide est ignoré', showN(b, '3017620422004') === false);
  check('panier — un deuxième code valide entre', showN(b, '3229820782560') === true);
  check('panier — contenu exact', b.codes.join('|') === '3017620422003|3229820782560');
  check('panier — espaces autour du code tolérés',
    showN(b, '  96385074 ') === true && b.codes.includes('96385074'));
}

/* ── corroboration : le bruit ne se répète pas ───────────────────────── */
// Un lecteur 1D décode une LIGNE de pixels : sur une trame bruitée, elle peut
// tomber sur un EAN-13 dont la clé est juste par hasard. C'est un code valide et
// inventé — la clé ne le rattrape pas, seule la répétition le trie.
{
  const b = createBasket();
  check('corroboration — une seule lecture ne suffit pas',
    scanFrame(b, ['3017620422003']) === false && b.codes.length === 0);
  check(`corroboration — ${CONFIRM} lectures et il entre`,
    showN(b, '3017620422003') === true && b.codes.length === 1);
}
{
  // Deux coïncidences séparées par une longue plage de trames muettes ne
  // s'additionnent pas : sinon un scan qui dure finirait toujours par accumuler
  // assez de hasards pour valider un fantôme.
  const b = createBasket();
  scanFrame(b, ['3229820782560']);
  for (let i = 0; i < 20; i++) scanFrame(b, []);
  check('corroboration — un compteur trop vieux repart de zéro',
    scanFrame(b, ['3229820782560']) === false && b.codes.length === 0);
}
{
  // Le natif peut rendre deux fois la même valeur sur UNE trame : ça ne vaut
  // pas deux corroborations, sinon la garde tomberait à une seule trame.
  const b = createBasket();
  scanFrame(b, ['96385074', '96385074', '96385074']);
  check('corroboration — un doublon dans la MÊME trame ne vaut pas plusieurs lectures',
    b.codes.length === 0);
}

/* ── la croix : retirer un code lu à tort ────────────────────────────── */
{
  const b = createBasket();
  showN(b, '3017620422003');
  showN(b, '3229820782560');
  check('croix — le code sort du panier', dropCode(b, '3017620422003') === true
    && b.codes.join('|') === '3229820782560');
  check('croix — un code absent ne fait rien', dropCode(b, '96385074') === false);
  // Sans ça la croix serait un gadget : la caméra est encore braquée sur
  // l'étiquette, le code reviendrait dans la seconde.
  check('croix — le code retiré ne revient pas de lui-même',
    showN(b, '3017620422003', CONFIRM * 3) === false && b.codes.length === 1);
}

/* ── message déposé dans le composer ─────────────────────────────────── */
// Le scanner est BÊTE : il dépose, il n'envoie pas, il ne décide de rien.
// Ce que Monsieur a déjà tapé doit survivre — c'est ce texte-là qui dit à Alfred
// quoi faire du produit (fiche nutritionnelle, courses, suivi diététique).
check('message — un seul code, singulier',
  composeMessage('', ['3017620422003']) === 'code-barres : 3017620422003');
check('message — plusieurs codes, pluriel et virgules',
  composeMessage('', ['3017620422003', '96385074']) === 'codes-barres : 3017620422003, 96385074');
check('message — l’intention déjà tapée reste DEVANT',
  composeMessage('ajoute ça à mes courses', ['3017620422003'])
  === 'ajoute ça à mes courses\ncode-barres : 3017620422003');
check('message — le texte existant est nettoyé, pas écrasé',
  composeMessage('  ajoute ça  ', ['96385074']) === 'ajoute ça\ncode-barres : 96385074');
check('message — panier vide : le composer n’est pas touché',
  composeMessage('bonjour', []) === 'bonjour');
check('message — panier vide et composer vide',
  composeMessage('', []) === '');

/* ── rapport ─────────────────────────────────────────────────────────── */
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? '✓' : '✗'} ${name}`); if (!pass) ok = false; }
console.log(`\n${checks.filter((c) => c[1]).length}/${checks.length}`);
if (!ok) { console.error('SCAN TEST FAILED'); process.exit(1); }
console.log('SCAN OK');
