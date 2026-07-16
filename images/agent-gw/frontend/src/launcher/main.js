// Alfred — launcher shell (nouvelle UI, passe 1).
// Bundlé par esbuild -> launcher.js. Réutilise le moteur de fiches (window.Alfred,
// engine.js chargé avant) et marked/DOMPurify (vendors) pour le chat, comme l'ancienne UI.
// Sert à /app en parallèle de / (ancienne UI) le temps de la migration.
import './launcher.css';

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
function add(cls, text) {
  let el;
  if (cls === 'agent') { el = renderMd(text, ''); el.classList.add('msg', 'agent'); }
  else { el = document.createElement('div'); el.className = 'msg ' + cls; el.textContent = text; }
  chat.appendChild(el); chat.scrollTop = chat.scrollHeight; return el;
}
function addTyping() {
  const el = document.createElement('div');
  el.className = 'msg agent';
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
  for (const t of queue) { const c = document.createElement('div'); c.className = 'chip'; c.textContent = t; queuedEl.appendChild(c); }
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
const APP_META = {
  todo:     { label: 'Todo',      glyph: '◈', hue: 8,   module: true },
  maison:   { label: 'Maison',    glyph: '⌂', hue: 158 },
  piscine:  { label: 'Piscine',   glyph: '≋', hue: 196 },
  projets:  { label: 'Projets',   glyph: '◳', hue: 232 },
  cadeaux:  { label: 'Cadeaux',   glyph: '❖', hue: 330 },
  contacts: { label: 'Contacts',  glyph: '☏', hue: 268 },
  cuisine:  { label: 'Cuisine',   glyph: '⌘', hue: 24 },
  achats:   { label: 'Achats',    glyph: '⛬', hue: 46 },
  admin:    { label: 'Admin',     glyph: '▤', hue: 210 },
  atelier:  { label: 'L’Atelier', glyph: '⚒', hue: 130, module: true },
  diy:      { label: 'L’Atelier', glyph: '⚒', hue: 130, module: true },
  sujets:   { label: 'Sujets',    glyph: '❯', hue: 188 },
};
function hueFor(name) {
  if (APP_META[name]?.hue != null) return APP_META[name].hue;
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h;
}
function metaFor(name) {
  const m = APP_META[name] || {};
  return { label: m.label || name.charAt(0).toUpperCase() + name.slice(1), glyph: m.glyph || '◆', hue: hueFor(name), module: !!m.module };
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

function crumbs(parts) {
  const el = $('crumbs'); el.innerHTML = '';
  parts.forEach((p, i) => {
    if (i) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '›'; el.appendChild(s); }
    const a = document.createElement('a');
    a.textContent = p.label; a.href = p.hash || '#/';
    if (i === parts.length - 1) a.className = 'here';
    el.appendChild(a);
  });
}

const page = $('page');
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

function renderHome() {
  crumbs([{ label: 'Accueil', hash: '#/' }]);
  page.innerHTML = '';
  const h = document.createElement('div');
  h.innerHTML = `<div class="hello">Bonsoir, Monsieur.<span class="sub">Que puis-je pour vous ?</span></div>`;
  page.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'mosaic';
  const tiles = [
    { id: 'todo', route: '#/todo' },
    { id: 'atelier', route: '#/atelier' },
    ...domains().filter((d) => d !== 'atelier' && d !== 'diy').map((d) => ({ id: d, route: '#/dom/' + d })),
  ];
  for (const t of tiles) {
    const m = metaFor(t.id);
    const count = m.module ? '' : countIn(t.id === 'sujets' ? 'sujets/' : 'domaines/' + t.id + '/') + ' fiches';
    const tile = document.createElement('a');
    tile.className = 'tile'; tile.href = t.route; tile.style.setProperty('--hue', m.hue);
    tile.innerHTML = `<div class="glyph">${m.glyph}</div><div class="t-name">${esc(m.label)}</div><div class="t-count">${esc(count)}</div>`;
    grid.appendChild(tile);
  }
  page.appendChild(grid);
}

async function renderDomain(subpath) {
  await loadIndex();
  const segs = subpath.split('/');
  const m = metaFor(segs[0]);
  const cr = [{ label: 'Accueil', hash: '#/' }];
  let acc = '';
  segs.forEach((s, i) => { acc = i ? acc + '/' + s : s; cr.push({ label: i ? prettify(s) : m.label, hash: '#/dom/' + acc }); });
  crumbs(cr);
  page.innerHTML = '';
  const prefix = memPrefix(subpath);
  const { folders, files } = childrenOf(prefix);

  // Sous-domaines : cartes de regroupement (clic = on descend d'un cran).
  if (folders.length) {
    const title = document.createElement('div'); title.className = 'section-title'; title.textContent = 'Sous-domaines';
    page.appendChild(title);
    const grid = document.createElement('div'); grid.className = 'cards'; page.appendChild(grid);
    for (const f of folders) {
      const n = ficheCount(prefix + f + '/');
      const card = document.createElement('a'); card.className = 'card'; card.href = '#/dom/' + subpath + '/' + f;
      card.innerHTML = `<div class="c-name">${esc(prettify(f))}</div><div class="c-meta"><span class="c-tag">${n} fiche${n > 1 ? 's' : ''}</span></div>`;
      grid.appendChild(card);
    }
  }

  // Fiches de ce niveau : cartes pilotées par le frontmatter + facette.
  if (files.length) {
    if (folders.length) { const t = document.createElement('div'); t.className = 'section-title'; t.textContent = 'Fiches'; page.appendChild(t); }
    const facetKey = files.some((p) => (memIndex.get(p) || {}).status) ? 'status' : 'type';
    const facetVals = [...new Set(files.map((p) => (memIndex.get(p) || {})[facetKey]).filter(Boolean))].sort();
    let activeFacet = null;
    const search = document.createElement('div'); search.className = 'search'; search.innerHTML = '<span>🔍</span>';
    const inp = document.createElement('input'); inp.placeholder = 'Filtrer…'; search.appendChild(inp); page.appendChild(search);
    let facetRow = null;
    const cards = document.createElement('div'); cards.className = 'cards';
    const draw = () => {
      const q = inp.value.toLowerCase();
      cards.innerHTML = '';
      const shown = files.filter((p) => {
        const fm = memIndex.get(p) || {};
        if (activeFacet && fm[facetKey] !== activeFacet) return false;
        return (p + ' ' + (fm.title || '') + ' ' + (Array.isArray(fm.tags) ? fm.tags.join(' ') : '')).toLowerCase().includes(q);
      });
      if (!shown.length) { cards.innerHTML = '<div class="placeholder">Aucune fiche.</div>'; return; }
      for (const p of shown) {
        const fm = memIndex.get(p) || {};
        const name = fm.title || prettify(p.split('/').pop());
        const meta = [];
        if (fm.type) meta.push(fm.type);
        if (fm.status) meta.push(fm.status);
        (Array.isArray(fm.tags) ? fm.tags : []).slice(0, 2).forEach((t) => meta.push('#' + t));
        const card = document.createElement('a'); card.className = 'card'; card.href = '#/mem/' + p;
        card.innerHTML = `<div class="c-name">${esc(name)}</div>` + (meta.length ? `<div class="c-meta">${meta.map((x) => `<span class="c-tag">${esc(x)}</span>`).join('')}</div>` : '');
        cards.appendChild(card);
      }
    };
    if (facetVals.length > 1) {
      facetRow = document.createElement('div'); facetRow.style.cssText = 'display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 2px';
      for (const v of facetVals) {
        const b = document.createElement('button'); b.className = 'c-tag'; b.style.cssText = 'padding:4px 11px;border:1px solid var(--line);border-radius:20px;background:var(--surface);cursor:pointer';
        b.textContent = v;
        b.addEventListener('click', () => {
          activeFacet = activeFacet === v ? null : v;
          [...facetRow.children].forEach((c) => { c.style.borderColor = 'var(--line)'; c.style.color = 'var(--ink-soft)'; });
          if (activeFacet === v) { b.style.borderColor = 'var(--accent)'; b.style.color = 'var(--accent)'; }
          draw();
        });
        facetRow.appendChild(b);
      }
      page.appendChild(facetRow);
    }
    page.appendChild(cards);
    inp.addEventListener('input', draw);
    draw();
  }

  if (!folders.length && !files.length) page.innerHTML = '<div class="placeholder">Rien ici pour l’instant.</div>';
}

async function renderFiche(path) {
  if (path && !/\.[a-z0-9]+$/i.test(path)) path += '.md';
  const parts = path.split('/');
  const dom = parts[0] === 'domaines' ? parts[1] : parts[0];
  const cr = [{ label: 'Accueil', hash: '#/' }];
  if (APP_META[dom] || parts[0] === 'domaines' || parts[0] === 'sujets') cr.push({ label: metaFor(dom).label, hash: '#/dom/' + dom });
  cr.push({ label: parts.at(-1).replace(MD_EXT, ''), hash: '#/mem/' + path });
  crumbs(cr);
  page.innerHTML = '<div class="placeholder">chargement…</div>';
  const baseDir = parts.slice(0, -1).join('/');
  if (MD_EXT.test(path)) {
    let text;
    try { const r = await fetch('/api/memory/raw/' + path, { headers: headers(false) }); if (!r.ok) throw 0; text = await r.text(); }
    catch { page.innerHTML = '<div class="placeholder">Fiche introuvable.</div>'; return; }
    page.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'fiche';
    if (window.Alfred?.render) {
      const { html } = window.Alfred.render(text, { baseDir });
      const doc = document.createElement('div'); doc.className = 'alfred-doc'; doc.innerHTML = html; wrap.appendChild(doc);
    } else { wrap.appendChild(renderMd(text, baseDir)); }
    page.appendChild(wrap);
  } else if (IMG_EXT.test(path)) {
    page.innerHTML = '';
    const img = document.createElement('img'); img.src = '/api/memory/raw/' + path; img.style.maxWidth = '100%'; img.style.borderRadius = '10px';
    page.appendChild(img);
  } else {
    const a = document.createElement('a'); a.href = '/api/memory/raw/' + path + '?download=1'; a.textContent = 'Télécharger ' + parts.at(-1);
    page.innerHTML = ''; page.appendChild(a);
  }
  $('canvas').scrollTop = 0;
}

/* ── App Todo (port du parseur de l'ancienne UI) ─────────────────── */
async function renderTodo() {
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'Todo', hash: '#/todo' }]);
  page.innerHTML = '<div class="placeholder">chargement…</div>';
  if (!memInfo) await loadTree();
  const todoPath = memInfo?.todo;
  if (!todoPath) { page.innerHTML = '<div class="placeholder">Pas de fichier todo.</div>'; return; }
  const baseDir = todoPath.split('/').slice(0, -1).join('/');
  let md;
  try { const r = await fetch('/api/memory/raw/' + todoPath, { headers: headers(false) }); md = await r.text(); }
  catch { page.innerHTML = '<div class="placeholder">Todo indisponible.</div>'; return; }
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
  page.innerHTML = '';
  for (const sec of sections) {
    const open = sec.items.filter((i) => !i.done).length;
    const title = document.createElement('div'); title.className = 'section-title';
    title.textContent = sec.title.replace(/\(.*\)/, '').trim() + (sec.items.length ? ' · ' + open : '');
    page.appendChild(title);
    if (!sec.items.length) { page.insertAdjacentHTML('beforeend', '<div class="placeholder">rien</div>'); continue; }
    for (const it of sec.items) page.appendChild(renderTask(it, baseDir, today));
  }
}
function renderTask(it, baseDir, today) {
  let text = it.text;
  const due = text.match(/\(échéance:\s*(\d{4}-\d{2}-\d{2})([^)]*)\)/);
  text = text.replace(/—?\s*\(échéance:[^)]*\)/, '').replace(/\*\(ajouté[^)]*\)\*/, '').trim();
  const el = document.createElement('div'); el.className = 'card' + (it.done ? ' done' : ''); el.style.flexDirection = 'row'; el.style.alignItems = 'flex-start'; el.style.gap = '10px';
  const box = document.createElement('button');
  box.textContent = it.done ? '☑' : '☐'; box.style.cssText = 'border:none;background:none;font-size:17px;line-height:1.2;color:var(--ink-soft)';
  if (!it.done) box.addEventListener('click', () => {
    input.value = 'Marque cette tâche comme faite : « ' + text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[\[|\]\]/g, '') + ' »';
    input.focus(); input.dispatchEvent(new Event('input'));
  });
  el.appendChild(box);
  const body = document.createElement('div'); body.style.flex = '1'; body.style.minWidth = '0';
  body.appendChild(renderMd(text, baseDir));
  if (due) {
    const d = due[1];
    const b = document.createElement('div'); b.className = 'c-meta';
    const tag = document.createElement('span'); tag.className = 'c-tag';
    tag.style.color = d < today ? 'var(--crit)' : d === today ? 'var(--warn)' : '';
    tag.textContent = (d < today ? '⚠ ' : '') + (d === today ? "aujourd'hui" : d) + (due[2] || '').replace(/^,\s*/, ' · ');
    b.appendChild(tag); body.appendChild(b);
  }
  el.appendChild(body);
  return el;
}

/* ── App Atelier / workbook menuiserie (port de l'ancienne UI) ───── */
let wb = null;       // {path, data, state, byEtq}
let wbTab = 'suivi';
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
  page.innerHTML = '<div class="placeholder">chargement…</div>';
  let list;
  try { const r = await fetch('/api/workbook/list', { headers: headers(false), cache: 'no-store' }); list = (await r.json()).workbooks; }
  catch { page.innerHTML = '<div class="placeholder">Atelier indisponible.</div>'; return; }
  page.innerHTML = '';
  const t = document.createElement('div'); t.className = 'section-title'; t.textContent = 'Suivi menuiserie'; page.appendChild(t);
  if (!list.length) { page.insertAdjacentHTML('beforeend', '<div class="placeholder">Aucun workbook — demandez à Alfred d’en générer un (skill menuiserie).</div>'); return; }
  const grid = document.createElement('div'); grid.className = 'cards'; page.appendChild(grid);
  for (const w of list) {
    const pct = w.pieces ? Math.round(100 * w.done / w.pieces) : 0;
    const last = w.lastActivity ? new Date(w.lastActivity).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';
    const card = document.createElement('a'); card.className = 'card wb-card'; card.href = '#/atelier/' + encodeURIComponent(w.path);
    card.innerHTML = `<div class="c-name">${esc(w.titre)}</div><div class="c-meta"><span class="c-tag">${w.done}/${w.pieces} pièces</span><span>${esc(last)}</span></div><div class="progress"><div style="width:${pct}%"></div></div>`;
    grid.appendChild(card);
  }
}

async function renderWorkbook(path) {
  crumbs([{ label: 'Accueil', hash: '#/' }, { label: 'L’Atelier', hash: '#/atelier' }, { label: '…', hash: '#/atelier/' + encodeURIComponent(path) }]);
  page.innerHTML = '<div class="placeholder">chargement…</div>';
  let data, state;
  try {
    const [rd, rs] = await Promise.all([
      fetch('/api/memory/raw/' + path, { headers: headers(false), cache: 'no-store' }),
      fetch('/api/workbook/state?wb=' + encodeURIComponent(path), { headers: headers(false), cache: 'no-store' }),
    ]);
    if (!rd.ok) throw new Error(rd.status);
    data = await rd.json(); state = await rs.json();
  } catch (e) { page.innerHTML = '<div class="placeholder">Workbook illisible (' + esc(String(e)) + ').</div>'; return; }
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
  page.innerHTML = '';
  const head = document.createElement('div'); head.className = 'wb-head';
  head.innerHTML = `<h2>${esc(d.titre || d.projet || '')}</h2><span class="sub">${done}/${total}</span><span class="spacer"></span>`;
  const shopBtn = document.createElement('button'); shopBtn.className = 'btn-accent'; shopBtn.textContent = '▶ Mode atelier';
  shopBtn.addEventListener('click', () => { atelierFull.hidden = false; renderShop(); });
  head.appendChild(shopBtn); page.appendChild(head);
  const prog = document.createElement('div'); prog.className = 'wb-prog'; prog.style.marginBottom = '16px';
  prog.innerHTML = `<div style="width:${total ? Math.round(100 * done / total) : 0}%"></div>`; page.appendChild(prog);
  const tabs = document.createElement('div'); tabs.className = 'wb-tabs';
  for (const [id, label] of [['debit', 'Débit'], ['prepas', 'Prépas'], ['assemblage', 'Assemblage'], ['suivi', 'Suivi']]) {
    const b = document.createElement('button'); b.textContent = label; b.classList.toggle('active', wbTab === id);
    b.addEventListener('click', () => { wbTab = id; renderWb(); }); tabs.appendChild(b);
  }
  page.appendChild(tabs);
  const body = document.createElement('div'); page.appendChild(body);
  if (wbTab === 'debit') renderDebit(body);
  else if (wbTab === 'prepas') renderPrepas(body);
  else if (wbTab === 'assemblage') renderAsm(body);
  else renderSuivi(body);
}

function pieceBlock(etq) {
  const p = wb.byEtq.get(etq);
  const b = document.createElement('button');
  b.className = 'piece-block' + (wbDone(etq) ? ' done' : ''); b.dataset.etq = etq;
  b.innerHTML = `${esc(etq)}<div class="dims">${p ? esc(pieceDims(p)) : ''}</div>`;
  b.addEventListener('click', () => showPiece(etq));
  return b;
}
function renderDebit(body) {
  for (const pan of wb.data.calepinage || []) {
    const el = document.createElement('div'); el.className = 'panel';
    el.innerHTML = `<h4>${esc(pan.panneau)} — ${esc(pan.dims || '')}</h4>`;
    const cols = document.createElement('div'); cols.className = 'cols';
    for (const col of pan.colonnes || []) {
      const c = document.createElement('div'); c.className = 'col';
      c.innerHTML = `<h5>${esc(String(col.largeur))} mm · ${esc(col.reglageFS || '')}</h5>`;
      for (const etq of col.pieces || []) c.appendChild(pieceBlock(etq));
      cols.appendChild(c);
    }
    el.appendChild(cols); body.appendChild(el);
  }
  if (!(wb.data.calepinage || []).length) body.innerHTML = '<div class="placeholder">pas de calepinage</div>';
}
function renderPrepas(body) {
  let any = false;
  for (const p of wb.data.pieces || []) {
    if (!(p.preparations || []).length) continue;
    any = true;
    const el = document.createElement('div'); el.className = 'prep-card';
    el.innerHTML = `<h4>${esc(p.etiquette)} <span style="color:var(--ink-faint)">· ${esc(pieceDims(p))}</span></h4>
      <ul>${p.preparations.map((pr) => `<li><b>${esc(pr.type)}</b> — ${esc(pr.cotes || '')} ${pr.pos ? '· ' + esc(pr.pos) : ''}</li>`).join('')}</ul>`;
    el.querySelector('h4').style.cursor = 'pointer';
    el.querySelector('h4').addEventListener('click', () => showPiece(p.etiquette));
    body.appendChild(el);
  }
  if (!any) body.innerHTML = '<div class="placeholder">aucune préparation</div>';
}
function renderAsm(body) {
  for (const m of wb.data.assemblage || []) {
    const el = document.createElement('div'); el.className = 'asm-card'; el.id = 'asm-' + m.module;
    el.innerHTML = `<h4>${esc(m.titre || m.module)}</h4><ol>${(m.sequence || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
    body.appendChild(el);
  }
  if (!(wb.data.assemblage || []).length) body.innerHTML = '<div class="placeholder">pas de séquence d’assemblage</div>';
}
function suiviGroups() {
  const groups = new Map();
  for (const p of wb.data.pieces || []) { const k = p.reglageFS || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  return groups;
}
function renderSuivi(body) {
  for (const [reg, pieces] of suiviGroups()) {
    const g = document.createElement('div'); g.className = 'reg-group';
    const open = pieces.filter((p) => !wbDone(p.etiquette)).length;
    g.innerHTML = `<h4>${esc(reg)} <span class="count">${open ? open + ' restantes' : '✓'}</span></h4>`;
    for (const p of pieces) {
      const row = document.createElement('div'); row.className = 'tick-row' + (wbDone(p.etiquette) ? ' done' : '');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = wbDone(p.etiquette);
      cb.addEventListener('change', () => tick(p.etiquette, cb.checked));
      const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = p.etiquette;
      lbl.addEventListener('click', () => showPiece(p.etiquette));
      const dims = document.createElement('span'); dims.className = 'dims'; dims.textContent = pieceDims(p) + (p.panneau ? ' · ' + p.panneau : '');
      row.append(cb, lbl, dims); g.appendChild(row);
    }
    body.appendChild(g);
  }
}
function showPiece(etq) {
  const p = wb.byEtq.get(etq); if (!p) return;
  const body = pieceModal.querySelector('#piece-body');
  body.innerHTML = `<h2>${esc(etq)}</h2>
    <div class="row"><b>Dimensions</b><span>${esc(pieceDims(p))} mm — ${esc(p.reglageFS || '')}</span></div>
    <div class="row"><b>Débit</b><span>panneau ${esc(p.panneau || '?')}, colonne ${esc(String(p.colonne ?? '?'))}</span></div>
    ${(p.preparations || []).length ? `<div class="row"><b>Préparations</b><span>${p.preparations.map((pr) => esc(`${pr.type} ${pr.cotes || ''} ${pr.pos || ''}`)).join('<br>')}</span></div>` : ''}
    ${p.placeAssemblage ? `<div class="row"><b>Assemblage</b><span>${esc(p.placeAssemblage)}</span></div>` : ''}`;
  const actions = document.createElement('div'); actions.className = 'actions'; actions.style.marginTop = '16px';
  const goDebit = document.createElement('button'); goDebit.textContent = 'Voir au débit';
  goDebit.addEventListener('click', () => { pieceModal.hidden = true; wbTab = 'debit'; renderWb(); flashPiece(etq); });
  const goAsm = document.createElement('button'); goAsm.textContent = 'Voir à l’assemblage';
  goAsm.addEventListener('click', () => { pieceModal.hidden = true; wbTab = 'assemblage'; renderWb(); page.querySelector('#asm-' + p.module)?.scrollIntoView({ behavior: 'smooth' }); });
  const tickBtn = document.createElement('button'); tickBtn.textContent = wbDone(etq) ? 'Décocher' : 'Marquer faite ✓';
  tickBtn.addEventListener('click', () => { pieceModal.hidden = true; tick(etq, !wbDone(etq)); });
  actions.append(goDebit, goAsm, tickBtn); body.appendChild(actions);
  pieceModal.hidden = false;
}
function flashPiece(etq) {
  const el = page.querySelector(`.piece-block[data-etq="${CSS.escape(etq)}"]`);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); }
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
  tunnelBody.innerHTML = '<div class="placeholder">chargement…</div>';
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
