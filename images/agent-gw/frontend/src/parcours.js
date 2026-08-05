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
// PAS DE BIBLIOTHÈQUE DE CARTO. Leaflet fait 42 ko gzippés pour du zoom et du
// déplacement dont une fiche n'a pas besoin : on regarde la forme d'une boucle,
// on ne l'explore pas. Une mosaïque de tuiles est une grille d'`<img>` et une
// projection Mercator tient en six lignes ; le tracé est un `<path>` SVG, qui
// se thème tout seul en clair comme en sombre là où un canvas cuirait ses
// pixels. Le jour où le déplacement manquera vraiment, ce sera un app-module,
// pas ce bloc.
//
// LES DEUX FONDS, vérifiés vivants le 2026-08-05, tous deux gratuits et sans
// clé : Plan IGN (data.geopf.fr, WMTS `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`), qui
// connaît les sentiers français comme personne, et OpenStreetMap, universel.
// Le défaut se choisit sur la position : l'IGN ne couvre pas l'étranger, et une
// carte vide serait une régression silencieuse.

const TUILE = 256;

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

/** La mosaïque de tuiles + le tracé + les pastilles, dans une boîte mesurée. */
function dessineCarte(boite, coords, reperes, fondId) {
  const fond = FONDS[fondId] || FONDS.osm;
  const w = Math.max(260, boite.clientWidth || 640);
  const h = Math.max(200, Math.min(Math.round(w * 0.62), 420));
  const pad = 26;                       // les pastilles débordent du tracé
  const pts = coords.length ? coords : reperes.map((r) => r.pt).filter(Boolean);
  if (!pts.length) return;

  const bbox = bboxDe(pts);
  const z = zoomPour(bbox, w - pad * 2, h - pad * 2, fond.zoomMax);
  const [cx, cy] = worldPx((bbox.latMin + bbox.latMax) / 2, (bbox.lngMin + bbox.lngMax) / 2, z);
  const ox = cx - w / 2;
  const oy = cy - h / 2;
  const enPx = ([lat, lng]) => {
    const [x, y] = worldPx(lat, lng, z);
    return [x - ox, y - oy];
  };

  boite.textContent = '';
  boite.style.height = `${h}px`;

  const nMax = 2 ** z;
  const tuiles = el('div', 'pc-tiles');
  for (let tx = Math.floor(ox / TUILE); tx <= Math.floor((ox + w) / TUILE); tx += 1) {
    for (let ty = Math.floor(oy / TUILE); ty <= Math.floor((oy + h) / TUILE); ty += 1) {
      if (ty < 0 || ty >= nMax) continue;              // pas de tuile aux pôles
      const img = new Image();
      img.src = fond.url(z, ((tx % nMax) + nMax) % nMax, ty);   // le monde boucle en x
      img.alt = '';
      img.loading = 'lazy';
      img.style.left = `${tx * TUILE - ox}px`;
      img.style.top = `${ty * TUILE - oy}px`;
      tuiles.appendChild(img);
    }
  }
  boite.appendChild(tuiles);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pc-svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('aria-hidden', 'true');

  if (coords.length) {
    const d = coords.map(enPx).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    // Deux traits superposés : un liseré clair dessous, la ligne d'accent
    // dessus. Sans ça, un tracé sombre sur une forêt sombre disparaît.
    for (const cls of ['pc-halo', 'pc-line']) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', cls);
      svg.appendChild(p);
    }
  }
  boite.appendChild(svg);

  reperes.forEach((r, i) => {
    if (!r.pt) return;
    const [x, y] = enPx(r.pt);
    if (x < -20 || y < -20 || x > w + 20 || y > h + 20) return;
    const b = el('button', 'pc-pin', String(i + 1));
    b.type = 'button';
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.title = r.nom || `Repère ${i + 1}`;
    b.setAttribute('aria-label', `Repère ${i + 1} : ${r.nom || ''}`);
    b.dataset.n = String(i);
    boite.appendChild(b);
  });

  const credit = el('div', 'pc-credit', fond.credit);
  boite.appendChild(credit);
}

/** Le profil altimétrique — omis quand il n'y a rien à voir. */
function dessineProfil(altitudes, distance) {
  if (altitudes.length < 4) return null;
  const min = Math.min(...altitudes);
  const max = Math.max(...altitudes);
  // Sous 15 m d'amplitude, une courbe de dénivelé est un trait bruité qu'on
  // lirait comme du relief : mieux vaut ne rien montrer que faire croire.
  if (max - min < 15) return null;

  const w = 640;
  const h = 90;
  const n = altitudes.length;
  const x = (i) => (i / (n - 1)) * w;
  const y = (v) => h - 6 - ((v - min) / (max - min)) * (h - 18);
  const ligne = altitudes.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pc-prof');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  const desc = document.createElementNS(NS, 'desc');
  desc.textContent = `Profil altimétrique sur ${fmtKm(distance)} : de ${Math.round(min)} `
    + `à ${Math.round(max)} mètres.`;
  svg.appendChild(desc);

  const aire = document.createElementNS(NS, 'path');
  aire.setAttribute('d', `${ligne}L${w} ${h}L0 ${h}Z`);
  aire.setAttribute('class', 'pc-prof-fill');
  svg.appendChild(aire);
  const trait = document.createElementNS(NS, 'path');
  trait.setAttribute('d', ligne);
  trait.setAttribute('class', 'pc-prof-line');
  svg.appendChild(trait);
  return svg;
}

function listeReperes(reperes) {
  const ol = el('ol', 'pc-list');
  reperes.forEach((r, i) => {
    const li = el('li');
    li.dataset.n = String(i);
    li.appendChild(el('div', 'pc-nom', r.nom || `Repère ${i + 1}`));

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
    const redessine = () => dessineCarte(boite, coords, reperes, fondId);
    redessine();

    const bascule = el('button', 'pc-fond', FONDS[fondId === 'ign' ? 'osm' : 'ign'].nom);
    bascule.type = 'button';
    bascule.title = 'Changer de fond de carte';
    bascule.addEventListener('click', () => {
      fondId = fondId === 'ign' ? 'osm' : 'ign';
      bascule.textContent = FONDS[fondId === 'ign' ? 'osm' : 'ign'].nom;
      redessine();
    });
    hote.appendChild(bascule);

    // La largeur du conteneur décide du zoom : une rotation de téléphone doit
    // redessiner, sinon la trace sort du cadre ou s'y perd.
    let t = 0;
    const onResize = () => { clearTimeout(t); t = setTimeout(redessine, 180); };
    window.addEventListener('resize', onResize);
    hote._pcCleanup = () => window.removeEventListener('resize', onResize);
  } else {
    hote.appendChild(el('div', 'pc-vide', 'Aucun point à afficher.'));
  }

  const profil = dessineProfil(altitudes, trace.distance_m || 0);
  if (profil) hote.appendChild(profil);

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

  const pied = el('div', 'pc-foot');
  if (trace.calcule_le) {
    pied.appendChild(el('span', 'pc-src',
      `Trace calculée le ${trace.calcule_le} — ${trace.moteur || 'routeur inconnu'}.`));
  }
  if (relPath) {
    const dl = el('a', 'pc-dl', '↓ GPX');
    dl.href = `/api/parcours/gpx?f=${encodeURIComponent(relPath)}`;
    dl.title = 'Télécharger la trace (Organic Maps, OsmAnd…)';
    pied.appendChild(dl);
  }
  hote.appendChild(pied);
}

/** Monte tous les blocs `{% parcours %}` d'un document déjà inséré.
 *  Idempotent : un bloc déjà peint est ignoré. */
export function mountParcours(racine = document) {
  for (const hote of racine.querySelectorAll('.parcours[data-src]:not(.pc-ready):not(.pc-loading)')) {
    hote.classList.add('pc-loading');
    const src = hote.dataset.src;
    // Le chemin mémoire, reconstitué depuis l'URL brute : c'est lui que
    // /api/parcours/gpx attend, et le bloc n'a que l'URL.
    const rel = decodeURIComponent(String(src).replace(/^\/?api\/memory\/raw\//, ''));
    fetch(src, { headers: { Accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => peindre(hote, data, rel))
      .catch((e) => {
        hote.textContent = '';
        hote.appendChild(el('div', 'pc-vide', `Parcours illisible : ${e.message}`));
      })
      .finally(() => hote.classList.remove('pc-loading'));
  }
}
