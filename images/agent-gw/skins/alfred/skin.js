/* Alfred — the butler's livery, and the base every other skin departs from.
   ═══════════════════════════════════════════════════════════════════════════

   Alfred used to have NO file. He was the *absence* of a skin: `NEUTRAL = { id:
   'alfred' }`, every field falling through to whatever `app.html` and the shell
   already said. That worked, and it guaranteed an existing pod would not move a
   pixel — but it also meant one of the three bodies could not be read anywhere.
   You could describe Skippy and Nestor by opening a file; Alfred you had to
   reconstruct from the markup.

   So he is declared here, with the **exact values `app.html` already carries**.
   Nothing moves: setting a title to the title it already has is a no-op. What
   changes is that the three bodies are now described in the same place, in the
   same form.

   ⚠️ `app.html` KEEPS those defaults, and that is not duplication to clean up
   later. The browser paints the shell before a single line of the bundle runs:
   without them the tab would be untitled and the composer unlabelled for the
   time it takes to boot. Same reason the favicon and the manifest are served
   from disk rather than declared here. The rule to remember: **this file is what
   the skin IS, `app.html` is what the browser sees FIRST** — they must agree,
   and `test/habillage_test.py` checks that they do.

   NO `skin.css` here, deliberately. Skippy and Nestor repaint tokens scoped
   under `:root[data-agent="<id>"]`; Alfred's palette IS the base sheet
   (`launcher.css`). Giving him an override that restates it would create two
   sources for one look, and the day they disagreed the base would win in silence.

   NO `home` either: the tile mosaic is the shell's default home, not Alfred's
   property. A body that declares none gets it — which is what Alfred wants, and
   what an unknown theme must keep getting. */

export default function createAlfredSkin() {
  return {
    brand: 'Alfred',
    title: 'Alfred',
    placeholder: 'Écrire à Alfred… ou « ouvre mes projets »',
    // Le blason : un chevron ouvert, en `currentColor` — le bouton hérite de la
    // couleur du rail, donc il suit le thème clair/sombre sans une ligne de CSS.
    crest: '<svg viewBox="0 0 100 100" fill="currentColor">'
      + '<path d="M50 53 L27 39 v27 z M50 53 L73 39 v27 z"/>'
      + '<circle cx="50" cy="53" r="7"/></svg>',
  };
}
