// The trading terminal's data: bars and the market list from the sim's /history route, drawings saved per instrument,
// and the two indicators movingAverages.ts does not have. Every price comes from the sim; nothing here invents one.
//
// Timeframes are the first version's eleven (7122f67b): 1m 3m 5m 15m 30m 1h 2h 4h cut from the sim's one-minute bars on the
// session clock, and 1D 1W 1M from its daily bars. A bar's time is game seconds since day 0 (a game day is 86,400 s), so the
// chart library's own spacing holds and a drawing's time is in game days.

import { calDate, MONTHS_SHORT, shortDate } from "@/shell/calendar";
export type Tf = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1D" | "1W" | "1M";
export type Kind = "share" | "index" | "coin" | "future" | "bond" | "fx";
export type Unit = "cents" | "pts" | "rate";

/** ts: game seconds since day 0. */
/** Where a bar came from (order 131): traded is a real fill, indicative a mark with no print, backfilled the year drawn before day one. */
export type BarSrc = "traded" | "indicative" | "backfilled";
/** Where its volume came from: real fills, an estimate, or none. */
export type VolSrc = "real" | "estimated" | "none";
export interface Bar { ts: number; o: number; h: number; l: number; c: number; v: number; src?: BarSrc; vsrc?: VolSrc }
export interface Series { id: string; name: string; kind: Kind; unit: Unit; tf: Tf; session: boolean; since: number; day: number; bars: Bar[] }
export interface ListRow { id: string; name: string; kind: Kind; unit: Unit; px: number; prev: number; chg: number; since: number; live: boolean }
export interface MarketList { day: number; ticks: number; rows: ListRow[] }

/** minutes: game minutes per candle for the intraday sizes, 0 for the daily ones. */
export const TFS: { id: Tf; label: string; minutes: number }[] = [
  { id: "1m", label: "1m", minutes: 1 }, { id: "3m", label: "3m", minutes: 3 }, { id: "5m", label: "5m", minutes: 5 },
  { id: "15m", label: "15m", minutes: 15 }, { id: "30m", label: "30m", minutes: 30 }, { id: "1h", label: "1h", minutes: 60 },
  { id: "2h", label: "2h", minutes: 120 }, { id: "4h", label: "4h", minutes: 240 },
  { id: "1D", label: "1D", minutes: 0 }, { id: "1W", label: "1W", minutes: 0 }, { id: "1M", label: "1M", minutes: 0 },
];
export const isTf = (v: unknown): v is Tf => TFS.some((t) => t.id === v);
export const tfMinutes = (tf: Tf): number => TFS.find((t) => t.id === tf)?.minutes ?? 0;
export const isIntraday = (tf: Tf): boolean => tfMinutes(tf) > 0;

/** Range presets move the visible window only: game days back from the newest candle. */
export type RangeId = "1D" | "1W" | "1M" | "1Y" | "ALL";
export const RANGES: { id: RangeId; days: number }[] = [
  { id: "1D", days: 1 }, { id: "1W", days: 7 }, { id: "1M", days: 30 }, { id: "1Y", days: 360 }, { id: "ALL", days: 0 },
];
export const MIN_VIEW_CANDLES = 20;

export const DAY_S = 86400;
export const OPEN_MIN = 570;

/** Real seconds one candle takes at x1, where one real hour is one game day. */
export function candleRealSeconds(tf: Tf): number {
  const m = tfMinutes(tf);
  return (m > 0 ? m : tf === "1D" ? 1440 : tf === "1W" ? 7 * 1440 : 30 * 1440) * 2.5;
}
export function realText(sec: number): string {
  if (sec < 60) return `${+sec.toFixed(1)} s`;
  if (sec < 3600) return `${+(sec / 60).toFixed(1)} min`;
  if (sec < 86400) return `${+(sec / 3600).toFixed(1)} h`;
  return `${+(sec / 86400).toFixed(1)} days`;
}

/** A price in the sim's unit as the number the player reads: cents to dollars, points and rates as they are. */
export function shown(unit: Unit, v: number): number {
  return unit === "cents" ? v / 100 : v;
}

export function priceText(unit: Unit, v: number): string {
  const x = shown(unit, v);
  if (unit === "rate") return x.toFixed(4);
  if (Math.abs(x) >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (Math.abs(x) >= 1) return x.toFixed(2);
  if (Math.abs(x) >= 0.01) return x.toFixed(4);
  return x.toFixed(6);
}

/** A number on an axis or in a legend: the decimals follow the span the axis shows (a 0.1 span gets two, a 40 span none past the
 *  floor), the thousands are grouped, and a value that rounds to nothing is never "-0.00". */
export function axisText(v: number, span: number, floor = 0): string {
  if (!Number.isFinite(v)) return "";
  const raw = Number.isFinite(span) && span > 0 ? span / 6 : 0;
  const d = Math.min(8, Math.max(floor, raw > 0 ? -Math.floor(Math.log10(raw)) : floor));
  const s = Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : v.toFixed(d);
  return /^-[0.,]*$/.test(s) ? s.slice(1) : s;
}

/** The smallest price step a series of this size can show: coins at a fraction of a cent need a finer step than shares. */
export function minMoveFor(lowest: number): number {
  if (!(lowest > 0)) return 0.01;
  return Math.min(0.01, 10 ** (Math.floor(Math.log10(lowest)) - 1));
}

/** A value shown with four significant figures, for indicators whose size is not known in advance. */
export function sigText(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  const s = a === 0 ? "0" : a >= 100 ? v.toFixed(2) : v.toPrecision(4);
  return /^-0(.0*)?$/.test(s) ? s.slice(1) : s;
}

export function volText(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

/** "Tue 2 Jan" for a game day, on the one calendar (src/shell/calendar.ts). */
export function dayLabel(day: number): string {
  return shortDate(day);
}
export const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** The crosshair's time: the day for the daily sizes, the day and the clock for the intraday ones. */
export function stampLabel(ts: number, intraday: boolean): string {
  const min = Math.floor(ts / 60);
  const day = Math.floor(min / 1440);
  return intraday ? `${dayLabel(day)} ${hhmm(min - day * 1440)}` : dayLabel(day);
}

/** The axis label: the clock inside a day, the date on a day's first candle; on the daily sizes the day, the month or the year. */
export function axisLabel(ts: number, tf: Tf, session: boolean): string {
  const min = Math.floor(ts / 60);
  const day = Math.floor(min / 1440);
  const m = min - day * 1440;
  const cal = calDate(day);
  if (isIntraday(tf)) {
    const first = tfMinutes(tf) > 0 && m < (session ? OPEN_MIN : 0) + tfMinutes(tf);
    return first ? dayLabel(day).slice(4) : hhmm(m);
  }
  if (cal.doy === 0) return day >= 0 ? `Year ${cal.year}` : "Jan";
  return cal.day === 1 ? MONTHS_SHORT[cal.month - 1] : `${cal.day} ${MONTHS_SHORT[cal.month - 1]}`;
}

// ---- fetching and cutting ----

interface Wire { live?: number | null; id: string; name: string; kind: Kind; unit: Unit; tf: string; tt?: "min" | "day"; session?: boolean; since: number; day: number; now?: number; bars: { t: number; k?: number; o: number; h: number; l: number; c: number; v: number; barSource?: BarSrc; volSource?: VolSrc }[] }

/** live: the sim's live price for the instrument when these bars were read, in the sim's own unit. */
export interface Raw { meta: Omit<Series, "bars" | "tf">; bars: Bar[]; now: number; live: number | null }

/** The sim's own sizes: minute bars to four-hour bars (t in game minutes) and daily to monthly bars (t is the day). */
export type ApiTf = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1M";

/** Which of the sim's sizes a candle size is read from, and how many of its minutes to cut it to (0: as it comes).
 *  3m comes from the minutes and 2h from the hours, which the sim does not keep as sizes of their own. */
export function sourceOf(tf: Tf): { api: ApiTf; cutBy: number } {
  switch (tf) {
    case "1m": return { api: "1m", cutBy: 0 };
    case "3m": return { api: "1m", cutBy: 3 };
    case "5m": case "15m": case "30m": case "1h": case "4h": return { api: tf, cutBy: 0 };
    case "2h": return { api: "1h", cutBy: 120 };
    case "1D": return { api: "1d", cutBy: 0 };
    case "1W": return { api: "1w", cutBy: 0 };
    case "1M": return { api: "1M", cutBy: 0 };
  }
}

/** Bars at one of the sim's sizes. */
export async function fetchRaw(instr: string, api: ApiTf, limit: number): Promise<Raw | null> {
  try {
    const res = await fetch(`/api/sim/history?instr=${encodeURIComponent(instr)}&tf=${api}&limit=${limit}`, { cache: "no-store" });
    if (!res.ok) return null;
    const w = await res.json() as Wire;
    if (!Array.isArray(w.bars)) return null;
    const mul = w.tt === "min" ? 60 : DAY_S;
    void api;
    return {
      meta: { id: w.id, name: w.name, kind: w.kind, unit: w.unit, session: !!w.session, since: w.since, day: w.day },
      bars: w.bars.map((b) => ({ ts: b.t * mul, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, src: b.barSource, vsrc: b.volSource })),
      now: typeof w.now === "number" ? w.now : w.day * 1440,
      live: typeof w.live === "number" && w.live > 0 ? w.live : null,
    };
  } catch { return null; }
}

/** A candle cut from several bars is traded when any of them traded, else backfilled when any was, else indicative. */
function joinSrc(a: BarSrc | undefined, b: BarSrc | undefined): BarSrc | undefined {
  if (!a || !b) return a ?? b;
  if (a === "traded" || b === "traded") return "traded";
  if (a === "backfilled" || b === "backfilled") return "backfilled";
  return "indicative";
}
function joinVsrc(a: VolSrc | undefined, b: VolSrc | undefined): VolSrc | undefined {
  if (!a || !b) return a ?? b;
  if (a === "real" || b === "real") return "real";
  if (a === "estimated" || b === "estimated") return "estimated";
  return "none";
}

/** What a bar's source means, in words for a tooltip. */
export function srcWords(b: Pick<Bar, "src" | "vsrc" | "v">): { bar: string; vol: string } {
  const bar = b.src === "traded" ? "Traded: built from real fills"
    : b.src === "backfilled" ? "Backfilled: drawn from history before day one, not from fills"
    : b.src === "indicative" ? "Indicative: the official mark, no trade printed" : "Source not stated";
  const vol = b.vsrc === "real" ? "real fills" : b.vsrc === "estimated" ? "estimated, not a tape" : b.v > 0 ? "source not stated" : "none printed";
  return { bar, vol };
}

/** The coverage of one candle in words: its size and the span of game time it spans. */
export function coverText(ts: number, tf: Tf, session: boolean): string {
  const min = Math.floor(ts / 60);
  const day = Math.floor(min / 1440);
  const m = tfMinutes(tf);
  if (m > 0) {
    const from = min - day * 1440;
    const to = Math.min(session ? 960 : 1440, from + m);
    return `${dayLabel(day)} ${hhmm(from)} to ${hhmm(to)}`;
  }
  if (tf === "1D") return `${dayLabel(day)}, one session`;
  if (tf === "1W") return `the week from ${dayLabel(day)}`;
  const c = calDate(day);
  return `the month from ${dayLabel(day)}, year ${c.year}`;
}

/** Cut one-minute bars into candles of `minutes`, on the session clock from 09:30 for shares and from midnight for coins. */
export function cut(raw: readonly Bar[], minutes: number, session: boolean): Bar[] {
  if (minutes <= 1) return raw.slice();
  const out: Bar[] = [];
  const anchor = session ? OPEN_MIN : 0;
  let key = NaN;
  for (const b of raw) {
    const min = Math.floor(b.ts / 60);
    const day = Math.floor(min / 1440);
    const slot = Math.floor((min - day * 1440 - anchor) / minutes);
    const k = day * 100000 + slot;
    const cur = out[out.length - 1];
    if (cur && k === key) {
      if (b.h > cur.h) cur.h = b.h;
      if (b.l < cur.l) cur.l = b.l;
      cur.c = b.c;
      cur.v += b.v;
      cur.src = joinSrc(cur.src, b.src);
      cur.vsrc = joinVsrc(cur.vsrc, b.vsrc);
    } else {
      out.push({ ts: (day * 1440 + anchor + slot * minutes) * 60, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, src: b.src, vsrc: b.vsrc });
      key = k;
    }
  }
  return out;
}

/** Replace the newest bars with fresher ones: bars at or after the first fresh one are dropped and the fresh ones follow. */
export function merge(old: readonly Bar[], fresh: readonly Bar[], keep: number): Bar[] {
  if (!fresh.length) return old.slice();
  const f0 = fresh[0]!.ts;
  let i = old.length;
  while (i > 0 && old[i - 1]!.ts >= f0) i--;
  const out = old.slice(0, i).concat(fresh);
  return out.length > keep ? out.slice(out.length - keep) : out;
}

export async function fetchList(): Promise<MarketList | null> {
  try {
    const res = await fetch("/api/sim/history?list=1", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as MarketList;
  } catch { return null; }
}

/** A story that touched this instrument, at the game minute it reached the reader: abs is game minutes since day 0. */
export interface NewsFlag { abs: number; day: number; kind: string; text: string; eventId: number }

export async function fetchFlags(instr: string): Promise<NewsFlag[]> {
  try {
    const res = await fetch(`/api/sim/newsflags?instr=${encodeURIComponent(instr)}`, { cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json() as { flags?: NewsFlag[] };
    return Array.isArray(j.flags) ? j.flags : [];
  } catch { return []; }
}

/** The instrument id the sim charts for a broker context (a ticker, a coin id, a future, a bond). */
export function instrOf(context: string | undefined): string {
  if (!context) return "index";
  if (/^(eq:|coin:|fut:|bond:|fx:)/.test(context) || context === "index" || context === "fx") return context;
  if (context === "BANK") return "eq:bank_1";
  return "eq:frm_" + context.toLowerCase();
}

// ---- drawings, saved per instrument in this browser ----

export type Tool = "cursor" | "trend" | "hline" | "ray" | "rect" | "fib" | "note";
/** t is game days (a float): a drawing keeps its place in time across every timeframe. */
export interface Pt { t: number; p: number }
export interface Drawing { id: string; kind: Exclude<Tool, "cursor">; a: Pt; b?: Pt; text?: string }

export const TOOLS: { id: Tool; label: string; hint: string; glyph: string }[] = [
  { id: "cursor", label: "Cursor", hint: "Pan and select", glyph: "↖" },
  { id: "trend", label: "Trendline", hint: "Click two points", glyph: "╱" },
  { id: "hline", label: "Horizontal line", hint: "Click a price", glyph: "─" },
  { id: "ray", label: "Ray", hint: "Click two points", glyph: "↗" },
  { id: "rect", label: "Rectangle", hint: "Click two corners", glyph: "▭" },
  { id: "fib", label: "Fibonacci", hint: "Click the swing low then high", glyph: "≡" },
  { id: "note", label: "Note", hint: "Click, then type", glyph: "T" },
];

export const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const key = (instr: string) => `pa-draw:${instr}`;

export function loadDrawings(instr: string): Drawing[] {
  try {
    const raw = localStorage.getItem(key(instr));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((d) => d && typeof d.id === "string" && d.a) : [];
  } catch { return []; }
}

export function saveDrawings(instr: string, list: Drawing[]): void {
  try {
    if (list.length) localStorage.setItem(key(instr), JSON.stringify(list.slice(0, 60)));
    else localStorage.removeItem(key(instr));
  } catch { /* storage can be blocked: the drawings then last for this visit only */ }
}

export function loadPref<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem("pa-term:" + name);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}

export function savePref(name: string, value: unknown): void {
  try { localStorage.setItem("pa-term:" + name, JSON.stringify(value)); } catch { /* per-visit only */ }
}

// ---- indicators the shared movingAverages.ts lacks ----

/** MACD 12/26/9: the line, its signal and the histogram, null until each has enough bars behind it. */
export function macd(closes: readonly number[]): { line: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const k = (n: number) => 2 / (n + 1);
  const run = (n: number): (number | null)[] => {
    const out: (number | null)[] = new Array(closes.length).fill(null);
    if (closes.length < n) return out;
    let e = 0;
    for (let j = 0; j < n; j++) e += closes[j]!;
    e /= n;
    out[n - 1] = e;
    for (let i = n; i < closes.length; i++) { e = closes[i]! * k(n) + e * (1 - k(n)); out[i] = e; }
    return out;
  };
  const fast = run(12), slow = run(26);
  const line = closes.map((_, i) => (fast[i] !== null && slow[i] !== null ? fast[i]! - slow[i]! : null));
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  const first = line.findIndex((x) => x !== null);
  if (first >= 0 && closes.length - first >= 9) {
    let e = 0;
    for (let j = first; j < first + 9; j++) e += line[j]!;
    e /= 9;
    signal[first + 8] = e;
    for (let i = first + 9; i < closes.length; i++) { e = line[i]! * k(9) + e * (1 - k(9)); signal[i] = e; }
  }
  const hist = line.map((x, i) => (x !== null && signal[i] !== null ? x - signal[i]! : null));
  return { line, signal, hist };
}

/** VWAP of typical price weighted by volume. Intraday it restarts each game day; on longer bars it runs over the window. */
export function vwapOf(bars: readonly Bar[], intraday: boolean): (number | null)[] {
  const out: (number | null)[] = [];
  let pv = 0, vol = 0, day = -1;
  for (const b of bars) {
    const d = Math.floor(b.ts / DAY_S);
    if (intraday && d !== day) { pv = 0; vol = 0; day = d; }
    pv += (b.h + b.l + b.c) / 3 * b.v;
    vol += b.v;
    out.push(vol > 0 ? pv / vol : null);
  }
  return out;
}
