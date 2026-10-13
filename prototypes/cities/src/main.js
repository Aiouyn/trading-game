import { PERSONALITIES, CITY_ORDER } from './personalities.js';
import { generateCity } from './gen.js';
import { CityView } from './render.js';

const $ = (id) => document.getElementById(id);
const view = new CityView($('view'), $('labels'));
view.showLabels = true;
const cache = new Map();
let city = null, current = null, loadingToken = 0;
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
    c = await generateCity(P, (msg) => {
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
  if (e.key === 'q' || e.key === 'Q') view.rotate(-1);
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

function showInfo(b) {
  const el = $('info');
  const rows = [];
  const district = b.d?.name ?? '';
  let title = b.label ?? b.kind;
  if (b.company) {
    const h1 = (b.id * 0.61803398875) % 1, h2 = (b.id * 0.75487766625) % 1;
    const ret = (+$('mood').value / 100) * 0.06 * (0.5 + h1) + (h2 - 0.5) * 0.024;
    rows.push(['Ticker', b.company.ticker], ['Market cap', `$${b.company.cap}B`], ['Today', `<span class="${ret >= 0 ? 'up' : 'down'}">${ret >= 0 ? '+' : '−'}${Math.abs(ret * 100).toFixed(2)}%</span>`]);
  }
  if (b.crown) rows.push(['Net Worth board', `#${b.crown.rank}`], ['Holder', b.crown.handle]);
  const minor = rows.length >= 3;
  rows.push(['Type', b.kind, minor], ['District', district], ['Height', `${Math.round(b.h)} m`]);
  if (b.floors) rows.push(['Floors', b.floors, true]);
  if (b.residents) rows.push(['Residents', b.residents.toLocaleString('en'), minor]);
  if (b.jobs) rows.push(['Jobs', b.jobs.toLocaleString('en'), true]);
  el.innerHTML = `<button class="x" aria-label="Close">×</button><div class="label">${b.company ? 'Headquarters' : b.crown ? 'Crown tower' : b.kind === 'Landmark' ? 'Landmark' : 'Building'}</div><div class="t">${title}</div>` +
    rows.map(([k, v, m]) => `<div class="l${m ? ' minor' : ''}"><span>${k}</span><span>${v}</span></div>`).join('');
  el.style.display = 'block';
  document.body.classList.add('info-open');
  el.querySelector('.x').onclick = () => closeInfo();
}

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
