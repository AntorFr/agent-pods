// Browser entry — exposes the content engine (bundled under window.Alfred).
// DOMPurify is defense-in-depth over Markdoc's already-safe output.
import './design-system.css'; // esbuild bundles this into engine.css
import DOMPurify from 'dompurify';
import { renderPage } from './render.js';

export function render(source) {
  const { frontmatter, html, errors } = renderPage(source);
  return { frontmatter, html: DOMPurify.sanitize(html), errors };
}

export { renderPage };
