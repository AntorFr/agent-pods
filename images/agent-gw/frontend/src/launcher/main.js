// Alfred — launcher shell (nouvelle UI, passe 1).
// Bundlé par esbuild -> launcher.js. Réutilise le moteur de fiches (window.Alfred,
// engine.js chargé avant) et marked/DOMPurify (vendors) pour le chat, comme l'ancienne UI.
// Sert à /app en parallèle de / (ancienne UI) le temps de la migration.
import './launcher.css';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Statut de frontmatter -> classe de pastille (.stat). Tolérant, défaut = accent.
const sc = (s) => ({ 'en cours': 'encours', 'en-cours': 'encours', 'encours': 'encours', 'bloqué': 'bloque', 'bloque': 'bloque', 'clos': 'clos', 'fait': 'clos', 'terminé': 'clos', 'idée': 'idee', 'idee': 'idee', 'acheté': 'achete', 'achete': 'achete', 'offert': 'offert', 'à acheter': 'aacheter', 'a acheter': 'aacheter', 'veille': 'veille' }[String(s || '').toLowerCase()] || 'encours');

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
$('theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('gw_theme', next);
});

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

/* ── Chat ────────────────────────────────────────────────────────── */
const chat = $('chat'), input = $('input'), status = $('rail-status'), modelSel = $('model');
const BUB = { agent: 'al', user: 'me', error: 'err' };
function add(cls, text) {
  const el = document.createElement('div');
  el.className = 'bub ' + (BUB[cls] || cls);
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
const queue = [];
const queuedEl = $('queued');
function renderQueued() {
  queuedEl.innerHTML = '';
  for (const t of queue) { const c = document.createElement('div'); c.className = 'qc'; c.textContent = t; queuedEl.appendChild(c); }
}
function submitText(text) { if (busy) { queue.push(text); renderQueued(); return; } sendMessage(text); }

async function sendMessage(text) {
  busy = true;
  add('user', text);
  const pending = addTyping();
  status.classList.add('busy');
  try {
    let res;
    const deadline = Date.now() + 180000;
    while (true) {
      res = await fetch('/api/chat', { method: 'POST', headers: headers(true), body: JSON.stringify({ message: text, model: modelSel.value || undefined }) });
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
        if (ev === 'text') { add('agent', data.text); chat.appendChild(pending); chat.scrollTop = chat.scrollHeight; }
        else if (ev === 'error') add('error', data.message);
      }
    }
    if (currentRoute().startsWith('dom/') || currentRoute() === '') { memIndex = null; loadTreeThen(renderRoute); } // l'agent a pu écrire
  } catch (e) {
    add('error', String(e));
  } finally {
    pending.remove();
    status.classList.remove('busy');
    busy = false;
    syncConfirm();
    if (queue.length) { const next = queue.shift(); renderQueued(); sendMessage(next); }
  }
}
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; input.style.height = 'auto';
  submitText(text);
});
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); } });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
$('reset').addEventListener('click', async () => {
  if (!confirm('Repartir sur une session vierge ?')) return;
  await fetch('/api/reset', { method: 'POST', headers: headers(false) });
  chat.innerHTML = ''; queue.length = 0; renderQueued();
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
const prettify = (s) => { s = s.replace(MD_EXT, '').replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
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
function countIn(prefix) {
  if (!memInfo) return 0;
  return memInfo.entries.filter((e) => !e.dir && MD_EXT.test(e.path) && e.path.startsWith(prefix)).length;
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
    if (slash >= 0) folders.add(rest.slice(0, slash));
    else if (!e.dir && MD_EXT.test(rest)) files.push(e.path);
  }
  return { folders: [...folders].sort((a, b) => a.localeCompare(b, 'fr')), files: files.sort() };
}
function ficheCount(prefix) {
  return memInfo.entries.filter((e) => !e.dir && MD_EXT.test(e.path) && e.path.startsWith(prefix) && !e.path.startsWith('sujets/archive')).length;
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
  const total = memInfo ? memInfo.entries.filter((e) => !e.dir && MD_EXT.test(e.path)).length : 0;
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const tools = [tileHTML('todo', '#/todo', 'Vos tâches', ''), tileHTML('atelier', '#/atelier', 'Suivi menuiserie', '<span class="pc">workbooks</span>')];
  const domTiles = doms.map((d) => {
    const n = countIn(d === 'sujets' ? 'sujets/' : 'domaines/' + d + '/');
    return tileHTML(d, '#/dom/' + d, n + ' fiche' + (n > 1 ? 's' : ''), '');
  });
  page.innerHTML = `<div class="wrap">
    <h1 class="hi">Bonsoir, Monsieur.<span class="m"> Que puis-je pour vous ?</span></h1>
    <div class="subhi">${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} — ${total} fiches en mémoire.</div>
    <button class="cmd" id="cmdk" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><span class="ph">Demander à Alfred…</span><kbd>⌘K</kbd></button>
    <div class="rowlabel">Transverse</div><div class="mosaic">${tools.join('')}</div>
    <div class="rowlabel">Domaines</div><div class="mosaic">${domTiles.join('')}</div>
  </div>`;
  const cmd = $('cmdk'); if (cmd) cmd.addEventListener('click', () => input.focus());
}

async function renderDomain(subpath) {
  await loadIndex();
  const segs = subpath.split('/');
  const m = metaFor(segs[0]);
  const cr = [{ label: 'Accueil', hash: '#/' }];
  let acc = '';
  segs.forEach((s, i) => { acc = i ? acc + '/' + s : s; cr.push({ label: i ? prettify(s) : m.label, hash: '#/dom/' + acc }); });
  crumbs(cr);
  const prefix = memPrefix(subpath);
  const { folders, files } = childrenOf(prefix);
  const title = segs.length > 1 ? prettify(segs.at(-1)) : m.label;
  const facetKey = files.some((p) => (memIndex.get(p) || {}).status) ? 'status' : 'type';
  const facetVals = [...new Set(files.map((p) => (memIndex.get(p) || {})[facetKey]).filter(Boolean))].sort();

  let html = `<div class="wrap" style="--dc:var(--${m.color})"><div class="chead"><div class="aico" style="--dc:var(--${m.color})">${m.ico}</div><div><h1>${esc(title)}</h1><div class="lede">${folders.length ? 'Cartes de sous-domaine → fiches.' : 'Cartes → fiche.'}</div></div></div>`;
  if (folders.length) {
    html += `<div class="grouplabel">Sous-domaines</div><div class="cards">`;
    for (const f of folders) {
      const n = ficheCount(prefix + f + '/');
      html += `<a class="card" href="#/dom/${esc(subpath)}/${esc(f)}"><div class="persontop"><span class="avatar">${esc(prettify(f).charAt(0))}</span><span class="ct">${esc(prettify(f))}</span></div><div class="cmeta">${n} fiche${n > 1 ? 's' : ''}</div></a>`;
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
    const draw = () => {
      const q = (dq.value || '').toLowerCase();
      const shown = files.filter((p) => {
        const fm = memIndex.get(p) || {};
        if (activeFacet && fm[facetKey] !== activeFacet) return false;
        return (p + ' ' + (fm.title || '') + ' ' + (Array.isArray(fm.tags) ? fm.tags.join(' ') : '')).toLowerCase().includes(q);
      });
      cardsEl.innerHTML = shown.length ? shown.map((p) => {
        const fm = memIndex.get(p) || {};
        const name = fm.title || prettify(p.split('/').pop());
        const foot = [];
        if (fm.status) foot.push(`<span class="stat ${sc(fm.status)}">${esc(fm.status)}</span>`);
        if (fm.type) foot.push(`<span class="tag">${esc(fm.type)}</span>`);
        (Array.isArray(fm.tags) ? fm.tags : []).slice(0, 2).forEach((t) => foot.push(`<span class="tag">#${esc(t)}</span>`));
        return `<a class="card" href="#/mem/${esc(p)}"><div class="ct">${esc(name)}</div>${foot.length ? `<div class="foot">${foot.join('')}</div>` : ''}</a>`;
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
  const parts = path.split('/');
  const dom = parts[0] === 'domaines' ? parts[1] : parts[0];
  const cr = [{ label: 'Accueil', hash: '#/' }];
  if (APP_META[dom] || parts[0] === 'domaines' || parts[0] === 'sujets') cr.push({ label: metaFor(dom).label, hash: '#/dom/' + dom });
  cr.push({ label: parts.at(-1).replace(MD_EXT, ''), hash: '#/mem/' + path });
  crumbs(cr);
  page.innerHTML = '<div class="wrap"><div class="empty">chargement…</div></div>';
  const baseDir = parts.slice(0, -1).join('/');
  const wrap = document.createElement('div'); wrap.className = 'wrap';
  if (MD_EXT.test(path)) {
    let text;
    try { const r = await fetch('/api/memory/raw/' + path, { headers: headers(false) }); if (!r.ok) throw 0; text = await r.text(); }
    catch { page.innerHTML = '<div class="wrap"><div class="empty">Fiche introuvable.</div></div>'; return; }
    if (window.Alfred?.render) {
      const { html } = window.Alfred.render(text, { baseDir });
      const doc = document.createElement('div'); doc.className = 'alfred-doc'; doc.innerHTML = html; wrap.appendChild(doc);
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
  let html = `<div class="wrap"><div class="chead"><div class="aico" style="--dc:var(--todo)">${IC.todo}</div><div><h1>Todo</h1><div class="lede">Vos tâches, par section — cocher demande à Alfred de la marquer faite.</div></div></div>`;
  for (const sec of sections) {
    const open = sec.items.filter((i) => !i.done).length;
    html += `<div class="grp"><h3>${esc(sec.title.replace(/\(.*\)/, '').trim())} <span class="c">${sec.items.length ? open : ''}</span></h3>`;
    html += sec.items.length ? sec.items.map((it) => taskHTML(it, today)).join('') : '<div class="empty" style="text-align:left;padding:4px 0">rien</div>';
    html += `</div>`;
  }
  page.innerHTML = html + '</div>';
  page.querySelector('.wrap').addEventListener('click', (e) => {
    const b = e.target.closest('.cbox[data-mark]'); if (!b || b.classList.contains('on')) return;
    input.value = 'Marque cette tâche comme faite : « ' + b.dataset.mark + ' »';
    input.focus(); input.dispatchEvent(new Event('input'));
  });
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

// Plan de débit SVG à l'échelle (blueprint) — pièces colorées selon l'état.
function cutSVG(pan) {
  const dm = String(pan.dims || '').match(/(\d+)\s*[×x]\s*(\d+)/);
  const W = dm ? +dm[1] : 2500, H = dm ? +dm[2] : 1250, trim = pan.trim || 15;
  const S = 0.34, pad = 40, top = 46, gap = 20;
  const SW = W * S, SH = H * S, TR = trim * S, vw = SW + pad * 2, vh = SH + top + pad;
  let g = `<g transform="translate(${pad},${top})"><rect x="0" y="0" width="${SW}" height="${SH}" rx="3" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/><rect x="0" y="0" width="${SW}" height="${TR}" fill="var(--shop)" opacity=".16"/><rect x="0" y="0" width="${TR}" height="${SH}" fill="var(--shop)" opacity=".16"/>`;
  let x = TR + gap * S;
  for (const c of pan.colonnes || []) {
    const cw = (c.largeur || 0) * S;
    g += `<text x="${x + cw / 2}" y="-10" text-anchor="middle" fill="var(--shop)" font-family="var(--mono)" font-size="14" font-weight="700">${esc(String(c.largeur || ''))}</text>`;
    let y = TR + gap * S;
    for (const etq of c.pieces || []) {
      const p = wb.byEtq.get(etq) || {}; const l = p.longueur || 0; const ph = l * S; const d = wbDone(etq);
      const col = d ? 'var(--good)' : 'var(--shop)';
      g += `<g class="cut" data-et="${esc(etq)}"><rect class="pcc" x="${x}" y="${y}" width="${cw}" height="${ph}" rx="4" fill="${col}" fill-opacity="${d ? .26 : .28}" stroke="${col}" stroke-width="2"/><text x="${x + cw / 2}" y="${y + ph / 2 - 1}" text-anchor="middle" fill="var(--ink)" font-family="var(--mono)" font-size="12" font-weight="700">${esc(etq.split('-').slice(-2).join('-'))}</text><text x="${x + cw / 2}" y="${y + ph / 2 + 14}" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--mono)" font-size="10">${esc(String(c.largeur || ''))}×${l}</text></g>`;
      y += ph + gap * S;
    }
    x += cw + gap * S;
  }
  return `<svg viewBox="0 0 ${vw} ${vh}"><text x="${pad + SW / 2}" y="${top - 30}" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--mono)" font-size="12">${W} mm</text>${g}</g></svg>`;
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

/* ── Tunnel VS Code ──────────────────────────────────────────────── */
const tunnelModal = $('tunnel-modal'), tunnelBody = $('tunnel-body');
$('vsc').addEventListener('click', () => { tunnelModal.hidden = false; refreshTunnel(); });
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
  tunnelBody.innerHTML = '';
  if (!t.available) { tunnelBody.innerHTML = '<div class="row">Pas de journal de tunnel (image claude-pod ≥ 0.2.0 requise).</div>'; return; }
  if (t.pending && t.code) {
    tunnelBody.insertAdjacentHTML('beforeend', '<div class="row">Appairage GitHub — entrez ce code :</div>');
    const c = document.createElement('button'); c.className = 'code'; c.textContent = t.code;
    c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(t.code); c.textContent = 'copié ✓'; setTimeout(() => { c.textContent = t.code; }, 1500); } catch {} });
    tunnelBody.appendChild(c);
    if (t.deviceUrl) { const a = document.createElement('a'); a.href = t.deviceUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Ouvrir ' + new URL(t.deviceUrl).hostname; a.style.cssText = 'display:block;text-align:center;margin-top:12px'; tunnelBody.appendChild(a); }
  } else {
    tunnelBody.insertAdjacentHTML('beforeend', '<div class="row">Aucun appairage en attente (dernier signe de vie il y a ' + fmtAge(t.age) + ').</div>');
  }
  if (t.openUrl) { const a = document.createElement('a'); a.href = t.openUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Ouvrir dans vscode.dev →'; a.style.cssText = 'display:block;margin-top:10px'; tunnelBody.appendChild(a); }
}
async function pollTunnel() { try { const r = await fetch('/api/tunnel', { headers: headers(false), cache: 'no-store' }); if (r.ok) { const t = await r.json(); $('vsc').classList.toggle('pending', !!t.pending); } } catch {} }
setInterval(pollTunnel, 120000);

/* ── Boot ────────────────────────────────────────────────────────── */
window.addEventListener('hashchange', renderRoute);
(async function boot() {
  await loadTree();
  renderRoute();
  syncConfirm();
  pollTunnel();
  // Restaure la conversation visible depuis le transcript serveur.
  try {
    const r = await fetch('/api/history', { headers: headers(false) });
    if (r.status === 401) { onUnauthorized(); return; }
    if (r.ok) { const { messages } = await r.json(); for (const m of messages) add(m.role === 'user' ? 'user' : 'agent', m.text); }
  } catch {}
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
