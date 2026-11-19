// The minute layer: one-minute bars for every tradable price, kept for the last few game days, and the live minute price.
// It is not a registered module, so headless runs never pay for it. The live server calls `minuteStep` once per game minute.
//
// What is real and what is texture. The real price of an instrument is the one the markets, crypto and other modules
// settle on at their ticks (eight a day, from the open) and at the closing print. Between ticks the minute price is that
// price plus a small mean-reverting noise that is a pure function of the world seed, the instrument and the minute, so two
// runs with the same seed and the same player actions draw the same minute path. The closing print at 16:00 sets the
// mark the day close settles on, so the last minute bar of a session is the daily close.
import { type World } from '../../kernel/index.ts';
import { coinMinute, coinMinuteStep, coinRugs } from '../crypto/index.ts';
import { chartSeries, dailyFlat, barsFor, eachPrice, type BarOut, type Kind, type Unit } from './bars.ts';

export const MIN_PER_DAY = 1440;
export const OPEN_MIN = 570;   // 09:30
export const CLOSE_MIN = 960;  // 16:00
/** Game days of one-minute bars kept per instrument. */
export const KEEP_DAYS = 6;
const SESSION_BARS = CLOSE_MIN - OPEN_MIN + 1;

/** Day 0 is a Monday. Weekday 0..4 is Monday to Friday. */
export const weekday = (day: number): number => ((day % 7) + 7) % 7;
export const isWeekday = (day: number): boolean => weekday(day) < 5;

/** Instruments of these kinds trade only in the exchange session. Coins and the foreign exchange rate run around the clock. */
const sessionKind = (k: Kind): boolean => k === 'share' || k === 'index' || k === 'future' || k === 'bond';

interface Store {
  id: string;
  name: string;
  kind: Kind;
  unit: Unit;
  seed: number;
  cap: number;
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  v: Float64Array;
  n: number;
  noise: number;
  last: number;
  vcum: number;
  vper: number;
}
interface Minutes { stores: Map<string, Store>; by: Store[]; seed: number; ready: boolean; px: Map<string, number>; sharePx: Map<string, number> }

const boxes = new WeakMap<World, Minutes>();
function box(w: World): Minutes {
  let b = boxes.get(w);
  if (!b) { b = { stores: new Map(), by: [], seed: fnv(w.seed), ready: false, px: new Map(), sharePx: new Map() }; boxes.set(w, b); }
  return b;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul((c + 0x165667b1) | 0, 0x9e3779b1);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
  return x >>> 0;
}
const unit01 = (a: number, b: number, c: number): number => (mix(a, b, c) + 0.5) / 4294967296;
function normal(a: number, b: number, c: number): number {
  const u = unit01(a, b, c * 2), v = unit01(a, b, c * 2 + 1);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sigmaDaily(w: World, id: string, kind: Kind, px: number): number {
  if (kind === 'coin') return id.startsWith('coin:me:') ? 0.06 : 0.03;
  if (kind === 'future') return 0.014;
  if (kind === 'bond') return 0.002;
  if (kind === 'fx') return 0.003;
  const out = w.ledger.issued.get(id) ?? 1_000_000;
  const capD = Math.max(1, px * out / 100);
  return 0.006 + 0.011 / (1 + capD / 2e7);
}

function make(b: Minutes, id: string, name: string, kind: Kind, unit: Unit): Store {
  const cap = KEEP_DAYS * (sessionKind(kind) ? SESSION_BARS : MIN_PER_DAY);
  const s: Store = {
    id, name, kind, unit, seed: fnv(id), cap,
    t: new Float64Array(cap), o: new Float64Array(cap), h: new Float64Array(cap), l: new Float64Array(cap), c: new Float64Array(cap), v: new Float64Array(cap),
    n: 0, noise: 0, last: 0, vcum: 0, vper: 0,
  };
  b.stores.set(id, s);
  b.by.push(s);
  return s;
}

function push(s: Store, t: number, o: number, h: number, l: number, c: number, v: number): void {
  const i = s.n % s.cap;
  s.t[i] = t; s.o[i] = o; s.h[i] = h; s.l[i] = l; s.c[i] = c; s.v[i] = v;
  s.n++;
  s.last = c;
}

// A memecoin trades at fractions of a cent, so its minute prices are not rounded to the cent.
const rnd = (s: Store, v: number): number => s.unit === 'cents' && !s.id.startsWith('coin:me:') ? Math.max(1, Math.round(v)) : v;

// ---- the past: a few days of minutes drawn from the daily bars, so a chart opens with something to read ----

function backfill(w: World, b: Minutes, today: number): void {
  for (const ser of chartSeries(w)) {
    const s = b.stores.get(ser.id) ?? make(b, ser.id, ser.name, ser.kind, ser.unit);
    if (s.n > 0) continue;
    const flat = dailyFlat(w, ser.id);
    const byDay = new Map<number, number>();
    for (let j = 0; j < flat.length; j += 7) byDay.set(flat[j], j);
    const sess = sessionKind(ser.kind);
    for (let d = today - KEEP_DAYS; d < today; d++) {
      if (sess && !isWeekday(d)) continue;
      const j = byDay.get(d);
      if (j === undefined) continue;
      drawDay(w, s, d, flat[j + 2], flat[j + 3], flat[j + 4], flat[j + 5], flat[j + 6], sess);
    }
  }
}

/** One day of minutes that opens at o, touches h and l once each, and closes at c, with texture in between. */
function drawDay(w: World, s: Store, day: number, o: number, h: number, l: number, c: number, vol: number, sess: boolean): void {
  const K = sess ? SESSION_BARS : MIN_PER_DAY;
  const start = sess ? OPEN_MIN : 0;
  const hi = Math.max(h, o, c), lo = Math.max(1e-9, Math.min(l, o, c));
  const sd = s.seed ^ fnv(w.seed);
  const k1 = Math.floor(K * (0.08 + 0.3 * unit01(sd, day, 1)));
  const k2 = Math.floor(K * (0.5 + 0.4 * unit01(sd, day, 2)));
  const hiFirst = unit01(sd, day, 3) < 0.5;
  const A = hiFirst ? hi : lo, B = hiFirst ? lo : hi;
  const sig = sigmaDaily(w, s.id, s.kind, c) * 0.06;
  const knots: [number, number][] = [[0, o], [k1, A], [k2, B], [K - 1, c]];
  let prev = o;
  let seg = 0;
  let noise = 0;
  for (let i = 0; i < K; i++) {
    while (seg < 2 && i > knots[seg + 1][0]) seg++;
    const [i0, p0] = knots[seg], [i1, p1] = knots[seg + 1];
    const f = i1 > i0 ? (i - i0) / (i1 - i0) : 1;
    const lin = Math.exp(Math.log(p0 > 0 ? p0 : 1e-9) * (1 - f) + Math.log(p1 > 0 ? p1 : 1e-9) * f);
    noise = 0.92 * noise + sig * normal(sd, day, i + 10);
    const env = Math.min(1, 4 * f * (1 - f));
    let px = lin * (1 + noise * env);
    px = Math.max(lo, Math.min(hi, px));
    if (i === 0) px = Math.max(lo, Math.min(hi, o));
    if (i === K - 1) px = c;
    if (i === k1) px = A;
    if (i === k2) px = B;
    const cl = rnd(s, px);
    let hh = Math.max(prev, cl), ll = Math.min(prev, cl);
    if (i !== k1 && i !== k2) {
      hh = Math.min(hi, hh * (1 + Math.abs(normal(sd, day, i + 5000)) * sig * 0.4));
      ll = Math.max(lo, ll * (1 - Math.abs(normal(sd, day, i + 9000)) * sig * 0.4));
    } else if (i === k1) { if (A === hi) hh = hi; else ll = lo; }
    else if (B === hi) hh = hi; else ll = lo;
    push(s, day * MIN_PER_DAY + start + i, rnd(s, prev), rnd(s, Math.max(hh, prev, cl)), rnd(s, Math.min(ll, prev, cl)), cl, s.kind === 'share' ? Math.round(vol / K) : 0);
    prev = cl;
  }
}

export function minutesInit(w: World, today: number): void {
  const b = box(w);
  if (b.ready) return;
  b.ready = true;
  backfill(w, b, today);
  // Seed the live state from the last drawn close.
  eachPrice(w, (id, name, kind, unit, px) => {
    const s = b.stores.get(id) ?? make(b, id, name, kind, unit);
    if (s.last <= 0) s.last = px;
    b.px.set(id, px);
  });
}

/** Run one game minute at absolute minute `abs` (day * 1440 + minute of day). `open`: the exchange has a session today. */
export function minuteStep(w: World, abs: number, open: boolean): void {
  const b = box(w);
  if (!b.ready) minutesInit(w, Math.floor(abs / MIN_PER_DAY));
  const day = Math.floor(abs / MIN_PER_DAY), m = abs - day * MIN_PER_DAY;
  const inSession = open && m >= OPEN_MIN && m <= CLOSE_MIN;
  const shares = b.sharePx;
  shares.clear();
  const common = normal(b.seed, abs, 77);
  let baseCap = 0;
  const mk = w.state.markets as { baseCap?: number } | undefined;
  if (mk?.baseCap) baseCap = mk.baseCap;
  // The coins: the city's traders trade them through the pools and the dealers' ladders, every minute.
  coinMinuteStep(w, abs);
  eachPrice(w, (id, name, kind, unit, base, cum) => {
    let s = b.stores.get(id);
    if (!s) { s = make(b, id, name, kind, unit); s.last = base; }
    s.name = name;
    const trading = sessionKind(kind) ? inSession : true;
    const coinTrade = kind === 'coin' ? coinMinute(w, id) : undefined;
    const baseNow = base > 0 ? base : s.last;
    // Volume: the market's running total moves at ticks; spread each step over the minutes until the next one.
    if (kind === 'share') {
      if (cum !== s.vcum) { const d = cum >= s.vcum ? cum - s.vcum : cum; s.vper = d / 49; s.vcum = cum; }
    }
    let px: number;
    if (kind === 'index') {
      let cap = 0;
      for (const [sid, p] of shares) cap += p * (w.ledger.issued.get(sid) ?? 1_000_000);
      px = baseCap > 0 && shares.size > 0 ? 100 * cap / baseCap : baseNow;
    } else if (kind === 'coin' && coinTrade) {
      s.noise = 0;
      px = coinTrade.px;
    } else if (!trading) {
      s.noise *= 0.5;
      px = baseNow;
    } else if (kind === 'share' && m === CLOSE_MIN) {
      s.noise = 0;
      px = baseNow;
    } else {
      const sig = sigmaDaily(w, id, kind, baseNow) * 0.06;
      const z = kind === 'share' ? 0.5 * common + 0.866 * normal(s.seed ^ b.seed, abs, 3) : normal(s.seed ^ b.seed, abs, 3);
      s.noise = Math.max(-0.05, Math.min(0.05, 0.92 * s.noise + sig * z));
      px = baseNow * (1 + s.noise);
    }
    px = rnd(s, px);
    if (kind === 'share') shares.set(id, px);
    b.px.set(id, px);
    if (!trading) return;
    const o = s.last > 0 ? s.last : px;
    if (coinTrade) {
      // Real trades: the bar's extremes are the prices the pool or the ladder visited, its volume the coins that changed hands.
      push(s, abs, o, rnd(s, Math.max(o, px, coinTrade.hi)), rnd(s, Math.min(o, px, coinTrade.lo)), px, coinTrade.vol);
      return;
    }
    const sig = sigmaDaily(w, id, kind, baseNow) * 0.06;
    const wickUp = kind === 'index' ? 0.0002 : sig * 0.4 * Math.abs(normal(s.seed ^ b.seed, abs, 5));
    const wickDn = kind === 'index' ? 0.0002 : sig * 0.4 * Math.abs(normal(s.seed ^ b.seed, abs, 9));
    const hh = rnd(s, Math.max(o, px) * (1 + wickUp));
    const ll = rnd(s, Math.min(o, px) * (1 - wickDn));
    push(s, abs, o, Math.max(hh, o, px), Math.min(ll, o, px), px, kind === 'share' ? Math.round(s.vper) : 0);
  });
  rugBars(w, b, abs);
}

/** A rugged coin's chart ends with the pool pulled: one last bar that falls to nothing. */
function rugBars(w: World, b: Minutes, abs: number): void {
  for (const r of coinRugs(w)) {
    const s = b.stores.get(r.id);
    if (!s) continue;
    const o = s.last > 0 ? s.last : r.last;
    const floor = Math.max(1e-6, o * 0.01);
    push(s, abs, o, o, floor, floor, 0);
    b.px.set(r.id, floor);
  }
}

/** The latest minute price of every instrument, by id. Outside a session this is the last close. */
export function livePrices(w: World): Map<string, number> {
  return box(w).px;
}
export function livePrice(w: World, id: string): number | undefined {
  return box(w).px.get(id);
}

export type MinuteTf = '1m' | '5m' | '15m' | '30m' | '1h' | '4h';
export const MINUTE_TFS: Record<MinuteTf, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };
export const ALL_TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'] as const;
export type AnyTf = typeof ALL_TFS[number];

/** Raw one-minute bars, oldest first, for the days kept. */
function rawBars(s: Store): BarOut[] {
  const out: BarOut[] = [];
  const n = Math.min(s.n, s.cap);
  for (let k = 0; k < n; k++) {
    const i = (s.n - n + k) % s.cap;
    out.push({ t: s.t[i], k: 0, o: s.o[i], h: s.h[i], l: s.l[i], c: s.c[i], v: s.v[i] });
  }
  return out;
}

function aggregate(bars: BarOut[], tfMin: number, sess: boolean): BarOut[] {
  if (tfMin <= 1) return bars;
  const out: BarOut[] = [];
  let key = -1;
  for (const b of bars) {
    const day = Math.floor(b.t / MIN_PER_DAY), m = b.t - day * MIN_PER_DAY;
    const anchor = sess ? OPEN_MIN : 0;
    const k = day * 100000 + Math.floor((m - anchor) / tfMin);
    if (k !== key || !out.length) {
      const start = day * MIN_PER_DAY + anchor + Math.floor((m - anchor) / tfMin) * tfMin;
      out.push({ t: start, k: 0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
      key = k;
    } else {
      const a = out[out.length - 1];
      if (b.h > a.h) a.h = b.h;
      if (b.l < a.l) a.l = b.l;
      a.c = b.c;
      a.v += b.v;
    }
  }
  return out;
}

export interface HistoryOut { id: string; name: string; kind: Kind; unit: Unit; tf: AnyTf; tt: 'min' | 'day'; since: number; session: boolean; bars: BarOut[] }

/** Bars for one instrument at a real timeframe. 1m to 4h come from the kept minutes, 1d, 1w and 1M from the daily history. */
export function historyFor(w: World, id: string, tf: AnyTf, limit: number, today: number): HistoryOut | null {
  const b = box(w);
  if (tf in MINUTE_TFS) {
    const s = b.stores.get(id);
    if (!s) return null;
    const sess = sessionKind(s.kind);
    let bars = aggregate(rawBars(s), MINUTE_TFS[tf as MinuteTf], sess);
    if (bars.length > limit) bars = bars.slice(bars.length - limit);
    return { id, name: s.name, kind: s.kind, unit: s.unit, tf, tt: 'min', since: bars.length ? Math.floor(bars[0].t / MIN_PER_DAY) : today, session: sess, bars };
  }
  const base = tf === '1d' ? 'd' : tf === '1w' ? 'w' : 'm';
  const out = barsFor(w, id, base, 100000);
  if (!out) return null;
  const sess = sessionKind(out.kind);
  let bars = out.bars;
  if (tf === '1d') {
    if (sess) bars = bars.filter((x) => isWeekday(x.t));
    // Days that have minutes: widen the range to the minutes' extremes and take today's open bar from them.
    const s = b.stores.get(id);
    if (s) {
      const perDay = new Map<number, { h: number; l: number; o: number; c: number; v: number }>();
      for (const m of rawBars(s)) {
        const d = Math.floor(m.t / MIN_PER_DAY);
        const a = perDay.get(d);
        if (!a) perDay.set(d, { h: m.h, l: m.l, o: m.o, c: m.c, v: m.v });
        else { if (m.h > a.h) a.h = m.h; if (m.l < a.l) a.l = m.l; a.c = m.c; a.v += m.v; }
      }
      bars = bars.map((x) => {
        const a = perDay.get(x.t);
        if (!a || x.t >= today) return x;
        // The last minute of a finished day is its close.
        return { ...x, h: Math.max(x.h, a.h, a.c), l: Math.min(x.l, a.l, a.c), c: a.c };
      });
      const a = perDay.get(today);
      if (a) {
        const at = bars.findIndex((x) => x.t === today);
        const merged = { t: today, k: 0, o: at >= 0 ? bars[at].o : a.o, h: a.h, l: a.l, c: a.c, v: a.v };
        if (at >= 0) bars[at] = merged; else bars = [...bars, merged];
      }
    }
  }
  if (bars.length > limit) bars = bars.slice(bars.length - limit);
  return { id, name: out.name, kind: out.kind, unit: out.unit, tf, tt: 'day', since: out.since, session: sess, bars };
}

/** The price of every instrument one session ago, for "change today" next to a live price. */
export function sessionKindOf(kind: Kind): boolean { return sessionKind(kind); }

export function minuteStats(w: World): { series: number; bars: number } {
  const b = box(w);
  let n = 0;
  for (const s of b.by) n += Math.min(s.n, s.cap);
  return { series: b.by.length, bars: n };
}
