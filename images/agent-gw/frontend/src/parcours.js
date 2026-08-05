// Parcours — la carte d'une balade, peinte au montage. Sans bibliothèque.
//
// POURQUOI UNE PASSE DE MONTAGE, ALORS QUE `chart` DESSINE AU TRANSFORM. Un
// graphique porte ses données dans son corps ; un parcours, non : sa géométrie
// vit dans un `*.parcours.json` à côté de la fiche (328 points pour 3 km — les
// coller dans le markdown reviendrait à les faire relire par le modèle à chaque
// écriture, exactement ce que toute la chaîne évite). Il faut donc aller les
// CHERCHER, et un transform est synchrone. C'est le patron déjà déclaré par le
// bloc `outil` : le moteur pose une ancre, le front y monte la vue.
//
// L'INVARIANT TIENT QUAND MÊME, et c'est la seule chose qui compte ici : rien
// du fichier ne s'EXÉCUTE. La donnée n'entre dans le DOM que par `textContent`
// et par des attributs que ce module fabrique lui-même ; il n'y a pas un seul
// `innerHTML` porteur de contenu mémoire dans ce fichier. Le seul endroit où un
// fichier peut proposer une URL est le `web` d'un repère : elle est filtrée sur
// http/https (cf. `href`), parce qu'un `javascript:` dans une fiche deviendrait
// du script au clic — le trou que le pipeline existe pour fermer.
//
// PAS DE BIBLIOTHÈQUE DE CARTO — et l'argument a changé en route, il faut le
// dire. Le premier était : « on regarde la forme d'une boucle, on ne l'explore
// pas, donc pas besoin de zoom ». Monsieur a demandé le déplacement et le zoom
// le 2026-08-06 : la prémisse tombe, cet argument-là avec.
// Ce qui reste, et qui suffit : Leaflet pèse ~150 ko bruts sur un bundle de 300
// chargé pour CHAQUE fiche, alors que la projection, la mosaïque et le tracé
// étaient déjà écrits ici — il n'a manqué que l'inverse de la projection et
// trois écouteurs (cf. `creerCarte`). Une mosaïque de tuiles est une grille
// d'`<img>`, Mercator tient en six lignes, et le tracé est un `<path>` SVG qui
// se thème tout seul en clair comme en sombre là où un canvas cuirait ses
// pixels.
//
// LES DEUX FONDS, vérifiés vivants le 2026-08-05, tous deux gratuits et sans
// clé : Plan IGN (data.geopf.fr, WMTS `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`), qui
// connaît les sentiers français comme personne, et OpenStreetMap, universel.
// Le défaut se choisit sur la position : l'IGN ne couvre pas l'étranger, et une
// carte vide serait une régression silencieuse.

const TUILE = 256;

// Les 12 teintes du système, celles des graphiques. Un repère peut en porter
// une — mais elle vient d'un FICHIER, pas d'un schéma Markdoc : elle est donc
// validée ici avant de toucher au DOM, comme tout le reste de ce fichier.
const TEINTES = ['rouge', 'orange', 'ambre', 'vert', 'emeraude', 'turquoise',
  'bleu', 'indigo', 'violet', 'rose', 'gris', 'ardoise'];
const teinte = (v) => (TEINTES.includes(v) ? v : null);

const FONDS = {
  ign: {
    nom: 'Plan IGN',
    url: (z, x, y) => 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
      + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM'
      + `&FORMAT=image/png&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`,
    credit: '© IGN — Géoplateforme',
    zoomMax: 18,
  },
  osm: {
    nom: 'OpenStreetMap',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    credit: '© les contributeurs OpenStreetMap',
    zoomMax: 19,
  },
};

// France métropolitaine, largement. Sert UNIQUEMENT à choisir un fond par
// défaut : se tromper coûte un clic sur le sélecteur, jamais une trace fausse.
const FRANCE = { lat: [41.2, 51.3], lng: [-5.3, 9.7] };

/** Polyline encodée -> valeurs. `dims=1, factor=1` pour la série d'altitudes. */
export function decode(encoded, factor = 1e5, dims = 2) {
  const out = [];
  const acc = new Array(dims).fill(0);
  let i = 0;
  while (i < encoded.length) {
    for (let d = 0; d < dims; d += 1) {
      let shift = 0;
      let result = 0;
      let b = 0;
      do {
        b = encoded.charCodeAt(i) - 63;
        i += 1;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < encoded.length);
      acc[d] += (result & 1) ? ~(result >> 1) : (result >> 1);
    }
    out.push(acc.map((v) => v / factor));
  }
  return out;
}

/** (lat, lng) -> pixel monde au zoom z (Mercator sphérique, convention slippy). */
function worldPx(lat, lng, z) {
  const n = TUILE * 2 ** z;
  const s = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
  return [
    ((lng + 180) / 360) * n,
    (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n,
  ];
}

/** Mètres entre deux (lat, lng). Sert aux distances cumulées du profil et à
 *  l'ancrage des repères sur la trace. */
function haversine(a, b) {
  const R = 6371008.8;
  const p1 = (a[0] * Math.PI) / 180;
  const p2 = (b[0] * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Le plus grand zoom auquel la boîte englobante tient dans (w, h). */
function zoomPour(bbox, w, h, zoomMax) {
  for (let z = zoomMax; z >= 2; z -= 1) {
    const [x1, y1] = worldPx(bbox.latMax, bbox.lngMin, z);
    const [x2, y2] = worldPx(bbox.latMin, bbox.lngMax, z);
    if (x2 - x1 <= w && y2 - y1 <= h) return z;
  }
  return 2;
}

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;    // JAMAIS innerHTML sur du contenu mémoire
  return n;
};

/** Une URL proposée par une fiche -> une href sûre, ou null.
 *  `javascript:` et `data:` sont refusés : au clic, ils s'exécutent. */
function href(url) {
  try {
    const u = new URL(String(url), window.location.origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
  } catch { return null; }
}

const fmtKm = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${m} m`);

function fmtDuree(s) {
  if (!s) return null;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

function bboxDe(points) {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  return {
    latMin: Math.min(...lats), latMax: Math.max(...lats),
    lngMin: Math.min(...lngs), lngMax: Math.max(...lngs),
  };
}

/** Inverse de `worldPx` : un pixel monde -> (lat, lng). Nécessaire dès qu'on
 *  zoome autour d'un point : il faut savoir QUEL lieu se trouve sous le curseur
 *  pour le laisser sous le curseur après le zoom. */
function latLngDe(x, y, z) {
  const n = TUILE * 2 ** z;
  const t = Math.PI - (2 * Math.PI * y) / n;
  return [
    (180 / Math.PI) * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t))),
    (x / n) * 360 - 180,
  ];
}

/** La carte : mosaïque de tuiles, tracé, pastilles — et les gestes.
 *
 *  ⚠️ CE BLOC A EU RAISON DE NE PAS PRENDRE LEAFLET, PUIS TORT. L'argument
 *  d'origine était honnête mais CONDITIONNEL : « on regarde la forme d'une
 *  boucle, on ne l'explore pas ». Monsieur a explorer à faire — la prémisse
 *  tombe, l'argument avec. Reste la question du coût : Leaflet pèse ~150 ko
 *  bruts sur un bundle de 300, chargé pour CHAQUE fiche, quand la projection,
 *  la mosaïque et le tracé étaient déjà écrits ici. Il ne manquait que
 *  l'inverse de la projection et trois écouteurs. C'est ce qui suit.
 *
 *  LE GESTE TACTILE EST DÉLIBÉRÉMENT PARTAGÉ. Un doigt fait défiler LA PAGE,
 *  deux doigts déplacent et zooment LA CARTE. Prendre le doigt unique (ce que
 *  fait `touch-action:none`) rendrait une fiche longue impossible à parcourir
 *  dès que le pouce tombe sur la carte. À la souris il n'y a pas de conflit :
 *  glisser déplace. À la molette, le zoom exige Ctrl/⌘ — sinon la page défile,
 *  et le pincement de trackpad l'envoie déjà (il porte `ctrlKey`).
 *
 *  Rend un contrôleur : { redessine, bascule, recadre, detruire }.
 */
function creerCarte(boite, coords, reperes, fondInitial) {
  let fondId = fondInitial;
  let vue = null;                                  // { z, lat, lng } — le centre
  // Le zoom de cadrage — celui qui montre le parcours entier. Il sert de PLANCHER
  // (à un cran près) : au-delà, on ne voit plus la balade, on voit la région, et
  // une carte du département avec un fil de 3 km au milieu ne renseigne sur rien.
  let zCadre = null;
  const pts = coords.length ? coords : reperes.map((r) => r.pt).filter(Boolean);
  const NS = 'http://www.w3.org/2000/svg';
  let pan = null;                                  // le calque déplaçable

  const taille = () => {
    const w = Math.max(260, boite.clientWidth || 640);
    return { w, h: Math.max(200, Math.min(Math.round(w * 0.62), 420)) };
  };

  function recadre() {
    if (!pts.length) return;
    const { w, h } = taille();
    const bbox = bboxDe(pts);
    const pad = 30;                                // les pastilles débordent
    const z = zoomPour(bbox, w - pad * 2, h - pad * 2, FONDS[fondId].zoomMax);
    zCadre = z;
    vue = { z, lat: (bbox.latMin + bbox.latMax) / 2, lng: (bbox.lngMin + bbox.lngMax) / 2 };
  }

  function zoome(delta, ancreX, ancreY) {
    const { w, h } = taille();
    // Plancher : un cran sous le cadrage. De quoi respirer autour du parcours,
    // pas de quoi se perdre dans la région.
    const plancher = zCadre != null ? zCadre - 1 : 3;
    const z2 = Math.max(plancher, Math.min(FONDS[fondId].zoomMax, vue.z + delta));
    if (z2 === vue.z) return;
    // Le lieu sous le curseur doit y rester : on le résout avant, puis on
    // replace le centre pour qu'il retombe au même pixel après le zoom.
    const [cx, cy] = worldPx(vue.lat, vue.lng, vue.z);
    const sous = latLngDe(cx - w / 2 + ancreX, cy - h / 2 + ancreY, vue.z);
    const [ax, ay] = worldPx(sous[0], sous[1], z2);
    const [nl, ng] = latLngDe(ax + (w / 2 - ancreX), ay + (h / 2 - ancreY), z2);
    vue = { z: z2, lat: nl, lng: ng };
    dessine();
  }

  function deplace(dx, dy) {
    const { w, h } = taille();
    const [cx, cy] = worldPx(vue.lat, vue.lng, vue.z);
    const [nl, ng] = latLngDe(cx - dx, cy - dy, vue.z);
    vue = { z: vue.z, lat: nl, lng: ng };
    dessine();
    void w; void h;
  }

  function dessine() {
    if (!pts.length) return;
    if (!vue) recadre();
    const fond = FONDS[fondId] || FONDS.osm;
    vue.z = Math.min(vue.z, fond.zoomMax);
    const { w, h } = taille();
    const [cx, cy] = worldPx(vue.lat, vue.lng, vue.z);
    const ox = cx - w / 2;
    const oy = cy - h / 2;
    const enPx = ([lat, lng]) => {
      const [x, y] = worldPx(lat, lng, vue.z);
      return [x - ox, y - oy];
    };

    boite.style.height = `${h}px`;
    pan = el('div', 'pc-pan');

    const nMax = 2 ** vue.z;
    const tuiles = el('div', 'pc-tiles');
    for (let tx = Math.floor(ox / TUILE); tx <= Math.floor((ox + w) / TUILE); tx += 1) {
      for (let ty = Math.floor(oy / TUILE); ty <= Math.floor((oy + h) / TUILE); ty += 1) {
        if (ty < 0 || ty >= nMax) continue;              // pas de tuile aux pôles
        const img = new Image();
        img.src = fond.url(vue.z, ((tx % nMax) + nMax) % nMax, ty);   // le monde boucle en x
        img.alt = '';
        img.style.left = `${tx * TUILE - ox}px`;
        img.style.top = `${ty * TUILE - oy}px`;
        tuiles.appendChild(img);
      }
    }
    pan.appendChild(tuiles);

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'pc-svg');
    // ⚠️ Largeur et hauteur en PIXELS, pas en pourcentage. `* { box-sizing:
    // border-box }` est global et `.pc-map` porte une bordure : fixer
    // `style.height = h` donne un intérieur de h−2 px. Un SVG en `height:100%`
    // avec un viewBox de h unités s'y comprimait donc de 0,5 % — pendant que
    // les tuiles et les pastilles restaient en pixels bruts. Le tracé glissait
    // hors des rues, d'autant plus qu'on descendait dans la carte. En pixels
    // absolus, les trois calques partagent exactement le même repère.
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('aria-hidden', 'true');

    const pxs = coords.map(enPx);
    if (pxs.length) {
      const d = pxs.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
      // Deux traits superposés : un liseré clair dessous, la ligne d'accent
      // dessus. Sans ça, un tracé sombre sur une forêt sombre disparaît.
      // La ligne est SEMI-OPAQUE : là où le parcours repasse sur lui-même, les
      // deux passages s'additionnent et le tronçon fonce. C'est le seul indice
      // gratuit qu'un aller-retour existe — sinon il se cache sous lui-même.
      for (const cls of ['pc-halo', 'pc-line']) {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('class', cls);
        svg.appendChild(p);
      }
      // Des chevrons orientés, tous les ~90 px de tracé : ils donnent le SENS de
      // marche. Deux chevrons opposés sur la même rue disent « on y va et on en
      // revient » — ce qu'aucune épaisseur de trait ne peut dire.
      let reste = 55;
      for (let i = 1; i < pxs.length; i += 1) {
        const [x0, y0] = pxs[i - 1];
        const [x1, y1] = pxs[i];
        const seg = Math.hypot(x1 - x0, y1 - y0);
        if (seg < 0.5) continue;
        let pos = reste;
        while (pos <= seg) {
          const t = pos / seg;
          const ch = document.createElementNS(NS, 'path');
          ch.setAttribute('d', 'M-3.2 -3.4 L2.6 0 L-3.2 3.4');
          ch.setAttribute('class', 'pc-chev');
          ch.setAttribute('transform', `translate(${(x0 + (x1 - x0) * t).toFixed(1)} `
            + `${(y0 + (y1 - y0) * t).toFixed(1)}) `
            + `rotate(${((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI).toFixed(1)})`);
          svg.appendChild(ch);
          pos += 90;
        }
        reste = pos - seg;
      }
    }
    pan.appendChild(svg);

    // Les pastilles. Deux corrections de lisibilité, dans cet ordre :
    //
    // 1. DÉPART ET ARRIVÉE. Sur une boucle ils sont le MÊME point : deux
    //    pastilles exactement superposées, et on ne sait plus par où l'on
    //    commence. Quand elles coïncident (moins de 18 px), une seule les porte
    //    toutes les deux — « 1·19 », marquée départ — au lieu d'en cacher une.
    // 2. LES AUTRES COLLISIONS : ON N'Y TOUCHE PAS. Un éventail anti-collision
    //    a été essayé le 2026-08-06, puis retiré le jour même : il décalait les
    //    pastilles de 20 px, soit ~50 m au zoom de cadrage — un repère posé une
    //    rue plus loin que le monument qu'il nomme. Depuis que la carte se
    //    zoome, deux pastilles serrées se séparent d'un geste, alors qu'une
    //    pastille déplacée MENT et que rien ne le dit. On préfère le tas
    //    honnête au rangement faux.
    //
    // ⚠️ La pastille porte TOUJOURS son numéro, jamais le picto du repère :
    //    dix-neuf emojis sur une carte ne se distinguent pas, et le numéro est
    //    le seul lien avec la description. Le picto vit dans la liste.
    const visibles = reperes.map((r, i) => (r.pt ? { r, i, p: enPx(r.pt) } : null)).filter(Boolean)
      .filter(({ p }) => p[0] > -24 && p[1] > -24 && p[0] < w + 24 && p[1] < h + 24);
    const dernier = visibles.length - 1;
    const estBoucle = visibles.length > 1 && visibles[0].i === 0 && visibles[dernier].i === reperes.length - 1
      && Math.hypot(visibles[0].p[0] - visibles[dernier].p[0], visibles[0].p[1] - visibles[dernier].p[1]) < 18;

    visibles.forEach((v, rang) => {
      if (estBoucle && rang === dernier) return;              // fondu dans le départ
      const [x, y] = v.p;

      const estDepart = rang === 0 && v.i === 0;
      const numero = estBoucle && estDepart
        ? `${v.i + 1}·${visibles[dernier].i + 1}`
        : String(v.i + 1);
      const b = el('button', 'pc-pin', numero);
      b.type = 'button';
      if (estDepart) b.classList.add('pc-start');
      if (!estBoucle && rang === dernier && v.i === reperes.length - 1) b.classList.add('pc-end');
      const t = teinte(v.r.couleur);
      if (t) b.dataset.teinte = t;
      b.style.left = `${x}px`;
      b.style.top = `${y}px`;
      const role = estDepart ? (estBoucle ? 'Départ et arrivée' : 'Départ')
        : (rang === dernier ? 'Arrivée' : `Repère ${v.i + 1}`);
      b.title = `${role} — ${v.r.nom || ''}`.trim();
      b.setAttribute('aria-label', b.title);
      b.dataset.n = String(v.i);
      pan.appendChild(b);
    });

    boite.textContent = '';
    boite.appendChild(pan);
    boite.appendChild(commandes());
    boite.appendChild(el('div', 'pc-credit', fond.credit));
  }

  function commandes() {
    const ctl = el('div', 'pc-ctl');
    const bouton = (txt, titre, fn) => {
      const b = el('button', 'pc-z', txt);
      b.type = 'button';
      b.title = titre;
      b.setAttribute('aria-label', titre);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      ctl.appendChild(b);
    };
    const { w, h } = taille();
    bouton('+', 'Zoomer', () => zoome(1, w / 2, h / 2));
    bouton('−', 'Dézoomer', () => zoome(-1, w / 2, h / 2));
    bouton('⤢', 'Recadrer sur le parcours', () => { recadre(); dessine(); });
    return ctl;
  }

  /* ── Les gestes ──────────────────────────────────────────────────────── */
  const actifs = new Map();
  let depart = null;                    // { x, y, ecart } au début d'un geste
  let bouge = false;

  const centreDesPointeurs = () => {
    const l = [...actifs.values()];
    const x = l.reduce((s, p) => s + p.x, 0) / l.length;
    const y = l.reduce((s, p) => s + p.y, 0) / l.length;
    const ecart = l.length > 1 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0;
    return { x, y, ecart };
  };
  const local = (ev) => {
    const r = boite.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  // Au tactile, UN doigt appartient à la page (elle doit pouvoir défiler) ;
  // deux doigts appartiennent à la carte. À la souris, pas de conflit.
  const prendLaMain = () => (actifs.size >= 2
    || [...actifs.values()].some((p) => p.type !== 'touch'));

  const onDown = (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    actifs.set(ev.pointerId, { ...local(ev), type: ev.pointerType });
    if (!prendLaMain()) return;
    boite.setPointerCapture?.(ev.pointerId);
    depart = centreDesPointeurs();
    bouge = false;
  };
  const onMove = (ev) => {
    if (!actifs.has(ev.pointerId)) return;
    actifs.set(ev.pointerId, { ...local(ev), type: ev.pointerType });
    if (!depart || !prendLaMain()) return;
    ev.preventDefault();
    const c = centreDesPointeurs();
    const dx = c.x - depart.x;
    const dy = c.y - depart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) bouge = true;
    // Le déplacement se joue en TRANSFORM pendant le geste : redessiner la
    // mosaïque à chaque `pointermove` saccaderait. On ne recalcule qu'au relâché.
    if (pan) pan.style.transform = `translate(${dx}px, ${dy}px)`;
    // Le pincement, lui, se voit tout de suite — un zoom différé serait illisible.
    if (depart.ecart > 20 && c.ecart > 20) {
      const ratio = c.ecart / depart.ecart;
      if (ratio > 1.6 || ratio < 0.62) {
        if (pan) pan.style.transform = '';
        zoome(ratio > 1 ? 1 : -1, c.x, c.y);
        depart = c;
      }
    }
  };
  const onUp = (ev) => {
    if (!actifs.has(ev.pointerId)) return;
    const c = depart && prendLaMain() ? centreDesPointeurs() : null;
    actifs.delete(ev.pointerId);
    if (!c || !depart) { depart = null; return; }
    const dx = c.x - depart.x;
    const dy = c.y - depart.y;
    depart = actifs.size ? centreDesPointeurs() : null;
    if (!bouge) return;
    if (pan) pan.style.transform = '';
    deplace(dx, dy);
  };
  const onWheel = (ev) => {
    // Sans Ctrl/⌘, la page défile : une carte au milieu d'une fiche ne doit pas
    // capturer la molette. Le pincement de trackpad envoie `ctrlKey` de
    // lui-même, donc il zoome sans que l'utilisateur ait rien à tenir.
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const { x, y } = local(ev);
    zoome(ev.deltaY < 0 ? 1 : -1, x, y);
  };
  const onDbl = (ev) => {
    const { x, y } = local(ev);
    zoome(1, x, y);
  };

  boite.addEventListener('pointerdown', onDown);
  boite.addEventListener('pointermove', onMove, { passive: false });
  boite.addEventListener('pointerup', onUp);
  boite.addEventListener('pointercancel', onUp);
  boite.addEventListener('wheel', onWheel, { passive: false });
  boite.addEventListener('dblclick', onDbl);

  return {
    dessine,
    recadre: () => { recadre(); dessine(); },
    bascule: (id) => { fondId = id; dessine(); },
    aBouge: () => bouge,
    detruire() {
      boite.removeEventListener('pointerdown', onDown);
      boite.removeEventListener('pointermove', onMove);
      boite.removeEventListener('pointerup', onUp);
      boite.removeEventListener('pointercancel', onUp);
      boite.removeEventListener('wheel', onWheel);
      boite.removeEventListener('dblclick', onDbl);
    },
  };
}

/** Distances cumulées le long de la trace, en mètres. */
function cumule(coords) {
  const out = [0];
  for (let i = 1; i < coords.length; i += 1) out.push(out[i - 1] + haversine(coords[i - 1], coords[i]));
  return out;
}

/** L'indice du sommet le plus proche, en ne cherchant que VERS L'AVANT depuis
 *  `depuis` — même règle que le hub : sur une boucle, le dernier repère EST le
 *  premier, et une recherche globale le ramènerait au départ. */
function ancre(coords, pt, depuis = 0) {
  let best = depuis;
  let bestD = Infinity;
  for (let i = depuis; i < coords.length; i += 1) {
    const d = haversine(pt, coords[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Le profil altimétrique — avec ses échelles et ses repères, sinon rien.
 *
 *  ⚠️ L'abscisse est la DISTANCE, pas l'indice du point. Une trace routée est
 *  dense dans les virages et clairsemée en ligne droite : tracée par indice,
 *  une épingle à cheveux occupe autant de largeur qu'un kilomètre de plat, et
 *  la pente affichée n'est plus la pente réelle. C'était le cas, c'est corrigé.
 *
 *  Géométrie en unités de viewBox, mise à l'échelle par le conteneur — même
 *  technique que `chart-ligne` : le texte suit, et une requête de conteneur le
 *  regrossit dans une colonne étroite (cf. design-system.css). */
function dessineProfil(coords, altitudes, reperes) {
  if (altitudes.length < 4 || coords.length !== altitudes.length) return null;
  const min = Math.min(...altitudes);
  const max = Math.max(...altitudes);
  // Sous 15 m d'amplitude, une courbe de dénivelé est un trait bruité qu'on
  // lirait comme du relief : mieux vaut ne rien montrer que faire croire.
  if (max - min < 15) return null;

  const W = 660; const H = 148;
  const L = 40; const R = 10; const T = 20; const B = 26;   // marges des échelles
  const dist = cumule(coords);
  const total = dist[dist.length - 1] || 1;
  const x = (m) => L + (m / total) * (W - L - R);
  const y = (v) => H - B - ((v - min) / (max - min)) * (H - T - B);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pc-prof');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  const add = (tag, attrs, txt) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (txt != null) n.textContent = txt;
    svg.appendChild(n);
    return n;
  };
  add('desc', {}, `Profil altimétrique sur ${fmtKm(total)} : de ${Math.round(min)} `
    + `à ${Math.round(max)} mètres, ${reperes.length} repères.`);

  // Échelle verticale : les deux altitudes qui bornent, pas une graduation
  // décorative — c'est l'amplitude qui se lit, et elle tient en deux nombres.
  for (const v of [max, min]) {
    add('line', { x1: L, y1: y(v), x2: W - R, y2: y(v), class: 'pc-grid' });
    add('text', { x: L - 6, y: y(v) + 4, class: 'pc-tick', 'text-anchor': 'end' }, `${Math.round(v)} m`);
  }

  const ligne = altitudes.map((v, i) => `${i ? 'L' : 'M'}${x(dist[i]).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  add('path', { d: `${ligne}L${x(total).toFixed(1)} ${H - B}L${L} ${H - B}Z`, class: 'pc-prof-fill' });
  add('path', { d: ligne, class: 'pc-prof-line' });

  // Échelle horizontale : départ, arrivée, et le milieu s'il y a la place.
  add('text', { x: L, y: H - 8, class: 'pc-tick', 'text-anchor': 'start' }, '0');
  add('text', { x: W - R, y: H - 8, class: 'pc-tick', 'text-anchor': 'end' }, fmtKm(total));
  if (total > 1200) {
    add('text', { x: x(total / 2), y: H - 8, class: 'pc-tick', 'text-anchor': 'middle' }, fmtKm(total / 2));
  }

  // Les repères sur le profil : un trait chacun, et le numéro quand il y a la
  // place. Dix-neuf numéros sur 620 unités se chevauchent — un chiffre illisible
  // vaut moins qu'un trait qui situe.
  let depuis = 0;
  let dernierX = -Infinity;
  reperes.forEach((r, i) => {
    if (!r.pt) return;
    depuis = ancre(coords, r.pt, depuis);
    const px = x(dist[depuis]);
    add('line', { x1: px, y1: T - 4, x2: px, y2: H - B, class: 'pc-mark' });
    if (px - dernierX > 22) {
      add('text', { x: px, y: T - 8, class: 'pc-mark-n', 'text-anchor': 'middle' }, String(i + 1));
      dernierX = px;
    }
  });
  return svg;
}

function listeReperes(reperes) {
  const ol = el('ol', 'pc-list');
  reperes.forEach((r, i) => {
    const li = el('li');
    li.dataset.n = String(i);
    // Picto et teinte sont libres : c'est l'agent qui rédige qui décide de
    // l'allure d'un repère, pas ce fichier. Le NUMÉRO, lui, ne bouge pas —
    // c'est le seul lien entre la pastille sur la carte et sa description.
    const t = teinte(r.couleur);
    if (t) li.dataset.teinte = t;
    const nom = el('div', 'pc-nom');
    if (r.picto) nom.appendChild(el('span', 'pc-ico', String(r.picto).slice(0, 2)));
    nom.appendChild(el('span', null, r.nom || `Repère ${i + 1}`));
    li.appendChild(nom);

    const meta = [];
    if (r.distance_precedent_m) meta.push(`${fmtKm(r.distance_precedent_m)} depuis le précédent`);
    // Au-delà de 60 m, l'écart cesse d'être « le point vise le lieu, la trace
    // suit la voie » et devient une coordonnée à vérifier. On le dit.
    if (r.ecart_trace_m > 60) meta.push(`⚠ à ${r.ecart_trace_m} m de la trace`);
    if (meta.length) li.appendChild(el('div', 'pc-meta', meta.join(' · ')));

    if (r.desc) li.appendChild(el('div', 'pc-desc', r.desc));
    if (r.note) li.appendChild(el('div', 'pc-note', r.note));

    const url = r.web ? href(r.web) : null;
    if (url) {
      const a = el('a', 'pc-web', new URL(url).hostname.replace(/^www\./, ''));
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
    }
    ol.appendChild(li);
  });
  return ol;
}

function peindre(hote, data, relPath) {
  const trace = data.trace || {};
  const reperes = (data.reperes || []).map((r) => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(r.latlng || ''));
    return { ...r, pt: m ? [parseFloat(m[1]), parseFloat(m[2])] : null };
  });
  const coords = trace.geometrie ? decode(trace.geometrie) : [];
  const altitudes = trace.altitudes ? decode(trace.altitudes, 1, 1).map((v) => v[0]) : [];

  hote.textContent = '';
  hote.classList.add('pc-ready');

  const tete = el('div', 'pc-head');
  if (data.titre) tete.appendChild(el('div', 'pc-title', data.titre));
  const chiffres = [];
  if (trace.distance_m) chiffres.push(fmtKm(trace.distance_m));
  if (trace.denivele_pos_m != null) chiffres.push(`D+ ${trace.denivele_pos_m} m`);
  const duree = fmtDuree(trace.duree_s);
  if (duree) chiffres.push(`${duree} de marche`);
  if (trace.escaliers_m) chiffres.push(`${trace.escaliers_m} m d'escaliers`);
  chiffres.push(`${reperes.length} repère${reperes.length > 1 ? 's' : ''}`);
  tete.appendChild(el('div', 'pc-stats', chiffres.join(' · ')));
  hote.appendChild(tete);

  const pts = coords.length ? coords : reperes.map((r) => r.pt).filter(Boolean);
  if (pts.length) {
    const centre = bboxDe(pts);
    const enFrance = centre.latMin > FRANCE.lat[0] && centre.latMax < FRANCE.lat[1]
      && centre.lngMin > FRANCE.lng[0] && centre.lngMax < FRANCE.lng[1];
    let fondId = enFrance ? 'ign' : 'osm';

    const boite = el('div', 'pc-map');
    hote.appendChild(boite);
    const carte = creerCarte(boite, coords, reperes, fondId);
    carte.dessine();

    // La barre de commandes vit SOUS LA CARTE, pas en pied de page : le GPX
    // s'emporte au moment où l'on regarde le tracé, pas après avoir fait défiler
    // dix-neuf descriptions.
    const barre = el('div', 'pc-bar');
    const bascule = el('button', 'pc-fond', FONDS[fondId === 'ign' ? 'osm' : 'ign'].nom);
    bascule.type = 'button';
    bascule.title = 'Changer de fond de carte';
    bascule.addEventListener('click', () => {
      fondId = fondId === 'ign' ? 'osm' : 'ign';
      bascule.textContent = FONDS[fondId === 'ign' ? 'osm' : 'ign'].nom;
      carte.bascule(fondId);
    });
    barre.appendChild(bascule);
    if (relPath) {
      const dl = el('a', 'pc-dl', '↓ Télécharger le GPX');
      dl.href = `/api/parcours/gpx?f=${encodeURIComponent(relPath)}`;
      dl.title = 'La trace, pour Organic Maps, OsmAnd…';
      barre.appendChild(dl);
    }
    hote.appendChild(barre);

    // La largeur du conteneur décide du cadrage : une rotation de téléphone
    // doit recadrer, sinon la trace sort du cadre ou s'y perd. On RECADRE (et
    // non on redessine) : après une rotation, la vue courante n'a plus de sens.
    let t = 0;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => carte.recadre(), 180); };
    window.addEventListener('resize', onResize);
    hote._pcCleanup = () => { window.removeEventListener('resize', onResize); carte.detruire(); };
  } else {
    hote.appendChild(el('div', 'pc-vide', 'Aucun point à afficher.'));
  }

  const profil = dessineProfil(coords, altitudes, reperes);
  if (profil) {
    const cadre = el('div', 'pc-prof-box');
    cadre.appendChild(profil);
    hote.appendChild(cadre);
  }

  const liste = listeReperes(reperes);
  hote.appendChild(liste);

  // Cliquer une pastille met en avant son repère dans la liste, et l'inverse.
  const relier = (n) => {
    for (const x of hote.querySelectorAll('.pc-list li.on, .pc-pin.on')) x.classList.remove('on');
    const li = hote.querySelector(`.pc-list li[data-n="${n}"]`);
    const pin = hote.querySelector(`.pc-pin[data-n="${n}"]`);
    if (li) { li.classList.add('on'); li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (pin) pin.classList.add('on');
  };
  hote.addEventListener('click', (ev) => {
    const cible = ev.target.closest('.pc-pin, .pc-list li');
    if (cible && hote.contains(cible)) relier(cible.dataset.n);
  });

  // Le pied ne porte plus que la provenance : le bouton est monté sous la carte.
  if (trace.calcule_le) {
    const pied = el('div', 'pc-foot');
    pied.appendChild(el('span', 'pc-src',
      `Trace calculée le ${trace.calcule_le} — ${trace.moteur || 'routeur inconnu'}.`));
    hote.appendChild(pied);
  }
}

/** La vue compacte : une carte-lien vers la page du parcours.
 *
 *  Un parcours n'appartient à aucun domaine — il s'accroche à la fiche qui a
 *  une raison d'en parler. Une fiche « week-end en Brocéliande » peut donc en
 *  citer trois sans empiler trois cartes plein cadre. */
function peindreLien(hote, data, relPath) {
  const trace = data.trace || {};
  hote.textContent = '';
  hote.classList.add('pc-ready', 'pc-asLink');

  const a = el('a', 'pc-card');
  a.href = `#/parcours/${relPath.split('/').map(encodeURIComponent).join('/')}`;
  a.appendChild(el('span', 'pc-card-ico', '⛰'));
  const corps = el('span', 'pc-card-body');
  corps.appendChild(el('span', 'pc-card-t', data.titre || 'Parcours'));

  const bits = [];
  if (trace.distance_m) bits.push(fmtKm(trace.distance_m));
  if (trace.denivele_pos_m) bits.push(`D+ ${trace.denivele_pos_m} m`);
  const d = fmtDuree(trace.duree_s);
  if (d) bits.push(d);
  const n = (data.reperes || []).length;
  if (n) bits.push(`${n} repère${n > 1 ? 's' : ''}`);
  // Sans bloc `trace`, on ne fabrique pas un chiffre : on dit qu'il manque.
  corps.appendChild(el('span', 'pc-card-m',
    bits.length ? bits.join(' · ') : 'trace pas encore calculée'));
  a.appendChild(corps);
  hote.appendChild(a);
}

/** Monte tous les blocs `{% parcours %}` d'un document déjà inséré.
 *  Idempotent : un bloc déjà peint est ignoré. */
export function mountParcours(racine = document) {
  for (const hote of racine.querySelectorAll('.parcours[data-src]:not(.pc-ready):not(.pc-loading)')) {
    hote.classList.add('pc-loading');
    const src = hote.dataset.src;
    // Le chemin mémoire, reconstitué depuis l'URL brute : c'est lui que
    // /api/parcours/gpx et la route #/parcours/… attendent, et le bloc n'a que
    // l'URL.
    const rel = decodeURIComponent(String(src).replace(/^\/?api\/memory\/raw\//, ''));
    const peintre = hote.dataset.vue === 'lien' ? peindreLien : peindre;
    fetch(src, { headers: { Accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => peintre(hote, data, rel))
      .catch((e) => {
        hote.textContent = '';
        hote.appendChild(el('div', 'pc-vide', `Parcours illisible : ${e.message}`));
      })
      .finally(() => hote.classList.remove('pc-loading'));
  }
}
