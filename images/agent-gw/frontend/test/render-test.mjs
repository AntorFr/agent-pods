// Spike check: render a realistic memory fiche (Voiles Fortuna) end to end.
import { renderPage } from '../src/render.js';

const sample = `---
type: projet
domaine: projets
cat: menuiserie
status: clos
tags: [LEGO, tissu, couture]
---

# Voiles LEGO — Fortuna

Reproduire en **tissu** les voiles du MOC Fortuna. Après essais, la voie
« voiles toutes faites » l'emporte — voir [[voiles-lego-impression|le sujet d'origine]].

{% callout type="attention" %}
Attendre l'Omni avant la méthode maison sur l'Endurance.
{% /callout %}

![Gréement Fortuna](assets/inspiration-1.png)

{% galerie %}
![](assets/inspiration-2.png)
![](assets/inspiration-3.png)
{% /galerie %}

{% web url="https://www.youtube.com/watch?v=8FQ7LSB7K3w" titre="Impression de voiles LEGO sur tissu" /%}

{% web url="https://brickstickershop.com/fortuna" titre="Voiles toutes faites" /%}

Voir [la commande](assets/DISPANO.pdf) et [les notes](notes-couture.md).

{% piece-jointe fichier="assets/Fortuna_sails_A4.pdf" /%}

{% outil id="debit" projet="rangement-garage" /%}
`;

const { frontmatter, html, errors } = renderPage(sample, { baseDir: 'domaines/diy/projets/voiles-lego-fortuna' });

const checks = [
  ['frontmatter.type === projet', frontmatter.type === 'projet'],
  ['tags array parsed', Array.isArray(frontmatter.tags) && frontmatter.tags.length === 3],
  ['no critical schema errors', errors.length === 0],
  ['callout rendered', html.includes('class="callout attention"')],
  ['wikilink → /mem/', html.includes('href="/mem/voiles-lego-impression"')],
  ['image resolved with baseDir', html.includes('/api/memory/raw/domaines/diy/projets/voiles-lego-fortuna/assets/inspiration-1.png')],
  ['gallery rendered', html.includes('class="gallery"')],
  ['youtube → embedded player facade', html.includes('class="ytembed"') && html.includes('data-yt="8FQ7LSB7K3w"') && !html.includes('<iframe')],
  ['web card (non-youtube)', html.includes('class="webcard"') && html.includes('brickstickershop.com')],
  ['relative asset link → raw, new tab', html.includes('href="/api/memory/raw/domaines/diy/projets/voiles-lego-fortuna/assets/DISPANO.pdf"') && html.includes('target="_blank"')],
  ['relative .md link → /mem/ route', html.includes('href="/mem/domaines/diy/projets/voiles-lego-fortuna/notes-couture.md"')],
  ['attachment', html.includes('class="attach"') && html.includes('PDF')],
  ['module embed', html.includes('data-module="debit"') && html.includes('data-projet="rangement-garage"')],
  ['no raw script injection surface', !/<script/i.test(html)],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (!pass) ok = false;
}
console.log('\n--- frontmatter ---');
console.log(JSON.stringify(frontmatter));
console.log('\n--- html (first 600 chars) ---');
console.log(html.slice(0, 600));

if (errors.length) { console.log('\n--- schema errors ---'); errors.forEach((e) => console.log(e.error.id, e.error.message)); }
if (!ok) { console.error('\nSPIKE FAILED'); process.exit(1); }
console.log('\nSPIKE OK');
