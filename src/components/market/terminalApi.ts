// The trading terminal's data: bars and the market list from the sim's /history route, drawings saved per instrument,
// and the two indicators movingAverages.ts does not have. Every price comes from the sim; nothing here invents one.

export type Tf = "i" | "d" | "w" | "m";
export type Kind = "share" | "index" | "coin" | "future" | "bond" | "fx";
export type Unit = "cents" | "pts" | "rate";

export interface Bar { t: number; k: number; o: number; h: number; l: number; c: number; v: number }
export interface Series { id: string; name: string; kind: Kind; unit: Unit; tf: Tf; ticks: number; since: number; day: number; bars: Bar[] }
export interface ListRow { id: string; name: string; kind: Kind; unit: Unit; px: number; prev: number; chg: number; since: number; live: boolean }
export interface MarketList { day: number; ticks: number; rows: ListRow[] }

export const TFS: { id: Tf; label: string }[] = [
  { id: "i", label: "Intraday" },
  { id: "d", label: "Day" },
  { id: "w", label: "Week" },
  { id: "m", label: "Month" },
];

export const DAY_S = 86400;

/** Chart time for a bar: game time in seconds, so a day is one 86,400 s step and the library's own spacing holds. */
export function barTime(b: Bar, ticks: number): number {
  return Math.round((b.t + (b.k / Math.max(1, ticks))) * DAY_S);
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

export function volText(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

/** "Y2 M3 D4" for a game day; the intraday label adds the slot of the day. */
export function gameDate(gt: number, ticks: number, withTick = false): string {
  const abs = Math.floor(gt);
  const doy = ((abs % 360) + 360) % 360;
  const base = `Y${Math.floor(abs / 360) + 1} M${Math.floor(doy / 30) + 1} D${(doy % 30) + 1}`;
  if (!withTick) return base;
  const k = Math.round((gt - abs) * ticks);
  return `${base} ${String(Math.round(k * 24 / ticks)).padStart(2, "0")}:00`;
}

export async function fetchSeries(instr: string, tf: Tf, limit = 600): Promise<Series | null> {
  try {
    const res = await fetch(`/api/sim/history?instr=${encodeURIComponent(instr)}&tf=${tf}&limit=${limit}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as Series;
  } catch { return null; }
}

export async function fetchList(): Promise<MarketList | null> {
  try {
    const res = await fetch("/api/sim/history?list=1", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as MarketList;
  } catch { return null; }
}

/** The instrument id the sim charts for a broker context (a ticker, a coin id, a future, a bond). */
export function instrOf(context: string | undefined): string {
  if (!context) return "index";
  if (/^(eq:|coin:|fut:|bond:)/.test(context) || context === "index" || context === "fx") return context;
  if (context === "BANK") return "eq:bank_1";
  return "eq:frm_" + context.toLowerCase();
}

// ---- drawings, saved per instrument in this browser ----

export type Tool = "cursor" | "trend" | "hline" | "ray" | "rect" | "fib" | "note";
export interface Pt { t: number; p: number }
export interface Drawing { id: string; kind: Exclude<Tool, "cursor">; a: Pt; b?: Pt; text?: string }

export const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "cursor", label: "Cursor", hint: "Pan and select" },
  { id: "trend", label: "Trendline", hint: "Click two points" },
  { id: "hline", label: "Horizontal line", hint: "Click a price" },
  { id: "ray", label: "Ray", hint: "Click two points" },
  { id: "rect", label: "Rectangle", hint: "Click two corners" },
  { id: "fib", label: "Fibonacci", hint: "Click the swing low then high" },
  { id: "note", label: "Note", hint: "Click, then type" },
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
    if (intraday && b.t !== day) { pv = 0; vol = 0; day = b.t; }
    pv += (b.h + b.l + b.c) / 3 * b.v;
    vol += b.v;
    out.push(vol > 0 ? pv / vol : null);
  }
  return out;
}
