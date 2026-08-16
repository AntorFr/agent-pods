/* Skin `nestor` — la veilleuse de la maison.
   ═══════════════════════════════════════════════════════════════════════════

   Ni le salon d'Alfred, ni le HUD de Skippy : un OBJET. Nestor est le Nabaztag
   revenu du futur — porcelaine blanche, oreilles sur moteurs, et un ventre qui
   s'allume quand il travaille, exactement ce que l'objet savait dire sur la
   commode. Le public n'est pas un adulte technique, c'est la famille : l'accueil
   ne montre donc ni jauge, ni version, ni trace d'outils. Un lapin et une invite.

   Maquette validée par Monsieur le 2026-08-15, accent améthyste acté le même jour
   (`memory/maquettes/nestor-livree.html`, cockpit de Skippy). Les jetons de la
   livrée sont dans `nestor.css` ; ce fichier ne porte que le markup propre au skin.

   PAS DE `console`, et c'est délibéré. La maquette dessinait une barre d'état
   (« NESTOR veille » / « s'affaire », « maison sereine »). Le contrat ne rend cette
   barre QU'UNE FOIS, au boot : elle ne peut pas suivre un état qui change, et une
   ligne qui affirme « maison sereine » sans rien mesurer est du décor qui ment.
   Le ventre du lapin dit déjà « je travaille », lui, au bon moment. La barre
   reviendra quand la vue maison lui donnera quelque chose de vrai à afficher.

   Contrat et injection de dépendances : voir `skins/index.js`. */


/* ── Les tracés ─────────────────────────────────────────────────────────
   Sortis de la police « Nestor » fournie par Monsieur : la pose canonique,
   oreilles dressées — pas la pose de la photo.

   `CORPS` est la silhouette pleine ; `VISAGE` en est les TROUS (yeux, museau),
   trois sous-chemins en sens inverse. Le glyphe complet est donc très exactement
   leur concaténation — d'où `LAPIN`, qui évite de porter deux fois les mêmes
   2,7 Ko dans le bundle. Vérifié à l'octet contre le tracé de la maquette.

   `CLOCHE` est la tête NUE, vectorisée du profil sans oreilles fourni par
   Monsieur et calée par régression sur le corps du glyphe : sommet à la vallée
   du crâne, y=30,4. C'est elle qui donne au masque sa frontière. */
const CORPS = 'M40.5 7H40.6H40.7H40.8H41L41.1 7.1H41.2L41.4 7.2H41.5L41.6 7.3L41.8 7.4L41.9 7.6L42.1 7.8L42.2 8L42.4 8.3L42.5 8.6L42.7 9L42.9 9.4L43 9.9L43.2 10.4L43.4 10.9L43.5 11.5L43.6 12.3L43.7 13L43.8 13.9L43.8 14.7L43.9 15.6L44 16.7L44.1 17.8L44.2 18.9V20.2L44.3 21.6V22.9L44.4 24.5V25.8L44.5 27V27.9L44.6 28.7V29.3L44.7 29.8V30L44.8 30.1V30.2L44.9 30.3L45 30.4V30.5H45.1L45.2 30.6H45.3H45.4L45.5 30.7H45.7H45.9L46.2 30.6H46.5H46.9L47.4 30.5H47.8L48.3 30.4H48.8H49.3H49.9H50.5H51.2L51.8 30.5H52.4L53 30.6H53.5H54H54.4H54.7H54.9H55.1L55.2 30.5L55.3 30.2V29.7L55.4 29L55.5 28L55.6 26.9L55.7 25.4L55.9 23.8L56 22L56.1 20.2L56.2 18.7L56.2 17.3L56.3 16L56.4 14.8L56.5 13.9L56.6 13.1L56.7 12.4L56.8 11.7L57 11.2L57.1 10.6L57.2 10.2L57.3 9.8L57.4 9.5L57.5 9.2L57.6 8.9L57.7 8.7L57.9 8.4L58 8.2L58.1 8L58.3 7.9L58.4 7.7L58.6 7.6L58.8 7.4L59 7.3L59.2 7.2H59.3L59.5 7.1H59.7H60H60.2L60.4 7.2H60.5L60.7 7.3L60.9 7.4L61.1 7.6L61.3 7.7L61.5 7.9L61.6 8.1L61.8 8.4L62 8.6L62.1 9L62.3 9.3L62.4 9.7L62.6 10.2L62.8 10.6L62.9 11.2L63.1 11.8L63.2 12.4L63.3 13L63.5 13.7L63.6 14.4L63.7 15L63.8 15.7L63.9 16.5L64 17.2L64.1 18.2L64.2 19.4V20.9L64.3 22.6L64.4 24.5V26.7L64.5 29.1V31.6L64.6 34.2L64.7 36.7L64.8 39.1L65.1 41.3L65.3 43.5L65.6 45.5L65.9 47.6L66.3 49.4L66.7 51.5L67.2 53.8L67.7 56.2L68.3 58.9L68.8 61.6L69.5 64.6L70.2 67.9L71 71.2L71.6 74.2L72.2 76.8L72.7 79L73 80.8L73.2 82.2L73.4 83.2L73.5 83.8V84L73.4 84.3L73.3 84.6L73.2 84.9L73.1 85.2L72.9 85.4L72.8 85.8L72.6 86.1L72.4 86.5L72.1 86.9L71.8 87.3L71.5 87.7L71.1 88L70.8 88.4L70.3 88.7L69.9 89.1L69.4 89.4L68.9 89.6L68.5 89.9L67.9 90.2L67.3 90.5L66.7 90.7L66 91L65.3 91.2L64.6 91.4L63.8 91.6L63 91.8L62.2 92L61.3 92.2L60.4 92.3L59.4 92.5L58.4 92.6L57.3 92.7L56.3 92.8L55.3 92.9H54.2L53.1 93H52H50.9H49.8H48.6H47.6H46.5L45.5 92.9H44.5L43.7 92.8H42.8L42 92.7L41.2 92.6L40.4 92.5L39.7 92.4L39 92.2L38.2 92.1L37.4 91.9L36.6 91.7L35.8 91.5L35.1 91.2L34.3 91L33.6 90.7L32.9 90.5L32.2 90.2L31.6 89.9L31.1 89.6L30.6 89.4L30.1 89L29.7 88.7L29.3 88.3L28.9 88L28.5 87.6L28.2 87.2L27.9 86.8L27.6 86.4L27.4 86L27.2 85.7L27.1 85.4L26.9 85.1L26.8 84.8L26.7 84.5L26.6 84.3V84L26.5 83.8V83.6V83.3L26.6 83V82.6V82.2L26.7 81.7L26.8 81.2L26.9 80.8L27.1 80L27.2 78.8L27.5 77.4L27.9 75.8L28.4 73.7L28.9 71.5L29.5 68.9L30.2 66.1L30.8 63.4L31.3 60.7L31.9 58.3L32.4 55.9L32.9 53.6L33.4 51.6L33.8 49.5L34.2 47.7L34.5 45.7L34.8 43.8L35.1 41.9L35.3 39.9L35.4 38L35.5 36L35.6 34.2V32.1V30.3L35.7 28.5L35.8 26.8V25.1L35.9 23.5L36 22.1L36.1 20.6L36.2 19.2L36.4 18L36.5 16.8L36.6 15.7L36.8 14.7L36.9 13.8L37.1 13L37.2 12.2L37.4 11.6L37.6 11L37.7 10.4L37.8 10L38 9.6L38.1 9.3L38.2 9L38.3 8.8L38.4 8.6L38.5 8.4L38.6 8.3L38.7 8.1L38.8 8L39 7.9L39.1 7.7L39.3 7.6L39.4 7.5L39.6 7.4L39.6 7.3L39.7 7.2L39.8 7.1H39.9V7H40H40.1H40.2H40.3Z';
const VISAGE = 'M50.7 49 50.4 48.9H50.2H50H49.8L49.7 49H49.6H49.5H49.4H49.2H49H48.8H48.5L48.2 49.1H47.9H47.7H47.5H47.3H47.2L47 49.2H46.9H46.8L46.7 49.3H46.6V49.4H46.5V49.5H46.4V49.6V49.7V49.8H46.5V49.9L46.6 50V50.1H46.7L46.8 50.2L47 50.3H47.1L47.2 50.4L47.4 50.5H47.6L47.8 50.6H47.9L48 50.7L48.2 50.8H48.3L48.4 50.9L48.5 51L48.6 51.1V51.2L48.7 51.3V51.4L48.8 51.5V51.6V51.7V51.8L48.9 52V52.1V52.1V52.3V52.4L49 52.6V52.7L49.1 52.8V53L49.2 53.1V53.2L49.3 53.3V53.4L49.4 53.5V53.6H49.5V53.7H49.6V53.8H49.7H49.8H49.9L50 53.7H50.1H50.2L50.3 53.6L50.4 53.5L50.5 53.4L50.6 53.3V53.2L50.7 53V52.9L50.8 52.7V52.6L50.9 52.4V52.2L51 52.1V51.9V51.7L51.1 51.5V51.3L51.2 51.2V51.1L51.3 51V50.9H51.4L51.5 50.8H51.6L51.7 50.7L51.9 50.6H52.1L52.1 50.5L52.4 50.4H52.6L52.8 50.3L53 50.2H53.2L53.3 50.1L53.4 50H53.5L53.6 49.9V49.8V49.7V49.6L53.5 49.5L53.4 49.4H53.3L53.2 49.3L53.1 49.2H52.9L52.7 49.1H52.5L52.2 49H52H51.7H51.4H51Z M43.3 41.4H43.2H43.1V41.5H43V41.6H42.9V41.7H42.8L42.7 41.8L42.6 41.9V42H42.5L42.4 42.2V42.3L42.3 42.4V42.5L42.2 42.7V42.8L42.1 43V43.2L42 43.5V43.7V43.9V44.2V44.5V44.8V45V45.3L42.1 45.5V45.7V45.9L42.2 46V46.1L42.3 46.2V46.3L42.4 46.4V46.5L42.5 46.6L42.6 46.7L42.7 46.8L42.8 46.9H42.9V47H43H43.1H43.2H43.3H43.4V46.9H43.5H43.6V46.8H43.7L43.8 46.7V46.6L43.8 46.5L43.9 46.4V46.3L44 46.2L44.1 46V45.9L44.2 45.7V45.5L44.3 45.3V45.1L44.4 44.9V44.7V44.5V44.2V44V43.8V43.6V43.4L44.3 43.2V43V42.8L44.2 42.6L44.1 42.4V42.3L44 42.1V42L43.9 41.9V41.8L43.8 41.7L43.8 41.6H43.7L43.6 41.5H43.5H43.4V41.4Z M56.7 41.4H56.6H56.5H56.4H56.3L56.2 41.5H56.2V41.6H56.1V41.7H56V41.8L55.9 41.9L55.8 42V42.1L55.7 42.2L55.6 42.4V42.5L55.5 42.7V43V43.2L55.4 43.5V43.8V44V44.3V44.6V44.8V45.1L55.5 45.2V45.4V45.5L55.6 45.7V45.8L55.7 45.9V46H55.8V46.1L55.9 46.2L56 46.3L56.1 46.4H56.2V46.5H56.2L56.3 46.6H56.4H56.5H56.6H56.7H56.8H56.9L57 46.5H57.1L57.2 46.4L57.3 46.3L57.4 46.2V46.1L57.5 45.9L57.6 45.7L57.7 45.5L57.8 45.3L57.9 45.1V44.9L58 44.6V44.4V44.2V43.9V43.8V43.6V43.3V43.1L57.9 42.9V42.7L57.8 42.5V42.4L57.7 42.2L57.6 42L57.5 41.9L57.4 41.8L57.3 41.7L57.2 41.6L57.1 41.5H57L56.9 41.4H56.8Z';
const CLOCHE = 'M34.1 47.1 L34.1 47.0 L34.1 46.8 L34.2 46.6 L34.2 46.5 L34.3 46.3 L34.3 46.1 L34.3 45.9 L34.4 45.7 L34.4 45.5 L34.5 45.2 L34.5 45.0 L34.5 44.8 L34.6 44.5 L34.6 44.3 L34.7 44.1 L34.8 43.8 L34.8 43.6 L34.8 43.4 L34.9 43.1 L35.0 42.9 L35.0 42.7 L35.0 42.4 L35.1 42.2 L35.2 42.0 L35.2 41.7 L35.3 41.5 L35.4 41.3 L35.4 41.0 L35.6 40.8 L35.6 40.6 L35.7 40.3 L35.8 40.1 L35.9 39.9 L36.0 39.6 L36.1 39.4 L36.3 39.2 L36.3 38.9 L36.5 38.7 L36.6 38.5 L36.7 38.2 L36.8 38.0 L36.9 37.8 L37.1 37.5 L37.3 37.3 L37.4 37.1 L37.6 36.8 L37.8 36.6 L37.9 36.4 L38.1 36.1 L38.2 35.9 L38.5 35.7 L38.7 35.4 L38.9 35.2 L39.1 35.0 L39.3 34.7 L39.5 34.5 L39.8 34.3 L40.1 34.0 L40.4 33.8 L40.6 33.6 L40.9 33.3 L41.3 33.1 L41.6 32.9 L41.9 32.6 L42.4 32.4 L42.8 32.2 L43.2 31.9 L43.8 31.7 L44.3 31.5 L45.0 31.2 L45.8 31.0 L46.7 30.8 L48.2 30.5 L52.7 30.5 L54.1 30.8 L55.0 31.0 L55.7 31.2 L56.3 31.5 L56.9 31.7 L57.3 31.9 L57.8 32.2 L58.1 32.4 L58.5 32.6 L58.9 32.9 L59.2 33.1 L59.5 33.3 L59.8 33.6 L60.0 33.8 L60.3 34.0 L60.5 34.3 L60.8 34.5 L61.0 34.7 L61.2 35.0 L61.4 35.2 L61.6 35.4 L61.8 35.7 L62.0 35.9 L62.2 36.1 L62.3 36.4 L62.5 36.6 L62.6 36.8 L62.8 37.1 L62.9 37.3 L63.1 37.5 L63.2 37.8 L63.3 38.0 L63.5 38.2 L63.5 38.5 L63.7 38.7 L63.7 38.9 L63.9 39.2 L63.9 39.4 L64.1 39.6 L64.2 39.9 L64.2 40.1 L64.4 40.3 L64.4 40.6 L64.5 40.8 L64.6 41.0 L64.6 41.3 L64.7 41.5 L64.8 41.7 L64.8 42.0 L64.8 42.2 L64.9 42.4 L65.0 42.7 L65.0 42.9 L65.0 43.1 L65.1 43.4 L65.1 43.6 L65.2 43.8 L65.2 44.1 L65.2 44.3 L65.2 44.5 L65.3 44.8 L65.4 45.0 L65.4 45.2 L65.5 45.5 L65.5 45.7 L65.5 45.9 L65.5 46.1 L65.6 46.3 L65.6 46.5 L65.7 46.6 L65.7 46.8 L65.7 47.0 L65.8 47.1 L65.8 47.1 Z';
const LAPIN = CORPS + ' ' + VISAGE;

const NS = 'http://www.w3.org/2000/svg';
const DEFS_ID = 'nst-defs';

/* Les définitions partagées, posées UNE fois pour tout le document. Un lapin peut
   apparaître deux fois à l'écran (l'accueil et le fil) : embarquer les `<defs>`
   dans chaque instance dupliquerait les identifiants, et un `mask` en double est
   un masque qui ne s'applique plus à personne. */
function ensureDefs() {
  if (document.getElementById(DEFS_ID)) return;
  const svg = document.createElementNS(NS, 'svg');
  svg.id = DEFS_ID;
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<defs>
    <path id="nst-corps" d="${CORPS}"/>
    <path id="nst-visage" d="${VISAGE}"/>
    <path id="nst-cloche" d="${CLOCHE}"/>
    <!-- Ce masque ne laisse à l'oreille que ce qui DÉPASSE du dôme : rien de
         caché sous le crâne ne peut surgir pendant la rotation. -->
    <mask id="nst-hors-cloche" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect width="100" height="100" fill="#FFFFFF"/>
      <use href="#nst-cloche" fill="#000000"/>
    </mask>
    <!-- Le corps complète la cloche : bas du glyphe, vallée entre les oreilles,
         et les épaules des flancs. -->
    <clipPath id="nst-clip-corps">
      <rect x="20" y="42" width="60" height="58"/>
      <rect x="45.5" y="28" width="9" height="18"/>
      <rect x="33" y="34" width="5.2" height="9"/>
      <rect x="61.8" y="34" width="5.2" height="9"/>
    </clipPath>
    <clipPath id="nst-clip-og"><rect x="30" y="0" width="14.7" height="34"/></clipPath>
    <clipPath id="nst-clip-od"><rect x="55.2" y="0" width="14.8" height="34"/></clipPath>
  </defs>`;
  document.body.appendChild(svg);
}

/* Le lapin vivant. `taille` en pixels ; `opts.affaire` emballe le ventre,
   `opts.surBulle` lui dit que le fond derrière lui est celui d'une bulle et non
   celui de la page — le visage étant fait de TROUS, il doit prendre cette
   couleur-là, sans quoi on verrait deux yeux de la mauvaise teinte. */
function lapin(taille, opts) {
  const o = opts || {};
  ensureDefs();
  const el = document.createElement('div');
  el.className = 'nst-lapin'
    + (o.affaire ? ' nst-affaire' : '')
    + (o.surBulle ? ' nst-sur-bulle' : '');
  el.style.setProperty('--nst-taille', taille + 'px');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="nst-oreille nst-og"><svg viewBox="0 0 100 100">
      <g mask="url(#nst-hors-cloche)"><use href="#nst-corps" clip-path="url(#nst-clip-og)"/></g>
      <circle cx="40" cy="34" r="2.5"/>
    </svg></div>
    <div class="nst-oreille nst-od"><svg viewBox="0 0 100 100">
      <g mask="url(#nst-hors-cloche)"><use href="#nst-corps" clip-path="url(#nst-clip-od)"/></g>
      <circle cx="59.9" cy="34" r="2.5"/>
    </svg></div>
    <svg viewBox="0 0 100 100" class="nst-body">
      <use href="#nst-cloche"/>
      <use href="#nst-corps" clip-path="url(#nst-clip-corps)"/>
    </svg>
    <svg viewBox="0 0 100 100" class="nst-visage"><use href="#nst-visage"/></svg>
    <span class="nst-ventre"></span>`;
  return el;
}

/* Le blason de l'en-tête, en `currentColor` : il hérite de la couleur du rail,
   donc il doit tenir en monochrome. Là où celui de Skippy a dû sacrifier
   64 graduations pour rester lisible en favicon, la silhouette du lapin passe
   telle quelle — les yeux et le museau étant des trous, le rail fait le visage. */
const crest = `<svg viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="${LAPIN}"/></svg>`;

/* Les modules du lanceur, avec le mot de la maison. Ce corps n'en active AUCUN
   aujourd'hui (`GW_APPS=""`) : la rangée reste donc vide, et l'accueil est bien
   « lapin + invite ». Mais le jour où la vue maison s'allumera, elle apparaîtra
   ici sans qu'on retouche ce fichier — un accueil qui masque un module ACTIF est
   la panne que le commentaire de `main.py` documente déjà. */
const MODULES = [
  ['todo', '#/todo', 'Les tâches', 'Ce qui reste à faire'],
  ['projets', '#/dom/diy/projets', 'Les chantiers', 'Ce qui est en cours'],
  ['atelier', '#/dom/diy', 'L\u2019atelier', 'Machines et savoir-faire'],
  ['voyages', '#/voyages', 'Les voyages', 'Carnets et parcours'],
  ['planif', '#/planif', 'L\u2019horloge', 'Ce que je fais sans vous'],
  ['repos', '#/repos', 'Les d\u00e9p\u00f4ts', 'Statut de chaque d\u00e9p\u00f4t'],
];

export default function createNestorSkin(api) {
  const { $, esc, page, crumbs, appOn } = api;

  /* ── L'accueil ────────────────────────────────────────────────────────
     Pas de « Bonjour, Monsieur » : ce corps est celui de TOUTE la maison, et il
     ne sait pas qui tient le téléphone. La salutation suit donc l'heure, et rien
     d'autre — ce qu'on peut affirmer sans se tromper de personne. */
  function home() {
    crumbs([{ label: 'Nestor', hash: '#/' }]);
    const h = new Date().getHours();
    const salut = h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
    const date = new Date()
      .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      .toUpperCase();

    page.innerHTML = `<div class="nst-accueil">
      <h1 class="nst-salut">${esc(salut)}<em>.</em></h1>
      <p class="nst-date">${esc(date)}</p>
      <div class="nst-scene"></div>
      <button class="nst-invite" id="nst-invite" type="button">
        <span>Confier quelque chose \u00e0 Nestor\u2026</span><i aria-hidden="true">\u2191</i>
      </button>
      <div class="nst-tuiles" id="nst-tuiles"></div>
    </div>`;

    page.querySelector('.nst-scene').appendChild(lapin(240));
    // L'invite ne fait que rendre la main au composeur : le chat reste la
    // surface, l'accueil n'est qu'un point d'entrée.
    $('nst-invite').addEventListener('click', () => $('input')?.focus());

    $('nst-tuiles').innerHTML = MODULES
      .filter(([id]) => appOn(id))
      .map(([, route, nom, sous]) => `<a class="nst-tuile" href="${route}">`
        + `<b>${esc(nom)}</b><span>${esc(sous)}</span></a>`)
      .join('');
  }

  return {
    brand: 'NESTOR',
    title: 'Nestor',
    crest,
    placeholder: 'Confier quelque chose \u00e0 Nestor\u2026',
    idleLabel: 'Nestor veille',
    busyLabel: 'Nestor s\u2019affaire\u2026',
    busyNode: () => lapin(30, { affaire: true, surBulle: true }),
    home,
  };
}
