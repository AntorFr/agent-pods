// Alfred's closed authoring vocabulary — the Markdoc block catalog.
// Each tag/node transforms to a Tag with design-system classes. Alfred writes
// these; he never writes HTML. Adding a block = adding an entry here (code) +
// a line in Alfred's skill. Unknown tags/attributes are rejected by Markdoc.
import Markdoc from '@markdoc/markdoc';

const { Tag } = Markdoc;

const RAW = 'api/memory/raw';
const isAbsolute = (s) => /^[a-z]+:/i.test(s) || s.startsWith('/');
// Resolve a memory-relative asset path to the gateway's raw endpoint.
const asset = (src) => (isAbsolute(src) ? src : `/${RAW}/${src.replace(/^\.?\//, '')}`);

const CALLOUT_ICON = { note: '🛈', astuce: '✓', attention: '⚠' };

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
        return new Tag('a', { class: 'attach', href: `${asset(fichier)}?download=1` }, [
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
    // Resolve relative image sources to the memory raw endpoint.
    image: {
      attributes: {
        src: { type: String, required: true },
        alt: { type: String },
      },
      transform(node, cfg) {
        const { src, alt } = node.transformAttributes(cfg);
        return new Tag('img', { class: 'shot', src: asset(src), alt: alt || '', loading: 'lazy' }, []);
      },
    },
  },
};
