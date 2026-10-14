import { PERSONALITIES, CITY_ORDER } from './personalities.js';
import { generateCity } from './gen.js';
import { CityView } from './render.js';
import { LENS_IDS, LENS_NAMES, RAMP, SECTOR_NAMES, makeLenses, applyLens, dayReturn } from './lenses.js';
import { buildSearch, searchCity } from './search.js';

const $ = (id) => document.getElementById(id);
const view = new CityView($('view'), $('labels'));
view.showLabels = true;
const cache = new Map();
let city = null, current = null, loadingToken = 0;
let lenses = null, lensId = 'normal', searchItems = [], lastLensMs = 0;
const sIn = $('search'), sRes = $('results');
let hits = [], active = -1;
let mineList = []; // your buildings in the current city (demo ownership)
const SEE_ORDER = ['off', 'selected', 'mine'];
let seeMode = 'mine'; // see through: off, the selected building, or the selected building plus yours

// ------------------------------------------------------------------ tabs
for (const id of CITY_ORDER) {
  const P = PERSONALITIES[id];
  const b = document.createElement('button');
  b.className = 'tab'; b.role = 'tab'; b.dataset.id = id;
  b.innerHTML = `${P.name}<span class="rk">${P.unlock}</span>`;
  b.onclick = () => open(id);
  $('tabs').appendChild(b);
}

// Generation runs in a worker (cache first, see gen.worker.js); the page generates a city itself only when the worker fails.
let genWorker = null, reqSeq = 0;
const pending = new Map();
function workerGen(id, progress) {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('no workers'));
  if (!genWorker) {
    const w = new Worker(new URL('./gen.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const p = pending.get(e.data.reqId);
      if (!p) return;
      if (e.data.type === 'progress') { p.progress(e.data.msg); return; }
      pending.delete(e.data.reqId);
      if (e.data.type === 'done') p.resolve(e.data.city); else p.reject(new Error(e.data.message));
    };
    w.onerror = (e) => {
      genWorker = null;
      for (const [k, p] of pending) { pending.delete(k); p.reject(e.error ?? new Error('generation worker failed')); }
    };
    genWorker = w;
  }
  const reqId = ++reqSeq;
  return new Promise((resolve, reject) => {
    pending.set(reqId, { progress, resolve, reject });
    genWorker.postMessage({ id, reqId });
  });
}

/** A generated city for a personality id, with the personality attached. */
async function loadCity(id, progress) {
  let city = null;
  try { city = await workerGen(id, progress); } catch (err) { console.warn('cities: worker generation failed, generating here', err); }
  if (!city) return generateCity(PERSONALITIES[id], progress);
  city.P = PERSONALITIES[id];
  return city;
}

const STEPS = ['Surveying the land', 'Drawing districts', 'Laying out the street grain', 'Tracing canals', 'Tracing arterial streets', 'Tracing collector streets', 'Tracing local streets', 'Cutting city blocks', 'Raising landmarks', 'Dividing parcels', 'Raising', 'Seating the companies', 'Planting trees', 'Bringing in the ships', 'Planning the growth', 'Painting the ground', 'Done'];

async function open(id) {
  if (current === id) return;
  current = id;
  const token = ++loadingToken;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.id === id));
  const P = PERSONALITIES[id];
  try { localStorage.setItem('cities.last', id); } catch {}
  let c = cache.get(id);
  if (!c) {
    $('loading').classList.remove('hide');
    $('l-city').textContent = P.name;
    c = await loadCity(id, (msg) => {
      $('l-step').textContent = msg;
      const i = STEPS.findIndex((s) => msg.startsWith(s));
      $('l-bar').style.width = `${Math.round(((i < 0 ? 0 : i) / (STEPS.length - 1)) * 100)}%`;
    });
    cache.set(id, c);
    console.log(`${P.name}: ${c.ms} ms`, c.timings, c.stats);
  }
  if (token !== loadingToken) return;
  city = c;
  mineList = c.buildings.filter((b) => b.mine);
  view.load(c);
  $('loading').classList.add('hide');
  fillCard();
  setGrowth(+$('growth').value);
  closeInfo();
  lenses = makeLenses(c);
  searchItems = buildSearch(c);
  renderLens();
  if (sIn.value.trim()) runSearch();
}

function fillCard() {
  const P = city.P, s = city.stats;
  $('c-bloc').textContent = `${P.bloc} · ${P.currency} · opens at ${P.unlock}`;
  $('c-name').textContent = P.name;
  $('c-tag').textContent = P.tagline;
  $('c-blurb').textContent = P.blurb;
  $('s-h').textContent = s.hqs;
  $('s-t').textContent = s.tallest ? `${s.tallest.h} m` : '–';
  $('s-k').textContent = `${s.roadKm} km`;
  $('s-ms').textContent = `${(city.ms / 1000).toFixed(1)} s`;
}

// ------------------------------------------------------------------ controls
const fmtH = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
function setTime(h) {
  view.setTime(h);
  $('v-time').textContent = fmtH(h);
  $('clock').textContent = fmtH(h);
  $('time').value = h;
  document.documentElement.style.setProperty('--sky-top', view.sky.top);
  document.documentElement.style.setProperty('--sky-bot', view.sky.bot);
}
$('time').oninput = (e) => setTime(+e.target.value);
for (const c of document.querySelectorAll('.chip[data-t]')) c.onclick = () => setTime(+c.dataset.t);

function setGrowth(v) {
  const g = (v / 1000) * 1.035;
  view.setGrowth(g);
  $('v-growth').textContent = `${Math.round(v / 10)}%`;
  if (!city) return;
  // residents and jobs built so far
  const curve = city.popCurve;
  let lo = 0, hi = curve.length;
  const done = g - 0.035 * 0.5;
  while (lo < hi) { const m = (lo + hi) >> 1; if (curve[m][0] <= done) lo = m + 1; else hi = m; }
  const [, res, jobs] = lo ? curve[lo - 1] : [0, 0, 0];
  $('s-b').textContent = lo.toLocaleString('en');
  $('s-r').textContent = fmtN(res);
  $('pop').innerHTML = `<b>${fmtN(res)}</b> residents · <b>${fmtN(jobs)}</b> jobs · <b>${lo.toLocaleString('en')}</b> buildings`;
}
const fmtN = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : `${Math.round(x)}`);
$('growth').oninput = (e) => { playing = false; setGrowth(+e.target.value); };

function setMood(v) {
  view.setMood(v / 100);
  const pct = (v / 100) * 6;
  $('v-mood').textContent = Math.abs(pct) < 0.4 ? 'Calm' : `${pct > 0 ? 'Rally +' : 'Sell-off −'}${Math.abs(pct).toFixed(1)}%`;
  $('v-mood').className = `val ${pct > 0.4 ? 'up' : pct < -0.4 ? 'down' : ''}`;
  if (selected) showInfo(selected);
  if (lensId === 'market') renderLens();
}
$('mood').oninput = (e) => setMood(+e.target.value);
for (const c of document.querySelectorAll('.chip[data-m]')) c.onclick = () => { $('mood').value = c.dataset.m; setMood(+c.dataset.m); };

let playing = false;
$('play').onclick = () => {
  playing = true;
  playT = 0;
  $('growth').value = 0;
  setGrowth(0);
};
let playT = 0;

$('rotl').onclick = () => view.rotate(-1);
$('rotr').onclick = () => view.rotate(1);
$('home').onclick = () => view.fit();
// battery saver: pixel ratio 1 and a slower animation (remembered on this device)
let saver = false;
try { saver = localStorage.getItem('cities.saver') === '1'; } catch {}
function setSaver(on) {
  saver = on;
  view.setSaver(on);
  $('saver').classList.toggle('on', on);
  $('saver').setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('cities.saver', on ? '1' : '0'); } catch {}
}
$('saver').onclick = () => setSaver(!saver);
setSaver(saver);
$('lbls').onclick = () => { view.showLabels = !view.showLabels; view.dirty = true; };
$('toggle').onclick = () => $('controls').classList.toggle('open');

// ------------------------------------------------------------------ see through
/** The focus set: the selected building, and in "Selected + mine" your buildings too. */
function syncFocus() {
  const ids = [];
  if (seeMode !== 'off') {
    if (selected) ids.push(selected.id);
    if (seeMode === 'mine') for (const b of mineList) ids.push(b.id);
  }
  view.setFocus(ids);
}
function setSee(mode) {
  seeMode = mode;
  for (const c of document.querySelectorAll('.chip[data-see]')) c.classList.toggle('on', c.dataset.see === mode);
  syncFocus();
}
for (const c of document.querySelectorAll('.chip[data-see]')) c.onclick = () => setSee(c.dataset.see);
let findAt = -1;
$('find').onclick = () => {
  if (!mineList.length) return;
  findAt = (findAt + 1) % mineList.length;
  const b = mineList[findAt];
  view.flyTo(b.x, b.y, 0.35);
  select(b);
};

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '/') { e.preventDefault(); sIn.focus(); sIn.select(); }
  else if (e.key === 'v' || e.key === 'V') setLens(LENS_IDS[(LENS_IDS.indexOf(lensId) + 1) % LENS_IDS.length]);
  else if (e.key === 'q' || e.key === 'Q') view.rotate(-1);
  else if (e.key === 'e' || e.key === 'E') view.rotate(1);
  else if (e.key === 'l' || e.key === 'L') { view.showLabels = !view.showLabels; view.dirty = true; }
  else if (e.key === 'h' || e.key === 'H') view.fit();
  else if (e.key === 'x' || e.key === 'X') setSee(SEE_ORDER[(SEE_ORDER.indexOf(seeMode) + 1) % SEE_ORDER.length]);
  else if (e.key === 'Escape') closeInfo();
  else if (/^[1-6]$/.test(e.key)) open(CITY_ORDER[+e.key - 1]);
});

// ------------------------------------------------------------------ pointer: pan, zoom, pick
const canvas = $('view');
const pointers = new Map();
let dragDist = 0, pinch = null, selected = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragDist = 0;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) { hover(e.clientX, e.clientY); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) { view.pan(dx, dy); dragDist += Math.abs(dx) + Math.abs(dy); }
  else if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    view.pan(cx - pinch.cx, cy - pinch.cy);
    view.zoomAt(pinch.d / d, cx, cy);
    pinch = { d, cx, cy };
    dragDist += 10;
  }
});
const up = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) canvas.classList.remove('dragging');
  if (dragDist < 5 && e.type === 'pointerup') {
    select(view.pick(e.clientX, e.clientY));
  }
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });

let hoverPending = null;
function hover(x, y) {
  if (selected) return;
  hoverPending = [x, y];
}

/** Select a building (or nothing): its info card opens and it becomes the focus of see-through. */
function select(b) {
  if (!b) { closeInfo(); return; }
  selected = b;
  showInfo(b);
  view.setHover(b.id);
  syncFocus();
}

function closeInfo() {
  selected = null;
  $('info').style.display = 'none';
  document.body.classList.remove('info-open');
  view.setHover(-1);
  syncFocus();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function showInfo(b) {
  const el = $('info');
  const rows = [];
  const district = b.d?.name ?? '';
  let title = b.label ?? b.kind;
  if (b.company) {
    const ret = dayReturn(b.id, +$('mood').value / 100);
    rows.push(['Ticker', b.company.ticker], ['Market cap', `$${b.company.cap}B`], ['Today', `<span class="${ret >= 0 ? 'up' : 'down'}">${ret >= 0 ? '+' : '−'}${Math.abs(ret * 100).toFixed(2)}%</span>`]);
    rows.push(['Sector', esc(SECTOR_NAMES[b.company.sector] ?? b.company.sector), true]);
  }
  if (b.crown) rows.push(['Net Worth board', `#${b.crown.rank}`], ['Holder', esc(b.crown.handle)]);
  if (b.owner && !b.crown) rows.push(['Owner', b.owner === 'you' ? 'You' : esc(b.owner)]);
  if (b.forSale) rows.push(['For sale', '<span class="brass">Yes</span>']);
  const minor = rows.length >= 3;
  // your own buildings show their role (the demo ownership), not the architectural kind
  const role = { company: 'Company office', shop: 'Your shop', home: 'Your home' }[b.mineRole] ?? b.kind;
  rows.push(['Type', role, minor], ['District', district], ['Height', `${Math.round(b.h)} m`]);
  if (b.floors) rows.push(['Floors', b.floors, true]);
  if (b.residents) rows.push(['Residents', b.residents.toLocaleString('en'), minor]);
  if (b.jobs) rows.push(['Jobs', b.jobs.toLocaleString('en'), true]);
  el.innerHTML = `<button class="x" aria-label="Close">×</button><div class="label">${b.company ? 'Headquarters' : b.crown ? 'Crown tower' : b.kind === 'Landmark' ? 'Landmark' : 'Building'}</div><div class="t">${title}</div>` +
    rows.map(([k, v, m]) => `<div class="l${m ? ' minor' : ''}"><span>${k}</span><span>${v}</span></div>`).join('');
  el.style.display = 'block';
  document.body.classList.add('info-open');
  el.querySelector('.x').onclick = () => closeInfo();
}

// ------------------------------------------------------------------ map lenses
const css = (h) => `#${h.toString(16).padStart(6, '0')}`;
const lensChips = $('lens-chips');
for (const id of LENS_IDS) {
  const c = document.createElement('button');
  c.className = 'chip'; c.dataset.lens = id; c.textContent = LENS_NAMES[id];
  c.onclick = () => setLens(id);
  lensChips.appendChild(c);
}

/** Switch the lens (it starts without a filter). V cycles through them. */
function setLens(id) {
  lensId = id;
  if (lenses) lenses[id].filter = null;
  renderLens();
}

/** Paint the current lens into the state texture and refresh the chips, the legend and the help line. */
function renderLens() {
  if (!city || !lenses) return 0;
  const lens = lenses[lensId];
  lastLensMs = applyLens(view, city, lens, { mood: +$('mood').value / 100 });
  $('v-lens').textContent = lens.name;
  for (const c of lensChips.children) c.classList.toggle('on', c.dataset.lens === lensId);
  $('help').style.display = lensId === 'normal' ? '' : 'none';
  drawLegend();
  view.dirty = true;
  return lastLensMs;
}

function drawLegend() {
  const lens = lenses[lensId], el = $('legend');
  const L = lens.legend({ mood: +$('mood').value / 100 });
  el.classList.toggle('show', !!L);
  el.replaceChildren();
  if (!L) return;
  const cap = document.createElement('div');
  cap.className = 'label'; cap.textContent = 'Legend';
  const h = document.createElement('h2'); h.textContent = lens.name;
  el.append(cap, h);
  if (L.ramp) {
    const bar = document.createElement('div');
    bar.className = 'ramp'; bar.style.background = `linear-gradient(90deg, ${RAMP.map(css).join(', ')})`;
    const ends = document.createElement('div');
    ends.className = 'ramp-ends';
    ends.innerHTML = '<span>Low</span><span>High</span>';
    el.append(bar, ends);
  }
  for (const r of L.rows) {
    if (r.head) {
      const hd = document.createElement('div'); hd.className = 'head'; hd.textContent = r.head; el.appendChild(hd);
      continue;
    }
    if (r.empty) {
      const none = document.createElement('div'); none.className = 'lg empty'; none.textContent = r.empty; el.appendChild(none);
      continue;
    }
    const actionable = r.filter !== undefined || r.bid !== undefined || r.fly !== undefined;
    const row = document.createElement(actionable ? 'button' : 'div');
    if (actionable) row.type = 'button';
    row.className = `lg${r.filter !== undefined && lens.filter === r.filter ? ' on' : ''}`;
    if (r.swatch !== undefined) {
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = css(r.swatch);
      row.appendChild(sw);
    }
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.label;
    if (r.sub) { const s = document.createElement('span'); s.className = 'sub'; s.textContent = r.sub; nm.appendChild(s); }
    const n = document.createElement('span'); n.className = 'n'; n.textContent = r.value ?? '';
    row.append(nm, n);
    if (actionable) row.onclick = () => legendAct(r);
    el.appendChild(row);
  }
  if (L.note) {
    const note = document.createElement('div'); note.className = 'note'; note.textContent = L.note; el.appendChild(note);
  }
}

function legendAct(r) {
  const lens = lenses[lensId];
  if (r.filter !== undefined) { lens.filter = lens.filter === r.filter ? null : r.filter; renderLens(); }
  else if (r.bid !== undefined) focusBuilding(city.buildings[r.bid - 1]);
  else if (r.fly) view.flyTo(r.fly[0], r.fly[1], r.fly[2]);
}

/** Fly to a building and open its card. A building not raised yet brings the growth to the full city first. */
function focusBuilding(b, scale = 0.35) {
  if (b.order > (+$('growth').value / 1000) * 1.035) { playing = false; $('growth').value = 1000; setGrowth(1000); }
  view.flyTo(b.x, b.y, scale);
  selected = b;
  showInfo(b);
  view.setHover(b.id);
}

// ------------------------------------------------------------------ search
function runSearch() {
  hits = city ? searchCity(searchItems, sIn.value) : [];
  active = hits.length ? 0 : -1;
  drawHits();
}

function drawHits() {
  const q = sIn.value.trim();
  sRes.replaceChildren();
  sRes.classList.toggle('open', !!q);
  sIn.setAttribute('aria-expanded', String(!!q));
  if (!q) return;
  if (!hits.length) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No matches';
    sRes.appendChild(li);
    return;
  }
  hits.forEach((hit, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === active));
    const t = document.createElement('span'); t.className = 't'; t.textContent = hit.title;
    const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = hit.hint;
    li.append(t, hint);
    li.onmousedown = (e) => e.preventDefault(); // keep the field focused until the click lands
    li.onclick = () => openHit(i);
    sRes.appendChild(li);
  });
}

function openHit(i) {
  const hit = hits[i];
  if (!hit) return;
  sRes.classList.remove('open');
  sIn.blur();
  if (hit.bid !== undefined) focusBuilding(city.buildings[hit.bid - 1]);
  else view.flyTo(hit.fly[0], hit.fly[1], hit.fly[2]);
}

sIn.addEventListener('input', runSearch);
sIn.addEventListener('focus', () => { if (sIn.value.trim()) runSearch(); });
sIn.addEventListener('blur', () => setTimeout(() => sRes.classList.remove('open'), 150));
sIn.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!hits.length) return;
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
    drawHits();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (hits.length) openHit(Math.max(0, active));
  } else if (e.key === 'Escape') {
    if (sRes.classList.contains('open')) sRes.classList.remove('open');
    else { sIn.value = ''; runSearch(); sIn.blur(); }
  }
});

// ------------------------------------------------------------------ loop
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) {
    playT += dt;
    const v = Math.min(1000, Math.round((playT / 16) * 1000));
    $('growth').value = v;
    setGrowth(v);
    if (v >= 1000) playing = false;
  }
  if (hoverPending && !document.hidden) {
    const [x, y] = hoverPending; hoverPending = null;
    const b = view.pick(x, y);
    view.setHover(b ? b.id : -1);
    if (b) showInfo(b); else { $('info').style.display = 'none'; document.body.classList.remove('info-open'); }
  }
  if (!document.hidden) view.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

setTime(19.2);
let first = 'avalon';
try { first = localStorage.getItem('cities.last') || 'avalon'; } catch {}
const q = new URLSearchParams(location.search);
if (q.get('city') && PERSONALITIES[q.get('city')]) first = q.get('city');
if (q.get('t')) setTime(+q.get('t'));
open(PERSONALITIES[first] ? first : 'avalon');
window.__cities = {
  view, get city() { return city; }, open, setTime, setGrowth: (v) => { $('growth').value = v; setGrowth(v); },
  /** dev: the map lenses. setLens returns the time the lens took to paint, in ms. */
  setLens: (id) => { setLens(id); return lastLensMs; }, get lens() { return lensId; }, lensMs: () => lastLensMs,
  setMood: (v) => { $('mood').value = v; setMood(v); },
  setSaver: (on) => setSaver(!!on), get saver() { return saver; },
  search: (q) => { sIn.value = q; runSearch(); return hits.map((h) => `${h.title} | ${h.hint}`); },
  openHit: (i) => openHit(i),
  /** test hooks: select a building by id (0 or null clears), set the see-through mode, read it */
  select: (id) => select(id ? city.buildings[id - 1] : null), setSee, get seeMode() { return seeMode; },
  /** dev: render one frame with a given camera and save it through the dev server */
  async shot(name, { x = 0, z = 0, scale = null, yaw = null, t = null } = {}) {
    if (t !== null) setTime(t);
    if (yaw !== null) { view.yaw = view.yawTarget = yaw; }
    view.target.set(x, 0, z);
    if (scale) view.scale = scale; else view.fit();
    view.dirty = true; view.frame(0);
    const url = view.renderer.domElement.toDataURL('image/png');
    await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
    return name;
  },
};
