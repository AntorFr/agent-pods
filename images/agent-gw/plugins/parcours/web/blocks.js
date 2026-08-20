/* Le bloc `{% parcours %}` — contribué par le plugin, pas connu du moteur.
   ═══════════════════════════════════════════════════════════════════════════

   Ce bloc vivait dans `frontend/src/blocks.js`, son implémentation dans
   `frontend/src/parcours.js` et ses 174 lignes de style dans
   `design-system.css`. Trois fichiers du SOCLE qui connaissaient un plugin par
   son nom — la même faute que le lanceur, corrigée au lot précédent.

   LE CONTRAT, symétrique de celui d'une vue :

     export default (api) => ({ tags, mount? })

       api    { Tag, asset, manque } — les primitives du moteur. `asset` résout
              un chemin relatif à la fiche vers /api/memory/raw, `manque` rend le
              refus standard d'un attribut absent. Injectées plutôt qu'importées :
              c'est `blocks.js` qui importe ce module, l'inverse ferait un cycle.
       tags   ajoutés au vocabulaire Markdoc. Un tag de plugin ÉCRASE un tag du
              socle de même nom — le plugin fait foi sur ce qu'il apporte.
       mount  appelé APRÈS insertion du HTML, sur la racine insérée. C'est ici
              que le bloc va chercher sa donnée et se peint.

   ⚠️ LE CSS N'EST PAS IMPORTÉ ICI, et c'est délibéré : `blocks.js` du moteur
   importe ce module, or les bancs importent `blocks.js` DANS NODE, qui n'a aucun
   chargeur CSS. Un `import './blocks.css'` ici casserait toute la suite de tests
   sans rien apprendre à personne. Les feuilles sont ramassées à part par le
   générateur, sur un chemin que seul esbuild emprunte (`src/main.js`).

   POURQUOI UNE ANCRE ET PAS UN DESSIN, et ce n'est pas de la paresse : une
   boucle de 3 km fait 328 points de trace. Les écrire dans la fiche ferait
   repasser toute la géométrie par le modèle à chaque retouche — précisément le
   coût que le fichier de parcours existe pour éviter (cf. PARCOURS.md). Le bloc
   résout le chemin et s'arrête là ; `carte.js` va chercher et peint au montage.

   DEUX VUES, et c'est ce qui évite un domaine « balades ». Un parcours n'a pas
   de maison : il s'accroche à la fiche qui a une raison d'en parler — un
   week-end, une forêt, un voyage — et reste adressable seul par
   `#/parcours/<chemin>`. `vue="lien"` pose une carte compacte qui y mène, pour
   qu'une fiche puisse en citer trois sans empiler trois cartes. */

import { mountParcours } from './carte.js';

export default function createParcoursBlocks({ Tag, asset, manque }) {
  return {
    tags: {
      parcours: {
        selfClosing: true,
        attributes: {
          source: { type: String, required: true },
          vue: { type: String, default: 'carte', matches: ['carte', 'lien'] },
        },
        transform(node, cfg) {
          const { source, vue } = node.transformAttributes(cfg);
          if (!source) return manque('Parcours', 'source');
          return new Tag('div', {
            class: 'parcours',
            'data-src': asset(source, cfg.variables?.baseDir),
            ...(vue === 'lien' ? { 'data-vue': 'lien' } : {}),
          }, [new Tag('div', { class: 'pc-vide' }, ['Parcours…'])]);
        },
      },
    },
    mount: mountParcours,
  };
}
