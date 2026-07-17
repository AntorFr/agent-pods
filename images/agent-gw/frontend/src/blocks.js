// Alfred's closed authoring vocabulary — the Markdoc block catalog.
// Each tag/node transforms to a Tag with design-system classes. Alfred writes
// these; he never writes HTML. Adding a block = adding an entry here (code) +
// a line in Alfred's skill. Unknown tags/attributes are rejected by Markdoc.
import Markdoc from '@markdoc/markdoc';

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

export const config = {
  tags: {
    callout: {
      render: 'div',
      attributes: {
        type: { type: String, default: 'note', matches: ['note', 'astuce', 'attention'] },
      },
      transform(node, cfg) {
        const { type } = node.transformAttributes(cfg);
        const children = node.transformChildren(cfg);
        return new Tag('div', { class: `callout ${type}` }, [
          new Tag('span', { class: 'i' }, [CALLOUT_ICON[type] || '🛈']),
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
        const name = fichier.split('/').pop();
        const ext = (name.split('.').pop() || '?').toUpperCase();
        return new Tag('a', { class: 'attach', href: `${asset(fichier, cfg.variables?.baseDir)}?download=1` }, [
          new Tag('span', { class: 'ext' }, [ext]),
          new Tag('div', {}, [new Tag('div', { class: 'fn' }, [name])]),
        ]);
      },
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
        return new Tag('div', {
          class: 'module-embed',
          'data-module': id,
          ...(projet ? { 'data-projet': projet } : {}),
        }, []);
      },
    },
  },

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
