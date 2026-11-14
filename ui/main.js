const PAGES = [
  ['desk', 'DESK', '1'],
  ['wire', 'WIRE', '2'],
  ['contacts', 'CONTACTS', '3'],
  ['bonds', 'BONDS', '4'],
  ['futures', 'FUTS', '5'],
  ['crypto', 'COINS', '6'],
  ['fx', 'FX', '7'],
  ['economy', 'MACRO', '8'],
  ['log', 'LOG', '9'],
  ['run', 'RUN', '0'],
];
const SPEEDS = [['pause', 'PAUSE'], ['day', '1D'], ['week', '1W'], ['month', '1M']];
const SPEED_ORDER = ['pause', 'day', 'week', 'month'];

const S = {
  view: null,
  page: 'desk',
  arg: '',
  selected: '',
  sort: 'chg',
  sortDir: -1,
  side: 'buy',
  orderType: 'mkt',
  chart: null,
  chartSpan: 'year',
  explain: null,
  history: null,
  flash: '',
  flashBad: false,
  loading: '',
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
function bar(kind, value, max) {
  const p = Math.max(0, Math.min(100, (Number(value) || 0) / max * 100));
  return `<div class="barline"><span class="dim">${kind}</span><span class="bar ${kind}"><span style="width:${p.toFixed(1)}%"></span></span><span class="num">${Math.round(value)}</span></div>`;
}

function route() {
  const raw = (location.hash || '#desk').replace(/^#/, '');
  const cut = raw.indexOf('/');
  const page = (cut < 0 ? raw : raw.slice(0, cut)) || 'desk';
  const arg = cut < 0 ? '' : decodeURIComponent(raw.slice(cut + 1));
  return { page, arg };
}

function shell() {
  const nav = PAGES.map(([id, label, key]) => `<button type="button" data-go="${id}" id="nav-${id}">${label} <span class="dim">${key}</span></button>`).join('');
  const speeds = SPEEDS.map(([id, label]) => `<button type="button" data-speed="${id}" id="spd-${id}">${label}</button>`).join('');
  document.getElementById('app').innerHTML = `
    <header>
      <div class="brand">AVALON</div>
      <div id="when" class="dim"></div>
      <div id="who"></div>
      <div class="nw"><b id="nw"></b><span id="nwd"></span></div>
      <div id="cash"></div>
      <div class="tape" id="tape"></div>
      <div class="speeds">${speeds}</div>
    </header>
    <nav>${nav}</nav>
    <div id="body"><main id="main"></main><aside id="chain" hidden></aside></div>
    <footer>
      <span id="books">books …</span>
      <span id="flash"></span>
      <span class="dim">j/k quote · b buy · s sell · h short · space pause · [ ] speed · esc close</span>
    </footer>`;
  document.getElementById('app').addEventListener('click', onClick);
  document.getElementById('app').addEventListener('submit', onSubmit);
  document.getElementById('app').addEventListener('change', onChange);
}

function paintChrome() {
  const v = S.view;
  const when = document.getElementById('when');
  const who = document.getElementById('who');
  const nw = document.getElementById('nw');
  const nwd = document.getElementById('nwd');
  const cash = document.getElementById('cash');
  const tape = document.getElementById('tape');
  const books = document.getElementById('books');
  const flash = document.getElementById('flash');
  if (!v) {
    when.textContent = 'loading the books';
    return;
  }
  when.textContent = whenOf(v.date);
  const job = v.firm ? firmLink(v.firm, v.employer) : esc(v.employer || 'unemployed');
  who.innerHTML = v.alive ? `${esc(v.name)}, ${v.age} · ${job}` : `<span class="dead">${esc(v.name)} has died</span>`;
  nw.textContent = money(v.netWorth);
  const day = v.nwChange || 0;
  nwd.textContent = pctSignedMoney(day);
  nwd.className = cls(day);
  cash.textContent = 'cash ' + money(v.cash);
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
  const t = ev.target.closest('[data-go],[data-speed],[data-pick],[data-firm],[data-person],[data-explain],[data-cancel],[data-side],[data-otype],[data-sort],[data-talk],[data-ask],[data-span],[data-bond],[data-fut],[data-coin],[data-launch],[data-cash],[data-macro]');
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
}

function onSubmit(ev) {
  const form = ev.target;
  if (!(form instanceof HTMLFormElement)) return;
  ev.preventDefault();
  if (form.id === 'ticket') submitTicket();
  else if (form.id === 'found-form') submitFound(form);
  else if (form.id === 'ceo-form') submitCeo(form);
  else if (form.id === 'ipo-form') submitIpo(form);
  else if (form.id === 'bid-form') submitBid(form);
  else if (form.id === 'board-form') submitBoard(form);
}
function onChange() { /* selects keep their own state */ }

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
  if (title && q) title.innerHTML = `${esc(q.symbol)} ${firmLink(q.issuer, q.name)} <span class="${cls(q.chg)}">${px(q.px)} ${pct(q.chg)}</span>`;
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

function quotesHtml() {
  const head = `<div class="qhead"><button type="button" data-sort="symbol">SYMBOL</button><span></span><button type="button" class="num" data-sort="px">LAST</button><button type="button" class="num" data-sort="chg">CHG</button><button type="button" class="num" data-sort="vol">VOL</button></div>`;
  const rows = sortedQuotes().map((q) => `
    <div class="qrow${q.instr === S.selected ? ' on' : ''}" data-pick="${esc(q.instr)}">
      <span>${esc(q.symbol)}</span>
      <span class="name">${firmLink(q.issuer, q.name)}</span>
      <span class="num" data-cell="px">${px(q.px)}</span>
      <span class="num ${cls(q.chg)}" data-cell="chg">${pct(q.chg)}</span>
      <span class="num dim" data-cell="vol">${vol(q.vol)}</span>
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
    const name = q ? firmLink(q.issuer, q.name) : esc(s.instr);
    return `<tr><td>${esc(sym)} ${name}</td><td class="num">${s.qty}</td><td class="num">${px(s.px)}</td><td class="num">${money(s.qty * s.px)}</td><td class="num ${cls(day)}">${pctSignedMoney(day)}</td></tr>`;
  }).join('');
  const orders = (v?.orders ?? []).filter((o) => o.book === 'shares').map((o) => `
    <tr><td>${o.id}</td><td>${esc(o.side)}</td><td>${esc(quotes.get(o.instr)?.symbol ?? o.instr)}</td><td class="num">${o.qty}</td><td class="num">${o.limit ? px(o.limit) : 'MKT'}</td>
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

function renderDesk() {
  const q = S.view?.quotes?.find((x) => x.instr === S.selected) ?? sortedQuotes()[0];
  if (q && !S.selected) S.selected = q.instr;
  const cur = S.view?.quotes?.find((x) => x.instr === S.selected);
  const title = cur ? `${esc(cur.symbol)} ${firmLink(cur.issuer, cur.name)} <span class="${cls(cur.chg)}">${px(cur.px)} ${pct(cur.chg)}</span>` : 'no listings';
  return `
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
    </div>`;
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
  if (title && cur) title.innerHTML = `${esc(cur.symbol)} ${firmLink(cur.issuer, cur.name)} <span class="${cls(cur.chg)}">${px(cur.px)} ${pct(cur.chg)}</span>`;
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
      <div class="bars">${bar('fam', c.familiarity, 480)}${bar('trust', c.trust, 100)}${bar('friend', c.friendship, 100)}</div>
      <span><button type="button" data-talk="${c.slot}">TALK</button> <button type="button" data-ask="${c.slot}">ASK</button></span>
    </div>`).join('') || '<div class="dim">no contacts</div>';
  return `<div class="panel"><h2>CONTACTS <span>${v?.contacts?.length ?? 0} / 16</span></h2>
    <div style="padding:8px">Ask about <select id="askfirm">${opts}</select></div>${rows}</div>`;
}

function renderBonds() {
  const v = S.view;
  const cards = (v?.curve ?? []).map((c) => `
    <div class="panel"><div class="tenor">${esc(c.tenor)}</div><div class="y">${(c.yield * 100).toFixed(2)}%</div>
    <div class="dim">${c.id ? esc(c.id) : 'model'} · ${c.px ? px(c.px) : ''}</div>
    <button type="button" data-explain="${c.eventId}">why</button></div>`).join('');
  const held = (v?.bonds ?? []).map((b) => `<tr><td>${esc(b.instr)}</td><td class="num">${money(b.face)}</td><td><button type="button" data-explain="${b.eventId}">why</button></td></tr>`).join('');
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
      return `<td class="num">${px(t.px)} <span class="${cls(chg)}">${pct(chg)}</span>${held ? `<br><span class="${cls(held.net)}">${held.net > 0 ? 'L' : 'S'}${Math.abs(held.net)}</span>` : ''}</td>`;
    }).join('');
    return `<tr><td>${esc(b.name)} <span class="dim">${esc(b.good)}</span></td>${cells}<td><button type="button" data-explain="${b.eventId}">why</button></td></tr>`;
  }).join('');
  const goods = (v?.futuresBoard ?? []).map((b) => `<option value="${esc(b.good)}">${esc(b.name)}</option>`).join('');
  return `<div class="panel ticket"><h2>FUTURES <span>margin ${money(v?.marginPosted || 0)}</span></h2>
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
      <td class="num">${px(c.px)} <span class="${cls(chg)}">${pct(chg)}</span></td>
      <td class="num">${h ? h.qty : ''}</td>
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

function renderFx() {
  const t = S.view?.tape;
  if (!t) return '<div class="dim">no exchange</div>';
  const series = S.history?.macro?.fx ?? [];
  return `<div class="panel" style="padding:8px">
    <div class="dim">${esc(t.fxName)} · ${esc(t.currency)}</div>
    <div style="font-size:28px;color:var(--amber)">${Number(t.fx).toFixed(4)} <span class="dim" style="font-size:13px">home per ${esc(t.currency)}</span></div>
    <div class="dim">home rate ${(t.policy * 100).toFixed(2)}% · foreign ${(t.foreignRate * 100).toFixed(2)}%</div>
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
    return `<div class="series"><header><span>${label}</span><b>${last ? fmt(last.v) : '—'}</b></header><canvas data-series="${key}"></canvas></div>`;
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
  return `<div class="panel"><h2>CHRONICLE <span>${h.total} entries, latest ${h.entries?.length ?? 0}</span></h2>${rows}</div>`;
}

function renderFirm(f) {
  if (!f) return '<div class="dim">no such firm</div>';
  if (f.kind === 'bank') {
    return `<div class="stack">
      <div class="panel"><h2>${esc(f.name)}</h2>
        <div class="facts"><span class="k">deposits</span><span>${money(f.deposits)}</span><span class="k">equity</span><span>${money(f.equity)}</span>
        <span class="k">last</span><span>${f.share ? px(f.share.px) : ''}</span></div></div>
      <div class="panel chartbox" style="height:280px"><h2>SHARE PRICE</h2><canvas id="chart"></canvas></div></div>`;
  }
  const ceo = f.ceo ? personLink(f.ceo.index, f.ceo.name) : '<span class="dim">vacant</span>';
  const news = (f.news ?? []).map((n) => `
    <div class="wire-item${n.private ? ' priv' : ''}" data-explain="${n.eventId}" data-title="${esc(n.text)}">
      <span class="dim">${dateOf(n.day)}</span> ${n.private && n.from ? `<span class="tag">told by ${personLink(n.fromIndex, n.from)}</span>` : ''}${esc(n.text)}
    </div>`).join('') || '<div class="dim" style="padding:8px">nothing on the wire about this firm</div>';
  return `<div class="stack">
    <div class="panel"><h2>${esc(f.name)} <span>${esc(f.share?.symbol || '')} · ${esc(f.sector)}</span></h2>
      <div class="facts">
        <span class="k">chief executive</span><span>${ceo}</span>
        <span class="k">staff</span><span>${f.staff}</span>
        <span class="k">makes</span><span>${esc(f.goodName)}</span>
        <span class="k">price</span><span>${px(f.price)}</span>
        <span class="k">sales / day</span><span>${Number(f.sales).toFixed(1)}</span>
        <span class="k">revenue this month</span><span>${money(f.revenue)}</span>
        <span class="k">last month profit</span><span class="${cls(f.profit)}">${money(f.profit)}</span>
        <span class="k">debt</span><span>${money(f.debt)}</span>
        <span class="k">share</span><span>${f.share ? `${px(f.share.px)} <span class="${cls((f.share.prev ? f.share.px / f.share.prev - 1 : 0))}">${pct(f.share.prev ? f.share.px / f.share.prev - 1 : 0)}</span>` : 'unlisted'}</span>
      </div></div>
    <div class="panel chartbox" style="height:260px"><h2>SHARE PRICE <span><button type="button" data-span="year" class="${S.chartSpan === 'year' ? 'on' : ''}">1Y</button> <button type="button" data-span="all" class="${S.chartSpan === 'all' ? 'on' : ''}">ALL</button></span></h2><canvas id="chart"></canvas></div>
    <div class="panel"><h2>NEWS</h2>${news}</div></div>`;
}

function renderPerson(p) {
  if (!p) return '<div class="dim">no such person</div>';
  const fam = p.family ?? {};
  const line = (label, node) => node ? `<div>${label} ${personLink(node.index, node.name)}${node.alive ? '' : ' <span class="dead">dead</span>'}</div>` : '';
  const list = (nodes) => (nodes ?? []).map((n) => personLink(n.index, n.name) + (n.alive ? '' : ' <span class="dead">†</span>')).join(', ') || '<span class="dim">none</span>';
  const rel = p.contact ? `<div class="bars">${bar('fam', p.contact.familiarity, 480)}${bar('trust', p.contact.trust, 100)}${bar('friend', p.contact.friendship, 100)}</div>
    <div style="margin-top:8px"><button type="button" data-talk="${p.contact.slot}">TALK</button> <button type="button" data-ask="${p.contact.slot}">ASK</button></div>
    <div class="dim" style="margin-top:6px">${esc(p.contact.kind)} · slot ${p.contact.slot}</div>` : '<div class="dim">not a contact</div>';
  const job = p.employer ? `${esc(p.title)} of ${firmLink(p.employer.id, p.employer.name)}${p.good ? ` <span class="dim">${esc(p.good)}</span>` : ''}` : esc(p.title);
  return `<div class="split">
    <div class="panel"><h2>${esc(p.name)} ${p.self ? '<span class="dim">you</span>' : ''}</h2>
      <div class="facts">
        <span class="k">age</span><span>${p.age}</span>
        <span class="k">job</span><span>${job}</span>
        <span class="k">mood</span><span>${esc(p.moodWord)} <span class="dim">${p.mood}</span></span>
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
      return `<div class="chain-line" style="padding-left:${ln.depth * 14}px"><span class="dim">${ln.day >= 0 ? dateOf(ln.day) : ''}</span> <span class="kind">${esc(ln.kind)}</span>${who ? ' ' + who : ''} <span class="msg">${esc(ln.msg)}</span>${ln.exo ? ' <span class="dim">outside</span>' : ''}${ln.again ? ' <span class="dim">see above</span>' : ''}</div>`;
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

function renderRun() {
  const rows = (S.view?.companies ?? []).map((c) => `<tr>
    <td><a href="#firm/${encodeURIComponent(c.id)}">${esc(c.name)}</a> <span class="dim">${esc(c.id)}</span></td>
    <td>${esc(c.role)}</td>
    <td class="num">${c.workers}</td>
    <td class="num">${money(c.cash)}</td>
    <td class="num">${money(c.sales)}</td>
    <td class="num">${money(c.cost)}</td>
    <td class="num">${money(c.profit)}</td>
    <td>${c.listed ? 'listed' : 'private'}</td>
    <td class="num">${c.stake}/${c.shares}</td>
    <td class="dim">${esc(c.quote)} · hire ${esc(c.hire)} · div ${esc(c.dividend)}</td>
  </tr>`).join('');
  const sectors = SECTORS.map((s) => `<option>${s}</option>`).join('');
  return `<div class="ticket">
    <h2>Companies</h2>
    <table class="grid">
      <thead><tr><th>Firm</th><th>Seat</th><th>Staff</th><th>Cash</th><th>Sales</th><th>Costs</th><th>Profit</th><th></th><th>Stake</th><th>Policy</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="dim">you run nothing yet</td></tr>'}</tbody>
    </table>
    <form id="found-form"><b>Found</b>
      <input name="name" placeholder="name" required>
      <select name="sector">${sectors}</select>
      <input name="cash" type="number" min="0" step="1" placeholder="dollars">
      <label><input name="loan" type="checkbox"> loan</label>
      <button type="submit">found</button>
    </form>
    <form id="ceo-form"><b>Run</b>
      <input name="firm" placeholder="firm" required>
      <select name="op"><option>report</option><option>price</option><option>hires</option><option>dividend</option><option>invest</option></select>
      <input name="value" placeholder="value">
      <label><input name="auto" type="checkbox"> usual rule</label>
      <button type="submit">set</button>
    </form>
    <form id="ipo-form"><b>List</b>
      <input name="firm" placeholder="firm" required>
      <input name="fraction" type="number" min="0.01" max="0.9" step="0.01" value="0.4" required>
      <button type="submit">ipo</button>
    </form>
    <form id="bid-form"><b>Bid</b>
      <input name="firm" placeholder="firm" required>
      <input name="price" placeholder="12.50 or 2x" required>
      <select name="how"><option>cash</option><option>shares</option></select>
      <button type="submit">bid</button>
    </form>
    <form id="board-form"><b>Board</b>
      <select name="op"><option>list</option><option>chief</option><option>merge</option><option>sell</option></select>
      <input name="firm" placeholder="firm">
      <input name="into" placeholder="buyer / into / slot">
      <button type="submit">do</button>
    </form>
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

async function renderMain() {
  const main = document.getElementById('main');
  if (!main) return;
  main.dataset.page = S.page;
  main.dataset.arg = S.arg || '';
  if (!S.view && S.page !== 'firm' && S.page !== 'person') {
    main.innerHTML = '<div class="dim">loading the books…</div>';
    return;
  }
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
  if (S.page === 'run') { main.innerHTML = renderRun(); return; }
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

function paint() {
  paintChrome();
  const main = document.getElementById('main');
  const same = main && main.dataset.page === S.page && (main.dataset.arg || '') === (S.arg || '');
  if (!same) renderMain();
  else if (S.page === 'desk') patchDesk();
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
  if (!res.ok) return;
  S.view = await res.json();
  if (!S.selected) {
    const mine = S.view.quotes?.find((q) => q.issuer === S.view.firm);
    S.selected = mine?.instr || S.view.quotes?.[0]?.instr || '';
  }
  paint();
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
  if (typing) return;
  const goKey = { '1': 'desk', '2': 'wire', '3': 'contacts', '4': 'bonds', '5': 'futures', '6': 'crypto', '7': 'fx', '8': 'economy', '9': 'log', '0': 'run' };
  if (goKey[ev.key]) { go(goKey[ev.key]); return; }
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
es.onopen = () => { if (S.view) refresh(); };
