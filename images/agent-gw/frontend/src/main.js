// Browser entry — exposes the content engine (bundled under window.Alfred).
// DOMPurify is defense-in-depth over Markdoc's already-safe output.
import './design-system.css'; // esbuild bundles this into engine.css
import DOMPurify from 'dompurify';
import { renderPage } from './render.js';

export function render(source, opts) {
  const { frontmatter, html, errors } = renderPage(source, opts);
  // ADD_ATTR target : DOMPurify le retire par défaut ; le moteur ne l'émet que sur les
  // liens externes / assets bruts (toujours accompagné de rel=noopener, cf. blocks.js).
  return { frontmatter, html: DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }), errors };
}

export { renderPage };
