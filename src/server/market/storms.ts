// Shared storm scheduler for this base (docs/v1/LAUNCHPAD.md "Storm durable correctness").
// 04 §3.16.1–3 storm tier only: rate 1/91, 8 kinds, one active, 7-day cooldown, no start in first 24 game days
// from tick 0, precursor 1–2 game days. Plays 04's role here the same way world.ts plays Fear/regime: formulas
// copied and cited; the app does not import packages/engine/macro. Majors, ripples and Crisis Week are out of scope.
// Deterministic: per-day stream `macro:storm:<day>` only, so a restarted clock replays the same schedule (M1-05).
// Catch-up: when observe jumps across ticks, every skipped day-close and phase edge is evaluated in order (world.ts day loop).
// Cold start: the first observe evaluates from tick origin 0 (does not skip day closes 24–37 when booting at START_TICK).
// Per-wire prices: each StormWireOut carries its own stock shocks (no shared queue drain across two triggers in one step).
import { ASSETS } from "@/market/catalog";
import { Draws, TICKS_PER_DAY } from "./meme";

export const STORM_KINDS = [
  "RATE_SCARE", "OIL_SPIKE_LITE", "CRYPTO_FLUSH", "CREDIT_WOBBLE", "FX_SQUALL",
  "SECTOR_ROTATION", "EARNINGS_SCARE", "LIQUIDITY_HICCUP",
] as const;
export type StormKind = (typeof STORM_KINDS)[number];

/** Catalog equity sectors in stable ASSETS order (first seen). Used by SECTOR_ROTATION (engine sector / sector+1). */
export const EQUITY_SECTORS: readonly string[] = (() => {
  const out: string[] = [];
  for (const a of ASSETS) {
    if (a.class !== "equity") continue;
    if (!out.includes(a.sector)) out.push(a.sector);
  }
  return out;
})();

/** 23 `macro_storm_rate`; 04 §3.16.1. */
export const STORM_RATE = 1 / 91;
export const STORM_COOLDOWN_DAYS = 7;
export const STORM_NO_START_FIRST_DAYS = 24;
/** 04 §3.16.4 / engine STORM_EFFECT_DAYS: days from trigger to end. */
export const STORM_EFFECT_DAYS: Readonly<Record<StormKind, number>> = {
  RATE_SCARE: 30, OIL_SPIKE_LITE: 20, CRYPTO_FLUSH: 1, CREDIT_WOBBLE: 30, FX_SQUALL: 10,
  SECTOR_ROTATION: 10, EARNINGS_SCARE: 5, LIQUIDITY_HICCUP: 1,
};
/** CRYPTO_FLUSH: hype −0.4 × severity (04 scaled-shocks sentence; see LAUNCHPAD conflict note); depth ×0.5 for 720 ticks. */
export const CRYPTO_FLUSH_HYPE = -0.4;
export const CRYPTO_FLUSH_DEPTH_MULT = 0.5;
export const CRYPTO_FLUSH_DEPTH_TICKS = 720;
/** LIQUIDITY_HICCUP: maker depth ×0.5 for 60 ticks (04 §3.16.4). */
export const LIQUIDITY_HICCUP_DEPTH_MULT = 0.5;
export const LIQUIDITY_HICCUP_DEPTH_TICKS = 60;

export type StormPhase = "PRECURSOR" | "TRIGGER" | "ENDED";
export interface StormEvent {
  readonly id: string;
  readonly kind: StormKind;
  readonly severity: number;
  /** SECTOR_ROTATION: index into EQUITY_SECTORS (s2 = s1+1 mod). Other kinds: 0. */
  readonly sectorIndex: number;
  readonly precursorStartTick: number;
  readonly triggerTick: number;
  readonly plannedEndTick: number;
  phase: StormPhase;
}
/** A Wire headline to publish at the current tick (trigger only: 04 §3.16.3 precursor is not announced). */
export interface StormWireOut {
  readonly id: string;
  readonly kind: StormKind;
  readonly severity: number;
  readonly sectorIndex: number;
  readonly headlineKey: string;
  readonly causeKey: string;
  readonly phase: "realized";
  readonly breaking: boolean;
  readonly slug: string;
  /** Stock applyShock vector for this storm only (empty for wire-only / crypto depth kinds). Bound at emit — not a shared queue. */
  readonly prices: readonly StormPriceShock[];
}
/** Durable CRYPTO_FLUSH hype once per storm id (applied by the broker sweep into saved pools). */
export interface StormHypeShock { readonly stormId: string; readonly delta: number }
/** One-shot catalog mark move at trigger (ShockFeed.applyShock), bp × severity already applied. */
export interface StormPriceShock { readonly assetId: string; readonly bp: number }

/** Durable storm bookkeeping + permanent stock applyShock sets (survives process restart with the storm-world store). */
export interface StormWorldSnapshot {
  readonly active: StormEvent | null;
  readonly lastEndTick: number | null;
  readonly lastDayClose: number | null;
  readonly lastTick: number | null;
  readonly depth: { readonly mult: number; readonly untilTick: number } | null;
  /** Permanent stock mark shocks already applied, idempotent by storm id (like pools.sx for hype). */
  readonly stockApplied: ReadonlyArray<{ readonly stormId: string; readonly shocks: readonly StormPriceShock[] }>;
}

const pFromRate = (r: number) => 1 - Math.exp(-r);
const dayOf = (tick: number) => Math.floor(tick / TICKS_PER_DAY);
const slugOf = (kind: StormKind): string => kind.toLowerCase().replace(/_/g, "-");
const dayCloseTick = (day: number) => day * TICKS_PER_DAY + TICKS_PER_DAY - 1;

/** One day-close draw (04 §3.16.3 step 2). Pure: same day always yields the same decision. */
export function stormDayDraw(day: number): {
  start: boolean; kind: StormKind; severity: number; precursorDays: number; sectorIndex: number;
} {
  const r = new Draws(`macro:storm:${day}`);
  const uStart = r.uniform(), uKind = r.uniform(), uPre = r.uniform(), uSec = r.uniform();
  const x = uKind * STORM_KINDS.length, i = Math.min(STORM_KINDS.length - 1, Math.floor(x)), f = x - i;
  const nSec = Math.max(1, EQUITY_SECTORS.length);
  return {
    start: uStart < pFromRate(STORM_RATE),
    kind: STORM_KINDS[i]!,
    severity: 0.6 + 0.8 * f,
    precursorDays: 1 + Math.floor(2 * uPre),
    sectorIndex: Math.min(nSec - 1, Math.floor(uSec * nSec)),
  };
}

/**
 * 04 §3.16.4 storm stock proxies for this base (no yield curve / PE / commodity / 07 / FX engines on the live clock).
 * CREDIT_WOBBLE and FX_SQUALL return [] (Wire-only; V1 OUT / unbuilt). CRYPTO_FLUSH / LIQUIDITY_HICCUP use hype/depth, not this.
 */
export function stormStockShocks(kind: StormKind, severity: number, sectorIndex: number): StormPriceShock[] {
  const sev = severity;
  switch (kind) {
    case "RATE_SCARE":
      // tp10 +40 bp proxy: duration-sensitive Atlantic names + index soften (cause copy).
      return [
        { assetId: "AVB", bp: Math.round(-40 * sev) },
        { assetId: "TIDE", bp: Math.round(-30 * sev) },
        { assetId: "GX", bp: Math.round(-20 * sev) },
      ];
    case "OIL_SPIKE_LITE":
      // crude supply −3% lite analogue of demo OIL_SHOCK hit vector, × severity.
      return [
        { assetId: "VRDN", bp: Math.round(150 * sev) },
        { assetId: "HALC", bp: Math.round(-90 * sev) },
        { assetId: "KILN", bp: Math.round(-75 * sev) },
      ];
    case "SECTOR_ROTATION": {
      const n = EQUITY_SECTORS.length;
      if (n < 2) return [];
      const s1 = EQUITY_SECTORS[((sectorIndex % n) + n) % n]!;
      const s2 = EQUITY_SECTORS[((sectorIndex + 1) % n + n) % n]!;
      const out: StormPriceShock[] = [];
      for (const a of ASSETS) {
        if (a.class !== "equity") continue;
        if (a.sector === s1) out.push({ assetId: a.assetId, bp: Math.round(-100 * sev) });
        else if (a.sector === s2) out.push({ assetId: a.assetId, bp: Math.round(50 * sev) });
      }
      return out;
    }
    case "EARNINGS_SCARE": {
      // consensus EPS −5% → ~−500 bp equities at constant PE; index softer.
      const out: StormPriceShock[] = [];
      for (const a of ASSETS) {
        if (a.class === "equity") out.push({ assetId: a.assetId, bp: Math.round(-500 * sev) });
        else if (a.assetId === "GX") out.push({ assetId: "GX", bp: Math.round(-150 * sev) });
      }
      return out;
    }
    case "CREDIT_WOBBLE":
    case "FX_SQUALL":
    case "CRYPTO_FLUSH":
    case "LIQUIDITY_HICCUP":
      return [];
  }
}

export function emptyStormWorld(): StormWorldSnapshot {
  return { active: null, lastEndTick: null, lastDayClose: null, lastTick: null, depth: null, stockApplied: [] };
}

/**
 * The clock's storm state. Observed after the feed advances to `tick` (day-close = tick % 720 === 719).
 * Emits Wire / hype / price shocks at trigger; catch-up walks every skipped day-close and phase edge in order.
 * Cold start (lastTick null) evaluates from tick origin 0 through `tick` so day closes before START_TICK are not skipped.
 */
export class StormScheduler {
  private active: StormEvent | null = null;
  private lastEndTick: number | null = null;
  private lastDayClose: number | null = null;
  /** Last tick passed to observe (null = never). Catch-up is relative to this, like world.ts lastDay. */
  private lastTick: number | null = null;
  private wire: StormWireOut[] = [];
  private hype: StormHypeShock[] = [];
  /** Legacy flat queue (tests); publish path uses StormWireOut.prices only. */
  private prices: StormPriceShock[] = [];
  /** Depth multiplier window for graduated crypto coins: mult applies while tick < untilTick. */
  private depth: { mult: number; untilTick: number } | null = null;
  /** Permanent stock applyShock sets by storm id (durable via storm-world store). */
  private stockApplied: { stormId: string; shocks: StormPriceShock[] }[] = [];

  /** Current active storm (PRECURSOR or TRIGGER), or null. */
  peek(): StormEvent | null { return this.active ? { ...this.active } : null; }
  lastStormEndTick(): number | null { return this.lastEndTick; }
  observedTick(): number | null { return this.lastTick; }
  /** Maker depth multiplier for graduated crypto at `tick` (1 when none). */
  depthMult(tick: number): number {
    if (!this.depth || tick >= this.depth.untilTick) return 1;
    return this.depth.mult;
  }

  takeWire(): StormWireOut[] { const out = this.wire; this.wire = []; return out; }
  takeHypeShocks(): StormHypeShock[] { const out = this.hype; this.hype = []; return out; }
  /** Flat drain of any leftover queue (tests). Prefer StormWireOut.prices for attribution. */
  takePriceShocks(): StormPriceShock[] { const out = this.prices; this.prices = []; return out; }

  /** Durable snapshot (scheduler bookkeeping + permanent stock shock sets). Pending wire/hype/price queues are not stored. */
  snapshot(): StormWorldSnapshot {
    return {
      active: this.active ? { ...this.active } : null,
      lastEndTick: this.lastEndTick,
      lastDayClose: this.lastDayClose,
      lastTick: this.lastTick,
      depth: this.depth ? { ...this.depth } : null,
      stockApplied: this.stockApplied.map((r) => ({ stormId: r.stormId, shocks: r.shocks.map((p) => ({ ...p })) })),
    };
  }

  /** Restore durable bookkeeping. Clears pending wire/hype/price queues. Does not apply marks (caller re-applies stockApplied). */
  hydrate(snap: StormWorldSnapshot): void {
    this.active = snap.active ? { ...snap.active } : null;
    this.lastEndTick = snap.lastEndTick;
    this.lastDayClose = snap.lastDayClose;
    this.lastTick = snap.lastTick;
    this.depth = snap.depth ? { ...snap.depth } : null;
    this.stockApplied = snap.stockApplied.map((r) => ({
      stormId: r.stormId,
      shocks: r.shocks.map((p) => ({ ...p })),
    }));
    this.wire = [];
    this.hype = [];
    this.prices = [];
  }

  /** Storm ids whose stock applyShock set is already recorded (restart idempotency). */
  stockAppliedIds(): ReadonlySet<string> {
    return new Set(this.stockApplied.map((r) => r.stormId));
  }

  stockAppliedRows(): ReadonlyArray<{ stormId: string; shocks: readonly StormPriceShock[] }> {
    return this.stockApplied;
  }

  /**
   * Advance bookkeeping to `tick` (the tick just reached). If `tick` jumps past the last observed tick,
   * every day-close and phase edge in between is evaluated in chronological order (same draws as tick-by-tick).
   * First observe (cold start): evaluates from origin tick 0 through `tick` (closes day closes 24–37 at START_TICK).
   */
  observe(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) return;
    if (this.lastTick === null) {
      // Cold start from origin: do not skip day closes before the boot tick (GK 41d0f984 gap).
      let t = -1;
      while (t < tick) {
        const next = this.nextCriticalTick(Math.max(0, t + 1), tick);
        this.advanceTo(next);
        t = next;
      }
      this.lastTick = tick;
      return;
    }
    if (tick <= this.lastTick) return;
    let t = this.lastTick;
    while (t < tick) {
      const next = this.nextCriticalTick(t + 1, tick);
      this.advanceTo(next);
      t = next;
    }
    this.lastTick = tick;
  }

  /** Smallest critical tick in [from, until]: day-close, active trigger/end, or `until`. */
  private nextCriticalTick(from: number, until: number): number {
    let n = until;
    const d0 = dayOf(from), d1 = dayOf(until);
    for (let d = d0; d <= d1; d++) {
      const dc = dayCloseTick(d);
      if (dc >= from && dc <= until && dc < n) n = dc;
      if (dc > until) break;
    }
    const ev = this.active;
    if (ev) {
      if (ev.phase === "PRECURSOR" && ev.triggerTick >= from && ev.triggerTick <= until) n = Math.min(n, ev.triggerTick);
      if (ev.phase !== "ENDED" && ev.plannedEndTick >= from && ev.plannedEndTick <= until) n = Math.min(n, ev.plannedEndTick);
    }
    return n;
  }

  /** Apply phase edges and (if this tick is a day-close) the day-close start draw at exactly `tick`. */
  private advanceTo(tick: number): void {
    if (this.active) {
      const ev = this.active;
      if (ev.phase === "PRECURSOR" && tick >= ev.triggerTick) {
        ev.phase = "TRIGGER";
        const prices = stormStockShocks(ev.kind, ev.severity, ev.sectorIndex);
        this.wire.push({
          id: ev.id, kind: ev.kind, severity: ev.severity, sectorIndex: ev.sectorIndex,
          headlineKey: `wire.storm.${slugOf(ev.kind)}.hit`,
          causeKey: `wire.cause.storm.${slugOf(ev.kind)}.hit`,
          phase: "realized", breaking: true, slug: slugOf(ev.kind),
          prices,
        });
        if (ev.kind === "CRYPTO_FLUSH") {
          this.hype.push({ stormId: ev.id, delta: CRYPTO_FLUSH_HYPE * ev.severity });
          this.depth = { mult: CRYPTO_FLUSH_DEPTH_MULT, untilTick: ev.triggerTick + CRYPTO_FLUSH_DEPTH_TICKS };
        } else if (ev.kind === "LIQUIDITY_HICCUP") {
          // 04: assetFilter ALL in this base lands on graduated crypto (the only depth-using class here)
          this.depth = { mult: LIQUIDITY_HICCUP_DEPTH_MULT, untilTick: ev.triggerTick + LIQUIDITY_HICCUP_DEPTH_TICKS };
        } else if (prices.length) {
          // Flat queue kept for unit tests that still drain it; publish uses WireOut.prices only.
          for (const p of prices) this.prices.push(p);
          if (!this.stockApplied.some((r) => r.stormId === ev.id)) {
            this.stockApplied.push({ stormId: ev.id, shocks: prices.map((p) => ({ ...p })) });
          }
        }
      }
      if (ev.phase !== "ENDED" && tick >= ev.plannedEndTick) {
        ev.phase = "ENDED";
        this.lastEndTick = tick;
        this.active = null;
      }
    }
    if (tick % TICKS_PER_DAY !== TICKS_PER_DAY - 1) return;
    const day = dayOf(tick);
    if (this.lastDayClose !== null && day <= this.lastDayClose) return;
    this.lastDayClose = day;
    if (this.active) return;
    if (day < STORM_NO_START_FIRST_DAYS) return;
    if (this.lastEndTick !== null && tick - this.lastEndTick < STORM_COOLDOWN_DAYS * TICKS_PER_DAY) return;
    const d = stormDayDraw(day);
    if (!d.start) return;
    const pre = d.precursorDays;
    const precursorStartTick = tick + 1;
    const triggerTick = tick + 1 + pre * TICKS_PER_DAY;
    const plannedEndTick = triggerTick + STORM_EFFECT_DAYS[d.kind] * TICKS_PER_DAY;
    this.active = {
      id: `storm:${day}:${d.kind}`,
      kind: d.kind,
      severity: d.severity,
      sectorIndex: d.sectorIndex,
      precursorStartTick,
      triggerTick,
      plannedEndTick,
      phase: "PRECURSOR",
    };
  }

  /** Tests/admin: start `kind` now, bypassing rate and constraints (engine forceEvent analogue). Default precursor 0
   *  so the next observe(tick+1) triggers. Does not consume day-close draws. */
  forceStorm(kind: StormKind, opts: {
    severity?: number; precursorDays?: number; atTick: number; sectorIndex?: number;
  }): StormEvent {
    if (this.active) throw new Error("storm already active");
    const sev = opts.severity ?? 1;
    const pre = opts.precursorDays ?? 0;
    const tick = opts.atTick;
    const precursorStartTick = tick + 1;
    const triggerTick = tick + 1 + pre * TICKS_PER_DAY;
    const plannedEndTick = triggerTick + STORM_EFFECT_DAYS[kind] * TICKS_PER_DAY;
    const sectorIndex = opts.sectorIndex ?? 0;
    const ev: StormEvent = {
      id: `storm:force:${kind}:${tick}`,
      kind, severity: sev, sectorIndex, precursorStartTick, triggerTick, plannedEndTick, phase: "PRECURSOR",
    };
    this.active = ev;
    return { ...ev };
  }
}
