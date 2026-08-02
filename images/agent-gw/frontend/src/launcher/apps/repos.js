/* App `repos` — le tableau de flotte.
   ═══════════════════════════════════════════════════════════════════════════
   Un scan des `.agent/status.md` des clones locaux, servi par `/api/repos` :
   l'état en une ligne, l'activité des trente derniers jours, et ce qui attend un
   geste.

   Cette vue vivait dans `skins/skippy.js`, donc elle n'existait que sous la
   livrée Skippy — alors que `/api/repos` répond quel que soit le thème et que
   `repos` était déjà un module déclarable. Poser `GW_APPS=repos` sur un pod en
   livrée neutre donnait une route morte. Contrat et injection : `apps/index.js`. */

import './repos.css';

const SPARK_W = 118, SPARK_H = 30;

export default function createReposApp(api) {
  // ⚠️ `page` n'est PAS destructuré, et ce n'est pas un oubli : c'est un GETTER
  // de l'API du lanceur (`get page() { return page; }`), parce que le nœud
  // n'existe pas encore quand les apps sont instanciées — `const page =
  // $('view')` vient soixante lignes plus bas dans `main.js`. Le destructurer
  // fige la valeur du moment, c'est-à-dire `undefined`, et la vue se rend dans
  // le vide : fil d'Ariane correct, écran blanc, aucune erreur au build ni aux
  // tests. Vécu le 2026-08-02, attrapé par une capture d'écran, par rien d'autre.
  // Les skins y échappent en étant RÉSOLUS au boot ; les apps le sont à l'import.
  const { esc, crumbs, headers } = api;

  /* Trente jours de commits en une courbe de 118 px. Les couleurs sont des
     jetons : la courbe suit la charte du corps sans rien savoir de lui. */
  function spark(days) {
    const max = Math.max(1, ...days), n = days.length;
    const pt = (i) => [2 + (i * (SPARK_W - 4)) / (n - 1), SPARK_H - 3 - (days[i] / max) * (SPARK_H - 8)];
    const line = days.map((_, i) => pt(i).map((v) => v.toFixed(1)).join(' ')).join(' L ');
    const [lx, ly] = pt(n - 1);
    return `<svg class="spark" width="${SPARK_W}" height="${SPARK_H}" viewBox="0 0 ${SPARK_W} ${SPARK_H}"
      role="img" aria-label="Activité des commits sur ${n} jours, maximum ${max} par jour">
      <path d="M ${line} L ${lx.toFixed(1)} ${SPARK_H} L 2 ${SPARK_H} Z" fill="var(--accent-lo)"/>
      <path d="M ${line}" fill="none" stroke="var(--accent)" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="var(--accent)"/>
    </svg>`;
  }

  function ageFr(iso) {
    if (!iso) return '—';
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d <= 0) return "aujourd'hui";
    if (d === 1) return 'hier';
    if (d < 31) return `il y a ${d} j`;
    return `il y a ${Math.round(d / 30)} mois`;
  }

  async function render() {
    crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'La flotte', hash: '#/repos' }]);
    api.page.innerHTML = '<div class="hud"><div class="hudempty">Scan de la flotte…</div></div>';
    let d;
    try {
      const r = await fetch('/api/repos', { headers: headers(false), cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      d = await r.json();
    } catch (e) {
      api.page.innerHTML = `<div class="hud"><div class="hudempty">Flotte injoignable (${esc(String(e))}).</div></div>`;
      return;
    }
    if (!d.total) {
      api.page.innerHTML = `<div class="hud"><div class="hudempty">Aucun dépôt cloné sous
        <code>${esc(d.racine)}</code>. La flotte se peuple à la demande — dites-le-moi et je clone
        ce que décrit <code>repos.yml</code>.</div></div>`;
      return;
    }

    const cards = d.repos.map((c) => {
      const shown = c.etapes.slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join('');
      const rest = c.etapes.length > 3
        ? `<li class="more">+ ${c.etapes.length - 3} autre${c.etapes.length - 3 > 1 ? 's' : ''}</li>` : '';
      const dot = !c.fiche ? 'off' : c.etapes.length ? 'live' : 'calm';
      // La couleur ne dit JAMAIS l'information seule : amber↔vert tombe à ΔE 8
      // en protanopie, donc chaque pastille porte son libellé écrit.
      const pills = [
        c.cockpit ? '<span class="pc amb">cockpit</span>' : '',
        c.etapes.length ? `<span class="pc hot">${c.etapes.length} à traiter</span>` : '',
        c.fiche ? '' : '<span class="pc">sans fiche</span>',
        c.sale ? '<span class="pc amb">clone modifié</span>' : '',
        c.branche && c.branche !== 'main' ? `<span class="pc">${esc(c.branche)}</span>` : '',
      ].filter(Boolean).join('');
      return `<article class="repo${c.fiche ? '' : ' void'}">
        <header><span class="dot ${dot}"></span><h3>${esc(c.nom)}</h3>
          <span class="age">${esc(ageFr(c.dernier))}</span></header>
        <p class="etat">${c.fiche
          ? esc(c.etat.slice(0, 240))
          : "Aucune fiche de statut. Jamais touché depuis que la norme existe — pas de rétro-doc, "
            + "donc rien à afficher, et rien à reprocher."}</p>
        <div class="telemetry"><div><div class="metalab">Activité · 30 j</div>${spark(c.activite)}</div></div>
        ${shown ? `<ul class="next">${shown}${rest}</ul>` : ''}
        <footer>${pills}</footer>
      </article>`;
    }).join('');

    api.page.innerHTML = `<div class="hud">
      <h2 class="hudh2">Le tableau de bord</h2>
      <p class="hudlede">Un scan des <code>.agent/status.md</code> des clones locaux : l'état en une
        ligne, l'activité des trente derniers jours, et ce qui attend un geste. Les dépôts sans fiche
        ne sont pas en retard — ils n'ont jamais été touchés, et la grille le dit au lieu de le taire.</p>
      <section class="panel">
        <div class="ruler"></div>
        <div class="fleetbar">
          <span class="metric"><b>${d.total}</b><span>dépôts</span></span>
          <span class="metric"><b>${d.avec_fiche}</b><span>fiches</span></span>
          <span class="metric attn"><b>${d.en_attente}</b><span>attendent un geste</span></span>
          <span class="metric"><b>${d.total - d.avec_fiche}</b><span>jamais touchés</span></span>
        </div>
        <div class="fleet">${cards}</div>
      </section>
    </div>`;
  }

  return { routes: { repos: render } };
}
