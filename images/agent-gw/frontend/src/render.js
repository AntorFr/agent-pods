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
  //
  // `critical` ALONE was not enough, and the gap was silent. Markdoc files a
  // missing required attribute and an out-of-vocabulary value under `error`,
  // not `critical` — so the closed vocabulary was enforced in the OUTPUT (a bad
  // attribute never reaches the HTML) while nobody was ever told about it.
  // Measured over the 163 fiches of a real memory on 2026-08-05: four `error`,
  // all the same mistake — `{% callout type="info" %}`, a synonym the contract
  // does not have. It renders `class="callout info"`, matches no variant, and
  // since `.callout` sets `border:1px solid` with no colour, those four boxes
  // were drawing an ink-coloured border on no background. Broken in plain
  // sight, for weeks, on fiches that were read.
  //
  // `warning` stays out, and that is not laziness: the same scan returned 239
  // of them (`child-invalid` — markdown nesting Markdoc dislikes but renders
  // correctly). Surfacing those would bury the four that matter.
  const errors = Markdoc.validate(ast, config)
    .filter((e) => e.error.level === 'critical' || e.error.level === 'error')
    .map((e) => ({
      // Line numbers are 0-based in the AST and 1-based to a human editing a
      // file. The message stays in Markdoc's own words: precise, searchable,
      // and a translation invented here would drift from the schema it quotes.
      ligne: (e.lines?.[0] ?? 0) + 1,
      id: e.error.id,
      message: e.error.message,
    }));

  // baseDir lets relative asset paths resolve against the fiche's directory.
  const content = Markdoc.transform(ast, { ...config, variables: { baseDir } });
  const html = Markdoc.renderers.html(content);
  return { frontmatter, html, errors };
}
