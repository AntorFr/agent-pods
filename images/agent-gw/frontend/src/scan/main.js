// Décodeur de repli — bundle SÉPARÉ (dist/scan.js), chargé à la demande.
//
// Pourquoi un second bundle plutôt qu'un import dans le lanceur : @zxing/library
// pèse 448 Ko (116 Ko gzip, mesuré — et le tree-shaking n'y change rien, la
// bibliothèque tire tous ses lecteurs). Le lanceur, lui, se charge à CHAQUE page.
// Ici le coût est de 0 pour qui ne scanne jamais, et de 0 sur Android où
// BarcodeDetector est natif : ce fichier n'est demandé que sur la branche de repli.
//
// Cette branche existe pour iOS : `BarcodeDetector` y est « disabled by default »
// de Safari 17.0 à 26.5 (caniuse, vérifié). Firefox ne l'a pas du tout. Sans ce
// repli, le bouton scan serait mort sur l'iPhone de Monsieur.
//
// Format IIFE + `window.AlfredScan`, comme les autres vendors (marked, DOMPurify) :
// le reste du front est en IIFE, on n'introduit pas un chargeur de modules pour un
// seul fichier.

import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

// Mêmes formats que la branche native, pour la même raison : seuls des chiffres
// peuvent sortir d'un scan (cf. le commentaire de FORMATS dans scan/codes.js).
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
]);
// Le code occupe rarement toute l'image et n'est jamais parfaitement d'aplomb.
hints.set(DecodeHintType.TRY_HARDER, true);

const reader = new MultiFormatReader();
reader.setHints(hints);

/** ImageData -> chaîne du code lu, ou null. Jamais d'exception : « pas de code
 *  dans cette trame » est le cas NOMINAL d'une boucle de scan, pas une erreur. */
function decode(imageData) {
  try {
    const { data, width, height } = imageData;
    // RGBLuminanceSource attend du RGBA 32 bits empaqueté ; c'est exactement le
    // format d'un canvas 2D, donc aucune conversion.
    const luminance = new RGBLuminanceSource(new Uint8ClampedArray(data.buffer.slice(0)), width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
    const result = reader.decode(bitmap);
    return result ? result.getText() : null;
  } catch {
    return null;
  } finally {
    // Sans ça le lecteur garde l'état de la trame précédente et rate la suivante.
    reader.reset();
  }
}

window.AlfredScan = { decode };
