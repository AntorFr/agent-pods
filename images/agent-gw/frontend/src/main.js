// Browser entry — exposes the content engine (bundled under window.Alfred).
// DOMPurify is defense-in-depth over Markdoc's already-safe output.
import './design-system.css'; // esbuild bundles this into engine.css
// Les feuilles des blocs apportés par les plugins. Ramassées au build, importées
// ICI et nulle part ailleurs : `blocks.js` est lu par les bancs dans node, qui
// ne sait pas charger du CSS.
import './blocks.styles.generated.js';
import DOMPurify from 'dompurify';
import { renderPage } from './render.js';
import { mountBlocks } from './blocks.js';

export function render(source, opts) {
  const { frontmatter, html, errors } = renderPage(source, opts);
  // ADD_ATTR target : DOMPurify le retire par défaut ; le moteur ne l'émet que sur les
  // liens externes / assets bruts (toujours accompagné de rel=noopener, cf. blocks.js).
  return { frontmatter, html: DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }), errors };
}

// `render` rend une CHAÎNE : les blocs qui doivent aller chercher un fichier
// (aujourd'hui `parcours`) ne peuvent se peindre qu'une fois le document inséré.
// L'appelant monte donc explicitement, après insertion — l'invariant tient :
// rien du fichier ne s'exécute, seule sa donnée est lue (cf. parcours.js).
export { renderPage, mountBlocks };
