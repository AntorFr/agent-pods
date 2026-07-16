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
    if (currentRoute().startsWith('dom/') || currentRoute() === '') loadTreeThen(renderRoute); // l'agent a pu écrire
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
  atelier:  { label: 'L’Atelier', glyph: '⚒', hue: 130 },
  diy:      { label: 'L’Atelier', glyph: '⚒', hue: 130 },
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
  const tiles = [{ id: 'todo', route: '#/todo' }, ...domains().map((d) => ({ id: d, route: '#/dom/' + d }))];
  for (const t of tiles) {
    const m = metaFor(t.id);
    const count = t.id === 'todo' ? '' : countIn(t.id === 'sujets' ? 'sujets/' : 'domaines/' + t.id + '/') + ' fiches';
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
