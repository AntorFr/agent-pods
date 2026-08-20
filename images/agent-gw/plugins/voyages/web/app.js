/* The Voyages view — per-day timeline plus a tray of suggestions.
   ═══════════════════════════════════════════════════════════════════════════

   This lived in `launcher/main.js` (405 lines) until 2026-08-20, which meant the
   shell knew this plugin by name — the very property the plugin tree exists to
   remove. Data contract: VOYAGES.md, next door.

   THREE MATTERS, deliberately kept apart:
     - the DATA (`assets/voyage.json`) is written by the agent and lives in git;
     - the GESTURES of the timeline (confirm, move, dismiss) never touch memory:
       they go to a sibling `voyage-state.json` overlay through the plugin's own
       API, which the agent consolidates on its next pass;
     - the DERIVED bits (per-day weather, legs between cards) are computed on
       demand and cached in process — never written to a file.

   THE CONTRACT — `(api) => ({ routes, tileInfo? })`:
     routes    what the launcher opens; `voyages` and `dom/voyages` are the hub,
               `voyage/<path>` one trip. The domain tile is intercepted on
               purpose: a trip is not a folder of notes.
     tileInfo  optional. Returns `{ st?, items[] }` for the launcher to paint on
               the tile — counters, and what needs a look. The launcher used to
               build that HTML itself while naming this plugin; it now renders
               whatever any plugin hands back.

   ⚠️ `api.page` is a GETTER and must not be destructured — the node does not
   exist yet when views are instantiated. Same trap as `repos`, same silent
   failure: correct breadcrumb, blank screen, no error anywhere. */

export default function createVoyagesApp(api) {
  const { esc, crumbs, headers, loadIndex, loadTree, prettify, add, sc } = api;

  const VTYPE = {
    hebergement: { ico: '🏠', c: '--maison', n: 'hébergement' },
    resto: { ico: '🍽️', c: '--cuisine', n: 'resto' },
    activite: { ico: '🚣', c: '--diy', n: 'activité' },
    visite: { ico: '🏛️', c: '--agenda', n: 'visite' },
    trajet: { ico: '🧭', c: '--proj', n: 'trajet' },
  };
  const vtypeOf = (t) => VTYPE[t] || { ico: '◆', c: '--voyage', n: t || 'carte' };
  // Le `type` CLASSE la carte (couleur, facettes du tray, calcul des nuits côté serveur) ;
  // le glyphe, lui, n'est que de l'affichage — Alfred peut le poser par carte (`ico`), un
  // marché n'étant pas un aviron. Vient d'un fichier et part en innerHTML → échappé ici,
  // une fois pour tous les rendus (même contrat que l'`ico` de frontmatter d'un domaine).
  const vicoOf = (i) => esc(i.ico || '') || vtypeOf(i.type).ico;
  const CRX = { matin: 0, midi: 1, 'apres-midi': 2, soir: 3 };
  const CRN = { matin: 'matin', midi: 'midi', 'apres-midi': 'après-midi', soir: 'soir' };
  // L'ordre des cartes EST le déroulé du jour : rang explicite (`ordre`, posé par le
  // drop) ; repli sur l'ancien créneau pour les items qui n'ont jamais été déplacés.
  const vrank = (i) => (typeof i.ordre === 'number' ? i.ordre : ((CRX[i.creneau] ?? 2) + 1) * 1000);
  const VMODE_API = { marche: 'WALK', voiture: 'DRIVE', velo: 'BICYCLE', transport: 'TRANSIT' };
  const VMODE_ICO = { marche: '🚶', voiture: '🚗', velo: '🚲', transport: '🚇' };
  // Google Weather `type` → picto (familles principales ; défaut nuage).
  const WX_ICO = { CLEAR: '☀️', MOSTLY_CLEAR: '🌤️', PARTLY_CLOUDY: '⛅', MOSTLY_CLOUDY: '🌥️', CLOUDY: '☁️', WINDY: '💨', FOG: '🌫️', HAZE: '🌫️', THUNDERSTORM: '⛈️', THUNDERSHOWER: '⛈️', SCATTERED_THUNDERSTORMS: '⛈️', SNOW: '🌨️' };
  const wxIco = (t) => WX_ICO[t] || (/RAIN|SHOWER/.test(t || '') ? '🌧️' : /THUNDER/.test(t || '') ? '⛈️' : /SNOW/.test(t || '') ? '🌨️' : '☁️');

  const vfmtDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  function vdaysOf(a, b) {
    const out = []; const end = new Date(b + 'T12:00:00');
    for (let d = new Date(a + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return out;
  }
  const vkmOf = (a, b) => { const r = Math.PI / 180, h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const vmin = (s) => { const m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : m + ' min'; };

  let voy = null; // { path, data, state, filter }
  let vdrag = false;
  let vdragId = null; // id de la carte en cours de drag (dataTransfer est illisible en dragover)
  // Point d'insertion dans un jour : index avant lequel la carte tombera, d'après
  // la position verticale du curseur face aux cartes déjà en place.
  function vdropIndex(dz, y, skipId) {
    const els = [...dz.querySelectorAll('.vcard')].filter((c) => c.dataset.vi !== skipId);
    let idx = els.length;
    for (let k = 0; k < els.length; k++) {
      const r = els[k].getBoundingClientRect();
      if (y < r.top + r.height / 2) { idx = k; break; }
    }
    return { idx, els };
  }
  function vclearIns() { page.querySelectorAll('.inst,.insb').forEach((x) => x.classList.remove('inst', 'insb')); }
  const vRouteCache = new Map();
  async function vroute(a, b, mode) {
    const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}|${mode}`;
    if (vRouteCache.has(key)) return vRouteCache.get(key);
    try {
      const r = await fetch(`/api/voyage/route?frm=${a.lat},${a.lng}&to=${b.lat},${b.lng}&mode=${VMODE_API[mode]}`, { headers: headers(false) });
      const j = r.ok ? await r.json() : { available: false };
      vRouteCache.set(key, j);
      return j;
    } catch { return { available: false }; }
  }
  // Liaison dérivée (plugins/voyages/VOYAGES.md) : filtre par modes déclarés du voyage, présélection
  // à vol d'oiseau (gratuite), vérification API, escalade si plafond crevé
  // (marche > 30 min, vélo > 45 min), zone grise 20-30 min = les deux modes.
  async function vliaison(a, b, modes) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const d = vkmOf(a, b);
    if (d < 0.08) return null;
    const has = (m) => modes.includes(m);
    const fmt = (r) => `${VMODE_ICO[r.m]} ${vmin(r.s)}${r.km >= 8 ? ' · ' + Math.round(r.km) + ' km' : ''}`;
    const one = async (m) => { const r = await vroute(a, b, m); return r.available ? { m, s: r.seconds, km: (r.meters || 0) / 1000 } : null; };
    const pick = d <= 2 && has('marche') ? 'marche' : d <= 6 && has('velo') ? 'velo' : has('voiture') ? 'voiture' : has('transport') ? 'transport' : modes[0];
    if (!pick) return null;
    const r1 = await one(pick);
    if (!r1) return null;
    const cap = { marche: 1800, velo: 2700 }[pick];
    if (cap && r1.s > cap) {
      const up = has('voiture') ? 'voiture' : has('transport') ? 'transport' : null;
      if (up) { const r2 = await one(up); if (r2) return fmt(r2); }
    }
    if (pick === 'marche' && r1.s > 1200 && r1.s <= 1800 && has('voiture')) {
      const r2 = await one('voiture');
      if (r2) return fmt(r1) + ' · ' + fmt(r2);
    }
    return fmt(r1);
  }

  async function voyagesTileInfo() {
    try {
      const r = await fetch('/api/voyage/list', { headers: headers(false) });
      if (!r.ok) return null;
      const { voyages } = await r.json();
      if (!voyages.length) return null;
      const today = new Date().toISOString().slice(0, 10);
      const next = voyages.find((v) => v.debut && v.fin && v.fin >= today);
      let st = '';
      if (next) {
        const dj = Math.ceil((new Date(next.debut) - new Date(today)) / 86400000);
        st = next.titre + (dj > 0 ? ` — J-${dj}` : ' — en cours');
      }
      // La forme attendue par le lanceur : un statut, et des compteurs qu'il
      // peint sans savoir ce qu'ils comptent. `hot` met en ambre ce qui attend
      // un geste — la seule métrique qui mérite d'attirer l'œil.
      const n = voyages.length;
      const sug = voyages.reduce((acc, v) => acc + (v.suggestions || 0), 0);
      return {
        st,
        items: [
          { texte: `${n} voyage${n > 1 ? 's' : ''}` },
          ...(sug ? [{ texte: `${sug} suggestion${sug > 1 ? 's' : ''}`, hot: true }] : []),
        ],
      };
    } catch { return null; }
  }

  async function renderVoyagesHub() {
    crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Voyages', hash: '#/voyages' }]);
    page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
    let list;
    try { const r = await fetch('/api/voyage/list', { headers: headers(false), cache: 'no-store' }); list = (await r.json()).voyages; }
    catch { page.innerHTML = '<div class="wrap"><div class="empty">Voyages indisponibles.</div></div>'; return; }
    let html = `<div class="wrap" style="--dc:var(--voyage)"><div class="chead"><div class="aico" style="--dc:var(--voyage)">🌴</div><div><h1>Voyages</h1><div class="lede">Un dossier par voyage — résas sourcées de Gmail, suggestions d’Alfred, timeline à composer.</div></div></div>`;
    if (!list.length) { page.innerHTML = html + '<div class="empty">Aucun voyage — demandez à Alfred d’en cadrer un (« on part en Corse du 8 au 22 août »).</div></div>'; return; }
    const vCard = (v) => {
      const dates = v.debut ? `${vfmtDay(v.debut)} → ${vfmtDay(v.fin)}` : 'sans dates — envie à cadrer';
      const foot = [];
      if (v.status) foot.push(`<span class="stat ${sc(v.status)}">${esc(v.status)}</span>`);
      if (v.confirmes) foot.push(`<span class="tag">${v.confirmes} confirmée${v.confirmes > 1 ? 's' : ''}</span>`);
      if (v.suggestions) foot.push(`<span class="tag">💡 ${v.suggestions}</span>`);
      return `<a class="card" href="#/voyage/${encodeURIComponent(v.path)}"><div class="ct">${esc(v.titre)}</div><div class="cmeta">${esc(dates)}${v.lieux?.length ? ' · ' + esc(v.lieux.join(' → ')) : ''}</div>${foot.length ? `<div class="foot">${foot.join('')}</div>` : ''}</a>`;
    };
    // Même règle que les fiches : un voyage `clos` quitte la grille pour le tiroir Archive.
    // Le tri se fait sur le statut DÉCLARÉ, jamais sur les dates — une fin passée n'archive
    // pas un voyage encore en consolidation ; c'est la clôture qui range.
    const vivants = list.filter((v) => sc(v.status) !== 'clos');
    const clos = list.filter((v) => sc(v.status) === 'clos');
    if (vivants.length) html += `<div class="cards">${vivants.map(vCard).join('')}</div>`;
    if (clos.length) html += `<details class="archsec"${vivants.length ? '' : ' open'}><summary>🗄️ Archive <span class="hint">— ${clos.length} voyage${clos.length > 1 ? 's' : ''} clos</span></summary><div class="cards">${clos.map(vCard).join('')}</div></details>`;
    page.innerHTML = html + '</div>';
  }

  async function renderVoyage(path) {
    crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Voyages', hash: '#/voyages' }, { label: '…', hash: '#/voyage/' + encodeURIComponent(path) }]);
    page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
    let data, state;
    try {
      const [rd, rs] = await Promise.all([
        fetch('/api/memory/raw/' + path, { headers: headers(false), cache: 'no-store' }),
        fetch('/api/voyage/state?v=' + encodeURIComponent(path), { headers: headers(false), cache: 'no-store' }),
      ]);
      if (!rd.ok) throw new Error(rd.status);
      data = await rd.json(); state = await rs.json();
    } catch (e) { page.innerHTML = '<div class="wrap"><div class="empty">Voyage illisible (' + esc(String(e)) + ').</div></div>'; return; }
    voy = { path, data, state, filter: null };
    // L'arbre et l'index alimentent le listing du dossier (vDossier). Un échec
    // n'empêche pas la timeline : le bloc disparaît, la page vit.
    await Promise.all([memInfo ? null : loadTree(), loadIndex()].filter(Boolean));
    crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Voyages', hash: '#/voyages' }, { label: data.titre || 'Voyage', hash: '#/voyage/' + encodeURIComponent(path) }]);
    paintVoyage();
  }

  const vItems = () => (voy.data.items || []).map((it) => ({ ...it, ...(({ ts, ...o }) => o)(voy.state.items?.[it.id] || {}) }));
  const vDir = () => voy.path.replace(/assets\/voyage\.json$/, '');
  /* Le lien INTERNE d'une carte de voyage — `fiche` dans voyage.json.
     ═══════════════════════════════════════════════════════════════════════════
     Pourquoi un champ à part alors que `web` existe : `web` est EXTERNE par
     contrat (nouvel onglet, « ↗ Ouvrir la page », le site du lieu). Une carte qui
     veut pointer une fiche de la mémoire n'avait rien — Alfred a donc mis une URL
     absolue dans `web`, ce qui marche mais sort de l'app et ment sur le libellé.
     Les deux coexistent maintenant sur la même carte, et c'est le cas normal :
     le site du restaurant D'UN côté, la fiche qu'Alfred a rédigée DE l'autre.

     La cible se déduit de l'extension, pas d'un second champ : un `.parcours.json`
     ouvre la carte en grand, tout le reste ouvre la fiche. */
  function vficheHref(rel) {
    if (!rel) return null;
    const chemin = /^[a-z]+:|^\//i.test(rel) ? rel : vDir() + rel;
    if (/^[a-z]+:/i.test(chemin)) return null;          // une URL n'est pas une fiche
    const route = /\.parcours\.json$/i.test(chemin) ? '#/parcours/' : '#/mem/';
    return route + chemin.split('/').map(encodeURIComponent).join('/');
  }
  const vficheLbl = (rel) => (/\.parcours\.json$/i.test(rel || '') ? '🗺 Voir le parcours' : '📄 Voir la fiche');

  /* Les fiches du dossier de voyage — le filet anti-ORPHELINES.
     ═══════════════════════════════════════════════════════════════════════════
     `#/dom/voyages/<id>` rend la TIMELINE, pas le listing du dossier. Une fiche
     `.md` posée là n'existe donc pour personne tant que rien ne la pointe — pas
     même la fiche homonyme du voyage. Alfred a écrit une balade complète que
     Monsieur n'a pu ouvrir qu'en tapant l'adresse à la main.
     Une carte peut maintenant y renvoyer (`fiche`), mais compter sur ce lien
     serait remettre la découvrabilité à un champ facultatif : ce bloc liste ce
     que le dossier contient, qu'on l'ait pointé ou non. */
  function vDossier() {
    const dir = vDir().replace(/\/$/, '');
    if (!dir || !memInfo?.entries) return [];
    return memInfo.entries
      .filter((e) => !e.dir && e.path.startsWith(dir + '/')
        && /\.(md|parcours\.json)$/i.test(e.path)
        // enfants DIRECTS + les parcours d'assets/ : le reste (pièces jointes,
        // voyage.json) n'est pas une page qu'on ouvre.
        && (!e.path.slice(dir.length + 1).includes('/') || /\.parcours\.json$/i.test(e.path)))
      .map((e) => ({
        path: e.path,
        nom: (memIndex?.get(e.path)?.titre) || prettify(e.path.split('/').pop().replace(/\.(parcours\.json|md)$/i, '')),
        parcours: /\.parcours\.json$/i.test(e.path),
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }
  async function vgesture(payload) {
    try {
      const r = await fetch('/api/voyage/state', { method: 'POST', headers: headers(true), body: JSON.stringify({ v: voy.path, ...payload }) });
      if (!r.ok) { alert('Geste refusé : ' + ((await r.json()).detail || r.status)); return; }
      voy.state = await r.json();
    } catch (e) { alert('Geste impossible : ' + String(e)); }
    paintVoyage();
  }

  function vitemHTML(it, extra) {
    const T = vtypeOf(it.type);
    const chips = [];
    if (it.heure) chips.push(`<span class="chip">${esc(it.heure)}</span>`);
    if (it.duree) chips.push(`<span class="chip">◷ ${esc(it.duree)}</span>`);
    if (it.prix) chips.push(`<span class="chip">${esc(it.prix)}</span>`);
    if (it.gmail) chips.push('<span class="chip due">📧 résa</span>');
    // Savoir qu'une carte porte une fiche SANS l'ouvrir : sinon le lien n'existe
    // que pour qui pense à cliquer, et on retombe sur l'orpheline.
    if (it.fiche) chips.push(`<span class="chip">${/\.parcours\.json$/i.test(it.fiche) ? '🗺 parcours' : '📄 fiche'}</span>`);
    return `<div class="vcard" draggable="true" title="Clic : fiche · Glisser : déplacer" data-vi="${esc(it.id)}" style="--ic:var(${T.c})"><span class="vico">${vicoOf(it)}</span><div class="bd"><div class="vt">${esc(it.titre || it.id)}</div>${chips.length ? `<div class="vmeta">${chips.join('')}</div>` : ''}</div>${extra || ''}</div>`;
  }

  function paintVoyage() {
    vdrag = false; vdragId = null; // le DOM est reconstruit, aucun drag ne survit au rendu
    const d = voy.data;
    const items = vItems();
    const allSug = items.filter((i) => i.statut === 'suggestion');
    const sug = allSug.filter((i) => !voy.filter || i.type === voy.filter);
    const nEc = items.filter((i) => i.statut === 'ecartee').length;
    const modes = d.modes || ['marche', 'voiture'];
    const modesTags = modes.map((m) => `<span class="tag">${VMODE_ICO[m] || ''} ${esc(m)}</span>`).join('');
    const props = `<div class="props"><span class="k">Statut</span><span class="stat ${sc(d.status)}">${esc(d.status || '—')}</span>${d.debut ? `<span class="k">Dates</span><span class="tag">${vfmtDay(d.debut)} → ${vfmtDay(d.fin)}</span>` : ''}<span class="k">Modes</span>${modesTags}</div>`;

    // Voyage « idée » : pas de timeline, le tray seul — rien ne se confirme sans dates.
    if (!d.debut || !d.fin) {
      page.innerHTML = `<div class="wrap" style="--dc:var(--voyage)"><div class="chead"><div class="aico" style="--dc:var(--voyage)">🌴</div><div><h1>${esc(d.titre || 'Voyage')}</h1><div class="lede">Voyage à l’état d’idée — le tray vit, la timeline attend les dates.</div></div></div>${props}
        <div class="callout">🗓️ <b>Posez les dates pour composer</b> — dites-le à Alfred (« on part du 12 au 26 avril ») : sans début ni fin, la confirmation est impossible.</div>
        <div class="grouplabel">Suggestions <span class="hint">— par Alfred, en attendant</span></div>
        <div class="cards">${allSug.map((i) => `<button class="card" data-open="${esc(i.id)}"><div class="ct">${vicoOf(i)} ${esc(i.titre || i.id)}</div><div class="cmeta">${esc(i.hint || '')}</div><div class="foot"><span class="tag">${vtypeOf(i.type).n}</span></div></button>`).join('') || '<div class="empty">Aucune suggestion — demandez-en à Alfred.</div>'}</div></div>`;
      page.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openVFiche(b.dataset.open)));
      return;
    }

    const days = vdaysOf(d.debut, d.fin);
    const liaisons = []; // {id, a, b, first} remplis après le paint (asynchrone)
    const tl = days.map((day) => {
      const band = items.find((i) => i.statut === 'confirme' && i.debut && i.fin && i.debut <= day && day < i.fin);
      const cards = items
        .filter((i) => i.statut === 'confirme' && i.jour === day)
        .sort((a, b) => (vrank(a) - vrank(b)) || String(a.heure || '').localeCompare(String(b.heure || '')));
      let flow = '';
      let prev = band && band.lat != null ? band : null;
      cards.forEach((c, ix) => {
        if (prev && c.lat != null) {
          const id = `vlia-${day}-${ix}`;
          liaisons.push({ id, a: prev, b: c, first: ix === 0 && !!band });
          flow += `<div class="vlink" id="${id}"><span class="lb">…</span></div>`;
        }
        flow += vitemHTML(c);
        if (c.lat != null) prev = c;
      });
      if (!cards.length) flow = '<div class="vfree">— journée libre — déposez une carte</div>';
      // L'hébergement CLÔT la journée : c'est la nuit, pas le programme du matin.
      // Il reste la référence de la première liaison (« de l'hôtel · … »), qui, elle,
      // se lit en haut — on part de là où on a dormi.
      return `<div class="vday" data-day="${day}"><div class="vday-h"><span class="dn">${vfmtDay(day)}</span><span class="wx na" data-wx="${day}"></span></div><div class="vflow">${flow}</div>${band ? `<div class="vband" data-open="${esc(band.id)}">${vicoOf(band)} ${esc(band.titre || band.id)}<span class="fx">${band.debut === day ? 'arrivée · nuit ici' : 'nuit ici'}</span></div>` : ''}</div>`;
    }).join('');

    const types = [...new Set(allSug.map((i) => i.type))];
    const tray = `<aside class="vtray"><div class="th">Suggestions <span class="cnt">${allSug.length}</span></div>
      ${types.length > 1 ? `<div class="facets">${['', ...types].map((tp) => `<button class="pill ${(!tp && !voy.filter) || voy.filter === tp ? 'on' : ''}" data-tf="${esc(tp)}">${tp ? vtypeOf(tp).n : 'Tous'}</button>`).join('')}</div>` : ''}
      <div class="traygrid">${sug.map((i) => `<div class="traycard" draggable="true" title="Clic : fiche · Glisser : confirmer" data-vi="${esc(i.id)}" style="--ic:var(${vtypeOf(i.type).c})"><button class="dis" data-dis="${esc(i.id)}" title="Écarter — conservée, jamais reproposée">✕</button><span class="vico">${vicoOf(i)}</span><div class="bd"><div class="vt">${esc(i.titre || i.id)}</div>${i.hint ? `<div class="vhint">${esc(i.hint)}</div>` : ''}${i.prix ? `<div class="vmeta"><span class="chip">${esc(i.prix)}</span></div>` : ''}</div></div>`).join('') || '<div class="empty">Rien à trier — demandez des suggestions à Alfred.</div>'}</div>
      <div class="trayfoot">🖐 Une carte sur un jour = confirmée · une carte du planning ici = rendue aux suggestions${nEc ? ` · <button class="eclink" data-ectoggle>${nEc} écartée${nEc > 1 ? 's' : ''} ${voy.showEc ? '▾' : '▸'}</button>` : ''}</div>
      ${voy.showEc && nEc ? `<div class="traygrid">${items.filter((i) => i.statut === 'ecartee').map((i) => `<div class="traycard ec" data-vi="${esc(i.id)}"><button class="dis" data-rest="${esc(i.id)}" title="Reprendre dans les suggestions" style="opacity:1">↺</button><span class="vico">${vicoOf(i)}</span><div class="bd"><div class="vt">${esc(i.titre || i.id)}</div>${i.hint ? `<div class="vhint">${esc(i.hint)}</div>` : ''}</div></div>`).join('')}</div>` : ''}</aside>`;

    const fiches = vDossier();
    const bloc = fiches.length ? `<div class="grouplabel">Les fiches de ce voyage <span class="hint">— ce que le dossier contient</span></div>
      <div class="cards vdoss">${fiches.map((f) => `<a class="card" href="${f.parcours ? '#/parcours/' : '#/mem/'}${esc(f.path.split('/').map(encodeURIComponent).join('/'))}"><div class="ct">${f.parcours ? '🗺' : '📄'} ${esc(f.nom)}</div><div class="foot"><span class="tag">${f.parcours ? 'parcours' : 'fiche'}</span></div></a>`).join('')}</div>` : '';
    page.innerHTML = `<div class="wrap" style="--dc:var(--voyage)"><div class="chead"><div class="aico" style="--dc:var(--voyage)">🌴</div><div><h1>${esc(d.titre || 'Voyage')}</h1><div class="lede">${days.length} jours${(d.lieux || []).length ? ' · ' + d.lieux.map((l) => esc(l.nom)).join(' → ') : ''} · liaisons et météo dérivées au rendu</div></div></div>${props}<div class="vwrap"><div class="vtl">${tl}</div>${tray}</div>${bloc}</div>`;

    // Fiches (clic), tray (filtre, écarter), drag & drop → API d'état.
    page.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openVFiche(b.dataset.open)));
    page.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => { voy.filter = b.dataset.tf || null; paintVoyage(); }));
    page.querySelectorAll('[data-dis]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); vgesture({ id: b.dataset.dis, statut: 'ecartee' }); }));
    page.querySelectorAll('[data-rest]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); vgesture({ id: b.dataset.rest, statut: 'suggestion' }); }));
    const ecT = page.querySelector('[data-ectoggle]');
    if (ecT) ecT.addEventListener('click', () => { voy.showEc = !voy.showEc; paintVoyage(); });
    page.querySelectorAll('.vcard,.traycard').forEach((c) => {
      c.addEventListener('click', () => { if (!vdrag) openVFiche(c.dataset.vi); });
      c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.vi); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); vdrag = true; vdragId = c.dataset.vi; });
      c.addEventListener('dragend', () => { c.classList.remove('drag'); vclearIns(); setTimeout(() => { vdrag = false; vdragId = null; }, 0); });
    });
    page.querySelectorAll('.vday').forEach((dz) => {
      dz.addEventListener('dragover', (e) => {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dz.classList.add('dropok');
        // Liseré d'insertion : au-dessus de la carte visée, ou sous la dernière.
        const { idx, els } = vdropIndex(dz, e.clientY, vdragId);
        vclearIns();
        if (els.length) (idx < els.length ? els[idx].classList.add('inst') : els[els.length - 1].classList.add('insb'));
      });
      dz.addEventListener('dragleave', (e) => { if (!dz.contains(e.relatedTarget)) { dz.classList.remove('dropok'); vclearIns(); } });
      dz.addEventListener('drop', (e) => {
        e.preventDefault(); dz.classList.remove('dropok'); vclearIns();
        const it = vItems().find((x) => x.id === e.dataTransfer.getData('text/plain'));
        if (!it || it.debut || it.fin) return; // les continus ne se déplacent pas
        const day = dz.dataset.day;
        // Position de dépôt → rang fractionnaire entre les deux voisins.
        const others = vItems()
          .filter((x) => x.statut === 'confirme' && x.jour === day && x.id !== it.id)
          .sort((a, b) => vrank(a) - vrank(b));
        const { idx } = vdropIndex(dz, e.clientY, it.id);
        const r1 = idx > 0 ? vrank(others[idx - 1]) : null;
        const r2 = idx < others.length ? vrank(others[idx]) : null;
        const ordre = r1 != null && r2 != null ? (r1 + r2) / 2 : r2 != null ? r2 - 10 : r1 != null ? r1 + 10 : 1000;
        vgesture({ id: it.id, statut: 'confirme', jour: day, ordre });
      });
    });
    // Geste inverse : une carte du planning glissée sur le tray redevient suggestion.
    const trayEl = page.querySelector('.vtray');
    if (trayEl) {
      trayEl.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; trayEl.classList.add('dropok'); });
      trayEl.addEventListener('dragleave', () => trayEl.classList.remove('dropok'));
      trayEl.addEventListener('drop', (e) => {
        e.preventDefault(); trayEl.classList.remove('dropok');
        const it = vItems().find((x) => x.id === e.dataTransfer.getData('text/plain'));
        if (!it || it.debut || it.fin || it.statut !== 'confirme') return;
        vgesture({ id: it.id, statut: 'suggestion' });
      });
    }

    // Météo (dérivée) : patch des jours couverts par la fenêtre fiable ; les autres
    // restent vides côté futur lointain, « — » côté passé. L'absence, pas la fiction.
    const today = new Date().toISOString().slice(0, 10);
    page.querySelectorAll('[data-wx]').forEach((el) => {
      const day = el.dataset.wx;
      if (day < today) el.textContent = '—';
      else { el.textContent = 'météo à J-10'; el.title = 'hors fenêtre fiable (J+10) — le picto apparaîtra à l’approche du départ'; }
    });
    fetch('/api/voyage/weather?v=' + encodeURIComponent(voy.path), { headers: headers(false) })
      .then((r) => (r.ok ? r.json() : null))
      .then((wx) => {
        if (!wx || !wx.available) return;
        page.querySelectorAll('[data-wx]').forEach((el) => {
          const w = wx.days[el.dataset.wx];
          if (!w) return;
          el.className = 'wx';
          el.textContent = `${wxIco(w.type)} ${w.tmax != null ? Math.round(w.tmax) + '°' : ''}`;
          if (w.desc) el.title = w.desc;
        });
      }).catch(() => {});

    // Liaisons (dérivées) : remplies en asynchrone, recalculées à chaque paint —
    // le chip suit le geste, rien n'est jamais stocké.
    const modesDecl = modes.filter((m) => VMODE_API[m]);
    for (const L of liaisons) {
      vliaison(L.a, L.b, modesDecl).then((txt) => {
        const el = document.getElementById(L.id);
        if (!el) return;
        if (!txt) { el.remove(); return; }
        el.querySelector('.lb').textContent = (L.first ? 'de l’hôtel · ' : '') + txt;
      });
    }
  }

  const vModal = document.createElement('div');
  vModal.className = 'modal'; vModal.hidden = true;
  vModal.innerHTML = '<div class="card vfiche" id="vfiche-body"></div>';
  vModal.addEventListener('click', (e) => { if (e.target === vModal) vModal.hidden = true; });
  document.body.appendChild(vModal);
  function openVFiche(id) {
    const it = vItems().find((x) => x.id === id);
    if (!it) return;
    const T = vtypeOf(it.type);
    const cal = it.jour ? vfmtDay(it.jour) + (it.heure ? ' · ' + esc(it.heure) : it.creneau ? ' · ' + (CRN[it.creneau] || esc(it.creneau)) : '')
      : it.debut ? `${vfmtDay(it.debut)} → ${vfmtDay(it.fin)}` : 'à placer sur la timeline';
    const stCls = { suggestion: 'idee', confirme: 'achete', ecartee: 'bloque' }[it.statut] || 'encours';
    const stLbl = { suggestion: 'suggestion', confirme: 'confirmé', ecartee: 'écartée' }[it.statut] || it.statut;
    const chips = [it.duree ? `<span class="chip">◷ ${esc(it.duree)}</span>` : '', it.prix ? `<span class="chip">${esc(it.prix)}</span>` : ''].filter(Boolean).join('');
    const desc = it.desc || it.hint || '';
    const src = it.gmail ? '<div class="vsrc">📧 Résa retrouvée dans Gmail — la vérité du fil reste dans la boîte.</div>'
      : it.place_id ? '<div class="vsrc">📍 Fiche maps — note, horaires, itinéraire via <span class="mono">place_id</span>.</div>' : '';
    const docs = (it.docs || []).map((doc) => `<a class="vdoc" href="/api/memory/raw/${esc(vDir() + doc.fichier)}?download=1"><span class="ext">${esc((doc.fichier.split('.').pop() || 'doc').toUpperCase())}</span><div><div class="fn">${esc(doc.titre || doc.fichier)}</div><div class="fs">${esc(doc.fichier)}</div></div></a>`).join('');
    const body = vModal.querySelector('#vfiche-body');
    body.innerHTML = `<div class="vhead"><span class="vico">${vicoOf(it)}</span><div><div class="vst">${esc(it.titre || it.id)}</div><div class="vsub">${T.n} · <span class="stat ${stCls}">${esc(stLbl)}</span> · ${cal}</div></div></div>
      ${desc ? `<div class="vby">🎩 la fiche d’Alfred</div><p class="vdesc">${esc(desc)}</p>` : ''}
      ${chips ? `<div class="vmeta">${chips}</div>` : ''}${src}${docs}
      ${it.statut === 'confirme' && !it.debut ? `<div class="vhour"><span class="vby" style="margin:0">Heure</span><input type="time" id="vh-in" value="${esc(String(it.heure || '').replace('h', ':'))}"><button class="vopen" data-sethour>Poser</button>${it.heure ? '<button class="vopen" data-clearhour>Effacer</button>' : ''}<span class="vhint">optionnelle — l’ordre des cartes fait le déroulé, l’heure l’annote</span></div>` : ''}
      <div class="vactions">${vficheHref(it.fiche) ? `<a class="vopen prim" href="${esc(vficheHref(it.fiche))}" data-closefiche>${vficheLbl(it.fiche)}</a>` : ''}${it.web ? `<a class="vopen" href="${esc(it.web)}" target="_blank" rel="noopener">↗ Ouvrir la page</a>` : ''}${it.statut === 'confirme' && !it.debut ? `<button class="vopen" data-untray>↩ Rendre aux suggestions</button>` : ''}${it.statut !== 'ecartee' && !it.debut ? `<button class="vopen crit" data-ecarter>✕ Écarter</button>` : ''}${it.statut === 'ecartee' ? `<button class="vopen" data-restfiche>↺ Reprendre dans les suggestions</button>` : ''}${it.statut === 'suggestion' ? '<span class="trayfoot" style="padding:0">🖐 glissez la carte sur un jour pour confirmer</span>' : ''}
      <span style="flex:1"></span><button class="vopen" data-close>Fermer</button></div>`;
    body.querySelector('[data-close]').addEventListener('click', () => { vModal.hidden = true; });
    // Sans ça, la modale reste ouverte par-dessus la fiche, et le retour
    // arrière ramène sur une carte qu'on croyait avoir quittée.
    body.querySelector('[data-closefiche]')?.addEventListener('click', () => { vModal.hidden = true; });
    const untray = body.querySelector('[data-untray]');
    if (untray) untray.addEventListener('click', () => { vModal.hidden = true; vgesture({ id: it.id, statut: 'suggestion' }); });
    const ecB = body.querySelector('[data-ecarter]');
    if (ecB) ecB.addEventListener('click', () => { vModal.hidden = true; vgesture({ id: it.id, statut: 'ecartee' }); });
    const restB = body.querySelector('[data-restfiche]');
    if (restB) restB.addEventListener('click', () => { vModal.hidden = true; vgesture({ id: it.id, statut: 'suggestion' }); });
    // Poser/effacer l'heure : on refixe rang et jour tels quels, seule l'heure change.
    const setH = body.querySelector('[data-sethour]');
    if (setH) setH.addEventListener('click', () => { const val = body.querySelector('#vh-in').value; vModal.hidden = true; vgesture({ id: it.id, statut: 'confirme', jour: it.jour, ordre: vrank(it), heure: val || null }); });
    const clrH = body.querySelector('[data-clearhour]');
    if (clrH) clrH.addEventListener('click', () => { vModal.hidden = true; vgesture({ id: it.id, statut: 'confirme', jour: it.jour, ordre: vrank(it), heure: null }); });
    vModal.hidden = false;
  }

  return {
    routes: {
      // Le hub intercepte AUSSI `dom/voyages` : sans ça, la tuile générique du
      // domaine ouvrirait une liste de fiches là où on attend des cartes.
      voyages: () => renderVoyagesHub(),
      'dom/voyages': () => renderVoyagesHub(),
      'voyage/': (reste) => renderVoyage(reste),
    },
    tileInfo: voyagesTileInfo,
  };
}
