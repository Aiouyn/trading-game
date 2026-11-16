const PAGES = [
  ['life', 'LIFE', 'L'],
  ['desk', 'DESK', '1'],
  ['wire', 'WIRE', '2'],
  ['firms', 'FIRMS', '0'],
  ['people', 'PEOPLE', 'N'],
  ['contacts', 'CONTACTS', '3'],
  ['bonds', 'BONDS', '4'],
  ['futures', 'FUTS', '5'],
  ['options', 'OPTS', 'O'],
  ['crypto', 'COINS', '6'],
  ['fx', 'FX', '7'],
  ['homes', 'HOMES', 'P'],
  ['family', 'FAMILY', 'F'],
  ['health', 'HEALTH', 'G'],
  ['economy', 'MACRO', '8'],
  ['boards', 'BIDS', 'T'],
  ['log', 'LOG', '9'],
  ['help', 'HELP', '?'],
];
const SPEEDS = [['pause', 'PAUSE', 'pause'], ['day', 'PLAY', '1 day a second'], ['week', 'FAST', '1 week a second'], ['month', 'MONTH', 'skip to the next month']];
const SPEED_ORDER = ['pause', 'day', 'week', 'month'];

const S = {
  view: null,
  page: 'life',
  arg: '',
  selected: '',
  sort: 'chg',
  sortDir: -1,
  side: 'buy',
  orderType: 'mkt',
  optRight: 'C',
  optMonths: 2,
  nb: '',
  chart: null,
  chartSpan: 'year',
  explain: null,
  history: null,
  flash: '',
  flashBad: false,
  loading: '',
  gate: false,
  titleData: null,
  titleMode: 'menu',
  gen: null,
  generating: false,
};

const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => escMap[c]); }

function money(cents) {
  const n = Number(cents) || 0;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n) / 100;
  return sign + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function px(cents) { return money(cents); }
function pct(frac) {
  const n = Number(frac) || 0;
  const sign = n > 0 ? '+' : '';
  return sign + (n * 100).toFixed(2) + '%';
}
function pctPoints(n) {
  const x = Number(n) || 0;
  const sign = x > 0 ? '+' : '';
  return sign + x.toFixed(2) + '%';
}
function cls(n) { return n > 0 ? 'up' : n < 0 ? 'down' : 'dim'; }
function vol(n) {
  const x = Number(n) || 0;
  if (x >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (x >= 1e4) return (x / 1e3).toFixed(1) + 'k';
  return String(Math.round(x));
}
function dateOf(abs) {
  const day = Math.max(0, Number(abs) || 0);
  const year = Math.floor(day / 360) + 1;
  const doy = day % 360;
  return `Y${year} M${Math.floor(doy / 30) + 1} D${(doy % 30) + 1}`;
}
function whenOf(d) {
  if (!d) return '';
  return `Y${d.year} M${d.month} D${d.day}`;
}
function firmLink(id, name) {
  if (!id) return esc(name);
  return `<a href="#firm/${encodeURIComponent(id)}" data-firm="${esc(id)}">${esc(name)}</a>`;
}
function parcelLink(id, name) {
  if (id === undefined || id === null || id < 0) return esc(name);
  return `<a href="#parcel/${id}" data-parcel="${id}">${esc(name)}</a>`;
}
function stockLink(instr, label) {
  const q = S.view?.quotes?.find((x) => x.instr === instr);
  if (q) return firmLink(q.issuer, label || q.symbol);
  return esc(label || instr);
}
function personLink(index, name) {
  if (index === undefined || index === null || index < 0) return esc(name);
  return `<a href="#person/${index}" data-person="${index}">${esc(name)}</a>`;
}
function rich(text, firms, people) {
  const marks = [];
  for (const f of firms ?? []) {
    if (!f) continue;
    if (f.name) marks.push({ name: f.name, html: firmLink(f.id, f.name) });
    if (f.id) marks.push({ name: 'eq:' + f.id, html: firmLink(f.id, f.name || f.id) });
  }
  for (const p of people ?? []) if (p?.name) marks.push({ name: p.name, html: personLink(p.index, p.name) });
  marks.sort((a, b) => b.name.length - a.name.length);
  let html = '';
  const s = String(text ?? '');
  let i = 0;
  while (i < s.length) {
    let hit = null;
    for (const m of marks) if (s.startsWith(m.name, i)) { hit = m; break; }
    if (hit) { html += hit.html; i += hit.name.length; }
    else { html += esc(s[i]); i++; }
  }
  return html;
}
function whyNum(text, eventId, title) {
  if (eventId === undefined || eventId === null || eventId === '') return String(text);
  return `<button type="button" class="why" data-explain="${eventId}" data-title="${esc(title || text)}" title="${esc(title || text)}">${text}</button>`;
}
function trendArrow(n) {
  if (n > 0) return '<span class="arr up">↑</span>';
  if (n < 0) return '<span class="arr down">↓</span>';
  return '<span class="arr dim">→</span>';
}
function statsHtml() {
  const stats = S.view?.stats ?? [];
  if (!stats.length) return '';
  return stats.map((s) => `<button type="button" class="stat" data-explain="${s.eventId}" data-title="${esc(s.label)}" title="${esc(s.hover)}">
      <span class="k">${esc(s.label)}</span><b>${esc(s.word)}</b>${s.note ? `<span class="dim">${esc(s.note)}</span>` : ''}${trendArrow(s.trend)}
    </button>`).join('');
}

function route() {
  const raw = (location.hash || '#life').replace(/^#/, '');
  const cut = raw.indexOf('/');
  let page = (cut < 0 ? raw : raw.slice(0, cut)) || 'desk';
  const arg = cut < 0 ? '' : decodeURIComponent(raw.slice(cut + 1));
  if (page === 'run') page = 'firms';
  return { page, arg };
}

function shell() {
  const nav = PAGES.map(([id, label, key]) => `<button type="button" data-go="${id}" id="nav-${id}">${label} <span class="dim">${key}</span></button>`).join('');
  const speeds = SPEEDS.map(([id, label, title]) => `<button type="button" data-speed="${id}" id="spd-${id}" title="${esc(title)}">${label}</button>`).join('');
  document.getElementById('app').innerHTML = `
    <div id="title" hidden></div>
    <div id="play">
      <header>
        <div class="brand">AVALON</div>
        <div id="when" class="dim"></div>
        <div id="who"></div>
        <div id="worth" class="nw"></div>
        <div id="goal" class="goal"></div>
        <div class="tape" id="tape"></div>
        <div class="speeds">${speeds}</div>
        <button type="button" data-save id="save-btn">SAVE</button>
        <button type="button" data-load>LOAD</button>
      </header>
      <div id="stats" class="stats"></div>
      <div id="alerts"></div>
      <div id="hint" hidden></div>
      <div class="play-body">
        <nav>${nav}</nav>
        <div id="body"><main id="main"></main><aside id="chain" hidden></aside></div>
      </div>
      <footer>
        <span id="books">books …</span>
        <span id="flash"></span>
        <span class="dim">L life · 1 desk · 2 wire · N people · space pause · [ ] speed</span>
      </footer>
    </div>`;
  document.getElementById('app').addEventListener('click', onClick);
  document.getElementById('app').addEventListener('submit', onSubmit);
  document.getElementById('app').addEventListener('change', onChange);
}

function paintChrome() {
  const v = S.view;
  const when = document.getElementById('when');
  const who = document.getElementById('who');
  const tape = document.getElementById('tape');
  const books = document.getElementById('books');
  const flash = document.getElementById('flash');
  paintHint();
  const worth = document.getElementById('worth');
  const goal = document.getElementById('goal');
  if (S.gate) {
    when.textContent = '';
    if (worth) worth.innerHTML = '';
    if (goal) goal.innerHTML = '';
    const stats = document.getElementById('stats');
    if (stats) stats.innerHTML = '';
    if (books) { books.textContent = ''; books.className = ''; }
    return;
  }
  if (!v) {
    when.textContent = 'loading the books';
    return;
  }
  when.textContent = whenOf(v.date);
  const job = v.firm ? firmLink(v.firm, v.employer) : esc(v.employer || 'unemployed');
  who.innerHTML = v.over
    ? `<span class="dead">${esc(v.name)} · the house ends</span>`
    : v.alive ? `${esc(v.name)}, ${v.age} · ${job}` : `<span class="dead">${esc(v.name)} has died</span>`;
  const worthStat = (v.stats || []).find((s) => s.id === 'worth');
  if (worth) {
    worth.innerHTML = `${whyNum(money(v.netWorth), worthStat?.eventId, 'net worth')} ${trendArrow(worthStat?.trend || 0)}`;
  }
  const sc = v.scenario;
  if (goal) {
    goal.innerHTML = sc
      ? `<span class="dim">${esc(sc.name)}</span> ${esc(sc.goal)} <b>${esc(sc.timeLeft || '')}</b>${sc.beat ? ` <span class="dim">beat ${money(sc.beat)}</span>` : ''}`
      : '';
  }
  const stats = document.getElementById('stats');
  if (stats) stats.innerHTML = statsHtml();
  const t = v.tape;
  if (t) {
    tape.innerHTML = [
      tapeBtn(t.events.jobs, 'U', (t.unemployment * 100).toFixed(1) + '%'),
      tapeBtn(t.events.cpi, 'CPI', (t.inflation * 100).toFixed(1) + '%'),
      tapeBtn(t.events.rate, 'RATE', (t.policy * 100).toFixed(2) + '%'),
      tapeBtn(t.events.fx, 'FX', Number(t.fx).toFixed(4)),
      tapeBtn(t.events.index, 'IDX', Number(t.index).toFixed(1), t.indexChg),
    ].join('');
  }
  books.textContent = v.books?.ok ? 'books balanced' : 'BOOKS DO NOT BALANCE';
  books.className = v.books?.ok ? '' : 'bad';
  const alerts = document.getElementById('alerts');
  if (alerts) alerts.innerHTML = alertsHtml();
  flash.textContent = S.flash;
  flash.className = S.flashBad ? 'bad' : 'ok';
  const ticket = document.getElementById('ticketmsg');
  if (ticket) { ticket.textContent = S.flash; ticket.className = S.flashBad ? 'bad' : 'ok'; }
  for (const [id] of PAGES) {
    const el = document.getElementById('nav-' + id);
    if (el) el.classList.toggle('on', id === S.page);
  }
  for (const [id] of SPEEDS) {
    const el = document.getElementById('spd-' + id);
    if (el) el.classList.toggle('on', id === (v.speed || 'pause'));
  }
  renderChain();
}
const ALERT_WORD = { margin: 'MARGIN', bid: 'BID', strike: 'STRIKE', letter: 'LETTER', child: 'CHILD', rent: 'RENT' };
function alertsHtml() {
  const pause = S.view?.pause;
  const rows = S.view?.alerts ?? [];
  const head = pause?.why
    ? `<span class="alert"><button type="button" data-explain="${pause.eventId ?? ''}" data-title="${esc(pause.why)}">PAUSED</button> ${esc(pause.why)}</span>`
    : '';
  if (!rows.length && !head) return '<span class="dim">nothing needs you</span>';
  return head + rows.map((a) => `<span class="alert ${esc(a.kind)}">
      <a href="#${esc(a.page)}${a.arg ? '/' + encodeURIComponent(a.arg) : ''}">${ALERT_WORD[a.kind] || esc(a.kind)}</a>
      <button type="button" data-explain="${a.eventId}" data-title="${esc(a.text)}">${esc(a.text)}</button>
    </span>`).join('');
}
function pctSignedMoney(cents) {
  const n = Number(cents) || 0;
  const sign = n > 0 ? '+' : '';
  return sign + money(n);
}
function tapeBtn(id, label, value, chg) {
  const extra = chg === undefined ? '' : ` <span class="${cls(chg)}">${pct(chg)}</span>`;
  return `<button type="button" data-explain="${id ?? ''}">${label} ${esc(value)}${extra}</button>`;
}

function go(page, arg) {
  location.hash = arg ? `${page}/${encodeURIComponent(arg)}` : page;
}

function onClick(ev) {
  if (ev.target.closest('a[href]')) return;
  const t = ev.target.closest('[data-go],[data-speed],[data-pick],[data-firm],[data-person],[data-explain],[data-cancel],[data-side],[data-otype],[data-sort],[data-talk],[data-ask],[data-court],[data-marry],[data-life],[data-span],[data-bond],[data-fut],[data-coin],[data-launch],[data-cash],[data-macro],[data-opt],[data-home],[data-nb],[data-co],[data-parcel],[data-optmonth],[data-optright],[data-start],[data-hints],[data-story],[data-mode],[data-continue],[data-save],[data-load],[data-pick-save],[data-back]');
  if (!t || !document.getElementById('app').contains(t)) return;
  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.dataset.speed) { setSpeed(t.dataset.speed); return; }
  if (t.dataset.pick) { pick(t.dataset.pick); return; }
  if (t.dataset.firm && !t.getAttribute('href')) { go('firm', t.dataset.firm); return; }
  if (t.dataset.person && !t.getAttribute('href')) { go('person', t.dataset.person); return; }
  if (t.hasAttribute('data-explain') && t.dataset.explain !== '') {
    openExplain(Number(t.dataset.explain), t.dataset.title || t.textContent.trim());
    return;
  }
  if (t.dataset.cancel) { postAct({ kind: 'cancel', orderId: Number(t.dataset.cancel) }); return; }
  if (t.dataset.side) { S.side = t.dataset.side; paintSides(); document.getElementById('qty')?.focus(); return; }
  if (t.dataset.otype) { S.orderType = t.dataset.otype; paintSides(); return; }
  if (t.dataset.sort) { toggleSort(t.dataset.sort); return; }
  if (t.dataset.talk) { postAct({ kind: 'talk', slot: Number(t.dataset.talk) }); return; }
  if (t.dataset.court !== undefined) { postAct({ kind: 'court', slot: t.dataset.court === '' ? -1 : Number(t.dataset.court) }); return; }
  if (t.dataset.marry !== undefined) { postAct({ kind: 'marry', slot: t.dataset.marry === '' ? -1 : Number(t.dataset.marry) }); return; }
  if (t.dataset.life) { lifeAct(t.dataset.life); return; }
  if (t.dataset.ask) {
    const firm = document.getElementById('askfirm')?.value || S.view?.firm || '';
    postAct({ kind: 'ask', slot: Number(t.dataset.ask), firm });
    return;
  }
  if (t.dataset.span) { S.chartSpan = t.dataset.span; drawChart(); paintSpans(); return; }
  if (t.dataset.bond) { bond(t.dataset.bond); return; }
  if (t.dataset.fut) { future(t.dataset.fut); return; }
  if (t.dataset.coin) { coin(t.dataset.coin); return; }
  if (t.dataset.launch !== undefined) { postAct({ kind: 'launch' }); return; }
  if (t.dataset.cash) { cash(t.dataset.cash); return; }
  if (t.dataset.macro) { openExplain(Number(t.dataset.macro), t.dataset.title || ''); return; }
  if (t.dataset.opt) { dealOption(t.dataset.opt, t.dataset.id, t.dataset.right); return; }
  if (t.dataset.home) { dealHome(t.dataset.home, Number(t.dataset.id)); return; }
  if (t.dataset.nb !== undefined) { S.nb = S.nb === t.dataset.nb ? '' : t.dataset.nb; patchHomes(); return; }
  if (t.dataset.parcel) { go('parcel', t.dataset.parcel); return; }
  if (t.dataset.co) { runCompany(t.dataset.co, t.dataset.cofirm || ''); return; }
  if (t.dataset.optmonth !== undefined) {
    S.optMonths = Number(t.dataset.optmonth);
    const box = document.getElementById('optmonths');
    if (box) box.value = String(S.optMonths);
    patchOptions();
    return;
  }
  if (t.dataset.optright) { S.optRight = t.dataset.optright; paintOptRight(); return; }
  if (t.dataset.start) { startScenario(t.dataset.start); return; }
  if (t.dataset.mode) { openTitleMode(t.dataset.mode); return; }
  if (t.hasAttribute('data-back')) { backTitle(); return; }
  if (t.hasAttribute('data-continue')) { continueGame(); return; }
  if (t.hasAttribute('data-save')) { saveGame(); return; }
  if (t.hasAttribute('data-load')) { openLoad(); return; }
  if (t.dataset.pickSave) { loadGame(t.dataset.pickSave); return; }
  if (t.dataset.hints) { postAct({ kind: 'hints', on: t.dataset.hints !== 'off' }); return; }
  if (t.dataset.story !== undefined) { showStory(); return; }
}

function onSubmit(ev) {
  const form = ev.target;
  if (!(form instanceof HTMLFormElement)) return;
  ev.preventDefault();
  if (form.id === 'ticket') submitTicket();
  else if (form.id === 'opt-ticket') submitOption(form);
  else if (form.id === 'sandbox') {
    const data = new FormData(form);
    startScenario('sandbox', Number(data.get('cash')), Number(data.get('difficulty')));
  }
  else if (form.id === 'challenge') {
    startChallenge(String(new FormData(form).get('code') || ''));
  }
  else if (form.id === 'found-form') submitFound(form);
  else if (form.id === 'bid-ticket') submitBid(form);
  else if (form.id === 'ceo-form') submitCeo(form);
  else if (form.id === 'ipo-form') submitIpo(form);
  else if (form.id === 'bid-form') submitBid(form);
  else if (form.id === 'board-form') submitBoard(form);
}
function onChange(ev) {
  if (ev.target?.id === 'optname') { S.optInstr = ev.target.value; patchOptions(); }
}

async function setSpeed(speed) {
  const res = await fetch('/speed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speed }) });
  const data = await res.json();
  if (!res.ok) { note(data.error || 'speed refused', true); return; }
  if (S.view) S.view.speed = data.speed;
  paintChrome();
}
function note(text, bad) {
  S.flash = text || '';
  S.flashBad = !!bad;
  const el = document.getElementById('flash');
  if (el) { el.textContent = S.flash; el.className = bad ? 'bad' : 'ok'; }
}
async function postAct(cmd) {
  const res = await fetch('/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  const data = await res.json();
  if (data.view) S.view = data.view;
  const said = data.text || (Array.isArray(data.lines) ? data.lines.join(' · ') : '');
  note(data.status === 'rejected' ? (data.why || 'rejected') : (said || 'accepted'), data.status === 'rejected');
  if (S.page === 'desk') { paintChrome(); patchDesk(); }
  else { await renderMain(); paintChrome(); }
  return data;
}

function sortedQuotes() {
  const rows = [...(S.view?.quotes ?? [])];
  const k = S.sort;
  const dir = S.sortDir;
  rows.sort((a, b) => {
    const av = k === 'symbol' ? a.symbol : k === 'vol' ? a.vol : k === 'px' ? a.px : Math.abs(a.chg);
    const bv = k === 'symbol' ? b.symbol : k === 'vol' ? b.vol : k === 'px' ? b.px : Math.abs(b.chg);
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return a.symbol < b.symbol ? -1 : 1;
  });
  return rows;
}
function toggleSort(key) {
  if (S.sort === key) S.sortDir *= -1;
  else { S.sort = key; S.sortDir = key === 'symbol' ? 1 : -1; }
  patchDesk();
}
function pick(instr) {
  S.selected = instr;
  const q = S.view?.quotes?.find((x) => x.instr === instr);
  document.querySelectorAll('.qrow').forEach((el) => el.classList.toggle('on', el.dataset.pick === instr));
  const title = document.getElementById('chart-title');
  if (title && q) title.innerHTML = `${esc(q.symbol)} ${firmLink(q.issuer, q.name)} <span class="${cls(q.chg)}">${whyNum(px(q.px), q.eventId, q.symbol + ' price')} ${whyNum(pct(q.chg), q.eventId, q.symbol + ' change')}</span>`;
  loadChart(q?.issuer);
}
async function loadChart(issuer) {
  if (!issuer) return;
  const want = S.selected;
  const res = await fetch('/firm/' + encodeURIComponent(issuer));
  if (!res.ok || S.selected !== want) return;
  const firm = await res.json();
  S.chart = { instr: want, daily: firm.daily ?? [], span: firm.span ?? [] };
  drawChart();
}

function sparkSvg(values, chg) {
  const v = values && values.length ? values : [0, 0];
  const w = 72, h = 16;
  let lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const d = v.map((n, i) => {
    const x = v.length === 1 ? w / 2 : (i / (v.length - 1)) * (w - 2) + 1;
    const y = (1 - (n - lo) / (hi - lo)) * (h - 3) + 1;
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join(' ');
  const col = chg > 0 ? '#3dce8e' : chg < 0 ? '#f07178' : '#8b97a6';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${col}" stroke-width="1.25"/></svg>`;
}
const series = new Map();
function seriesOf(key, prev, value) {
  const p = Number(value);
  if (!Number.isFinite(p)) return [0, 0];
  let a = series.get(key);
  if (!a) {
    const q = Number(prev);
    a = Number.isFinite(q) && q !== p ? [q, p] : [p];
    series.set(key, a);
    return a;
  }
  if (a[a.length - 1] !== p) {
    a.push(p);
    if (a.length > 32) a.shift();
  }
  return a;
}
function quotesHtml() {
  const head = `<div class="qhead"><button type="button" data-sort="symbol">SYMBOL</button><span></span><span></span><button type="button" class="num" data-sort="px">LAST</button><button type="button" class="num" data-sort="chg">CHG</button><button type="button" class="num" data-sort="vol">VOL</button></div>`;
  const rows = sortedQuotes().map((q) => `
    <div class="qrow${q.instr === S.selected ? ' on' : ''}" data-pick="${esc(q.instr)}">
      <span>${firmLink(q.issuer, q.symbol)}</span>
      <span class="name">${firmLink(q.issuer, q.name)}</span>
      <span class="sparkcell">${sparkSvg(q.spark, q.chg)}</span>
      <span class="num" data-cell="px">${whyNum(px(q.px), q.eventId, q.symbol + ' price')}</span>
      <span class="num ${cls(q.chg)}" data-cell="chg">${whyNum(pct(q.chg), q.eventId, q.symbol + ' change')}</span>
      <span class="num dim" data-cell="vol">${whyNum(vol(q.vol), q.eventId, q.symbol + ' volume')}</span>
    </div>`).join('');
  return head + rows;
}
function positionsHtml() {
  const v = S.view;
  const quotes = new Map((v?.quotes ?? []).map((q) => [q.instr, q]));
  const rows = (v?.shares ?? []).map((s) => {
    const q = quotes.get(s.instr);
    const prev = q?.prev ?? s.px;
    const day = (s.px - prev) * s.qty;
    const sym = q?.symbol ?? s.instr;
    const name = q ? firmLink(q.issuer, q.name) : stockLink(s.instr);
    const ev = s.eventId;
    return `<tr><td>${stockLink(s.instr, sym)} ${name}</td><td class="num">${whyNum(s.qty, ev, sym + ' qty')}</td><td class="num">${whyNum(px(s.px), ev, sym + ' price')}</td><td class="num">${whyNum(money(s.qty * s.px), ev, sym + ' value')}</td><td class="num ${cls(day)}">${whyNum(pctSignedMoney(day), ev, sym + ' day')}</td></tr>`;
  }).join('');
  const orders = (v?.orders ?? []).filter((o) => o.book === 'shares').map((o) => `
    <tr><td>${o.id}</td><td>${esc(o.side)}</td><td>${stockLink(o.instr, quotes.get(o.instr)?.symbol ?? o.instr)}</td><td class="num">${whyNum(o.qty, o.eventId, 'qty')}</td><td class="num">${o.limit ? whyNum(px(o.limit), o.eventId, 'limit') : 'MKT'}</td>
    <td><button type="button" data-cancel="${o.id}">cancel</button></td></tr>`).join('');
  return `
    <div class="panel scroll"><h2>POSITIONS</h2>
      <table><thead><tr><th>NAME</th><th class="num">QTY</th><th class="num">LAST</th><th class="num">VALUE</th><th class="num">DAY P/L</th></tr></thead>
      <tbody>${rows || '<tr><td class="dim" colspan="5">no shares</td></tr>'}</tbody></table></div>
    <div class="panel scroll"><h2>ORDERS</h2>
      <table><thead><tr><th>ID</th><th>SIDE</th><th>NAME</th><th class="num">QTY</th><th class="num">LIMIT</th><th></th></tr></thead>
      <tbody>${orders || '<tr><td class="dim" colspan="6">no open orders</td></tr>'}</tbody></table></div>`;
}
function ticketHtml() {
  const dead = S.view && (!S.view.alive || S.view.over);
  return `
    <div class="panel ticket">
      <h2>TICKET ${dead ? '<span class="dead">the game is over</span>' : ''}</h2>
      <div class="row">
        <button type="button" class="buy${S.side === 'buy' ? ' on' : ''}" data-side="buy">BUY</button>
        <button type="button" class="sell${S.side === 'sell' ? ' on' : ''}" data-side="sell">SELL</button>
        <button type="button" class="short${S.side === 'short' ? ' on' : ''}" data-side="short">SHORT</button>
        <button type="button" data-otype="mkt" class="${S.orderType === 'mkt' ? 'on' : ''}">MKT</button>
        <button type="button" data-otype="lmt" class="${S.orderType === 'lmt' ? 'on' : ''}">LMT</button>
      </div>
      <form id="ticket" class="row">
        <label>QTY <input id="qty" inputmode="numeric" value="1" ${dead ? 'disabled' : ''}></label>
        <label>PX <input id="px" inputmode="decimal" placeholder="mkt" ${S.orderType === 'lmt' && !dead ? '' : 'disabled'}></label>
        <button type="submit" ${dead ? 'disabled' : ''}>SEND</button>
      </form>
      <div class="row">
        <label>MARGIN $ <input id="margin" inputmode="decimal" value="500" ${dead ? 'disabled' : ''}></label>
        <button type="button" data-cash="borrow" ${dead ? 'disabled' : ''}>BORROW</button>
        <button type="button" data-cash="repay" ${dead ? 'disabled' : ''}>REPAY</button>
      </div>
      <div id="ticketmsg" class="${S.flashBad ? 'bad' : 'ok'}">${esc(S.flash)}</div>
    </div>`;
}

function finalBanner() {
  const v = S.view;
  if (!v?.final) return '';
  const d = v.dynasty;
  return `<div class="panel"><h2>THE HOUSE ENDS</h2><div style="padding:8px">${esc(v.final)}</div>
    ${d ? `<div class="facts"><span class="k">generation</span><span>${whyNum(d.generation, d.eventId, 'generation')}</span><span class="k">family worth</span><span>${whyNum(money(d.worth), d.eventId, 'family worth')}</span><span class="k">founded</span><span>${whyNum(d.founded, d.eventId, 'founded')}</span><span class="k">controlled</span><span>${whyNum(d.controlled, d.eventId, 'controlled')}</span><span class="k">offices</span><span>${whyNum(d.offices, d.eventId, 'offices')}</span><span class="k">convictions</span><span>${whyNum(d.convictions, d.eventId, 'convictions')}</span></div>` : ''}
  </div>`;
}
function lifeAct(raw) {
  if (raw === 'holiday' || raw === 'donate' || raw === 'lawyer' || raw === 'clinic' || raw === 'overtime') {
    postAct({ kind: raw });
    return;
  }
  if (raw === 'child') { postAct({ kind: 'child' }); return; }
  if (raw === 'retire') { postAct({ kind: 'retire' }); return; }
  if (raw === 'die') { postAct({ kind: 'die' }); return; }
  if (raw === 'hand') {
    const firm = S.view?.firm || S.view?.companies?.[0]?.id;
    if (!firm) { note('you do not run a firm', true); return; }
    postAct({ kind: 'hand', firm });
    return;
  }
  if (raw.startsWith('school:')) { postAct({ kind: 'school', nth: Number(raw.slice(7)) }); return; }
  if (raw === 'will:spouse') { postAct({ kind: 'will', how: 'spouse', nth: 0 }); return; }
  if (raw === 'will:child') { postAct({ kind: 'will', how: 'child', nth: 0 }); return; }
}
function renderFamily() {
  const v = S.view;
  if (!v) return '<div class="dim">loading the books…</div>';
  const d = v.dynasty || {};
  const fam = v.family || { children: [], will: '' };
  const hp = new Map((v.healthPanel?.house ?? []).map((h) => [h.index, h]));
  const people = (d.people || []).map((p) => {
    const h = hp.get(p.index);
    return `<tr>
    <td>${personLink(p.index, p.name)}</td><td>${esc(p.role)}</td><td class="num">${whyNum(p.age, p.eventId, p.name + ' age')}</td>
    <td class="num">${h ? whyNum(h.health >= 75 ? 'Sound' : h.health >= 45 ? 'Worn' : 'Failing', h.eventId || p.eventId, p.name + ' ' + h.health) : ''}</td>
    <td>${p.alive ? 'living' : '<span class="dead">dead</span>'}</td><td class="num">${whyNum(money(p.worth), p.eventId, p.name + ' worth')}</td></tr>`;
  }).join('');
  const spouse = fam.spouse ? personLink(fam.spouse.index, fam.spouse.name) : '<span class="dim">none</span>';
  const kids = (fam.children || []).map((k, n) => {
    const h = hp.get(k.index);
    const ill = h?.illness ? ` <span class="down">${esc(h.illness)}</span>` : '';
    return `<div>${personLink(k.index, k.name)}, ${k.age}${ill} <button type="button" data-life="school:${n}">school ${k.school}</button></div>`;
  }).join('') || '<div class="dim">no children</div>';
  const heir = v.heir ? `${personLink(v.heir.index, v.heir.name)} <button type="button" data-explain="${v.heir.eventId}">the will</button>` : '<span class="dim">the city rule</span>';
  const chronicle = (S.history?.entries ?? []).filter((e) => e.kind === 'player').slice().reverse().map((e) => `
    <div class="log-item"><span class="dim">${dateOf(e.day)}</span><br>${esc(e.text)}</div>`).join('')
    || '<div class="dim" style="padding:8px">the family page of the chronicle is still blank</div>';
  const acts = v.over ? '' : `<div style="padding:8px">
    <button type="button" data-court>COURT</button>
    <button type="button" data-marry>MARRY</button>
    <button type="button" data-life="child">CHILD</button>
    <button type="button" data-life="will:spouse">WILL SPOUSE</button>
    <button type="button" data-life="will:child">WILL CHILD</button>
    <button type="button" data-life="retire">RETIRE</button>
    <button type="button" data-life="hand">HAND THE FIRM</button>
    <button type="button" data-life="die">DIE</button>
  </div>`;
  return `${finalBanner()}<div class="split">
    <div class="panel"><h2>DYNASTY <span>generation ${d.generation ?? 1}</span></h2>
      <div class="score">${whyNum(money(d.worth || 0), d.eventId, 'family worth')} <span class="dim">dynasty score</span></div>
      <div class="facts">
        <span class="k">spouse</span><span>${spouse}</span>
        <span class="k">heir</span><span>${heir}</span>
        <span class="k">will</span><span>${esc(fam.will || 'no will')}</span>
        <span class="k">firms founded</span><span>${whyNum(d.founded ?? 0, d.eventId, 'firms founded')}</span>
        <span class="k">firms controlled</span><span>${whyNum(d.controlled ?? 0, d.eventId, 'firms controlled')}</span>
        <span class="k">offices held</span><span>${whyNum(d.offices ?? 0, d.eventId, 'offices')}</span>
        <span class="k">convictions</span><span>${whyNum(d.convictions ?? 0, d.eventId, 'convictions')}</span>
      </div>
      <div style="padding:0 8px 8px"><div class="dim">children</div>${kids}</div>
      <table><thead><tr><th>NAME</th><th>ROLE</th><th class="num">AGE</th><th class="num">HEALTH</th><th></th><th class="num">WORTH</th></tr></thead>
      <tbody>${people || '<tr><td class="dim">no one in the house</td></tr>'}</tbody></table>
      ${acts}
    </div>
    <div class="panel"><h2>CHRONICLE <span>the family</span> <button type="button" data-story>your story</button></h2>${chronicle}</div>
  </div>`;
}
const TAG = { you: 'YOU', family: 'FAMILY', firm: 'FIRM', city: 'CITY', wire: 'WIRE' };
function renderLife() {
  const v = S.view;
  if (!v) return '<div class="dim">loading the books…</div>';
  const sc = v.scenario;
  const hint = sc?.showHints ? (sc.hints?.life || sc.hints?.desk || sc.hints?.['*'] || '') : '';
  const brief = sc ? `<div class="brief">
      <b>${esc(sc.name)}</b>
      <p>${esc(sc.story || '')}</p>
      <p>Goal: ${esc(sc.goal)}. <b>${esc(sc.timeLeft || '')}</b></p>
      <p class="dim">Play runs a day a second. Fast runs a week a second. Month skips to the next month. Space pauses. Every line and every number opens why.</p>
      ${hint ? `<p class="dim">${esc(hint)}</p>` : ''}
    </div>` : `<div class="brief"><b>Your life in this city</b><p class="dim">Play runs a day a second. The desk is where prices are.</p></div>`;
  const lines = (v.feed || []).map((n) => `<button type="button" class="life-line" data-explain="${n.eventId}" data-title="${esc(n.text)}">
      <span class="dim">${dateOf(n.day)}</span>
      <span class="tag">${TAG[n.tag] || esc(n.tag || '')}</span>
      <span>${esc(n.text)}</span>
    </button>`).join('');
  const empty = '<div class="dim life-empty">Nothing new since you last looked. Press play.</div>';
  const choices = (v.choices || []).map((c) => {
    const wait = c.left > 0 ? ` · ${c.left}d` : '';
    const dead = !v.alive || v.over;
    return `<button type="button" data-life="${esc(c.id)}" title="${esc(c.line)}" ${dead || c.left > 0 ? 'disabled' : ''}>${esc(c.label).toUpperCase()}${wait}</button>`;
  }).join('');
  return `${brief}<div class="life-feed">${lines || empty}</div><div class="life-acts">${choices}</div>`;
}
function renderPeople() {
  const v = S.view;
  if (!v) return '<div class="dim">loading the books…</div>';
  const house = v.healthPanel?.house || [];
  const rows = house.map((p) => `<tr>
      <td>${personLink(p.index, p.name)}</td>
      <td>${esc(p.role)}</td>
      <td class="num">${whyNum(p.age, p.eventId, p.name + ' age')}</td>
      <td>${p.alive ? esc(p.illness || 'well') : '<span class="dead">dead</span>'}</td>
      <td><button type="button" data-explain="${p.eventId}" data-title="${esc(p.name)}">why</button></td>
    </tr>`).join('');
  const contacts = (v.contacts || []).map((c) => `<tr>
      <td>${personLink(c.who, c.name)}</td>
      <td class="dim">${esc(c.kind)}</td>
      <td>${esc(c.line || c.word || '')}</td>
      <td><button type="button" data-talk="${c.slot}">talk</button></td>
    </tr>`).join('');
  return `<div class="split">
      <div class="panel"><h2>THE HOUSE</h2>
        <table><thead><tr><th>NAME</th><th>ROLE</th><th class="num">AGE</th><th></th><th></th></tr></thead>
        <tbody>${rows || '<tr><td class="dim">no one in the house</td></tr>'}</tbody></table>
      </div>
      <div class="panel"><h2>PEOPLE YOU KNOW</h2>
        <table><thead><tr><th>NAME</th><th></th><th>HOW YOU STAND</th><th></th></tr></thead>
        <tbody>${contacts || '<tr><td class="dim">no contacts yet</td></tr>'}</tbody></table>
      </div>
    </div>`;
}
function renderDesk() {
  const q = S.view?.quotes?.find((x) => x.instr === S.selected) ?? sortedQuotes()[0];
  if (q && !S.selected) S.selected = q.instr;
  const cur = S.view?.quotes?.find((x) => x.instr === S.selected);
  const title = cur ? `${esc(cur.symbol)} ${firmLink(cur.issuer, cur.name)} <span class="${cls(cur.chg)}">${whyNum(px(cur.px), cur.eventId, cur.symbol + ' price')} ${whyNum(pct(cur.chg), cur.eventId, cur.symbol + ' change')}</span>` : 'no listings';
  return `${finalBanner()}
    <div class="desk">
      <div class="panel quotes" id="quotes">${quotesHtml()}</div>
      <div class="side">
        <div class="panel chartbox">
          <h2><span id="chart-title">${title}</span><span><button type="button" data-span="year" class="${S.chartSpan === 'year' ? 'on' : ''}">1Y</button> <button type="button" data-span="all" class="${S.chartSpan === 'all' ? 'on' : ''}">ALL</button></span></h2>
          <canvas id="chart"></canvas>
        </div>
        ${ticketHtml()}
      </div>
      <div class="book" id="book">${positionsHtml()}</div>
    </div>
    ${S.view?.date?.abs === 0 ? '<div class="dim" id="hint">type help</div>' : ''}`;
}
function patchDesk() {
  const box = document.getElementById('quotes');
  if (!box) return;
  const top = box.scrollTop;
  box.innerHTML = quotesHtml();
  box.scrollTop = top;
  const book = document.getElementById('book');
  if (book) book.innerHTML = positionsHtml();
  const cur = S.view?.quotes?.find((x) => x.instr === S.selected);
  const title = document.getElementById('chart-title');
  if (title && cur) title.innerHTML = `${esc(cur.symbol)} ${firmLink(cur.issuer, cur.name)} <span class="${cls(cur.chg)}">${whyNum(px(cur.px), cur.eventId, cur.symbol + ' price')} ${whyNum(pct(cur.chg), cur.eventId, cur.symbol + ' change')}</span>`;
  paintSides();
  drawChart();
}
function paintSides() {
  document.querySelectorAll('[data-side]').forEach((el) => {
    el.classList.toggle('on', el.dataset.side === S.side);
  });
  document.querySelectorAll('[data-otype]').forEach((el) => el.classList.toggle('on', el.dataset.otype === S.orderType));
  const pxIn = document.getElementById('px');
  if (pxIn) pxIn.disabled = S.orderType !== 'lmt' || !!(S.view && (!S.view.alive || S.view.over));
}
function paintSpans() {
  document.querySelectorAll('[data-span]').forEach((el) => el.classList.toggle('on', el.dataset.span === S.chartSpan));
}
function submitTicket() {
  if (!S.selected) { note('pick a stock', true); return; }
  const qty = Number(document.getElementById('qty')?.value);
  const cmd = { kind: 'order', side: S.side, instr: S.selected, qty };
  if (S.orderType === 'lmt') {
    const dollars = Number(document.getElementById('px')?.value);
    if (!(dollars > 0)) { note('limit needs a price', true); return; }
    cmd.limit = Math.round(dollars * 100);
  }
  postAct(cmd);
}
function cash(op) {
  const dollars = Number(document.getElementById('margin')?.value);
  if (!(dollars > 0)) { note('amount must be positive', true); return; }
  postAct({ kind: 'cash', op, cents: Math.round(dollars * 100) });
}

function renderWire() {
  const v = S.view;
  const pubs = (v?.news ?? []).map((n) => wireItem(n, false)).join('') || '<div class="dim" style="padding:8px">no news in the paper</div>';
  const priv = (v?.private ?? []).map((n) => wireItem(n, true)).join('');
  return `<div class="panel"><h2>NEWSWIRE <span>${(v?.news?.length ?? 0)} published · ${(v?.private?.length ?? 0)} private</span></h2>${priv}${pubs}</div>`;
}
function wireItem(n, priv) {
  const who = priv ? `<span class="tag">told by ${personLink(n.fromIndex, n.from)}</span>` : '';
  const on = S.explain?.id === n.eventId ? ' on' : '';
  return `<div class="wire-item${priv ? ' priv' : ''}${on}" data-explain="${n.eventId}" data-title="${esc(n.text)}"><span class="dim">${dateOf(n.day)} · ${n.eventId}</span><br>${who ? who + ' ' : ''}${rich(n.text, n.firms || S.view?.firms)}</div>`;
}

function renderContacts() {
  const v = S.view;
  const firms = [...(v?.firms ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const opts = firms.map((f) => `<option value="${esc(f.id)}"${f.id === v.firm ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
  const rows = (v?.contacts ?? []).map((c) => `
    <div class="contact">
      <span class="dim">${c.slot}</span>
      <span>${personLink(c.who, c.name)}</span>
      <span class="dim">${esc(c.kind)}</span>
      <div class="rel-line">${esc(c.line || c.word || '')}</div>
      <span><button type="button" data-talk="${c.slot}">TALK</button> <button type="button" data-ask="${c.slot}">ASK</button> <button type="button" data-court="${c.slot}">COURT</button> <button type="button" data-marry="${c.slot}">MARRY</button></span>
    </div>`).join('') || '<div class="dim">no contacts</div>';
  return `<div class="panel"><h2>CONTACTS <span>${v?.contacts?.length ?? 0} / 16</span></h2>
    <div style="padding:8px">Ask about <select id="askfirm">${opts}</select></div>${rows}</div>`;
}

function renderBonds() {
  const v = S.view;
  const cards = (v?.curve ?? []).map((c) => `
    <div class="panel"><div class="tenor">${esc(c.tenor)}</div><div class="y">${sparkSvg(seriesOf('bond:' + c.tenor, null, c.yield), 0)}${whyNum((c.yield * 100).toFixed(2) + '%', c.eventId, c.tenor + ' yield')}</div>
    <div class="dim">${c.id ? esc(c.id) : 'model'} · ${c.px ? whyNum(px(c.px), c.eventId, c.tenor + ' price') : ''}</div>
    <button type="button" data-explain="${c.eventId}">why</button></div>`).join('');
  const held = (v?.bonds ?? []).map((b) => `<tr><td>${esc(b.instr)}</td><td class="num">${whyNum(money(b.face), b.eventId, 'face')}</td><td><button type="button" data-explain="${b.eventId}">why</button></td></tr>`).join('');
  return `<div class="yield">${cards}</div>
    <div class="panel ticket"><h2>BOND TICKET</h2>
      <div class="row">
        <select id="btenor">${(v?.curve ?? []).map((c) => `<option value="${esc(c.tenor)}">${esc(c.tenor)}</option>`).join('')}</select>
        <label>BONDS <input id="bbonds" value="1"></label>
        <label>LIMIT $ <input id="blimit" placeholder="mkt"></label>
        <button type="button" data-bond="buy" class="buy">BUY</button>
        <button type="button" data-bond="sell" class="sell">SELL</button>
      </div></div>
    <div class="panel" style="margin-top:8px"><h2>HOLDINGS</h2>
      <table><tbody>${held || '<tr><td class="dim">no bonds</td></tr>'}</tbody></table></div>`;
}
function bond(side) {
  const tenor = document.getElementById('btenor')?.value;
  const bonds = Number(document.getElementById('bbonds')?.value);
  const cmd = { kind: 'bond', side, tenor, bonds };
  const lim = document.getElementById('blimit')?.value;
  if (lim) cmd.limit = Math.round(Number(lim) * 100);
  postAct(cmd);
}

function renderFutures() {
  const v = S.view;
  const pos = new Map((v?.futures ?? []).map((f) => [f.good + ':' + f.monthsAhead, f]));
  const blocks = (v?.futuresBoard ?? []).map((b) => {
    const cells = b.tenors.map((t) => {
      const held = pos.get(b.good + ':' + t.monthsAhead);
      const chg = t.prev > 0 ? t.px / t.prev - 1 : 0;
      const spark = sparkSvg(seriesOf('fut:' + b.good + ':' + t.monthsAhead, t.prev, t.px), chg);
      return `<td class="num">${spark}${whyNum(px(t.px), b.eventId, b.name + ' price')} <span class="${cls(chg)}">${whyNum(pct(chg), b.eventId, b.name + ' change')}</span>${held ? `<br><span class="${cls(held.net)}">${whyNum((held.net > 0 ? 'L' : 'S') + Math.abs(held.net), held.eventId, 'position')}</span>` : ''}</td>`;
    }).join('');
    return `<tr><td>${esc(b.name)} <span class="dim">${esc(b.good)}</span></td>${cells}<td><button type="button" data-explain="${b.eventId}">why</button></td></tr>`;
  }).join('');
  const goods = (v?.futuresBoard ?? []).map((b) => `<option value="${esc(b.good)}">${esc(b.name)}</option>`).join('');
  const marginEv = v?.futures?.[0]?.eventId ?? v?.tape?.events?.rate;
  return `<div class="panel ticket"><h2>FUTURES <span>margin ${whyNum(money(v?.marginPosted || 0), marginEv, 'margin')}</span></h2>
    <div class="row">
      <select id="fgood">${goods}</select>
      <label>M+ <input id="fmonth" value="1"></label>
      <label>QTY <input id="fqty" value="1"></label>
      <button type="button" class="buy" data-fut="long">LONG</button>
      <button type="button" class="sell" data-fut="short">SHORT</button>
      <button type="button" data-fut="flat">FLAT</button>
    </div></div>
    <div class="panel" style="margin-top:8px"><table><thead><tr><th>GOOD</th><th class="num">M+0</th><th class="num">M+1</th><th class="num">M+2</th><th class="num">M+3</th><th class="num">M+4</th><th class="num">M+5</th><th></th></tr></thead><tbody>${blocks}</tbody></table></div>`;
}
function future(side) {
  postAct({
    kind: 'fut',
    side,
    good: document.getElementById('fgood')?.value,
    months: Number(document.getElementById('fmonth')?.value),
    qty: Number(document.getElementById('fqty')?.value),
  });
}

function renderCrypto() {
  const v = S.view;
  const held = new Map((v?.coins ?? []).map((c) => [c.id, c]));
  const rows = (v?.coinBoard ?? []).map((c) => {
    const h = held.get(c.id);
    const chg = c.prev > 0 ? c.px / c.prev - 1 : 0;
    return `<tr><td>${esc(c.name)} <span class="dim">${esc(c.id)}</span>${c.live ? '' : ' <span class="dead">dead</span>'}</td>
      <td class="num">${sparkSvg(seriesOf('coin:' + c.id, c.prev, c.px), chg)}${whyNum(px(c.px), c.eventId, c.name + ' price')} <span class="${cls(chg)}">${whyNum(pct(chg), c.eventId, c.name + ' change')}</span></td>
      <td class="num">${h ? whyNum(h.qty, h.eventId || c.eventId, 'held') : ''}</td>
      <td><button type="button" data-explain="${c.eventId}">why</button></td></tr>`;
  }).join('');
  const opts = (v?.coinBoard ?? []).filter((c) => c.live).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  return `<div class="panel ticket"><h2>COINS</h2>
    <div class="row">
      <select id="coin">${opts}</select>
      <label>QTY <input id="cqty" value="1"></label>
      <button type="button" class="buy" data-coin="buy">BUY</button>
      <button type="button" class="sell" data-coin="sell">SELL</button>
      <button type="button" data-launch>LAUNCH</button>
    </div></div>
    <div class="panel" style="margin-top:8px"><table><thead><tr><th>COIN</th><th class="num">LAST</th><th class="num">HELD</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function coin(side) {
  postAct({ kind: 'coin', side, coin: document.getElementById('coin')?.value, qty: Number(document.getElementById('cqty')?.value) });
}

function optionNames() {
  const names = [];
  for (const c of S.view?.chain ?? []) if (!names.includes(c.instr)) names.push(c.instr);
  return names;
}
function shownMonth(chain) {
  const months = [];
  for (const c of chain) if (!months.includes(c.months)) months.push(c.months);
  months.sort((a, b) => a - b);
  if (months.includes(S.optMonths)) return S.optMonths;
  const held = chain.find((c) => c.net);
  if (held) return held.months;
  let best = months[0] ?? 0;
  for (const m of months) if (Math.abs(m - S.optMonths) < Math.abs(best - S.optMonths)) best = m;
  return best;
}
function chainTable() {
  const chain = (S.view?.chain ?? []).filter((c) => c.instr === S.optInstr);
  const months = [];
  for (const c of chain) if (!months.includes(c.months)) months.push(c.months);
  months.sort((a, b) => a - b);
  const show = shownMonth(chain);
  const strikes = [];
  for (const c of chain) if (c.months === show && !strikes.includes(c.strike)) strikes.push(c.strike);
  strikes.sort((a, b) => a - b);
  const at = (right, strike) => chain.find((c) => c.months === show && c.right === right && c.strike === strike);
  const side = (row) => row ? `${whyNum(px(row.ask), row.eventId, 'ask')} <button type="button" data-opt="buy" data-id="${esc(row.id)}" data-right="${row.right}">buy</button> <button type="button" data-opt="write" data-id="${esc(row.id)}" data-right="${row.right}">write</button>${row.net ? ` <span class="${cls(row.net)}">${whyNum(row.net, row.eventId, 'net')}</span>` : ''}` : '';
  const rows = strikes.map((k) => {
    const call = at('C', k);
    const put = at('P', k);
    return `<tr>
      <td class="num">${side(call)}</td>
      <td class="num dim">${call ? whyNum(px(call.bid), call.eventId, 'call bid') : ''}</td>
      <td class="num">${whyNum(px(k), (call || put)?.eventId, 'strike')}</td>
      <td class="num dim">${put ? whyNum(px(put.bid), put.eventId, 'put bid') : ''}</td>
      <td class="num">${side(put)}</td>
      <td class="num dim">${whyNum((call?.oi ?? 0) + (put?.oi ?? 0) || '', (call || put)?.eventId, 'open interest')}</td>
    </tr>`;
  }).join('');
  const tabs = months.map((m) => `<button type="button" data-optmonth="${m}" class="${m === show ? 'on' : ''}">M+${m}</button>`).join(' ');
  return `<h2>CHAIN <span>${stockLink(S.optInstr)} · ${tabs}</span></h2>
    <table><thead><tr><th class="num">CALL ASK</th><th class="num">CALL BID</th><th class="num">STRIKE</th><th class="num">PUT BID</th><th class="num">PUT ASK</th><th class="num">OI</th></tr></thead>
    <tbody>${rows || '<tr><td class="dim" colspan="6">no contracts this month</td></tr>'}</tbody></table>`;
}
function renderOptions() {
  const names = optionNames();
  if (!S.optInstr || !names.includes(S.optInstr)) S.optInstr = names[0] || '';
  const pick = names.map((n) => `<option value="${esc(n)}"${n === S.optInstr ? ' selected' : ''}>${esc(stockSymbol(n))}</option>`).join('');
  return `<div class="optdesk">
    <div class="panel" id="opt-chain">${chainTable()}</div>
    <div class="panel ticket"><h2>OPTION TICKET</h2>
      <form id="opt-ticket">
        <div class="row">
          <select id="optname" name="instr">${pick}</select>
          <button type="button" data-optright="C" class="${S.optRight === 'C' ? 'on' : ''}">CALL</button>
          <button type="button" data-optright="P" class="${S.optRight === 'P' ? 'on' : ''}">PUT</button>
        </div>
        <div class="row">
          <label>STRIKE $ <input id="optstrike" name="strike" value="0"></label>
          <label>M+ <input id="optmonths" name="months" value="${S.optMonths}"></label>
          <label>QTY <input id="optqty" name="qty" value="1"></label>
        </div>
        <div class="row">
          <button type="submit" name="op" value="buy" class="buy">BUY</button>
          <button type="submit" name="op" value="write" class="sell">WRITE</button>
          <button type="submit" name="op" value="close">CLOSE</button>
        </div>
      </form>
      <div class="dim">a strike of 0 is at the money. buy pays the ask. write posts margin. in the money, it exercises at expiry.</div>
    </div>
  </div>`;
}
function stockSymbol(instr) {
  return S.view?.quotes?.find((q) => q.instr === instr)?.symbol || instr;
}
function dealOption(op, id, right) {
  const qty = Number(document.getElementById('optqty')?.value);
  if (op === 'close') { postAct({ kind: 'optclose', id, instr: '', qty: Number.isFinite(qty) && qty > 0 ? qty : 0 }); return; }
  const row = (S.view?.chain ?? []).find((c) => c.id === id);
  if (!row) { note('no such contract', true); return; }
  S.optRight = right || row.right;
  S.optMonths = row.months;
  S.optInstr = row.instr;
  const strike = document.getElementById('optstrike');
  const months = document.getElementById('optmonths');
  if (strike) strike.value = (row.strike / 100).toFixed(2);
  if (months) months.value = String(row.months);
  const kind = op === 'write' ? 'write' : 'optbuy';
  postAct({ kind, right: S.optRight, instr: row.instr, qty: Number.isFinite(qty) && qty > 0 ? qty : 1, months: row.months, strike: row.strike });
}
function submitOption(form, submitter) {
  const op = submitter?.value || 'buy';
  const qty = Number(document.getElementById('optqty')?.value);
  const months = Number(document.getElementById('optmonths')?.value);
  const strikeDollars = Number(document.getElementById('optstrike')?.value);
  const instr = document.getElementById('optname')?.value || S.optInstr;
  if (op === 'close') {
    postAct({ kind: 'optclose', id: '', instr, qty: Number.isFinite(qty) && qty > 0 ? qty : 0 });
    return;
  }
  const kind = op === 'write' ? 'write' : 'optbuy';
  postAct({
    kind,
    right: S.optRight === 'P' ? 'P' : 'C',
    instr,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    months: Number.isFinite(months) && months >= 0 ? months : 2,
    strike: strikeDollars > 0 ? Math.round(strikeDollars * 100) : 0,
  });
}
function patchOptions() {
  const box = document.getElementById('opt-chain');
  if (!box) return;
  const names = optionNames();
  if (!S.optInstr || !names.includes(S.optInstr)) S.optInstr = names[0] || '';
  box.innerHTML = chainTable();
}
function paintOptRight() {
  document.querySelectorAll('[data-optright]').forEach((el) => el.classList.toggle('on', el.dataset.optright === S.optRight));
}
function homeActs(h) {
  return [
    h.mine ? '' : `<button type="button" data-home="bid" data-id="${h.id}">bid</button>`,
    h.mine && !h.live ? `<button type="button" data-home="sell" data-id="${h.id}">sell</button>` : '',
    h.mine && !h.live ? `<button type="button" data-home="let" data-id="${h.id}">let</button>` : '',
    h.mine || h.live ? `<button type="button" data-home="move" data-id="${h.id}">move</button>` : '',
    h.mine ? `<button type="button" data-home="loan" data-id="${h.id}">mortgage</button>` : '',
  ].filter(Boolean).join(' ');
}
function homeBody() {
  const districts = [...(S.view?.districts ?? [])].sort((a, b) => a.distance - b.distance);
  const map = districts.map((d) => `<button type="button" class="plot${S.nb === d.name ? ' on' : ''}" data-nb="${esc(d.name)}">
      <b>${esc(d.name)}</b>
      <span>${whyNum(money(d.price), d.eventId, d.name + ' price')}</span>
      <span class="dim">${d.distance} km from the port</span>
    </button>`).join('');
  const mine = (S.view?.homes ?? []).filter((h) => h.mine || h.live);
  const listed = (S.view?.homes ?? []).filter((h) => !h.mine && !h.live && (!S.nb || h.neighbourhood === S.nb));
  const row = (h) => `<tr>
    <td>${parcelLink(h.id, '#' + h.id)} ${esc(h.neighbourhood)}</td>
    <td class="num">${whyNum(money(h.price), h.eventId, 'price')}</td>
    <td class="num">${whyNum(money(h.rent), h.eventId, 'rent')}</td>
    <td>${h.tenant ? personLink(h.tenant.index, h.tenant.name) : ''}${h.missed ? ` <span class="down">${h.missed} missed</span>` : ''}${h.vacant ? ' <span class="dim">vacant</span>' : ''}${h.live ? ' <span class="dim">you live here</span>' : ''}</td>
      <td class="num">${h.mortgage ? whyNum(money(h.mortgage), h.eventId, 'mortgage') : ''}</td>
    <td>${homeActs(h)}</td>
  </tr>`;
  return `<div class="map">${map}</div>
    <h2 style="margin-top:8px">YOUR HOMES</h2>
    <table><thead><tr><th>PARCEL</th><th class="num">PRICE</th><th class="num">RENT</th><th>TENANT</th><th class="num">MORTGAGE</th><th></th></tr></thead>
    <tbody>${mine.map(row).join('') || '<tr><td class="dim" colspan="6">you own no home yet</td></tr>'}</tbody></table>
    <h2 style="margin-top:8px">LISTINGS ${S.nb ? esc(S.nb) : ''}</h2>
    <table><thead><tr><th>PARCEL</th><th class="num">PRICE</th><th class="num">RENT</th><th></th><th class="num">MORTGAGE</th><th></th></tr></thead>
    <tbody>${listed.map(row).join('') || '<tr><td class="dim" colspan="6">nothing listed here</td></tr>'}</tbody></table>`;
}
function renderHomes() {
  return `<div class="panel ticket"><h2>HOMES</h2>
    <div class="row"><label>RENT $ <input id="homerent" value="900"></label><label>LOAN $ <input id="homeloan" value=""></label>
    <span class="dim">click a neighbourhood to list only that ground. a parcel opens its own page.</span></div></div>
    <div class="panel" id="home-body" style="margin-top:8px;padding-bottom:8px">${homeBody()}</div>`;
}
function patchHomes() {
  const box = document.getElementById('home-body');
  if (box) box.innerHTML = homeBody();
}
function dealHome(op, id) {
  if (op === 'bid') { postAct({ kind: 'homebid', id, cents: 0 }); return; }
  if (op === 'sell') { postAct({ kind: 'homesell', id }); return; }
  if (op === 'move') { postAct({ kind: 'move', id }); return; }
  if (op === 'let') {
    const dollars = Number(document.getElementById('homerent')?.value);
    if (!(dollars > 0)) { note('name a rent', true); return; }
    postAct({ kind: 'let', id, cents: Math.round(dollars * 100) });
    return;
  }
  if (op === 'loan') {
    const dollars = Number(document.getElementById('homeloan')?.value);
    postAct({ kind: 'mortgage', id, cents: dollars > 0 ? Math.round(dollars * 100) : 0 });
  }
}
function renderHelp(lines) {
  const body = (lines ?? []).map((l) => esc(l)).join('\n');
  return `<div class="panel"><h2>HELP</h2><pre class="cause">${body || 'type help'}</pre></div>`;
}

function renderFx() {
  const t = S.view?.tape;
  if (!t) return '<div class="dim">no exchange</div>';
  const series = S.history?.macro?.fx ?? [];
  return `<div class="panel" style="padding:8px">
    <div class="dim">${esc(t.fxName)} · ${esc(t.currency)}</div>
    <div style="font-size:28px;color:var(--amber)">${sparkSvg((S.history?.macro?.fx ?? []).length > 1 ? (S.history.macro.fx.slice(-32).map((p) => p.v)) : seriesOf('fx', null, t.fx), 0)}${whyNum(Number(t.fx).toFixed(4), t.events.fx, 'exchange rate')} <span class="dim" style="font-size:13px">home per ${esc(t.currency)}</span></div>
    <div class="dim">home rate ${whyNum((t.policy * 100).toFixed(2) + '%', t.events.rate, 'policy rate')} · foreign ${whyNum((t.foreignRate * 100).toFixed(2) + '%', t.events.fx, 'foreign rate')}</div>
    <div style="margin-top:8px"><button type="button" data-explain="${t.events.fx}">why this rate</button></div>
    <canvas id="fxchart" style="width:100%;height:220px;margin-top:8px"></canvas>
  </div>`;
}

function renderEconomy() {
  const m = S.history?.macro;
  if (!m) return '<div class="dim">reading the macro lines…</div>';
  const blocks = [
    ['unemployment', 'UNEMPLOYMENT', '%', (v) => v.toFixed(1) + '%'],
    ['inflation', 'INFLATION', '%', (v) => v.toFixed(1) + '%'],
    ['policy', 'POLICY RATE', '%', (v) => v.toFixed(2) + '%'],
    ['fx', 'EXCHANGE RATE', '', (v) => v.toFixed(4)],
    ['index', 'STOCK INDEX', '', (v) => v.toFixed(1)],
  ];
  return blocks.map(([key, label, , fmt]) => {
    const pts = m[key] ?? [];
    const last = pts[pts.length - 1];
    const shown = last ? whyNum(fmt(last.v), last.eventId, label) : '—';
    return `<div class="series"><header><span>${label}</span><b>${shown}</b></header><canvas data-series="${key}"></canvas></div>`;
  }).join('');
}

function renderLog() {
  const h = S.history;
  if (!h) return '<div class="dim">reading the chronicle…</div>';
  const rows = (h.entries ?? []).slice().reverse().map((e) => `
    <div class="log-item" data-cause="${esc(e.kind)}">
      <span class="dim">Y${e.year} · ${dateOf(e.day)} · ${esc(e.kind)}</span><br>
      ${rich(e.text, e.firms, e.people)}
    </div>`).join('');
  return `<div class="panel"><h2>CHRONICLE <span>${h.total} entries, latest ${h.entries?.length ?? 0}</span> <button type="button" data-story>your story</button></h2>${rows}</div>`;
}

function renderFirm(f) {
  if (!f) return '<div class="dim">no such firm</div>';
  if (f.kind === 'bank') {
    return `<div class="stack">
      <div class="panel"><h2>${esc(f.name)}</h2>
        <div class="facts"><span class="k">deposits</span><span>${whyNum(money(f.deposits), f.eventId, 'deposits')}</span><span class="k">equity</span><span>${whyNum(money(f.equity), f.eventId, 'equity')}</span>
        <span class="k">last</span><span>${f.share ? whyNum(px(f.share.px), f.eventId, 'last') : ''}</span></div></div>
      <div class="panel chartbox" style="height:280px"><h2>SHARE PRICE</h2><canvas id="chart"></canvas></div></div>`;
  }
  const ceo = f.ceo ? personLink(f.ceo.index, f.ceo.name) : '<span class="dim">vacant</span>';
  const news = (f.news ?? []).map((n) => `
    <div class="wire-item${n.private ? ' priv' : ''}" data-explain="${n.eventId}" data-title="${esc(n.text)}">
      <span class="dim">${dateOf(n.day)}</span> ${n.private && n.from ? `<span class="tag">told by ${personLink(n.fromIndex, n.from)}</span>` : ''}${rich(n.text, [{ id: f.id, name: f.name }])}
    </div>`).join('') || '<div class="dim" style="padding:8px">nothing on the wire about this firm</div>';
  return `<div class="stack">
    <div class="panel"><h2>${esc(f.name)} <span>${esc(f.share?.symbol || '')} · ${esc(f.sector)}</span></h2>
      <div class="facts">
        <span class="k">chief executive</span><span>${ceo}</span>
        <span class="k">staff</span><span>${whyNum(f.staff, f.events?.staff, 'staff')}</span>
        <span class="k">makes</span><span>${esc(f.goodName)}</span>
        <span class="k">price</span><span>${whyNum(px(f.price), f.events?.price, 'price')}</span>
        <span class="k">sales / day</span><span>${whyNum(Number(f.sales).toFixed(1), f.events?.sales, 'sales')}</span>
        <span class="k">revenue this month</span><span>${whyNum(money(f.revenue), f.events?.revenue, 'revenue')}</span>
        <span class="k">last month profit</span><span class="${cls(f.profit)}">${whyNum(money(f.profit), f.events?.profit, 'profit')}</span>
        <span class="k">debt</span><span>${whyNum(money(f.debt), f.events?.debt, 'debt')}</span>
        <span class="k">share</span><span>${f.share ? `${whyNum(px(f.share.px), f.events?.share, 'share')} <span class="${cls((f.share.prev ? f.share.px / f.share.prev - 1 : 0))}">${whyNum(pct(f.share.prev ? f.share.px / f.share.prev - 1 : 0), f.events?.share, 'share change')}</span>` : 'unlisted'}</span>
      </div></div>
    <div class="panel chartbox" style="height:260px"><h2>SHARE PRICE <span><button type="button" data-span="year" class="${S.chartSpan === 'year' ? 'on' : ''}">1Y</button> <button type="button" data-span="all" class="${S.chartSpan === 'all' ? 'on' : ''}">ALL</button></span></h2><canvas id="chart"></canvas></div>
    <div class="panel"><h2>NEWS</h2>${news}</div></div>`;
}

function renderPerson(p) {
  if (!p) return '<div class="dim">no such person</div>';
  const fam = p.family ?? {};
  const line = (label, node) => node ? `<div>${label} ${personLink(node.index, node.name)}${node.alive ? '' : ' <span class="dead">dead</span>'}</div>` : '';
  const list = (nodes) => (nodes ?? []).map((n) => personLink(n.index, n.name) + (n.alive ? '' : ' <span class="dead">†</span>')).join(', ') || '<span class="dim">none</span>';
  const rel = p.contact ? `<div class="rel-line">${esc(p.contact.line || p.contact.word || '')}</div>
    <div style="margin-top:8px"><button type="button" data-talk="${p.contact.slot}">TALK</button> <button type="button" data-ask="${p.contact.slot}">ASK</button> <button type="button" data-court="${p.contact.slot}">COURT</button> <button type="button" data-marry="${p.contact.slot}">MARRY</button></div>
    <div class="dim" style="margin-top:6px">${esc(p.contact.kind)} · slot ${p.contact.slot}</div>` : '<div class="dim">not a contact</div>';
  const inner = p.inner ? `<div class="panel"><h2>INNER LIFE</h2><div style="padding:8px">
      ${(p.inner.facets || []).map((f) => `<div><b>${esc(f.word)}</b> <span class="dim">${esc(f.line)}</span></div>`).join('')}
      <div><b>${esc(p.inner.memory?.word || '')}</b> <span class="dim">${esc(p.inner.memory?.line || '')}</span></div>
      ${p.inner.habit ? `<div><b>${esc(p.inner.habit.word)}</b> <span class="dim">${esc(p.inner.habit.line)}</span></div>` : ''}
    </div></div>` : '';
  const job = p.employer ? `${esc(p.title)} of ${firmLink(p.employer.id, p.employer.name)}${p.good ? ` <span class="dim">${esc(p.good)}</span>` : ''}` : esc(p.title);
  return `<div class="split">
    <div class="panel"><h2>${esc(p.name)} ${p.self ? '<span class="dim">you</span>' : ''}</h2>
      <div class="facts">
        <span class="k">age</span><span>${whyNum(p.age, p.lastEvent, p.name + ' age')}</span>
        <span class="k">job</span><span>${job}</span>
        <span class="k">mood</span><span>${esc(p.moodWord)}</span>
        <span class="k">wealth</span><span>${esc(p.wealthBand)}</span>
        <span class="k">living</span><span>${p.alive ? 'yes' : '<span class="dead">no</span>'}</span>
      </div>
      ${p.lastEvent !== undefined ? `<div style="padding:0 8px 8px"><button type="button" data-explain="${p.lastEvent}">last event</button></div>` : ''}
    </div>
    <div class="stack">
      <div class="panel"><h2>FAMILY</h2><div style="padding:8px">
        ${line('spouse', fam.spouse) || '<div class="dim">no spouse</div>'}
        ${line('parent', fam.parent) || '<div class="dim">no parent on the books</div>'}
        <div>children ${list(fam.children)}</div>
        <div>siblings ${list(fam.siblings)}</div>
      </div></div>
      <div class="panel"><h2>RELATIONSHIP</h2><div style="padding:8px">${p.self ? '<div class="dim">this is you</div>' : rel}
        ${p.contact ? '' : ''}<div style="margin-top:8px">Ask about <select id="askfirm">${(S.view?.firms ?? []).map((f) => `<option value="${esc(f.id)}"${f.id === S.view?.firm ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
      </div></div>
      ${inner}
    </div></div>`;
}

function drawChart() {
  const canvas = document.getElementById('chart');
  if (!canvas || !S.chart) return;
  const pts = S.chartSpan === 'all' ? S.chart.span : S.chart.daily;
  drawSeries(canvas, pts, '#e4b15a', (v) => px(v), true);
}
function drawSeries(canvas, pts, color, fmt, volume) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 180;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#0e1218';
  g.fillRect(0, 0, w, h);
  if (!pts?.length) {
    g.fillStyle = '#8b97a6';
    g.fillText('no closes', 8, 16);
    return;
  }
  const ys = pts.map((p) => p.px ?? p.v);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const plotH = volume ? h - 28 : h - 8;
  const left = 72;
  const xOf = (i) => left + (pts.length === 1 ? (w - left - 8) / 2 : (i / (pts.length - 1)) * (w - left - 8));
  const yOf = (v) => 4 + (1 - (v - lo) / (hi - lo)) * (plotH - 8);
  if (volume) {
    const vols = pts.map((p) => p.vol || 0);
    const maxV = Math.max(1, ...vols);
    g.fillStyle = 'rgba(142,182,232,0.35)';
    vols.forEach((v, i) => {
      const bh = (v / maxV) * (h - plotH - 6);
      g.fillRect(xOf(i), h - 4 - bh, Math.max(1, (w - left) / pts.length - 1), bh);
    });
  }
  g.strokeStyle = '#2c3542';
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const y = 4 + (k / 3) * (plotH - 8);
    g.moveTo(left, y); g.lineTo(w - 4, y);
    g.fillStyle = '#8b97a6';
    g.font = '11px ui-monospace, monospace';
    g.fillText(fmt(hi - (k / 3) * (hi - lo)), 4, y + 4);
  }
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = 1.4;
  g.beginPath();
  pts.forEach((p, i) => {
    const x = xOf(i), y = yOf(p.px ?? p.v);
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  });
  g.stroke();
  const last = pts[pts.length - 1];
  const ly = yOf(last.px ?? last.v);
  g.fillStyle = color;
  g.beginPath();
  g.arc(xOf(pts.length - 1), ly, 2.4, 0, Math.PI * 2);
  g.fill();
  g.fillRect(w - 10, ly, 6, 1);
  g.fillStyle = '#8b97a6';
  g.fillText(dateOf(pts[0].day), left, Math.min(h - 4, (volume ? plotH : h) - 2));
  canvas._pts = pts;
  canvas._xOf = xOf;
}

function bindMacroCanvases() {
  const m = S.history?.macro;
  if (!m) return;
  document.querySelectorAll('canvas[data-series]').forEach((canvas) => {
    const key = canvas.dataset.series;
    const pts = (m[key] ?? []).map((p) => ({ day: p.day, v: p.v, eventId: p.eventId }));
    const fmt = key === 'fx' ? (v) => v.toFixed(3) : key === 'index' ? (v) => v.toFixed(0) : (v) => v.toFixed(1);
    drawSeries(canvas, pts, key === 'unemployment' ? '#f07178' : key === 'inflation' ? '#e4b15a' : key === 'policy' ? '#8eb6e8' : key === 'fx' ? '#d78bd6' : '#3dce8e', fmt, false);
    canvas.onclick = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      let best = 0, dist = Infinity;
      pts.forEach((p, i) => {
        const dx = Math.abs((canvas._xOf ? canvas._xOf(i) : 0) - x);
        if (dx < dist) { dist = dx; best = i; }
      });
      const hit = pts[best];
      if (hit?.eventId !== undefined) openExplain(hit.eventId, `${key} ${dateOf(hit.day)}`);
    };
  });
}

function renderChain() {
  const aside = document.getElementById('chain');
  const body = document.getElementById('body');
  if (!aside || !body) return;
  if (!S.explain) { aside.hidden = true; body.classList.remove('with-chain'); return; }
  aside.hidden = false;
  body.classList.add('with-chain');
  const ex = S.explain;
  if (ex.pre) {
    aside.innerHTML = `<div class="top"><h2>${esc(ex.title)}</h2><button type="button" id="chain-close">close</button></div><pre class="cause">${esc(ex.pre)}</pre>`;
  } else {
    const lines = (ex.lines ?? []).map((ln) => {
      if (ln.missing) return `<div class="chain-line gone" style="padding-left:${ln.depth * 14}px">${esc(ln.msg)}</div>`;
      const who = ln.person !== undefined ? personLink(ln.person, ln.name) : ln.firm ? firmLink(ln.firm, ln.name) : '';
      return `<div class="chain-line" data-explain="${ln.id}" data-title="${esc(ln.kind)}" style="padding-left:${ln.depth * 14}px"><span class="dim">${ln.day >= 0 ? dateOf(ln.day) : ''}</span> <span class="kind">${esc(ln.kind)}</span>${who ? ' ' + who : ''} <span class="msg">${esc(ln.msg)}</span>${ln.exo ? ' <span class="dim">outside</span>' : ''}${ln.again ? ' <span class="dim">see above</span>' : ''}</div>`;
    }).join('');
    aside.innerHTML = `<div class="top"><h2>${esc(ex.title || ('event ' + ex.id))}</h2><button type="button" id="chain-close">close</button></div>${lines || '<div class="dim">no chain</div>'}`;
  }
  document.getElementById('chain-close')?.addEventListener('click', () => { S.explain = null; renderChain(); });
}

async function openExplain(id, title) {
  if (!Number.isFinite(id)) return;
  const res = await fetch('/explain/' + id);
  const data = await res.json();
  S.explain = { id, title: title || ('event ' + id), lines: data.lines ?? [] };
  renderChain();
  if (S.page === 'wire') {
    document.querySelectorAll('.wire-item').forEach((el) => el.classList.toggle('on', Number(el.dataset.explain) === id));
  }
}
function openCause(title, pre) {
  S.explain = { title, pre };
  renderChain();
}

async function ensureHistory() {
  if (S.history && S.history.day === S.view?.date?.abs) return S.history;
  const res = await fetch('/history');
  S.history = await res.json();
  if (S.view?.date) S.history.day = S.view.date.abs;
  return S.history;
}

const SECTORS = ['ENERGY', 'AGRICULTURE', 'MINING', 'METALS', 'CHEMICALS', 'CONSTRUCTION', 'MANUFACTURING', 'TECHNOLOGY', 'TRANSPORT', 'RETAIL', 'HEALTHCARE', 'FINANCE', 'MEDIA'];

function firmCard(c) {
  const chief = c.role === 'chief executive';
  const controls = chief ? `<div class="row">
      <label>PRICE $ <input class="co-price" value="${(c.price / 100).toFixed(2)}"></label>
      <button type="button" data-co="price" data-cofirm="${esc(c.id)}">set</button>
      <button type="button" data-co="price-auto" data-cofirm="${esc(c.id)}">usual</button>
      <label>STAFF <input class="co-hires" value="${c.workers}"></label>
      <button type="button" data-co="hires" data-cofirm="${esc(c.id)}">set</button>
      <button type="button" data-co="hires-auto" data-cofirm="${esc(c.id)}">usual</button>
    </div>
    <div class="row">
      <label>DIVIDEND <input class="co-div" placeholder="0.25"></label>
      <button type="button" data-co="dividend" data-cofirm="${esc(c.id)}">set</button>
      <button type="button" data-co="dividend-auto" data-cofirm="${esc(c.id)}">usual</button>
      <label>MACHINES <input class="co-invest" value="1"></label>
      <button type="button" data-co="invest" data-cofirm="${esc(c.id)}">buy</button>
      ${c.listed ? '' : `<label>IPO <input class="co-ipo" value="0.4"></label><button type="button" data-co="ipo" data-cofirm="${esc(c.id)}">list</button>`}
      ${c.family ? `<button type="button" data-co="hand" data-cofirm="${esc(c.id)}">hand down</button>` : ''}
    </div>` : '<div class="dim">the chief executive runs the day. the board is on BIDS.</div>';
  return `<div class="panel firmcard" data-card="${esc(c.id)}">
    <h2>${firmLink(c.id, c.name)} <span>${esc(c.role)} · ${esc(c.goodName || c.good)} · ${c.listed ? 'listed' : 'private'}</span></h2>
    <div class="facts">
      <span class="k">sales</span><span data-stat="sales">${whyNum(money(c.sales), c.salesEv, 'sales')}</span>
      <span class="k">costs</span><span data-stat="cost">${whyNum(money(c.cost), c.profitEv, 'costs')}</span>
      <span class="k">last profit</span><span data-stat="profit" class="${cls(c.profit)}">${whyNum(money(c.profit), c.profitEv, 'profit')}</span>
      <span class="k">staff</span><span data-stat="workers">${whyNum(c.workers, c.workerEv, 'staff')}</span>
      <span class="k">price</span><span data-stat="price">${whyNum(px(c.price), c.priceEv, 'price')}</span>
      <span class="k">cash</span><span data-stat="cash">${whyNum(money(c.cash), c.cashEv, 'cash')}</span>
      <span class="k">your stake</span><span>${whyNum(c.stake, c.priceEv, 'stake')} / ${whyNum(c.shares, c.priceEv, 'shares')}</span>
      <span class="k">policy</span><span class="dim">price ${esc(c.quote)} · hires ${esc(c.hire)} · dividend ${esc(c.dividend)}</span>
    </div>
    <div class="ticket">${controls}</div>
  </div>`;
}
function renderFirms() {
  const cards = (S.view?.companies ?? []).filter((c) => c.role === 'chief executive').map(firmCard).join('');
  const sectors = SECTORS.map((s) => `<option>${s}</option>`).join('');
  return `<div class="stack" id="firm-cards">
    ${cards || '<div class="panel"><div class="dim" style="padding:8px">you do not run a firm yet</div></div>'}
    <form id="found-form" class="panel ticket"><h2>FOUND</h2>
      <div class="row">
        <input name="name" placeholder="name" required>
        <select name="sector">${sectors}</select>
        <input name="cash" type="number" min="0" step="1" placeholder="dollars">
        <label><input name="loan" type="checkbox"> loan</label>
        <button type="submit">found</button>
      </div>
    </form>
  </div>`;
}
function cardInput(id, cls) {
  return document.querySelector(`[data-card="${CSS.escape(id)}"] .${cls}`);
}
function runCompany(op, firm) {
  if (!firm) { note('name the firm', true); return; }
  if (op === 'hand') { postAct({ kind: 'hand', firm }); return; }
  if (op === 'ipo') {
    const fraction = Number(cardInput(firm, 'co-ipo')?.value);
    postAct({ kind: 'ipo', firm, fraction });
    return;
  }
  const auto = op.endsWith('-auto');
  const which = auto ? op.slice(0, -5) : op;
  const cmd = { kind: 'ceo', firm, op: which, auto };
  if (!auto) {
    if (which === 'price') cmd.value = Math.round(Number(cardInput(firm, 'co-price')?.value) * 100);
    else if (which === 'hires') cmd.value = Math.round(Number(cardInput(firm, 'co-hires')?.value));
    else if (which === 'dividend') cmd.value = Number(cardInput(firm, 'co-div')?.value);
    else if (which === 'invest') cmd.value = Math.round(Number(cardInput(firm, 'co-invest')?.value));
  }
  postAct(cmd);
}
function renderBoards() {
  const firms = [...(S.view?.firms ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const opts = firms.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
  const seats = (S.view?.companies ?? []).map((c) => `<tr>
    <td>${firmLink(c.id, c.name)}</td><td>${esc(c.role)}</td><td class="num">${whyNum(c.stake, c.priceEv, 'stake')}/${whyNum(c.shares, c.priceEv, 'shares')}</td>
    <td>${c.listed ? 'listed' : 'private'}</td></tr>`).join('');
  const bids = (S.view?.bids ?? []).slice().reverse().map((b) => `<div class="wire-item" data-explain="${b.eventId}" data-title="${esc(b.text)}">
      <span class="dim">${dateOf(b.day)} · ${esc(b.kind)}</span><br>${b.firm ? firmLink(b.firm, b.name) + ' — ' : ''}${esc(b.text)}
    </div>`).join('') || '<div class="dim" style="padding:8px">no bids in the book you can still read</div>';
  return `<div class="stack">
    <form id="bid-ticket" class="panel ticket"><h2>TAKEOVER BID</h2>
      <div class="row">
        <select name="firm">${opts}</select>
        <input name="price" placeholder="12.50 or 2x" required>
        <select name="how"><option>cash</option><option>shares</option></select>
        <button type="submit">bid</button>
      </div>
      <div class="dim">a number like 2x is a multiple of the last price. cash or shares, the same tender everyone else uses.</div>
    </form>
    <form id="board-form" class="panel ticket"><h2>BOARD</h2>
      <div class="row">
        <select name="op"><option>list</option><option>chief</option><option>merge</option><option>sell</option></select>
        <input name="firm" placeholder="firm">
        <input name="into" placeholder="slot, or the firm it joins">
        <button type="submit">do</button>
      </div>
      <div class="dim">chief needs a contact slot. merge names the firm it joins. sell names the buyer.</div>
    </form>
    <div class="panel"><h2>SEATS YOU HOLD</h2>
      <table><thead><tr><th>FIRM</th><th>SEAT</th><th class="num">STAKE</th><th></th></tr></thead>
      <tbody>${seats || '<tr><td class="dim" colspan="4">no seat yet</td></tr>'}</tbody></table>
    </div>
    <div class="panel"><h2>BIDS</h2>${bids}</div>
  </div>`;
}
function healthBar(n) {
  const p = Math.max(0, Math.min(100, Number(n) || 0));
  const tone = p < 40 ? 'down' : p < 70 ? 'mid' : 'up';
  return `<span class="hbar ${tone}"><span style="width:${p.toFixed(1)}%"></span></span>`;
}
function renderHealth() {
  const v = S.view;
  const h = v?.healthPanel || {};
  const epi = h.epidemic;
  const banner = epi ? `<div class="panel"><h2>IN THE CITY</h2><div style="padding:8px">${esc(epi.name)} · ${whyNum(epi.cases + ' sick', epi.eventId, 'cases')}${epi.quarantine ? ' · the port is shut' : ''}
    <button type="button" data-explain="${epi.eventId}">why</button></div></div>` : '';
  const wordOf = (n) => n >= 75 ? 'Sound' : n >= 45 ? 'Worn' : 'Failing';
  const rows = (h.house || []).map((p) => `<tr>
    <td>${personLink(p.index, p.name)}</td><td>${esc(p.role)}</td>
    <td class="num">${whyNum(wordOf(p.health), p.eventId, p.name + ' ' + p.health)} ${healthBar(p.health)}</td>
    <td>${p.illness ? esc(p.illness) : '<span class="dim">well</span>'}</td>
    <td>${esc(p.cover)}</td>
    <td class="num">${p.owed ? whyNum(money(p.owed), p.eventId, 'bill') : ''}</td>
    <td><button type="button" data-explain="${p.eventId}">why</button></td>
  </tr>`).join('');
  const selfWord = (v?.stats || []).find((s) => s.id === 'health')?.word || wordOf(h.health ?? v?.health ?? 0);
  return `<div class="stack">
    <div class="panel"><h2>HEALTH</h2>
      <div class="score" title="${esc(String(h.health ?? v?.health ?? ''))}">${esc(selfWord)} ${healthBar(h.health ?? v?.health)} <span class="dim">${esc(h.illness || 'well')} · ${esc(h.cover || '')}</span></div>
      <div class="facts">
        <span class="k">unpaid care</span><span>${whyNum(money(h.owed || 0), h.eventId, 'unpaid care')}</span>
        <span class="k">last note</span><span><button type="button" data-explain="${h.eventId || 0}">why</button></span>
      </div>
    </div>
    ${banner}
    <div class="panel"><h2>THE HOUSE</h2>
      <table><thead><tr><th>NAME</th><th>ROLE</th><th class="num">HEALTH</th><th>ILLNESS</th><th>COVER</th><th class="num">BILL</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td class="dim">no one</td></tr>'}</tbody></table>
    </div>
  </div>`;
}
function renderParcel(p) {
  if (!p) return '<div class="dim">no such home</div>';
  const owner = p.owner ? personLink(p.owner.index, p.owner.name) : '<span class="dim">a bank or a fund</span>';
  const tenant = p.tenant ? personLink(p.tenant.index, p.tenant.name) : (p.vacant ? '<span class="dim">vacant</span>' : '<span class="dim">empty</span>');
  const acts = homeActs({ id: p.id, mine: p.mine, live: p.live });
  return `<div class="panel"><h2>${parcelLink(p.id, 'PARCEL #' + p.id)} <span>${esc(p.neighbourhood)}</span></h2>
    <div class="facts">
      <span class="k">price</span><span>${whyNum(money(p.price), p.eventId, 'price')}</span>
      <span class="k">rent</span><span>${whyNum(money(p.rent), p.eventId, 'rent')}</span>
      <span class="k">size</span><span>${whyNum(p.size, p.eventId, 'size')}</span>
      <span class="k">condition</span><span>${whyNum(p.condition, p.eventId, 'condition')}</span>
      <span class="k">owner</span><span>${owner}</span>
      <span class="k">tenant</span><span>${tenant}${p.live ? ' · you live here' : ''}${p.missed ? ` · <span class="down">${p.missed} missed</span>` : ''}</span>
      <span class="k">mortgage</span><span>${p.mortgage ? whyNum(money(p.mortgage), p.eventId, 'mortgage') : 'none'}</span>
      <span class="k">why this price</span><span><button type="button" data-explain="${p.eventId}">the chain</button></span>
    </div>
    <div class="ticket"><div class="row">${acts}</div>
      <div class="row"><label>RENT $ <input id="homerent" value="${Math.round((p.rent || 0) / 100)}"></label><label>LOAN $ <input id="homeloan" value=""></label></div>
    </div>
  </div>`;
}

function field(form, name) { return String(new FormData(form).get(name) ?? '').trim(); }

function submitFound(form) {
  const cash = Number(field(form, 'cash'));
  postAct({ kind: 'found', name: field(form, 'name'), sector: field(form, 'sector'), cents: Number.isFinite(cash) && cash > 0 ? Math.round(cash * 100) : 0, loan: form.loan.checked });
}
function submitCeo(form) {
  const op = field(form, 'op');
  const cmd = { kind: 'ceo', firm: field(form, 'firm'), op, auto: form.auto.checked };
  const raw = field(form, 'value');
  if (!cmd.auto && raw) {
    if (op === 'price') cmd.value = Math.round(Number(raw) * 100);
    else if (op === 'dividend') cmd.value = Number(raw);
    else cmd.value = Math.round(Number(raw));
  }
  postAct(cmd);
}
function submitIpo(form) {
  postAct({ kind: 'ipo', firm: field(form, 'firm'), fraction: Number(field(form, 'fraction')) });
}
function submitBid(form) {
  const raw = field(form, 'price').toLowerCase();
  const mult = /^(\d+(?:\.\d+)?)x$/.exec(raw);
  const cmd = { kind: 'bid', firm: field(form, 'firm'), cents: 0, multiple: 0, paper: field(form, 'how') === 'shares' };
  if (mult) cmd.multiple = Number(mult[1]);
  else cmd.cents = Math.round(Number(raw) * 100);
  postAct(cmd);
}
function submitBoard(form) {
  const op = field(form, 'op');
  const cmd = { kind: 'board', op, firm: field(form, 'firm') };
  const into = field(form, 'into');
  if (op === 'chief') cmd.slot = Number(into);
  else if (into) cmd.into = into;
  postAct(cmd);
}

function paintHint() {
  const bar = document.getElementById('hint');
  if (!bar) return;
  const sc = S.view?.scenario;
  const text = sc?.showHints ? (sc.hints?.[S.page] || '') : '';
  bar.hidden = !text;
  bar.innerHTML = text ? `${esc(text)} <button type="button" data-hints="off">hide hints</button>` : '';
}

function renderEnd(sc) {
  const s = sc.score || {};
  const word = sc.outcome === 'win' ? 'win' : 'loss';
  const code = sc.code ? `<h2>Challenge</h2><pre class="cause">${esc(sc.code)}</pre>` : '';
  const chronicle = sc.chronicle ? `<h2>Chronicle</h2><pre class="cause">${esc(sc.chronicle)}</pre>` : '';
  return `<div class="end ${word}">
    <h1>${esc(sc.name)} — ${esc(word)}</h1>
    <p>${esc(sc.reason || '')}</p>
    <h2>Score</h2>
    <div>net worth ${whyNum(money(s.worth), (S.view?.stats || []).find((x) => x.id === 'worth')?.eventId, 'worth')} against the index ${whyNum(((Number(s.indexX) || 0).toFixed(2) + '×'), S.view?.tape?.events?.index, 'index')} (you ${whyNum(((Number(s.worthX) || 0).toFixed(2) + '×'), (S.view?.stats || []).find((x) => x.id === 'worth')?.eventId, 'your multiple')})</div>
    <div>firms controlled ${whyNum(s.firms ?? 0, S.view?.dynasty?.eventId, 'firms')}</div>
    <div>reputation ${esc((S.view?.stats || []).find((x) => x.id === 'reputation')?.word || 'Known')}</div>
    <div>convictions ${whyNum(s.convictions ?? 0, S.view?.dynasty?.eventId, 'convictions')}</div>
    ${code}
    ${chronicle}
    <p class="dim">The game is over.</p>
  </div>`;
}

async function showStory() {
  const main = document.getElementById('main');
  if (main) main.innerHTML = '<div class="dim">writing the chronicle…</div>';
  const res = await fetch('/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'story' }) });
  const data = await res.json();
  if (data.view) S.view = data.view;
  if (!main || !res.ok || data.status === 'rejected') { note(data.why || data.error || 'could not write the chronicle', true); return; }
  const body = Array.isArray(data.lines) ? data.lines.join('\n') : (data.text || '');
  main.innerHTML = `<div class="panel"><h2>YOUR STORY</h2><pre class="cause">${esc(body)}</pre></div>`;
  paintChrome();
}

function showTitleShell() {
  S.gate = true;
  const title = document.getElementById('title');
  const play = document.getElementById('play');
  if (title) title.hidden = false;
  if (play) play.hidden = true;
  renderTitle();
}
function hideTitle() {
  S.gate = false;
  const title = document.getElementById('title');
  const play = document.getElementById('play');
  if (title) title.hidden = true;
  if (play) play.hidden = false;
}
function beginProgress(text) {
  S.generating = true;
  S.gen = { lines: [], text, pct: 6, error: '', count: 0 };
  S.titleMode = 'progress';
  showTitleShell();
}
function renderTitle() {
  const root = document.getElementById('title');
  if (!root) return;
  const data = S.titleData || { scenarios: [], saves: [], last: null };
  const back = '<button type="button" data-back>Back</button>';
  let body = '';
  if (S.titleMode === 'progress') {
    const g = S.gen || { lines: [], text: 'Writing the city…', pct: 6, error: '' };
    const lines = (g.lines || []).slice(-12).map((line) => `<div>${esc(line)}</div>`).join('');
    body = `<div class="gen">
      <div>${esc(g.text || '')}</div>
      <div class="barline gen" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, g.pct || 0))}%"></span></div>
      <div class="gen-lines">${lines}</div>
      ${g.error ? `<p class="down">${esc(g.error)}</p>${back}` : ''}
    </div>`;
  } else if (S.titleMode === 'new') {
    const cards = (data.scenarios || []).filter((s) => !s.sandbox).map((s) => `
      <button type="button" class="gate-card" data-start="${esc(s.id)}">
        <b>${esc(s.name)}</b>
        <span class="dim">${esc(s.goal)} · ${esc(s.limit)} · ${esc(s.difficulty)}</span>
        <span>${esc(s.story)}</span>
      </button>`).join('');
    body = `<h1>New game</h1><div class="gate-list">${cards}</div>
      <form id="sandbox" class="sandbox">
        <b>Sandbox</b>
        <span class="dim">no goal · open-ended · you choose the cash and the difficulty</span>
        <label>start money <input name="cash" value="100000" inputmode="decimal"></label>
        <label>difficulty <input name="difficulty" value="1" inputmode="decimal"></label>
        <button type="submit">begin</button>
      </form>${back}`;
  } else if (S.titleMode === 'load') {
    const rows = (data.saves || []).map((s) => `
      <button type="button" class="gate-card" data-pick-save="${esc(s.id)}">
        <b>${esc(s.label)}</b>
        <span class="dim">${esc(s.scenario)} · ${esc(s.player)} · ${esc(s.date)} · ${money(s.netWorth)}</span>
      </button>`).join('') || '<div class="dim">no saves yet</div>';
    body = `<h1>Load</h1><div class="gate-list">${rows}</div>${back}`;
  } else if (S.titleMode === 'challenge') {
    body = `<h1>Challenge code</h1>
      <form id="challenge" class="sandbox">
        <span class="dim">PA1.scenario.seed.difficulty.score.hash</span>
        <label>code <input name="code" autocomplete="off" spellcheck="false"></label>
        <button type="submit">begin</button>
      </form>${back}`;
  } else {
    const last = data.last;
    body = `<div class="title-acts">
      <button type="button" data-mode="new">New game</button>
      <button type="button" data-continue ${last ? '' : 'disabled'}>Continue${last ? ` · ${esc(last.label)} · ${esc(last.date)}` : ''}</button>
      <button type="button" data-mode="load">Load</button>
      <button type="button" data-mode="challenge">Challenge code</button>
    </div>`;
  }
  root.innerHTML = `<div class="title-wrap"><div class="brand">AVALON</div><p class="dim">Your life in this city</p>${body}</div>`;
}
async function showTitle() {
  if (S.generating && S.titleMode === 'progress') { showTitleShell(); return; }
  const res = await fetch('/title');
  S.titleData = res.ok ? await res.json() : { scenarios: [], saves: [], last: null };
  if (!S.generating) S.titleMode = 'menu';
  showTitleShell();
}
function openTitleMode(mode) {
  S.titleMode = mode;
  if ((mode === 'new' || mode === 'load' || mode === 'challenge') && !S.titleData) {
    showTitle().then(() => { S.titleMode = mode; renderTitle(); });
    return;
  }
  showTitleShell();
}
function backTitle() {
  if (S.view && !S.generating) {
    hideTitle();
    paint();
    renderMain();
    return;
  }
  S.titleMode = 'menu';
  S.generating = false;
  renderTitle();
}
function adopt(view) {
  S.view = view;
  S.page = 'life';
  S.arg = '';
  S.generating = false;
  hideTitle();
  if (!S.selected) {
    const mine = view.quotes?.find((q) => q.issuer === view.firm);
    S.selected = mine?.instr || view.quotes?.[0]?.instr || '';
  }
  if (location.hash !== '#life') location.hash = 'life';
  paint();
  renderMain();
}
async function startScenario(id, cash, difficulty) {
  const body = { id };
  if (cash !== undefined && Number.isFinite(cash)) body.cash = cash;
  if (difficulty !== undefined && Number.isFinite(difficulty)) body.difficulty = difficulty;
  beginProgress('Writing the city…');
  const res = await fetch('/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    S.generating = false;
    if (S.gen) S.gen.error = data.error || 'could not start';
    renderTitle();
    return;
  }
  if (data.view) adopt(data.view);
}
async function startChallenge(code) {
  beginProgress('Writing the city…');
  const res = await fetch('/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    S.generating = false;
    if (S.gen) S.gen.error = data.error || 'could not start';
    renderTitle();
    return;
  }
  if (data.beat && S.gen) S.gen.text = `Writing the city… beat ${money(data.beat)}`;
  renderTitle();
}
async function continueGame() {
  beginProgress('Reading the save…');
  S.generating = false;
  const res = await fetch('/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.view) {
    if (S.gen) S.gen.error = data.error || 'no save to continue';
    renderTitle();
    return;
  }
  adopt(data.view);
}
async function openLoad() {
  const res = await fetch('/saves');
  const data = res.ok ? await res.json() : { saves: [] };
  S.titleData = S.titleData || { scenarios: [], saves: [], last: null };
  S.titleData.saves = data.saves || [];
  S.titleData.last = S.titleData.saves[0] || S.titleData.last || null;
  S.titleMode = 'load';
  showTitleShell();
}
async function loadGame(id) {
  beginProgress('Reading the save…');
  S.generating = false;
  const res = await fetch('/load', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.view) {
    if (S.gen) S.gen.error = data.error || 'could not load';
    renderTitle();
    return;
  }
  adopt(data.view);
}
async function saveGame() {
  if (!S.view) { note('nothing to save', true); return; }
  const res = await fetch('/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { note(data.error || 'could not save', true); return; }
  note(`saved ${data.save?.label || ''} ${data.save?.date || ''}`.trim(), false);
}
function onGen(msg) {
  if (!S.gen) S.gen = { lines: [], text: '', pct: 0, error: '', count: 0 };
  if (msg.phase === 'line') {
    const line = `Year ${msg.year}: ${msg.text}`;
    S.gen.lines.push(line);
    if (S.gen.lines.length > 40) S.gen.lines.shift();
    S.gen.count = (S.gen.count || 0) + 1;
    S.gen.pct = Math.min(90, 8 + S.gen.count);
    S.gen.text = line;
  } else if (msg.phase === 'open') {
    S.gen.text = msg.text || 'Writing the city…';
    if ((S.gen.pct || 0) < 6) S.gen.pct = 6;
  } else if (msg.phase === 'phase') {
    S.gen.text = msg.text || S.gen.text;
    if (/Saving/.test(msg.text || '')) S.gen.pct = 92;
  } else if (msg.phase === 'read') {
    S.gen.text = msg.text || 'Reading the city into the books…';
    S.gen.pct = 96;
  } else if (msg.phase === 'error') {
    S.generating = false;
    S.gen.error = msg.error || 'the city could not be written';
  } else if (msg.phase === 'ready') {
    S.gen.pct = 100;
    S.gen.text = 'The city is open.';
    S.generating = false;
    renderTitle();
    refresh();
    return;
  }
  if (S.titleMode === 'progress') renderTitle();
}

async function renderMain() {
  const main = document.getElementById('main');
  if (!main || S.gate) return;
  if (S.view?.scenario?.outcome) {
    main.dataset.page = 'end';
    main.innerHTML = renderEnd(S.view.scenario);
    return;
  }
  main.dataset.page = S.page;
  main.dataset.arg = S.arg || '';
  if (!S.view && S.page !== 'firm' && S.page !== 'person' && S.page !== 'parcel') {
    main.innerHTML = '<div class="dim">loading the books…</div>';
    return;
  }
  if (S.page === 'life') {
    main.innerHTML = renderLife();
    const feed = main.querySelector('.life-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
    return;
  }
  if (S.page === 'people') { main.innerHTML = renderPeople(); return; }
  if (S.page === 'desk') {
    main.innerHTML = renderDesk();
    const cur = S.view?.quotes?.find((x) => x.instr === S.selected) ?? sortedQuotes()[0];
    if (cur) { S.selected = cur.instr; loadChart(cur.issuer); }
    requestAnimationFrame(drawChart);
    return;
  }
  if (S.page === 'wire') { main.innerHTML = renderWire(); return; }
  if (S.page === 'contacts') { main.innerHTML = renderContacts(); return; }
  if (S.page === 'bonds') { main.innerHTML = renderBonds(); return; }
  if (S.page === 'futures') { main.innerHTML = renderFutures(); return; }
  if (S.page === 'crypto') { main.innerHTML = renderCrypto(); return; }
  if (S.page === 'fx') {
    main.innerHTML = '<div class="dim">reading the rate…</div>';
    await ensureHistory();
    if (S.page !== 'fx') return;
    main.innerHTML = renderFx();
    const canvas = document.getElementById('fxchart');
    const pts = (S.history?.macro?.fx ?? []).map((p) => ({ day: p.day, v: p.v, eventId: p.eventId }));
    if (canvas) {
      drawSeries(canvas, pts, '#d78bd6', (v) => v.toFixed(4), false);
      canvas.onclick = (ev) => nearestPoint(canvas, pts, ev, 'exchange rate');
    }
    return;
  }
  if (S.page === 'economy') {
    main.innerHTML = '<div class="dim">reading the macro lines…</div>';
    await ensureHistory();
    if (S.page !== 'economy') return;
    main.innerHTML = renderEconomy();
    requestAnimationFrame(bindMacroCanvases);
    return;
  }
  if (S.page === 'options') { main.innerHTML = renderOptions(); return; }
  if (S.page === 'homes') { main.innerHTML = renderHomes(); return; }
  if (S.page === 'firms') { main.innerHTML = renderFirms(); return; }
  if (S.page === 'boards') { main.innerHTML = renderBoards(); return; }
  if (S.page === 'health') { main.innerHTML = renderHealth(); return; }
  if (S.page === 'parcel') {
    main.innerHTML = '<div class="dim">opening the parcel…</div>';
    const res = await fetch('/parcel/' + encodeURIComponent(S.arg));
    const parcel = res.ok ? await res.json() : null;
    if (S.page !== 'parcel' || main.dataset.arg !== S.arg) return;
    main.innerHTML = renderParcel(parcel);
    return;
  }
  if (S.page === 'help') {
    main.innerHTML = '<div class="dim">reading the commands…</div>';
    const res = await fetch('/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'help', command: '' }) });
    const data = await res.json();
    if (S.page !== 'help') return;
    if (data.view) S.view = data.view;
    main.innerHTML = renderHelp(data.lines);
    return;
  }
  if (S.page === 'family') {
    main.innerHTML = renderFamily();
    ensureHistory().then(() => {
      if (S.page !== 'family') return;
      main.innerHTML = renderFamily();
    });
    return;
  }
  if (S.page === 'log') {
    main.innerHTML = '<div class="dim">reading the chronicle…</div>';
    await ensureHistory();
    if (S.page !== 'log') return;
    main.innerHTML = renderLog();
    main.querySelectorAll('.log-item').forEach((el, i) => {
      const e = [...(S.history.entries ?? [])].reverse()[i];
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('a')) return;
        openCause(`${e.kind} · Y${e.year}`, e.cause);
        main.querySelectorAll('.log-item').forEach((n) => n.classList.toggle('on', n === el));
      });
    });
    return;
  }
  if (S.page === 'firm') {
    main.innerHTML = '<div class="dim">opening the firm…</div>';
    const res = await fetch('/firm/' + encodeURIComponent(S.arg));
    const firm = res.ok ? await res.json() : null;
    if (S.page !== 'firm' || main.dataset.arg !== S.arg) return;
    S.chart = firm ? { daily: firm.daily ?? [], span: firm.span ?? [] } : null;
    main.innerHTML = renderFirm(firm);
    requestAnimationFrame(drawChart);
    return;
  }
  if (S.page === 'person') {
    main.innerHTML = '<div class="dim">opening the person…</div>';
    const res = await fetch('/person/' + encodeURIComponent(S.arg));
    const person = res.ok ? await res.json() : null;
    if (S.page !== 'person' || main.dataset.arg !== S.arg) return;
    main.innerHTML = renderPerson(person);
    return;
  }
  main.innerHTML = '<div class="dim">no such screen</div>';
}

function nearestPoint(canvas, pts, ev, title) {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  let best = 0, dist = Infinity;
  pts.forEach((p, i) => {
    const dx = Math.abs((canvas._xOf ? canvas._xOf(i) : 0) - x);
    if (dx < dist) { dist = dx; best = i; }
  });
  const hit = pts[best];
  if (hit?.eventId !== undefined) openExplain(hit.eventId, `${title} ${dateOf(hit.day)}`);
}

function patchFirmStats() {
  const by = new Map((S.view?.companies ?? []).map((c) => [c.id, c]));
  document.querySelectorAll('[data-card]').forEach((card) => {
    const c = by.get(card.dataset.card);
    if (!c) return;
    const set = (k, text, tone) => {
      const el = card.querySelector(`[data-stat="${k}"]`);
      if (!el) return;
      el.textContent = text;
      if (tone !== undefined) el.className = tone;
    };
    set('sales', money(c.sales));
    set('cost', money(c.cost));
    set('profit', money(c.profit), cls(c.profit));
    set('workers', String(c.workers));
    set('price', px(c.price));
    set('cash', money(c.cash));
  });
}
const PANEL_PAGES = new Set(['options', 'homes', 'boards']);
let panelTimer = 0;
function wantPanel() {
  if (!PANEL_PAGES.has(S.page) || panelTimer) return;
  panelTimer = setTimeout(async () => {
    panelTimer = 0;
    const page = S.page;
    const res = await fetch('/panel?name=' + encodeURIComponent(page));
    if (!res.ok || S.page !== page || !S.view) return;
    const data = await res.json();
    Object.assign(S.view, data);
    if (page === 'options') patchOptions();
    else if (page === 'homes') patchHomes();
  }, 600);
}
function paint() {
  paintChrome();
  if (S.gate) return;
  if (S.view?.scenario?.outcome) { renderMain(); return; }
  const main = document.getElementById('main');
  const same = main && main.dataset.page === S.page && (main.dataset.arg || '') === (S.arg || '');
  if (!same) renderMain();
  else if (S.page === 'life') {
    const feed = main.querySelector('.life-feed');
    const near = !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 72;
    const top = feed ? feed.scrollTop : 0;
    main.innerHTML = renderLife();
    const next = main.querySelector('.life-feed');
    if (next) next.scrollTop = near ? next.scrollHeight : top;
  }
  else if (S.page === 'people') {
    const top = main.scrollTop;
    main.innerHTML = renderPeople();
    main.scrollTop = top;
  }
  else if (S.page === 'desk') patchDesk();
  else if (S.page === 'family' || S.page === 'health') {
    const top = main.scrollTop;
    main.innerHTML = S.page === 'family' ? renderFamily() : renderHealth();
    main.scrollTop = top;
  }
  else if (S.page === 'options') { patchOptions(); wantPanel(); }
  else if (S.page === 'homes') { patchHomes(); wantPanel(); }
  else if (S.page === 'firms') patchFirmStats();
  else if (S.page === 'wire') {
    const top = main.scrollTop;
    main.innerHTML = renderWire();
    main.scrollTop = top;
  }
}

function applyDay(msg) {
  if (!S.view) return;
  S.view.date = msg.date;
  S.view.netWorth = msg.netWorth;
  S.view.nwChange = msg.nwChange;
  S.view.sinceOpen = msg.sinceOpen;
  S.view.cash = msg.cash;
  S.view.alive = msg.alive;
  S.view.over = msg.over;
  if (msg.name) S.view.name = msg.name;
  if (msg.age !== undefined) S.view.age = msg.age;
  if (msg.health !== undefined) S.view.health = msg.health;
  if (msg.final !== undefined) S.view.final = msg.final;
  if (msg.scenario) S.view.scenario = msg.scenario;
  if (msg.family) S.view.family = msg.family;
  if (msg.dynasty) S.view.dynasty = msg.dynasty;
  if (msg.heir !== undefined) S.view.heir = msg.heir;
  if (msg.healthPanel) S.view.healthPanel = msg.healthPanel;
  if (msg.alerts) S.view.alerts = msg.alerts;
  if (msg.stats) S.view.stats = msg.stats;
  if (msg.feed) S.view.feed = msg.feed;
  if (msg.speed) S.view.speed = msg.speed;
  if (Object.prototype.hasOwnProperty.call(msg, 'pause')) S.view.pause = msg.pause;
  if (S.view.choices) {
    for (const c of S.view.choices) if (c.left > 0) c.left -= 1;
  }
  if (msg.companies) S.view.companies = msg.companies;
  if (S.view.tape) {
    S.view.tape.index = msg.index;
    S.view.tape.indexChg = msg.indexChg;
  }
  if (msg.quotes && S.view.quotes) {
    const by = new Map(msg.quotes.map((q) => [q.instr, q]));
    for (const q of S.view.quotes) {
      const n = by.get(q.instr);
      if (!n) continue;
      q.px = n.px; q.prev = n.prev; q.chg = n.chg; q.vol = n.vol;
      if (n.spark) q.spark = n.spark;
    }
  }
  if (msg.shares) S.view.shares = msg.shares;
  if (msg.orders) S.view.orders = msg.orders;
  if (msg.news) S.view.news = msg.news;
  if (S.chart && msg.quotes && S.selected) {
    const q = msg.quotes.find((x) => x.instr === S.selected);
    if (q) {
      const day = msg.date.abs - 1;
      const arr = S.chart.daily;
      if (arr) {
        const last = arr[arr.length - 1];
        if (last && last.day === day) { last.px = q.px; last.vol = q.vol; }
        else arr.push({ day, px: q.px, vol: q.vol });
      }
    }
  }
  paint();
}

let raf = 0;
let pendingDay = null;
function scheduleDay(msg) {
  pendingDay = msg;
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; if (pendingDay) applyDay(pendingDay); pendingDay = null; });
}

async function refresh() {
  const res = await fetch('/view');
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}));
    if (data.need === 'scenario') {
      if (S.generating) return;
      await showTitle();
    }
    return;
  }
  if (!res.ok) return;
  const wasGate = S.gate;
  const view = await res.json();
  if (wasGate) adopt(view);
  else {
    S.view = view;
    if (!S.selected) {
      const mine = S.view.quotes?.find((q) => q.issuer === S.view.firm);
      S.selected = mine?.instr || S.view.quotes?.[0]?.instr || '';
    }
    paint();
  }
}

function move(dir) {
  if (S.page !== 'desk') return;
  const rows = sortedQuotes();
  if (!rows.length) return;
  let i = rows.findIndex((q) => q.instr === S.selected);
  if (i < 0) i = 0;
  i = Math.max(0, Math.min(rows.length - 1, i + dir));
  pick(rows[i].instr);
  document.querySelector('.qrow.on')?.scrollIntoView({ block: 'nearest' });
}
function stepSpeed(dir) {
  const cur = S.view?.speed || 'pause';
  let i = SPEED_ORDER.indexOf(cur);
  if (i < 0) i = 0;
  i = Math.max(0, Math.min(SPEED_ORDER.length - 1, i + dir));
  setSpeed(SPEED_ORDER[i]);
}

document.addEventListener('keydown', (ev) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (ev.key === 'Escape') {
    S.explain = null;
    renderChain();
    if (typing) document.activeElement.blur();
    return;
  }
  if (typing || S.gate) return;
  for (const [id, , key] of PAGES) {
    if (ev.key === key || ev.key === key.toLowerCase()) { go(id); return; }
  }
  if (ev.key === 'j' || ev.key === 'ArrowDown') { ev.preventDefault(); move(1); }
  else if (ev.key === 'k' || ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
  else if (ev.key === 'b') { S.side = 'buy'; paintSides(); }
  else if (ev.key === 's') { S.side = 'sell'; paintSides(); }
  else if (ev.key === 'h') { S.side = 'short'; paintSides(); }
  else if (ev.key === ' ') { ev.preventDefault(); setSpeed((S.view?.speed || 'pause') === 'pause' ? 'day' : 'pause'); }
  else if (ev.key === '[') stepSpeed(-1);
  else if (ev.key === ']') stepSpeed(1);
  else if (ev.key === 'Enter' && S.page === 'desk') document.getElementById('qty')?.focus();
});

window.addEventListener('hashchange', () => {
  if (S.gate) return;
  const r = route();
  S.page = r.page;
  S.arg = r.arg;
  renderMain();
  paintChrome();
});

shell();
{
  const r = route();
  S.page = r.page;
  S.arg = r.arg;
}
refresh();
const es = new EventSource('/events');
es.addEventListener('day', (ev) => { try { scheduleDay(JSON.parse(ev.data)); } catch { /* ignore a bad frame */ } });
es.addEventListener('books', (ev) => {
  try {
    const data = JSON.parse(ev.data);
    if (S.view) S.view.books = data;
    note(data.ok ? 'books balanced' : 'BOOKS DO NOT BALANCE', !data.ok);
    paintChrome();
  } catch { /* ignore */ }
});
es.addEventListener('gen', (ev) => { try { onGen(JSON.parse(ev.data)); } catch { /* ignore a bad frame */ } });
es.addEventListener('speed', (ev) => {
  try {
    const data = JSON.parse(ev.data);
    if (S.view) {
      S.view.speed = data.speed || S.view.speed;
      if (data.why && !data.quiet) S.view.pause = { why: data.why, eventId: data.eventId };
    }
    if (data.why && !data.quiet) note(data.why, false);
    paintChrome();
  } catch { /* ignore */ }
});
es.addEventListener('saved', (ev) => {
  try {
    const data = JSON.parse(ev.data);
    if (data.error) note('autosave failed: ' + data.error, true);
    else note(`saved ${data.label || 'autosave'}`, false);
  } catch { /* ignore */ }
});
es.onopen = () => { if (S.view && !S.generating) refresh(); };
