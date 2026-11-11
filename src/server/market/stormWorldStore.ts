// Durable storm-world snapshot (scheduler bookkeeping + permanent stock applyShock sets + Fear/regime).
// Survives process restart for local M1, same class of store as `.data/auth/` (not multi-instance).
// Tests / QUAY_STORM_STORE=memory: no file (caller keeps state in the LiveMarket / scheduler only).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  emptyStormWorld, STORM_KINDS, type StormEvent, type StormKind, type StormPriceShock, type StormWorldSnapshot,
} from "./storms";
import {
  emptyCrisisBookkeeping, MAJOR_KINDS_V1, RIPPLE_KINDS,
  type CrisisBookkeeping, type MajorEvent, type MajorKindV1, type MajorPhase, type RippleEvent, type RippleKind,
} from "./crises";
import { cloneRumorSnapshot, normalizeRumorSnapshot } from "./rumorClaims";

export interface StormWorldStore {
  load(): StormWorldSnapshot;
  save(snapshot: StormWorldSnapshot): void;
}

export class MemoryStormWorldStore implements StormWorldStore {
  private snap: StormWorldSnapshot = emptyStormWorld();
  load(): StormWorldSnapshot { return cloneStormWorld(this.snap); }
  save(snapshot: StormWorldSnapshot): void { this.snap = cloneStormWorld(snapshot); }
}

/**
 * JSON file under `.data/market/storm-world.json` (or QUAY_STORM_DATA_DIR).
 * Atomic write via temp + rename. Sync so LiveMarket construction stays synchronous.
 */
export class FileStormWorldStore implements StormWorldStore {
  readonly filePath: string;
  constructor(filePath: string) { this.filePath = filePath; }

  load(): StormWorldSnapshot {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      return normalizeStormWorld(JSON.parse(raw) as unknown);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
      if (code === "ENOENT") return emptyStormWorld();
      throw err;
    }
  }

  save(snapshot: StormWorldSnapshot): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(cloneStormWorld(snapshot)), { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, this.filePath);
  }
}

export function cloneStormWorld(s: StormWorldSnapshot): StormWorldSnapshot {
  return {
    active: s.active ? { ...s.active } : null,
    lastEndTick: s.lastEndTick,
    lastDayClose: s.lastDayClose,
    lastTick: s.lastTick,
    depth: s.depth ? { ...s.depth } : null,
    stockApplied: s.stockApplied.map((r) => ({
      stormId: r.stormId,
      shocks: r.shocks.map((p) => ({ ...p })),
    })),
    world: s.world ? {
      fear: s.world.fear, regime: s.world.regime, daysIn: s.world.daysIn,
      change: s.world.change ? { ...s.world.change } : null,
      closes: s.world.closes.slice(), dayOpen: s.world.dayOpen,
      lastHour: s.world.lastHour, lastDay: s.world.lastDay,
    } : s.world === null ? null : undefined,
    crises: s.crises ? cloneCrises(s.crises) : s.crises === null ? null : undefined,
    shockResidual: s.shockResidual ? s.shockResidual.map((r) => ({ ...r })) : s.shockResidual === null ? null : undefined,
    erpAccrued: s.erpAccrued ? s.erpAccrued.map((r) => ({ ...r })) : s.erpAccrued === null ? null : undefined,
    rumors: s.rumors ? cloneRumorSnapshot(s.rumors) : s.rumors === null ? null : undefined,
  };
}

function cloneCrises(c: CrisisBookkeeping): CrisisBookkeeping {
  return {
    activeMajor: c.activeMajor ? { ...c.activeMajor } : null,
    activeRipples: c.activeRipples.map((r) => ({ ...r })),
    lastMajorTriggerTick: c.lastMajorTriggerTick,
    lastMajorEndTick: c.lastMajorEndTick,
    crisisWeek: c.crisisWeek ? { ...c.crisisWeek } : null,
    crisisWeekUsedThisChapter: c.crisisWeekUsedThisChapter,
    crisisWeekChapter: c.crisisWeekChapter,
    timezoneBandNext: c.timezoneBandNext,
    playerCausedSuppressUntil: c.playerCausedSuppressUntil,
    crisisWeekForcedStormAt: c.crisisWeekForcedStormAt,
  };
}

function isStormKind(x: unknown): x is StormKind {
  return typeof x === "string" && (STORM_KINDS as readonly string[]).includes(x);
}

function normalizeShocks(raw: unknown): StormPriceShock[] {
  if (!Array.isArray(raw)) return [];
  const out: StormPriceShock[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.assetId !== "string" || typeof o.bp !== "number" || !Number.isFinite(o.bp)) continue;
    out.push({ assetId: o.assetId, bp: Math.round(o.bp) });
  }
  return out;
}

function normalizeActive(raw: unknown): StormEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !isStormKind(o.kind)) return null;
  if (typeof o.severity !== "number" || typeof o.sectorIndex !== "number") return null;
  if (typeof o.precursorStartTick !== "number" || typeof o.triggerTick !== "number" || typeof o.plannedEndTick !== "number") return null;
  if (o.phase !== "PRECURSOR" && o.phase !== "TRIGGER" && o.phase !== "ENDED") return null;
  return {
    id: o.id, kind: o.kind, severity: o.severity, sectorIndex: o.sectorIndex,
    precursorStartTick: o.precursorStartTick, triggerTick: o.triggerTick, plannedEndTick: o.plannedEndTick,
    phase: o.phase,
  };
}

export function normalizeStormWorld(parsed: unknown): StormWorldSnapshot {
  if (!parsed || typeof parsed !== "object") return emptyStormWorld();
  const o = parsed as Record<string, unknown>;
  const stockApplied: { stormId: string; shocks: StormPriceShock[] }[] = [];
  if (Array.isArray(o.stockApplied)) {
    for (const row of o.stockApplied) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.stormId !== "string") continue;
      stockApplied.push({ stormId: r.stormId, shocks: normalizeShocks(r.shocks) });
    }
  }
  const numOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isSafeInteger(v) ? v : v === null ? null : null;
  let depth: StormWorldSnapshot["depth"] = null;
  if (o.depth && typeof o.depth === "object") {
    const d = o.depth as Record<string, unknown>;
    if (typeof d.mult === "number" && typeof d.untilTick === "number") depth = { mult: d.mult, untilTick: d.untilTick };
  }
  return {
    active: normalizeActive(o.active),
    lastEndTick: numOrNull(o.lastEndTick),
    lastDayClose: numOrNull(o.lastDayClose),
    lastTick: numOrNull(o.lastTick),
    depth,
    stockApplied,
    world: normalizeWorld(o.world),
    crises: normalizeCrises(o.crises),
    shockResidual: normalizeResidual(o.shockResidual),
    erpAccrued: normalizeErpAccrued(o.erpAccrued),
    rumors: normalizeRumorSnapshot(o.rumors),
  };
}

function normalizeResidual(raw: unknown): StormWorldSnapshot["shockResidual"] {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!Array.isArray(raw)) return [];
  const out: { assetId: string; log: number; k: number }[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.assetId !== "string") continue;
    if (typeof o.log !== "number" || !Number.isFinite(o.log)) continue;
    if (typeof o.k !== "number" || !Number.isFinite(o.k) || !(o.k > 0)) continue;
    out.push({ assetId: o.assetId, log: o.log, k: o.k });
  }
  return out;
}

function normalizeErpAccrued(raw: unknown): StormWorldSnapshot["erpAccrued"] {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!Array.isArray(raw)) return [];
  const out: { assetId: string; log: number }[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.assetId !== "string") continue;
    if (typeof o.log !== "number" || !Number.isFinite(o.log)) continue;
    out.push({ assetId: o.assetId, log: o.log });
  }
  return out;
}

function isMajorKind(x: unknown): x is MajorKindV1 {
  return typeof x === "string" && (MAJOR_KINDS_V1 as readonly string[]).includes(x);
}
function isRippleKind(x: unknown): x is RippleKind {
  return typeof x === "string" && (RIPPLE_KINDS as readonly string[]).includes(x);
}
function normalizeMajor(raw: unknown): MajorEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !isMajorKind(o.kind)) return null;
  if (typeof o.severity !== "number" || typeof o.precursorStartTick !== "number") return null;
  if (typeof o.triggerTick !== "number" || typeof o.contagionStartTick !== "number" || typeof o.plannedEndTick !== "number") return null;
  const phase = o.phase;
  if (phase !== "PRECURSOR" && phase !== "TRIGGER" && phase !== "CONTAGION" && phase !== "ENDED") return null;
  return {
    id: o.id, kind: o.kind, severity: o.severity,
    precursorStartTick: o.precursorStartTick, triggerTick: o.triggerTick,
    contagionStartTick: o.contagionStartTick, plannedEndTick: o.plannedEndTick,
    phase: phase as MajorPhase,
  };
}
function normalizeRipple(raw: unknown): RippleEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !isRippleKind(o.kind)) return null;
  if (o.sign !== 1 && o.sign !== -1) return null;
  if (typeof o.size !== "number" || typeof o.lengthDays !== "number" || typeof o.sectorIndex !== "number") return null;
  if (typeof o.startTick !== "number" || typeof o.plannedEndTick !== "number") return null;
  if (o.phase !== "ACTIVE" && o.phase !== "ENDED") return null;
  return {
    id: o.id, kind: o.kind, sign: o.sign, size: o.size, lengthDays: o.lengthDays,
    sectorIndex: o.sectorIndex, startTick: o.startTick, plannedEndTick: o.plannedEndTick, phase: o.phase,
  };
}
function normalizeCrises(raw: unknown): CrisisBookkeeping | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return emptyCrisisBookkeeping();
  const o = raw as Record<string, unknown>;
  const ripples: RippleEvent[] = [];
  if (Array.isArray(o.activeRipples)) {
    for (const r of o.activeRipples) {
      const n = normalizeRipple(r);
      if (n) ripples.push(n);
    }
  }
  const band = o.timezoneBandNext;
  const timezoneBandNext: 0 | 1 | 2 = band === 1 || band === 2 ? band : 0;
  let crisisWeek = null;
  if (o.crisisWeek && typeof o.crisisWeek === "object") {
    const w = o.crisisWeek as Record<string, unknown>;
    if (typeof w.announcedTick === "number" && typeof w.startTick === "number" && typeof w.endTick === "number" && typeof w.themeKey === "string") {
      crisisWeek = { announcedTick: w.announcedTick, startTick: w.startTick, endTick: w.endTick, themeKey: w.themeKey };
    }
  }
  const numOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isSafeInteger(v) ? v : v === null ? null : null;
  return {
    activeMajor: normalizeMajor(o.activeMajor),
    activeRipples: ripples,
    lastMajorTriggerTick: numOrNull(o.lastMajorTriggerTick),
    lastMajorEndTick: numOrNull(o.lastMajorEndTick),
    crisisWeek,
    crisisWeekUsedThisChapter: o.crisisWeekUsedThisChapter === true,
    crisisWeekChapter: numOrNull(o.crisisWeekChapter),
    timezoneBandNext,
    playerCausedSuppressUntil: numOrNull(o.playerCausedSuppressUntil),
    crisisWeekForcedStormAt: numOrNull(o.crisisWeekForcedStormAt),
  };
}

const REGIMES = new Set(["EXPANSION", "OVERHEATING", "CONTRACTION", "RECOVERY"]);

function normalizeWorld(raw: unknown): StormWorldSnapshot["world"] {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.fear !== "number" || !Number.isFinite(w.fear) || w.fear < 0 || w.fear > 100) return null;
  if (typeof w.regime !== "string" || !REGIMES.has(w.regime)) return null;
  if (typeof w.daysIn !== "number" || !Number.isSafeInteger(w.daysIn) || w.daysIn < 0) return null;
  if (typeof w.dayOpen !== "number" || !Number.isFinite(w.dayOpen)) return null;
  const lastHour = w.lastHour === null ? null : (typeof w.lastHour === "number" && Number.isSafeInteger(w.lastHour) ? w.lastHour : null);
  const lastDay = w.lastDay === null ? null : (typeof w.lastDay === "number" && Number.isSafeInteger(w.lastDay) ? w.lastDay : null);
  let change: { from: import("./world").Regime; tick: number } | null = null;
  if (w.change && typeof w.change === "object") {
    const c = w.change as Record<string, unknown>;
    if (typeof c.from === "string" && REGIMES.has(c.from) && typeof c.tick === "number" && Number.isSafeInteger(c.tick)) {
      change = { from: c.from as import("./world").Regime, tick: c.tick };
    }
  }
  const closes: number[] = [];
  if (Array.isArray(w.closes)) {
    for (const v of w.closes) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) closes.push(v);
    }
  }
  return {
    fear: w.fear, regime: w.regime as import("./world").Regime, daysIn: w.daysIn, change,
    closes, dayOpen: w.dayOpen, lastHour, lastDay,
  };
}

/** Process default store: memory in tests / QUAY_STORM_STORE=memory; else file under QUAY_STORM_DATA_DIR or `.data/market`. */
export function createDefaultStormWorldStore(): StormWorldStore {
  if (process.env.QUAY_STORM_STORE === "memory" || process.env.NODE_ENV === "test") {
    return new MemoryStormWorldStore();
  }
  const root = process.env.QUAY_STORM_DATA_DIR ?? path.join(process.cwd(), ".data", "market");
  return new FileStormWorldStore(path.join(root, "storm-world.json"));
}
