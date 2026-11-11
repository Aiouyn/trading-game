// M1-09 Wire stories that move prices (V1-BOARD:44/:82). Company NEWS/RUMOR and four demo crises (OIL_SHOCK,
// BANKING_PANIC, EQUITY_BUBBLE_BURST, CREDIT_CRUNCH) publish effects; the clock applies them once per story tick.
// Demo crisis marks unwind as session-scale residuals (04:1033) so high M1-09 cadence cannot permanently ruin GX.
import type { StoryPhase, WireKind } from "@/shell/contracts/channels";
import { START_TICK } from "@/shell/contracts/mockFeed";

/** One story slot every 6 ticks (30 s at the 5 s tick). */
export const STORY_EVERY = 6;
/** Stories the server keeps (newest last). Older ones leave the Wire. */
export const STORY_KEEP = 60;

export type { StoryPhase };
/** A crisis kind from the macro crisis catalog (stable definitions; this unit uses four). */
export type CrisisKind = "OIL_SHOCK" | "BANKING_PANIC" | "EQUITY_BUBBLE_BURST" | "CREDIT_CRUNCH";
export interface StoryEffect { readonly assetId: string; readonly bp: number }
export interface StoryDef {
  /** Definition id (the story's `causeEventIds[0]`). */
  readonly defId: string;
  readonly kind: WireKind;
  readonly headlineKey: string;
  readonly slots: Readonly<Record<string, string>>;
  /** Assets the story names, in order. */
  readonly assets: readonly string[];
  /** Strings key of the cause / consequence explanation. */
  readonly causeKey: string;
  readonly phase: StoryPhase;
  /** Applied by the server at the story's tick, once. Empty for a forecast, an all-clear, or a pending RUMOR. */
  readonly effects: readonly StoryEffect[];
  /** Catalog bp for a pending RUMOR (X if the claim later confirms). Absent on NEWS/crises. */
  readonly asserted?: readonly StoryEffect[];
  readonly breaking: boolean;
  readonly crisis?: CrisisKind;
}

type Company = Omit<StoryDef, "phase" | "breaking" | "crisis">;
const co = (defId: string, kind: WireKind, headlineKey: string, company: string, assetId: string, bp: number): Company =>
  ({ defId, kind, headlineKey, slots: { company }, assets: [assetId], causeKey: `wire.cause.${defId}`, effects: [{ assetId, bp }] });

export const COMPANY_STORIES: readonly Company[] = [
  co("halc-volumes", "NEWS", "wire.news.earningsBeat", "Halcyon Shipping", "HALC", 300),
  co("volt-guidance", "NEWS", "wire.news.guidanceRaised", "Voltaic Grid", "VOLT", 250),
  co("tide-downgrade", "RUMOR", "wire.rumor.downgrade", "Tidewater REIT", "TIDE", -200),
  co("orca-trial", "NEWS", "wire.news.trialMiss", "Orca Biologics", "ORCA", -450),
  co("nmbs-contract", "NEWS", "wire.news.contractWin", "Nimbus Compute", "NMBS", 350),
  co("kiln-demand", "NEWS", "wire.news.demandWarning", "Kiln Materials", "KILN", -300),
  co("mrdn-recall", "NEWS", "wire.news.recall", "Meridian Foods", "MRDN", -250),
  co("avb-earnings", "NEWS", "wire.news.earningsBeat", "Avalon Bank", "AVB", 200),
];

interface Crisis { kind: CrisisKind; slug: string; assets: readonly string[]; hit: readonly StoryEffect[] }
export const CRISES: readonly Crisis[] = [
  { kind: "OIL_SHOCK", slug: "oil", assets: ["VRDN", "HALC", "KILN"], hit: [{ assetId: "VRDN", bp: 400 }, { assetId: "HALC", bp: -250 }, { assetId: "KILN", bp: -200 }] },
  { kind: "BANKING_PANIC", slug: "bank", assets: ["AVB", "TIDE", "GX"], hit: [{ assetId: "AVB", bp: -500 }, { assetId: "TIDE", bp: -150 }, { assetId: "GX", bp: -100 }] },
  { kind: "EQUITY_BUBBLE_BURST", slug: "tech", assets: ["NMBS", "GX"], hit: [{ assetId: "NMBS", bp: -600 }, { assetId: "GX", bp: -150 }] },
  { kind: "CREDIT_CRUNCH", slug: "credit", assets: ["TIDE", "AVB", "KILN"], hit: [{ assetId: "TIDE", bp: -400 }, { assetId: "AVB", bp: -200 }, { assetId: "KILN", bp: -100 }] },
];

/** Stable 32-bit FNV-1a of a string (not a price stream: drawing it never touches the quote RNG). */
function hash(key: string): number {
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Slots per cycle: 4 crises × [company, crisis watch, company, crisis outcome]. */
const CYCLE = CRISES.length * 4;

/** Whether the crisis watched in `cycle`/`quartet` hits (3 in 4) or passes. Seeded, so a forecast is never a promise. */
export function crisisHits(seed: number, cycle: number, quartet: number): boolean {
  return hash(`${seed}:crisis:${cycle}:${quartet}`) % 4 !== 0;
}

function floorMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Catalog story on the STORY_EVERY grid, including ticks at or before START_TICK. Null off-grid. */
export function catalogStoryAt(seed: number, tick: number): StoryDef | null {
  const d = tick - START_TICK;
  if (!Number.isSafeInteger(d) || d % STORY_EVERY !== 0) return null;
  const slot = d / STORY_EVERY - 1;
  const cycle = Math.floor(slot / CYCLE), pos = floorMod(slot, CYCLE), quartet = Math.floor(pos / 4), step = pos % 4;
  const crisis = CRISES[floorMod(hash(`${seed}:order`) + quartet + cycle, CRISES.length)]!;
  if (step === 0 || step === 2) {
    const c = COMPANY_STORIES[floorMod(hash(`${seed}:co`) + quartet * 2 + step / 2 + cycle * 3, COMPANY_STORIES.length)]!;
    // RUMOR publishes as a forecast: belief may later move the mark; lnV waits on confirmation (05:324).
    return c.kind === "RUMOR"
      ? { ...c, phase: "forecast", breaking: false, effects: [], asserted: c.effects }
      : { ...c, phase: "realized", breaking: false };
  }
  const base = { kind: "WORLD_EVENT" as const, slots: {}, assets: crisis.assets, crisis: crisis.kind };
  if (step === 1) return { ...base, defId: `${crisis.slug}-watch`, headlineKey: `wire.crisis.${crisis.slug}.watch`, causeKey: `wire.cause.${crisis.slug}-watch`, phase: "forecast", effects: [], breaking: false };
  // V1-BOARD:44/:82 crises → prices. Hits apply catalog `crisis.hit` bp; clock registers them as
  // session-scale decaying residuals (04:1033 / DEMO_CRISIS_HALF_LIFE) so the index has no permanent drift.
  return crisisHits(seed, cycle, quartet)
    ? { ...base, defId: `${crisis.slug}-hit`, headlineKey: `wire.crisis.${crisis.slug}.hit`, causeKey: `wire.cause.${crisis.slug}-hit`, phase: "realized", effects: crisis.hit, breaking: true }
    : { ...base, defId: `${crisis.slug}-eased`, headlineKey: `wire.crisis.${crisis.slug}.eased`, causeKey: `wire.cause.${crisis.slug}-eased`, phase: "eased", effects: [], breaking: false };
}

/** The live story published at `tick`, or null. Only ticks after the clock's first tick, every STORY_EVERY. */
export function storyAt(seed: number, tick: number): StoryDef | null {
  if (tick - START_TICK <= 0) return null;
  return catalogStoryAt(seed, tick);
}

export const HISTORY_ITEM_PREFIX = "w-h-";
export function historyItemId(tick: number): string {
  return `${HISTORY_ITEM_PREFIX}${tick}`;
}

const HISTORY_LOOKBACK = 720;
const HISTORY_BOOT_COUNT = 2;

function prefersHistory(def: StoryDef): boolean {
  return def.kind === "NEWS" && def.phase === "realized";
}

/** Up to two catalog stories from the last 720 ticks at or before `atTick`. Prefers realized company NEWS. */
export function bootHistory(seed: number, atTick: number = START_TICK): readonly { tick: number; def: StoryDef }[] {
  const aligned = atTick - ((atTick - START_TICK) % STORY_EVERY + STORY_EVERY) % STORY_EVERY;
  const preferred: { tick: number; def: StoryDef }[] = [];
  const rest: { tick: number; def: StoryDef }[] = [];
  for (let t = aligned; t >= atTick - HISTORY_LOOKBACK; t -= STORY_EVERY) {
    const def = catalogStoryAt(seed, t);
    if (!def) continue;
    (prefersHistory(def) ? preferred : rest).push({ tick: t, def });
    if (preferred.length >= HISTORY_BOOT_COUNT) break;
  }
  return [...preferred, ...rest].slice(0, HISTORY_BOOT_COUNT).sort((a, b) => a.tick - b.tick);
}
