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
const r = (src) => renderPage(src, { baseDir: 'domaines/diy' });

const checks = [
  ['frontmatter.type === projet', frontmatter.type === 'projet'],
  ['tags array parsed', Array.isArray(frontmatter.tags) && frontmatter.tags.length === 3],
  ['no critical schema errors', errors.length === 0],
  ['callout rendered', html.includes('class="callout attention"')],
  // L'ALLURE d'un callout est libre (picto + teinte), son `type` reste fermé :
  // le type porte l'intention, la teinte ne porte que le goût.
  ['callout — picto libre', r('{% callout icone="🥾" %}A{% /callout %}').html.includes('>🥾<')],
  ['callout — picto borné à 2 caractères',
    r('{% callout icone="abcdef" %}A{% /callout %}').html.includes('>ab<')],
  ['callout — teinte libre parmi les 12',
    r('{% callout couleur="ambre" %}A{% /callout %}').html.includes('data-teinte="ambre"')],
  ['callout — teinte hors palette jetée',
    !r('{% callout couleur="fuchsia" %}A{% /callout %}').html.includes('fuchsia')],
  ['callout — sans picto, l’icône du type',
    r('{% callout type="astuce" %}A{% /callout %}').html.includes('>✓<')],
  // `required: true` SIGNALE mais n'empêche pas le transform : sans garde,
  // `{% piece-jointe /%}` jetait et emportait le rendu de toute la fiche.
  ['bloc incomplet — dit ce qui manque au lieu de planter',
    r('{% piece-jointe /%}').html.includes('il manque')],
  ['bloc incomplet — n’écrit jamais « undefined »',
    !r('{% web /%}\n\n{% outil /%}').html.includes('undefined')],
  // Le vocabulaire est fermé — encore faut-il le dire. Ces erreurs étaient
  // calculées puis jetées (filtre `critical` seul).
  ['erreur de niveau `error` remontée',
    r('{% callout type="info" %}A{% /callout %}').errors.length === 1],
  ['erreur remontée avec sa ligne (1-based)',
    r('\n\n{% callout type="info" %}A{% /callout %}').errors[0].ligne === 3],
  ['les 239 warnings du contenu réel restent filtrés',
    r('- item\n\n  {% callout %}A{% /callout %}').errors.every((e) => !/child-invalid/.test(e.id))],
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
