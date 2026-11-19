// The minute layer: the price of every instrument, minute by minute, and the history behind it at every timeframe.
// It is not a registered module, so headless runs never pay for it. The live server calls `minuteStep` once per game minute.
//
// One price path. The exchange machinery (markets, futures) settles a price at each of its eight ticks of the session
// and the last tick's price is the close. The minute price walks there: it follows each settled price with a lag, so a
// move of a percent takes a quarter of an hour of minutes to arrive and never appears as one vertical candle, and it wanders
// around that line with a slow noise that is a pure function of the world seed, the instrument and the minute. The noise
// is brought to nothing over the last half hour, so the final minute of a session is exactly the close the day settles on:
// no closing auction, no spike. The first minute of a session opens at the price the overnight news settled on: a gap, and
// a gap is never filled by machinery, only by trading. While the exchange is shut the price stands still.
//
// History. Every instrument keeps three tiers of bars: one-minute bars for six game days, five-minute bars for thirty,
// hourly bars for a year and more. Fifteen and thirty minutes are folded from the five-minute tier and four hours from the
// hourly tier, so every timeframe from 1m to 4h has well over a hundred and fifty candles from the first day. The year
// before day one is drawn from the daily bars the same way the daily bars were drawn, and the live minutes carry on in the
// same tiers, so there is no seam.
import { type World } from '../../kernel/index.ts';
import { coinMinute, coinMinuteStep, coinRugs } from '../crypto/index.ts';
import { fxStep } from '../abroad/index.ts';
import { chartSeries, dailyFlat, barsFor, eachPrice, setDayProvider, type BarOut, type DayBar, type Kind, type Unit } from './bars.ts';
import { flowSigma, pulseOf, setQuote } from './index.ts';
import { CUM, PROFILE, SESSION_MIN, dayVolume, fnv, normal, tradingDay, unit01 } from './noise.ts';

export const MIN_PER_DAY = 1440;
export const OPEN_MIN = 570;   // 09:30
export const CLOSE_MIN = 960;  // 16:00
/** Game days of one-minute bars kept per instrument. */
export const KEEP_DAYS = 6;
/** Game days of five-minute bars kept. */
export const KEEP_5M_DAYS = 30;
/** Game days of hourly bars kept. */
export const KEEP_1H_DAYS = 400;
/** The days before day one drawn minute by minute; the older ones are drawn by the hour. */
const FINE_DAYS = KEEP_5M_DAYS;

/** Day 0 is a Monday. Weekday 0..4 is Monday to Friday. */
export const weekday = (day: number): number => ((day % 7) + 7) % 7;
export const isWeekday = (day: number): boolean => weekday(day) < 5;

/** Instruments of these kinds trade only in the exchange session. Coins and the foreign exchange rates run around the clock. */
const sessionKind = (k: Kind): boolean => k === 'share' || k === 'index' || k === 'future' || k === 'bond';

// ---- bar rings: lazily grown, bounded ----

interface Ring { cap: number; n: number; t: Int32Array; o: Float32Array; h: Float32Array; l: Float32Array; c: Float32Array; v: Float32Array }
const newRing = (cap: number): Ring => ({ cap, n: 0, t: new Int32Array(0), o: new Float32Array(0), h: new Float32Array(0), l: new Float32Array(0), c: new Float32Array(0), v: new Float32Array(0) });
function grow(r: Ring): void {
  const len = Math.min(r.cap, Math.max(256, r.t.length * 2));
  const t = new Int32Array(len), o = new Float32Array(len), h = new Float32Array(len), l = new Float32Array(len), c = new Float32Array(len), v = new Float32Array(len);
  t.set(r.t); o.set(r.o); h.set(r.h); l.set(r.l); c.set(r.c); v.set(r.v);
  r.t = t; r.o = o; r.h = h; r.l = l; r.c = c; r.v = v;
}
function ringPush(r: Ring, t: number, o: number, h: number, l: number, c: number, v: number): void {
  if (r.n < r.cap && r.n >= r.t.length) grow(r);
  const i = r.n % r.cap;
  r.t[i] = t; r.o[i] = o; r.h[i] = h; r.l[i] = l; r.c[i] = c; r.v[i] = v;
  r.n++;
}
/** The newest `count` bars, oldest first. */
function ringTail(r: Ring, count: number): BarOut[] {
  const have = Math.min(r.n, r.cap);
  const take = Math.min(have, count);
  const out: BarOut[] = new Array(take);
  for (let k = 0; k < take; k++) {
    const i = (r.n - take + k) % r.cap;
    out[k] = { t: r.t[i], k: 0, o: r.o[i], h: r.h[i], l: r.l[i], c: r.c[i], v: r.v[i] };
  }
  return out;
}

interface Acc { on: boolean; t: number; o: number; h: number; l: number; c: number; v: number }
const newAcc = (): Acc => ({ on: false, t: 0, o: 0, h: 0, l: 0, c: 0, v: 0 });

interface Store {
  id: string;
  name: string;
  kind: Kind;
  unit: Unit;
  seed: number;
  sess: boolean;
  m1: Ring;
  m5: Ring;
  h1: Ring;
  a5: Acc;
  ah: Acc;
  /** Close of the last bar. */
  last: number;
  /** The lagged settled price, the slow noise, and the tick counter last seen. */
  S: number;
  N: number;
  X: number;
  seq: number;
  /** The minute's own price for a closed exchange: nothing moves. */
  live: boolean;
}
interface Minutes { stores: Map<string, Store>; by: Store[]; seed: number; ready: boolean; px: Map<string, number>; sharePx: Map<string, number> }

const boxes = new WeakMap<World, Minutes>();
function box(w: World): Minutes {
  let b = boxes.get(w);
  if (!b) { b = { stores: new Map(), by: [], seed: fnv(w.seed), ready: false, px: new Map(), sharePx: new Map() }; boxes.set(w, b); }
  return b;
}

function make(b: Minutes, id: string, name: string, kind: Kind, unit: Unit): Store {
  const sess = sessionKind(kind);
  const meme = id.startsWith('coin:me:');
  const perDay = sess ? SESSION_MIN : MIN_PER_DAY;
  const per5 = sess ? Math.ceil(SESSION_MIN / 5) : 288;
  const per1h = sess ? 7 : 24;
  const s: Store = {
    id, name, kind, unit, seed: fnv(id), sess,
    m1: newRing(KEEP_DAYS * perDay),
    m5: newRing((meme ? KEEP_DAYS : KEEP_5M_DAYS) * per5),
    h1: newRing((meme ? 30 : KEEP_1H_DAYS) * per1h),
    a5: newAcc(), ah: newAcc(),
    last: 0, S: 0, N: 0, X: 0, seq: -1, live: false,
  };
  b.stores.set(id, s);
  b.by.push(s);
  return s;
}

// A memecoin trades at fractions of a cent, so its minute prices are not rounded to the cent.
const rnd = (s: Store, v: number): number => s.unit === 'cents' && !s.id.startsWith('coin:me:') ? Math.max(1, Math.round(v)) : v;

function fold(a: Acc, ring: Ring, size: number, sess: boolean, t: number, o: number, h: number, l: number, c: number, v: number): void {
  const day = Math.floor(t / MIN_PER_DAY), m = t - day * MIN_PER_DAY;
  const anchor = sess ? OPEN_MIN : 0;
  const start = day * MIN_PER_DAY + anchor + Math.floor((m - anchor) / size) * size;
  if (!a.on || a.t !== start) {
    if (a.on) ringPush(ring, a.t, a.o, a.h, a.l, a.c, a.v);
    a.on = true; a.t = start; a.o = o; a.h = h; a.l = l; a.c = c; a.v = v;
  } else {
    if (h > a.h) a.h = h;
    if (l < a.l) a.l = l;
    a.c = c;
    a.v += v;
  }
}

/** One finished minute bar goes into the minute tier and into the open five-minute and hourly bars. */
function feed(s: Store, t: number, o: number, h: number, l: number, c: number, v: number, keep1: boolean, keep5: boolean): void {
  if (keep1) ringPush(s.m1, t, o, h, l, c, v);
  if (keep5) fold(s.a5, s.m5, 5, s.sess, t, o, h, l, c, v);
  fold(s.ah, s.h1, 60, s.sess, t, o, h, l, c, v);
  s.last = c;
}

// ---- the year before day one: drawn from the daily bars ----

function sigmaDaily(w: World, id: string, kind: Kind, px: number): number {
  if (kind === 'coin') return id.startsWith('coin:me:') ? 0.06 : 0.03;
  if (kind === 'future') return 0.014;
  if (kind === 'bond') return 0.002;
  if (kind === 'fx') return 0.004;
  const out = w.ledger.issued.get(id) ?? 1_000_000;
  const capD = Math.max(1, px * out / 100);
  return 0.0065 + 0.0105 / (1 + capD / 2e7);
}

function backfill(w: World, b: Minutes, today: number): void {
  for (const ser of chartSeries(w)) {
    const s = b.stores.get(ser.id) ?? make(b, ser.id, ser.name, ser.kind, ser.unit);
    if (s.m1.n > 0 || s.h1.n > 0) continue;
    const flat = dailyFlat(w, ser.id);
    const sess = s.sess;
    for (let j = 0; j < flat.length; j += 7) {
      const d = flat[j];
      if (d >= today || d < today - KEEP_1H_DAYS) continue;
      if (sess && !tradingDay(d)) continue;
      const fine = d >= today - FINE_DAYS;
      drawDay(w, s, d, flat[j + 2], flat[j + 3], flat[j + 4], flat[j + 5], flat[j + 6], sess, fine ? 1 : 60, fine, d >= today - KEEP_DAYS);
    }
  }
}

/**
 * One day of bars that opens at o, touches h and l once each, and closes at c, with texture in between.
 * \`step\` is the length of each drawn bar in minutes: a minute for the recent days, an hour for the old ones.
 */
function drawDay(w: World, s: Store, day: number, o: number, h: number, l: number, c: number, vol: number, sess: boolean, step: number, keep5: boolean, keep1: boolean): void {
  const total = sess ? SESSION_MIN : MIN_PER_DAY;
  const K = Math.ceil(total / step);
  const start = sess ? OPEN_MIN : 0;
  const hi = Math.max(h, o, c), lo = Math.max(1e-9, Math.min(l, o, c));
  const sd = s.seed ^ fnv(w.seed);
  const k1 = Math.floor(K * (0.08 + 0.3 * unit01(sd, day, 1)));
  const k2 = Math.floor(K * (0.5 + 0.4 * unit01(sd, day, 2)));
  const hiFirst = unit01(sd, day, 3) < 0.5;
  const A = hiFirst ? hi : lo, B = hiFirst ? lo : hi;
  const sig = sigmaDaily(w, s.id, s.kind, c) * 0.067 * Math.sqrt(step);
  const knots: [number, number][] = [[0, o], [k1, A], [k2, B], [K - 1, c]];
  const shareVol = s.kind === 'share';
  let prev = o;
  let seg = 0;
  let noise = 0;
  for (let i = 0; i < K; i++) {
    while (seg < 2 && i > knots[seg + 1][0]) seg++;
    const [i0, p0] = knots[seg], [i1, p1] = knots[seg + 1];
    const f = i1 > i0 ? (i - i0) / (i1 - i0) : 1;
    const lin = Math.exp(Math.log(p0 > 0 ? p0 : 1e-9) * (1 - f) + Math.log(p1 > 0 ? p1 : 1e-9) * f);
    noise = Math.max(0, 1 - 0.025 * step) * noise + sig * normal(sd, day, i + 10);
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
      hh = Math.min(hi, hh * (1 + Math.abs(normal(sd, day, i + 5000)) * sig * 0.5));
      ll = Math.max(lo, ll * (1 - Math.abs(normal(sd, day, i + 9000)) * sig * 0.5));
    } else if (i === k1) { if (A === hi) hh = hi; else ll = lo; }
    else if (B === hi) hh = hi; else ll = lo;
    let v = 0;
    if (shareVol && vol > 0) {
      // The day's volume spread by the time of day, heavier on a big bar.
      const a = sess ? Math.min(SESSION_MIN, i * step) : 0, e = sess ? Math.min(SESSION_MIN, (i + 1) * step) : 0;
      const share = sess ? (CUM[e] - CUM[a]) / SESSION_MIN : step / MIN_PER_DAY;
      const big = Math.min(4, Math.abs(Math.log(cl / Math.max(1e-9, prev))) / Math.max(1e-9, sig));
      v = Math.round(vol * share * Math.exp(0.3 * normal(sd, day, i + 777) - 0.045) * (0.55 + 0.45 * big));
    }
    const t = day * MIN_PER_DAY + start + i * step;
    const bo = rnd(s, prev), bh = rnd(s, Math.max(hh, prev, cl)), bl = rnd(s, Math.min(ll, prev, cl));
    if (step === 1) feed(s, t, bo, bh, bl, cl, v, keep1, keep5);
    else feed(s, t, bo, bh, bl, cl, v, false, false);
    prev = cl;
  }
}

export function minutesInit(w: World, today: number): void {
  const b = box(w);
  if (b.ready) return;
  b.ready = true;
  setDayProvider((ww, id, day) => dayBar(ww, id, day));
  backfill(w, b, today);
  // Seed the live state from the last drawn close.
  eachPrice(w, (id, name, kind, unit, px) => {
    const s = b.stores.get(id) ?? make(b, id, name, kind, unit);
    if (s.last <= 0) s.last = px;
    s.S = px; s.X = px; s.N = 0;
    b.px.set(id, px);
  });
}

// ---- the live minute ----

/** How fast the minute price follows a newly settled price, and how fast the wandering forgets. */
const FOLLOW = 0.09;
const FORGET = 0.025;
/** Noise per minute, as a share of the instrument's daily size. The slow noise it builds is about a third of a day's size. */
const MINUTE_SIGMA = 0.055;
const FADE_MIN = 30;

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
  // The currencies: the dealers' quotes drift with the flow, every minute.
  fxStep(w, abs);
  eachPrice(w, (id, name, kind, unit, base) => {
    let s = b.stores.get(id);
    if (!s) { s = make(b, id, name, kind, unit); s.last = base; s.S = base; s.X = base; }
    s.name = name;
    const trading = sessionKind(kind) ? inSession : true;
    const coinTrade = kind === 'coin' ? coinMinute(w, id) : undefined;
    const i = m - OPEN_MIN;
    let px: number;
    const sigma = kind === 'share' ? flowSigma(w, id) : sigmaDaily(w, id, kind, base);
    let news = false;
    let out = 0;
    if (kind === 'index') {
      let cap = 0;
      for (const [sid, p] of shares) cap += p * (w.ledger.issued.get(sid) ?? 1_000_000);
      px = baseCap > 0 && shares.size > 0 ? 100 * cap / baseCap : base;
    } else if (kind === 'coin' && coinTrade) {
      px = coinTrade.px;
    } else if (kind === 'fx') {
      px = base;
    } else if (!trading) {
      px = s.X > 0 ? s.X : base;
    } else {
      // The settled price this minute follows: a share's last tick, a future's or a bond's mark.
      let T = base;
      let imp = 0;
      if (kind === 'share') {
        const p = pulseOf(w, id);
        if (p) { T = p.tgt; imp = p.imp; news = p.news; out = p.out; }
      }
      // A share's quote is centred on the minute price, so a player's order walks the book from where the chart is.
      const opening = m === OPEN_MIN || s.S <= 0;
      if (opening) { s.S = T; s.N = 0; }
      else s.S += FOLLOW * (T - s.S);
      const z = kind === 'share' ? 0.55 * common + 0.835 * normal(s.seed ^ b.seed, abs, 3) : normal(s.seed ^ b.seed, abs, 3);
      s.N = Math.max(-0.05, Math.min(0.05, (1 - FORGET) * s.N + sigma * MINUTE_SIGMA * z));
      if (m >= CLOSE_MIN - FADE_MIN) s.N *= (CLOSE_MIN - m) / (CLOSE_MIN - m + 1);
      let X = s.S * (1 + s.N);
      if (m === CLOSE_MIN) { X = T; s.S = T; s.N = 0; }
      s.X = X;
      px = kind === 'share' ? Math.max(1, Math.round(X)) : kind === 'index' ? X : rnd(s, X);
      if (kind === 'share') px = px * (1 + imp);
    }
    if (kind === 'share') shares.set(id, Math.max(1, Math.round(s.X > 0 ? s.X : base)));
    px = rnd(s, px);
    b.px.set(id, px);
    if (kind === 'share' && trading) setQuote(w, id, s.X);
    if (!trading) return;
    const o = s.last > 0 ? s.last : px;
    if (coinTrade) {
      // Real trades: the bar's extremes are the prices the pool or the ladder visited, its volume the coins that changed hands.
      feed(s, abs, o, rnd(s, Math.max(o, px, coinTrade.hi)), rnd(s, Math.min(o, px, coinTrade.lo)), px, coinTrade.vol, true, true);
      return;
    }
    // Wicks are the price visiting a little past where the minute started or ended. None at the open or the close: a session
    // starts at its first price and ends at its close, with no auction print.
    const edge = sessionKind(kind) && (m === OPEN_MIN || m === CLOSE_MIN);
    const sg = (kind === 'index' ? 0.0002 : sigma * MINUTE_SIGMA) * (edge ? 0 : 1);
    const wickUp = kind === 'index' ? sg : sg * 0.7 * Math.abs(normal(s.seed ^ b.seed, abs, 5));
    const wickDn = kind === 'index' ? sg : sg * 0.7 * Math.abs(normal(s.seed ^ b.seed, abs, 9));
    const open1 = sessionKind(kind) && m === OPEN_MIN ? px : o;
    const hh = rnd(s, Math.max(open1, px) * (1 + wickUp));
    const ll = rnd(s, Math.min(open1, px) * (1 - wickDn));
    let v = 0;
    if (kind === 'share' && out > 0) {
      // The session's volume by the minute: the time of day, news, and the size of the move itself.
      const move = Math.abs(Math.log(px / Math.max(1e-9, open1))) / Math.max(1e-9, sigma * MINUTE_SIGMA);
      const vDay = dayVolume(id, out, sigma * 0.9, news);
      const prof = i >= 0 && i < SESSION_MIN ? PROFILE[i] : 1;
      v = Math.max(1, Math.round(vDay / SESSION_MIN * prof * Math.exp(0.35 * normal(s.seed ^ b.seed, abs, 11) - 0.06) * (0.5 + 0.6 * Math.min(4, move))));
    }
    feed(s, abs, open1, Math.max(hh, open1, px), Math.min(ll, open1, px), px, v, true, true);
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
    feed(s, abs, o, o, floor, floor, 0, true, true);
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

// ---- reading history ----

/** The day as lived in minutes: open, extremes, close and volume. Null when the instrument did not trade that day. */
function dayBar(w: World, id: string, day: number): DayBar | null {
  const s = box(w).stores.get(id);
  if (!s) return null;
  const have = Math.min(s.m1.n, s.m1.cap);
  let o = 0, h = -Infinity, l = Infinity, c = 0, v = 0, seen = false;
  for (let k = 0; k < have; k++) {
    const i = (s.m1.n - 1 - k) % s.m1.cap;
    const d = Math.floor(s.m1.t[i] / MIN_PER_DAY);
    if (d < day) break;
    if (d > day) continue;
    if (!seen) { c = s.m1.c[i]; seen = true; }
    o = s.m1.o[i];
    if (s.m1.h[i] > h) h = s.m1.h[i];
    if (s.m1.l[i] < l) l = s.m1.l[i];
    v += s.m1.v[i];
  }
  return seen ? { o, h, l, c, v } : null;
}

export type MinuteTf = '5m' | '15m' | '30m' | '1h' | '4h' | '1m';
export const MINUTE_TFS: Record<MinuteTf, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };
export const ALL_TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'] as const;
export type AnyTf = typeof ALL_TFS[number];

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

function withOpen(bars: BarOut[], a: Acc): BarOut[] {
  if (a.on) bars.push({ t: a.t, k: 0, o: a.o, h: a.h, l: a.l, c: a.c, v: a.v });
  return bars;
}

export interface HistoryOut { id: string; name: string; kind: Kind; unit: Unit; tf: AnyTf; tt: 'min' | 'day'; since: number; session: boolean; bars: BarOut[] }

/** Bars for one instrument at a real timeframe. 1m to 4h come from the kept minutes, 1d, 1w and 1M from the daily history. */
export function historyFor(w: World, id: string, tf: AnyTf, limit: number, today: number): HistoryOut | null {
  const b = box(w);
  if (tf in MINUTE_TFS) {
    const s = b.stores.get(id);
    if (!s) return null;
    const tfMin = MINUTE_TFS[tf as MinuteTf];
    let bars: BarOut[];
    if (tfMin === 1) bars = ringTail(s.m1, limit);
    else if (tfMin === 5) bars = withOpen(ringTail(s.m5, limit), s.a5);
    else if (tfMin === 15 || tfMin === 30) bars = aggregate(withOpen(ringTail(s.m5, limit * (tfMin / 5) + 6), s.a5), tfMin, s.sess);
    else if (tfMin === 60) bars = withOpen(ringTail(s.h1, limit), s.ah);
    else bars = aggregate(withOpen(ringTail(s.h1, limit * 4 + 8), s.ah), tfMin, s.sess);
    if (bars.length > limit) bars = bars.slice(bars.length - limit);
    return { id, name: s.name, kind: s.kind, unit: s.unit, tf, tt: 'min', since: bars.length ? Math.floor(bars[0].t / MIN_PER_DAY) : today, session: s.sess, bars };
  }
  const base = tf === '1d' ? 'd' : tf === '1w' ? 'w' : 'm';
  const s = b.stores.get(id);
  // Today's open bar is the minutes lived so far.
  const lived = s ? dayBar(w, id, today) : null;
  const out = barsFor(w, id, base, 100000, lived);
  if (!out) return null;
  const sess = sessionKind(out.kind);
  let bars = out.bars;
  if (tf === '1d' && sess) bars = bars.filter((x) => tradingDay(x.t));
  if (bars.length > limit) bars = bars.slice(bars.length - limit);
  return { id, name: out.name, kind: out.kind, unit: out.unit, tf, tt: 'day', since: out.since, session: sess, bars };
}

/** The price of every instrument one session ago, for "change today" next to a live price. */
export function sessionKindOf(kind: Kind): boolean { return sessionKind(kind); }

export function minuteStats(w: World): { series: number; bars: number } {
  const b = box(w);
  let n = 0;
  for (const s of b.by) n += Math.min(s.m1.n, s.m1.cap) + Math.min(s.m5.n, s.m5.cap) + Math.min(s.h1.n, s.h1.cap);
  return { series: b.by.length, bars: n };
}
