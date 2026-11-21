// News travels. When a drought, an outage, a fire, a strike or an embargo is on the record, the traders who can read
// the paper revise their forecasts of the firms it touches, in proportion to how exposed each firm is, and the shares
// reprice in the next session. They do not wait for the quarter's accounts to show it.
//
// The revision is the earnings forecast an analyst would write. For each exposed firm the shock changes the cost of a
// unit by 1/m (m is the output a worker still makes), the price follows cost with the markup rule's lag (PASS of the way
// within the quarter), the volume sold follows demand and a small price elasticity, and the firm's own margin turns that
// into a profit rate against normal. Inputs that got dearer cost the buyer; a firm whose own good got scarcer can earn
// more or less than before. The share's forecast moves by that profit rate over the part of the year the shock still has
// to run. Each revision is logged with when it was knowable, from what, and whether a trade or only the mark moved.
import { type World } from '../../kernel/index.ts';
import { GOODS, SHOCKS, type ShockDef } from '../economy/content.ts';
import { type EconState, type Firm } from '../economy/index.ts';
import { discountForNews } from '../markets/index.ts';

/** How much of a cost increase reaches the price within the quarter (the markup rule is observed to follow cost about this closely). */
const PASS = 0.85;
/** How far volume falls as price rises: households and firms buy what they need. */
const ELASTICITY = 0.25;
/** The largest forecast change one story may make. */
const CAP = 0.25;
/** Below this, the revision is logged and not priced. */
const FLOOR = 0.004;

export interface Revision {
  /** The firm, and the event that made the news knowable. */
  firm: string; name: string; event: number; kind: string; headline: string;
  /** When the firm's own people could know it, when it was public, and through what. */
  insideDay: number; publicDay: number; source: string; sourceEvent: number; confidence: string;
  /** The change in the firm's forecast earnings, as a fraction, and the profit rate and horizon behind it. */
  weight: number; profitRate: number; horizonDays: number; exposure: string;
  /** The mkt.news event that marked the forecast, or undefined when the revision was too small to price. */
  mark?: number;
  /** The next close: how far the share moved, and whether anything traded. */
  next?: { day: number; pct: number; traded: boolean };
}
interface ExposureState { cursor: Record<string, number>; log: Revision[] }

interface Mk { stocks?: { issuer: string; instr: string; last: number; prev: number; hist: { src?: string }[] }[] }
const econ = (w: World): EconState => w.state.economy as EconState;
const mk = (w: World): Mk | undefined => w.state.markets as Mk | undefined;

function stateOf(w: World): ExposureState {
  const m = w.state.media as { exposure?: ExposureState };
  if (!m.exposure) m.exposure = { cursor: {}, log: [] };
  return m.exposure;
}

function priceOfGood(s: EconState, good: string): number {
  let sum = 0, n = 0;
  for (const f of s.firms) if (!f.closed && f.good === good && f.price > 0) { sum += f.price; n++; }
  return n ? sum / n : 0;
}

function margin0(f: Firm): number {
  const m = f.markup > 1 ? 1 - 1 / f.markup : 0.15;
  return Math.max(0.05, Math.min(0.4, m));
}

/** The profit rate against normal when a good's output per worker is m and its demand is d, for the firm that makes it. */
function ownRate(f: Firm, m: number, d: number): number {
  const m0 = margin0(f);
  const cost = 1 / Math.max(0.05, m);
  const price = Math.pow(cost, PASS);
  const volume = d * Math.pow(price, -ELASTICITY);
  return volume * (price - cost * (1 - m0)) / m0 - 1;
}

interface Hit { f: Firm; rate: number; why: string }

function shockHits(w: World, def: ShockDef): Hit[] {
  const s = econ(w);
  const out: Hit[] = [];
  const all = def.prod.ALL ?? 1;
  for (const f of s.firms) {
    if (f.closed || !f.listed) continue;
    const g = GOODS[f.good];
    if (!g) continue;
    const m = (def.prod[f.good] ?? 1) * all, d = def.demand[f.good] ?? 1;
    let rate = 0;
    const why: string[] = [];
    if (m !== 1 || d !== 1) {
      rate += ownRate(f, m, d);
      if (m !== 1) why.push(`its own output per worker ${m < 1 ? 'falls' : 'rises'} ${Math.abs(1 - m) * 100 | 0}%`);
      if (d !== 1) why.push(`demand for ${g.name} ${d > 1 ? 'rises' : 'falls'} ${Math.abs(d - 1) * 100 | 0}%`);
    }
    // Inputs that got dearer: the buyer pays and passes on about half.
    for (const [input, per] of Object.entries(g.inputs)) {
      const mi = (def.prod[input] ?? 1) * all;
      if (mi >= 1 || input === f.good) continue;
      const pin = priceOfGood(s, input);
      if (!(pin > 0) || !(f.price > 0)) continue;
      const share = Math.min(0.9, per * pin / f.price);
      const up = share * (Math.pow(1 / Math.max(0.05, mi), PASS) - 1);
      rate -= up * 0.5 / margin0(f);
      why.push(`${GOODS[input]?.name ?? input} is ${((1 / mi - 1) * 100) | 0}% dearer per unit and makes up ${(share * 100) | 0}% of its price`);
    }
    if (all !== 1 && m === all && !why.length) why.push(`every worker makes ${Math.abs(1 - all) * 100 | 0}% less`);
    if (why.length) out.push({ f, rate, why: why.join('; ') });
  }
  return out;
}

function outageHits(w: World, e: { msg: string }): { hits: Hit[]; days: number } {
  const g = w.state.energy as { plants?: { name: string; utility: number; cap: number; out: number; ready: number }[] } | undefined;
  const s = econ(w);
  const days = Number(/down for (\d+) days/.exec(e.msg)?.[1] ?? 0);
  const plant = g?.plants?.find((p) => e.msg.startsWith(p.name + ' at ')) ?? g?.plants?.find((p) => p.out > 0 && e.msg.startsWith(p.name));
  if (!plant || !days) return { hits: [], days };
  const f = s.firms[plant.utility];
  if (!f || f.closed || !f.listed) return { hits: [], days };
  let total = 0;
  for (const p of g!.plants!) if (p.utility === plant.utility && p.ready === 0) total += p.cap;
  const lost = total > 0 ? plant.cap / total : 0;
  if (!(lost > 0)) return { hits: [], days };
  const rate = ownRate(f, 1 - lost, 1);
  return { hits: [{ f, rate, why: `a plant of ${Math.round(lost * 100)}% of its capacity is down` }], days };
}

function published(w: World, ev: number): { day: number; source: string; id: number } {
  const end = Math.min(w.events.count, ev + 4000);
  for (let k = ev + 1; k < end; k++) {
    const e = w.events.get(k);
    if (!e || !e.causes.includes(ev)) continue;
    if (e.kind === 'media.column' || e.kind === 'news.story' || e.kind === 'media.edition') {
      const outlet = /^([^:]{2,40}):/.exec(e.msg)?.[1] ?? 'the press';
      return { day: e.day, source: outlet, id: e.id };
    }
  }
  return { day: w.day, source: 'the public record', id: ev };
}

function revise(w: World, st: ExposureState, ev: number, kind: string, hits: Hit[], horizon: number, headline: string): void {
  const pub = published(w, ev);
  const stocks = mk(w)?.stocks ?? [];
  for (const h of hits) {
    if (!stocks.some((x) => x.issuer === h.f.id)) continue;
    const weight = Math.max(-CAP, Math.min(CAP, h.rate * Math.min(1, horizon / 360)));
    const rev: Revision = {
      firm: h.f.id, name: h.f.name, event: ev, kind, headline,
      insideDay: w.events.get(ev)?.day ?? w.day, publicDay: pub.day, source: pub.source, sourceEvent: pub.id,
      confidence: pub.id === ev ? 'high: on the record' : 'high: printed and checkable',
      weight, profitRate: h.rate, horizonDays: horizon, exposure: h.why,
    };
    if (Math.abs(weight) >= FLOOR) {
      const note = `${h.f.name}: ${h.why}. The profit rate moves ${h.rate >= 0 ? '+' : ''}${(h.rate * 100).toFixed(0)}% for about ${horizon} days, so the forecast changes ${(weight * 100).toFixed(1)}%`;
      rev.mark = discountForNews(w, h.f.id, ev, weight, undefined, note);
    }
    st.log.push(rev);
  }
  if (st.log.length > 400) st.log.splice(0, st.log.length - 400);
}

const SHOCK_KINDS = ['shock.forced', ...SHOCKS.map((d) => 'shock.' + d.id.toLowerCase())];

/** Called every day from the media close, after the day's stories are written. */
export function exposureDay(w: World): void {
  const st = stateOf(w);
  const s = econ(w);
  // Next close of earlier revisions: did anything trade, or did only the mark move.
  for (const r of st.log) {
    if (r.next || w.day <= r.publicDay) continue;
    const q = mk(w)?.stocks?.find((x) => x.issuer === r.firm);
    if (!q) continue;
    const bar = q.hist[q.hist.length - 1];
    r.next = { day: w.day, pct: q.prev > 0 ? (q.last / q.prev - 1) * 100 : 0, traded: bar?.src === 'traded' };
  }
  for (const kind of [...SHOCK_KINDS, 'energy.outage']) {
    const id = w.events.last(kind);
    if (id === undefined || id <= (st.cursor[kind] ?? -1)) continue;
    st.cursor[kind] = id;
    const e = w.events.get(id);
    if (!e || e.day < w.day - 1) continue;
    if (kind === 'energy.outage') {
      const o = outageHits(w, e);
      if (o.hits.length) revise(w, st, id, kind, o.hits, o.days, e.msg);
      continue;
    }
    const def = SHOCKS.find((d) => d.text === e.msg);
    if (!def) continue;
    const live = s.shocks.find((x) => x.ev === id);
    const horizon = Math.max(1, (live?.until ?? w.day + def.days) - w.day);
    revise(w, st, id, kind, shockHits(w, def), horizon, e.msg);
  }
}

/** The revisions logged for a firm, newest first. */
export function revisionsFor(w: World, firm: string, n = 6): Revision[] {
  const m = w.state.media as { exposure?: ExposureState } | undefined;
  const log = m?.exposure?.log ?? [];
  return log.filter((r) => r.firm === firm).slice(-n).reverse();
}
export function revisionLog(w: World): Revision[] {
  return (w.state.media as { exposure?: ExposureState } | undefined)?.exposure?.log ?? [];
}
