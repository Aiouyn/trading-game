// Chart history for every tradable price, kept for the terminal. It only reads other modules' state.
// Each tick samples the price; a tick bar is the move between two samples. A day folds the ticks into a daily bar.
// Memory is bounded: the last INTRA_DAYS days of tick bars and the last DAILY_KEEP daily bars per instrument.
// Weekly and monthly bars are folded from the dailies when asked for.
import { type Module, type World } from '../../kernel/index.ts';
import { DEP } from '../economy/index.ts';
import { LOT } from '../bonds/index.ts';
import { fxPairs } from '../abroad/index.ts';
import { futureUnit } from '../commodities/index.ts';
import { dayVolume, tradingDay } from './noise.ts';

export type Unit = 'cents' | 'pts' | 'rate';
export type Kind = 'share' | 'index' | 'coin' | 'future' | 'bond' | 'fx';
export type Tf = 'i' | 'd' | 'w' | 'm';

/** Bars are flat: [day, tick, o, h, l, c, v] per bar, so a series is a few plain arrays the snapshot already saves. */
const W = 7;
const INTRA_DAYS = 20;
const DAILY_KEEP = 1800;

interface Series {
  id: string;
  name: string;
  kind: Kind;
  unit: Unit;
  since: number;
  seen: number;
  d: number[];
  i: number[];
  /** Day accumulator: open, high, low, close, volume, samples. */
  a: number[];
  last: number;
  vol: number;
}

interface BarsState { series: Series[]; by: Record<string, number> }

const state = (w: World): BarsState => (w.state.bars ??= { series: [], by: {} }) as BarsState;

function make(st: BarsState, w: World, id: string, name: string, kind: Kind, unit: Unit): Series {
  const s: Series = { id, name, kind, unit, since: w.day, seen: w.day, d: [], i: [], a: [0, 0, 0, 0, 0, 0], last: 0, vol: 0 };
  st.by[id] = st.series.length;
  st.series.push(s);
  return s;
}

function sample(st: BarsState, w: World, t: number, id: string, name: string, kind: Kind, unit: Unit, px: number, cumVol: number): void {
  if (!(px > 0) || !Number.isFinite(px)) return;
  const at = st.by[id];
  const s = at === undefined ? make(st, w, id, name, kind, unit) : st.series[at];
  const open = s.last > 0 ? s.last : px;
  const v = cumVol >= s.vol ? cumVol - s.vol : cumVol;
  s.i.push(w.day, t, open, Math.max(open, px), Math.min(open, px), px, v);
  const keep = INTRA_DAYS * w.ticksPerDay * W;
  if (s.i.length > keep + 64 * W) s.i.splice(0, s.i.length - keep);
  const a = s.a;
  if (a[5] === 0) { a[0] = open; a[1] = Math.max(open, px); a[2] = Math.min(open, px); }
  if (px > a[1]) a[1] = px;
  if (px < a[2]) a[2] = px;
  a[3] = px;
  a[4] += v;
  a[5]++;
  s.last = px;
  s.vol = cumVol;
  s.seen = w.day;
}

function indexLevel(w: World): number {
  const m = w.state.markets as { stocks?: { instr: string; last: number }[]; baseCap?: number } | undefined;
  if (!m?.stocks?.length) return 0;
  let now = 0;
  for (const st of m.stocks) now += st.last * (w.ledger.issued.get(st.instr) ?? 1_000_000);
  return 100 * now / (m.baseCap || 1);
}

function firmName(w: World, issuer: string): string {
  if (issuer === 'bank_1') return 'The bank';
  const firms = (w.state.economy as { firms?: { id: string; name: string }[] } | undefined)?.firms ?? [];
  return firms.find((f) => f.id === issuer)?.name ?? issuer;
}

function symbol(instr: string): string {
  if (instr === 'eq:bank_1') return 'BANK';
  if (instr.startsWith('eq:frm_')) return instr.slice(7).toUpperCase();
  return instr;
}

export function seriesSymbol(id: string, name: string): string {
  if (id.startsWith('eq:')) return symbol(id);
  return name;
}

/** Every tradable price right now, in the order the series were first seen. Used by the tick sampler and by the minute layer. */
export function eachPrice(w: World, cb: (id: string, name: string, kind: Kind, unit: Unit, px: number, cumVol: number) => void): void {
  const m = w.state.markets as { stocks?: { instr: string; issuer: string; last: number; vol: number; imp?: number }[] } | undefined;
  for (const k of m?.stocks ?? []) cb(k.instr, firmName(w, k.issuer), 'share', 'cents', Math.max(1, Math.round(k.last * (1 + (k.imp ?? 0)))), k.vol);
  cb('index', 'Port Avalon index', 'index', 'pts', indexLevel(w), 0);
  const c = w.state.crypto as { majors?: { id: string; name: string; last: number }[]; memes?: { id: string; name: string; pool: string; rugged: boolean; live: boolean }[] } | undefined;
  for (const k of c?.majors ?? []) cb(k.id, k.name, 'coin', 'cents', k.last, 0);
  for (const k of c?.memes ?? []) {
    if (!k.live || k.rugged) continue;
    const tok = w.ledger.balance(k.pool, k.id);
    if (!(tok > 0)) continue;
    cb(k.id, k.name, 'coin', 'cents', w.ledger.balance(k.pool, DEP) / tok, 0);
  }
  const f = w.state.commodities as { books?: { good: string; name: string; tenors: { px: number }[] }[] } | undefined;
  for (const b of f?.books ?? []) if (b.tenors[0]) cb('fut:' + b.good, b.name.charAt(0).toUpperCase() + b.name.slice(1) + ', per ' + futureUnit(b.good), 'future', 'cents', b.tenors[0].px, 0);
  // A Treasury is quoted the way the market quotes it: a price per 100 of face, and the yield it pays.
  const bd = w.state.bonds as { bonds?: { tenor: string; onRun: boolean; faceLeft: number; last: number }[]; y?: Record<string, number> } | undefined;
  for (const tenor of ['3m', '2y', '5y', '10y', '30y']) {
    const on = bd?.bonds?.find((b) => b.onRun && b.faceLeft > 0 && b.tenor === tenor);
    if (!on) continue;
    const y = bd?.y?.[tenor];
    const label = tenor === '3m' ? 'Treasury bill 3m' : 'Treasury ' + tenor;
    cb('bond:' + tenor, y !== undefined ? `${label}, per 100, yield ${(y * 100).toFixed(2)}%` : `${label}, per 100`, 'bond', 'pts', on.last * 100 / LOT, 0);
  }
  for (const p of fxPairs(w)) cb(p.id, p.name, 'fx', 'rate', p.q, 0);
}

function sampleAll(w: World, t: number): void {
  const st = state(w);
  eachPrice(w, (id, name, kind, unit, px, cum) => sample(st, w, t, id, name, kind, unit, px, cum));
}

/** The live server's minute layer says what a finished day really was, so the daily bar is the minutes it was lived in. */
export type DayBar = { o: number; h: number; l: number; c: number; v: number };
let dayProvider: ((w: World, id: string, day: number) => DayBar | null) | undefined;
export function setDayProvider(fn: (w: World, id: string, day: number) => DayBar | null): void { dayProvider = fn; }

/** The charted series (id, name, kind, unit, last true price), for the minute layer. */
export function chartSeries(w: World): { id: string; name: string; kind: Kind; unit: Unit; last: number }[] {
  return state(w).series.map((s) => ({ id: s.id, name: s.name, kind: s.kind, unit: s.unit, last: s.last }));
}

/** Daily bars of one series, flat [day, tick, o, h, l, c, v], oldest first, for backfilling minutes. */
export function dailyFlat(w: World, id: string): number[] {
  const st = state(w);
  const at = st.by[id];
  return at === undefined ? [] : st.series[at].d;
}

// ---- the year before day one ----
// A chart opens with a past. Each series gets a deterministic year of daily bars that ends at its opening price,
// drawn from the same kind of process the price model follows: a slow pull back toward the level the market sits
// at, shocks sized by what the instrument is, and for shares one common market factor, so the index has a year too.
export const PREROLL_DAYS = 360;

function sigmaOf(w: World, s: Series): number {
  if (s.kind === 'coin') return 0.03;
  if (s.kind === 'future') return 0.014;
  if (s.kind === 'bond') return 0.002;
  if (s.kind === 'fx') return 0.003;
  const out = w.ledger.issued.get(s.id) ?? 1_000_000;
  const capD = Math.max(1, s.last * out / 100);
  return 0.006 + 0.011 / (1 + capD / 2e7);
}

function preRoll(w: World, st: BarsState): void {
  const N = PREROLL_DAYS;
  const mrng = w.rng('bars:pre:market');
  // The market factor, backward from the open: slow, with a daily shock of about half a percent.
  const mkt: number[] = new Array(N);
  let mx = 0;
  for (let t = N - 1; t >= 0; t--) { mx = Math.max(-0.4, Math.min(0.4, mx * 0.995 + 0.005 * mrng.normal())); mkt[t] = mx; }
  const closes = new Map<string, number[]>();
  for (const s of st.series) {
    if (s.kind === 'index' || !(s.last > 0)) continue;
    const rng = w.rng('bars:pre:' + s.id);
    const sig = sigmaOf(w, s);
    const beta = s.kind === 'share' ? 1 : s.kind === 'coin' ? 0.6 : 0;
    const px0 = s.last;
    const c: number[] = new Array(N);
    let x = 0;
    // An exchange name does not move on a weekend or a holiday, so the last session before day one closes at the opening price.
    const sessionOnly = s.kind === 'share' || s.kind === 'future' || s.kind === 'bond';
    let lastSession = true;
    for (let t = N - 1; t >= 0; t--) {
      if (sessionOnly && !tradingDay(t - N)) { c[t] = NaN; continue; }
      if (lastSession) { c[t] = px0; lastSession = false; continue; }
      x = Math.max(-0.45, Math.min(0.45, x * 0.97 + sig * rng.normal()));
      c[t] = px0 * Math.exp(x + beta * mkt[t]);
    }
    // A shut day closes where the last session closed.
    for (let t = 0; t < N; t++) if (Number.isNaN(c[t])) { let k = t; while (k < N && Number.isNaN(c[k])) k++; c[t] = t > 0 ? c[t - 1] : c[Math.min(k, N - 1)]; }
    const whole = s.unit === 'cents';
    const round = (v: number): number => whole ? Math.max(1, Math.round(v)) : v;
    const out = w.ledger.issued.get(s.id) ?? 0;
    const flat: number[] = [];
    let prev = c[0] * Math.exp(-sig * rng.normal());
    for (let t = 0; t < N; t++) {
      const o = round(prev), cl = round(c[t]);
      const shut = sessionOnly && !tradingDay(t - N);
      const hi = shut ? Math.max(o, cl) : round(Math.max(o, cl) * (1 + Math.abs(rng.normal()) * sig * 0.5));
      const lo = shut ? Math.min(o, cl) : Math.max(whole ? 1 : 0, round(Math.min(o, cl) * (1 - Math.abs(rng.normal()) * sig * 0.5)));
      const vol = s.kind === 'share' && !shut ? dayVolume(s.id, out, cl / Math.max(1e-9, o) - 1, false) : 0;
      flat.push(t - N, 0, o, Math.max(hi, o, cl), Math.min(lo, o, cl), cl, vol);
      prev = c[t];
    }
    s.d = flat.concat(s.d);
    s.since = -N;
    if (s.kind === 'share') closes.set(s.id, c);
  }
  // The index is the same names, so its year is theirs.
  const ix = st.series[st.by['index']];
  const m = w.state.markets as { baseCap?: number } | undefined;
  if (ix && closes.size && m?.baseCap) {
    const flat: number[] = [];
    let prev = 100;
    for (let t = 0; t < N; t++) {
      let cap = 0;
      for (const [id, c] of closes) cap += c[t] * (w.ledger.issued.get(id) ?? 1_000_000);
      const cl = 100 * cap / m.baseCap;
      const hi = Math.max(prev, cl) * 1.002, lo = Math.min(prev, cl) * 0.998;
      flat.push(t - N, 0, prev, hi, lo, cl, 0);
      prev = cl;
    }
    ix.d = flat.concat(ix.d);
    ix.since = -N;
  }
}

export const bars: Module = {
  id: 'bars',

  init(w) {
    w.state.bars = { series: [], by: {} } as BarsState;
    sampleAll(w, 0);
    preRoll(w, w.state.bars as BarsState);
  },

  tick(w, t) { sampleAll(w, t); },

  dayClose(w) {
    const st = state(w);
    const m = w.state.markets as { stocks?: { instr: string; hist: { length: number; [i: number]: { o: number; h: number; l: number; c: number; v: number } } }[] } | undefined;
    const hist = new Map<string, { o: number; h: number; l: number; c: number; v: number }>();
    for (const k of m?.stocks ?? []) if (k.hist.length) hist.set(k.instr, k.hist[k.hist.length - 1]);
    for (const s of st.series) {
      const a = s.a;
      if (a[5] === 0) continue;
      const lived = dayProvider ? dayProvider(w, s.id, w.day) : null;
      const own = lived ? undefined : hist.get(s.id);
      if (lived) s.d.push(w.day, 0, lived.o, lived.h, lived.l, lived.c, lived.v);
      else if (own) s.d.push(w.day, 0, own.o, Math.max(own.h, own.o, own.c), Math.min(own.l, own.o, own.c), own.c, own.v);
      else s.d.push(w.day, 0, a[0], a[1], a[2], a[3], a[4]);
      if (s.d.length > (DAILY_KEEP + 90) * W) s.d.splice(0, s.d.length - DAILY_KEEP * W);
      a[5] = 0; a[4] = 0;
      s.vol = 0;
      s.last = lived ? lived.c : own ? own.c : a[3];
    }
  },

  stats(w) {
    const st = state(w);
    let n = 0;
    for (const s of st.series) n += s.d.length + s.i.length;
    return { chartSeries: st.series.length, chartBars: Math.round(n / W) };
  },
};

export interface BarOut { t: number; k: number; o: number; h: number; l: number; c: number; v: number }

function fold(flat: number[], key: (day: number) => number): BarOut[] {
  const out: BarOut[] = [];
  let cur = -1;
  for (let j = 0; j < flat.length; j += W) {
    const day = flat[j];
    const g = key(day);
    if (g !== cur || !out.length) {
      out.push({ t: day, k: 0, o: flat[j + 2], h: flat[j + 3], l: flat[j + 4], c: flat[j + 5], v: flat[j + 6] });
      cur = g;
    } else {
      const b = out[out.length - 1];
      b.t = day;
      if (flat[j + 3] > b.h) b.h = flat[j + 3];
      if (flat[j + 4] < b.l) b.l = flat[j + 4];
      b.c = flat[j + 5];
      b.v += flat[j + 6];
    }
  }
  return out;
}

/** OHLCV bars for one instrument, oldest first, the open (partial) bar last. */
export function barsFor(w: World, id: string, tf: Tf, limit: number, today?: DayBar | null): { id: string; name: string; kind: Kind; unit: Unit; tf: Tf; ticks: number; since: number; bars: BarOut[] } | null {
  const st = state(w);
  const at = st.by[id];
  if (at === undefined) return null;
  const s = st.series[at];
  let out: BarOut[];
  if (tf === 'i') {
    out = [];
    for (let j = 0; j < s.i.length; j += W) out.push({ t: s.i[j], k: s.i[j + 1], o: s.i[j + 2], h: s.i[j + 3], l: s.i[j + 4], c: s.i[j + 5], v: s.i[j + 6] });
  } else {
    const flat = s.d.slice();
    if (today) flat.push(w.day, 0, today.o, today.h, today.l, today.c, today.v);
    else if (s.a[5] > 0) flat.push(w.day, 0, s.a[0], s.a[1], s.a[2], s.a[3], s.a[4]);
    out = tf === 'd' ? fold(flat, (d) => d) : tf === 'w' ? fold(flat, (d) => Math.floor(d / 7)) : fold(flat, (d) => Math.floor(d / 30));
  }
  if (out.length > limit) out = out.slice(out.length - limit);
  return { id: s.id, name: s.name, kind: s.kind, unit: s.unit, tf, ticks: w.ticksPerDay, since: s.since, bars: out };
}

export interface ListRow { id: string; name: string; kind: Kind; unit: Unit; px: number; prev: number; chg: number; since: number; live: boolean }

const sessionOnly = (k: Kind): boolean => k === 'share' || k === 'index' || k === 'future' || k === 'bond';

/**
 * Every charted instrument with its price and the move since the previous close.
 * `started`: today's exchange session has begun. Until it does, an exchange price is still last session's close, and its
 * move is that session's move, so the figure does not fall to nothing at midnight.
 */
export function listBars(w: World, started = true): ListRow[] {
  const st = state(w);
  const rows: ListRow[] = [];
  for (const s of st.series) {
    // The last finished session's close, and the one before it.
    let j = s.d.length - W;
    let skip = sessionOnly(s.kind) && !started ? 1 : 0;
    while (j >= 0) {
      if (!sessionOnly(s.kind) || tradingDay(s.d[j])) { if (skip === 0) break; skip--; }
      j -= W;
    }
    const prev = j >= 0 ? s.d[j + 5] : s.last;
    rows.push({ id: s.id, name: s.name, kind: s.kind, unit: s.unit, px: s.last, prev, chg: prev > 0 ? s.last / prev - 1 : 0, since: s.since, live: s.seen >= w.day - 1 });
  }
  return rows;
}
