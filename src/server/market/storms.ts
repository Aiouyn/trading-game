// Shared storm scheduler for this base (docs/v1/LAUNCHPAD.md "Shared storm scheduler + CRYPTO_FLUSH").
// 04 §3.16.1–3 storm tier only: rate 1/91, 8 kinds, one active, 7-day cooldown, no start in first 24 game days
// from tick 0, precursor 1–2 game days. Plays 04's role here the same way world.ts plays Fear/regime: formulas
// copied and cited; the app does not import packages/engine/macro. Majors, ripples and Crisis Week are out of scope.
// Deterministic: per-day stream `macro:storm:<day>` only, so a restarted clock replays the same schedule (M1-05).
import { Draws, TICKS_PER_DAY } from "./meme";

export const STORM_KINDS = [
  "RATE_SCARE", "OIL_SPIKE_LITE", "CRYPTO_FLUSH", "CREDIT_WOBBLE", "FX_SQUALL",
  "SECTOR_ROTATION", "EARNINGS_SCARE", "LIQUIDITY_HICCUP",
] as const;
export type StormKind = (typeof STORM_KINDS)[number];

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
  readonly headlineKey: string;
  readonly causeKey: string;
  readonly phase: "realized";
  readonly breaking: boolean;
  readonly slug: string;
}
/** Durable CRYPTO_FLUSH hype once per storm id (applied by the broker sweep into saved pools). */
export interface StormHypeShock { readonly stormId: string; readonly delta: number }

const pFromRate = (r: number) => 1 - Math.exp(-r);
const dayOf = (tick: number) => Math.floor(tick / TICKS_PER_DAY);
const slugOf = (kind: StormKind): string => kind.toLowerCase().replace(/_/g, "-");

/** One day-close draw (04 §3.16.3 step 2). Pure: same day always yields the same decision. */
export function stormDayDraw(day: number): { start: boolean; kind: StormKind; severity: number; precursorDays: number } {
  const r = new Draws(`macro:storm:${day}`);
  const uStart = r.uniform(), uKind = r.uniform(), uPre = r.uniform();
  const x = uKind * STORM_KINDS.length, i = Math.min(STORM_KINDS.length - 1, Math.floor(x)), f = x - i;
  return {
    start: uStart < pFromRate(STORM_RATE),
    kind: STORM_KINDS[i]!,
    severity: 0.6 + 0.8 * f,
    precursorDays: 1 + Math.floor(2 * uPre),
  };
}

/**
 * The clock's storm state. Observed once per tick after the feed advances to `tick` (day-close = tick % 720 === 719).
 * Emits at most one Wire trigger item and at most one CRYPTO_FLUSH hype shock per tick (taken by the clock / sweep).
 */
export class StormScheduler {
  private active: StormEvent | null = null;
  private lastEndTick: number | null = null;
  private lastDayClose: number | null = null;
  private wire: StormWireOut[] = [];
  private hype: StormHypeShock[] = [];
  /** Depth multiplier window for graduated crypto coins: mult applies while tick < untilTick. */
  private depth: { mult: number; untilTick: number } | null = null;

  /** Current active storm (PRECURSOR or TRIGGER), or null. */
  peek(): StormEvent | null { return this.active ? { ...this.active } : null; }
  lastStormEndTick(): number | null { return this.lastEndTick; }
  /** Maker depth multiplier for graduated crypto at `tick` (1 when none). */
  depthMult(tick: number): number {
    if (!this.depth || tick >= this.depth.untilTick) return 1;
    return this.depth.mult;
  }

  takeWire(): StormWireOut[] { const out = this.wire; this.wire = []; return out; }
  takeHypeShocks(): StormHypeShock[] { const out = this.hype; this.hype = []; return out; }

  /** Advance bookkeeping to `tick` (the tick just reached). Day-close may start a storm; phase edges fire here. */
  observe(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) return;
    // phase edges at the exact tick
    if (this.active) {
      const ev = this.active;
      if (ev.phase === "PRECURSOR" && tick >= ev.triggerTick) {
        ev.phase = "TRIGGER";
        this.wire.push({
          id: ev.id, kind: ev.kind, severity: ev.severity,
          headlineKey: `wire.storm.${slugOf(ev.kind)}.hit`,
          causeKey: `wire.cause.storm.${slugOf(ev.kind)}.hit`,
          phase: "realized", breaking: true, slug: slugOf(ev.kind),
        });
        if (ev.kind === "CRYPTO_FLUSH") {
          this.hype.push({ stormId: ev.id, delta: CRYPTO_FLUSH_HYPE * ev.severity });
          this.depth = { mult: CRYPTO_FLUSH_DEPTH_MULT, untilTick: ev.triggerTick + CRYPTO_FLUSH_DEPTH_TICKS };
        } else if (ev.kind === "LIQUIDITY_HICCUP") {
          // 04: assetFilter ALL in this base lands on graduated crypto (the only depth-using class here)
          this.depth = { mult: LIQUIDITY_HICCUP_DEPTH_MULT, untilTick: ev.triggerTick + LIQUIDITY_HICCUP_DEPTH_TICKS };
        }
      }
      if (ev.phase !== "ENDED" && tick >= ev.plannedEndTick) {
        ev.phase = "ENDED";
        this.lastEndTick = tick;
        this.active = null;
      }
    }
    // day close: t ≡ 719 (mod 720)
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
      precursorStartTick,
      triggerTick,
      plannedEndTick,
      phase: "PRECURSOR",
    };
  }

  /** Tests/admin: start `kind` now, bypassing rate and constraints (engine forceEvent analogue). Default precursor 0
   *  so the next observe(tick+1) triggers. Does not consume day-close draws. */
  forceStorm(kind: StormKind, opts: { severity?: number; precursorDays?: number; atTick: number }): StormEvent {
    if (this.active) throw new Error("storm already active");
    const sev = opts.severity ?? 1;
    const pre = opts.precursorDays ?? 0;
    const tick = opts.atTick;
    const precursorStartTick = tick + 1;
    const triggerTick = tick + 1 + pre * TICKS_PER_DAY;
    const plannedEndTick = triggerTick + STORM_EFFECT_DAYS[kind] * TICKS_PER_DAY;
    const ev: StormEvent = {
      id: `storm:force:${kind}:${tick}`,
      kind, severity: sev, precursorStartTick, triggerTick, plannedEndTick, phase: "PRECURSOR",
    };
    this.active = ev;
    return { ...ev };
  }
}
