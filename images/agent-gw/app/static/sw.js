/* Service worker — la balade qu'on emporte, et rien de plus.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CE QU'IL N'EST PAS. Ce n'est pas un cache général de la PWA : le chat a
 * besoin du réseau de toute façon, la mémoire change sous les pieds, et un
 * cache trop zélé sert du vieux contenu sans le dire. Deux caches, deux
 * régimes, rien d'autre :
 *
 *   COQUE   — l'app elle-même (HTML, JS, CSS). Préchargée à l'installation,
 *             servie RÉSEAU D'ABORD : on prend la version fraîche quand elle
 *             existe, le cache ne sert qu'à ouvrir l'app sans réseau.
 *   BALADE  — ce que Monsieur a explicitement emporté : les tuiles d'un
 *             parcours et son fichier. Servi CACHE D'ABORD : sur un sentier,
 *             un réseau qui répond en dix secondes est pire que pas de réseau.
 *             Rempli par la page (`caches.open`), jamais par ce fichier.
 *
 * ⚠️ AUCUNE TUILE OPENSTREETMAP N'EST STOCKÉE, JAMAIS. Leur politique
 * l'interdit noir sur blanc — « Offline use is not permitted on
 * tile.openstreetmap.org », et le préchargement d'une zone y est nommément
 * cité comme abus. Le hors-ligne se fait donc sur le Plan IGN
 * (data.geopf.fr), dont les conditions ne l'interdisent pas, qui n'affiche
 * aucun quota d'usage sur la diffusion WMTS et dont la donnée est en licence
 * ouverte. Conséquence assumée : hors de France, la carte reste en ligne.
 * Ce garde-fou est ici ET dans la page — celui-ci est le dernier mot.
 */

const COQUE = 'alfred-coque-v1';
const BALADE = 'alfred-balade-v1';

const SHELL = [
  '/', '/static/app.html',
  '/static/engine.css', '/static/launcher.css',
  '/static/engine.js', '/static/launcher.js',
  '/static/vendor/marked.min.js', '/static/vendor/purify.min.js',
  '/static/manifest.webmanifest', '/static/icon.svg',
];

self.addEventListener('install', (e) => {
  // `addAll` échoue en bloc si UNE ressource manque ; on précharge donc une par
  // une : une coque partiellement en cache vaut mieux qu'aucune.
  e.waitUntil(caches.open(COQUE)
    .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((noms) => Promise.all(noms
      .filter((n) => n.startsWith('alfred-') && n !== COQUE && n !== BALADE)
      .map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Ce que Monsieur a emporté : le cache fait foi, sans même tenter le réseau.
  // C'est tout l'intérêt — en balade, attendre un timeout coûte plus cher que
  // d'afficher une tuile d'hier.
  if (url.hostname === 'data.geopf.fr' || /\.parcours\.json$/i.test(url.pathname)) {
    e.respondWith(caches.open(BALADE)
      .then((c) => c.match(request))
      .then((hit) => hit || fetch(request)));
    return;
  }

  // La coque : réseau d'abord, cache en secours. Une PWA qui sert son vieux JS
  // après un déploiement est un bug qu'on met des heures à comprendre.
  if (url.origin === self.location.origin
      && (url.pathname === '/' || url.pathname.startsWith('/static/'))) {
    e.respondWith(fetch(request)
      .then((r) => {
        if (r.ok) { const copie = r.clone(); caches.open(COQUE).then((c) => c.put(request, copie)); }
        return r;
      })
      .catch(() => caches.match(request).then((hit) => hit || Response.error())));
  }
  // Tout le reste (API, mémoire, chat) : réseau seul. Pas de cache d'un état
  // qui bouge — servir une todo d'hier serait pire que ne rien servir.
});

// La page demande le ménage : elle seule sait ce qui est encore emporté.
self.addEventListener('message', (e) => {
  if (e.data === 'purge-balade') {
    e.waitUntil(caches.delete(BALADE).then(() => e.source?.postMessage('balade-purgee')));
  }
});
