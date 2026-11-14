// Newspapers, journalists and rumours.
// An outlet is a firm with a desk. Journalists learn private facts from their contacts, a serious paper waits
// for a second source, and a sensational one sometimes prints the wrong way. Readers and a value fund then
// trade the story on the order book. A rumour that never makes the paper spreads with a confidence that
// fades, and a person who plants one and trades ahead of it is the sort of thing the law module already watches.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DAYS_PER_MONTH, type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { addFirm, DEP, pay, type EconState, type Firm } from '../economy/index.ts';
import { askFirm, contactsOf, knows, publish, seatPerson } from '../social/index.ts';
import { cancelOrder, submitOrder } from '../markets/index.ts';

interface Outlet {
  id: string; name: string; readership: number; leaning: number; serious: boolean;
  firm: number; trust: number; journalists: number[]; lastStory: number;
}
interface Story {
  outlet: number; firm: number; issuer: string; day: number; side: number; wrong: boolean;
  base: number; tip: number; story: number; px: number; done: boolean; scooped: boolean; judged: boolean;
}
interface Rumour {
  issuer: string; firm: number; side: number; confidence: number; planter: number; event: number;
  heard: number[]; live: boolean;
}
interface Resting { actor: string; id: number; until: number }
interface Book {
  outlets: Outlet[]; totalRead: number; seated: Uint8Array; firmStory: Int32Array;
  stories: Story[]; rumours: Rumour[]; resting: Resting[];
  yStories: number; yScoops: number; yRetract: number; yRumours: number; root: number;
}
interface FactPeek {
  id: number; eventId: number; tag: string; msg: string; firms: number[]; profit: number;
  pub: boolean; drop: boolean; know: { n: number } | null;
}
interface SocPeek { facts: FactPeek[]; insiderFact: Int32Array; need: number }
interface Bar { v: number }
interface Stock { instr: string; issuer: string; last: number; hist: Bar[] }
interface Mkt { stocks?: Stock[]; funds?: { id: string; style: string }[] }
interface Source { who: number; trust: number; slot: number }

const file = fileURLToPath(new URL('../../content/media.txt', import.meta.url));

function econ(w: World): EconState { return w.state.economy as EconState; }
function book(w: World): Book { return w.state.media as Book; }
function soc(w: World): SocPeek | undefined {
  const st = w.state.social as SocPeek | undefined;
  if (!st?.facts || !st.insiderFact) return undefined;
  return st;
}
function mkt(w: World): Mkt | undefined { return w.state.markets as Mkt | undefined; }

function mix(a: number, b: number, c = 0): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
}
function loadOutlets(): { id: string; name: string; firmKey: string; readership: number; leaning: number; serious: boolean }[] {
  const raws = parseRaws(readFileSync(file, 'utf8'), 'media.txt').filter((r) => r.type === 'OUTLET');
  return raws.map((raw) => {
    const r = new RawReader(raw);
    const readership = Math.max(1, Math.round(r.num('READERSHIP')));
    const leaning = Math.max(-1, Math.min(1, r.num('LEANING', 0)));
    return {
      id: raw.id, name: r.str('NAME'), firmKey: r.str('FIRM', ''), readership, leaning,
      serious: r.has('SERIOUS') || !r.has('SENSATIONAL'),
    };
  });
}
function firmByKey(w: World, key: string, name: string): number {
  const id = key ? 'frm_' + key.toLowerCase() : '';
  for (const f of econ(w).firms) if ((id && f.id === id) || f.name === name) return f.idx;
  return -1;
}
function stockOf(w: World, issuer: string): Stock | undefined {
  const stocks = mkt(w)?.stocks;
  if (!stocks) return undefined;
  for (const st of stocks) if (st.issuer === issuer) return st;
  return undefined;
}
function medianVol(st: Stock): number {
  const xs = st.hist.slice(-12).map((h) => h.v).sort((a, b) => a - b);
  return xs.length ? xs[xs.length >> 1] : 0;
}
function growSeated(b: Book, n: number): void {
  if (b.seated.length >= n) return;
  let cap = Math.max(16, b.seated.length);
  while (cap < n) cap *= 2;
  const a = new Uint8Array(cap);
  a.set(b.seated);
  b.seated = a;
}
function growFirms(b: Book, n: number): void {
  if (b.firmStory.length >= n) return;
  const a = new Int32Array(Math.max(n, b.firmStory.length * 2, 16));
  a.fill(-1);
  a.set(b.firmStory);
  b.firmStory = a;
}
function readerOf(b: Book, person: number): number {
  if (!b.outlets.length || b.totalRead <= 0) return -1;
  let h = mix(person, 17) % b.totalRead, acc = 0;
  for (let i = 0; i < b.outlets.length; i++) {
    acc += b.outlets[i].readership;
    if (h < acc) return i;
  }
  return b.outlets.length - 1;
}
function place(w: World, actor: string, instr: string, side: 'buy' | 'sell', qty: number, limit: number, until: number): void {
  if (qty < 1 || !w.ledger.actors.has(actor)) return;
  const px = limit > 0 ? limit : (stockOf(w, instr.startsWith('eq:') ? instr.slice(3) : '')?.last ?? 0);
  if (side === 'buy') {
    const cash = Math.floor(w.ledger.balance(actor, DEP));
    qty = Math.min(qty, Math.floor(cash / Math.max(1, px)));
  } else qty = Math.min(qty, Math.floor(w.ledger.balance(actor, instr)));
  if (qty < 1) return;
  const id = submitOrder(w, actor, { instr, side, qty, limit });
  book(w).resting.push({ actor, id, until });
}
function trade(w: World, issuer: string, side: number, trust: number, outlet: number, weight: number): void {
  const st = stockOf(w, issuer);
  if (!st || st.last < 1 || weight <= 0) return;
  const b = book(w), P = econ(w).P;
  const limit = Math.max(1, Math.round(st.last * (side > 0 ? 1.018 : 0.982)));
  const dir: 'buy' | 'sell' = side > 0 ? 'buy' : 'sell';
  const funds = mkt(w)?.funds ?? [];
  for (const f of funds) if (f.style === 'value' && trust >= 48) {
    const qty = Math.min(48, Math.max(8, Math.round(22 * trust / 70 * weight)));
    place(w, f.id, st.instr, dir, qty, limit, w.day + 2);
    break;
  }
  const step = 89;
  const start = mix(w.day, outlet, issuer.length) % Math.max(1, P.n);
  const lean = b.outlets[outlet]?.leaning ?? 0;
  let n = 0;
  for (let k = 0; k < P.n && n < 12; k += step) {
    const i = (start + k) % P.n;
    if (!P.adult(w, i) || readerOf(b, i) !== outlet) continue;
    const gap = Math.abs((P.greed[i] - 50) / 50 - lean);
    const belief = trust / 100 * (1 - 0.15 * gap) * weight;
    if (belief < 0.28) continue;
    let qty = Math.round((4 + P.greed[i] / 28) * belief);
    if (P.anxiety[i] > 68) qty -= 2;
    if (P.diligence[i] > 75) qty = Math.max(1, qty - 1);
    place(w, P.id(i), st.instr, dir, Math.max(1, Math.min(16, qty)), limit, w.day + 2);
    n++;
  }
}
function cancelResting(w: World): void {
  const b = book(w), keep: Resting[] = [];
  for (const r of b.resting) {
    if (r.until > w.day) { keep.push(r); continue; }
    cancelOrder(w, r.actor, r.id);
  }
  b.resting = keep;
}
function factAt(st: SocPeek, id: number): FactPeek | undefined {
  if (id < 0 || id >= st.facts.length) return undefined;
  const f = st.facts[id];
  if (!f || f.pub || f.drop || f.tag !== 'insider.profit') return undefined;
  return f;
}
function sourcesFor(w: World, journalist: number, st: SocPeek): { fact: FactPeek; firm: number; sources: Source[] } | undefined {
  const P = econ(w).P;
  const contacts = contactsOf(w, journalist);
  const grouped = new Map<number, { fact: FactPeek; firm: number; sources: Source[] }>();
  for (const c of contacts) {
    if (!P.alive(c.who)) continue;
    const firm = P.employer[c.who];
    if (firm < 0 || firm >= st.insiderFact.length) continue;
    const fact = factAt(st, st.insiderFact[firm]);
    if (!fact || !fact.firms.includes(firm)) continue;
    if (!knows(w, c.who, fact.id)) continue;
    let g = grouped.get(fact.id);
    if (!g) { g = { fact, firm, sources: [] }; grouped.set(fact.id, g); }
    if (!g.sources.some((s) => s.who === c.who)) g.sources.push({ who: c.who, trust: c.trust, slot: c.slot });
  }
  let best: { fact: FactPeek; firm: number; sources: Source[] } | undefined;
  let score = 0;
  for (const g of grouped.values()) {
    const f = econ(w).firms[g.firm];
    if (!f || f.closed || !stockOf(w, f.id)) continue;
    const scale = Math.max(econ(w).wage * 30, Math.abs(g.fact.profit), Math.abs(f.lastProfit), 1);
    const edge = Math.abs(g.fact.profit - f.lastProfit) / scale;
    const s = edge * (1 + g.sources.length) * (g.sources[0]?.trust ?? 0);
    if (edge >= 0.05 && s > score) { score = s; best = g; }
  }
  return best;
}
function learnFrom(w: World, journalist: number, firm: Firm, fact: FactPeek, sources: Source[], need: number): boolean {
  if (knows(w, journalist, fact.id)) return true;
  const src = [...sources].sort((a, b) => b.trust - a.trust || a.who - b.who)[0];
  if (!src) return false;
  if ((fact.know?.n ?? 0) + 1 >= need) return false;
  askFirm(w, journalist, src.slot, firm.id);
  return knows(w, journalist, fact.id);
}
function desks(w: World): void {
  const b = book(w), s = econ(w), P = s.P;
  growSeated(b, P.n);
  for (const o of b.outlets) {
    const f = o.firm >= 0 ? s.firms[o.firm] : undefined;
    if (!f || f.closed) { o.journalists = []; continue; }
    const desk = f.staff.filter((i) => P.alive(i));
    desk.sort((a, c) => P.diligence[c] - P.diligence[a] || P.skill[c] - P.skill[a] || a - c);
    o.journalists = desk.slice(0, 4);
    for (const p of o.journalists) if (!b.seated[p]) { seatPerson(w, p, 12); b.seated[p] = 1; }
  }
}
function publishTip(w: World, outlet: number, journalist: number, got: { fact: FactPeek; firm: number; sources: Source[] }, wrong: boolean): void {
  const b = book(w), s = econ(w), P = s.P, o = b.outlets[outlet], f = s.firms[got.firm];
  const scale = Math.max(s.wage * 30, Math.abs(got.fact.profit), Math.abs(f.lastProfit), 1);
  const edge = (got.fact.profit - f.lastProfit) / scale;
  const side = (edge >= 0 ? 1 : -1) * (wrong ? -1 : 1);
  const src = [...got.sources].sort((a, c) => c.trust - a.trust || a.who - c.who);
  const heard = src[0];
  const tip = w.events.emit('media.tip',
    `${P.name(journalist)} of ${o.name} hears it from ${P.name(heard.who)}${src[1] ? `, and ${P.name(src[1].who)} confirms it` : ''}`,
    [got.fact.eventId], P.id(heard.who));
  if (!wrong) publish(w, got.fact.id);
  const word = side > 0 ? 'ahead of last month' : 'behind last month';
  const how = wrong ? 'from one unchecked source' : src.length > 1 ? 'two sources agree' : 'a source on the desk says';
  const story = w.events.emit('media.story', `${o.name}: ${f.name} is ${word}; ${how}`, [tip], f.id);
  const px = stockOf(w, f.id)?.last ?? 0;
  b.stories.push({
    outlet, firm: f.idx, issuer: f.id, day: w.day, side, wrong, base: f.lastProfit,
    tip, story, px, done: false, scooped: false, judged: false,
  });
  b.firmStory[f.idx] = w.day;
  o.lastStory = w.day;
  b.yStories++;
  trade(w, f.id, side, o.trust, outlet, wrong ? 0.7 : 1);
}
function consider(w: World): void {
  const st = soc(w);
  if (!st) return;
  const b = book(w), s = econ(w), P = s.P;
  growFirms(b, s.firms.length);
  const order = b.outlets.map((_, i) => i).sort((a, c) => Number(b.outlets[c].serious) - Number(b.outlets[a].serious) || b.outlets[c].trust - b.outlets[a].trust || a - c);
  let printed = 0;
  for (const oi of order) {
    if (printed >= 2) break;
    const o = b.outlets[oi];
    if (!o.journalists.length || w.day - o.lastStory < 8) continue;
    let chosen: { journalist: number; got: { fact: FactPeek; firm: number; sources: Source[] } } | undefined;
    for (const journalist of o.journalists) {
      if (!P.alive(journalist)) continue;
      const got = sourcesFor(w, journalist, st);
      if (!got) continue;
      if (b.firmStory[got.firm] >= 0 && w.day - b.firmStory[got.firm] < 18) continue;
      const need = o.serious ? 2 : 1;
      if (got.sources.length < need) {
        if (o.serious) leakRumour(w, oi, journalist, got);
        continue;
      }
      if (!learnFrom(w, journalist, s.firms[got.firm], got.fact, got.sources, st.need)) continue;
      if (got.fact.pub) continue;
      chosen = { journalist, got };
      break;
    }
    if (!chosen) continue;
    const careless = !o.serious && chosen.got.sources.length < 2 && P.diligence[chosen.journalist] < 48 && P.greed[chosen.journalist] > P.diligence[chosen.journalist];
    publishTip(w, oi, chosen.journalist, chosen.got, careless && chosen.got.sources[0].trust < 70);
    printed++;
  }
}
function leakRumour(w: World, outlet: number, journalist: number, got: { fact: FactPeek; firm: number; sources: Source[] }): void {
  const b = book(w);
  if (b.rumours.filter((r) => r.live).length >= 24) return;
  if (mix(w.day, journalist) % 3 !== 0) return;
  const f = econ(w).firms[got.firm];
  const scale = Math.max(econ(w).wage * 30, Math.abs(got.fact.profit), Math.abs(f.lastProfit), 1);
  const edge = (got.fact.profit - f.lastProfit) / scale;
  if (Math.abs(edge) < 0.05) return;
  const sloppy = econ(w).P.diligence[journalist] < 50;
  const side = (edge >= 0 ? 1 : -1) * (sloppy ? -1 : 1);
  const ev = w.events.emit('media.tip',
    `${econ(w).P.name(journalist)} repeats an unchecked claim about ${f.name}`,
    [got.fact.eventId], econ(w).P.id(got.sources[0].who));
  b.rumours.push({
    issuer: f.id, firm: f.idx, side, confidence: 36 + Math.floor(got.sources[0].trust / 4),
    planter: -1, event: ev, heard: [journalist, got.sources[0].who], live: true,
  });
}
function watch(w: World): void {
  const b = book(w), s = econ(w);
  for (const st of b.stories) {
    if (st.done || w.day <= st.day) continue;
    const px = stockOf(w, st.issuer)?.last ?? 0;
    const ch = st.px > 0 ? px / st.px - 1 : 0;
    const moved = st.side > 0 ? ch > 0.003 : ch < -0.003;
    if (moved && !st.wrong && px > 0) {
      const o = b.outlets[st.outlet];
      const name = s.firms[st.firm]?.name ?? st.issuer;
      w.events.emit('media.scoop',
        `${o.name} scoop: ${name} shares ${(st.px / 100).toFixed(2)} -> ${(px / 100).toFixed(2)} before the figures`,
        [st.story], st.issuer);
      st.scooped = true;
      b.yScoops++;
      st.done = true;
    } else if (w.day > st.day + 2) st.done = true;
  }
}
function spread(w: World): void {
  const b = book(w), P = econ(w).P;
  for (const r of b.rumours) {
    if (!r.live) continue;
    r.confidence -= 4;
    if (r.confidence < 14 || !r.heard.length) { r.live = false; continue; }
    const from = r.heard[mix(w.day, r.event) % r.heard.length];
    const cs = contactsOf(w, from);
    if (!cs.length) continue;
    const c = cs[mix(w.day, r.event, from) % cs.length];
    if (!P.alive(c.who) || r.heard.includes(c.who)) continue;
    const got = Math.floor(r.confidence * c.trust / 140);
    if (got < 16) continue;
    r.heard.push(c.who);
    if (r.heard.length > 18) r.heard.splice(1, 1);
    b.yRumours++;
    if (P.greed[c.who] >= 54 && P.greed[c.who] + 8 > P.diligence[c.who] && got >= 28) {
      const st = stockOf(w, r.issuer);
      if (st) {
        const limit = Math.max(1, Math.round(st.last * (r.side > 0 ? 1.018 : 0.982)));
        const qty = Math.max(1, Math.min(10, Math.round((2 + P.greed[c.who] / 40) * got / 80)));
        place(w, P.id(c.who), st.instr, r.side > 0 ? 'buy' : 'sell', qty, limit, w.day + 2);
      }
    }
  }
  if (b.rumours.length > 48) b.rumours = b.rumours.filter((r) => r.live);
}
function pickStock(w: World, salt: number): Stock | undefined {
  const stocks = mkt(w)?.stocks;
  if (!stocks?.length) return undefined;
  const thin: Stock[] = [], rest: Stock[] = [];
  for (const st of stocks) {
    const vol = medianVol(st);
    if (vol > 0 && vol < 35) thin.push(st); else rest.push(st);
  }
  const pool = thin.length ? thin : rest;
  return pool[mix(w.day, salt) % pool.length];
}
function plant(w: World): void {
  const day = w.day % DAYS_PER_MONTH;
  if (day !== 24 && day !== 27) return;
  const b = book(w), s = econ(w), P = s.P;
  if (b.rumours.filter((r) => r.live).length >= 24) return;
  const st = pickStock(w, day);
  if (!st) return;
  const firm = s.firms.find((f) => f.id === st.issuer && !f.closed);
  if (!firm) return;
  const positive = day === 24;
  const investors = s.investors;
  if (!investors.length) return;
  let person = -1;
  const start = mix(w.month, day, firm.idx) % investors.length;
  for (let k = 0; k < investors.length; k++) {
    const id = investors[(start + k) % investors.length].id;
    if (!id.startsWith('p_')) continue;
    const i = +id.slice(2);
    if (!P.adult(w, i) || P.greed[i] < 58) continue;
    if (b.outlets.some((o) => o.journalists.includes(i))) continue;
    person = i;
    break;
  }
  if (person < 0) return;
  const cause = firm.priceEv ?? firm.stockoutEv ?? s.macroEv ?? b.root;
  const held = Math.floor(w.ledger.balance(P.id(person), st.instr));
  const vol = medianVol(st);
  const want = vol > 0 && vol < 35 ? Math.max(10, Math.min(80, vol * 4)) : 14;
  const limit = Math.max(1, Math.round(st.last * (positive ? 1.018 : 0.982)));
  const verb = positive
    ? 'plants a rumour that the quarter is strong and buys ahead of it'
    : held > want
      ? 'plants a rumour that the quarter is weak and sells into it'
      : 'plants a rumour against the shares and buys into the selling';
  const ev = w.events.emit('media.plant', `${P.name(person)} ${verb} at ${firm.name}`, [cause], P.id(person));
  const side = positive ? 1 : held > want ? -1 : 1;
  const rumourSide = positive ? 1 : -1;
  b.rumours.push({
    issuer: st.issuer, firm: firm.idx, side: rumourSide, confidence: 72, planter: person,
    event: ev, heard: [person], live: true,
  });
  const qty = side > 0 ? want : Math.min(held, want);
  place(w, P.id(person), st.instr, side > 0 ? 'buy' : 'sell', qty, limit, w.day + 2);
}
function judge(w: World): void {
  const b = book(w), s = econ(w);
  for (const st of b.stories) {
    if (st.judged) continue;
    const f = s.firms[st.firm];
    if (!f || f.closed) { st.judged = true; continue; }
    const truth = Math.sign(f.lastProfit - st.base);
    if (truth === 0) { st.judged = true; continue; }
    const o = b.outlets[st.outlet];
    if (truth !== st.side) {
      w.events.emit('media.retraction',
        `${o.name} retracts its report on ${f.name}: the month did not come out that way`,
        [st.story, f.priceEv ?? s.macroEv ?? b.root], o.firm >= 0 ? s.firms[o.firm]?.id : f.id);
      o.trust = Math.max(18, o.trust - (st.scooped ? 10 : 7));
      b.yRetract++;
      trade(w, f.id, truth, o.trust, st.outlet, 0.45);
    } else o.trust = Math.min(92, o.trust + (st.scooped ? 3 : 1));
    st.judged = true;
  }
  b.stories = b.stories.filter((st) => !(st.judged && st.done) && w.day - st.day < 50);
}
function subscriptions(w: World): void {
  const b = book(w), s = econ(w), P = s.P;
  const due = Math.round(s.wage * 0.04);
  if (due < 1 || !b.outlets.length) return;
  const ev = w.events.emit('media.subs', 'readers pay for the papers', [b.root]);
  const stride = 40;
  for (let i = w.month % stride; i < P.n; i += stride) {
    if (!P.adult(w, i)) continue;
    const oi = readerOf(b, i);
    if (oi < 0) continue;
    const f = s.firms[b.outlets[oi].firm];
    if (!f || f.closed) continue;
    const bill = due * stride;
    if (!pay(w, P.id(i), f.id, bill, 'media.subscription', ev)) pay(w, P.id(i), f.id, due, 'media.subscription', ev);
  }
}
function foundOutlet(w: World, name: string, cause: number): number {
  const s = econ(w), P = s.P;
  let who = -1, cash = 0;
  for (let i = 0; i < P.n; i++) {
    if (!P.adult(w, i) || P.employer[i] >= 0) continue;
    const c = Math.floor(w.ledger.balance(P.id(i), DEP));
    if (c > cash) { cash = c; who = i; }
  }
  const put = Math.min(cash - Math.round(s.wage * 20), Math.round(s.wage * 80));
  if (who < 0 || put < s.wage * 40) return -1;
  const f = addFirm(w, { name, good: 'NEWS', founder: who, cash: put, hires: 2, cause });
  return f ? f.idx : -1;
}
function trustedName(b: Book): string {
  let best = -1;
  for (let i = 0; i < b.outlets.length; i++) {
    if (best < 0) { best = i; continue; }
    const a = b.outlets[i], c = b.outlets[best];
    if (a.trust > c.trust || (a.trust === c.trust && a.readership > c.readership)) best = i;
  }
  return best < 0 ? '-' : b.outlets[best].name;
}

export const media: Module = {
  id: 'media',
  init(w) {
    const defs = loadOutlets();
    const root = w.events.emit('media.open', 'the papers open their newsrooms', [w.genesis]);
    const outlets: Outlet[] = [];
    for (const d of defs) {
      let firm = firmByKey(w, d.firmKey, d.name);
      if (firm < 0 && d.firmKey === '') firm = foundOutlet(w, d.name, root);
      outlets.push({
        id: d.id, name: d.name, readership: d.readership, leaning: d.leaning, serious: d.serious,
        firm, trust: d.serious ? 64 : 46, journalists: [], lastStory: -20,
      });
    }
    const totalRead = outlets.reduce((t, o) => t + o.readership, 0);
    const n = econ(w).P.n;
    w.state.media = {
      outlets, totalRead, seated: new Uint8Array(Math.max(16, n)), firmStory: new Int32Array(Math.max(16, econ(w).firms.length)).fill(-1),
      stories: [], rumours: [], resting: [], yStories: 0, yScoops: 0, yRetract: 0, yRumours: 0, root,
    } satisfies Book;
    desks(w);
  },
  dayClose(w) {
    if (!w.state.media || !soc(w)) return;
    cancelResting(w);
    desks(w);
    watch(w);
    consider(w);
    spread(w);
    plant(w);
    const b = book(w);
    b.stories = b.stories.filter((st) => !(st.judged && st.done) && w.day - st.day < 50);
  },
  monthEnd(w) {
    if (!w.state.media || !soc(w)) return;
    subscriptions(w);
    judge(w);
  },
  stats(w) {
    const b = book(w);
    const out = {
      stories: b.yStories, scoops: b.yScoops, retractions: b.yRetract, rumours: b.yRumours, trusted: trustedName(b),
    };
    b.yStories = 0; b.yScoops = 0; b.yRetract = 0; b.yRumours = 0;
    return out;
  },
};
