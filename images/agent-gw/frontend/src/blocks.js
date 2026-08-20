// Alfred's closed authoring vocabulary — the Markdoc block catalog.
// Each tag/node transforms to a Tag with design-system classes. Alfred writes
// these; he never writes HTML. Adding a block = adding an entry here (code) +
// a line in Alfred's skill. Unknown tags/attributes are rejected by Markdoc.
import Markdoc from '@markdoc/markdoc';
import { chart, TINTS } from './chart.js';
import { FABRIQUES as BLOCS_PLUGINS } from './blocks.generated.js';

const { Tag } = Markdoc;

const RAW = 'api/memory/raw';
const isAbsolute = (s) => /^[a-z]+:/i.test(s) || s.startsWith('/');
// Collapse . and .. segments.
function normalize(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
}
// Resolve a memory-relative asset path to the gateway's raw endpoint,
// relative to the fiche's directory (baseDir).
function asset(src, baseDir = '') {
  if (isAbsolute(src)) return src;
  const clean = src.replace(/^\.?\//, '');
  return `/${RAW}/${normalize(baseDir ? `${baseDir}/${clean}` : clean)}`;
}

const CALLOUT_ICON = { note: '🛈', astuce: '✓', attention: '⚠' };

// `required: true` SIGNALE un attribut manquant, il ne l'EMPÊCHE pas : Markdoc
// valide et transforme en deux passes indépendantes, donc le transform tourne
// quand même avec `undefined`. Mesuré le 2026-08-05 : `{% piece-jointe /%}`
// jetait un TypeError sur `.split`, l'exception remontait hors du try/catch de
// `renderFiche` (qui n'entoure que le fetch), et comme la fonction est `async`
// sans `await`, la promesse rejetée mourait en silence — la fiche ENTIÈRE
// restait bloquée sur « chargement… », sans un mot dans l'interface.
// `web` et `outil` ne jetaient pas mais mentaient, en rendant la chaîne
// « undefined » comme si c'était une valeur.
// D'où ce garde partagé : un bloc incomplet le DIT, à sa place, et le reste de
// la fiche s'affiche.
const manque = (bloc, attr) => new Tag('div', { class: 'bloc-ko' },
  [`${bloc} : il manque « ${attr} ».`]);

// YouTube video id from any common URL shape, or null if not a YouTube URL.
// watch?v=ID, youtu.be/ID, embed/ID, shorts/ID — id itself is [A-Za-z0-9_-]{11}.
function youtubeId(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  if (u.pathname === '/watch') return u.searchParams.get('v');
  const m = u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
  return m ? m[1] : null;
}

const TAGS_SOCLE = {
    // `type` reste FERMÉ — il porte l'intention (une astuce n'est pas une mise
    // en garde), et c'est ce qui rend une fiche lisible d'une fiche à l'autre.
    // Mais l'ALLURE, elle, s'ouvre : `icone` et `couleur` laissent l'agent qui
    // rédige choisir son pictogramme et sa teinte parmi les 12 du système.
    // Ce n'est pas un ornement : quatre fiches écrivaient `type="info"`, un
    // synonyme que le vocabulaire n'a pas — le besoin réel était l'allure, pas
    // un quatrième type. On l'ouvre là où il devait l'être.
    callout: {
      render: 'div',
      attributes: {
        type: { type: String, default: 'note', matches: ['note', 'astuce', 'attention'] },
        icone: { type: String },
        couleur: { type: String, matches: TINTS },
      },
      transform(node, cfg) {
        const { type, icone, couleur } = node.transformAttributes(cfg);
        const children = node.transformChildren(cfg);
        return new Tag('div', {
          class: `callout ${type}`,
          // `matches` SIGNALE une valeur hors vocabulaire, il ne la retient pas :
          // même deux passes que `required`. On filtre donc ici, comme `chart`.
          ...(TINTS.includes(couleur) ? { 'data-teinte': couleur } : {}),
        }, [
          // Un pictogramme libre, borné à deux caractères : c'est une vignette,
          // pas une colonne de texte qui pousserait le corps hors du cadre.
          new Tag('span', { class: 'i' }, [(icone || '').slice(0, 2) || CALLOUT_ICON[type] || '🛈']),
          new Tag('div', { class: 'callout-body' }, children),
        ]);
      },
    },

    galerie: {
      transform(node, cfg) {
        return new Tag('div', { class: 'gallery' }, node.transformChildren(cfg));
      },
    },

    web: {
      selfClosing: true,
      attributes: {
        url: { type: String, required: true },
        titre: { type: String },
      },
      transform(node, cfg) {
        const { url, titre } = node.transformAttributes(cfg);
        if (!url) return manque('Lien web', 'url');
        // A YouTube URL gets an embedded player (click-to-play facade — no
        // iframe/tracking until the visitor actually presses play). Anything
        // else stays a link-preview card.
        const yt = youtubeId(url);
        if (yt) {
          return new Tag('div', { class: 'ytembed', 'data-yt': yt, role: 'button', tabindex: '0', 'aria-label': titre || 'Lire la vidéo' }, [
            new Tag('img', { class: 'ytthumb', src: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, alt: titre || '', loading: 'lazy' }, []),
            new Tag('span', { class: 'ytplay' }, ['▶']),
            ...(titre ? [new Tag('span', { class: 'ytcap' }, [titre])] : []),
          ]);
        }
        let host = '';
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { host = url; }
        return new Tag('a', { class: 'webcard', href: url, target: '_blank', rel: 'noopener' }, [
          new Tag('div', { class: 'thumb' }, []),
          new Tag('div', { class: 'wb' }, [
            new Tag('div', { class: 'host' }, [host]),
            new Tag('div', { class: 'wt' }, [titre || url]),
          ]),
        ]);
      },
    },

    'piece-jointe': {
      selfClosing: true,
      attributes: { fichier: { type: String, required: true } },
      transform(node, cfg) {
        const { fichier } = node.transformAttributes(cfg);
        if (!fichier) return manque('Pièce jointe', 'fichier');
        const name = fichier.split('/').pop();
        const ext = (name.split('.').pop() || '?').toUpperCase();
        return new Tag('a', { class: 'attach', href: `${asset(fichier, cfg.variables?.baseDir)}?download=1` }, [
          new Tag('span', { class: 'ext' }, [ext]),
          new Tag('div', {}, [new Tag('div', { class: 'fn' }, [name])]),
        ]);
      },
    },

    // A chart, drawn as inline SVG at transform time (see chart.js for why no
    // library, and why a single series). The body carries the data, one
    // "libellé: valeur" per line.
    graphique: {
      attributes: {
        type: { type: String, default: 'barres', matches: ['barres', 'ligne'] },
        titre: { type: String },
        unite: { type: String },
        couleur: { type: String, matches: TINTS },
      },
      transform: chart,
    },

    // Embeds a coded app-module by reference; the front swaps in the real
    // component (workbench, task list…) at mount. Renders a placeholder anchor.
    outil: {
      selfClosing: true,
      attributes: {
        id: { type: String, required: true },
        projet: { type: String },
      },
      transform(node, cfg) {
        const { id, projet } = node.transformAttributes(cfg);
        if (!id) return manque('Module', 'id');
        return new Tag('div', {
          class: 'module-embed',
          'data-module': id,
          ...(projet ? { 'data-projet': projet } : {}),
        }, []);
      },
    },
};

/* ── Ce que les PLUGINS ajoutent au vocabulaire ───────────────────────────
   Le moteur ne connaît plus `parcours` : le plugin le lui donne. Les fabriques
   sont ramassées au build (`build/registry.mjs`) sous `plugins/<id>/web/blocks.js`.

   Un bloc de plugin reçoit les primitives du moteur plutôt que de les importer :
   c'est CE fichier qui importe le registre, donc l'inverse ferait un cycle.

   Une fabrique qui jette n'emporte pas les autres — on perd un bloc, pas le
   moteur de rendu, et le message dit lequel. */
const API_BLOCS = { Tag, asset, manque };
const TAGS_PLUGINS = {};
const MONTAGES = [];
for (const [id, fabrique] of Object.entries(BLOCS_PLUGINS)) {
  try {
    const apport = fabrique(API_BLOCS) || {};
    Object.assign(TAGS_PLUGINS, apport.tags || {});
    if (typeof apport.mount === 'function') MONTAGES.push([id, apport.mount]);
  } catch (e) {
    console.error('blocs du plugin « ' + id + ' » ignorés :', e);
  }
}

/** Peint les blocs différés, APRÈS insertion du HTML rendu. Le moteur ne sait pas
    ce qu'ils font — il sait seulement qu'un bloc peut avoir besoin d'aller
    chercher sa donnée, ce que `render()` (qui rend une CHAÎNE) ne peut pas faire. */
export function mountBlocks(racine = document) {
  for (const [id, monter] of MONTAGES) {
    try {
      monter(racine);
    } catch (e) {
      console.error('montage du plugin « ' + id + ' » :', e);
    }
  }
}

export const config = {
  // Un tag de plugin ÉCRASE un tag du socle de même nom : le plugin fait foi sur
  // ce qu'il apporte, exactement comme sa tuile écrase `APP_META`.
  tags: { ...TAGS_SOCLE, ...TAGS_PLUGINS },
  nodes: {
    // Resolve link targets: external URLs open a new tab; relative paths resolve
    // against the fiche's directory — .md (or no extension) routes in-app via /mem/,
    // any other asset (html, pdf…) is served raw in a new tab. Bare /… hrefs
    // (including the wikilink output /mem/…) pass through untouched.
    link: {
      attributes: {
        href: { type: String, required: true },
        title: { type: String },
      },
      transform(node, cfg) {
        const { href, title } = node.transformAttributes(cfg);
        const children = node.transformChildren(cfg);
        const attrs = { href, ...(title ? { title } : {}) };
        if (/^[a-z]+:/i.test(href)) {
          attrs.target = '_blank';
          attrs.rel = 'noopener';
        } else if (!href.startsWith('/') && !href.startsWith('#')) {
          const resolved = normalize(`${cfg.variables?.baseDir || ''}/${href}`);
          if (/\.md$/i.test(resolved) || !/\.[a-z0-9]+$/i.test(resolved)) {
            attrs.href = `/mem/${resolved}`;
          } else {
            attrs.href = `/${RAW}/${resolved}`;
            attrs.target = '_blank';
            attrs.rel = 'noopener';
          }
        }
        return new Tag('a', attrs, children);
      },
    },

    // Resolve relative image sources to the memory raw endpoint.
    image: {
      attributes: {
        src: { type: String, required: true },
        alt: { type: String },
      },
      transform(node, cfg) {
        const { src, alt } = node.transformAttributes(cfg);
        return new Tag('img', { class: 'shot', src: asset(src, cfg.variables?.baseDir), alt: alt || '', loading: 'lazy' }, []);
      },
    },
  },
};
