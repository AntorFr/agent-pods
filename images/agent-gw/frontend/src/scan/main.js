// Décodeur de repli — bundle SÉPARÉ (dist/scan.js), chargé à la demande.
//
// Pourquoi un second bundle plutôt qu'un import dans le lanceur : même réduit
// aux seuls lecteurs 1D, @zxing/library pèse 138 Ko (31 Ko gzip, mesuré). Le
// lanceur, lui, se charge à CHAQUE page. Ici le coût est de 0 pour qui ne scanne
// jamais, et de 0 sur Android où BarcodeDetector est natif : ce fichier n'est
// demandé que sur la branche de repli.
//
// Cette branche existe pour iOS : `BarcodeDetector` y est « disabled by default »
// de Safari 17.0 à 26.5 (caniuse, vérifié). Firefox ne l'a pas du tout. Sans ce
// repli, le bouton scan serait mort sur l'iPhone de Monsieur.
//
// Format IIFE + `window.AlfredScan`, comme les autres vendors (marked, DOMPurify) :
// le reste du front est en IIFE, on n'introduit pas un chargeur de modules pour un
// seul fichier.

// Imports PROFONDS, pas le barrel `@zxing/library` : le paquet ne déclare pas
// `sideEffects: false`, donc esbuild ne peut rien élaguer et l'index tire tous
// les lecteurs 2D — 448 Ko contre 138 ici (mesuré). Le risque du chemin interne
// (une réorganisation au prochain bump) est couvert : il ne casse pas en
// silence, il fait échouer la résolution — donc `npm run build` ET le test de
// décodage, qui bundle ce fichier.
import BarcodeFormat from '@zxing/library/esm/core/BarcodeFormat';
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer';
import MultiFormatOneDReader from '@zxing/library/esm/core/oned/MultiFormatOneDReader';
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource';

// Mêmes formats que la branche native, pour la même raison : seuls des chiffres
// peuvent sortir d'un scan (cf. le commentaire de FORMATS dans scan/codes.js).
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
]);
// Le code occupe rarement toute l'image et n'est jamais parfaitement d'aplomb.
hints.set(DecodeHintType.TRY_HARDER, true);

// MultiFormatOneDReader, et NON MultiFormatReader, pour trois raisons cumulées :
//  1. MultiFormatReader.decode(image) appelé sans second argument compare
//     `this.hints !== undefined` et rappelle donc `setHints(undefined)` : nos
//     POSSIBLE_FORMATS seraient jetés dès la première trame et la liste complète
//     des lecteurs reviendrait. Le piège ne peut plus se tendre ici.
//  2. Dans cette version, NotFoundException n'hérite PAS de ReaderException :
//     MultiFormatReader traite donc « pas de code dans cette trame » — le cas
//     NOMINAL — comme une anomalie et en journalise la pile. Huit fois par
//     seconde sur le téléphone de Monsieur. Ici l'exception nous revient et on
//     la traite pour ce qu'elle est : rien à signaler.
//  3. Aucun lecteur 2D n'est instancié : rien de ce que la garde de formats
//     interdit n'a l'occasion de tourner sur une trame.
const reader = new MultiFormatOneDReader(hints);

// Tampon de luminance réutilisé d'une trame à l'autre : à 8 images/s, réallouer
// quelques centaines de Ko à chaque tour donnerait du travail au GC pendant
// qu'on décode.
let gray = null;

/** ImageData -> chaîne du code lu, ou null. Jamais d'exception : « pas de code
 *  dans cette trame » est le cas NOMINAL d'une boucle de scan, pas une erreur. */
function decode(imageData) {
  try {
    const { data, width, height } = imageData;
    // ⚠️ RGBLuminanceSource ne dépaquette QUE de l'Int32Array (il teste
    // `BYTES_PER_ELEMENT === 4`). Un Uint8ClampedArray, il le prend pour de la
    // luminance DÉJÀ prête, un octet par pixel — donc lui passer le RGBA d'un
    // canvas tel quel lui fait lire, à la place de chaque ligne, un quart de
    // ligne d'octets R,G,B,A entrelacés. Du bruit : il ne décode jamais rien.
    // On convertit donc nous-mêmes (ITU-R BT.601 en entiers, somme = 1024).
    const size = width * height;
    if (!gray || gray.length !== size) gray = new Uint8ClampedArray(size);
    for (let i = 0, p = 0; i < size; i++, p += 4) {
      gray[i] = (data[p] * 306 + data[p + 1] * 601 + data[p + 2] * 117) >> 10;
    }
    const luminance = new RGBLuminanceSource(gray, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
    const result = reader.decode(bitmap, hints);
    return result ? result.getText() : null;
  } catch {
    return null;
  } finally {
    // Sans ça le lecteur garde l'état de la trame précédente et rate la suivante.
    reader.reset();
  }
}

window.AlfredScan = { decode };
