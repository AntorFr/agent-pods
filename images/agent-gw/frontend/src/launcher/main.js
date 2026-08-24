// Alfred — launcher shell (nouvelle UI, passe 1).
// Bundlé par esbuild -> launcher.js. Réutilise le moteur de fiches (window.Alfred,
// engine.js chargé avant) et marked/DOMPurify (vendors) pour le chat, comme l'ancienne UI.
// Sert à /app en parallèle de / (ancienne UI) le temps de la migration.
import './launcher.css';
// APRÈS launcher.css : les feuilles des skins, inertes tant que `data-agent`
// n'est pas posé sur <html>. L'ordre source tranche les égalités de spécificité
// avec les règles `:root[data-theme]` du socle.
import './skins/themes.generated.js';
import { resolveSkin } from './skins/index.js';
// Les app-modules qui ont déjà quitté ce fichier. Chaque app importe SA feuille,
// donc leur CSS arrive après `launcher.css` : une app s'appuie sur les
// primitives de la coque, jamais l'inverse.
import { resolveApps, appTiles } from './apps/index.js';
import { FABRIQUES as CHROME_PLUGINS } from './chrome.generated.js';
// Le socle atelier 3.0 : conversion des vieux livres au chargement, géométrie et règles
// partagées avec le CLI valide/migre — UNE source (cf. plugins/atelier/ATELIER-3.md).

const $ = (id) => document.getElementById(id);
const mqMobile = window.matchMedia('(max-width: 820px)'); // seuil deux-écrans, aligné sur launcher.css
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Statut de frontmatter -> classe de pastille (.stat). Tolérant, défaut = accent.
const sc = (s) => ({
  'en cours': 'encours', 'en-cours': 'encours', 'encours': 'encours',
  'bloqué': 'bloque', 'bloque': 'bloque', 'en attente': 'bloque',
  'clos': 'clos', 'fait': 'clos', 'terminé': 'clos', 'choix fait': 'clos', 'décidé': 'clos',
  'réalisé': 'clos', 'realise': 'clos',
  'idée': 'idee', 'idee': 'idee', 'en réflexion': 'idee', 'réflexion': 'idee',
  'acheté': 'achete', 'achete': 'achete', 'offert': 'offert',
  'à acheter': 'aacheter', 'a acheter': 'aacheter',
  'veille': 'veille', 'référence retenue': 'veille', 'reference retenue': 'veille',
}[String(s || '').toLowerCase().trim()] || 'encours');
// Statut TERMINAL → la carte est « archivée » : elle sort de la grille des vivantes pour la
// section Archive repliée en bas de page. `clos` (et ses synonymes) l'est partout, `offert`
// aussi ; `acheté` ne l'est que pour un achat — un cadeau acheté reste à offrir, donc vivant.
const isArchived = (fm) => {
  const k = sc((fm || {}).status);
  return k === 'clos' || k === 'offert' || (k === 'achete' && (fm || {}).type === 'achat');
};

/* ── Auth ────────────────────────────────────────────────────────── */
let token = localStorage.getItem('gw_token') || '';
let oidcEnabled = false;
fetch('/api/auth/config').then((r) => r.json()).then((c) => { oidcEnabled = c.oidcEnabled; }).catch(() => {});
function headers(json) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  if (!oidcEnabled && token) h['Authorization'] = 'Bearer ' + token;
  return h;
}
function onUnauthorized() { if (oidcEnabled) { window.location = '/auth/login'; return true; } return false; }
async function askToken() { token = prompt('Jeton d’accès :') || ''; localStorage.setItem('gw_token', token); }

/* ── Thème ───────────────────────────────────────────────────────── */
const savedTheme = localStorage.getItem('gw_theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
function toggleTheme() {
  const cur = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('gw_theme', next);
}
$('theme').addEventListener('click', toggleTheme);

/* ── Markdown (chat + liens mémoire) — porté de l'ancienne UI ─────── */
marked.setOptions({ gfm: true, breaks: true });
const MD_EXT = /\.md$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|heic|heif)$/i;
function normPath(p) {
  const out = [];
  for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); }
  return out.join('/');
}
function renderMd(mdText, baseDir) {
  const src = mdText.replace(/\[\[([^\]]+)\]\]/g, (_, t) => `[${t.trim()}](/mem/${t.trim()})`);
  const el = document.createElement('div');
  el.className = 'md';
  el.innerHTML = DOMPurify.sanitize(marked.parse(src));
  el.querySelectorAll('img').forEach((img) => {
    const s = img.getAttribute('src') || '';
    if (s.startsWith('/mem/')) img.src = '/api/memory/raw/' + normPath(s.slice(5));
    else if (!/^[a-z]+:/i.test(s) && !s.startsWith('/')) img.src = '/api/memory/raw/' + normPath(baseDir + '/' + s);
    img.loading = 'lazy';
  });
  el.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    let target = null;
    if (href.startsWith('/mem/')) target = decodeURI(href.slice(5));
    else if (!/^[a-z]+:/i.test(href) && !href.startsWith('/') && !href.startsWith('#')) target = baseDir + '/' + decodeURI(href);
    if (target !== null) {
      target = normPath(target);
      if (!/\.[a-z0-9]+$/i.test(target)) target += '.md';
      a.href = '#'; a.dataset.mem = target;
    } else if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
  });
  return el;
}
// N'importe quel lien mémoire (data-mem ou [[wikilink]] rendu en /mem/) ouvre la fiche.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-mem], a[href^="/mem/"]');
  if (!a) return;
  e.preventDefault();
  let t = a.dataset.mem || decodeURIComponent(a.getAttribute('href').slice(5));
  if (t && !/\.[a-z0-9]+$/i.test(t)) t += '.md';
  location.hash = '#/mem/' + t;
});
// Façade vidéo YouTube (moteur, blocks.js) : clic/Entrée charge l'iframe — jamais avant.
function playEmbed(el) {
  const id = el.dataset.yt; if (!id) return;
  el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
}
document.addEventListener('click', (e) => { const el = e.target.closest('.ytembed[data-yt]'); if (el) playEmbed(el); });
document.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const el = e.target.closest?.('.ytembed[data-yt]'); if (el) { e.preventDefault(); playEmbed(el); } });

/* ── Chat ────────────────────────────────────────────────────────── */
const chat = $('chat'), input = $('input'), status = $('rail-status'), modelSel = $('model');
const BUB = { agent: 'al', user: 'me', error: 'err' };
function add(cls, text, eph) {
  const el = document.createElement('div');
  el.className = 'bub ' + (BUB[cls] || cls) + (eph ? ' eph' : '');
  if (cls === 'agent') el.appendChild(renderMd(text, '')); else el.textContent = text;
  chat.appendChild(el); chat.scrollTop = chat.scrollHeight; return el;
}
/* Trace d'outils — ce que l'agent TOUCHE, pas ce qu'il raconte. Les appels
   consécutifs se groupent dans un seul bloc replié sous leur compte ; un message
   texte referme le groupe en cours. Vivant seulement : le serveur ne rejoue pas
   la trace dans /api/history, elle disparaît au rechargement (témoin d'exécution,
   pas archive). N'apparaît que si le pod émet des events `tool` (GW_TRACE). */
let curTrace = null;
function addTool(name, target) {
  if (!curTrace || !curTrace.isConnected) {
    curTrace = document.createElement('div');
    curTrace.className = 'trace';
    curTrace.innerHTML = '<div class="th"><b>1 outil</b></div><ol></ol>';
    chat.appendChild(curTrace);
  }
  const ol = curTrace.querySelector('ol');
  const li = document.createElement('li');
  const t = document.createElement('span'); t.className = 'tool'; t.textContent = name;
  li.appendChild(t);
  if (target) { const g = document.createElement('span'); g.textContent = target; li.appendChild(g); }
  ol.appendChild(li);
  const n = ol.children.length;
  curTrace.querySelector('.th b').textContent = n + ' outil' + (n > 1 ? 's' : '');
  chat.scrollTop = chat.scrollHeight;
}

/* Témoin de travail : le skin peut fournir son propre nœud (le noyau de Skippy)
   avec un libellé ; sans skin, ce sont les trois points historiques. */
function addTyping() {
  const el = document.createElement('div'); el.className = 'bub al';
  const node = SKIN.busyNode && SKIN.busyNode();
  if (node) {
    el.classList.add('working');
    el.appendChild(node);
    if (SKIN.busyLabel) {
      const lab = document.createElement('span');
      lab.className = 'wt'; lab.textContent = SKIN.busyLabel;
      el.appendChild(lab);
    }
  } else {
    el.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  }
  chat.appendChild(el); chat.scrollTop = chat.scrollHeight; return el;
}
const savedModel = localStorage.getItem('gw_model') || '';
modelSel.add(new Option('Auto', ''));
fetch('/api/models').then((r) => r.json()).then(({ models }) => {
  for (const m of models) modelSel.add(new Option(m.label, m.id));
  if ([...modelSel.options].some((o) => o.value === savedModel)) modelSel.value = savedModel;
}).catch(() => {});
modelSel.addEventListener('change', () => localStorage.setItem('gw_model', modelSel.value));

let busy = false;
// Mode éphémère ⚡ : la parenthèse jetable. Tant que le toggle est actif, les
// tours tournent hors conversation principale (pas de resume du pointeur, pas
// de sauvegarde) ; l'id de la parenthèse ne vit qu'en RAM — recharger la page
// ou couper le toggle la referme.
let ephOn = false, ephSession = null;
const queue = [];
const queuedEl = $('queued');
function renderQueued() {
  queuedEl.innerHTML = '';
  for (const q of queue) { const c = document.createElement('div'); c.className = 'qc'; c.textContent = q.text || `📎 ${q.atts.length} fichier${q.atts.length > 1 ? 's' : ''}`; queuedEl.appendChild(c); }
}
function submitText(text, atts) { if (busy) { queue.push({ text, atts: atts || [] }); renderQueued(); return; } sendMessage(text, undefined, atts); }

/* ── Pièces jointes ──────────────────────────────────────────────── */
// Sélectionnées côté client (picker 📎, glisser-déposer, coller), montrées en
// vignettes avant l'envoi ; poussées à /api/upload au moment de l'envoi, puis
// leurs ids voyagent dans le corps de /api/chat. Miroir des limites serveur.
const MAX_ATTS = 8, MAX_ATT_BYTES = 25 * 1024 * 1024;
const attsEl = $('atts'), fileInput = $('fileinput');
let pendingAtts = []; // { file, name, kind, url? }
function attKind(f) { return (/^image\//.test(f.type) || IMG_EXT.test(f.name)) ? 'image' : 'file'; }
function attExt(name) { return (name.includes('.') ? name.split('.').pop() : '?').slice(0, 4).toUpperCase(); }
function addFiles(fileList) {
  for (const f of fileList) {
    if (pendingAtts.length >= MAX_ATTS) { add('error', `Maximum ${MAX_ATTS} fichiers par message.`); break; }
    if (f.size > MAX_ATT_BYTES) { add('error', `« ${f.name} » dépasse 25 Mo.`); continue; }
    const kind = attKind(f);
    pendingAtts.push({ file: f, name: f.name, kind, url: kind === 'image' ? URL.createObjectURL(f) : null });
  }
  renderAtts();
}
function renderAtts() {
  attsEl.innerHTML = '';
  pendingAtts.forEach((a, i) => {
    const c = document.createElement('div'); c.className = 'att';
    c.innerHTML = (a.url ? `<img src="${a.url}" alt="">` : `<span class="ext">${attExt(a.name)}</span>`)
      + `<span class="an" title="${esc(a.name)}">${esc(a.name)}</span><button class="ax" type="button" title="Retirer">✕</button>`;
    c.querySelector('.ax').addEventListener('click', () => { if (a.url) URL.revokeObjectURL(a.url); pendingAtts.splice(i, 1); renderAtts(); });
    attsEl.appendChild(c);
  });
  syncSend();   // une pièce jointe en attente rend son rôle d'envoi au bouton
}
// Bulle utilisateur avec, optionnellement, une rangée de vignettes jointes.
function addUser(text, eph, atts) {
  const el = document.createElement('div');
  el.className = 'bub me' + (eph ? ' eph' : '');
  if (text) el.textContent = text;
  if (atts && atts.length) {
    const row = document.createElement('div'); row.className = 'batts';
    for (const a of atts) {
      const t = document.createElement('span'); t.className = 'batt'; t.title = a.name;
      t.innerHTML = a.url ? `<img src="${a.url}" alt="">` : `<span class="ext">${attExt(a.name)}</span>`;
      row.appendChild(t);
    }
    el.appendChild(row);
  }
  chat.appendChild(el); chat.scrollTop = chat.scrollHeight; return el;
}

/* ── Envoyer / Arrêter — un seul bouton ──────────────────────────────
   Usage établi : pendant qu'un tour tourne ET que le composer est vide, le
   bouton d'envoi devient un bouton d'arrêt. La condition « composer vide » est
   ce qui rend la bascule sans risque — dès qu'il y a du texte ou une pièce
   jointe, l'envoi reprend la main et rien n'est jamais avalé.
   La file d'attente, elle, n'est PAS vidée : arrêter le tour en cours n'annule
   pas ce qu'on a demandé ensuite. */
const sendBtn = $('send');
const stopMode = () => busy && !input.value.trim() && !pendingAtts.length;
function syncSend() {
  const stop = stopMode();
  sendBtn.classList.toggle('stop', stop);
  sendBtn.textContent = stop ? '■' : '↑';
  sendBtn.title = stop ? 'Arrêter le tour en cours' : 'Envoyer';
  sendBtn.setAttribute('aria-label', sendBtn.title);
}
// Le clic précède le submit : preventDefault ici suffit à ne pas envoyer.
sendBtn.addEventListener('click', (e) => {
  if (!stopMode()) return;
  e.preventDefault();
  sendBtn.disabled = true;
  // Le tour se termine de lui-même après le signal (avec son `done`) : c'est
  // `finally` dans sendMessage qui rendra la main, pas cet appel.
  fetch('/api/chat/stop', { method: 'POST', headers: headers(false) })
    .catch(() => {})
    .finally(() => { sendBtn.disabled = false; });
});

async function sendMessage(text, forceEph, atts) {
  const eph = forceEph !== undefined ? forceEph : ephOn;
  busy = true;
  syncSend();
  addUser(text, eph, atts);
  const pending = addTyping();
  status.classList.add('busy'); status.title = 'Alfred travaille…';
  try {
    let attIds = [];
    if (atts && atts.length) {
      // Poser les fichiers d'abord ; on ne lance le tour qu'avec leurs ids.
      const fd = new FormData();
      for (const a of atts) fd.append('files', a.file, a.name);
      const up = await fetch('/api/upload', { method: 'POST', headers: headers(false), body: fd });
      if (up.status === 401) { pending.remove(); if (!onUnauthorized()) await askToken(); return; }
      if (!up.ok) throw new Error((await up.json().catch(() => ({}))).detail || 'échec de l’envoi des fichiers');
      attIds = (await up.json()).files.map((f) => f.id);
    }
    let res;
    const deadline = Date.now() + 180000;
    while (true) {
      res = await fetch('/api/chat', { method: 'POST', headers: headers(true), body: JSON.stringify({ message: text, model: modelSel.value || undefined, ephemeral: eph || undefined, ephemeral_session: (eph && ephSession) || undefined, attachments: attIds.length ? attIds : undefined, vue: currentView() }) });
      if (res.status !== 409) break;
      if (Date.now() > deadline) throw new Error('Alfred est occupé depuis un moment — réessayez.');
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (res.status === 401) { pending.remove(); if (!onUnauthorized()) await askToken(); return; }
    if (!res.ok) throw new Error((await res.json()).detail || res.status);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const ev = /^event: (.*)$/m.exec(raw)?.[1];
        const data = JSON.parse(/^data: (.*)$/m.exec(raw)?.[1] || '{}');
        if (ev === 'text') { curTrace = null; add('agent', data.text, eph); chat.appendChild(pending); chat.scrollTop = chat.scrollHeight; }
        else if (ev === 'tool') { addTool(data.name, data.target); chat.appendChild(pending); chat.scrollTop = chat.scrollHeight; }
        else if (ev === 'error') add('error', data.message);
        else if (ev === 'done') { if (data.ephemeral) ephSession = data.session_id; else { refreshSession(); syncHistoryLen(); } }
      }
    }
    if (currentRoute().startsWith('dom/') || currentRoute().startsWith('voyage') || currentRoute() === '') { memIndex = null; wbCache = null; loadTreeThen(renderRoute); } // l'agent a pu écrire
  } catch (e) {
    add('error', String(e));
    if (!eph) pollResyncHistory();   // le serveur a peut-être fini la réponse malgré la coupure — on la récupère sans reload
  } finally {
    pending.remove();
    curTrace = null;   // le tour est clos : le prochain appel d'outil ouvre un groupe neuf
    status.classList.remove('busy'); status.title = 'Alfred est au repos';
    busy = false;
    syncSend();
    syncConfirm();
    flushQueue();
  }
}

// Rattrapage groupé : les messages tapés pendant qu'Alfred travaillait sont
// fusionnés en UN seul tour (au lieu d'un tour par message) — les textes se
// recollent en paragraphes, les pièces jointes se concatènent, dans l'ordre.
// Appelé à la fin d'un tour QU'ON A MENÉ, mais aussi à la fin d'un tour repris
// après rechargement (adoptRunningTurn) : dans les deux cas la file doit partir.
function flushQueue() {
  if (!queue.length) return;
  const batch = queue.splice(0);
  renderQueued();
  const text = batch.map((q) => q.text).filter(Boolean).join('\n\n');
  const atts = batch.flatMap((q) => q.atts);
  sendMessage(text, undefined, atts);
}
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  const atts = pendingAtts;
  if (!text && !atts.length) return;
  input.value = ''; input.style.height = 'auto';
  $('composer').classList.remove('filled');   // le champ se vide sans event `input`
  pendingAtts = []; renderAtts();
  submitText(text, atts);
});
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); } });
input.addEventListener('input', () => {
  input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  // `.filled` masque le curseur-bloc du thème dès qu'il y a du texte : sinon il
  // doublerait le vrai caret du système. Le focus, lui, est géré en CSS (:focus-within).
  $('composer').classList.toggle('filled', input.value.length > 0);
  syncSend();   // taper pendant un tour rend son rôle d'envoi au bouton
});

/* ── Joindre : picker 📎, coller, glisser-déposer ────────────────── */
$('attach').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files.length) addFiles(fileInput.files); fileInput.value = ''; });
input.addEventListener('paste', (e) => {
  if (!featureOn('attach')) return;      // capacité éteinte : coller reste du texte
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); }
});
// Glisser-déposer sur la colonne de chat (desktop ; les navigateurs mobiles
// n'ont pas de DnD vers le DOM — d'où le picker 📎 qui, lui, marche partout).
// On ne réagit qu'à un glissé de FICHIERS ('Files') : les cartes de voyage se
// glissent en 'text/plain' et ne doivent pas déclencher l'overlay.
const chatPane = document.querySelector('.chat'), dropzone = $('dropzone');
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
// `takesFiles` = « ce corps accepte-t-il un dépôt ? ». Point de passage unique des
// quatre gestes de glisser-déposer : la capacité s'éteint ici, pas bouton par bouton.
// La garde de navigation en bas de bloc, elle, reste INCONDITIONNELLE — même sans
// pièces jointes, un fichier lâché par erreur ne doit jamais faire quitter la session.
const takesFiles = (e) => featureOn('attach') && hasFiles(e);
let dragDepth = 0;
chatPane.addEventListener('dragenter', (e) => { if (!takesFiles(e)) return; e.preventDefault(); dragDepth++; dropzone.classList.add('on'); });
chatPane.addEventListener('dragover', (e) => { if (takesFiles(e)) e.preventDefault(); });
chatPane.addEventListener('dragleave', (e) => { if (!takesFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropzone.classList.remove('on'); });
chatPane.addEventListener('drop', (e) => { if (!takesFiles(e)) return; e.preventDefault(); dragDepth = 0; dropzone.classList.remove('on'); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
// Un fichier lâché hors de la zone ne doit pas faire naviguer le navigateur.
['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { if (hasFiles(e) && !e.target?.closest?.('.chat')) e.preventDefault(); }));
$('reset').addEventListener('click', async () => {
  if (!confirm('Repartir sur une session vierge (sans consolidation) ?')) return;
  await fetch('/api/reset', { method: 'POST', headers: headers(false) });
  chat.innerHTML = ''; queue.length = 0; renderQueued();
  ctxBtn.hidden = true;
});

/* ── Compteur de contexte (tokens) ───────────────────────────────── */
// Le poids affiché = input + cache du dernier appel API : ce que chaque
// nouveau message repaiera. C'est le signal « un reset s'impose ».
const ctxBtn = $('ctx');
const fmtTok = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));
async function refreshSession() {
  try {
    const r = await fetch('/api/session', { headers: headers(false), cache: 'no-store' });
    if (!r.ok) return;
    const s = await r.json();
    const n = s.active ? s.context_tokens : null;
    if (n == null) { ctxBtn.hidden = true; return; }
    ctxBtn.hidden = false;
    ctxBtn.textContent = fmtTok(n);
    ctxBtn.classList.toggle('warn', n >= 60000 && n < 120000);
    ctxBtn.classList.toggle('hot', n >= 120000);
    ctxBtn.title = `Poids du contexte : ${n.toLocaleString('fr-FR')} tokens, rejoués à chaque message. Au-delà, changez de sujet (▤) ou repartez à neuf (↺).`;
  } catch {}
}

// ── Réconciliation du transcript ─────────────────────────────────────
// Le SDK persiste la réponse même si le stream client casse (coupure réseau mobile) ou si
// l'onglet passe en arrière-plan. /api/history est la source de vérité ; on la rejoue sans
// reload. Pendant clientside du « rattrapage groupé » (sortant) : ici on rattrape l'ENTRANT.
let historyLen = 0;
function renderHistory(messages) {
  chat.innerHTML = '';
  for (const m of messages) add(m.role === 'user' ? 'user' : 'agent', m.text);
  historyLen = messages.length;
  chat.scrollTop = chat.scrollHeight;
}
async function resyncHistory() {          // re-rend SEULEMENT si le transcript a grandi
  try {
    const r = await fetch('/api/history', { headers: headers(false), cache: 'no-store' });
    if (!r.ok) return false;
    const { messages } = await r.json();
    if (messages.length <= historyLen) return false;
    renderHistory(messages);
    return true;
  } catch { return false; }
}
async function syncHistoryLen() {         // recale le compteur sans re-render (le stream a déjà affiché)
  try { const r = await fetch('/api/history', { headers: headers(false), cache: 'no-store' }); if (r.ok) historyLen = (await r.json()).messages.length; } catch {}
}
async function pollResyncHistory() {      // après coupure : la réponse peut encore se générer → on sonde
  for (let i = 0; i < 12; i++) { if (await resyncHistory()) return; await new Promise((r) => setTimeout(r, 2500)); }
}
window.addEventListener('online', resyncHistory);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resyncHistory(); });

/* ── Reprendre un tour en cours après un rechargement ────────────────
   Le flux SSE appartient à la requête POST /api/chat : F5 le tue, et `busy`
   n'est qu'une variable JS. Le TOUR, lui, survit — run_turn() est détachée à
   dessein. On ne perdait donc que le témoin… et accessoirement la réponse :
   resyncHistory() n'est branché que sur `visibilitychange`/`online`, jamais sur
   un simple rechargement, si bien que la page restait muette alors que la
   réponse était déjà écrite au transcript.
   On redemande l'état au corps. `chat_busy` et NON `busy` : ce dernier est le
   verrou global, vrai aussi pendant une planification ou un travail déposé par
   un autre agent — une bulle de frappe pour le briefing de 7 h serait fausse. */
async function health() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
async function adoptRunningTurn() {
  const h = await health();
  if (!h || !h.chat_busy) return;
  busy = true;
  const pending = addTyping();
  status.classList.add('busy'); status.title = 'Alfred travaille…';
  syncSend();   // un tour repris est un tour qu'on peut arrêter
  try {
    // Pas de limite haute : un tour long est un tour long. La sonde est un GET
    // public et sans état, la laisser tourner ne coûte rien au corps. Un corps
    // injoignable ne conclut RIEN — on retente, on ne déclare pas la fin.
    while (true) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await health();
      if (s && !s.chat_busy) break;
    }
  } finally {
    pending.remove();
    status.classList.remove('busy'); status.title = 'Alfred est au repos';
    busy = false;
    syncSend();
    await resyncHistory();   // la réponse est au transcript : on la pose
    refreshSession();
    flushQueue();
  }
}

/* ── Mode éphémère ⚡ ─────────────────────────────────────────────── */
const ephBtn = $('eph');
const PLACEHOLDER = input.getAttribute('placeholder');
function setEph(v) {
  ephOn = v;
  if (!v) ephSession = null; // la parenthèse se referme
  ephBtn.classList.toggle('on', v);
  input.placeholder = v ? 'Question éphémère — rien ne sera retenu…' : PLACEHOLDER;
  updateMoreFlag();
}
ephBtn.addEventListener('click', () => setEph(!ephOn));

/* ── Sujets : reprendre un fil ───────────────────────────────────── */
// La « compaction UX » : consolider la conversation dans memory/ (si elle a un
// contenu), repartir sur une session vierge, recharger la fiche du sujet. La
// reprise passe par la mémoire, jamais par un vieux transcript (D5).
const sujModal = $('sujets-modal'), sujBody = $('sujets-body');
function closeSujets() { sujModal.hidden = true; }
$('sujets-close').addEventListener('click', closeSujets);
sujModal.addEventListener('click', (e) => { if (e.target === sujModal) closeSujets(); });
$('sujets').addEventListener('click', openSujets);

async function listSujets() {
  await loadTree(); await loadIndex();
  // sujets/INDEX.md — la table qu'Alfred discipline : titre, date, accroche.
  const meta = new Map();
  try {
    const r = await fetch('/api/memory/raw/sujets/INDEX.md', { headers: headers(false), cache: 'no-store' });
    if (r.ok) {
      for (const line of (await r.text()).split('\n')) {
        const m = line.match(/^\|\s*(.+?)\s*\|\s*\[.*?\]\((.+?\.md)\)\s*\|\s*(\S*)\s*\|\s*(.*?)\s*\|/);
        if (m) meta.set('sujets/' + m[2], { titre: m[1], date: m[3], accroche: m[4] });
      }
    }
  } catch {}
  const files = (memInfo?.entries || []).filter((e) => !e.dir && e.path.startsWith('sujets/') && isFiche(e.path));
  return files.map(({ path }) => {
    const m = meta.get(path) || {};
    const fm = memIndex.get(path) || {};
    return { path, titre: m.titre || fm.titre || prettify(path.split('/').pop()), date: m.date || '', accroche: m.accroche || '' };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.titre.localeCompare(b.titre, 'fr'));
}

async function openSujets() {
  sujModal.hidden = false;
  sujBody.innerHTML = '<div class="row">chargement…</div>';
  const items = await listSujets();
  if (!items.length) { sujBody.innerHTML = '<div class="row">Aucun sujet en cours.</div>'; return; }
  const box = document.createElement('div'); box.className = 'sujlist';
  for (const it of items) {
    const row = document.createElement('div'); row.className = 'suj'; row.setAttribute('role', 'button'); row.tabIndex = 0;
    row.innerHTML = `<span class="body"><span class="st1"><b>${esc(it.titre)}</b>${it.date ? `<span class="when">${esc(it.date)}</span>` : ''}</span>${it.accroche ? `<span class="hook">${esc(it.accroche)}</span>` : ''}</span>`;
    const arch = document.createElement('button'); arch.type = 'button'; arch.className = 'arch';
    arch.title = `Archiver « ${it.titre} »`; arch.textContent = '🗄';
    arch.addEventListener('click', (e) => { e.stopPropagation(); archiveSujet(it); });
    row.appendChild(arch);
    row.addEventListener('click', () => switchSujet(it));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchSujet(it); } });
    box.appendChild(row);
  }
  sujBody.innerHTML = ''; sujBody.appendChild(box);
}

async function consolidateThenReset() {
  // Consolider seulement s'il y a une vraie conversation (les bulles ⚡ ne
  // comptent pas : la parenthèse éphémère n'a rien à consigner).
  if (chat.querySelector('.bub:not(.eph)')) {
    await sendMessage('Avant de tourner la page : consolide dans memory/ ce qui doit survivre de cette conversation (fiches, todo, index concernés), puis confirme en une ligne.', false);
  }
  await fetch('/api/reset', { method: 'POST', headers: headers(false) });
  chat.innerHTML = ''; queue.length = 0; renderQueued();
  ctxBtn.hidden = true;
}

async function switchSujet(it) {
  if (busy) return;
  closeSujets();
  setEph(false);
  await consolidateThenReset();
  submitText(`Reprenons le sujet « ${it.titre} » (memory/${it.path}). Relis la fiche et fais-moi un point de reprise bref : où on en est, prochaine étape.`);
}

// L'archivage est un GESTE D'AGENT (skill archivage : distiller, ranger,
// index, commit) — le front ne déplace jamais le fichier lui-même. Tour
// normal dans la conversation courante, pas de reset.
function archiveSujet(it) {
  if (busy) return;
  if (!confirm(`Archiver « ${it.titre} » ? Alfred distille ce qui doit survivre, puis range le sujet dans l'archive.`)) return;
  closeSujets();
  setEph(false);
  submitText(`Archive le sujet « ${it.titre} » (memory/${it.path}) : distille ce qui doit survivre (todo, domaines), déplace la fiche dans sujets/archive/ et mets à jour les index.`);
}

$('sujets-fresh').addEventListener('click', async () => {
  if (busy) return;
  closeSujets();
  await consolidateThenReset();
});

/* ── Bouclier (actions sensibles) ────────────────────────────────── */
const shield = $('shield');
let confTimer = null, confPoll = null;
function paintConfirm(remaining) {
  clearInterval(confTimer);
  if (remaining <= 0) { shield.classList.remove('armed'); shield.textContent = '🛡'; updateMoreFlag(); clearInterval(confPoll); confPoll = null; return; }
  shield.classList.add('armed'); updateMoreFlag();
  let left = remaining; shield.textContent = left;
  confTimer = setInterval(() => { left -= 1; if (left <= 0) paintConfirm(0); else shield.textContent = left; }, 1000);
  if (!confPoll) confPoll = setInterval(syncConfirm, 4000);
}
async function syncConfirm() {
  try { const res = await fetch('/api/confirm', { headers: headers(false), cache: 'no-store' }); if (!res.ok) return; const s = await res.json(); paintConfirm(s.armed ? s.remaining : 0); } catch {}
}
shield.addEventListener('click', async () => {
  try { const res = await fetch('/api/confirm', { method: 'POST', headers: headers(false) }); if (res.status === 401) { onUnauthorized(); return; } const s = await res.json(); paintConfirm(s.remaining || 0); } catch {}
});

/* ── Feature 1 : repli mobile des actions (🛡 ⚡ 📎) sous « + » ────── */
// Les trois boutons restent en place (leurs listeners par id sont intacts) ; en
// mobile le CSS les cache et les rouvre en popover quand .compose est .more-open.
// La pastille du « + » signale qu'un mode non-défaut est armé (bouclier ou éphémère).
const moreBtn = $('more'), composerEl = $('composer'), moretrayEl = $('moretray');
function closeMore() { composerEl.classList.remove('more-open'); moreBtn.setAttribute('aria-expanded', 'false'); }
function updateMoreFlag() { moreBtn.classList.toggle('flag', ephOn || shield.classList.contains('armed')); }
moreBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !composerEl.classList.contains('more-open');
  composerEl.classList.toggle('more-open', open);
  moreBtn.setAttribute('aria-expanded', String(open));
});
moretrayEl.addEventListener('click', closeMore); // choisir une action referme le popover
document.addEventListener('click', (e) => {
  if (!composerEl.classList.contains('more-open')) return;
  if (e.target.closest('#more') || e.target.closest('#moretray')) return;
  closeMore();
});
updateMoreFlag();

/* ── Feature 3 : swipe mobile deux-écrans (chat ⇆ apps) ──────────── */
// La piste translateX vit en CSS (#shell 200vw, canvas-open = écran apps). Ici on
// suit le doigt sur les gestes franchement horizontaux, puis on cale sur un écran.
const shellEl = $('shell');
function showPane(apps) { document.body.classList.toggle('canvas-open', apps); }
$('toapps').addEventListener('click', () => showPane(true));
$('tochat').addEventListener('click', () => showPane(false));
let sw = null; // geste en cours : { x0, y0, base, dir, x }
const SWIPE_GUARD = 'textarea, input, select, .cutwrap, .vcard, .traycard, #more, #moretray';
shellEl.addEventListener('touchstart', (e) => {
  if (!mqMobile.matches || e.touches.length !== 1 || e.target.closest(SWIPE_GUARD)) { sw = null; return; }
  const t = e.touches[0];
  sw = { x0: t.clientX, y0: t.clientY, base: document.body.classList.contains('canvas-open') ? -window.innerWidth : 0, dir: 0, x: 0 };
}, { passive: true });
shellEl.addEventListener('touchmove', (e) => {
  if (!sw) return;
  const t = e.touches[0];
  const dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
  if (sw.dir === 0) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    sw.dir = Math.abs(dx) > Math.abs(dy) * 1.3 ? 1 : -1; // 1 = horizontal (on prend), -1 = vertical (on lâche le scroll)
    if (sw.dir === 1) shellEl.classList.add('swiping');
  }
  if (sw.dir !== 1) return;
  e.preventDefault(); // geste horizontal tenu : pas de scroll parasite
  sw.x = Math.max(-window.innerWidth, Math.min(0, sw.base + dx));
  shellEl.style.transform = `translateX(${sw.x}px)`;
}, { passive: false });
function endSwipe() {
  if (!sw) return;
  const horizontal = sw.dir === 1, x = sw.x, base = sw.base;
  sw = null;
  if (!horizontal) return;
  shellEl.classList.remove('swiping'); // réactive la transition pour l'anim de calage
  const w = window.innerWidth;
  // Bascule si on a franchi 28 % depuis l'écran de départ (sinon retour à l'écran d'origine).
  const apps = base === 0 ? (-x) > w * 0.28 : (-x) > w * 0.72;
  const target = apps ? -w : 0;
  requestAnimationFrame(() => { shellEl.style.transform = `translateX(${target}px)`; });
  showPane(apps);
  // Calé : on rend la main au CSS (translateX(-50%)) pour survivre aux rotations/resize.
  setTimeout(() => { if (shellEl.style.transform === `translateX(${target}px)`) shellEl.style.transform = ''; }, 320);
}
shellEl.addEventListener('touchend', endSwipe);
shellEl.addEventListener('touchcancel', endSwipe);

/* ── Rail redimensionnable ───────────────────────────────────────── */
const shell = $('shell'), gutter = $('gutter');
const savedRail = localStorage.getItem('gw_rail');
if (savedRail) document.documentElement.style.setProperty('--rail', savedRail);
let dragging = false;
gutter.addEventListener('mousedown', (e) => { dragging = true; gutter.classList.add('drag'); document.body.style.userSelect = 'none'; e.preventDefault(); });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const w = Math.max(280, Math.min(e.clientX, window.innerWidth * 0.6));
  const pct = (w / window.innerWidth * 100).toFixed(1) + '%';
  document.documentElement.style.setProperty('--rail', pct);
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false; gutter.classList.remove('drag'); document.body.style.userSelect = '';
  localStorage.setItem('gw_rail', getComputedStyle(document.documentElement).getPropertyValue('--rail').trim());
});

/* ── Registre des apps ───────────────────────────────────────────── */
// Couleur + glyphe des MODULES du lanceur (ceux qui n'ont pas de dossier de
// mémoire pour se décrire), et repli des domaines pas encore migrés. Un domaine
// se déclare lui-même : voir l'habillage déclaratif plus bas.
const IC = {
  todo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l4 4 12-12"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>',
};
const APP_META = {
  todo:     { label: 'Todo',       ico: IC.todo, color: 'todo', module: true },
  atelier:  { label: 'L’Atelier',  ico: IC.shop, color: 'shop', module: true },
  diy:      { label: 'L’Atelier',  ico: IC.shop, color: 'shop', module: true },
  maison:   { label: 'Maison',     ico: '🏡', color: 'maison' },
  piscine:  { label: 'Piscine',    ico: '💧', color: 'maison' },
  projets:  { label: 'Projets',    ico: '🗂️', color: 'proj' },
  cadeaux:  { label: 'Cadeaux',    ico: '🎁', color: 'cadeaux' },
  contacts: { label: 'Contacts',   ico: '👤', color: 'contacts' },
  cuisine:  { label: 'Cuisine',    ico: '🍳', color: 'cuisine' },
  achats:   { label: 'Achats',     ico: '🛍️', color: 'achats' },
  admin:    { label: 'Admin',      ico: '🗄️', color: 'search' },
  administratif: { label: 'Administratif', ico: '🗄️', color: 'search' },
  sujets:   { label: 'Sujets',     ico: '❯', color: 'agenda' },
  voyages:  { label: 'Voyages',    ico: '🌴', color: 'voyage', module: true },
  planif:   { label: 'Planifications', ico: '⏱', color: 'agenda', module: true },
};
// Les tuiles des vues de plugin, ramassées au build depuis leur `gw-plugin.json`.
// Elles ÉCRASENT le socle ci-dessus : un plugin qui reprend un id historique gagne,
// ce qui est le sens de la manœuvre — le plugin fait foi sur ce qu'il apporte.
/* Les tuiles des vues de plugin, ramassées au build depuis leur `gw-plugin.json`.
   Elles ÉCRASENT le socle : le plugin fait foi sur ce qu'il apporte.

   `ico` accepte un emoji OU `ic:<nom>`, qui désigne un glyphe SVG du socle. Sans
   cette indirection, une tuile déclarée dans un manifeste JSON ne pourrait porter
   qu'un emoji — et `atelier`, qui utilisait le glyphe `shop`, aurait perdu son
   dessin au passage. Un manifeste ne doit pas coûter une régression visuelle. */
for (const [id, t] of Object.entries(appTiles())) {
  const ico = typeof t.ico === 'string' && t.ico.startsWith('ic:') ? IC[t.ico.slice(3)] : t.ico;
  APP_META[id] = { ...t, ...(ico ? { ico } : {}) };
}
const COLORS = ['todo', 'shop', 'proj', 'agenda', 'maison', 'cuisine', 'achats', 'cadeaux', 'contacts', 'search'];

/* ── Habillage DÉCLARATIF d'un domaine ────────────────────────────────
   Un domaine porte sa propre identité dans le frontmatter de son INDEX.md :

     titre: Santé      le libellé affiché
     ico: ❤️            un emoji (les glyphes SVG restent réservés aux modules)
     couleur: rouge    un nom de la palette ci-dessous, PAS un code hexa

   Écrire un domaine suffit donc à l'habiller : plus besoin d'une ligne dans
   APP_META, donc plus besoin d'un redéploiement pour un emoji. APP_META ne reste
   que pour les MODULES du lanceur (todo, atelier, planif…), qui n'ont pas de
   dossier de mémoire pour parler d'eux — et comme repli des domaines pas encore
   migrés.

   POURQUOI UN NOM DE COULEUR ET PAS UN HEXA — deux raisons, aucune négociable :
   1. La palette est thémée. Chaque jeton a une valeur en clair ET en sombre, et
      un skin (`data-agent`) les repeint en bloc. Un hexa figé dans une fiche
      ignorerait les trois.
   2. `couleur` finit dans un attribut `style` : c'est une valeur d'origine
      MÉMOIRE, donc potentiellement dérivée d'un contenu non fiable (D17). Un
      vocabulaire FERMÉ est ce qui rend l'injection impossible — hors liste, on
      retombe sur le repli sans rien interpoler. */
const HUES = {
  rouge: 'todo', orange: 'cuisine', ambre: 'voyage', vert: 'diy',
  emeraude: 'shop', turquoise: 'achats', bleu: 'maison', indigo: 'proj',
  violet: 'agenda', rose: 'cadeaux', gris: 'contacts', ardoise: 'search',
};
// L'INDEX.md qui porte l'identité du domaine (`sujets` n'est pas sous domaines/).
const domIndexPath = (name) => (name === 'sujets' ? 'sujets/INDEX.md' : 'domaines/' + name + '/INDEX.md');

function metaFor(name) {
  const m = APP_META[name];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % COLORS.length;
  const base = m
    ? { label: m.label, ico: m.ico, color: m.color, module: !!m.module }
    : { label: prettify(name), ico: '◆', color: COLORS[h], module: false };

  // La déclaration du domaine prime, CHAMP PAR CHAMP : une fiche qui ne donne
  // qu'une icône garde le libellé et la couleur du repli.
  const fm = (memIndex && memIndex.get(domIndexPath(name))) || null;
  if (!fm) return base;
  if (fm.titre) base.label = fm.titre;
  // esc() obligatoire : contrairement aux glyphes d'APP_META (du SVG écrit ici),
  // `ico` vient d'un fichier et part en innerHTML.
  if (fm.ico) base.ico = esc(fm.ico);
  if (HUES[fm.couleur]) base.color = HUES[fm.couleur];
  return base;
}

/* ── Modules activés (GW_APPS) ───────────────────────────────────────
   Le corps est agent-agnostique, le lanceur ne l'était pas : ses tuiles et ses
   routes étaient câblées sur le monde d'un seul agent. `apps` vient du serveur
   (/api/version) et décide, par pod, ce qui existe — la tuile ET la route, pour
   qu'une URL en marque-page ne ressuscite pas un module éteint.
   Repli sur le jeu historique si l'appel échoue : un lanceur vide serait pire
   qu'un lanceur trop garni. */
const APPS_FALLBACK = ['todo', 'projets', 'atelier', 'planif', 'voyages'];
let APPS = new Set(APPS_FALLBACK);
function appOn(id) { return APPS.has(id); }

/* ── Racines de mémoire qui ne sont PAS des domaines ─────────────────
   `#/dom/<x>` se résout sous `domaines/<x>/` (cf. memPrefix). Or `todo/`,
   `planif/` et `home/` vivent à la RACINE de memory/ : un fil d'Ariane qui les
   envoyait sur `#/dom/…` menait à un domaine inexistant — page vide, titre seul.
   Celles qu'un module représente suivent SA route ; les autres n'ont pas de page,
   donc pas de lien du tout (un libellé inerte vaut mieux qu'un lien mort). */
const ROOT_ROUTE = { todo: '#/todo', planif: '#/planif' };
const rootHash = (seg) => (appOn(seg) && ROOT_ROUTE[seg]) || null;

/* ── Capacités de la coque (GW_FEATURES) ─────────────────────────────
   Le second axe : `apps` dit où l'on peut ALLER, `features` dit ce que le chat
   sait FAIRE. Un lecteur de code-barres n'a rien à faire chez un agent de code.

   On RETIRE du DOM, on ne masque pas — et ce n'est pas de la coquetterie : un
   nœud absent ne reçoit aucun événement, ne se retrouve pas au focus clavier, et
   ne peut pas déclencher le chargement paresseux d'un bundle (le décodeur de
   code-barres pèse 448 Ko). Un `display:none` laisserait les trois.

   Même discipline que les modules : ce qui ne passe pas par un bouton est gardé
   À LA SOURCE. Retirer 📎 sans toucher au coller ni au glisser-déposer laisserait
   deux portes d'entrée grandes ouvertes sur une capacité censée être éteinte.

   Le bouclier 🛡 n'est pas dans la liste, et ce n'est pas un oubli : c'est une
   garde, pas un composant (cf. le commentaire de `FEATURES` dans app/main.py). */
const FEATURES_FALLBACK = ['scan', 'attach', 'eph', 'tunnel', 'sujets'];
let FEATURES = new Set(FEATURES_FALLBACK);
function featureOn(id) { return FEATURES.has(id); }
function applyFeatures() {
  const drop = (id) => $(id)?.remove();
  if (!featureOn('attach')) { drop('attach'); drop('fileinput'); drop('dropzone'); }
  if (!featureOn('eph')) drop('eph');
  if (!featureOn('tunnel')) { drop('vsc'); drop('tunnel-modal'); }
  if (!featureOn('sujets')) drop('sujets');
}
/* ── Les EMPLACEMENTS de la coque ─────────────────────────────────────────
   Ce que `applyFeatures` fait au-dessus est SOUSTRACTIF : la coque contient
   tout, et une capacité éteinte retire son nœud. Ça marchait tant que tout le
   chrome était à nous — mais un plugin ne pouvait alors rien AJOUTER, et c'est
   ce qui l'empêchait de livrer autre chose qu'un écran.

   Ici, l'inverse : le composeur et les Réglages exposent un emplacement, et les
   plugins actifs le remplissent. Gardés par `GW_FEATURES` (sorte `capacite`),
   donc au MÊME endroit qu'avant — un pod ne change pas de configuration parce
   qu'une fonctionnalité est devenue un plugin.

   ⚠️ `mount()` est appelé APRÈS injection, jamais avant : le plugin câble ses
   écouteurs sur des nœuds qui doivent exister. C'est le même piège que `page`
   côté vues, et il se paie de la même façon — un écran muet, sans erreur. */
function applyChrome() {
  const tray = $('moretray');
  const setlist = document.querySelector('.setlist');
  for (const [id, fabrique] of Object.entries(CHROME_PLUGINS)) {
    if (!featureOn(id)) continue;
    let apport;
    try {
      apport = fabrique(EXT_API) || {};
    } catch (e) {
      console.error('chrome du plugin « ' + id + ' » ignoré :', e);
      continue;
    }
    try {
      if (apport.markup) document.body.insertAdjacentHTML('beforeend', apport.markup);
      for (const b of apport.composer || []) {
        tray?.insertAdjacentHTML('beforeend',
          `<button class="shield" id="${esc(b.id)}" type="button" title="${esc(b.titre || '')}">${esc(b.glyphe || '?')}</button>`);
      }
      for (const e of apport.settings || []) {
        setlist?.insertAdjacentHTML('beforeend',
          `<button id="${esc(e.id)}" type="button">${esc(e.libelle || e.id)}</button>`);
      }
      apport.mount?.();
    } catch (e) {
      console.error('chrome du plugin « ' + id + ' » : montage en échec', e);
    }
  }
}

async function loadApps() {
  try {
    const r = await fetch('/api/version', { headers: headers(false), cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (Array.isArray(d.apps)) APPS = new Set(d.apps);
    if (Array.isArray(d.features)) FEATURES = new Set(d.features);
    // Avant le premier rendu (le boot attend cet appel) : sinon on verrait
    // apparaître puis disparaître des boutons que ce corps n'expose pas.
    applyFeatures();
    // Puis ce que les plugins AJOUTENT — après le retrait, jamais avant : un
    // plugin ne doit pas voir son bouton effacé par la passe soustractive.
    applyChrome();
    // L'attribut arme les feuilles des skins. Posé AVANT le premier rendu (cf.
    // boot), sinon on verrait passer la livrée du socle. `alfred` reste
    // implicite : aucun attribut, aucune surcharge, rien ne bouge.
    if (d.theme && d.theme !== 'alfred') document.documentElement.dataset.agent = d.theme;
    SKIN = resolveSkin(d.theme, EXT_API);
    applySkinChrome(d);
  } catch {}
}

/* ── Mémoire (arbo) ──────────────────────────────────────────────── */
let memInfo = null; // {root, todo, entries:[{path,dir}]}
let memIndex = null; // Map path -> frontmatter (dérivé, une requête)
async function loadTree() {
  try { const r = await fetch('/api/memory/tree', { headers: headers(false) }); if (r.ok) memInfo = await r.json(); } catch {}
}
function loadTreeThen(fn) { loadTree().then(fn); }
async function loadIndex() {
  if (memIndex) return;
  memIndex = new Map();
  try { const r = await fetch('/api/memory/index', { headers: headers(false) }); if (r.ok) { const { items } = await r.json(); for (const it of items) memIndex.set(it.path, it.fm || {}); } } catch {}
}
// Overlay des gestes todo (D28) : cocher est un POST direct, jamais une phrase au LLM.
// Prioritaire sur le `done:` de la fiche tant qu'Alfred n'a pas consolidé — sans quoi la
// case se décocherait au rafraîchissement suivant. Valeur : date ISO (faite), false
// (décochée explicitement), absente (aucun geste en attente → la fiche fait foi).
let todoOverlay = {};
async function loadTodoState() {
  try { const r = await fetch('/api/todo/state', { headers: headers(false), cache: 'no-store' }); todoOverlay = (await r.json()).fait || {}; } catch { todoOverlay = {}; }
  return todoOverlay;
}
// Le done: effectif d'une tâche — l'overlay d'abord, la fiche ensuite.
const doneOf = (id, fm) => isDone(id in todoOverlay ? todoOverlay[id] : fm.done);
// Le geste lui-même. Optimiste : l'appelant a déjà basculé l'affichage, on ne
// recharge rien ; en cas d'échec on rend la main avec false pour qu'il révoque.
async function tickTask(id, done) {
  try {
    const r = await fetch('/api/todo/state', { method: 'POST', headers: headers(true), body: JSON.stringify({ key: id, done }) });
    if (!r.ok) return false;
    todoOverlay = (await r.json()).fait || {};
    return true;
  } catch { return false; }
}

let wbCache = null;
async function loadWorkbooks() {
  if (wbCache) return wbCache;
  try { const r = await fetch('/api/workbook/list', { headers: headers(false), cache: 'no-store' }); wbCache = (await r.json()).workbooks || []; } catch { wbCache = []; }
  return wbCache;
}
const prettify = (s) => { s = s.replace(MD_EXT, '').replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
// Un wikilink SANS alias sort du moteur avec son chemin brut pour libellé — on le
// remplace par le TITRE de la cible (frontmatter), sinon son nom de fichier joliment.
function labelMemLinks(root) {
  if (!memIndex) return;
  root.querySelectorAll('a[href^="/mem/"]').forEach((a) => {
    const t = decodeURIComponent(a.getAttribute('href').slice(5));
    if (a.textContent.trim() !== t) return; // un alias explicite : on ne touche pas
    let full = /\.[a-z0-9]+$/i.test(t) ? t : t + '.md';
    let fm = memIndex.get(full);
    if (!fm && memInfo) {
      const base = ('/' + full.split('/').pop()).toLowerCase();
      const e = memInfo.entries.find((x) => !x.dir && ('/' + x.path.toLowerCase()).endsWith(base));
      if (e) { full = e.path; fm = memIndex.get(e.path); }
    }
    a.textContent = (fm && fm.titre) || prettify(full.split('/').pop());
  });
}
// Compteur de la tuile d'accueil : dérivé des fiches type:tache (même source que la vue todo).
async function todoStats() {
  try {
    await Promise.all([loadIndex(), loadTodoState()]);
    if (!memIndex) return null;
    const today = new Date().toISOString().slice(0, 10);
    let total = 0, late = 0;
    for (const [path, fm] of memIndex) {
      if (fm.type !== 'tache' || doneOf(slugOf(path), fm)) continue;
      total++;
      if (/^\d{4}-\d{2}-\d{2}$/.test(fm.due || '') && fm.due < today) late++;
    }
    return { total, late };
  } catch { return null; }
}
// Sous-domaines de 1er niveau sous domaines/ + todo + sujets.
function domains() {
  if (!memInfo) return [];
  const set = new Set();
  for (const e of memInfo.entries) {
    const p = e.path;
    if (p.startsWith('domaines/')) set.add(p.split('/')[1]);
    else if (p.startsWith('sujets/') && !p.startsWith('sujets/archive')) set.add('sujets');
  }
  return [...set].filter(Boolean).sort();
}
const isFiche = (p) => MD_EXT.test(p) && !/(^|\/)INDEX\.md$/i.test(p) && !p.startsWith('sujets/archive');
function countIn(prefix) {
  if (!memInfo) return 0;
  return memInfo.entries.filter((e) => !e.dir && isFiche(e.path) && e.path.startsWith(prefix)).length;
}
// Préfixe mémoire d'un sous-chemin d'app (ex. "cadeaux/frere" -> "domaines/cadeaux/frere/").
function memPrefix(subpath) {
  const segs = subpath.split('/');
  const base = segs[0] === 'sujets' ? 'sujets' : 'domaines/' + segs[0];
  const rest = segs.slice(1).join('/');
  return (rest ? base + '/' + rest : base) + '/';
}
// Enfants immédiats d'un préfixe : sous-dossiers (regroupements) + fiches .md de ce niveau.
function childrenOf(prefix) {
  const folders = new Set(), files = [];
  for (const e of memInfo.entries) {
    if (!e.path.startsWith(prefix) || e.path.startsWith('sujets/archive')) continue;
    const rest = e.path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    if (slash >= 0) { const f = rest.slice(0, slash); if (f !== 'assets') folders.add(f); }
    else if (!e.dir && MD_EXT.test(rest) && !/^INDEX\.md$/i.test(rest)) files.push(e.path);
  }
  return { folders: [...folders].sort((a, b) => a.localeCompare(b, 'fr')), files: files.sort() };
}
function ficheCount(prefix) {
  return memInfo.entries.filter((e) => !e.dir && isFiche(e.path) && e.path.startsWith(prefix)).length;
}

/* ── Skin actif ──────────────────────────────────────────────────────
   Le socle (Alfred) est le skin NEUTRE : tous les champs absents, donc tous les
   comportements par défaut. Un skin ne peut qu'ajouter, jamais retrancher — d'où
   l'impossibilité qu'un thème neuf casse un corps existant.
   Les primitives du lanceur sont injectées : voir `skins/index.js`. */
/* Ce que le lanceur prête à une vue de plugin. Volontairement étroit : chaque
   entrée est une primitive du shell qu'une vue ne peut pas se fabriquer seule —
   pas une commodité. En ajouter une doit rester un acte réfléchi, sinon l'api
   devient la surface entière du lanceur et le découplage n'est plus qu'un mot.

   `page` reste un GETTER : le nœud n'existe pas encore quand les vues sont
   instanciées (cf. le commentaire en tête de `plugins/repos/web/app.js`, qui a
   coûté une capture d'écran pour être trouvé). */
const EXT_API = {
  $, esc, crumbs, headers,
  get page() { return page; },
  appOn: (id) => appOn(id),
  // Lecture de la mémoire — une vue qui affiche des fiches en a besoin, et
  // refaire un fetch/parse chez elle dupliquerait le cache de l'index.
  loadIndex, loadTree, prettify, add, sc, chipsOf,
};
let SKIN = resolveSkin(null, EXT_API);
// Les apps sont instanciées UNE fois, au chargement du module : elles ne
// dépendent que des primitives ci-dessus, jamais de `apps`/`features` (qui
// arrivent plus tard, au boot). C'est `renderRoute` qui les filtre par `appOn`.
const APP_VIEWS = resolveApps(EXT_API);

/** Habillage de la coque : le nom du corps est écrit en dur dans app.html, et la
    barre d'état n'existe que si le skin en fournit une. */
function applySkinChrome(info) {
  const nameBtn = $('home2');
  if (SKIN.brand && nameBtn) nameBtn.innerHTML = `<b>${esc(SKIN.brand)}</b>`;
  if (SKIN.title) document.title = SKIN.title;
  if (SKIN.placeholder && input) input.placeholder = SKIN.placeholder;
  const st = $('rail-status');
  if (SKIN.idleLabel && st) st.title = SKIN.idleLabel;
  // Le blason de l'en-tête est inline dans app.html (le nœud papillon du
  // majordome) : un skin peut le remplacer. Le favicon et le manifeste, eux, sont
  // servis PAR LE SERVEUR (/icon.svg, /manifest.webmanifest) — le navigateur les
  // réclame avant que ce script n'existe, ils ne peuvent pas venir d'ici.
  const crestEl = document.querySelector('.crestbtn .crest');
  if (SKIN.crest && crestEl) crestEl.innerHTML = SKIN.crest;

  const main = document.querySelector('main.main');
  if (!SKIN.console || !main || main.querySelector(':scope > .console')) return;
  const bar = SKIN.console(EXT_API, info || {});
  if (bar) main.insertBefore(bar, main.firstChild);
}

/* ── Routeur (hash) + fil d'Ariane ───────────────────────────────── */
function currentRoute() { return decodeURIComponent(location.hash.replace(/^#\/?/, '')); }
$('home').addEventListener('click', () => { location.hash = '#/'; });
$('home2') && $('home2').addEventListener('click', () => { location.hash = '#/'; });

let CR = [];
// Un maillon sans `hash` est INERTE (libellé seul) : tous les niveaux d'un chemin
// n'ont pas d'écran à eux, et fabriquer un lien pour les aligner, c'est le bug que
// ça corrige. Il reste dans CR — donc dans `titre` du contexte d'écran, où le
// libellé compte —, il n'est simplement jamais cliquable.
function crumbs(parts) {
  CR = parts;
  $('crumbs').innerHTML = parts.map((p, i) => i === parts.length - 1
    ? `<span class="c">${esc(p.label)}</span>`
    : `${p.hash ? `<a class="cb" href="${p.hash}">${esc(p.label)}</a>` : `<span class="cb off">${esc(p.label)}</span>`}<span class="s">›</span>`).join('');
  $('back').style.display = parts.length > 1 ? 'flex' : 'none';
  const sc = document.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
}
// « Retour » remonte au dernier maillon qui MÈNE quelque part, pas au précédent :
// l'avant-dernier peut être inerte.
$('back').addEventListener('click', () => {
  for (let i = CR.length - 2; i >= 0; i--) if (CR[i].hash) { location.hash = CR[i].hash; return; }
});

// Contexte d'écran, joint à chaque message : sur desktop le canvas est ouvert À CÔTÉ
// du chat, donc « ça » dans une phrase de Monsieur désigne le plus souvent ce qu'il a
// sous les yeux. On envoie la route et son fil d'Ariane, JAMAIS le contenu de la page :
// une carte de voyage ou une fiche produit porte du texte tiers (Gmail, Open Food
// Facts) qui n'entre pas dans un prompt sans son étiquette « non fiable » (cf. D40).
// Rien à joindre quand l'écran n'est pas réellement regardé — accueil (route vide) ou
// mobile replié sur le chat : un instantané à l'envoi, jamais un sujet qui colle.
function currentView() {
  const route = currentRoute();
  if (!route) return undefined;
  if (mqMobile.matches && !document.body.classList.contains('canvas-open')) return undefined;
  // 'Accueil' ouvre tous les fils : redondant. '…' est le libellé d'attente d'un
  // rendu asynchrone — on ne l'envoie pas, la route dit déjà mieux.
  const titre = CR.slice(1).map((c) => c.label).filter((l) => l && l !== '…').join(' › ');
  return { route, titre: titre || route };
}

const page = $('view');
function renderRoute() {
  const route = currentRoute();
  // Mobile deux-écrans : le CHAT est l'écran par défaut. Naviguer vers une app révèle
  // l'écran apps ; revenir à la racine (route vide) ramène au chat. Le swipe/les
  // poignées basculent en plus, à la main, entre les deux.
  if (mqMobile.matches) document.body.classList.toggle('canvas-open', route !== '');
  // L'accueil passe par le skin : deux corps ne répondent pas à la même question,
  // donc ils n'ouvrent pas sur le même écran. Un skin sans `home` (le socle)
  // retombe sur celui d'Alfred. C'est la SEULE vue qu'un thème puisse fournir —
  // un skin ne déclare plus de `routes` : une route est une app, pas un habillage
  // (une vue enfermée dans un thème n'existe que sous ce thème).
  if (!route) return SKIN.home ? SKIN.home() : renderHome();
  // La mémoire (fiches, domaines) est le socle : elle n'est pas un module, tout
  // agent qui écrit dans memory/ la parcourt. Seuls les modules ci-dessous se
  // configurent — une route éteinte retombe sur l'accueil, jamais sur un écran mort.
  if (route.startsWith('mem/')) return renderFiche(route.slice(4));
  // Un parcours est de la mémoire adressable, comme une fiche — pas un module.
  // Il n'a donc pas de domaine à lui : il s'accroche à la fiche qui a une raison
  // d'en parler, et celle-ci y renvoie par `{% parcours vue="lien" %}`.
  if (route.startsWith('parcours/')) return renderParcours(decodeURIComponent(route.slice(9)));
  // L'app Voyages intercepte son domaine : la tuile générique #/dom/voyages
  // mène au hub (timeline), pas à la collection de fiches. Module éteint :
  // l'interception saute et #/dom/voyages redevient un domaine ordinaire.
  if (route.startsWith('dom/')) return renderDomain(route.slice(4));
  if (appOn('todo')) {
    if (route.startsWith('todo/')) return renderList(decodeURIComponent(route.slice(5)));
    if (route === 'todo') return renderTodo();
  }
  if (route === 'planif' && appOn('planif')) return renderPlanif();
  // Les apps du registre (`apps/index.js`) — celles qui ont déjà quitté ce
  // fichier. Testées SOUS `appOn` comme les autres : une route ne survit pas à
  // l'extinction de son module, marque-page compris.
  for (const [id, app] of Object.entries(APP_VIEWS)) {
    if (!appOn(id) || !app.routes) continue;
    for (const [prefix, render] of Object.entries(app.routes)) {
      if (prefix.endsWith('/')) {
        if (route.startsWith(prefix)) return render(decodeURIComponent(route.slice(prefix.length)));
      } else if (route === prefix) return render('');
    }
  }
  renderHome();
}

function tileHTML(id, route, st, foot) {
  const m = metaFor(id);
  return `<a class="tile" href="${route}" style="--tc:var(--${m.color})"><span class="ico">${m.ico}</span><div class="nm">${esc(m.label)}</div><div class="st">${esc(st || '')}</div><div class="foot">${foot || ''}</div></a>`;
}
async function renderHome() {
  crumbs([{ label: 'Accueil', hash: '#/' }]);
  // L'index porte l'habillage déclaré des domaines (cf. metaFor) : sans lui les
  // tuiles sortiraient en livrée de repli puis changeraient sous le doigt. En
  // cache après le 1er appel — au boot il est déjà chargé, l'attente est nulle.
  await loadIndex();
  // diy/atelier ne sont écartés des domaines que si le module Atelier les
  // représente déjà par sa propre tuile ; sinon ils redeviennent des domaines
  // ordinaires plutôt que de disparaître de l'accueil.
  // Les domaines qu'une vue de plugin ABSORBE : sa tuile les représente déjà, les
  // laisser dans la mosaïque ferait doublon. Déclaré par le plugin (`vue.absorbe`),
  // plus deviné ici — le lanceur écrivait « atelier ou diy » en toutes lettres.
  // Un plugin éteint ne les absorbe pas : ils redeviennent des domaines ordinaires
  // plutôt que de disparaître de l'accueil.
  const absorbes = new Set(
    Object.entries(appTiles())
      .filter(([id]) => appOn(id))
      .flatMap(([, t]) => t.absorbe || []),
  );
  const doms = domains().filter((d) => !absorbes.has(d));
  const total = memInfo ? memInfo.entries.filter((e) => !e.dir && isFiche(e.path)).length : 0;
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const pc = (n, w = 'fiche') => `<span class="pc">${n} ${w}${n > 1 ? 's' : ''}</span>`;
  const nProjets = countIn('domaines/diy/projets/');
  // Les modules NATIFS du lanceur : ils n'ont pas de dossier de plugin, leur tuile
  // reste donc ici. Les autres se déclarent.
  const tools = [
    appOn('todo') && tileHTML('todo', '#/todo', 'Vos tâches', ''),
    appOn('projets') && tileHTML('projets', '#/dom/diy/projets', 'Vos chantiers', pc(nProjets, 'projet')),
    appOn('planif') && tileHTML('planif', '#/planif', 'Ce qu’Alfred fait tout seul', ''),
    // …puis les vues de plugin, dans l'ordre du registre. `compte` est un préfixe
    // de mémoire : le plugin dit CE QU'IL compte, le lanceur sait seulement compter.
    ...Object.entries(appTiles())
      .filter(([id, t]) => appOn(id) && t.href)
      .map(([id, t]) => tileHTML(id, t.href, t.sous_titre || '', t.compte ? pc(countIn(t.compte)) : '')),
  ].filter(Boolean);
  const domTiles = doms.map((d) => {
    const n = countIn(d === 'sujets' ? 'sujets/' : 'domaines/' + d + '/');
    return tileHTML(d, '#/dom/' + d, '', pc(n));
  });
  const hour = new Date().getHours();
  const salut = hour < 18 ? 'Bonjour' : 'Bonsoir';
  page.innerHTML = `<div class="wrap">
    <h1 class="hi">${salut}, Monsieur.<span class="m"> Que puis-je pour vous ?</span></h1>
    <div class="subhi">${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} — ${total} fiches en mémoire.</div>
    <button class="cmd" id="cmdk" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><span class="caret" aria-hidden="true"></span><span class="ph">Demander à Alfred…</span><kbd>⌘K</kbd></button>
    <div id="brief-slot"></div>
    ${tools.length ? `<div class="rowlabel">Transverse</div><div class="mosaic">${tools.join('')}</div>` : ''}
    <div class="rowlabel">Domaines</div><div class="mosaic">${domTiles.join('')}</div>
  </div>`;
  const cmd = $('cmdk'); if (cmd) cmd.addEventListener('click', () => input.focus());
  // Enrichissements de tuiles : chacun est un appel réseau, on ne le lance pas
  // pour une tuile qui n'existe pas sur ce pod.
  if (appOn('todo')) todoStats().then((st) => {
    if (!st) return;
    const foot = page.querySelector('.tile[href="#/todo"] .foot');
    if (foot) foot.innerHTML = `<span class="pc">${st.total} à faire</span>${st.late ? `<span class="pc hot">${st.late} en retard</span>` : ''}`;
    const sub = page.querySelector('.subhi');
    if (sub) sub.textContent = `${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} — ${st.total} tâche${st.total > 1 ? 's' : ''} en cours${st.late ? `, dont ${st.late} en retard` : ''}.`;
  });
  if (appOn('planif')) fetch('/api/planif', { headers: headers(false), cache: 'no-store' }).then((r) => r.ok && r.json()).then((d) => {
    const foot = d && page.querySelector('.tile[href="#/planif"] .foot');
    if (!foot) return;
    const on = (d.planifs || []).filter((p) => p.actif && !p.erreur).length;
    const ko = (d.planifs || []).filter((p) => p.erreur).length;
    foot.innerHTML = `<span class="pc">${on} active${on > 1 ? 's' : ''}</span>${ko ? `<span class="pc hot">${ko} invalide${ko > 1 ? 's' : ''}</span>` : ''}`;
  }).catch(() => {});
  // Les compteurs des tuiles de plugin. Le lanceur nommait `voyages` ici, et
  // construisait son HTML : il demande maintenant à chaque vue active ce qu'elle
  // veut afficher, et ne connaît que la forme de la réponse.
  for (const [id, app] of Object.entries(APP_VIEWS)) {
    if (!appOn(id) || typeof app.tileInfo !== 'function') continue;
    Promise.resolve(app.tileInfo()).then((info) => {
      if (!info) return;
      const tile = page.querySelector(`.tile[href="#/dom/${id}"]`) || page.querySelector(`.tile[href="#/${id}"]`);
      if (!tile) return;
      if (info.st) tile.querySelector('.st').textContent = info.st;
      const foot = tile.querySelector('.foot');
      if (foot && info.items?.length) {
        foot.innerHTML = info.items
          .map((it) => `<span class="pc${it.hot ? ' hot' : ''}">${esc(it.texte)}</span>`)
          .join('');
      }
    }).catch(() => {});   // une tuile sans compteur reste une tuile
  }
  renderBrief();
}

/* « À la une » — brief curé par Alfred (memory/home/brief.json), régime matérialisé :
   le front lit l'artefact tel quel, zéro LLM au rendu. Absent → section masquée. */
const BRIEF_COLOR = { workbook: '--shop', fiche: '--maison', domaine: '--proj', todo: '--todo' };
function briefRoute(cible) {
  if (!cible) return null;
  if (cible.type === 'todo') return '#/todo';
  if (cible.type === 'fiche' && cible.path) return '#/mem/' + cible.path;
  if (cible.type === 'domaine' && cible.path) return '#/dom/' + cible.path;
  if (cible.type === 'workbook' && cible.path) return '#/atelier/' + encodeURIComponent(cible.path);
  return null;
}
async function renderBrief() {
  const slot = $('brief-slot'); if (!slot) return;
  let brief;
  try { const r = await fetch('/api/memory/raw/home/brief.json', { headers: headers(false), cache: 'no-store' }); if (!r.ok) return; brief = await r.json(); } catch { return; }
  const items = (brief.items || []).slice(0, 4);
  if (!items.length) return;
  let age = '';
  if (brief.generatedAt) {
    const h = Math.round((Date.now() - new Date(brief.generatedAt).getTime()) / 3600000);
    age = h < 1 ? 'à l’instant' : h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
  }
  slot.innerHTML = `<div class="rowlabel">À la une <span class="by">— choisi par Alfred${age ? ' · ' + age : ''}</span><button class="rf" type="button" title="Demander à Alfred de rafraîchir">↺</button></div>
    <div class="brief">${items.map((it, i) => {
      const route = briefRoute(it.cible);
      const u = BRIEF_COLOR[it.cible?.type] || '--accent';
      return `<${route ? `a href="${esc(route)}"` : 'span'} class="bitem" style="--u:var(${u})" title="${esc(it.raison || '')}"><span class="bi">${esc(it.ico || '•')}</span><span class="bt">${esc(it.titre || '')}</span></${route ? 'a' : 'span'}>`;
    }).join('')}</div>`;
  slot.querySelector('.rf').addEventListener('click', () => submitText('Rafraîchis ma une'));
}

// Collections « groupées » : même dossier, mais on entre par une facette du frontmatter
// avant la liste (ex. Projets par catégorie majeure) plutôt que par des sous-dossiers.
const GROUPED = {
  'diy/projets': { key: 'cat', label: 'catégorie', labels: { menuiserie: 'Menuiserie', bricolage: 'Bricolage', electronique: 'Électronique', dev: 'Développement' } },
};

async function renderDomain(rawSubpath) {
  await loadIndex();
  const [subpath, qs] = rawSubpath.split('?');
  // `#/dom/todo`, `#/dom/planif` : une racine de mémoire prise pour un domaine
  // (marque-page, ou `cible` de type domaine écrite par l'agent dans brief.json).
  // On renvoie sur le module plutôt que d'afficher sa page vide.
  const rh = rootHash(subpath);
  if (rh) { location.replace(rh); return; }
  const groupSel = new URLSearchParams(qs || '').get('g');
  const segs = subpath.split('/');
  const m = metaFor(segs[0]);
  const cr = [{ label: 'Accueil', hash: '#/' }];
  let acc = '';
  segs.forEach((s, i) => { acc = i ? acc + '/' + s : s; cr.push({ label: i ? prettify(s) : m.label, hash: '#/dom/' + acc }); });
  const grouping = GROUPED[subpath];
  if (grouping && groupSel) cr.push({ label: grouping.labels[groupSel] || prettify(groupSel), hash: `#/dom/${subpath}?g=${groupSel}` });
  const prefix = memPrefix(subpath);
  // Le dossier est un ESPACE (fiche-index homonyme, >1 page) → on entre directement
  // dans sa vue d'ensemble, pas dans une mosaïque de cartes.
  const spaceIdx = prefix + segs.at(-1) + '.md';
  if (memIndex.has(spaceIdx) && ficheCount(prefix) > 1) {
    location.replace('#/mem/' + spaceIdx);
    return;
  }
  crumbs(cr);
  let { folders, files } = childrenOf(prefix);
  if (grouping) {
    // Un projet peut être un ESPACE (dossier + fiche-index homonyme) : il est représenté
    // par sa fiche-index dans le regroupement, au même titre qu'une fiche plate.
    for (const f of folders) {
      const idx = prefix + f + '/' + f + '.md';
      if (memIndex.has(idx)) files.push(idx);
    }
    folders = []; // le regroupement vient du frontmatter, pas des dossiers
    if (!groupSel) {
      const counts = new Map();
      for (const p of files) {
        const fm = memIndex.get(p) || {}; const v = fm[grouping.key]; if (!v) continue;
        const c = counts.get(v) || { on: 0, arch: 0 }; c[isArchived(fm) ? 'arch' : 'on']++; counts.set(v, c);
      }
      page.innerHTML = `<div class="wrap" style="--dc:var(--${m.color})"><div class="chead"><div class="aico" style="--dc:var(--${m.color})">${m.ico}</div><div><h1>${esc(prettify(segs.at(-1)))}</h1><div class="lede">Par ${grouping.label} — entrez dans une ${grouping.label}.</div></div></div>
        <div class="grouplabel">Catégories</div><div class="cards">${[...counts.entries()].map(([v, c]) => `<a class="card" href="#/dom/${esc(subpath)}?g=${esc(v)}"><div class="persontop"><span class="avatar">${esc((grouping.labels[v] || v).charAt(0))}</span><span class="ct">${esc(grouping.labels[v] || v)}</span></div><div class="cmeta">${[c.on ? `${c.on} projet${c.on > 1 ? 's' : ''}` : '', c.arch ? `${c.arch} archivé${c.arch > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</div></a>`).join('')}</div></div>`;
      return;
    }
    files = files.filter((p) => (memIndex.get(p) || {})[grouping.key] === groupSel);
  }
  const title = grouping && groupSel ? (grouping.labels[groupSel] || prettify(groupSel)) : (segs.length > 1 ? prettify(segs.at(-1)) : m.label);
  // Les fiches au cycle terminé sortent de la grille des vivantes : elles vivront dans la
  // section Archive repliée en bas de page, plus au milieu des autres.
  const archived = files.filter((p) => isArchived(memIndex.get(p)));
  files = files.filter((p) => !isArchived(memIndex.get(p)));
  // Facette : statut (cycle de vie) sinon rôle (contacts) sinon type.
  const facetKey = files.some((p) => (memIndex.get(p) || {}).status) ? 'status'
    : files.some((p) => (memIndex.get(p) || {}).role) ? 'role' : 'type';
  const facetVals = [...new Set(files.map((p) => (memIndex.get(p) || {})[facetKey]).filter(Boolean))].sort();

  let html = `<div class="wrap" style="--dc:var(--${m.color})"><div class="chead"><div class="aico" style="--dc:var(--${m.color})">${m.ico}</div><div><h1>${esc(title)}</h1><div class="lede">${folders.length ? 'Cartes de sous-domaine → fiches.' : 'Cartes → fiche.'}</div></div></div>`;
  // L'Atelier (racine diy) : les OUTILS (workbooks de suivi) passent avant la connaissance.
  if (subpath === 'diy') {
    try {
      const wbs = await loadWorkbooks();
      if (wbs.length) {
        html += `<div class="grouplabel">Outils <span class="hint">— suivi menuiserie</span></div><div class="cards">`;
        for (const w of wbs) {
          const pct = w.pieces ? Math.round(100 * w.done / w.pieces) : 0;
          html += `<a class="card" href="#/atelier/${encodeURIComponent(w.path)}"><div class="ct">📐 ${esc(w.titre)}</div><div class="cmeta">${w.done}/${w.pieces} pièces débitées</div><div class="bar"><i style="width:${pct}%"></i></div></a>`;
        }
        html += `</div>`;
      }
    } catch {}
  }
  if (folders.length) {
    html += `<div class="grouplabel">Sous-domaines</div><div class="cards">`;
    for (const f of folders) {
      const n = ficheCount(prefix + f + '/');
      // Un dossier-ESPACE (fiche-index homonyme) mène droit à sa vue d'ensemble.
      const idx = prefix + f + '/' + f + '.md';
      const isSpace = memIndex.has(idx) && n > 1;
      const href = isSpace ? '#/mem/' + idx : `#/dom/${subpath}/${f}`;
      const meta = isSpace ? `📑 ${n} pages` : `${n} fiche${n > 1 ? 's' : ''}`;
      html += `<a class="card" href="${esc(href)}"><div class="persontop"><span class="avatar">${esc(prettify(f).charAt(0))}</span><span class="ct">${esc(prettify(f))}</span></div><div class="cmeta">${meta}</div></a>`;
    }
    html += `</div>`;
  }
  if (files.length || archived.length) {
    if (folders.length) html += `<div class="grouplabel">Fiches</div>`;
    html += `<div class="toolbar"><label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><input id="dq" placeholder="Rechercher…"></label>`;
    if (facetVals.length > 1) html += `<div class="facets" id="facets"><button class="pill on" data-f="">Tous</button>${facetVals.map((v) => `<button class="pill" data-f="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
    html += `</div>`;
    if (files.length) html += `<div class="cards" id="dcards"></div>`;
    // Repliée par défaut — sauf quand il n'y a QU'elle : une page vide qui cache tout serait pire.
    if (archived.length) html += `<details class="archsec"${files.length ? '' : ' open'}><summary>🗄️ Archive <span class="hint">— ${archived.length} fiche${archived.length > 1 ? 's' : ''} au cycle terminé</span></summary><div class="cards" id="acards"></div></details>`;
  }
  html += `</div>`;
  page.innerHTML = html;
  if (!folders.length && !files.length && !archived.length) { page.querySelector('.wrap').insertAdjacentHTML('beforeend', '<div class="empty">Rien ici pour l’instant.</div>'); return; }

  if (files.length || archived.length) {
    let activeFacet = null;
    const cardsEl = $('dcards'), acardsEl = $('acards'), dq = $('dq'), facets = $('facets');
    const wbs = grouping ? await loadWorkbooks() : [];
    const cardHTML = (p) => {
      const fm = memIndex.get(p) || {};
      const name = fm.titre || prettify(p.split('/').pop());
      const foot = [];
      if (fm.status) foot.push(`<span class="stat ${sc(fm.status)}">${esc(fm.status)}</span>`);
      if (fm.role) foot.push(`<span class="tag">${esc(fm.role)}</span>`);
      (Array.isArray(fm.tags) ? fm.tags : []).slice(0, 3).forEach((t) => foot.push(`<span class="tag">#${esc(t)}</span>`));
      const meta = fm.tel ? `<div class="cmeta mono" style="font-size:12px">${esc(fm.tel)}</div>` : '';
      // Projet-espace avec workbook → barre d'avancement dérivée (pièces débitées).
      let bar = '';
      const base = p.split('/').pop().replace(MD_EXT, '');
      const dir = p.slice(0, p.lastIndexOf('/'));
      if (dir.endsWith('/' + base)) {
        const wb = wbs.find((w) => w.path.startsWith(dir + '/'));
        if (wb && wb.pieces) bar = `<div class="bar"><i style="width:${Math.round(100 * wb.done / wb.pieces)}%"></i></div>`;
      }
      return `<a class="card" href="#/mem/${esc(p)}"><div class="ct">${esc(name)}</div>${meta}${bar}${foot.length ? `<div class="foot">${foot.join('')}</div>` : ''}</a>`;
    };
    const matches = (p, q) => {
      const fm = memIndex.get(p) || {};
      return (p + ' ' + (fm.titre || '') + ' ' + (fm.role || '') + ' ' + (Array.isArray(fm.tags) ? fm.tags.join(' ') : '')).toLowerCase().includes(q);
    };
    const draw = () => {
      const q = (dq.value || '').toLowerCase();
      if (cardsEl) {
        const shown = files.filter((p) => {
          if (activeFacet && (memIndex.get(p) || {})[facetKey] !== activeFacet) return false;
          return matches(p, q);
        });
        cardsEl.innerHTML = shown.length ? shown.map(cardHTML).join('') : '<div class="empty">Aucune fiche.</div>';
      }
      // L'archive ignore les facettes (elles décrivent les vivantes) mais suit la recherche.
      if (acardsEl) {
        const shown = archived.filter((p) => matches(p, q));
        acardsEl.innerHTML = shown.length ? shown.map(cardHTML).join('') : '<div class="empty">Rien dans l’archive ne correspond.</div>';
      }
    };
    dq.addEventListener('input', draw);
    if (facets) facets.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      activeFacet = b.dataset.f || null;
      [...facets.children].forEach((c) => c.classList.remove('on')); b.classList.add('on');
      draw();
    });
    draw();
  }
}

/* ── Un parcours, en pleine page ───────────────────────────────────────────
 * Le même bloc que dans une fiche, seul dans son écran. C'est ce qui permet à
 * une balade de n'appartenir à AUCUN domaine : elle vit dans les assets de la
 * fiche qui a une raison d'en parler (un week-end, une forêt, un voyage) et
 * reste adressable par son chemin. Le fil d'Ariane remonte au dossier, pas à
 * un domaine « balades » qui n'existe pas. */
function renderParcours(path) {
  const parts = path.split('/');
  const dossier = parts.slice(0, -1).join('/');
  const cr = [{ label: 'Accueil', hash: '#/' }];
  if (parts[0] === 'domaines' && parts.length > 2) {
    cr.push({ label: metaFor(parts[1]).label, hash: '#/dom/' + parts[1] });
  }
  // Le parcours vit dans `assets/` : c'est la fiche du dossier parent qui
  // l'expose, et c'est là qu'on veut revenir.
  const parent = dossier.replace(/\/assets$/, '');
  if (parent && parent !== dossier) {
    cr.push({ label: prettify(parent.split('/').pop()), hash: '#/mem/' + parent + '/' + parent.split('/').pop() + '.md' });
  }
  cr.push({ label: parts.at(-1).replace(/\.parcours\.json$/, ''), hash: '#/parcours/' + path });
  crumbs(cr);

  const wrap = document.createElement('div'); wrap.className = 'wrap';
  const doc = document.createElement('div'); doc.className = 'agent-doc';
  const hote = document.createElement('div');
  hote.className = 'parcours';
  hote.dataset.src = '/api/memory/raw/' + path.split('/').map(encodeURIComponent).join('/');
  doc.appendChild(hote); wrap.appendChild(doc);
  page.innerHTML = ''; page.appendChild(wrap);
  // Après insertion : la largeur du conteneur décide du zoom de la carte.
  queueMicrotask(() => window.Alfred?.mountBlocks?.(doc));
}

async function renderFiche(path) {
  if (path && !/\.[a-z0-9]+$/i.test(path)) path += '.md';
  // Wikilink COURT (style Obsidian) : `[[rangement-garage]]` sans chemin. Si le chemin
  // n'existe pas tel quel, on résout par nom de fichier dans tout l'arbre (1er match).
  if (!memInfo) await loadTree();
  await loadIndex(); // titres (TOC d'espace, libellés) — en cache après le 1er appel
  if (memInfo && !memInfo.entries.some((e) => !e.dir && e.path === path)) {
    const base = ('/' + path.split('/').pop()).toLowerCase();
    const hit = memInfo.entries.find((e) => !e.dir && ('/' + e.path.toLowerCase()).endsWith(base));
    if (hit) path = hit.path;
  }
  const parts = path.split('/');
  const file = parts.at(-1);
  // Sous `domaines/` (et le pseudo-domaine `sujets`), chaque dossier traversé EST un
  // domaine : il a sa page `#/dom/…`. Ailleurs — `todo/`, `planif/`, `home/` — non :
  // seule la racine peut être cliquable, vers son module (cf. ROOT_ROUTE).
  const isDom = parts[0] === 'domaines' || parts[0] === 'sujets';
  let domSegs;
  if (parts[0] === 'domaines') domSegs = parts.slice(1, -1);
  else if (parts[0] === 'sujets') domSegs = ['sujets', ...parts.slice(1, -1)];
  else domSegs = parts.slice(0, -1);
  const cr = [{ label: 'Accueil', hash: '#/' }];
  let acc = '';
  domSegs.forEach((s, i) => {
    acc = i ? acc + '/' + s : s;
    cr.push({
      label: i === 0 ? metaFor(s).label : prettify(s),
      hash: isDom ? '#/dom/' + acc : (i === 0 ? rootHash(s) : null),
    });
  });
  cr.push({ label: file.replace(MD_EXT, ''), hash: '#/mem/' + path });
  crumbs(cr);
  page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
  const baseDir = parts.slice(0, -1).join('/');
  const wrap = document.createElement('div'); wrap.className = 'wrap';
  if (MD_EXT.test(path)) {
    let text;
    try { const r = await fetch('/api/memory/raw/' + path, { headers: headers(false) }); if (!r.ok) throw 0; text = await r.text(); }
    catch { page.innerHTML = '<div class="wrap"><div class="empty">Fiche introuvable.</div></div>'; return; }
    // Espace multi-pages : le dossier porte une fiche-index homonyme et >1 page →
    // navigation d'espace (TOC latérale collante), même moteur de rendu.
    const dir = parts.slice(0, -1).join('/');
    const dirName = parts.length > 1 ? parts.at(-2) : '';
    const spaceIndex = dir + '/' + dirName + '.md';
    const spacePages = dirName && memInfo && memInfo.entries.some((e) => !e.dir && e.path === spaceIndex)
      ? memInfo.entries.filter((e) => !e.dir && isFiche(e.path) && e.path.startsWith(dir + '/') && !e.path.slice(dir.length + 1).includes('/')).map((e) => e.path)
      : [];
    const isSpace = spacePages.length > 1;
    if (window.Alfred?.render) {
      const { frontmatter: fm, html, errors } = window.Alfred.render(text, { baseDir });
      const doc = document.createElement('div'); doc.className = 'agent-doc'; doc.innerHTML = html;
      // Le vocabulaire est FERMÉ — encore faut-il le dire. Ces erreurs étaient
      // calculées puis jetées : quatre fiches rendaient un `{% callout %}` cassé
      // depuis des semaines sans que personne soit prévenu. Elles s'affichent
      // ici, au-dessus de la fiche, à qui peut les corriger.
      if (errors?.length) {
        const box = document.createElement('div'); box.className = 'doc-errs';
        box.appendChild(Object.assign(document.createElement('div'), {
          className: 'de-t',
          textContent: errors.length > 1
            ? `${errors.length} erreurs d’écriture dans cette fiche`
            : 'Une erreur d’écriture dans cette fiche',
        }));
        for (const e of errors.slice(0, 8)) {
          const li = document.createElement('div'); li.className = 'de-l';
          li.textContent = `ligne ${e.ligne} — ${e.message}`;
          box.appendChild(li);
        }
        doc.prepend(box);
      }
      // Barre de propriétés (maquette) : dérivée du frontmatter, injectée sous le h1.
      const props = [];
      const kv = (k, v) => props.push(`<span class="k">${k}</span>${v}`);
      if (fm?.type) kv('Type', `<span class="tag">${esc(fm.type)}</span>`);
      if (fm?.cat) kv('Catégorie', `<span class="tag">${esc(fm.cat)}</span>`);
      if (fm?.role) kv('Rôle', `<span class="tag">${esc(fm.role)}</span>`);
      if (fm?.status) kv('Statut', `<span class="stat ${sc(fm.status)}">${esc(fm.status)}</span>`);
      if (fm?.tel) kv('Tél.', `<a class="tag" style="text-decoration:none" href="tel:${esc(String(fm.tel).replace(/\s/g, ''))}">${esc(fm.tel)}</a>`);
      if (fm?.prix) kv('Prix', `<span class="price">${esc(fm.prix)}</span>`);
      if (Array.isArray(fm?.tags) && fm.tags.length) kv('Tags', fm.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(''));
      if (props.length) {
        const bar = document.createElement('div'); bar.className = 'props'; bar.innerHTML = props.join('');
        const h1 = doc.querySelector('h1');
        if (h1) h1.after(bar); else doc.prepend(bar);
      }
      labelMemLinks(doc);
      // Les blocs `{% parcours %}` vont chercher leur géométrie dans un fichier
      // voisin : ils ne peuvent se peindre qu'une fois le document DANS le DOM
      // (la largeur du conteneur décide du zoom de la carte). D'où le montage
      // différé en fin de `showMem`, après `page.appendChild(wrap)`.
      queueMicrotask(() => window.Alfred?.mountBlocks?.(doc));
      if (isSpace) {
        // Index d'abord, puis les pages triées par titre.
        const label = (p) => (memIndex?.get(p)?.titre) || prettify(p.split('/').pop());
        const pages = [spaceIndex, ...spacePages.filter((p) => p !== spaceIndex).sort((a, b) => label(a).localeCompare(label(b), 'fr'))];
        const space = document.createElement('div'); space.className = 'space';
        space.innerHTML = `<nav class="space-toc"><div class="lbl">Pages</div>${pages.map((p) => `<a class="tocitem${p === path ? ' on' : ''}" href="#/mem/${esc(p)}">${esc(p === spaceIndex ? 'Vue d’ensemble' : label(p))}</a>`).join('')}</nav>`;
        const content = document.createElement('div'); content.className = 'space-content';
        content.appendChild(doc); space.appendChild(content);
        wrap.appendChild(space);
      } else {
        wrap.appendChild(doc);
      }
    } else { wrap.appendChild(renderMd(text, baseDir)); }
  } else if (IMG_EXT.test(path)) {
    const img = document.createElement('img'); img.src = '/api/memory/raw/' + path; img.className = 'shot'; wrap.appendChild(img);
  } else {
    const a = document.createElement('a'); a.href = '/api/memory/raw/' + path + '?download=1'; a.textContent = '↓ Télécharger ' + parts.at(-1); a.className = 'tag'; wrap.appendChild(a);
  }
  page.innerHTML = ''; page.appendChild(wrap);
}

/* ── App Todo — base unique (type:tache) + listes curées (type:liste) + vues dynamiques ──
 * Non-duplication (D27) : la base = les fiches type:tache ; une liste curée ne porte que
 * des refs (ids), jamais le texte d'une tâche ; les vues dynamiques sont CALCULÉES ici, rien
 * n'est stocké. Un geste (cocher, retirer/ajouter, créer/supprimer une liste) n'écrit JAMAIS
 * la mémoire : il compose un message à Alfred, seul scribe. Source : /api/memory/index. */
const TODO_TODAY = () => new Date().toISOString().slice(0, 10);
const slugOf = (p) => p.replace(/.*\//, '').replace(/\.md$/i, '');
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const isDone = (v) => v != null && v !== '' && v !== false && v !== 'false';
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const estMin = (est) => { if (!est) return null; const h = String(est).match(/(\d+)\s*h/i); if (h) return +h[1] * 60; const m = String(est).match(/(\d+)\s*min/i); return m ? +m[1] : null; };
// Un geste : jamais d'écriture directe — on pré-remplit le composer pour Alfred.
function ask(text) { input.value = text; input.focus(); input.dispatchEvent(new Event('input')); }

// Construit le modèle todo depuis le dérivé frontmatter. Rechargé FRAIS à chaque entrée :
// un geste précédent a pu faire éditer la mémoire par Alfred.
async function todoModel() {
  memIndex = null; await Promise.all([loadIndex(), loadTodoState()]);
  const BASE = {}, CURATED = [], TITLE = {};
  for (const [path, fm] of (memIndex || new Map())) {
    const id = slugOf(path);
    if (!(id in TITLE)) TITLE[id] = fm.titre || prettify(id);
    if (fm.type === 'tache') {
      BASE[id] = {
        id, path, t: fm.titre || prettify(id),
        due: fm.due || null, est: fm.est || null, pri: fm.pri || null,
        dep: fm.dep || null, blk: fm.blk || null, project: fm.projet || null,
        sub: asList(fm.sub), done: doneOf(id, fm),
        dom: fm.domaine || (Array.isArray(fm.tags) && fm.tags[0]) || null,
      };
    } else if (fm.type === 'liste') {
      CURATED.push({ id, path, stat: true, name: fm.titre || prettify(id), ico: fm.ico || '▤',
        // slugOf sur chaque ref : le format partagé avec Golem qualifie les
        // références par leur chemin (`todo/poncer-porte`), le modèle d'ici
        // indexe par slug nu — réduire à l'entrée accepte les deux dialectes.
        color: fm.color || '--todo', desc: fm.desc || '', refs: asList(fm.refs).map(slugOf) });
    }
  }
  const isSub = (id) => Object.values(BASE).some((x) => x.sub.includes(id));
  const allIds = () => Object.keys(BASE).filter((id) => !isSub(id));
  const today = TODO_TODAY();
  const DYN = [
    { id: 'base', stat: false, name: 'Toute la base', ico: '▦', color: '--search', desc: 'La source unique', q: allIds },
    { id: 'retard', stat: false, name: 'En retard', ico: '⚠️', color: '--crit', desc: 'Échéance dépassée', q: () => allIds().filter((id) => isDate(BASE[id].due) && BASE[id].due < today && !BASE[id].done) },
    { id: 'rapides', stat: false, name: 'Rapides', ico: '◷', color: '--good', desc: 'Moins de 30 min', q: () => allIds().filter((id) => { const m = estMin(BASE[id].est); return m != null && m <= 30 && !BASE[id].done; }) },
    { id: 'bloquees', stat: false, name: 'Bloquées', ico: '⏸', color: '--warn', desc: 'En attente', q: () => allIds().filter((id) => BASE[id].blk && !BASE[id].done) },
  ];
  const LISTS = {};
  for (const L of [...CURATED, ...DYN]) LISTS[L.id] = L;
  const listOf = (id) => CURATED.filter((L) => L.refs.includes(id));
  return { BASE, CURATED, DYN, LISTS, TITLE, isSub, allIds, listOf };
}

function chipsOf(x) {
  const c = [];
  if (isDate(x.due)) { const late = x.due < TODO_TODAY(); c.push(`<span class="chip ${late ? 'late' : 'due'}">${late ? '⚠ en retard · ' : ''}${esc(x.due)}</span>`); }
  else if (x.due) c.push(`<span class="chip due">${esc(x.due)}</span>`);
  if (x.dep) c.push(`<span class="chip dep">↳ ${esc(x.dep)}</span>`);
  if (x.blk) c.push(`<span class="chip blk">⏸ ${esc(x.blk)}</span>`);
  if (x.est) c.push(`<span class="chip">◷ ${esc(x.est)}</span>`);
  return c;
}
// mem: montre les pastilles « dans quelles listes » (renvoi inverse) + le projet — la
// non-duplication rendue visible. list: active le ✕ (retirer de CETTE liste curée).
function taskHTML(M, id, { sub = false, dom = false, mem = false, list = null } = {}) {
  const x = M.BASE[id]; if (!x) return '';
  const ex = [];
  if (dom && x.dom) ex.push(`<span class="chip dom">${esc(x.dom)}</span>`);
  if (mem) {
    const f = M.listOf(id);
    if (f.length) ex.push(`<span class="inlists"><span class="dot"></span>${f.map((L) => esc(L.name)).join(' · ')}</span>`);
    if (x.project) ex.push(`<span class="chip dom">▷ ${esc(M.TITLE[x.project] || x.project)}</span>`);
  }
  const meta = [...chipsOf(x), ...ex];
  return `<div class="task${sub ? ' sub' : ''}${x.done ? ' done' : ''}"><span class="pri ${x.pri || ''}"></span>`
    + `<button class="cbox ${x.done ? 'on' : ''}" data-id="${esc(id)}" title="${x.done ? 'Marquer à faire' : 'Marquer faite'}">✓</button>`
    + `<div class="bd"><div class="tt">${esc(x.t)}</div>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}</div>`
    + (list ? `<button class="rmv" data-rm="${esc(id)}" title="Retirer de la liste">✕</button>` : '') + '</div>';
}

// Landing : la galerie de listes (curées + dynamiques).
async function renderTodo() {
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Todo', hash: '#/todo' }]);
  page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
  const M = await todoModel();
  const card = (L) => {
    const ids = (L.stat ? L.refs.filter((i) => M.BASE[i]) : L.q());
    const open = ids.filter((i) => !M.BASE[i].done).length;
    const pct = ids.length ? Math.round(100 * (ids.length - open) / ids.length) : 0;
    return `<a class="lcard" href="#/todo/${encodeURIComponent(L.id)}" style="--lc:var(${L.color})">`
      + (L.stat ? `<button class="del" data-del="${esc(L.id)}" title="Supprimer">🗑</button>` : '')
      + `<span class="lico">${L.ico}</span><div><div class="ln">${esc(L.name)}</div><div class="ld">${esc(L.desc)}</div></div>`
      + (L.stat ? `<div class="bar"><i style="width:${pct}%"></i></div>` : '')
      + `<div class="lfoot"><span class="cnt">${open} <span class="z">à faire</span></span><span class="kind ${L.stat ? '' : 'dyn'}">${L.stat ? '● curée' : '⚙ dynamique'}</span></div></a>`;
  };
  page.innerHTML = `<div class="wrap"><div class="chead"><div class="aico" style="--dc:var(--todo)">${IC.todo}</div><div><h1>Todo</h1><div class="lede">Une base unique. Chaque liste n'en est qu'une sélection ou une requête.</div></div></div>
    <div class="grouplabel">Vos listes <span class="hint">— curées, par référence</span></div>
    <div class="cards">${M.CURATED.map(card).join('')}<button class="lcard newcard" id="newlist"><span class="plus">＋</span>Nouvelle liste</button></div>
    <div class="grouplabel">Vues dynamiques <span class="hint">— requêtes, non supprimables</span></div>
    <div class="cards">${M.DYN.map(card).join('')}</div></div>`;
  page.querySelector('.wrap').addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { e.preventDefault(); ask(`Supprime la liste todo « ${M.LISTS[d.dataset.del]?.name || d.dataset.del} » (garde les tâches dans la base).`); return; }
    if (e.target.closest('#newlist')) ask('Crée une nouvelle liste todo « … » avec ces tâches : ');
  });
}

// Détail d'une liste : ses tâches, avec chips, sous-tâches, et (curée) le ✕ pour l'en retirer.
async function renderList(id) {
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Todo', hash: '#/todo' }, { label: '…', hash: '#/todo/' + encodeURIComponent(id) }]);
  page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
  const M = await todoModel();
  const L = M.LISTS[id];
  if (!L) { location.hash = '#/todo'; return; }
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Todo', hash: '#/todo' }, { label: L.name, hash: '#/todo/' + encodeURIComponent(id) }]);
  const ids = L.stat ? L.refs.filter((i) => M.BASE[i]) : L.q();
  const open = ids.filter((i) => !M.BASE[i].done).length;
  const withSubs = (tid, opts) => taskHTML(M, tid, opts) + M.BASE[tid].sub.filter((s) => M.BASE[s]).map((s) => taskHTML(M, s, { sub: true })).join('');
  let h = `<div class="wrap narrow"><div class="chead"><div class="aico" style="--dc:var(${L.color})">${L.ico}</div><div><h1>${esc(L.name)}</h1><div class="lede">${open} à faire · ${L.stat ? 'liste curée (références)' : 'vue dynamique (requête)'}</div></div>${L.stat ? '<div style="flex:1"></div><button class="delbtn" id="dellist">🗑 Supprimer</button>' : ''}</div>`;
  h += `<div class="refnote">${L.stat ? '⛓ Références vers la base — cocher met à jour partout.' : '⚙︎ Filtre calculé sur la base — se met à jour tout seul.'}</div>`;
  if (id === 'base') {
    const doms = [...new Set(M.allIds().map((i) => M.BASE[i].dom).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const groups = doms.length ? [...doms, null] : [null];
    h += groups.map((dom) => {
      const g = M.allIds().filter((i) => (M.BASE[i].dom || null) === dom);
      if (!g.length) return '';
      const openG = g.filter((i) => !M.BASE[i].done).length;
      return `<div class="grp"><h3>${esc(dom || 'Sans domaine')}<span class="c">${openG}</span></h3>` + g.map((t) => withSubs(t, { mem: true })).join('') + '</div>';
    }).join('');
  } else {
    h += ids.map((t) => withSubs(t, L.stat ? { list: id } : { dom: true, mem: true })).join('') || '<div class="empty">Rien ici.</div>';
  }
  page.innerHTML = h + '</div>';
  labelMemLinks(page);
  // Recalcule les compteurs affichés depuis M.BASE, qu'un geste vient de muter.
  const recount = () => {
    const lede = page.querySelector('.chead .lede');
    if (lede) lede.textContent = lede.textContent.replace(/^\d+ à faire/, `${ids.filter((i) => !M.BASE[i].done).length} à faire`);
    page.querySelectorAll('.grp').forEach((g) => {
      const c = g.querySelector('h3 .c');
      if (c) c.textContent = [...g.querySelectorAll('.task:not(.sub)')].filter((t) => !t.classList.contains('done')).length;
    });
  };
  const paint = (cb, done) => {
    cb.classList.toggle('on', done);
    cb.closest('.task').classList.toggle('done', done);
    cb.title = done ? 'Marquer à faire' : 'Marquer faite';
    recount();
  };
  page.querySelector('.wrap').addEventListener('click', async (e) => {
    // Cocher est un GESTE (D28) : POST direct, affichage optimiste, zéro tour de LLM.
    // Retirer d'une liste / la supprimer touchent au `refs:` — ça reste du jugement,
    // donc un message à Alfred (D27).
    const cb = e.target.closest('.cbox');
    if (cb) {
      const x = M.BASE[cb.dataset.id]; if (!x) return;
      const done = !x.done;
      x.done = done; paint(cb, done);
      if (!(await tickTask(x.id, done))) { x.done = !done; paint(cb, !done); }  // échec : on révoque
      return;
    }
    const rm = e.target.closest('[data-rm]'); if (rm) { const x = M.BASE[rm.dataset.rm]; ask(`Retire « ${x.t} » de la liste « ${L.name} ».`); return; }
    if (e.target.closest('#dellist')) ask(`Supprime la liste todo « ${L.name} » (garde les tâches dans la base).`);
  });
}

/* ── Planifications (D30) ─────────────────────────────────────────
   Onglet en LECTURE. Créer, modifier, suspendre passent par Alfred (ask()) : le
   corps d'une fiche planif EST le prompt exécuté sans personne devant l'écran, ça
   se relit avant de tourner. Le cron n'est PAS reparsé ici — `next` vient du serveur,
   du même parseur que celui qui déclenche, donc l'affichage ne peut pas mentir. */
const PLANIF_DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
// « 2026-07-29T07:00 » (heure LOCALE de la fiche) formaté sans passer par Date :
// parser la chaîne la décalerait du fuseau du navigateur, et une heure fausse sur
// un écran de planification est pire que pas d'heure du tout.
function planifWhen(stamp) {
  if (!stamp) return '—';
  const [d, hm] = stamp.split('T');
  const today = new Date(); const iso = (x) => x.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 864e5);
  if (d === iso(today)) return `aujourd’hui ${hm}`;
  if (d === iso(tomorrow)) return `demain ${hm}`;
  const [y, m, dd] = d.split('-').map(Number);
  return `${PLANIF_DAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] } ${dd}/${m} ${hm}`;
}
function planifAgo(iso) {
  if (!iso) return null;
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'à l’instant';
  if (s < 5400) return `il y a ${Math.round(s / 60)} min`;
  if (s < 172800) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
async function renderPlanif() {
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Planifications', hash: '#/planif' }]);
  page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
  let data = { planifs: [] };
  try {
    const r = await fetch('/api/planif', { headers: headers(false), cache: 'no-store' });
    if (r.ok) data = await r.json();
  } catch {}
  const card = (p) => {
    const last = p.last || null;
    const foot = last
      ? `<span class="cnt">${last.ok ? '✓' : '✕'} <span class="z">${esc(planifAgo(last.at) || '')}</span></span>`
      : '<span class="cnt"><span class="z">jamais exécutée</span></span>';
    const state = p.erreur
      ? '<span class="kind" style="color:var(--crit)">⚠ invalide</span>'
      : (p.actif ? '<span class="kind dyn">● active</span>' : '<span class="kind">⏸ suspendue</span>');
    const meta = p.erreur
      ? `<span class="chip late">${esc(p.erreur)}</span>`
      : `<span class="chip">⏱ ${esc(p.quand)}</span>` + (p.actif ? `<span class="chip due">→ ${esc(planifWhen(p.next))}</span>` : '');
    // Une planif ne vit plus forcément dans un magasin de mémoire : son dossier se
    // déclare désormais à part (`GW_PLANIF_DIR`), parce que le corps d'une fiche
    // `type: planif` est une INSTRUCTION exécutée — donc du versionné — alors que la
    // mémoire, elle, a quitté git. Le serveur nous dit `dans_memoire` ; sans lui on
    // fabriquerait un `#/mem/…` qui ne résout pas, et un lien mort dans une liste se
    // lit comme une panne (on clique, rien ne se passe). Absent = ancien serveur, on
    // retombe sur le lien, qui était alors toujours valide.
    const lie = p.dans_memoire !== false;
    const tag = lie ? 'a' : 'div';
    return `<${tag} class="lcard"${lie ? ` href="#/mem/${esc(p.path)}"` : ''} style="--lc:var(--${p.erreur ? 'crit' : p.actif ? 'agenda' : 'line'})">`
      + `<button class="del" data-toggle="${esc(p.id)}" title="${p.actif ? 'Suspendre' : 'Réactiver'}">${p.actif ? '⏸' : '▶'}</button>`
      + `<span class="lico">⏱</span><div><div class="ln">${esc(p.titre)}</div><div class="ld">${esc(p.tz)}</div></div>`
      + `<div class="meta" style="display:flex;gap:6px;flex-wrap:wrap">${meta}</div>`
      + `<div class="lfoot">${foot}${state}</div></${tag}>`;
  };
  const list = data.planifs || [];
  page.innerHTML = `<div class="wrap"><div class="chead"><div class="aico" style="--dc:var(--agenda)">⏱</div><div><h1>Planifications</h1>
      <div class="lede">Des tâches qu'Alfred exécute à l'heure dite. Elles rangent — elles ne notifient jamais.</div></div></div>
    <div class="grouplabel">Vos planifications <span class="hint">— une fiche, dont le corps est l'instruction</span></div>
    <div class="cards">${list.map(card).join('')}<button class="lcard newcard" id="newplanif"><span class="plus">＋</span>Nouvelle planification</button></div>
    ${list.length ? '' : '<div class="empty">Aucune planification. Demandez-m’en une.</div>'}</div>`;
  page.querySelector('.wrap').addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) {
      e.preventDefault();
      const p = list.find((x) => x.id === t.dataset.toggle);
      ask(`${p.actif ? 'Suspends' : 'Réactive'} la planification « ${p.titre} ».`);
      return;
    }
    if (e.target.closest('#newplanif')) {
      e.preventDefault();
      ask('Crée une planification « … » : à … (heure et récurrence), pour … (ce qu’elle doit faire).');
    }
  });
}

/* ── Tunnel VS Code ──────────────────────────────────────────────── */
/* ── Réglages ⚙ (thème, tunnel VS Code) ──────────────────────────── */
const setModal = $('settings-modal');
// Version : lue à l'ouverture du panneau (pas au chargement de la page) — elle
// reflète ainsi le serveur qui répond VRAIMENT, pas un bundle mis en cache.
async function showVersion() {
  const el = $('set-version');
  try {
    const r = await fetch('/api/version', { headers: headers(false), cache: 'no-store' });
    el.textContent = 'agent-gw ' + ((await r.json()).version || '?');
  } catch { el.textContent = 'agent-gw — version indisponible'; }
}
$('gear').addEventListener('click', () => { setModal.hidden = false; showVersion(); });
$('settings-close').addEventListener('click', () => { setModal.hidden = true; });
setModal.addEventListener('click', (e) => { if (e.target === setModal) setModal.hidden = true; });
$('set-theme').addEventListener('click', toggleTheme);
// Déconnexion : purge la session gateway et rejoue le flux OIDC au retour —
// c'est ce re-login qui ressème le refresh token (rebond rosetta).
$('set-logout').addEventListener('click', () => { window.location.href = '/auth/logout'; });

const tunnelModal = $('tunnel-modal'), tunnelBody = $('tunnel-body');
$('vsc').addEventListener('click', () => { setModal.hidden = true; tunnelModal.hidden = false; refreshTunnel(); });
$('tunnel-close').addEventListener('click', () => { tunnelModal.hidden = true; });
$('tunnel-refresh').addEventListener('click', refreshTunnel);
tunnelModal.addEventListener('click', (e) => { if (e.target === tunnelModal) tunnelModal.hidden = true; });
function fmtAge(s) { if (s < 90) return s + ' s'; if (s < 5400) return Math.round(s / 60) + ' min'; return Math.round(s / 3600) + ' h'; }
async function refreshTunnel() {
  tunnelBody.innerHTML = '<div class="row">chargement…</div>';
  let t;
  try { const r = await fetch('/api/tunnel', { headers: headers(false), cache: 'no-store' }); if (!r.ok) throw new Error(r.status); t = await r.json(); }
  catch (e) { tunnelBody.innerHTML = '<div class="row">État indisponible (' + esc(String(e)) + ').</div>'; return; }
  $('vsc').classList.toggle('pending', !!t.pending);
  $('gear').classList.toggle('pending', !!t.pending);
  tunnelBody.innerHTML = '';
  if (!t.available) { tunnelBody.innerHTML = '<div class="row">Pas de journal de tunnel (image claude-pod ≥ 0.2.0 requise).</div>'; return; }
  if (t.pending && t.code) {
    tunnelBody.insertAdjacentHTML('beforeend', '<div class="row">Appairage GitHub — entrez ce code :</div>');
    const c = document.createElement('button'); c.className = 'code'; c.textContent = t.code;
    c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(t.code); c.textContent = 'copié ✓'; setTimeout(() => { c.textContent = t.code; }, 1500); } catch {} });
    tunnelBody.appendChild(c);
    if (t.deviceUrl) { const a = document.createElement('a'); a.className = 'golink'; a.href = t.deviceUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Ouvrir ' + new URL(t.deviceUrl).hostname; tunnelBody.appendChild(a); }
  } else {
    tunnelBody.insertAdjacentHTML('beforeend', '<div class="row">Aucun appairage en attente (dernier signe de vie il y a ' + fmtAge(t.age) + ').</div>');
  }
  if (t.openUrl) { const a = document.createElement('a'); a.className = 'golink sub'; a.href = t.openUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Ouvrir dans vscode.dev →'; tunnelBody.appendChild(a); }
}
async function pollTunnel() { try { const r = await fetch('/api/tunnel', { headers: headers(false), cache: 'no-store' }); if (r.ok) { const t = await r.json(); $('vsc').classList.toggle('pending', !!t.pending); $('gear').classList.toggle('pending', !!t.pending); } } catch {} }
setInterval(pollTunnel, 120000);

/* ── Connexion Claude (abonnement du pod) ────────────────────────── */
/* Le corps pilote `claude setup-token` : on affiche l'URL d'autorisation,
   l'humain autorise dans son navigateur puis colle le code. Le token reste
   côté serveur ; ici on ne voit que l'état. */
const claudeModal = $('claude-modal'), claudeBody = $('claude-body');
let claudeSession = null;
$('claude-login').addEventListener('click', () => { setModal.hidden = true; claudeModal.hidden = false; claudeStatus(); });
$('claude-close').addEventListener('click', () => { claudeModal.hidden = true; });
claudeModal.addEventListener('click', (e) => { if (e.target === claudeModal) claudeModal.hidden = true; });
function claudeRow(html) { claudeBody.insertAdjacentHTML('beforeend', '<div class="row">' + html + '</div>'); }
async function claudeStatus() {
  claudeBody.innerHTML = '<div class="row">chargement…</div>';
  let s;
  try { const r = await fetch('/api/claude-token/status', { headers: headers(false), cache: 'no-store' }); if (!r.ok) throw new Error(r.status); s = await r.json(); }
  catch (e) { claudeBody.innerHTML = '<div class="row">État indisponible (' + esc(String(e)) + ').</div>'; return; }
  claudeBody.innerHTML = '';
  claudeRow(s.tokenPresent
    ? 'Token enregistré' + (s.savedAt ? ' le ' + new Date(s.savedAt * 1000).toLocaleDateString('fr-FR') : '') + ' (valable 1 an).'
    : 'Aucun token géré ici — le pod vit sur ses credentials <code>claude login</code>.');
  const b = document.createElement('button');
  b.className = 'golink'; b.type = 'button';
  b.textContent = s.tokenPresent ? 'Renouveler le token' : 'Connecter l’abonnement';
  b.addEventListener('click', claudeStart);
  claudeBody.appendChild(b);
}
async function claudeStart() {
  claudeBody.innerHTML = '<div class="row">Préparation du lien… (quelques secondes)</div>';
  let d;
  try {
    const r = await fetch('/api/claude-token/start', { method: 'POST', headers: headers(false) });
    d = await r.json();
    if (!r.ok) throw new Error(d.detail || r.status);
  } catch (e) { claudeBody.innerHTML = '<div class="row">Échec : ' + esc(String(e.message || e)) + '</div>'; return; }
  claudeSession = d.sessionId;
  claudeBody.innerHTML = '';
  claudeRow('1. Ouvre ce lien, connecte-toi au compte Claude et autorise :');
  const a = document.createElement('a');
  a.className = 'golink'; a.href = d.authorizeUrl; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = 'Ouvrir la page d’autorisation';
  claudeBody.appendChild(a);
  claudeRow('2. Colle ici le code affiché à la fin :');
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'code d’autorisation'; inp.className = 'code-in';
  inp.style.cssText = 'width:100%;padding:8px;font-family:monospace';
  claudeBody.appendChild(inp);
  const ok = document.createElement('button');
  ok.className = 'golink'; ok.type = 'button'; ok.textContent = 'Valider le code';
  ok.addEventListener('click', async () => {
    if (!inp.value.trim()) return;
    ok.disabled = true; ok.textContent = 'Échange du code…';
    try {
      const r = await fetch('/api/claude-token/code', {
        method: 'POST', headers: headers(true),
        body: JSON.stringify({ sessionId: claudeSession, code: inp.value.trim() }),
      });
      const d2 = await r.json();
      if (!r.ok) throw new Error(d2.detail || r.status);
      claudeStatus();
    } catch (e) {
      ok.disabled = false; ok.textContent = 'Valider le code';
      claudeRow('Échec : ' + esc(String(e.message || e)));
    }
  });
  claudeBody.appendChild(ok);
}

/* ── Quotas Claude (fenêtres d'usage de l'abonnement) ────────────── */
/* Le corps relaie le guichet d'usage d'Anthropic (cache serveur 3 min — l'amont
   rate-limite) : pourcentage consommé par fenêtre + heure de remise à zéro.
   Les fenêtres réelles sont la session de 5 h et les plafonds hebdomadaires —
   il n'existe pas de quota « jour » côté Anthropic. */
const usageModal = $('usage-modal'), usageBody = $('usage-body');
$('claude-usage').addEventListener('click', () => { setModal.hidden = true; usageModal.hidden = false; refreshUsage(); });
$('usage-close').addEventListener('click', () => { usageModal.hidden = true; });
$('usage-refresh').addEventListener('click', refreshUsage);
usageModal.addEventListener('click', (e) => { if (e.target === usageModal) usageModal.hidden = true; });
const USAGE_WINDOWS = [
  ['five_hour', 'Session (5 h)'],
  ['seven_day', 'Semaine — tous modèles'],
  ['seven_day_opus', 'Semaine — Opus'],
  ['seven_day_sonnet', 'Semaine — Sonnet'],
];
function fmtReset(iso) {
  const t = new Date(iso);
  if (isNaN(t)) return '';
  const min = Math.floor((t - Date.now()) / 60000);
  if (min <= 1) return 'remise à zéro imminente';
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  const dur = d ? d + ' j ' + h + ' h' : h ? h + ' h ' + String(m).padStart(2, '0') : m + ' min';
  const hm = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const at = d ? t.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ' ' + hm : hm;
  return 'remise à zéro dans ' + dur + ' (' + at + ')';
}
async function refreshUsage() {
  usageBody.innerHTML = '<div class="row">chargement…</div>';
  let u;
  try { const r = await fetch('/api/claude-token/usage', { headers: headers(false), cache: 'no-store' }); if (!r.ok) throw new Error(r.status); u = await r.json(); }
  catch (e) { usageBody.innerHTML = '<div class="row">État indisponible (' + esc(String(e)) + ').</div>'; return; }
  if (!u.available) { usageBody.innerHTML = '<div class="row">' + esc(u.reason || 'Quotas indisponibles.') + '</div>'; return; }
  const d = u.usage || {};
  usageBody.innerHTML = '';
  for (const [key, label] of USAGE_WINDOWS) {
    const w = d[key];
    if (!w || w.utilization == null) continue; // fenêtre absente = plan sans ce plafond, pas un zéro
    const pct = Math.max(0, Math.min(100, Math.round(w.utilization)));
    usageBody.insertAdjacentHTML('beforeend',
      '<div class="usewin' + (pct >= 80 ? ' attn' : '') + '"><div class="uk"><b>' + esc(label) + '</b><span class="upct">' + pct + ' %</span></div>'
      + '<div class="ubar"><i style="width:' + pct + '%"></i></div>'
      + (w.resets_at ? '<div class="ureset">' + esc(fmtReset(w.resets_at)) + '</div>' : '')
      + '</div>');
  }
  if (!usageBody.children.length) usageBody.innerHTML = '<div class="row">Aucune fenêtre active — rien de consommé pour l’instant.</div>';
  const x = d.extra_usage;
  if (x && x.is_enabled) {
    const used = x.used_credits != null ? Number(x.used_credits).toLocaleString('fr-FR') : '?';
    const cap = x.monthly_limit != null ? Number(x.monthly_limit).toLocaleString('fr-FR') : '∞';
    usageBody.insertAdjacentHTML('beforeend', '<div class="row">Crédits supplémentaires : ' + esc(used + ' / ' + cap) + ' ce mois-ci.</div>');
  }
  const read = new Date(u.fetchedAt * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  usageBody.insertAdjacentHTML('beforeend', '<div class="hint">relevé de ' + read + (u.stale ? ' — amont injoignable, dernier relevé connu' : '') + '</div>');
}

/* ── Boot ────────────────────────────────────────────────────────── */
window.addEventListener('hashchange', renderRoute);
(async function boot() {
  // Les modules d'abord : renderRoute() décide sur eux, et un premier rendu fait
  // avec le repli afficherait brièvement des tuiles qui n'existent pas ici.
  // L'index part en parallèle : l'accueil l'attend désormais (habillage déclaré
  // des domaines), autant ne pas le sérialiser derrière l'arbo.
  await Promise.all([loadTree(), loadApps(), loadIndex()]);
  renderRoute();
  syncConfirm();
  pollTunnel();
  refreshSession();
  // Restaure la conversation depuis le transcript serveur (source de vérité).
  try {
    const r = await fetch('/api/history', { headers: headers(false) });
    if (r.status === 401) { onUnauthorized(); return; }
    if (r.ok) renderHistory((await r.json()).messages);
  } catch {}
  // APRÈS le rendu de l'historique, jamais avant : `historyLen` doit être posé
  // pour que le resync de fin de tour sache que le transcript a grandi.
  adoptRunningTurn();
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
