// Shared storm scheduler for this base (docs/v1/LAUNCHPAD.md "Storm durable correctness").
// 04 §3.16 storm + major + ripple + Crisis Week. Storms: rate 1/91 (×2 in CW), 8 kinds, one active, 7d cooldown,
// no start in first 24 GD. Majors/ripples/CW per crises.ts. Plays 04's role like world.ts for Fear: formulas
// copied and cited; the app does not import packages/engine/macro. Majors, ripples and Crisis Week live in crises.ts (composed here).
// Deterministic: per-day stream `macro:storm:<day>` only, so a restarted clock replays the same schedule (M1-05).
// Catch-up: when observe jumps across ticks, every skipped day-close and phase edge is evaluated in order (world.ts day loop).
// Cold start: the first observe evaluates from tick origin 0 (does not skip day closes 24–37 when booting at START_TICK).
// Per-wire prices: each StormWireOut carries its own stock shocks (no shared queue drain across two triggers in one step).
import { ASSETS } from "@/market/catalog";
import { Draws, TICKS_PER_DAY } from "./meme";
import {
  CrisisBook, CRISIS_WEEK_STORM_MULT, emptyCrisisBookkeeping, type CrisisBookkeeping, type CrisisWireOut,
  type MajorKindV1,
} from "./crises";

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
  /** Optional durable Fear/regime bookkeeping (world.ts). Absent on older files → genesis world. */
  readonly world?: import("./world").WorldSnapshot | null;
  /** Majors / ripples / Crisis Week bookkeeping. Absent on older files → empty. */
  readonly crises?: CrisisBookkeeping | null;
  /** Mid-decay applyShock residuals (04:1033). Absent on older files → re-apply full stockApplied then decay. */
  readonly shockResidual?: ReadonlyArray<{ readonly assetId: string; readonly log: number; readonly k: number }> | null;
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
  return { active: null, lastEndTick: null, lastDayClose: null, lastTick: null, depth: null, stockApplied: [], world: null, crises: emptyCrisisBookkeeping(), shockResidual: [] };
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
  /** Majors / ripples / Crisis Week (04 §3.16); composed, own stream. */
  readonly crises = new CrisisBook();
  /** True while cold-start catch-up walks history (no Wire / stock apply; bookkeeping only). */
  private replaying = false;

  /** Current active storm (PRECURSOR or TRIGGER), or null. */
  peek(): StormEvent | null { return this.active ? { ...this.active } : null; }
  /** Current active major (any non-ENDED phase), or null. */
  peekMajor() { return this.crises.activeMajor ? { ...this.crises.activeMajor } : null; }

  /** 04 §3.14.1 crisisTerm: 1 while a major is in TRIGGER/CONTAGION; else 0.5 while a storm is active; else 0. */
  crisisTerm(): 0 | 0.5 | 1 {
    if (this.crises.majorCrisisTerm() === 1) return 1;
    return this.active && this.active.phase !== "ENDED" ? 0.5 : 0;
  }
  lastStormEndTick(): number | null { return this.lastEndTick; }
  observedTick(): number | null { return this.lastTick; }
  /** Maker depth multiplier for graduated crypto at `tick` (1 when none). */
  depthMult(tick: number): number {
    if (!this.depth || tick >= this.depth.untilTick) return 1;
    return this.depth.mult;
  }

  takeWire(): StormWireOut[] { const out = this.wire; this.wire = []; return out; }
  /** Majors / ripples / Crisis Week Wire outs (separate from storm Wire). */
  takeCrisisWire(): CrisisWireOut[] { return this.crises.takeWire(); }
  takeHypeShocks(): StormHypeShock[] {
    const fromStorm = this.hype; this.hype = [];
    const fromCrisis = this.crises.takeHype();
    return [...fromStorm, ...fromCrisis];
  }
  /** Flat drain of any leftover queue (tests). Prefer StormWireOut.prices for attribution. */
  takePriceShocks(): StormPriceShock[] { const out = this.prices; this.prices = []; return out; }

  /** Durable snapshot (scheduler bookkeeping + permanent stock shock sets). Pending wire/hype/price queues are not stored. */
  snapshot(): StormWorldSnapshot {
    // Merge crisis stockApplied into the durable list (idempotent by id).
    for (const r of this.crises.stockApplied) {
      if (!this.stockApplied.some((x) => x.stormId === r.stormId)) {
        this.stockApplied.push({ stormId: r.stormId, shocks: r.shocks.map((p) => ({ ...p })) });
      }
    }
    return {
      active: this.active ? { ...this.active } : null,
      lastEndTick: this.lastEndTick,
      lastDayClose: this.lastDayClose,
      lastTick: this.lastTick,
      depth: this.depth ? { ...this.depth } : null,
      stockApplied: this.stockApplied.map((r) => ({ stormId: r.stormId, shocks: r.shocks.map((p) => ({ ...p })) })),
      crises: this.crises.snapshot(),
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
    this.crises.hydrate(snap.crises ?? emptyCrisisBookkeeping());
    // Rebuild crisis.stockApplied from durable rows whose ids look like major:/ripple:
    this.crises.stockApplied = this.stockApplied
      .filter((r) => r.stormId.startsWith("major:") || r.stormId.startsWith("ripple:"))
      .map((r) => ({ stormId: r.stormId, shocks: r.shocks.map((p) => ({ ...p })) }));
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
      // Unit/scheduler tests rely on Wire emission during this walk. LiveMarket boot uses bootstrapTo()
      // (bookkeeping-only) before the first observe so virgin marks are not repriced by history.
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
    const c = this.crises.nextCritical(from, until);
    if (c !== null && c < n) n = c;
    return n;
  }

  /** Apply phase edges and (if this tick is a day-close) the day-close start draw at exactly `tick`. */
  private advanceTo(tick: number): void {
    // Majors / ripples / CW announce phase edges first (same tick order as day-close after).
    this.crises.advancePhases(tick);
    const depthReq = this.crises.takeDepthReq();
    if (depthReq) this.depth = depthReq;

    if (this.active) {
      const ev = this.active;
      if (ev.phase === "PRECURSOR" && tick >= ev.triggerTick) {
        ev.phase = "TRIGGER";
        if (!this.replaying) {
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

    // Ripples + majors + CW forced-storm request (always; does not require storm free).
    this.crises.dayClose(tick, {
      stormActive: this.active !== null,
      tryForceStorm: () => {
        if (this.active) return false;
        // Forced RATE_SCARE (stable) with 1-day precursor; does not consume storm day draw.
        const precursorStartTick = tick + 1;
        const triggerTick = tick + 1 + TICKS_PER_DAY;
        const plannedEndTick = triggerTick + STORM_EFFECT_DAYS.RATE_SCARE * TICKS_PER_DAY;
        this.active = {
          id: `storm:cwforce:${day}:RATE_SCARE`,
          kind: "RATE_SCARE", severity: 1, sectorIndex: 0,
          precursorStartTick, triggerTick, plannedEndTick, phase: "PRECURSOR",
        };
        return true;
      },
    });
    for (const r of this.crises.stockApplied) {
      if (!this.stockApplied.some((x) => x.stormId === r.stormId)) {
        this.stockApplied.push({ stormId: r.stormId, shocks: r.shocks.map((p) => ({ ...p })) });
      }
    }

    // Natural storm start (rate ×2 in Crisis Week).
    if (this.active) return;
    if (day < STORM_NO_START_FIRST_DAYS) return;
    if (this.lastEndTick !== null && tick - this.lastEndTick < STORM_COOLDOWN_DAYS * TICKS_PER_DAY) return;
    const inCw = this.crises.inCrisisWeek(tick);
    const d = stormDayDraw(day);
    // stormDayDraw uses base rate 1/91. In Crisis Week, also start with residual P so overall ≈ 1-e^(-2/91)
    // without re-consuming macro:storm:<day> (kind/severity/precursor stay identical for the same day).
    let doStart = d.start;
    if (inCw && !d.start) {
      const rate = STORM_RATE * CRISIS_WEEK_STORM_MULT;
      const u = new Draws(`macro:storm-cw:${day}`).uniform();
      const pBase = 1 - Math.exp(-STORM_RATE);
      const pCw = 1 - Math.exp(-rate);
      doStart = u < (pCw - pBase) / Math.max(1e-12, 1 - pBase);
    }
    if (!doStart) return;
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

  /**
   * LiveMarket boot only: walk day-closes/phase edges from origin to `tick` with Wire/shock emission
   * suppressed (bookkeeping only). Sets lastTick so the next observe is live-forward.
   * Clears any Wire/hype/price queues. Does not apply marks (caller has virgin path).
   */
  bootstrapTo(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) return;
    if (this.lastTick !== null) return;
    this.replaying = true;
    this.crises.replaying = true;
    let t = -1;
    while (t < tick) {
      const next = this.nextCriticalTick(Math.max(0, t + 1), tick);
      this.advanceTo(next);
      t = next;
    }
    this.replaying = false;
    this.crises.replaying = false;
    this.lastTick = tick;
    this.wire = [];
    this.hype = [];
    this.prices = [];
    this.crises.wire = [];
    this.crises.hype = [];
    this.crises.depthReq = null;
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

  /** Tests/admin: start a V1 major now, bypassing rate and constraints. */
  forceMajor(kind: MajorKindV1, opts: {
    severity?: number; precursorDays?: number; contagionDays?: number; atTick: number;
  }) {
    return this.crises.forceMajor(kind, opts);
  }
}
