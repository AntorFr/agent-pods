/* App `planning` — l'agenda transverse : semaine en vue principale, mois en zoom arrière.
   ═══════════════════════════════════════════════════════════════════════════

   Données : `planning/planning.json` dans la mémoire, écrit par l'agent — contrat
   dans PLANNING.md, à côté. Trois primitives, et rien d'autre :
     - un SUIVI est une voie nommée (couleur + nom) : « vous · Paris », « Laurine » ;
     - une PÉRIODE est un intervalle sur un suivi — `end` EXCLUSIF, comme le DTEND
       daté d'iCalendar : une seule convention, l'hébergement n'a pas d'exception ;
     - un ÉLÉMENT est une carte typée sur un jour (train, rdv, repas…).

   Le dérivé ne se stocke pas : chips d'heure, chip 📧 résa (présence de `gmail`),
   découpe des bandes aux bords de semaine, capitales des noms de bande — tout ça
   naît au rendu. Pas d'API propre ni d'overlay de gestes : la vue LIT, l'agent
   écrit ; le jour où un geste d'UI existera (déplacer une carte ?), il suivra le
   modèle voyages (overlay frère, consolidé par l'agent).

   ⚠️ `api.page` est un GETTER, ne pas le déstructurer (cf. plugins/repos/web/app.js). */

import './app.css';

export default function createPlanningApp(api) {
  const { esc, crumbs, headers } = api;

  const FICHIER = 'planning/planning.json';

  // Le `type` CLASSE l'élément (couleur, icône par défaut) ; `ico` et `color`
  // surchargent à l'unité — un ferry n'est pas un TGV. Même contrat que voyages.
  const PTYPE = {
    trajet: { ico: '🚆', c: '--proj', n: 'trajet' },
    rdv: { ico: '💼', c: '--agenda', n: 'rdv' },
    repas: { ico: '🍽️', c: '--cuisine', n: 'repas' },
    activite: { ico: '🚣', c: '--diy', n: 'activité' },
  };
  const ptypeOf = (t) => PTYPE[t] || { ico: '◆', c: '--agenda', n: t || 'autre' };
  const picoOf = (e) => esc(e.ico || '') || ptypeOf(e.type).ico;
  // Une couleur venue d'un fichier finit dans un `style=` : on ne laisse passer
  // qu'un nom de jeton. Tout le reste retombe sur le défaut — jamais d'hex.
  const tok = (c, dft) => (/^--[a-z][a-z0-9-]*$/.test(c || '') ? c : dft);

  /* ── Dates — ISO partout, midi pour esquiver les fuseaux ─────────────────── */
  const D = (iso) => new Date(iso + 'T12:00:00');
  const addDays = (iso, n) => { const d = D(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const mondayOf = (iso) => addDays(iso, -((D(iso).getDay() + 6) % 7));
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtShort = (iso) => D(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
  const fmtDay = (iso) => D(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtLong = (iso) => D(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  function weekTitle(mon) {
    const dim = addDays(mon, 6);
    const a = D(mon);
    return (a.getMonth() === D(dim).getMonth() ? String(a.getDate())
      : a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) + ' – ' + fmtLong(dim);
  }

  /* ── L'état de la vue — le fichier + où l'on regarde ─────────────────────── */
  let st = null; // { data, mode: 'semaine'|'mois', anchor: iso, sel: iso|null }

  // Un élément vit sur UN jour ; son heure est le fragment `T` de `start`.
  const dayOf = (e) => String(e.start || '').slice(0, 10);
  const hourOf = (v) => (String(v || '').length > 10 ? String(v).slice(11, 16) : '');
  const covers = (p, day) => p.start <= day && day < p.end; // end exclusif (contrat)
  const lastNight = (p) => addDays(p.end, -1);

  const suivis = () => (st.data.suivis || []).filter((s) => s.uid && s.name);
  const suiviOf = (uid) => suivis().find((s) => s.uid === uid) || null;
  // Les périodes orphelines (suivi inconnu, bornes absentes ou inversées) sont
  // ignorées : une donnée malformée perd sa bande, pas la page.
  const periodes = () => (st.data.periodes || []).filter((p) => p.start && p.end && p.start < p.end && suiviOf(p.suivi));
  const elements = () => (st.data.elements || []).filter((e) => e.start && (e.title || e.uid));
  const elsOf = (day) => elements().filter((e) => dayOf(e) === day)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const perOf = (day) => periodes().filter((p) => covers(p, day));

  /* ── Fragments partagés ──────────────────────────────────────────────────── */
  function cardHTML(e) {
    const h1 = hourOf(e.start), h2 = hourOf(e.end);
    const sub = [e.description, e.location].filter(Boolean).join(' · ');
    const tm = `<div class="tm">${picoOf(e)}${h1 ? ' ' + esc(h1) + (h2 ? ' → ' + esc(h2) : '') : ''}` +
      `${e.gmail ? '<span class="due">📧</span>' : ''}${e.fiche ? '<span class="due">📄</span>' : ''}</div>`;
    const corps = `${tm}<div class="pt">${esc(e.title || e.uid)}</div>${sub ? `<div class="pd">${esc(sub)}</div>` : ''}`;
    const ic = tok(e.color, ptypeOf(e.type).c);
    return e.fiche
      ? `<a class="plcard" style="--ic:var(${ic})" href="#/mem/${esc(String(e.fiche).split('/').map(encodeURIComponent).join('/'))}">${corps}</a>`
      : `<div class="plcard" style="--ic:var(${ic})">${corps}</div>`;
  }
  const bandHTML = (p, day) => {
    const s = suiviOf(p.suivi);
    return `<div class="plband" style="--rc:var(${tok(s.color, '--maison')})">${esc(p.title || s.name)}` +
      `<span class="fx">${day === p.start ? 'arrivée · nuit ici' : day === lastNight(p) ? 'dernière nuit' : 'nuit ici'}</span></div>`;
  };
  const legend = () => suivis().map((s) =>
    `<span class="pl-lpill" style="--rc:var(${tok(s.color, '--accent')})">${esc(s.name)}</span>`).join('');
  const bar = (titre) => `<div class="plbar">
      <div class="plmodes">${['semaine', 'mois'].map((m) =>
        `<button class="pill ${st.mode === m ? 'on' : ''}" data-plmode="${m}">${m}</button>`).join('')}</div>
      <button class="plnav" data-plnav="-1">‹</button><div class="plmt">${esc(titre)}</div><button class="plnav" data-plnav="1">›</button>
      <button class="plnav plto" data-plnav="0" title="Revenir à aujourd’hui">◎</button></div>`;

  /* Une bande de semaine : pour chaque suivi actif sur la fenêtre, un segment par
     jour couvert. Les capsules (coins ronds) ne marquent que les VRAIES bornes :
     au bord de la fenêtre, la coupe reste franche — c'est la découpe du contrat
     (fin le dimanche, début le lundi), elle appartient au rendu. */
  function laneRow(days, s) {
    const c = tok(s.color, '--accent');
    return days.map((day) => {
      const p = periodes().find((q) => q.suivi === s.uid && covers(q, day));
      if (!p) return '<div class="pl-lane spacer"></div>';
      const caps = (day === p.start ? ' start' : '') + (day === lastNight(p) ? ' end' : '');
      const lbl = day === p.start || day === days[0] ? esc(p.title || s.name) : '';
      return `<div class="pl-lane${caps}" style="--rc:var(${c})">${lbl}</div>`;
    });
  }
  const actifs = (days) => suivis().filter((s) =>
    periodes().some((p) => p.suivi === s.uid && days.some((d) => covers(p, d))));

  /* ── Vue semaine — 7 colonnes au large, pile de jours sur mobile ─────────── */
  function weekHTML(mon) {
    const days = [...Array(7)].map((_, i) => addDays(mon, i));
    const act = actifs(days);
    const lanes = days.map((_, i) => `<div class="plwl">${act.map((s) => laneRow(days, s)[i]).join('')}</div>`).join('');
    const desk = `<div class="plwgrid">
      ${days.map((d) => `<div class="plwh${d === today() ? ' today' : ''}">${esc(fmtShort(d))}</div>`).join('')}
      ${lanes}
      ${days.map((d) => `<div class="plwc">${elsOf(d).map(cardHTML).join('')}</div>`).join('')}</div>`;

    // Mobile : la même semaine à la verticale. Un jour vide hors de toute période
    // ne mérite pas un bloc — les creux consécutifs se replient en une ligne.
    const rows = [];
    let creux = [];
    const purge = () => {
      if (!creux.length) return;
      rows.push({ skip: creux.length === 1 ? fmtDay(creux[0]) + ' · rien de prévu'
        : fmtDay(creux[0]) + ' → ' + fmtDay(creux[creux.length - 1]) + ' · rien de prévu' });
      creux = [];
    };
    for (const d of days) {
      if (elsOf(d).length || perOf(d).length) { purge(); rows.push({ day: d }); }
      else creux.push(d);
    }
    purge();
    const rails = act.filter((s) => (s.genre || '') !== 'hebergement');
    const railHTML = rails.map((s, ci) => {
      const c = tok(s.color, '--accent');
      return periodes().filter((p) => p.suivi === s.uid && days.some((d) => covers(p, d))).map((p) => {
        const idx = rows.map((r, i) => (r.day && covers(p, r.day) ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) return '';
        return `<div class="plrail" style="grid-column:${ci + 1}; grid-row:${idx[0] + 1} / ${idx[idx.length - 1] + 2}; --rc:var(${c})"><span class="rl">${esc(p.title || s.name)}</span></div>`;
      }).join('');
    }).join('');
    const mob = `<div class="plmweek" style="grid-template-columns:${rails.map(() => '12px').join(' ') || '0'} minmax(0,1fr)">${railHTML}
      ${rows.map((r, i) => r.skip
        ? `<div class="plskip" style="grid-row:${i + 1}">${esc(r.skip)}</div>`
        : `<div class="plday${r.day === today() ? ' today' : ''}" style="grid-row:${i + 1}">
            <div class="pldh">${esc(fmtDay(r.day))}${r.day === today() ? '<span class="tdy">aujourd’hui</span>' : ''}</div>
            ${elsOf(r.day).map(cardHTML).join('') || '<div class="plfree">— journée libre —</div>'}
            ${perOf(r.day).filter((p) => (suiviOf(p.suivi).genre || '') === 'hebergement').map((p) => bandHTML(p, r.day)).join('')}
          </div>`).join('')}</div>`;
    return `<div class="pl-desk">${desk}</div><div class="pl-mob">${mob}</div>`;
  }

  /* ── Vue mois — la grille, et le jour sélectionné détaillé à côté ────────── */
  function monthHTML(anchor) {
    const first = anchor.slice(0, 8) + '01';
    const fin = addDays(addDays(first, 32).slice(0, 8) + '01', -1); // dernier jour du mois
    let cur = mondayOf(first);
    const weeks = [];
    while (cur <= fin) { weeks.push([...Array(7)].map((_, i) => addDays(cur, i))); cur = addDays(cur, 7); }
    const cells = weeks.map((days) => {
      const act = actifs(days);
      return days.map((day, i) => {
        const off = day.slice(0, 7) !== anchor.slice(0, 7);
        const lanes = act.map((s) => laneRow(days, s)[i]).join('');
        const evs = elsOf(day).map((e) => `<div class="plmev" style="--ic:var(${tok(e.color, ptypeOf(e.type).c)})">${picoOf(e)}${hourOf(e.start) ? ' ' + esc(hourOf(e.start)) : ''}</div>`).join('');
        return `<button class="plmc${off ? ' off' : ''}${day === st.sel ? ' sel' : ''}${day === today() ? ' today' : ''}" data-plday="${day}"><span class="n">${D(day).getDate()}</span>${lanes}${evs}</button>`;
      }).join('');
    }).join('');
    const grid = `<div class="plmgrid">${['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((j) => `<div class="plmh">${j}</div>`).join('')}${cells}</div>`;
    const sel = st.sel;
    const panel = `<div class="plpanel"><div class="grouplabel">Jour sélectionné</div>${sel
      ? `<div class="plday"><div class="pldh">${esc(fmtDay(sel))}${sel === today() ? '<span class="tdy">aujourd’hui</span>' : ''}</div>
          ${elsOf(sel).map(cardHTML).join('') || '<div class="plfree">— rien ce jour —</div>'}
          ${perOf(sel).filter((p) => (suiviOf(p.suivi).genre || '') === 'hebergement').map((p) => bandHTML(p, sel)).join('')}
          ${perOf(sel).filter((p) => (suiviOf(p.suivi).genre || '') !== 'hebergement').map((p) => { const s = suiviOf(p.suivi); return `<div class="plwho" style="--rc:var(${tok(s.color, '--accent')})">${esc(s.name)} · ${esc(fmtDay(p.start))} → ${esc(fmtDay(lastNight(p)))}</div>`; }).join('')}
        </div>` : '<div class="plfree">— cliquez un jour du mois —</div>'}</div>`;
    return `<div class="plmwrap"><div class="plmcal">${grid}</div>${panel}</div>`;
  }

  /* ── Rendu ───────────────────────────────────────────────────────────────── */
  function paint() {
    const page = api.page;
    const mon = mondayOf(st.anchor);
    const titre = st.mode === 'semaine' ? weekTitle(mon)
      : D(st.anchor.slice(0, 8) + '01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const vide = !suivis().length && !elements().length;
    page.innerHTML = `<div class="wrap plwrap" style="--dc:var(--agenda)">
      <div class="chead"><div class="aico" style="--dc:var(--agenda)">🗓️</div><div><h1>Planning</h1>
        <div class="lede">Trains, nuits d’hôtel et présences — la semaine cartes en main, le mois en zoom arrière.</div></div></div>
      ${suivis().length ? `<div class="pl-legend">${legend()}</div>` : ''}
      ${bar(titre)}
      ${vide ? '<div class="empty">Planning vide — demandez à Alfred d’y poser vos trains, vos nuits et vos présences (« mets mon aller-retour Paris de la semaine 37 au planning »).</div>'
        : st.mode === 'semaine' ? weekHTML(mon) : monthHTML(st.anchor)}</div>`;

    page.querySelectorAll('[data-plmode]').forEach((b) => b.addEventListener('click', () => {
      st.mode = b.dataset.plmode;
      if (st.mode === 'mois' && !st.sel) st.sel = today().slice(0, 7) === st.anchor.slice(0, 7) ? today() : null;
      paint();
    }));
    page.querySelectorAll('[data-plnav]').forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.plnav);
      if (!n) { st.anchor = today(); st.sel = today(); }
      else if (st.mode === 'semaine') st.anchor = addDays(mondayOf(st.anchor), n * 7);
      else { const d = D(st.anchor.slice(0, 8) + '01'); d.setMonth(d.getMonth() + n); st.anchor = d.toISOString().slice(0, 10); st.sel = null; }
      paint();
    }));
    page.querySelectorAll('[data-plday]').forEach((b) => b.addEventListener('click', () => { st.sel = b.dataset.plday; paint(); }));
  }

  async function renderPlanning() {
    crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Planning', hash: '#/planning' }]);
    api.page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
    let data = null;
    try {
      const r = await fetch('/api/memory/raw/' + FICHIER, { headers: headers(false), cache: 'no-store' });
      if (r.ok) data = await r.json();
      else if (r.status !== 404) throw new Error(r.status);
    } catch (e) {
      api.page.innerHTML = `<div class="wrap"><div class="empty">Planning illisible (${esc(String(e))}).</div></div>`;
      return;
    }
    // Fichier absent = corps qui n'a encore rien planifié : l'état vide l'explique.
    st = { data: data || {}, mode: st?.mode || 'semaine', anchor: st?.anchor || today(), sel: st?.sel || null };
    paint();
  }

  /* La tuile : ce que la semaine qui vient contient, sans ouvrir la vue. */
  async function planningTileInfo() {
    try {
      const r = await fetch('/api/memory/raw/' + FICHIER, { headers: headers(false) });
      if (!r.ok) return null;
      const d = await r.json();
      const j0 = today(), j7 = addDays(j0, 7);
      const els = (d.elements || []).filter((e) => { const j = String(e.start || '').slice(0, 10); return j >= j0 && j < j7; })
        .sort((a, b) => String(a.start).localeCompare(String(b.start)));
      const pres = (d.periodes || []).filter((p) => p.start && p.end && p.start < j7 && p.end > j0).length;
      if (!els.length && !pres) return null;
      const prochain = els[0];
      return {
        st: prochain ? `${prochain.title || ''} — ${fmtDay(String(prochain.start).slice(0, 10))}` : '',
        items: [
          ...(els.length ? [{ texte: `${els.length} cette semaine`, hot: true }] : []),
          ...(pres ? [{ texte: `${pres} période${pres > 1 ? 's' : ''} en cours` }] : []),
        ],
      };
    } catch { return null; }
  }

  return {
    routes: { planning: () => renderPlanning() },
    tileInfo: planningTileInfo,
  };
}
