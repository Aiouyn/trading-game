// MAJOR + RIPPLE + Crisis Week for this base (docs/v1/LAUNCHPAD.md "Major crises").
// 04 §3.16.1–4 / engine scheduler.ts shapes; app does not import packages/engine/macro.
// Storms stay on `macro:storm:<day>` (unchanged). Majors/ripples/CW use `macro:events:<day>` and
// `macro:crisis-week:<chapter>` so storm schedules do not shift.
// V1-IN majors (equal weights, always drawable; live eligibility/vuln held): six kinds with stock proxies.
// Other catalog kinds are out of the draw (Wire-only path not scheduled until CatalogInputs live).
// Ripples: SECTOR_SHOCK / REGULATORY_NOTE move sector equities; other kinds Wire-only (disclosed).
// Trigger = precursor end (no UTC band snap; timezoneBandNext still rotates). Phases: PRECURSOR→TRIGGER→CONTAGION→ENDED
// (POLICY/RECOVERY engines out). crisisTerm=1 in TRIGGER/CONTAGION.
import { ASSETS } from "@/market/catalog";
import { Draws, TICKS_PER_DAY } from "./meme";

/** Same shape as storms.StormPriceShock (kept local to avoid a storms↔crises import cycle). */
export interface CrisisPriceShock { readonly assetId: string; readonly bp: number }
export type StormPriceShock = CrisisPriceShock;

/** Catalog equity sectors in stable ASSETS order (mirrors storms.EQUITY_SECTORS). */
export const EQUITY_SECTORS: readonly string[] = (() => {
  const out: string[] = [];
  for (const a of ASSETS) {
    if (a.class !== "equity") continue;
    if (!out.includes(a.sector)) out.push(a.sector);
  }
  return out;
})();

export const RIPPLE_KINDS = [
  "SECTOR_SHOCK", "COMMODITY_SUPPLY", "COMMODITY_DEMAND", "REGULATORY_NOTE", "LOCAL_BOOM",
] as const;
export type RippleKind = (typeof RIPPLE_KINDS)[number];

/** V1-IN majors that move catalog marks (equal base weight; disclosed simplification of 04 eligibility/vuln). */
export const MAJOR_KINDS_V1 = [
  "EQUITY_BUBBLE_BURST", "OIL_SHOCK", "FLASH_CRASH", "CRYPTO_WINTER", "TRADE_WAR", "STAGFLATION",
] as const;
export type MajorKindV1 = (typeof MAJOR_KINDS_V1)[number];

export const MACRO_MAJOR_BASE_RATE = 3.6e-4;
export const MACRO_MAJOR_MIN_GAP_DAYS = 504;
export const MACRO_RIPPLE_RATE = 1 / 7;
export const MAJOR_PRECURSOR_MIN_DAYS = 8;
export const NO_TRIGGER_FINAL_DAYS = 48;
export const GAME_DAYS_PER_CHAPTER = 1344;
export const CRISIS_WEEK_DAYS = 168;
export const CRISIS_WEEK_P = 0.6;
export const CRISIS_WEEK_STORM_MULT = 2;
export const CRISIS_WEEK_MAJOR_MULT = 1.5;
export const CRISIS_WEEK_ANNOUNCE_DAYS = 48;
export const MAX_RIPPLES = 3;
/** FLASH_CRASH: maker depth ×0.2 for 30 ticks (05 makerWithdrawal proxy on graduated crypto). */
export const FLASH_CRASH_DEPTH_MULT = 0.2;
export const FLASH_CRASH_DEPTH_TICKS = 30;
/** CRYPTO_WINTER: clamp hype toward 0 via applyStormHype delta −1 once per major id. */
export const CRYPTO_WINTER_HYPE_DELTA = -1;

export type MajorPhase = "PRECURSOR" | "TRIGGER" | "CONTAGION" | "ENDED";
export interface MajorEvent {
  readonly id: string;
  readonly kind: MajorKindV1;
  readonly severity: number;
  readonly precursorStartTick: number;
  readonly triggerTick: number;
  /** End of TRIGGER (= trigger + 1 GD). */
  readonly contagionStartTick: number;
  readonly plannedEndTick: number;
  phase: MajorPhase;
}
export interface RippleEvent {
  readonly id: string;
  readonly kind: RippleKind;
  readonly sign: 1 | -1;
  readonly size: number;
  readonly lengthDays: number;
  readonly sectorIndex: number;
  readonly startTick: number;
  readonly plannedEndTick: number;
  phase: "ACTIVE" | "ENDED";
}
export interface CrisisWeek {
  readonly announcedTick: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly themeKey: string;
}
export interface CrisisWeekSnap {
  readonly week: CrisisWeek | null;
  readonly usedThisChapter: boolean;
  readonly chapter: number;
}

const CRISIS_WEEK_THEMES = [
  "storm-season", "the-squeeze", "fault-lines", "cold-front", "supply-shock-week", "the-long-night",
] as const;

export type CrisisTier = "STORM" | "MAJOR" | "RIPPLE" | "CRISIS_WEEK";
/** Wire out for majors / ripples / crisis-week announce (storms keep StormWireOut). */
export interface CrisisWireOut {
  readonly id: string;
  readonly tier: CrisisTier;
  readonly kind: string;
  readonly severity: number;
  readonly sectorIndex: number;
  readonly headlineKey: string;
  readonly causeKey: string;
  readonly phase: "realized";
  readonly breaking: boolean;
  readonly slug: string;
  readonly prices: readonly StormPriceShock[];
}

const pFromRate = (r: number) => 1 - Math.exp(-r);
const dayOf = (tick: number) => Math.floor(tick / TICKS_PER_DAY);
const dayCloseTick = (day: number) => day * TICKS_PER_DAY + TICKS_PER_DAY - 1;
const slugOf = (kind: string): string => kind.toLowerCase().replace(/_/g, "-");
const chapterOf = (day: number) => Math.floor(day / GAME_DAYS_PER_CHAPTER);
const chapterStartDay = (ch: number) => ch * GAME_DAYS_PER_CHAPTER;

/** Smallest k with P(N ≤ k) ≥ u for N ~ Poisson(mean). */
export function poissonInverse(u: number, mean: number): number {
  let k = 0, p = Math.exp(-mean), c = p;
  while (u > c && k < 60) { k++; p *= mean / k; c += p; }
  return k;
}

export function crisisWeekActive(week: CrisisWeek | null, tick: number): boolean {
  return week !== null && tick >= week.startTick && tick < week.endTick;
}

/** Pure day draw for majors+ripples (does not consume storm stream). */
export function eventsDayDraw(day: number): {
  rippleU: number; rippleSlots: { kindU: number; targetU: number; signU: number; sizeU: number; lenU: number }[];
  majorStartU: number; majorKindU: number; majorSevU: number; majorPreU: number; majorContU: number;
} {
  const r = new Draws(`macro:events:${day}`);
  const rippleU = r.uniform();
  const rippleSlots = Array.from({ length: MAX_RIPPLES }, () => ({
    kindU: r.uniform(), targetU: r.uniform(), signU: r.uniform(), sizeU: r.uniform(), lenU: r.uniform(),
  }));
  return {
    rippleU, rippleSlots,
    majorStartU: r.uniform(), majorKindU: r.uniform(), majorSevU: r.uniform(),
    majorPreU: r.uniform(), majorContU: r.uniform(),
  };
}

export function crisisWeekChapterDraw(chapter: number): { yes: boolean; weekIndex: number; themeIndex: number } {
  const r = new Draws(`macro:crisis-week:${chapter}`);
  const u1 = r.uniform(), u2 = r.uniform(), u3 = r.uniform();
  return {
    yes: u1 < CRISIS_WEEK_P,
    weekIndex: 2 + Math.floor(6 * u2), // real weeks 2–7 of the chapter
    themeIndex: Math.min(CRISIS_WEEK_THEMES.length - 1, Math.floor(u3 * CRISIS_WEEK_THEMES.length)),
  };
}

export function majorStockShocks(kind: MajorKindV1, severity: number): StormPriceShock[] {
  const sev = severity;
  switch (kind) {
    case "EQUITY_BUBBLE_BURST": {
      // Proxy of erpShock + index −30..−45% band midpoint ~−37.5% × severity fraction around 1.
      const out: StormPriceShock[] = [{ assetId: "GX", bp: Math.round(-3750 * sev) }];
      for (const a of ASSETS) {
        if (a.class !== "equity") continue;
        const tech = a.sector === "Technology";
        out.push({ assetId: a.assetId, bp: Math.round((tech ? -6000 : -3000) * sev) });
      }
      return out;
    }
    case "OIL_SHOCK":
      return [
        { assetId: "VRDN", bp: Math.round(8000 * sev) },
        { assetId: "HALC", bp: Math.round(-4000 * sev) },
        { assetId: "KILN", bp: Math.round(-1500 * sev) },
        { assetId: "GX", bp: Math.round(-800 * sev) },
      ];
    case "FLASH_CRASH":
      // Session crash proxy: GX −10% (recovery path not modelled; one-shot).
      return [{ assetId: "GX", bp: Math.round(-1000 * sev) }];
    case "CRYPTO_WINTER":
      return []; // hype path, not stock marks
    case "TRADE_WAR": {
      const out: StormPriceShock[] = [{ assetId: "GX", bp: Math.round(-1200 * sev) }];
      for (const a of ASSETS) {
        if (a.class === "equity") out.push({ assetId: a.assetId, bp: Math.round(-2000 * sev) });
      }
      return out;
    }
    case "STAGFLATION": {
      const out: StormPriceShock[] = [
        { assetId: "GX", bp: Math.round(-1500 * sev) },
        { assetId: "AVB", bp: Math.round(-1000 * sev) },
        { assetId: "TIDE", bp: Math.round(-1000 * sev) },
      ];
      for (const a of ASSETS) {
        if (a.class === "equity" && a.assetId !== "AVB" && a.assetId !== "TIDE") {
          out.push({ assetId: a.assetId, bp: Math.round(-1500 * sev) });
        }
      }
      return out;
    }
  }
}

export function rippleStockShocks(kind: RippleKind, sign: 1 | -1, size: number, sectorIndex: number): StormPriceShock[] {
  if (kind !== "SECTOR_SHOCK" && kind !== "REGULATORY_NOTE") return []; // Wire-only until commodity/city engines
  const n = EQUITY_SECTORS.length;
  if (n < 1) return [];
  const sector = EQUITY_SECTORS[((sectorIndex % n) + n) % n]!;
  const bp = Math.round(sign * size * 10_000);
  const out: StormPriceShock[] = [];
  for (const a of ASSETS) {
    if (a.class === "equity" && a.sector === sector) out.push({ assetId: a.assetId, bp });
  }
  return out;
}

export type MajorBlock = "ACTIVE" | "GAP" | "FINAL_48" | "FIRST_24" | "PLAYER_SUPPRESS";

export function constraintsAllowMajor(opts: {
  activeMajor: boolean;
  lastMajorTriggerTick: number | null;
  plannedTriggerTick: number;
  dayCloseTick: number;
  chapterStartTick: number;
  chapterEndTick: number;
  playerSuppressUntil: number | null;
}): { ok: boolean; reason?: MajorBlock } {
  const { activeMajor, lastMajorTriggerTick, plannedTriggerTick, dayCloseTick, chapterStartTick, chapterEndTick, playerSuppressUntil } = opts;
  if (activeMajor) return { ok: false, reason: "ACTIVE" };
  if (lastMajorTriggerTick !== null && plannedTriggerTick - lastMajorTriggerTick < MACRO_MAJOR_MIN_GAP_DAYS * TICKS_PER_DAY) {
    return { ok: false, reason: "GAP" };
  }
  if (plannedTriggerTick >= chapterEndTick - NO_TRIGGER_FINAL_DAYS * TICKS_PER_DAY) return { ok: false, reason: "FINAL_48" };
  if (dayCloseTick + 1 < chapterStartTick + 24 * TICKS_PER_DAY) return { ok: false, reason: "FIRST_24" };
  if (playerSuppressUntil !== null && dayCloseTick < playerSuppressUntil) return { ok: false, reason: "PLAYER_SUPPRESS" };
  return { ok: true };
}

/** Bookkeeping for majors / ripples / Crisis Week (persisted beside storms in storm-world store). */
export interface CrisisBookkeeping {
  readonly activeMajor: MajorEvent | null;
  readonly activeRipples: readonly RippleEvent[];
  readonly lastMajorTriggerTick: number | null;
  readonly lastMajorEndTick: number | null;
  readonly crisisWeek: CrisisWeek | null;
  readonly crisisWeekUsedThisChapter: boolean;
  readonly crisisWeekChapter: number | null;
  readonly timezoneBandNext: 0 | 1 | 2;
  readonly playerCausedSuppressUntil: number | null;
  /** Storm forced on CW day 3 already attempted/done for this week startTick. */
  readonly crisisWeekForcedStormAt: number | null;
}

export function emptyCrisisBookkeeping(): CrisisBookkeeping {
  return {
    activeMajor: null, activeRipples: [], lastMajorTriggerTick: null, lastMajorEndTick: null,
    crisisWeek: null, crisisWeekUsedThisChapter: false, crisisWeekChapter: null,
    timezoneBandNext: 0, playerCausedSuppressUntil: null, crisisWeekForcedStormAt: null,
  };
}

export class CrisisBook {
  /** Set by StormScheduler during cold-start replay (no Wire / stock record). */
  replaying = false;
  activeMajor: MajorEvent | null = null;
  activeRipples: RippleEvent[] = [];
  lastMajorTriggerTick: number | null = null;
  lastMajorEndTick: number | null = null;
  crisisWeek: CrisisWeek | null = null;
  crisisWeekUsedThisChapter = false;
  crisisWeekChapter: number | null = null;
  timezoneBandNext: 0 | 1 | 2 = 0;
  playerCausedSuppressUntil: number | null = null;
  crisisWeekForcedStormAt: number | null = null;
  wire: CrisisWireOut[] = [];
  hype: { stormId: string; delta: number }[] = [];
  /** Depth window requests (FLASH_CRASH); applied by StormScheduler. */
  depthReq: { mult: number; untilTick: number } | null = null;
  stockApplied: { stormId: string; shocks: StormPriceShock[] }[] = [];

  snapshot(): CrisisBookkeeping {
    return {
      activeMajor: this.activeMajor ? { ...this.activeMajor } : null,
      activeRipples: this.activeRipples.map((r) => ({ ...r })),
      lastMajorTriggerTick: this.lastMajorTriggerTick,
      lastMajorEndTick: this.lastMajorEndTick,
      crisisWeek: this.crisisWeek ? { ...this.crisisWeek } : null,
      crisisWeekUsedThisChapter: this.crisisWeekUsedThisChapter,
      crisisWeekChapter: this.crisisWeekChapter,
      timezoneBandNext: this.timezoneBandNext,
      playerCausedSuppressUntil: this.playerCausedSuppressUntil,
      crisisWeekForcedStormAt: this.crisisWeekForcedStormAt,
    };
  }

  hydrate(snap: CrisisBookkeeping): void {
    this.activeMajor = snap.activeMajor ? { ...snap.activeMajor } : null;
    this.activeRipples = snap.activeRipples.map((r) => ({ ...r }));
    this.lastMajorTriggerTick = snap.lastMajorTriggerTick;
    this.lastMajorEndTick = snap.lastMajorEndTick;
    this.crisisWeek = snap.crisisWeek ? { ...snap.crisisWeek } : null;
    this.crisisWeekUsedThisChapter = snap.crisisWeekUsedThisChapter;
    this.crisisWeekChapter = snap.crisisWeekChapter;
    this.timezoneBandNext = snap.timezoneBandNext;
    this.playerCausedSuppressUntil = snap.playerCausedSuppressUntil;
    this.crisisWeekForcedStormAt = snap.crisisWeekForcedStormAt;
    this.wire = [];
    this.hype = [];
    this.depthReq = null;
  }

  takeWire(): CrisisWireOut[] { const o = this.wire; this.wire = []; return o; }
  takeHype(): { stormId: string; delta: number }[] { const o = this.hype; this.hype = []; return o; }
  takeDepthReq(): { mult: number; untilTick: number } | null { const o = this.depthReq; this.depthReq = null; return o; }

  /** crisisTerm contribution from majors only (1 in TRIGGER/CONTAGION). */
  majorCrisisTerm(): 0 | 1 {
    const m = this.activeMajor;
    return m && (m.phase === "TRIGGER" || m.phase === "CONTAGION") ? 1 : 0;
  }

  inCrisisWeek(tick: number): boolean { return crisisWeekActive(this.crisisWeek, tick); }

  /** Ensure chapter-open Crisis Week draw has run for the chapter containing `day`. */
  ensureChapter(day: number): void {
    const ch = chapterOf(day);
    if (this.crisisWeekChapter === ch) return;
    // New chapter: reset week bookkeeping for this chapter.
    this.crisisWeekChapter = ch;
    this.crisisWeekUsedThisChapter = false;
    this.crisisWeek = null;
    this.crisisWeekForcedStormAt = null;
    const d = crisisWeekChapterDraw(ch);
    if (!d.yes) return;
    const c0 = chapterStartDay(ch) * TICKS_PER_DAY;
    const startTick = c0 + (d.weekIndex - 1) * CRISIS_WEEK_DAYS * TICKS_PER_DAY;
    const endTick = startTick + CRISIS_WEEK_DAYS * TICKS_PER_DAY;
    const announcedTick = startTick - CRISIS_WEEK_ANNOUNCE_DAYS * TICKS_PER_DAY;
    this.crisisWeek = {
      announcedTick: Math.max(announcedTick, c0),
      startTick, endTick,
      themeKey: CRISIS_WEEK_THEMES[d.themeIndex]!,
    };
    this.crisisWeekUsedThisChapter = true;
  }

  /** Phase edges + crisis-week announce at exactly `tick` (before day-close starts). */
  advancePhases(tick: number): void {
    this.ensureChapter(dayOf(Math.max(0, tick)));
    const cw = this.crisisWeek;
    if (cw && tick === cw.announcedTick && !this.replaying) {
      this.wire.push({
        id: `cwk:${cw.startTick}`,
        tier: "CRISIS_WEEK",
        kind: "CRISIS_WEEK",
        severity: 1,
        sectorIndex: 0,
        headlineKey: `wire.crisis-week.announced.${cw.themeKey}`,
        causeKey: "wire.cause.crisis-week.announced",
        phase: "realized",
        breaking: true,
        slug: cw.themeKey,
        prices: [],
      });
    }
    const m = this.activeMajor;
    if (m) {
      if (m.phase === "PRECURSOR" && tick >= m.triggerTick) {
        m.phase = "TRIGGER";
        if (!this.replaying) {
          const prices = majorStockShocks(m.kind, m.severity);
          this.wire.push({
            id: m.id, tier: "MAJOR", kind: m.kind, severity: m.severity, sectorIndex: 0,
            headlineKey: `wire.major.${slugOf(m.kind)}.hit`,
            causeKey: `wire.cause.major.${slugOf(m.kind)}.hit`,
            phase: "realized", breaking: true, slug: slugOf(m.kind), prices,
          });
          if (m.kind === "CRYPTO_WINTER") {
            this.hype.push({ stormId: m.id, delta: CRYPTO_WINTER_HYPE_DELTA });
          } else if (m.kind === "FLASH_CRASH") {
            this.depthReq = { mult: FLASH_CRASH_DEPTH_MULT, untilTick: m.triggerTick + FLASH_CRASH_DEPTH_TICKS };
          }
          if (prices.length && !this.stockApplied.some((r) => r.stormId === m.id)) {
            this.stockApplied.push({ stormId: m.id, shocks: prices.map((p) => ({ ...p })) });
          }
        }
      }
      if (m.phase === "TRIGGER" && tick >= m.contagionStartTick) {
        m.phase = "CONTAGION";
      }
      if (m.phase !== "ENDED" && tick >= m.plannedEndTick) {
        m.phase = "ENDED";
        this.lastMajorEndTick = tick;
        this.activeMajor = null;
      }
    }
    for (const r of this.activeRipples) {
      if (r.phase === "ACTIVE" && tick >= r.plannedEndTick) r.phase = "ENDED";
    }
    this.activeRipples = this.activeRipples.filter((r) => r.phase !== "ENDED");
  }

  /**
   * Day-close starts (ripples + majors). `stormForced` callback may start a forced CW day-3 storm
   * when the storm scheduler reports free; returns whether a forced storm was requested.
   */
  dayClose(tick: number, opts: {
    stormActive: boolean;
    tryForceStorm: () => boolean;
  }): void {
    if (tick % TICKS_PER_DAY !== TICKS_PER_DAY - 1) return;
    const day = dayOf(tick);
    this.ensureChapter(day);
    const d = eventsDayDraw(day);
    const inCw = crisisWeekActive(this.crisisWeek, tick);

    // Ripples
    const nRip = poissonInverse(d.rippleU, MACRO_RIPPLE_RATE);
    for (let k = 0; k < MAX_RIPPLES && k < nRip; k++) {
      if (this.activeRipples.length >= MAX_RIPPLES) break;
      const slot = d.rippleSlots[k]!;
      const xk = slot.kindU * RIPPLE_KINDS.length;
      const ik = Math.min(RIPPLE_KINDS.length - 1, Math.floor(xk));
      const kind = RIPPLE_KINDS[ik]!;
      const sign: 1 | -1 = slot.signU < 0.5 ? -1 : 1;
      const size = 0.03 + 0.05 * slot.sizeU;
      const lengthDays = 1 + Math.floor(3 * slot.lenU);
      const nSec = Math.max(1, EQUITY_SECTORS.length);
      const sectorIndex = Math.min(nSec - 1, Math.floor(slot.targetU * nSec));
      const startTick = tick + 1;
      const plannedEndTick = startTick + lengthDays * TICKS_PER_DAY;
      const id = `ripple:${day}:${k}:${kind}`;
      const prices = rippleStockShocks(kind, sign, size, sectorIndex);
      const ev: RippleEvent = {
        id, kind, sign, size, lengthDays, sectorIndex, startTick, plannedEndTick, phase: "ACTIVE",
      };
      this.activeRipples.push(ev);
      if (!this.replaying) {
        this.wire.push({
          id, tier: "RIPPLE", kind, severity: size, sectorIndex,
          headlineKey: `wire.ripple.${slugOf(kind)}.hit`,
          causeKey: `wire.cause.ripple.${slugOf(kind)}.hit`,
          phase: "realized", breaking: false, slug: slugOf(kind), prices,
        });
        if (prices.length && !this.stockApplied.some((r) => r.stormId === id)) {
          this.stockApplied.push({ stormId: id, shocks: prices.map((p) => ({ ...p })) });
        }
      }
    }

    // Crisis Week forced storm on day 3 of the week (04 §3.16.3).
    const cw = this.crisisWeek;
    if (cw && inCw) {
      const weekDay0 = dayOf(cw.startTick);
      const today = day;
      if (today === weekDay0 + 2 && this.crisisWeekForcedStormAt !== cw.startTick && !opts.stormActive) {
        if (opts.tryForceStorm()) this.crisisWeekForcedStormAt = cw.startTick;
      }
    }

    // Majors
    const ch = chapterOf(day);
    const c0 = chapterStartDay(ch) * TICKS_PER_DAY;
    const cEnd = c0 + GAME_DAYS_PER_CHAPTER * TICKS_PER_DAY;
    const lambda = MACRO_MAJOR_BASE_RATE * (inCw ? CRISIS_WEEK_MAJOR_MULT : 1);
    const pre = Math.max(MAJOR_PRECURSOR_MIN_DAYS, 8 + Math.floor(8 * d.majorPreU));
    const plannedTrigger = tick + 1 + pre * TICKS_PER_DAY;
    const want = d.majorStartU < pFromRate(lambda);
    if (want) {
      const allow = constraintsAllowMajor({
        activeMajor: this.activeMajor !== null,
        lastMajorTriggerTick: this.lastMajorTriggerTick,
        plannedTriggerTick: plannedTrigger,
        dayCloseTick: tick,
        chapterStartTick: c0,
        chapterEndTick: cEnd,
        playerSuppressUntil: this.playerCausedSuppressUntil,
      });
      if (allow.ok) {
        const x = d.majorKindU * MAJOR_KINDS_V1.length;
        const i = Math.min(MAJOR_KINDS_V1.length - 1, Math.floor(x));
        const kind = MAJOR_KINDS_V1[i]!;
        const severity = 0.6 + 0.8 * d.majorSevU;
        const contagionDays = 5 + Math.floor(25 * d.majorContU); // U(5,30) via floor
        const precursorStartTick = tick + 1;
        const triggerTick = plannedTrigger;
        const contagionStartTick = triggerTick + TICKS_PER_DAY; // TRIGGER lasts 1 GD
        const plannedEndTick = contagionStartTick + contagionDays * TICKS_PER_DAY;
        this.activeMajor = {
          id: `major:${day}:${kind}`,
          kind, severity, precursorStartTick, triggerTick, contagionStartTick, plannedEndTick,
          phase: "PRECURSOR",
        };
        this.lastMajorTriggerTick = triggerTick;
        this.timezoneBandNext = ((this.timezoneBandNext + 1) % 3) as 0 | 1 | 2;
      }
    }
  }

  /** Critical ticks for catch-up: major trigger/contagion/end, ripple ends, CW announce. */
  nextCritical(from: number, until: number): number | null {
    let n: number | null = null;
    const consider = (t: number) => {
      if (t >= from && t <= until && (n === null || t < n)) n = t;
    };
    const m = this.activeMajor;
    if (m) {
      if (m.phase === "PRECURSOR") consider(m.triggerTick);
      if (m.phase === "TRIGGER") consider(m.contagionStartTick);
      if (m.phase !== "ENDED") consider(m.plannedEndTick);
    }
    for (const r of this.activeRipples) {
      if (r.phase === "ACTIVE") consider(r.plannedEndTick);
    }
    if (this.crisisWeek) consider(this.crisisWeek.announcedTick);
    return n;
  }

  forceMajor(kind: MajorKindV1, opts: {
    severity?: number; precursorDays?: number; contagionDays?: number; atTick: number;
  }): MajorEvent {
    if (this.activeMajor) throw new Error("major already active");
    const sev = opts.severity ?? 1;
    const pre = opts.precursorDays ?? 0;
    const cont = opts.contagionDays ?? 10;
    const tick = opts.atTick;
    const precursorStartTick = tick + 1;
    const triggerTick = tick + 1 + pre * TICKS_PER_DAY;
    const contagionStartTick = triggerTick + TICKS_PER_DAY;
    const plannedEndTick = contagionStartTick + cont * TICKS_PER_DAY;
    const ev: MajorEvent = {
      id: `major:force:${kind}:${tick}`,
      kind, severity: sev, precursorStartTick, triggerTick, contagionStartTick, plannedEndTick,
      phase: "PRECURSOR",
    };
    this.activeMajor = ev;
    this.lastMajorTriggerTick = triggerTick;
    return { ...ev };
  }
}
