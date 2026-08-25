/* Le lecteur de codes-barres — une CAPACITÉ de la coque, apportée par un plugin.
   ═══════════════════════════════════════════════════════════════════════════

   Ce code vivait dans `launcher/main.js` (180 lignes), son markup dans
   `app/static/app.html`, ses styles dans `launcher.css`, et son bundle dans
   `frontend/src/scan/`. Quatre endroits du SOCLE pour une fonctionnalité qui
   n'en est pas une : la coque contenait tout, et `GW_FEATURES` ne faisait que
   RETRANCHER (`drop('scan')`). Un plugin ne pouvait donc rien AJOUTER.

   LE CONTRAT DE CHROME — `(api) => ({ composer?, settings?, markup?, mount? })` :

     composer  [{ id, glyphe, titre }] — des boutons posés dans le tiroir du
               composeur, à côté du bouclier.
     settings  [{ id, libelle }] — des entrées de la modale Réglages.
     markup    une chaîne HTML ajoutée au corps du document (les modales).
     mount()   appelé APRÈS injection : c'est là qu'on câble les écouteurs, une
               fois que les nœuds existent.

   L'api porte `$` (requête par id), `input` (le champ de saisie), `add` (poser
   une bulle dans le fil — c'est par là que passent les refus de caméra) et `esc`.

   ⚠️ CE PLUGIN NE DÉCIDE RIEN. Il dépose des codes dans le champ de saisie —
   c'est un clavier, pas un scanner qui commande. Ce que Monsieur a tapé devant
   (« ajoute ça aux courses », « c'est combien de protéines ? ») reste la seule
   instruction. Corollaire assumé : on ACCUMULE puis on dépose, plutôt que
   d'envoyer à chaque bip.

   Gardé par `GW_FEATURES` (sorte `capacite`) : exactement l'axe où il se
   déclarait avant de devenir un plugin, donc aucun manifeste de pod ne bouge. */

import { FORMATS, createBasket, scanFrame, dropCode, composeMessage } from './codes.js';
import './chrome.css';

const MARKUP = `
  <div id="scanwrap" hidden>
    <video id="scanvideo" playsinline muted autoplay></video>
    <div class="scanframe"></div>
    <div class="scanbar">
      <div class="scanhint">Visez un code-barres — ils s\u2019accumulent, rien n\u2019est envoyé. ✕ retire un code lu à tort.</div>
      <div id="scanlist"></div>
      <div class="scanactions">
        <button id="scan-close" type="button">Annuler</button>
        <button id="scan-done" type="button" class="primary" disabled>Ajouter</button>
      </div>
    </div>
  </div>`;

export default function createScanChrome({ $, input, add }) {
  return {
    composer: [{ id: 'scan', glyphe: '▥', titre: 'Scanner un code-barres' }],
    markup: MARKUP,
    mount() {
  /* ── Lecteur de code-barres ──────────────────────────────────────── */
  // Le scanner est un PÉRIPHÉRIQUE DE SAISIE : il décode, il dépose dans le
  // composer, il se tait. Il n'envoie rien et ne décide rien — c'est le contexte
  // de la conversation qui tranche ce qu'on fait du produit (fiche nutritionnelle,
  // liste de courses, suivi diététique). Corollaire assumé : on ACCUMULE puis on
  // dépose, plutôt que d'envoyer à chaque bip — Monsieur écrit son intention une
  // fois, scanne son panier, envoie une fois. Ça tombe aussi pile sur l'appel
  // groupé de l'addon `food`, donc sur son quota amont (15 lectures/min par IP).
  //
  // Deux décodeurs. BarcodeDetector natif quand le navigateur l'a (Android/Chrome) ;
  // sinon /static/scan.js (@zxing/library, 31 Ko gzip) chargé À LA DEMANDE — iOS
  // Safari porte l'API mais désactivée par défaut de 17.0 à 26.5, Firefox ne l'a pas.
  const scanWrap = $('scanwrap'), scanVideo = $('scanvideo'), scanList = $('scanlist');
  let scanStream = null, scanTimer = null, scanBasket = createBasket(), scanDetector = null, scanCanvas = null;

  function scanSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // Charge le bundle de repli une seule fois. Injecté en <script> plutôt qu'importé :
  // tout le front est en IIFE, on n'ajoute pas un chargeur de modules pour un fichier.
  let scanFallback = null;
  function loadFallback() {
    if (window.AlfredScan) return Promise.resolve(window.AlfredScan);
    if (!scanFallback) {
      scanFallback = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/static/scan.js';
        s.onload = () => resolve(window.AlfredScan);
        s.onerror = () => { scanFallback = null; reject(new Error('décodeur indisponible')); };
        document.head.appendChild(s);
      });
    }
    return scanFallback;
  }

  function renderBasket() {
    const codes = scanBasket.codes;
    scanList.innerHTML = '';
    for (const code of codes) {
      const c = document.createElement('span');
      c.className = 'scode'; c.textContent = code;
      // La croix n'est pas un confort : la corroboration réduit les codes fantômes,
      // elle ne les supprime pas. Sans issue, un seul faux code condamnait le panier
      // entier — on annulait tout et on rescannait.
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'x'; x.textContent = '✕';
      x.title = 'Retirer — lu à tort';
      x.addEventListener('click', () => { dropCode(scanBasket, code); renderBasket(); });
      c.appendChild(x);
      scanList.appendChild(c);
    }
    $('scan-done').disabled = !codes.length;
    $('scan-done').textContent = codes.length
      ? `Ajouter ${codes.length} code${codes.length > 1 ? 's' : ''}` : 'Ajouter';
  }

  // Une trame vient d'être décodée — `hits` peut être vide, et on le signale quand
  // même : c'est l'horloge des corroborations (cf. scanFrame dans scan/codes.js).
  function scanSaw(hits) {
    if (!scanFrame(scanBasket, hits)) return;   // rien de neuf, ou pas encore corroboré
    navigator.vibrate?.(40);
    renderBasket();
  }

  // Fenêtre de la trame RÉELLEMENT à l'écran. La vidéo est en `object-fit: cover` :
  // un capteur paysage sur un écran portrait n'affiche qu'une bande centrale. Y
  // décoder la trame entière analyserait des pixels que Monsieur ne voit pas — et
  // surtout écraserait ceux qu'il vise : le code passerait sous 2 pixels par module,
  // seuil en dessous duquel un EAN-13 cesse d'être lisible. On rend donc au décodeur
  // exactement le champ visé, à la résolution qu'il mérite.
  function visibleFrame(video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const r = video.getBoundingClientRect();
    if (!r.width || !r.height) return { sx: 0, sy: 0, sw: vw, sh: vh };
    const cover = Math.max(r.width / vw, r.height / vh);
    const sw = Math.min(vw, Math.round(r.width / cover));
    const sh = Math.min(vh, Math.round(r.height / cover));
    return { sx: Math.round((vw - sw) / 2), sy: Math.round((vh - sh) / 2), sw, sh };
  }

  async function scanTick() {
    if (scanVideo.readyState < 2 || !scanVideo.videoWidth) return;
    if (scanDetector) {
      // Chemin natif : le détecteur lit la balise vidéo directement, sans canvas.
      try {
        scanSaw((await scanDetector.detect(scanVideo)).map((b) => b.rawValue));
        return;
      } catch {
        // Un détecteur natif présent mais qui échoue à chaque trame laisserait le
        // scan muet pour toujours. On bascule sur zxing une bonne fois, plutôt que
        // d'avaler l'erreur en boucle.
        scanDetector = null;
        loadFallback().catch(() => scanError('Décodeur indisponible.'));
        return;
      }
    }
    const decoder = window.AlfredScan;
    if (!decoder) return;
    // Repli : 800 px de large au plus. Décoder la pleine résolution d'un capteur
    // moderne en JS coûte plus cher que ça ne rapporte en lisibilité — mais 800 px
    // sur le seul champ visible laissent une marge confortable au décodeur.
    const { sx, sy, sw, sh } = visibleFrame(scanVideo);
    const w = Math.min(800, sw);
    const h = Math.max(1, Math.round(sh * (w / sw)));
    if (!scanCanvas) scanCanvas = document.createElement('canvas');
    if (scanCanvas.width !== w || scanCanvas.height !== h) { scanCanvas.width = w; scanCanvas.height = h; }
    const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(scanVideo, sx, sy, sw, sh, 0, 0, w, h);
    const code = decoder.decode(ctx.getImageData(0, 0, w, h));
    scanSaw(code ? [code] : []);
  }

  function scanError(msg) {
    closeScan();
    add('error', msg);
  }

  async function openScan() {
    if (!scanSupported()) {
      // Contexte non sécurisé (http://) ou navigateur sans caméra : le dire, plutôt
      // que d'ouvrir un carré noir.
      return add('error', 'Ce navigateur ne donne pas accès à la caméra (une origine HTTPS est requise).');
    }
    scanBasket = createBasket(); renderBasket();
    scanWrap.hidden = false;
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      return scanError(denied
        ? 'Accès à la caméra refusé — l’autoriser dans les réglages du navigateur.'
        : 'Aucune caméra disponible.');
    }
    scanVideo.srcObject = scanStream;
    // playsinline est posé dans app.html : sans lui, iOS bascule la vidéo en lecteur
    // natif plein écran et l'overlay disparaît sous lui.
    await scanVideo.play().catch(() => {});

    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (formats.length) scanDetector = new window.BarcodeDetector({ formats });
      } catch { scanDetector = null; }
    }
    if (!scanDetector) {
      try { await loadFallback(); } catch { return scanError('Décodeur indisponible.'); }
    }
    // Une trame toutes les 120 ms : au-delà on chauffe le téléphone sans lire plus vite.
    let running = false;
    scanTimer = setInterval(async () => {
      if (running) return;              // une trame lente ne doit pas en empiler d'autres
      running = true;
      try { await scanTick(); } finally { running = false; }
    }, 120);
  }

  function closeScan() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    // Couper les pistes, sinon la caméra (et sa diode) reste allumée après fermeture.
    if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; }
    scanVideo.srcObject = null;
    scanDetector = null;
    scanWrap.hidden = true;
  }

      $('scan').addEventListener('click', openScan);
      $('scan-close').addEventListener('click', () => { closeScan(); scanBasket = createBasket(); });
      $('scan-done').addEventListener('click', () => {
        const codes = scanBasket.codes.slice();
        closeScan(); scanBasket = createBasket();
        if (!codes.length) return;
        input.value = composeMessage(input.value, codes);
        input.focus();
        input.dispatchEvent(new Event('input'));   // rend au textarea sa hauteur
      });
    },
  };
}
