// Alfred — launcher shell (nouvelle UI, passe 1).
// Bundlé par esbuild -> launcher.js. Réutilise le moteur de fiches (window.Alfred,
// engine.js chargé avant) et marked/DOMPurify (vendors) pour le chat, comme l'ancienne UI.
// Sert à /app en parallèle de / (ancienne UI) le temps de la migration.
import './launcher.css';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Statut de frontmatter -> classe de pastille (.stat). Tolérant, défaut = accent.
const sc = (s) => ({
  'en cours': 'encours', 'en-cours': 'encours', 'encours': 'encours',
  'bloqué': 'bloque', 'bloque': 'bloque', 'en attente': 'bloque',
  'clos': 'clos', 'fait': 'clos', 'terminé': 'clos', 'choix fait': 'clos', 'décidé': 'clos',
  'idée': 'idee', 'idee': 'idee', 'en réflexion': 'idee', 'réflexion': 'idee',
  'acheté': 'achete', 'achete': 'achete', 'offert': 'offert',
  'à acheter': 'aacheter', 'a acheter': 'aacheter',
  'veille': 'veille', 'référence retenue': 'veille', 'reference retenue': 'veille',
}[String(s || '').toLowerCase().trim()] || 'encours');

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
function addTyping() {
  const el = document.createElement('div'); el.className = 'bub al';
  el.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
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

async function sendMessage(text, forceEph, atts) {
  const eph = forceEph !== undefined ? forceEph : ephOn;
  busy = true;
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
      res = await fetch('/api/chat', { method: 'POST', headers: headers(true), body: JSON.stringify({ message: text, model: modelSel.value || undefined, ephemeral: eph || undefined, ephemeral_session: (eph && ephSession) || undefined, attachments: attIds.length ? attIds : undefined }) });
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
        if (ev === 'text') { add('agent', data.text, eph); chat.appendChild(pending); chat.scrollTop = chat.scrollHeight; }
        else if (ev === 'error') add('error', data.message);
        else if (ev === 'done') { if (data.ephemeral) ephSession = data.session_id; else refreshSession(); }
      }
    }
    if (currentRoute().startsWith('dom/') || currentRoute().startsWith('voyage') || currentRoute() === '') { memIndex = null; wbCache = null; loadTreeThen(renderRoute); } // l'agent a pu écrire
  } catch (e) {
    add('error', String(e));
  } finally {
    pending.remove();
    status.classList.remove('busy'); status.title = 'Alfred est au repos';
    busy = false;
    syncConfirm();
    if (queue.length) { const next = queue.shift(); renderQueued(); sendMessage(next.text, undefined, next.atts); }
  }
}
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  const atts = pendingAtts;
  if (!text && !atts.length) return;
  input.value = ''; input.style.height = 'auto';
  pendingAtts = []; renderAtts();
  submitText(text, atts);
});
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); } });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });

/* ── Joindre : picker 📎, coller, glisser-déposer ────────────────── */
$('attach').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files.length) addFiles(fileInput.files); fileInput.value = ''; });
input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); }
});
// Glisser-déposer sur la colonne de chat (desktop ; les navigateurs mobiles
// n'ont pas de DnD vers le DOM — d'où le picker 📎 qui, lui, marche partout).
// On ne réagit qu'à un glissé de FICHIERS ('Files') : les cartes de voyage se
// glissent en 'text/plain' et ne doivent pas déclencher l'overlay.
const chatPane = document.querySelector('.chat'), dropzone = $('dropzone');
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
let dragDepth = 0;
chatPane.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dropzone.classList.add('on'); });
chatPane.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
chatPane.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropzone.classList.remove('on'); });
chatPane.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; dropzone.classList.remove('on'); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
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

/* ── Mode éphémère ⚡ ─────────────────────────────────────────────── */
const ephBtn = $('eph');
const PLACEHOLDER = input.getAttribute('placeholder');
function setEph(v) {
  ephOn = v;
  if (!v) ephSession = null; // la parenthèse se referme
  ephBtn.classList.toggle('on', v);
  input.placeholder = v ? 'Question éphémère — rien ne sera retenu…' : PLACEHOLDER;
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
  if (remaining <= 0) { shield.classList.remove('armed'); shield.textContent = '🛡'; clearInterval(confPoll); confPoll = null; return; }
  shield.classList.add('armed');
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
// Teinte (hue HSL) + glyphe par domaine ; défaut = hash du nom.
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
};
const COLORS = ['todo', 'shop', 'proj', 'agenda', 'maison', 'cuisine', 'achats', 'cadeaux', 'contacts', 'search'];
function metaFor(name) {
  const m = APP_META[name];
  if (m) return { label: m.label, ico: m.ico, color: m.color, module: !!m.module };
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % COLORS.length;
  return { label: prettify(name), ico: '◆', color: COLORS[h], module: false };
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
async function todoStats() {
  try {
    const r = await fetch('/api/memory/raw/' + (memInfo?.todo || 'todo/taches.md'), { headers: headers(false) });
    if (!r.ok) return null;
    const md = await r.text();
    const today = new Date().toISOString().slice(0, 10);
    let total = 0, late = 0, active = false;
    for (const line of md.split('\n')) {
      if (/^##\s+Fait/i.test(line)) { active = false; continue; }
      if (/^##\s/.test(line)) { active = true; continue; }
      const t = active && line.match(/^- \[ \]\s+(.*)/);
      if (t) { total++; const d = t[1].match(/\(échéance:\s*(\d{4}-\d{2}-\d{2})/); if (d && d[1] < today) late++; }
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

/* ── Routeur (hash) + fil d'Ariane ───────────────────────────────── */
function currentRoute() { return decodeURIComponent(location.hash.replace(/^#\/?/, '')); }
$('home').addEventListener('click', () => { location.hash = '#/'; });
$('home2') && $('home2').addEventListener('click', () => { location.hash = '#/'; });

let CR = [];
function crumbs(parts) {
  CR = parts;
  $('crumbs').innerHTML = parts.map((p, i) => i === parts.length - 1
    ? `<span class="c">${esc(p.label)}</span>`
    : `<a class="cb" href="${p.hash}">${esc(p.label)}</a><span class="s">›</span>`).join('');
  $('back').style.display = parts.length > 1 ? 'flex' : 'none';
  const sc = document.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
}
$('back').addEventListener('click', () => { if (CR.length > 1) location.hash = CR[CR.length - 2].hash; });

const page = $('view');
function renderRoute() {
  const route = currentRoute();
  if (window.innerWidth < 900) document.body.classList.toggle('canvas-open', route !== '');
  if (!route) return renderHome();
  if (route.startsWith('mem/')) return renderFiche(route.slice(4));
  // L'app Voyages intercepte son domaine : la tuile générique #/dom/voyages
  // mène au hub (timeline), pas à la collection de fiches.
  if (route === 'voyages' || route === 'dom/voyages') return renderVoyagesHub();
  if (route.startsWith('voyage/')) return renderVoyage(decodeURIComponent(route.slice(7)));
  if (route.startsWith('dom/')) return renderDomain(route.slice(4));
  if (route === 'todo') return renderTodo();
  if (route === 'atelier') return renderAtelierHub();
  if (route.startsWith('atelier/')) return renderWorkbook(decodeURIComponent(route.slice(8)));
  renderHome();
}

function tileHTML(id, route, st, foot) {
  const m = metaFor(id);
  return `<a class="tile" href="${route}" style="--tc:var(--${m.color})"><span class="ico">${m.ico}</span><div class="nm">${esc(m.label)}</div><div class="st">${esc(st || '')}</div><div class="foot">${foot || ''}</div></a>`;
}
function renderHome() {
  crumbs([{ label: 'Accueil', hash: '#/' }]);
  const doms = domains().filter((d) => d !== 'atelier' && d !== 'diy');
  const total = memInfo ? memInfo.entries.filter((e) => !e.dir && isFiche(e.path)).length : 0;
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const nAtelier = countIn('domaines/diy/');
  const pc = (n, w = 'fiche') => `<span class="pc">${n} ${w}${n > 1 ? 's' : ''}</span>`;
  const nProjets = countIn('domaines/diy/projets/');
  const tools = [
    tileHTML('todo', '#/todo', 'Vos tâches', ''),
    tileHTML('projets', '#/dom/diy/projets', 'Vos chantiers', pc(nProjets, 'projet')),
    tileHTML('atelier', '#/dom/diy', 'Machines · savoir-faire · outils', pc(nAtelier)),
  ];
  const domTiles = doms.map((d) => {
    const n = countIn(d === 'sujets' ? 'sujets/' : 'domaines/' + d + '/');
    return tileHTML(d, '#/dom/' + d, '', pc(n));
  });
  const hour = new Date().getHours();
  const salut = hour < 18 ? 'Bonjour' : 'Bonsoir';
  page.innerHTML = `<div class="wrap">
    <h1 class="hi">${salut}, Monsieur.<span class="m"> Que puis-je pour vous ?</span></h1>
    <div class="subhi">${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} — ${total} fiches en mémoire.</div>
    <button class="cmd" id="cmdk" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><span class="ph">Demander à Alfred…</span><kbd>⌘K</kbd></button>
    <div id="brief-slot"></div>
    <div class="rowlabel">Transverse</div><div class="mosaic">${tools.join('')}</div>
    <div class="rowlabel">Domaines</div><div class="mosaic">${domTiles.join('')}</div>
  </div>`;
  const cmd = $('cmdk'); if (cmd) cmd.addEventListener('click', () => input.focus());
  todoStats().then((st) => {
    if (!st) return;
    const foot = page.querySelector('.tile[href="#/todo"] .foot');
    if (foot) foot.innerHTML = `<span class="pc">${st.total} à faire</span>${st.late ? `<span class="pc hot">${st.late} en retard</span>` : ''}`;
    const sub = page.querySelector('.subhi');
    if (sub) sub.textContent = `${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} — ${st.total} tâche${st.total > 1 ? 's' : ''} en cours${st.late ? `, dont ${st.late} en retard` : ''}.`;
  });
  voyagesTileInfo().then((v) => {
    const tile = page.querySelector('.tile[href="#/dom/voyages"]');
    if (!v || !tile) return;
    if (v.st) tile.querySelector('.st').textContent = v.st;
    tile.querySelector('.foot').innerHTML = `<span class="pc">${v.n} voyage${v.n > 1 ? 's' : ''}</span>${v.sug ? `<span class="pc hot">${v.sug} suggestion${v.sug > 1 ? 's' : ''}</span>` : ''}`;
  });
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
      for (const p of files) { const v = (memIndex.get(p) || {})[grouping.key]; if (v) counts.set(v, (counts.get(v) || 0) + 1); }
      page.innerHTML = `<div class="wrap" style="--dc:var(--${m.color})"><div class="chead"><div class="aico" style="--dc:var(--${m.color})">${m.ico}</div><div><h1>${esc(prettify(segs.at(-1)))}</h1><div class="lede">Par ${grouping.label} — entrez dans une ${grouping.label}.</div></div></div>
        <div class="grouplabel">Catégories</div><div class="cards">${[...counts.entries()].map(([v, n]) => `<a class="card" href="#/dom/${esc(subpath)}?g=${esc(v)}"><div class="persontop"><span class="avatar">${esc((grouping.labels[v] || v).charAt(0))}</span><span class="ct">${esc(grouping.labels[v] || v)}</span></div><div class="cmeta">${n} projet${n > 1 ? 's' : ''}</div></a>`).join('')}</div></div>`;
      return;
    }
    files = files.filter((p) => (memIndex.get(p) || {})[grouping.key] === groupSel);
  }
  const title = grouping && groupSel ? (grouping.labels[groupSel] || prettify(groupSel)) : (segs.length > 1 ? prettify(segs.at(-1)) : m.label);
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
  if (files.length) {
    if (folders.length) html += `<div class="grouplabel">Fiches</div>`;
    html += `<div class="toolbar"><label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><input id="dq" placeholder="Rechercher…"></label>`;
    if (facetVals.length > 1) html += `<div class="facets" id="facets"><button class="pill on" data-f="">Tous</button>${facetVals.map((v) => `<button class="pill" data-f="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
    html += `</div><div class="cards" id="dcards"></div>`;
  }
  html += `</div>`;
  page.innerHTML = html;
  if (!folders.length && !files.length) { page.querySelector('.wrap').insertAdjacentHTML('beforeend', '<div class="empty">Rien ici pour l’instant.</div>'); return; }

  if (files.length) {
    let activeFacet = null;
    const cardsEl = $('dcards'), dq = $('dq'), facets = $('facets');
    const wbs = grouping ? await loadWorkbooks() : [];
    const draw = () => {
      const q = (dq.value || '').toLowerCase();
      const shown = files.filter((p) => {
        const fm = memIndex.get(p) || {};
        if (activeFacet && fm[facetKey] !== activeFacet) return false;
        return (p + ' ' + (fm.titre || '') + ' ' + (fm.role || '') + ' ' + (Array.isArray(fm.tags) ? fm.tags.join(' ') : '')).toLowerCase().includes(q);
      });
      cardsEl.innerHTML = shown.length ? shown.map((p) => {
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
      }).join('') : '<div class="empty">Aucune fiche.</div>';
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
  let domSegs;
  if (parts[0] === 'domaines') domSegs = parts.slice(1, -1);
  else if (parts[0] === 'sujets') domSegs = ['sujets', ...parts.slice(1, -1)];
  else domSegs = parts.slice(0, -1);
  const cr = [{ label: 'Accueil', hash: '#/' }];
  let acc = '';
  domSegs.forEach((s, i) => { acc = i ? acc + '/' + s : s; cr.push({ label: i === 0 ? metaFor(s).label : prettify(s), hash: '#/dom/' + acc }); });
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
      const { frontmatter: fm, html } = window.Alfred.render(text, { baseDir });
      const doc = document.createElement('div'); doc.className = 'alfred-doc'; doc.innerHTML = html;
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

/* ── App Todo (port du parseur de l'ancienne UI) ─────────────────── */
function mdInline(text) {
  const src = text.replace(/\[\[([^\]]+)\]\]/g, (_, t) => `[${t.trim()}](/mem/${t.trim()})`);
  return DOMPurify.sanitize(marked.parseInline(src));
}
function taskHTML(it, today) {
  let text = it.text;
  const due = text.match(/\(échéance:\s*(\d{4}-\d{2}-\d{2})([^)]*)\)/);
  text = text.replace(/—?\s*\(échéance:[^)]*\)/, '').replace(/\*\(ajouté[^)]*\)\*/, '').trim();
  const clean = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[\[|\]\]/g, '');
  const chips = [];
  if (due) {
    const d = due[1], late = d < today;
    const lbl = d === today ? "aujourd'hui" : d;
    chips.push(`<span class="chip ${late ? 'late' : 'due'}">${late ? '⚠ ' : ''}${esc(lbl)}${esc((due[2] || '').replace(/^,\s*/, ' · '))}</span>`);
  }
  return `<div class="task${it.done ? ' done' : ''}"><button class="cbox${it.done ? ' on' : ''}" data-mark="${esc(clean)}">✓</button><div class="bd"><div class="tt">${mdInline(text)}</div>${chips.length ? `<div class="meta">${chips.join('')}</div>` : ''}</div></div>`;
}
async function renderTodo() {
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Todo', hash: '#/todo' }]);
  page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
  if (!memInfo) await loadTree();
  const todoPath = memInfo?.todo;
  if (!todoPath) { page.innerHTML = '<div class="wrap"><div class="empty">Pas de fichier todo.</div></div>'; return; }
  let md;
  try { const r = await fetch('/api/memory/raw/' + todoPath, { headers: headers(false) }); md = await r.text(); }
  catch { page.innerHTML = '<div class="wrap"><div class="empty">Todo indisponible.</div></div>'; return; }
  const sections = []; let cur = null, item = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.*)/);
    if (h) { cur = { title: h[1], items: [] }; sections.push(cur); item = null; continue; }
    if (!cur) continue;
    const t = line.match(/^- \[([ xX])\]\s+(.*)/);
    if (t) { item = { done: t[1] !== ' ', text: t[2] }; cur.items.push(item); continue; }
    if (item && /^\s+\S/.test(line) && !/^\s*[-*#>]/.test(line)) item.text += ' ' + line.trim(); else item = null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const all = sections.flatMap((s) => s.items);
  const dueOf = (t) => { const m = t.match(/\(échéance:\s*(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
  // Format réel du contrat todo (voir en-tête de todo/taches.md) : (durée: ~Xh) / (durée: X min).
  const estOf = (t) => { const m = t.match(/\(durée\s*:?\s*~?\s*(\d+)\s*min/i); if (m) return +m[1]; const h = t.match(/\(durée\s*:?\s*~?\s*(\d+)\s*h\b/i); return h ? +h[1] * 60 : null; };
  const late = all.filter((i) => !i.done && dueOf(i.text) && dueOf(i.text) < today);
  const rapides = all.filter((i) => !i.done && estOf(i.text) != null && estOf(i.text) <= 30);
  let view = null;

  const dynv = (id, ico, name, arr, c) => `<button class="dynv${view === id ? ' on' : ''}" data-v="${id}" style="--c:var(--${c})"><span class="dico">${ico}</span><span><span class="dn">${name}</span><span class="dc">${arr.length} tâche${arr.length > 1 ? 's' : ''}</span></span></button>`;
  const body = () => {
    if (view === 'late' || view === 'rapides') {
      const arr = view === 'late' ? late : rapides;
      return arr.length ? arr.map((it) => taskHTML(it, today)).join('') : '<div class="empty" style="text-align:left">Aucune tâche dans cette vue.</div>';
    }
    return sections.map((sec) => {
      const open = sec.items.filter((i) => !i.done).length;
      return `<div class="grp"><h3>${esc(sec.title.replace(/\(.*\)/, '').trim())} <span class="c">${sec.items.length ? open : ''}</span></h3>`
        + (sec.items.length ? sec.items.map((it) => taskHTML(it, today)).join('') : '<div class="empty" style="text-align:left;padding:4px 0">rien</div>') + '</div>';
    }).join('');
  };
  const render = () => {
    page.innerHTML = `<div class="wrap"><div class="chead"><div class="aico" style="--dc:var(--todo)">${IC.todo}</div><div><h1>Todo</h1><div class="lede">Vos tâches — cocher demande à Alfred de la marquer faite.</div></div></div>
      <div class="dynviews">${dynv('late', '⚠', 'En retard', late, 'crit')}${dynv('rapides', '◷', 'Rapides', rapides, 'good')}${view ? '<button class="dynv" data-v="all"><span class="dico" style="--c:var(--search)">▦</span><span><span class="dn">Toutes</span><span class="dc">retour</span></span></button>' : ''}</div>
      <div>${body()}</div></div>`;
    labelMemLinks(page);
    page.querySelectorAll('.dynv').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v === 'all' ? null : (view === b.dataset.v ? null : b.dataset.v); render(); }));
    page.querySelector('.wrap').addEventListener('click', (e) => {
      const cb = e.target.closest('.cbox[data-mark]'); if (!cb || cb.classList.contains('on')) return;
      input.value = 'Marque cette tâche comme faite : « ' + cb.dataset.mark + ' »';
      input.focus(); input.dispatchEvent(new Event('input'));
    });
  };
  render();
}

/* ── App Atelier / workbook menuiserie (port de l'ancienne UI) ───── */
let wb = null;       // {path, data, state, byEtq}
let wbTab = 'debit';
const wbDone = (etq) => !!(wb.state.fait || {})[etq];
const pieceDims = (p) => `${p.longueur}×${p.largeur}×${p.ep}`;

// Conteneurs créés une fois : modale pièce + mode atelier plein écran.
const pieceModal = document.createElement('div');
pieceModal.className = 'modal'; pieceModal.hidden = true;
pieceModal.innerHTML = '<div class="card"><div class="piece-body" id="piece-body"></div></div>';
pieceModal.addEventListener('click', (e) => { if (e.target === pieceModal) pieceModal.hidden = true; });
document.body.appendChild(pieceModal);
const atelierFull = document.createElement('div');
atelierFull.className = 'atelier-full'; atelierFull.hidden = true;
atelierFull.innerHTML = '<button class="close" id="atelier-close">✕</button><div id="atelier-body"></div>';
atelierFull.querySelector('#atelier-close').addEventListener('click', () => { atelierFull.hidden = true; });
document.body.appendChild(atelierFull);

async function renderAtelierHub() {
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'L’Atelier', hash: '#/atelier' }]);
  page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
  let list;
  try { const r = await fetch('/api/workbook/list', { headers: headers(false), cache: 'no-store' }); list = (await r.json()).workbooks; }
  catch { page.innerHTML = '<div class="wrap"><div class="empty">Atelier indisponible.</div></div>'; return; }
  let html = `<div class="wrap" style="--dc:var(--shop)"><div class="chead"><div class="aico" style="--dc:var(--shop)">${IC.shop}</div><div><h1>L’Atelier</h1><div class="lede">Suivi menuiserie — vos plans de débit.</div></div></div>`;
  if (!list.length) { page.innerHTML = html + '<div class="empty">Aucun workbook — demandez à Alfred d’en générer un (skill menuiserie).</div></div>'; return; }
  html += '<div class="grouplabel">Workbooks</div><div class="cards">';
  for (const w of list) {
    const pct = w.pieces ? Math.round(100 * w.done / w.pieces) : 0;
    const last = w.lastActivity ? new Date(w.lastActivity).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'jamais';
    html += `<a class="card" href="#/atelier/${encodeURIComponent(w.path)}"><div class="ct">${esc(w.titre)}</div><div class="cmeta">${w.done}/${w.pieces} pièces · ${esc(last)}</div><div class="bar"><i style="width:${pct}%"></i></div></a>`;
  }
  page.innerHTML = html + '</div></div>';
}

async function renderWorkbook(path) {
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'L’Atelier', hash: '#/atelier' }, { label: '…', hash: '#/atelier/' + encodeURIComponent(path) }]);
  page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
  let data, state;
  try {
    const [rd, rs] = await Promise.all([
      fetch('/api/memory/raw/' + path, { headers: headers(false), cache: 'no-store' }),
      fetch('/api/workbook/state?wb=' + encodeURIComponent(path), { headers: headers(false), cache: 'no-store' }),
    ]);
    if (!rd.ok) throw new Error(rd.status);
    data = await rd.json(); state = await rs.json();
  } catch (e) { page.innerHTML = '<div class="wrap"><div class="empty">Workbook illisible (' + esc(String(e)) + ').</div></div>'; return; }
  wb = { path, data, state, byEtq: new Map((data.pieces || []).map((p) => [p.etiquette, p])) };
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'L’Atelier', hash: '#/atelier' }, { label: data.titre || data.projet || 'Workbook', hash: '#/atelier/' + encodeURIComponent(path) }]);
  renderWb();
}

async function tick(etq, done) {
  try { const r = await fetch('/api/workbook/state', { method: 'POST', headers: headers(true), body: JSON.stringify({ wb: wb.path, etiquette: etq, done }) }); if (r.ok) wb.state = await r.json(); } catch {}
  renderWb();
  if (!atelierFull.hidden) renderShop();
}

function renderWb() {
  const d = wb.data;
  const total = (d.pieces || []).length;
  const done = Object.keys(wb.state.fait || {}).filter((e) => wb.byEtq.has(e)).length;
  const pct = total ? Math.round(100 * done / total) : 0;
  const tabs = [['debit', 'Débit'], ['prepas', 'Prépas'], ['assemblage', 'Assemblage'], ['suivi', 'Suivi']];
  page.innerHTML = `<div class="wrap" style="--dc:var(--shop)">
    <div class="chead"><div class="aico" style="--dc:var(--shop)">${IC.shop}</div><div><h1>${esc(d.titre || d.projet || 'Workbook')}</h1><div class="lede">Workbook menuiserie · ${done}/${total} débité</div></div><span style="flex:1"></span><button class="tag" id="shopmode" style="cursor:pointer;padding:8px 14px;border-color:var(--shop);color:var(--shop)">▶ Mode atelier</button></div>
    <div class="prog"><i style="width:${pct}%"></i></div>
    <div class="wbtabs">${tabs.map(([id, l]) => `<button class="wbtab${wbTab === id ? ' on' : ''}" data-w="${id}">${l}</button>`).join('')}</div>
    <div id="wbbody"></div></div>`;
  const body = $('wbbody');
  if (wbTab === 'debit') renderDebit(body);
  else if (wbTab === 'prepas') renderPrepas(body);
  else if (wbTab === 'assemblage') renderAsm(body);
  else renderSuivi(body);
  page.querySelectorAll('.wbtab').forEach((t) => t.addEventListener('click', () => { wbTab = t.dataset.w; renderWb(); }));
  $('shopmode').addEventListener('click', () => { atelierFull.hidden = false; renderShop(); });
}

// Plan de débit SVG à l'échelle (blueprint). Le workbook.json (émis par la skill
// menuiserie) ne fournit PAS les positions physiques : `colonnes` = groupes de RÉGLAGE
// de scie, la plaque brute vient de meta.plaque (ex. « 2800 × 2070 mm »). On dessine
// donc un nesting en bandes (shelf) : pièces à l'échelle réelle (longueur × largeur),
// posées de gauche à droite, retour à la ligne au bord de plaque — approximation
// honnête d'un calepinage, pas une promesse de placement exact.
function cutSVG(pan) {
  const pm = String(wb.data.meta?.plaque || '').match(/(\d+)\s*[×x]\s*(\d+)/);
  const W = pm ? +pm[1] : 2800, H = pm ? +pm[2] : 2070;
  const kerf = wb.data.meta?.kerf || 4;
  const S = 0.30, pad = 40, top = 46, gap = Math.max(kerf, 12);
  const SW = W * S;
  // Pré-calcul du placement (unités mm), pour connaître la hauteur consommée.
  const placed = [];
  let x = gap, y = gap, rowH = 0;
  for (const c of pan.colonnes || []) {
    for (const etq of c.pieces || []) {
      const p = wb.byEtq.get(etq) || {};
      const w = p.longueur || 0, h = p.largeur || 0;
      if (x + w > W - gap && x > gap) { x = gap; y += rowH + gap; rowH = 0; }
      placed.push({ etq, x, y, w, h, reglage: c.reglageFS || '' });
      x += w + gap; rowH = Math.max(rowH, h);
    }
  }
  // Cadre = zone réellement occupée (la disposition est indicative : si le métrage
  // dépasse une plaque physique, on ne ment pas en tronquant — on enveloppe tout).
  const usedH = Math.max(y + rowH + gap, H * 0.25);
  const SH = usedH * S;
  const vw = SW + pad * 2, vh = SH + top + pad;
  let g = `<g transform="translate(${pad},${top})"><rect x="0" y="0" width="${SW}" height="${SH}" rx="3" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>`;
  for (const pc of placed) {
    const d = wbDone(pc.etq);
    const col = d ? 'var(--good)' : 'var(--shop)';
    const px = pc.x * S, py = pc.y * S, pw = pc.w * S, ph = pc.h * S;
    const short = pc.etq.replace(/^[^-]+-/, '');
    const fontE = Math.max(9, Math.min(13, pw / (short.length * 0.75)));
    g += `<g class="cut" data-et="${esc(pc.etq)}"><rect class="pcc" x="${px}" y="${py}" width="${pw}" height="${ph}" rx="3" fill="${col}" fill-opacity="${d ? .26 : .28}" stroke="${col}" stroke-width="2"/><text x="${px + pw / 2}" y="${py + ph / 2 - 1}" text-anchor="middle" fill="var(--ink)" font-family="var(--mono)" font-size="${fontE}" font-weight="700">${esc(short)}</text><text x="${px + pw / 2}" y="${py + ph / 2 + 13}" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--mono)" font-size="9">${pc.w}×${pc.h}</text></g>`;
  }
  return `<svg viewBox="0 0 ${vw} ${vh}"><text x="${pad + SW / 2}" y="${top - 30}" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--mono)" font-size="12">plaque ${W} mm — disposition indicative, groupée par réglage</text>${g}</g></svg>`;
}
function renderDebit(body) {
  const pans = wb.data.calepinage || [];
  if (!pans.length) { body.innerHTML = '<div class="empty">Pas de calepinage.</div>'; return; }
  body.innerHTML = pans.map((pan) => `<div class="blueprint"><div class="bp-inner"><div class="bp-h"><b>PANNEAU ${esc(pan.panneau || '')}</b><span>${esc(pan.dims || '')}</span></div><div class="cutwrap">${cutSVG(pan)}</div></div></div>`).join('')
    + `<div class="legend"><span><i class="sw" style="background:var(--shop);opacity:.5"></i>à débiter</span><span><i class="sw" style="background:var(--good);opacity:.5"></i>débité</span></div><div class="detail" id="det"></div>`;
  body.querySelectorAll('.cut').forEach((g) => g.addEventListener('click', () => {
    const etq = g.dataset.et; const p = wb.byEtq.get(etq) || {};
    const det = $('det'); det.className = 'detail on';
    det.innerHTML = `<h4>${esc(etq)}</h4><div class="dk"><span><b>Cotes</b> ${esc(pieceDims(p))} mm</span><span><b>Réglage</b> ${esc(p.reglageFS || '—')}</span></div>`;
  }));
}
function renderPrepas(body) {
  const rows = (wb.data.pieces || []).filter((p) => (p.preparations || []).length);
  body.innerHTML = rows.length ? rows.map((p) => `<div class="prep-card"><h4 data-piece="${esc(p.etiquette)}">${esc(p.etiquette)} · ${esc(pieceDims(p))}</h4><ul>${p.preparations.map((pr) => `<li><b>${esc(pr.type)}</b> — ${esc(pr.cotes || '')} ${pr.pos ? '· ' + esc(pr.pos) : ''}</li>`).join('')}</ul></div>`).join('') : '<div class="empty">Aucune préparation.</div>';
  body.querySelectorAll('[data-piece]').forEach((h) => h.addEventListener('click', () => showPiece(h.dataset.piece)));
}
function renderAsm(body) {
  const mods = wb.data.assemblage || [];
  body.innerHTML = mods.length ? mods.map((m) => `<div class="asm-card" id="asm-${esc(m.module)}"><h4 style="cursor:default">${esc(m.titre || m.module)}</h4><ol>${(m.sequence || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>`).join('') : '<div class="empty">Pas de séquence d’assemblage.</div>';
}
function suiviGroups() {
  const groups = new Map();
  for (const p of wb.data.pieces || []) { const k = p.reglageFS || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  return groups;
}
function renderSuivi(body) {
  let html = '';
  for (const [reg, pieces] of suiviGroups()) {
    const open = pieces.filter((p) => !wbDone(p.etiquette)).length;
    html += `<div class="sgrp"><div class="sh">${esc(reg)} · ${open ? open + ' restantes' : '✓ terminé'}</div>`;
    for (const p of pieces) {
      html += `<div class="srow${wbDone(p.etiquette) ? ' done' : ''}"><button class="cbox" data-tick="${esc(p.etiquette)}">${wbDone(p.etiquette) ? '✓' : ''}</button><span class="lbl" data-piece="${esc(p.etiquette)}">${esc(p.etiquette)}</span><span class="dim">${esc(pieceDims(p))}${p.panneau ? ' · ' + esc(p.panneau) : ''}</span></div>`;
    }
    html += '</div>';
  }
  body.innerHTML = html || '<div class="empty">Aucune pièce.</div>';
  body.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', () => tick(b.dataset.tick, !wbDone(b.dataset.tick))));
  body.querySelectorAll('.srow [data-piece]').forEach((s) => s.addEventListener('click', () => showPiece(s.dataset.piece)));
}
function showPiece(etq) {
  const p = wb.byEtq.get(etq); if (!p) return;
  const body = pieceModal.querySelector('#piece-body');
  body.innerHTML = `<h2>${esc(etq)}</h2>
    <div class="prow"><b>Dimensions</b><span>${esc(pieceDims(p))} mm — ${esc(p.reglageFS || '')}</span></div>
    <div class="prow"><b>Débit</b><span>panneau ${esc(p.panneau || '?')}, colonne ${esc(String(p.colonne ?? '?'))}</span></div>
    ${(p.preparations || []).length ? `<div class="prow"><b>Préparations</b><span>${p.preparations.map((pr) => esc(`${pr.type} ${pr.cotes || ''} ${pr.pos || ''}`)).join('<br>')}</span></div>` : ''}
    ${p.placeAssemblage ? `<div class="prow"><b>Assemblage</b><span>${esc(p.placeAssemblage)}</span></div>` : ''}`;
  const actions = document.createElement('div'); actions.className = 'actions';
  const tickBtn = document.createElement('button'); tickBtn.textContent = wbDone(etq) ? 'Décocher' : 'Marquer faite ✓';
  tickBtn.addEventListener('click', () => { pieceModal.hidden = true; tick(etq, !wbDone(etq)); });
  const close = document.createElement('button'); close.textContent = 'Fermer';
  close.addEventListener('click', () => { pieceModal.hidden = true; });
  actions.append(tickBtn, close); body.appendChild(actions);
  pieceModal.hidden = false;
}
function renderShop() {
  const bodyEl = atelierFull.querySelector('#atelier-body');
  const ordered = [];
  for (const [, pieces] of suiviGroups()) ordered.push(...pieces);
  const total = ordered.length;
  const remaining = ordered.filter((p) => !wbDone(p.etiquette));
  if (!remaining.length) { bodyEl.innerHTML = `<div class="etq">Terminé 🎉</div><div class="dims">${total} pièces débitées</div>`; return; }
  const cur = remaining[0];
  const doneCount = total - remaining.length;
  bodyEl.innerHTML = `<div class="reg">${esc(cur.reglageFS || '')}</div><div class="etq">${esc(cur.etiquette)}</div>
    <div class="dims">${esc(pieceDims(cur))} mm</div><div class="extra">${esc((cur.preparations || []).map((pr) => pr.type).join(' · ') || '')}</div>`;
  const btn = document.createElement('button'); btn.className = 'done-btn'; btn.textContent = 'FAIT ✓';
  btn.addEventListener('click', () => tick(cur.etiquette, true)); bodyEl.appendChild(btn);
  bodyEl.insertAdjacentHTML('beforeend', `<div class="progress"><div style="width:${Math.round(100 * doneCount / total)}%"></div></div><div class="pcount">${doneCount}/${total} — réglage : ${esc(String(cur.reglageFS || '—'))}</div>`);
}

/* ── App Voyages : timeline par jour + tray de suggestions ───────────
   Spec : images/agent-gw/VOYAGES.md. La donnée (voyage.json) est écrite par
   Alfred ; les gestes (drag & drop) vont dans l'overlay voyage-state.json via
   l'API ; météo et liaisons sont dérivées au rendu, jamais stockées. */
const VTYPE = {
  hebergement: { ico: '🏠', c: '--maison', n: 'hébergement' },
  resto: { ico: '🍽️', c: '--cuisine', n: 'resto' },
  activite: { ico: '🚣', c: '--diy', n: 'activité' },
  visite: { ico: '🏛️', c: '--agenda', n: 'visite' },
  trajet: { ico: '🧭', c: '--proj', n: 'trajet' },
};
const vtypeOf = (t) => VTYPE[t] || { ico: '◆', c: '--voyage', n: t || 'carte' };
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
// Liaison dérivée (VOYAGES.md) : filtre par modes déclarés du voyage, présélection
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
    return { st, n: voyages.length, sug: voyages.reduce((n, v) => n + (v.suggestions || 0), 0) };
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
  html += '<div class="cards">';
  for (const v of list) {
    const dates = v.debut ? `${vfmtDay(v.debut)} → ${vfmtDay(v.fin)}` : 'sans dates — envie à cadrer';
    const foot = [];
    if (v.status) foot.push(`<span class="stat ${sc(v.status)}">${esc(v.status)}</span>`);
    if (v.confirmes) foot.push(`<span class="tag">${v.confirmes} confirmée${v.confirmes > 1 ? 's' : ''}</span>`);
    if (v.suggestions) foot.push(`<span class="tag">💡 ${v.suggestions}</span>`);
    html += `<a class="card" href="#/voyage/${encodeURIComponent(v.path)}"><div class="ct">${esc(v.titre)}</div><div class="cmeta">${esc(dates)}${v.lieux?.length ? ' · ' + esc(v.lieux.join(' → ')) : ''}</div>${foot.length ? `<div class="foot">${foot.join('')}</div>` : ''}</a>`;
  }
  page.innerHTML = html + '</div></div>';
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
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Voyages', hash: '#/voyages' }, { label: data.titre || 'Voyage', hash: '#/voyage/' + encodeURIComponent(path) }]);
  paintVoyage();
}

const vItems = () => (voy.data.items || []).map((it) => ({ ...it, ...(({ ts, ...o }) => o)(voy.state.items?.[it.id] || {}) }));
const vDir = () => voy.path.replace(/assets\/voyage\.json$/, '');
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
  return `<div class="vcard" draggable="true" title="Clic : fiche · Glisser : déplacer" data-vi="${esc(it.id)}" style="--ic:var(${T.c})"><span class="vico">${it.ico || T.ico}</span><div class="bd"><div class="vt">${esc(it.titre || it.id)}</div>${chips.length ? `<div class="vmeta">${chips.join('')}</div>` : ''}</div>${extra || ''}</div>`;
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
      <div class="cards">${allSug.map((i) => `<button class="card" data-open="${esc(i.id)}"><div class="ct">${vtypeOf(i.type).ico} ${esc(i.titre || i.id)}</div><div class="cmeta">${esc(i.hint || '')}</div><div class="foot"><span class="tag">${vtypeOf(i.type).n}</span></div></button>`).join('') || '<div class="empty">Aucune suggestion — demandez-en à Alfred.</div>'}</div></div>`;
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
    return `<div class="vday" data-day="${day}"><div class="vday-h"><span class="dn">${vfmtDay(day)}</span><span class="wx na" data-wx="${day}"></span></div>${band ? `<div class="vband" data-open="${esc(band.id)}">🏠 ${esc(band.titre || band.id)}<span class="fx">${band.debut === day ? 'arrivée' : ''}</span></div>` : ''}<div class="vflow">${flow}</div></div>`;
  }).join('');

  const types = [...new Set(allSug.map((i) => i.type))];
  const tray = `<aside class="vtray"><div class="th">Suggestions <span class="cnt">${allSug.length}</span></div>
    ${types.length > 1 ? `<div class="facets">${['', ...types].map((tp) => `<button class="pill ${(!tp && !voy.filter) || voy.filter === tp ? 'on' : ''}" data-tf="${esc(tp)}">${tp ? vtypeOf(tp).n : 'Tous'}</button>`).join('')}</div>` : ''}
    <div class="traygrid">${sug.map((i) => `<div class="traycard" draggable="true" title="Clic : fiche · Glisser : confirmer" data-vi="${esc(i.id)}" style="--ic:var(${vtypeOf(i.type).c})"><button class="dis" data-dis="${esc(i.id)}" title="Écarter — conservée, jamais reproposée">✕</button><span class="vico">${vtypeOf(i.type).ico}</span><div class="bd"><div class="vt">${esc(i.titre || i.id)}</div>${i.hint ? `<div class="vhint">${esc(i.hint)}</div>` : ''}${i.prix ? `<div class="vmeta"><span class="chip">${esc(i.prix)}</span></div>` : ''}</div></div>`).join('') || '<div class="empty">Rien à trier — demandez des suggestions à Alfred.</div>'}</div>
    <div class="trayfoot">🖐 Une carte sur un jour = confirmée · une carte du planning ici = rendue aux suggestions${nEc ? ` · <button class="eclink" data-ectoggle>${nEc} écartée${nEc > 1 ? 's' : ''} ${voy.showEc ? '▾' : '▸'}</button>` : ''}</div>
    ${voy.showEc && nEc ? `<div class="traygrid">${items.filter((i) => i.statut === 'ecartee').map((i) => `<div class="traycard ec" data-vi="${esc(i.id)}"><button class="dis" data-rest="${esc(i.id)}" title="Reprendre dans les suggestions" style="opacity:1">↺</button><span class="vico">${vtypeOf(i.type).ico}</span><div class="bd"><div class="vt">${esc(i.titre || i.id)}</div>${i.hint ? `<div class="vhint">${esc(i.hint)}</div>` : ''}</div></div>`).join('')}</div>` : ''}</aside>`;

  page.innerHTML = `<div class="wrap" style="--dc:var(--voyage)"><div class="chead"><div class="aico" style="--dc:var(--voyage)">🌴</div><div><h1>${esc(d.titre || 'Voyage')}</h1><div class="lede">${days.length} jours${(d.lieux || []).length ? ' · ' + d.lieux.map((l) => esc(l.nom)).join(' → ') : ''} · liaisons et météo dérivées au rendu</div></div></div>${props}<div class="vwrap"><div class="vtl">${tl}</div>${tray}</div></div>`;

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
  body.innerHTML = `<div class="vhead"><span class="vico">${it.ico || T.ico}</span><div><div class="vst">${esc(it.titre || it.id)}</div><div class="vsub">${T.n} · <span class="stat ${stCls}">${esc(stLbl)}</span> · ${cal}</div></div></div>
    ${desc ? `<div class="vby">🎩 la fiche d’Alfred</div><p class="vdesc">${esc(desc)}</p>` : ''}
    ${chips ? `<div class="vmeta">${chips}</div>` : ''}${src}${docs}
    ${it.statut === 'confirme' && !it.debut ? `<div class="vhour"><span class="vby" style="margin:0">Heure</span><input type="time" id="vh-in" value="${esc(String(it.heure || '').replace('h', ':'))}"><button class="vopen" data-sethour>Poser</button>${it.heure ? '<button class="vopen" data-clearhour>Effacer</button>' : ''}<span class="vhint">optionnelle — l’ordre des cartes fait le déroulé, l’heure l’annote</span></div>` : ''}
    <div class="vactions">${it.web ? `<a class="vopen" href="${esc(it.web)}" target="_blank" rel="noopener">↗ Ouvrir la page</a>` : ''}${it.statut === 'confirme' && !it.debut ? `<button class="vopen" data-untray>↩ Rendre aux suggestions</button>` : ''}${it.statut !== 'ecartee' && !it.debut ? `<button class="vopen crit" data-ecarter>✕ Écarter</button>` : ''}${it.statut === 'ecartee' ? `<button class="vopen" data-restfiche>↺ Reprendre dans les suggestions</button>` : ''}${it.statut === 'suggestion' ? '<span class="trayfoot" style="padding:0">🖐 glissez la carte sur un jour pour confirmer</span>' : ''}
    <span style="flex:1"></span><button class="vopen" data-close>Fermer</button></div>`;
  body.querySelector('[data-close]').addEventListener('click', () => { vModal.hidden = true; });
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

/* ── Tunnel VS Code ──────────────────────────────────────────────── */
/* ── Réglages ⚙ (thème, tunnel VS Code) ──────────────────────────── */
const setModal = $('settings-modal');
$('gear').addEventListener('click', () => { setModal.hidden = false; });
$('settings-close').addEventListener('click', () => { setModal.hidden = true; });
setModal.addEventListener('click', (e) => { if (e.target === setModal) setModal.hidden = true; });
$('set-theme').addEventListener('click', toggleTheme);

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

/* ── Boot ────────────────────────────────────────────────────────── */
window.addEventListener('hashchange', renderRoute);
(async function boot() {
  await loadTree();
  renderRoute();
  syncConfirm();
  pollTunnel();
  refreshSession();
  // Restaure la conversation visible depuis le transcript serveur.
  try {
    const r = await fetch('/api/history', { headers: headers(false) });
    if (r.status === 401) { onUnauthorized(); return; }
    if (r.ok) { const { messages } = await r.json(); for (const m of messages) add(m.role === 'user' ? 'user' : 'agent', m.text); }
  } catch {}
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
