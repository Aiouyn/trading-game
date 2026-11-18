// Chart history for every tradable price, kept for the terminal. It only reads other modules' state.
// Each tick samples the price; a tick bar is the move between two samples. A day folds the ticks into a daily bar.
// Memory is bounded: the last INTRA_DAYS days of tick bars and the last DAILY_KEEP daily bars per instrument.
// Weekly and monthly bars are folded from the dailies when asked for.
import { type Module, type World } from '../../kernel/index.ts';
import { DEP } from '../economy/index.ts';

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

function sampleAll(w: World, t: number): void {
    const st = state(w);
    const m = w.state.markets as { stocks?: { instr: string; issuer: string; last: number; vol: number }[] } | undefined;
    for (const k of m?.stocks ?? []) sample(st, w, t, k.instr, firmName(w, k.issuer), 'share', 'cents', k.last, k.vol);
    sample(st, w, t, 'index', 'Port Avalon index', 'index', 'pts', indexLevel(w), 0);
    const c = w.state.crypto as { majors?: { id: string; name: string; last: number }[]; memes?: { id: string; name: string; pool: string; rugged: boolean; live: boolean }[] } | undefined;
    for (const k of c?.majors ?? []) sample(st, w, t, k.id, k.name, 'coin', 'cents', k.last, 0);
    for (const k of c?.memes ?? []) {
      if (!k.live || k.rugged) continue;
      const tok = w.ledger.balance(k.pool, k.id);
      if (!(tok > 0)) continue;
      sample(st, w, t, k.id, k.name, 'coin', 'cents', w.ledger.balance(k.pool, DEP) / tok, 0);
    }
    const f = w.state.commodities as { books?: { good: string; name: string; tenors: { px: number }[] }[] } | undefined;
    for (const b of f?.books ?? []) if (b.tenors[0]) sample(st, w, t, 'fut:' + b.good, b.name, 'future', 'cents', b.tenors[0].px, 0);
    const bd = w.state.bonds as { bonds?: { tenor: string; onRun: boolean; faceLeft: number; last: number }[] } | undefined;
    for (const tenor of ['3m', '2y', '10y', '30y']) {
      const on = bd?.bonds?.find((b) => b.onRun && b.faceLeft > 0 && b.tenor === tenor);
      if (on) sample(st, w, t, 'bond:' + tenor, 'Treasury ' + tenor, 'bond', 'cents', on.last, 0);
    }
    const ab = w.state.abroad as { mid?: number; cfg?: { currency?: string; name?: string } } | undefined;
    if (ab?.mid) sample(st, w, t, 'fx', (ab.cfg?.currency ?? 'Foreign') + ' per dollar', 'fx', 'rate', ab.mid, 0);
}

export const bars: Module = {
  id: 'bars',

  init(w) {
    w.state.bars = { series: [], by: {} } as BarsState;
    sampleAll(w, 0);
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
      const own = hist.get(s.id);
      if (own) s.d.push(w.day, 0, own.o, Math.max(own.h, own.o, own.c), Math.min(own.l, own.o, own.c), own.c, own.v);
      else s.d.push(w.day, 0, a[0], a[1], a[2], a[3], a[4]);
      if (s.d.length > (DAILY_KEEP + 90) * W) s.d.splice(0, s.d.length - DAILY_KEEP * W);
      a[5] = 0; a[4] = 0;
      s.vol = 0;
      s.last = own ? own.c : a[3];
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
export function barsFor(w: World, id: string, tf: Tf, limit: number): { id: string; name: string; kind: Kind; unit: Unit; tf: Tf; ticks: number; since: number; bars: BarOut[] } | null {
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
    if (s.a[5] > 0) flat.push(w.day, 0, s.a[0], s.a[1], s.a[2], s.a[3], s.a[4]);
    out = tf === 'd' ? fold(flat, (d) => d) : tf === 'w' ? fold(flat, (d) => Math.floor(d / 7)) : fold(flat, (d) => Math.floor(d / 30));
  }
  if (out.length > limit) out = out.slice(out.length - limit);
  return { id: s.id, name: s.name, kind: s.kind, unit: s.unit, tf, ticks: w.ticksPerDay, since: s.since, bars: out };
}

export interface ListRow { id: string; name: string; kind: Kind; unit: Unit; px: number; prev: number; chg: number; since: number; live: boolean }

/** Every charted instrument with its price and the move since the previous close. */
export function listBars(w: World): ListRow[] {
  const st = state(w);
  const rows: ListRow[] = [];
  for (const s of st.series) {
    const n = s.d.length;
    const prev = n >= W ? s.d[n - 2] : s.last;
    rows.push({ id: s.id, name: s.name, kind: s.kind, unit: s.unit, px: s.last, prev, chg: prev > 0 ? s.last / prev - 1 : 0, since: s.since, live: s.seen >= w.day - 1 });
  }
  return rows;
}
