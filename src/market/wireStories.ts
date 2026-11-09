// M1-09 Wire stories. Company stories still move marks (applyShock once). Four demo crises named after macro catalog
// kinds (OIL_SHOCK, BANKING_PANIC, EQUITY_BUBBLE_BURST, CREDIT_CRUNCH) stay on the Wire as narrative only — 04 §3.16
// storms/majors/ripples own crisis-tier mark shocks (Gatekeeper bfe09b0e: demo crisis stacking ruined GX). Pure schedule.
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
  /** Applied by the server at the story's tick, once. Empty for a forecast or an all-clear. */
  readonly effects: readonly StoryEffect[];
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

/** The story published at `tick`, or null. Only ticks after the clock's first tick, every STORY_EVERY. */
export function storyAt(seed: number, tick: number): StoryDef | null {
  const d = tick - START_TICK;
  if (!Number.isSafeInteger(d) || d <= 0 || d % STORY_EVERY !== 0) return null;
  const slot = d / STORY_EVERY - 1;
  const cycle = Math.floor(slot / CYCLE), pos = slot % CYCLE, quartet = Math.floor(pos / 4), step = pos % 4;
  const crisis = CRISES[(hash(`${seed}:order`) + quartet + cycle) % CRISES.length]!;
  if (step === 0 || step === 2) {
    const c = COMPANY_STORIES[(hash(`${seed}:co`) + quartet * 2 + step / 2 + cycle * 3) % COMPANY_STORIES.length]!;
    return { ...c, phase: "realized", breaking: false };
  }
  const base = { kind: "WORLD_EVENT" as const, slots: {}, assets: crisis.assets, crisis: crisis.kind };
  if (step === 1) return { ...base, defId: `${crisis.slug}-watch`, headlineKey: `wire.crisis.${crisis.slug}.watch`, causeKey: `wire.cause.${crisis.slug}-watch`, phase: "forecast", effects: [], breaking: false };
  // 04 §3.16 is authoritative for crisis-tier rates and mark shocks (storms/majors/ripples).
  // M1-09 demo crises stay on the Wire as narrative; they must not mint a parallel permanent crash engine
  // (Gatekeeper bfe09b0e: ~675 GX hits / 60 GD → index ruin). Hit effects cleared; catalog `hit` kept for docs.
  return crisisHits(seed, cycle, quartet)
    ? { ...base, defId: `${crisis.slug}-hit`, headlineKey: `wire.crisis.${crisis.slug}.hit`, causeKey: `wire.cause.${crisis.slug}-hit`, phase: "realized", effects: [], breaking: true }
    : { ...base, defId: `${crisis.slug}-eased`, headlineKey: `wire.crisis.${crisis.slug}.eased`, causeKey: `wire.cause.${crisis.slug}-eased`, phase: "eased", effects: [], breaking: false };
}
