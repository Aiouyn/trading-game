import { PERSONALITIES, CITY_ORDER } from './personalities.js';
import { generateCity } from './gen.js';
import { CityView } from './render.js';
import { LENS_IDS, LENS_NAMES, RAMP, SECTOR_NAMES, makeLenses, applyLens, dayReturn } from './lenses.js';
import { buildSearch, searchCity } from './search.js';
import { preparePersonality } from './avalon-art.js';
import { GEN_VERSION } from './citycache.js';
import { buildDemoUnits } from './demo-units.js';
import { initialState, lease, rename, upgrade, validateStoredState } from './inhabit.js';
import { LRU } from './lru.js';

const $ = (id) => document.getElementById(id);
const view = new CityView($('view'), $('labels'));
view.showLabels = true;
const cache = new LRU(2);
let city = null, current = null, loadingToken = 0;
let lenses = null, lensId = 'normal', searchItems = [], lastLensMs = 0;
const sIn = $('search'), sRes = $('results');
let hits = [], active = -1;
let mineList = []; // your buildings in the current city (demo ownership)
const SEE_ORDER = ['off', 'selected', 'mine'];
let seeMode = 'selected'; // see through: off, the selected building, or the selected building plus yours
const INHABIT_KEY = 'cities.inhabit.v1';
let demoOffers = [], demoUnits = [];
let inhabitState = null, inhabitStale = false, inhabitStorageNotice = '';
let inhabitError = '';

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
  if (!city) return generateCity(preparePersonality(PERSONALITIES[id]), progress);
  city.P = preparePersonality(PERSONALITIES[id]);
  return city;
}

const STEPS = ['Surveying the land', 'Drawing districts', 'Laying out the street grain', 'Tracing canals', 'Tracing arterial streets', 'Tracing collector streets', 'Tracing local streets', 'Cutting city blocks', 'Raising landmarks', 'Dividing parcels', 'Raising', 'Seating the companies', 'Planting trees', 'Bringing in the ships', 'Planning the growth', 'Painting the ground', 'Done'];

async function open(id) {
  if (current === id && city?.P?.id === id) return;
  current = id;
  const token = ++loadingToken;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.id === id));
  const P = PERSONALITIES[id];
  try { localStorage.setItem('cities.last', id); } catch {}
  let c = cache.get(id);
  if (!c) {
    $('loading').classList.remove('hide');
    $('l-city').textContent = P.name;
    try {
      c = await loadCity(id, (msg) => {
        if (token !== loadingToken) return;
        $('l-step').textContent = msg;
        const i = STEPS.findIndex((s) => msg.startsWith(s));
        $('l-bar').style.width = `${Math.round(((i < 0 ? 0 : i) / (STEPS.length - 1)) * 100)}%`;
      });
    } catch (err) {
      if (token === loadingToken) {
        current = city?.P?.id ?? null;
        $('l-step').textContent = 'Generation failed — click tab to retry';
      }
      throw err;
    }
    if (token !== loadingToken) return;
    cache.set(id, c);
    console.log(`${P.name}: ${c.ms} ms`, c.timings, c.stats);
  }
  if (token !== loadingToken) return;
  city = c;
  cache.set(id, c); // ensure active city stays newest in LRU
  view.load(c);
  initInhabitForCity(c);
  $('loading').classList.add('hide');
  fillCard();
  setGrowth(+$('growth').value);
  closeInfo();
  refreshOccupancy();
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
  $('try-live').style.display = P.id === 'avalon' ? '' : 'none';
}

function currentWorldKey(c) {
  return `${c.P.id}:${c.P.seed}:${GEN_VERSION}`;
}

function saveInhabitState() {
  if (!city || !inhabitState) return;
  try {
    const wk = currentWorldKey(city);
    localStorage.setItem(INHABIT_KEY, JSON.stringify({ schema: 1, worldKey: wk, state: inhabitState }));
  } catch {
    inhabitStorageNotice = 'Browser storage is blocked; this local demo runs in memory for this tab.';
  }
}

function initInhabitForCity(c) {
  inhabitError = '';
  inhabitStale = false;
  if (c.P.id !== 'avalon') {
    demoOffers = [];
    demoUnits = [];
    $('inhabit').classList.remove('open');
    return;
  }
  // Snapshot original building fields on first load so reset restores clean geography
  for (const b of c.buildings) {
    if (!b._orig) {
      b._orig = { mine: Boolean(b.mine), mineRole: b.mineRole, label: b.label, owner: b.owner, cat: b.cat };
    }
  }
  const built = buildDemoUnits(c);
  demoOffers = built.offers;
  demoUnits = built.units;
  const wk = currentWorldKey(c);
  let raw = null;
  try {
    const str = localStorage.getItem(INHABIT_KEY);
    if (str) raw = JSON.parse(str);
  } catch {
    inhabitStorageNotice = 'Saved demo data could not be read; starting fresh in memory.';
  }
  const check = validateStoredState(raw, wk, demoUnits);
  if (check.status === 'ok') {
    inhabitState = check.state;
  } else if (check.status === 'stale' || check.status === 'invalid') {
    inhabitStale = true;
    inhabitState = initialState(wk);
  } else {
    inhabitState = initialState(wk);
  }
}

function resetInhabitDemo() {
  if (!city) return;
  try { localStorage.removeItem(INHABIT_KEY); } catch {}
  inhabitStale = false;
  inhabitError = '';
  inhabitState = initialState(currentWorldKey(city));
  refreshOccupancy();
}

function refreshOccupancy() {
  if (!city) return;
  const leasedLabels = [];
  if (city.P.id === 'avalon' && demoUnits.length) {
    for (const b of city.buildings) {
      if (b._orig) {
        b.mine = b._orig.mine;
        b.mineRole = b._orig.mineRole;
        b.label = b._orig.label;
        b.owner = b._orig.owner;
        b.cat = b._orig.cat;
      }
      b.demoUnits = [];
      b.leasedUnit = null;
      view.setFrontageStage(b.id, 0);
    }
    for (const u of demoUnits) {
      const b = city.buildings[u.buildingId - 1];
      if (!b) continue;
      const held = inhabitState && !inhabitStale ? inhabitState.leases[u.id] : null;
      const occupantName = held ? inhabitState.company.name : (u.occupantName ?? null);
      const unitRecord = {
        ...u,
        leasedByYou: Boolean(held),
        stage: held ? held.stage : 0,
        occupantId: held ? inhabitState.company.id : (u.occupantId ?? null),
        occupantName,
      };
      b.demoUnits.push(unitRecord);
      if (!b.owner) b.owner = u.ownerId;
      if (held) {
        b.mine = true;
        b.mineRole = 'shop';
        b.label = inhabitState.company.name;
        b.leasedUnit = unitRecord;
        view.setFrontageStage(b.id, held.stage);
        leasedLabels.push({ bid: b.id, text: inhabitState.company.name });
      }
    }
  }
  mineList = city.buildings.filter((b) => b.mine);
  view.syncLeaseLabels(leasedLabels);
  lenses = makeLenses(city);
  searchItems = buildSearch(city);
  renderLens();
  syncFocus();
  if (selected) showInfo(selected);
  renderInhabitPanel();
  view.dirty = true;
}

let actionLock = false;
function renderInhabitPanel() {
  const panel = $('inhabit');
  if (!city || city.P.id !== 'avalon') {
    panel.classList.remove('open');
    panel.replaceChildren();
    return;
  }
  panel.replaceChildren();
  const closeBtn = document.createElement('button');
  closeBtn.id = 'inhabit-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.onclick = () => panel.classList.remove('open');

  const kick = document.createElement('div');
  kick.className = 'label';
  kick.textContent = 'Port Avalon · Local slice';

  const h2 = document.createElement('h2');
  h2.textContent = 'Local ownership demo';

  panel.append(closeBtn, kick, h2);

  if (inhabitStorageNotice) {
    const note = document.createElement('div');
    note.className = 'inhabit-note';
    note.textContent = inhabitStorageNotice;
    panel.appendChild(note);
  }

  if (inhabitStale) {
    const staleBox = document.createElement('div');
    staleBox.className = 'offer-card';
    const msg = document.createElement('div');
    msg.className = 'o-meta';
    msg.textContent = 'This demo layout changed. Start a new local demo.';
    const rst = document.createElement('button');
    rst.className = 'btn';
    rst.type = 'button';
    rst.textContent = 'Reset local demo';
    rst.onclick = () => resetInhabitDemo();
    staleBox.append(msg, rst);
    panel.appendChild(staleBox);
    return;
  }

  const cashBar = document.createElement('div');
  cashBar.className = 'cash-bar';
  const cashLbl = document.createElement('span');
  cashLbl.textContent = 'Demo cash';
  const cashVal = document.createElement('b');
  cashVal.id = 'inhabit-cash';
  cashVal.textContent = `${inhabitState.cash.toLocaleString('en')} demo FDL`;
  cashBar.append(cashLbl, cashVal);
  panel.appendChild(cashBar);

  for (const offer of demoOffers) {
    const held = inhabitState.leases[offer.id];
    const card = document.createElement('div');
    card.className = 'offer-card';
    card.dataset.unitId = offer.id;

    const head = document.createElement('div');
    head.className = 'o-head';
    const addr = document.createElement('span');
    addr.className = 'o-addr';
    addr.textContent = offer.address;
    const dist = document.createElement('span');
    dist.className = 'o-dist';
    dist.textContent = offer.districtName;
    head.append(addr, dist);

    const meta = document.createElement('div');
    meta.className = 'o-meta';
    meta.textContent = `${offer.premisesType} · ${offer.cost} demo FDL`;

    const acts = document.createElement('div');
    acts.className = 'o-actions';

    if (offer.available && offer.buildingId) {
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn ghost';
      viewBtn.textContent = 'View premises';
      viewBtn.onclick = () => {
        const b = city.buildings[offer.buildingId - 1];
        if (b) focusBuilding(b, 0.22);
      };
      acts.appendChild(viewBtn);

      if (!held) {
        const leaseBtn = document.createElement('button');
        leaseBtn.type = 'button';
        leaseBtn.className = 'btn';
        leaseBtn.textContent = `Lease for ${offer.cost} demo FDL`;
        leaseBtn.disabled = actionLock || inhabitState.cash < offer.cost;
        leaseBtn.onclick = () => {
          if (actionLock) return;
          actionLock = true;
          leaseBtn.disabled = true;
          try {
            inhabitError = '';
            inhabitState = lease(inhabitState, demoUnits, offer.id);
            saveInhabitState();
            const b = city.buildings[offer.buildingId - 1];
            refreshOccupancy();
            if (b) focusBuilding(b, 0.22);
          } catch (err) {
            inhabitError = err.message;
            renderInhabitPanel();
          } finally {
            actionLock = false;
          }
        };
        acts.appendChild(leaseBtn);
      } else {
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'btn';
        badge.disabled = true;
        badge.textContent = held.stage === 1 ? 'Leased · Frontage improved' : 'Leased by your business';
        acts.appendChild(badge);
      }
    } else {
      const unav = document.createElement('span');
      unav.className = 'o-meta';
      unav.textContent = 'Unavailable in this layout';
      acts.appendChild(unav);
    }

    card.append(head, meta, acts);

    if (held) {
      const box = document.createElement('div');
      box.className = 'inhabit-box';
      const nameLbl = document.createElement('div');
      nameLbl.className = 'label';
      nameLbl.textContent = 'Business name';
      const row = document.createElement('div');
      row.className = 'inhabit-input-row';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'inhabit-input';
      inp.maxLength = 32;
      inp.value = inhabitState.company.name;
      inp.setAttribute('aria-label', 'Business name');
      const saveNameBtn = document.createElement('button');
      saveNameBtn.type = 'button';
      saveNameBtn.className = 'btn ghost';
      saveNameBtn.style.flex = '0 0 auto';
      saveNameBtn.style.width = 'auto';
      saveNameBtn.textContent = 'Name shop';
      const applyRename = () => {
        try {
          inhabitError = '';
          inhabitState = rename(inhabitState, inp.value);
          saveInhabitState();
          refreshOccupancy();
        } catch {
          inhabitError = 'Enter 1–32 plain characters (no < or >).';
          renderInhabitPanel();
        }
      };
      saveNameBtn.onclick = applyRename;
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyRename(); }
      });
      row.append(inp, saveNameBtn);
      box.append(nameLbl, row);

      if (held.stage === 0) {
        const upgBtn = document.createElement('button');
        upgBtn.type = 'button';
        upgBtn.className = 'btn';
        upgBtn.style.marginTop = '8px';
        upgBtn.textContent = 'Improve frontage — 300 demo FDL';
        upgBtn.disabled = actionLock || inhabitState.cash < 300;
        upgBtn.onclick = () => {
          if (actionLock) return;
          actionLock = true;
          upgBtn.disabled = true;
          try {
            inhabitError = '';
            inhabitState = upgrade(inhabitState, offer.id);
            saveInhabitState();
            refreshOccupancy();
          } catch (err) {
            inhabitError = err.message;
            renderInhabitPanel();
          } finally {
            actionLock = false;
          }
        };
        box.appendChild(upgBtn);
      }
      card.appendChild(box);
    }

    panel.appendChild(card);
  }

  if (inhabitError) {
    const errEl = document.createElement('div');
    errEl.className = 'inhabit-err';
    errEl.textContent = inhabitError;
    panel.appendChild(errEl);
  }

  const rstBtn = document.createElement('button');
  rstBtn.type = 'button';
  rstBtn.className = 'btn ghost';
  rstBtn.style.marginTop = '6px';
  rstBtn.textContent = 'Reset local demo';
  rstBtn.onclick = () => resetInhabitDemo();
  panel.appendChild(rstBtn);
}

$('try-live').onclick = () => {
  const panel = $('inhabit');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderInhabitPanel();
  updateLabelExclusions();
  view.dirty = true;
};

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

function isCompactSheet() {
  return matchMedia('(max-width: 900px), (max-height: 520px)').matches;
}

function setSheetTab(tab) {
  const dock = $('right-dock');
  dock.dataset.tab = tab;
  dock.classList.remove('sheet-collapsed');
  for (const b of document.querySelectorAll('.sheet-tab')) {
    const on = b.dataset.sheetTab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
}

function syncResponsivePlacement() {
  const info = $('info');
  const sheetBody = $('sheet-body');
  if (isCompactSheet()) {
    if (info.parentElement !== sheetBody) {
      info.classList.add('in-sheet');
      sheetBody.appendChild(info);
    }
  } else if (info.parentElement === sheetBody) {
    info.classList.remove('in-sheet');
    document.body.insertBefore(info, $('right-dock'));
  }
  updateLabelExclusions();
}

function updateLabelExclusions() {
  const rects = [];
  for (const id of ['strip', 'card', 'info', 'inhabit', 'right-dock']) {
    const el = $(id);
    if (!el || el.style.display === 'none') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) {
      rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
  }
  view.setExclusions(rects);
}

for (const b of document.querySelectorAll('.sheet-tab')) {
  b.onclick = () => { setSheetTab(b.dataset.sheetTab); updateLabelExclusions(); view.dirty = true; };
}
$('sheet-close').onclick = () => {
  if ($('right-dock').dataset.tab === 'selection' && selected) {
    closeInfo();
    setSheetTab('map');
  } else {
    $('right-dock').classList.toggle('sheet-collapsed');
  }
  updateLabelExclusions();
  view.dirty = true;
};
addEventListener('resize', () => { syncResponsivePlacement(); view.dirty = true; });
syncResponsivePlacement();

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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.key === 'Escape' && e.target !== sIn) e.target.blur();
    return;
  }
  if (e.key === '/') { e.preventDefault(); sIn.focus(); sIn.select(); }
  else if (e.key === 'v' || e.key === 'V') setLens(LENS_IDS[(LENS_IDS.indexOf(lensId) + 1) % LENS_IDS.length]);
  else if (e.key === 'q' || e.key === 'Q') view.rotate(-1);
  else if (e.key === 'e' || e.key === 'E') view.rotate(1);
  else if (e.key === 'l' || e.key === 'L') { view.showLabels = !view.showLabels; view.dirty = true; }
  else if (e.key === 'h' || e.key === 'H') view.fit();
  else if (e.key === 'x' || e.key === 'X') setSee(SEE_ORDER[(SEE_ORDER.indexOf(seeMode) + 1) % SEE_ORDER.length]);
  else if (e.key === 'Escape') {
    if (selected) closeInfo();
    else if ($('inhabit').classList.contains('open')) $('inhabit').classList.remove('open');
  }
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
  if (isCompactSheet()) setSheetTab('selection');
  view.setHover(b.id);
  syncFocus();
  updateLabelExclusions();
}

function closeInfo() {
  selected = null;
  $('info').style.display = 'none';
  document.body.classList.remove('info-open');
  if (isCompactSheet() && $('right-dock').dataset.tab === 'selection') setSheetTab('map');
  view.setHover(-1);
  syncFocus();
  updateLabelExclusions();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function showInfo(b) {
  const el = $('info');
  const rows = [];
  const district = b.d?.name ?? '';
  let title = b.label ?? b.kind;
  if (b.company) {
    const ret = dayReturn(b.id, +$('mood').value / 100);
    rows.push(['Ticker', esc(b.company.ticker)], ['Market cap', `$${b.company.cap}B`], ['Today', `<span class="${ret >= 0 ? 'up' : 'down'}">${ret >= 0 ? '+' : '−'}${Math.abs(ret * 100).toFixed(2)}%</span>`]);
    rows.push(['Sector', esc(SECTOR_NAMES[b.company.sector] ?? b.company.sector), true]);
  }
  if (b.crown) rows.push(['Net Worth board', `#${b.crown.rank}`], ['Holder', esc(b.crown.handle)]);
  if (b.demoUnits?.length) {
    const primary = b.demoUnits[0];
    rows.push(['Address', esc(primary.address)]);
    rows.push(['Property owner', esc(primary.ownerId)]);
    for (const u of b.demoUnits) {
      const occ = u.leasedByYou ? `${esc(u.occupantName)} (You)` : u.occupantName ? esc(u.occupantName) : 'Vacant (for lease)';
      rows.push([u.use === 'shop' ? 'Ground shop' : 'Upper unit', occ]);
    }
    if (b.leasedUnit) {
      rows.push(['Frontage', b.leasedUnit.stage === 1 ? 'Improved (Stage 1)' : 'Standard']);
    }
  } else if (b.owner && !b.crown) {
    rows.push(['Owner', b.owner === 'you' ? 'You' : esc(b.owner)]);
  }
  if (b.forSale) rows.push(['For sale', '<span class="brass">Yes</span>']);
  const minor = rows.length >= 3;
  // your own buildings show their role (the demo ownership), not the architectural kind
  const role = { company: 'Company office', shop: 'Your shop', home: 'Your home' }[b.mineRole] ?? b.kind;
  rows.push(['Type', esc(role), minor], ['District', esc(district)], ['Height', `${Math.round(b.h)} m`]);
  if (b.floors) rows.push(['Floors', b.floors, true]);
  if (b.residents) rows.push(['Residents', b.residents.toLocaleString('en'), minor]);
  if (b.jobs) rows.push(['Jobs', b.jobs.toLocaleString('en'), true]);
  el.innerHTML = `<button class="x" aria-label="Close">×</button><div class="label">${b.company ? 'Headquarters' : b.crown ? 'Crown tower' : b.kind === 'Landmark' ? 'Landmark' : 'Building'}</div><div class="t">${esc(title)}</div>` +
    rows.map(([k, v, m]) => `<div class="l${m ? ' minor' : ''}"><span>${esc(k)}</span><span>${v}</span></div>`).join('');
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
  // Market colours belong to the Market lens: Normal view follows the time of day.
  view.uniforms.uMarketMode.value = id === 'market' ? 1 : 0;
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
  updateLabelExclusions();
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
  if (isCompactSheet()) setSheetTab('selection');
  view.setHover(b.id);
  syncFocus();
  updateLabelExclusions();
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
  const rawMs = now - last;
  const dt = Math.min(0.1, rawMs / 1000);
  last = now;
  const wasActive = Boolean(pointers.size > 0 || view.fly || Math.abs(view.yawTarget - view.yaw) > 1e-4 || view.cutP !== view.cutTo || playing);
  if (playing) {
    playT += dt;
    const v = Math.min(1000, Math.round((playT / 16) * 1000));
    $('growth').value = v;
    setGrowth(v);
    if (v >= 1000) playing = false;
  }
  if (hoverPending && !document.hidden) {
    const [x, y] = hoverPending; hoverPending = null;
    if (!selected) {
      const b = view.pick(x, y);
      view.setHover(b ? b.id : -1);
      if (b) showInfo(b); else { $('info').style.display = 'none'; document.body.classList.remove('info-open'); }
    }
  }
  if (!document.hidden) {
    view.frame(dt);
    view.recordActiveInterval(rawMs, wasActive);
  }
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
  setPlan: (on) => view.setPlan(on),
  fitPlan: () => view.fitPlan(),
  setLayers: (mode) => view.setLayers(mode),
  flushChunks: () => view.flushChunks(),
  /** dev: the map lenses. setLens returns the time the lens took to paint, in ms. */
  setLens: (id) => { setLens(id); return lastLensMs; }, get lens() { return lensId; }, lensMs: () => lastLensMs,
  setMood: (v) => { $('mood').value = v; setMood(v); },
  setSaver: (on) => setSaver(!!on), get saver() { return saver; },
  search: (q) => { sIn.value = q; runSearch(); return hits.map((h) => `${h.title} | ${h.hint}`); },
  openHit: (i) => openHit(i),
  /** test hooks: select a building by id (0 or null clears), set the see-through mode, read it */
  select: (id) => select(id ? city.buildings[id - 1] : null), setSee, get seeMode() { return seeMode; },
  get demoOffers() { return demoOffers; }, get demoUnits() { return demoUnits; }, get inhabitState() { return inhabitState; },
  resetInhabitDemo, refreshOccupancy,
  diagnostics() {
    const info = view.renderer.info;
    return {
      cityId: city?.P?.id ?? null,
      seed: city?.P?.seed ?? null,
      version: GEN_VERSION,
      renderer: {
        vendor: view.glVendor,
        renderer: view.glRenderer,
        software: view.software,
        dpr: view.renderer.getPixelRatio(),
      },
      quality: {
        tier: view.qualityTier,
        manual: view.manualQuality,
        saver,
        detail: view.uniforms.uDetail.value,
      },
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      renders: view.renders,
      memory: {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      loading: {
        genMs: city?.ms ?? 0,
        loadMs: view.loadMs ?? 0,
        timings: city?.timings ?? {},
      },
      activeCacheIds: cache.keys(),
    };
  },
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
