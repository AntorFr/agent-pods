/* Skin `skippy` — le HUD d'un agent de code.
   ═══════════════════════════════════════════════════════════════════════════
   Ce n'est pas l'accueil d'Alfred repeint : c'est un autre écran, parce que les
   deux corps ne répondent pas à la même question. Lui ouvre sur une vie (todo,
   domaines, la une) ; ici on ouvre sur une flotte — le noyau, les instruments,
   et surtout « quel dépôt attend un geste ». Charte : agent-pods/SKIPPY-POD.md.

   Contrat et injection de dépendances : voir `skins/index.js`. */


export default function createSkippySkin(api) {
  const { $, esc, page, crumbs, headers, appOn } = api;

  /* ── Le noyau ──────────────────────────────────────────────────────
     Une horloge : 36 graduations, deux anneaux contrarotatifs, un cœur qui
     pulse. Un seul composant, deux emplois — 150 px sur la passerelle où il
     dérive, 40 px dans le fil où il tourne 4,5× plus vite. C'est ce qui lui
     donne une raison d'exister au-delà du décor : il DIT quelque chose. */
  function core(px, speed) {
    const sp = speed || 1;
    const c = document.createElement('canvas');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = c.height = px * dpr;
    c.style.width = c.style.height = px + 'px';
    c.setAttribute('aria-hidden', 'true');
    const k = c.getContext('2d'), S = c.width, C = S / 2, u = S / 360;
    const arc = (r, from, to, w, col) => {
      k.beginPath(); k.arc(C, C, r * u, from, to);
      k.strokeStyle = col; k.lineWidth = w * u; k.lineCap = 'round'; k.stroke();
    };
    const paint = (raw) => {
      const t = raw * sp;
      k.clearRect(0, 0, S, S);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2, big = i % 6 === 0;
        k.beginPath();
        k.moveTo(C + Math.cos(a) * 168 * u, C + Math.sin(a) * 168 * u);
        k.lineTo(C + Math.cos(a) * (big ? 150 : 158) * u, C + Math.sin(a) * (big ? 150 : 158) * u);
        k.strokeStyle = big ? 'rgba(184,120,30,.8)' : 'rgba(92,101,112,.55)';
        k.lineWidth = (big ? 2.5 : 1.5) * u; k.stroke();
      }
      arc(128, 0, Math.PI * 2, 2, 'rgba(36,43,52,.95)');
      arc(128, t * .0019, t * .0019 + 1.5, 4, 'rgba(242,169,59,.9)');
      arc(96, -t * .0013, -t * .0013 + 2.4, 3.5, 'rgba(215,222,230,.34)');
      const p = .5 + .5 * Math.sin(t * .004);
      k.beginPath(); k.arc(C, C, (24 + p * 10) * u, 0, 6.284);
      k.fillStyle = `rgba(242,169,59,${.18 + p * .22})`; k.fill();
      k.beginPath(); k.arc(C, C, 13 * u, 0, 6.284);
      k.fillStyle = `rgba(255,214,140,${.85 + p * .15})`; k.fill();
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) paint(900);
    // La boucle s'arrête d'elle-même quand le nœud quitte le DOM : sans ça, un
    // requestAnimationFrame orphelin tournerait jusqu'au rechargement.
    else (function spin(t) { if (t && !c.isConnected) return; paint(t); requestAnimationFrame(spin); })(0);
    return c;
  }

  /* ── Petites fabriques ─────────────────────────────────────────────── */

  const gauge = (label, val, suffix, ratio, attn) => `<div class="gauge${attn ? ' attn' : ''}">
    <div class="gk">${esc(label)}</div>
    <div class="gv">${val}${suffix ? `<small>${esc(suffix)}</small>` : ''}</div>
    <div class="gbar"><i style="width:${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%"></i></div>
  </div>`;

  const tile = (code, route, nom, sous, cls) => `<a class="hudtile ${cls}" href="${route}">
    <span class="hudico">[ ${esc(code)} ]</span>
    <span class="hudnm">${esc(nom)}</span>
    <span class="hudst">${esc(sous)}</span>
    <span class="hudfoot"></span>
  </a>`;

  const getJSON = async (url) => {
    const r = await fetch(url, { headers: headers(false), cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };

  /* ── La passerelle ─────────────────────────────────────────────────── */

  async function home() {
    crumbs([{ label: 'Passerelle', hash: '#/' }]);
    const h = new Date().getHours();
    const salut = h < 5 || h >= 22 ? 'Encore debout' : h < 18 ? 'Encore toi' : 'Toujours là';
    const date = new Date()
      .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      .toUpperCase();

    page.innerHTML = `<div class="hud">
      <section class="panel brackets bridge">
        <div class="ruler"></div>
        <div class="bridgebody">
          <div class="corewrap"></div>
          <div class="hailwrap">
            <h1 class="hail">${salut}, <em>petit singe</em>.</h1>
            <p class="hailsub" id="bridge-sub">${esc(date)}</p>
            <button class="promptbox" id="bridge-prompt" type="button"><span class="caret" aria-hidden="true"></span><span>Ordonner quelque chose au Magnifique…</span><kbd>⌘K</kbd></button>
          </div>
        </div>
        <div class="instruments" id="bridge-gauges"></div>
      </section>
      <div class="rowlabel">Transverse</div>
      <div class="mosaic" id="bridge-tiles"></div>
    </div>`;

    page.querySelector('.corewrap').appendChild(core(150, 1));
    // L'invite ne fait que rendre la main au composeur : le chat reste la surface,
    // la passerelle n'est qu'un point d'entrée.
    $('bridge-prompt').addEventListener('click', () => $('input')?.focus());

    const tiles = [];
    if (appOn('repos')) tiles.push(tile('REPOS', '#/repos', 'La flotte', 'Statut de chaque dépôt', 'tile-repos'));
    if (appOn('planif')) tiles.push(tile('PLANIF', '#/planif', 'Horloge', 'Ce que je fais sans toi', 'tile-planif'));
    if (appOn('todo')) tiles.push(tile('TODO', '#/todo', 'Tâches', 'Ce qui reste', 'tile-todo'));
    $('bridge-tiles').innerHTML = tiles.join('')
      || '<div class="hudempty">Aucun module activé sur ce corps.</div>';

    if (!appOn('repos')) return;
    try {
      const d = await getJSON('/api/repos');
      $('bridge-sub').textContent =
        `${date} · ${d.total} DÉPÔT${d.total > 1 ? 'S' : ''} SOUS SURVEILLANCE · `
        + `${d.en_attente} ATTEND${d.en_attente > 1 ? 'ENT' : ''} UN GESTE`;
      $('bridge-gauges').innerHTML = [
        gauge('Dépôts', d.total, '', 1),
        gauge('Fiches de statut', d.avec_fiche, `/${d.total}`, d.total ? d.avec_fiche / d.total : 0),
        gauge('Attendent un geste', d.en_attente, '', d.total ? d.en_attente / d.total : 0, true),
        gauge('Sans fiche', d.total - d.avec_fiche, '', d.total ? (d.total - d.avec_fiche) / d.total : 0),
      ].join('');
      const foot = page.querySelector('.tile-repos .hudfoot');
      if (foot) {
        foot.innerHTML = `<span class="pc">${d.total} dépôts</span>`
          + (d.en_attente ? `<span class="pc hot">${d.en_attente} à traiter</span>` : '');
      }
    } catch {
      $('bridge-sub').textContent = `${date} · FLOTTE INJOIGNABLE`;
    }
  }

  /* ── La barre d'état ───────────────────────────────────────────────── */

  function consoleBar(_api, info) {
    const bar = document.createElement('div');
    bar.className = 'console';
    const cell = (t, strong) => `<span class="cst">${esc(t)}${strong ? `<b>${esc(strong)}</b>` : ''}</span>`;
    bar.innerHTML = '<span class="cmark"><i class="led"></i>SKIPPY</span>'
      + cell('agent-gw ', info.version || '?')
      + cell('apps ', (info.apps || []).join('·') || '—')
      + '<span class="cgrow"></span>'
      + cell('liaison ', 'rosetta');
    return bar;
  }

  /* Le blason de l'en-tête. Même silhouette que le favicon, mais en
     `currentColor` : le bouton hérite de la couleur du rail, donc le dessin doit
     tenir en monochrome — pas de cœur ambre ici, c'est le trait qui porte. */
  const crest = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round">
    <circle cx="50" cy="50" r="31" stroke-width="9" stroke-dasharray="120 75" transform="rotate(-40 50 50)"/>
    <circle cx="50" cy="50" r="10" fill="currentColor" stroke="none"/>
    <path d="M50 8 v9 M50 83 v9 M8 50 h9 M83 50 h9" stroke-width="8"/>
  </svg>`;

  return {
    brand: 'SKIPPY',
    title: 'Skippy',
    crest,
    placeholder: 'Ordonner quelque chose au Magnifique…',
    idleLabel: 'Le Magnifique est au repos',
    busyLabel: 'Le Magnifique opère',
    busyNode: () => core(40, 4.5),
    console: consoleBar,
    home,
  };
}
