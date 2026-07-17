// Turn one memory file (frontmatter + markdown + Alfred's blocks) into a safe
// HTML string + parsed frontmatter. No LLM, no network — pure and cheap, run
// at read time in the browser.
import Markdoc from '@markdoc/markdoc';
import YAML from 'yaml';
import { config } from './blocks.js';

// [[target]] and [[target|label]] → a memory link the front intercepts.
// A wikilink pointing at an image is EMBEDDED (Obsidian-style), root-relative.
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const WL_IMG = /\.(png|jpe?g|gif|webp|svg|heic|heif|avif)$/i;
function expandWikilinks(src) {
  return src.replace(WIKILINK, (_, target, label) => {
    const t = target.trim();
    if (WL_IMG.test(t)) return `![${(label || '').trim()}](/api/memory/raw/${t})`;
    return `[${(label || t).trim()}](/mem/${t})`;
  });
}

export function renderPage(source, { baseDir = '' } = {}) {
  const ast = Markdoc.parse(expandWikilinks(source));
  const frontmatter = ast.attributes.frontmatter
    ? YAML.parse(ast.attributes.frontmatter)
    : {};

  // Surface schema violations rather than rendering garbage.
  const errors = Markdoc.validate(ast, config).filter((e) => e.error.level === 'critical');

  // baseDir lets relative asset paths resolve against the fiche's directory.
  const content = Markdoc.transform(ast, { ...config, variables: { baseDir } });
  const html = Markdoc.renderers.html(content);
  return { frontmatter, html, errors };
}
