// Optional durable quote-path + candle snapshot on the storm-world file (eng/market-restart-marks).
// Absent `path` is the pre-persistence upgrade (virgin marks at lastTick, rematerialized residuals).
// Present but unreadable fails closed, like rumors (do not boot a virgin walk on a corrupt book).
import type { TapePrint } from "@/shell/contracts/channels";

const CANDLE_KEEP = 5000;
const CANDLE_RES = ["tick", "hour", "day"] as const;

export const PATH_SNAPSHOT_V = 1 as const;

export class CorruptPathSnapshotError extends Error {
  readonly code = "PATH_SNAPSHOT_CORRUPT";
  constructor() {
    super("Refusing to start the quote clock: a path snapshot is present but is not a valid path snapshot. Marks were not reset to catalog base.");
    this.name = "CorruptPathSnapshotError";
  }
}

export function refuseCorruptPathSnapshot(): never {
  const err = new CorruptPathSnapshotError();
  console.error(`[pathSnapshot] ${err.message}`);
  throw err;
}

export interface DrawsState { readonly a: number; readonly spare: number | null }

export interface PathAssetSnapshot {
  readonly last: number;
  readonly prevClose: number;
  readonly dayVol: number;
  readonly lastQty: number;
  readonly dir: -1 | 0 | 1;
  readonly prints: readonly TapePrint[];
}

export interface PathMemeSnapshot {
  readonly lnP: number;
  readonly offset: number;
  readonly draws: DrawsState;
}

export interface PathLookbackSnapshot {
  readonly p: readonly number[];
  readonly v: readonly number[];
}

export interface PathMinorBar {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
  readonly rv: number;
}

export interface PathCandleSnapshot {
  readonly epoch: string;
  readonly rev: number;
  readonly lastTick: number;
  readonly bars: Readonly<Record<string, { readonly tick: readonly PathMinorBar[]; readonly hour: readonly PathMinorBar[]; readonly day: readonly PathMinorBar[] }>>;
}

export interface PathSnapshot {
  readonly v: typeof PATH_SNAPSHOT_V;
  readonly tick: number;
  readonly rand: number;
  readonly extraRand: Readonly<Record<string, number>>;
  readonly cryptoFactor: DrawsState;
  readonly assets: Readonly<Record<string, PathAssetSnapshot>>;
  readonly memes: Readonly<Record<string, PathMemeSnapshot>>;
  readonly lookback: Readonly<Record<string, PathLookbackSnapshot>>;
  readonly candles?: PathCandleSnapshot | null;
}

const SIDES = new Set(["BUY", "SELL", "NONE"]);

function isUint32(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff;
}

function isSafeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}

function normalizeDraws(raw: unknown): DrawsState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isUint32(o.a)) return null;
  if (!(o.spare === null || (typeof o.spare === "number" && Number.isFinite(o.spare)))) return null;
  return { a: o.a, spare: o.spare };
}

function normalizePrint(raw: unknown): TapePrint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.assetId !== "string" || !o.assetId) return null;
  if (!isSafeInt(o.tick) || o.tick < 0) return null;
  if (typeof o.price !== "string" || typeof o.qty !== "string") return null;
  if (typeof o.aggressor !== "string" || !SIDES.has(o.aggressor)) return null;
  if (typeof o.block !== "boolean" || typeof o.deferred !== "boolean") return null;
  return {
    assetId: o.assetId,
    tick: o.tick,
    price: o.price,
    qty: o.qty,
    aggressor: o.aggressor as TapePrint["aggressor"],
    block: o.block,
    deferred: o.deferred,
  };
}

function normalizeAsset(raw: unknown): PathAssetSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isSafeInt(o.last) || !(o.last > 0)) return null;
  if (!isSafeInt(o.prevClose) || !(o.prevClose > 0)) return null;
  if (!isSafeInt(o.dayVol) || o.dayVol < 0) return null;
  if (!isSafeInt(o.lastQty) || o.lastQty < 0) return null;
  if (o.dir !== -1 && o.dir !== 0 && o.dir !== 1) return null;
  if (!Array.isArray(o.prints)) return null;
  const prints: TapePrint[] = [];
  for (const p of o.prints) {
    const n = normalizePrint(p);
    if (!n) return null;
    prints.push(n);
  }
  return { last: o.last, prevClose: o.prevClose, dayVol: o.dayVol, lastQty: o.lastQty, dir: o.dir, prints };
}

function normalizeMeme(raw: unknown): PathMemeSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.lnP !== "number" || !Number.isFinite(o.lnP)) return null;
  if (typeof o.offset !== "number" || !Number.isFinite(o.offset)) return null;
  const draws = normalizeDraws(o.draws);
  if (!draws) return null;
  return { lnP: o.lnP, offset: o.offset, draws };
}

function normalizeLookback(raw: unknown): PathLookbackSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.p) || !Array.isArray(o.v) || o.p.length !== o.v.length) return null;
  const p: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < o.p.length; i++) {
    if (typeof o.p[i] !== "number" || !Number.isFinite(o.p[i]) || !(o.p[i] > 0)) return null;
    if (typeof o.v[i] !== "number" || !Number.isFinite(o.v[i])) return null;
    p.push(o.p[i]);
    v.push(o.v[i]);
  }
  return { p, v };
}

function normalizeBar(raw: unknown): PathMinorBar | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isSafeInt(o.t) || o.t < 0) return null;
  for (const k of ["o", "h", "l", "c"] as const) {
    if (!isSafeInt(o[k]) || !(o[k]! > 0)) return null;
  }
  if (!isSafeInt(o.v) || o.v < 0) return null;
  if (!isSafeInt(o.rv) || o.rv < 0) return null;
  return { t: o.t, o: o.o as number, h: o.h as number, l: o.l as number, c: o.c as number, v: o.v, rv: o.rv };
}

function normalizeBars(raw: unknown): PathMinorBar[] | null {
  if (!Array.isArray(raw) || raw.length > CANDLE_KEEP) return null;
  const out: PathMinorBar[] = [];
  for (const row of raw) {
    const b = normalizeBar(row);
    if (!b) return null;
    out.push(b);
  }
  return out;
}

function normalizeCandles(raw: unknown): PathCandleSnapshot | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.epoch !== "string" || !o.epoch) return null;
  if (!isSafeInt(o.rev) || o.rev < 0) return null;
  if (!isSafeInt(o.lastTick)) return null;
  if (!o.bars || typeof o.bars !== "object") return null;
  const bars: Record<string, { tick: PathMinorBar[]; hour: PathMinorBar[]; day: PathMinorBar[] }> = {};
  for (const [id, per] of Object.entries(o.bars as Record<string, unknown>)) {
    if (typeof id !== "string" || !id || !per || typeof per !== "object") return null;
    const p = per as Record<string, unknown>;
    const tick = normalizeBars(p.tick);
    const hour = normalizeBars(p.hour);
    const day = normalizeBars(p.day);
    if (!tick || !hour || !day) return null;
    bars[id] = { tick, hour, day };
  }
  return { epoch: o.epoch, rev: o.rev, lastTick: o.lastTick, bars };
}

function normalizeUint32Map(raw: unknown): Record<string, number> | null {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !k || !isUint32(v)) return null;
    out[k] = v;
  }
  return out;
}

function normalizeRecord<T>(raw: unknown, one: (v: unknown) => T | null): Record<string, T> | null {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !k) return null;
    const n = one(v);
    if (!n) return null;
    out[k] = n;
  }
  return out;
}

/**
 * Valid path snapshot, or null when the value is present but unreadable (caller fails closed).
 * `undefined` means the key is absent (upgrade).
 */
export function normalizePathSnapshot(raw: unknown): PathSnapshot | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== PATH_SNAPSHOT_V) return null;
  if (!isSafeInt(o.tick) || o.tick < 0) return null;
  if (!isUint32(o.rand)) return null;
  const extraRand = normalizeUint32Map(o.extraRand);
  const cryptoFactor = normalizeDraws(o.cryptoFactor);
  const assets = normalizeRecord(o.assets, normalizeAsset);
  const memes = normalizeRecord(o.memes, normalizeMeme);
  const lookback = normalizeRecord(o.lookback, normalizeLookback);
  if (!extraRand || !cryptoFactor || !assets || !memes || !lookback) return null;
  if (Object.keys(assets).length === 0) return null;
  let candles: PathCandleSnapshot | null | undefined;
  if (Object.prototype.hasOwnProperty.call(o, "candles")) {
    if (o.candles == null) candles = null;
    else {
      const c = normalizeCandles(o.candles);
      if (!c) return null;
      candles = c;
    }
  }
  return {
    v: PATH_SNAPSHOT_V,
    tick: o.tick,
    rand: o.rand,
    extraRand,
    cryptoFactor,
    assets,
    memes,
    lookback,
    ...(candles !== undefined ? { candles } : {}),
  };
}

export function clonePathSnapshot(s: PathSnapshot): PathSnapshot {
  const assets: Record<string, PathAssetSnapshot> = {};
  for (const [id, a] of Object.entries(s.assets)) {
    assets[id] = { ...a, prints: a.prints.map((p) => ({ ...p })) };
  }
  const memes: Record<string, PathMemeSnapshot> = {};
  for (const [id, m] of Object.entries(s.memes)) {
    memes[id] = { lnP: m.lnP, offset: m.offset, draws: { ...m.draws } };
  }
  const lookback: Record<string, PathLookbackSnapshot> = {};
  for (const [id, h] of Object.entries(s.lookback)) {
    lookback[id] = { p: h.p.slice(), v: h.v.slice() };
  }
  const extraRand = { ...s.extraRand };
  let candles: PathCandleSnapshot | null | undefined;
  if (s.candles) {
    const bars: PathCandleSnapshot["bars"] = {};
    const src = s.candles.bars;
    for (const id of Object.keys(src)) {
      const per = src[id]!;
      const next: { tick: PathMinorBar[]; hour: PathMinorBar[]; day: PathMinorBar[] } = { tick: [], hour: [], day: [] };
      for (const res of CANDLE_RES) next[res] = per[res].map((b) => ({ ...b }));
      (bars as Record<string, typeof next>)[id] = next;
    }
    candles = { epoch: s.candles.epoch, rev: s.candles.rev, lastTick: s.candles.lastTick, bars };
  } else if (s.candles === null) {
    candles = null;
  }
  return {
    v: PATH_SNAPSHOT_V,
    tick: s.tick,
    rand: s.rand,
    extraRand,
    cryptoFactor: { ...s.cryptoFactor },
    assets,
    memes,
    lookback,
    ...(candles !== undefined ? { candles } : {}),
  };
}
