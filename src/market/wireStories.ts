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
  { ...co("avb-earnings", "NEWS", "wire.news.earningsExpectations", "Avalon Bank", "AVB", 200), slots: { company: "Avalon Bank", beatMiss: "beat" } },
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

/** Macro severity band (crisisCatalog.ts: U = (severity − 0.6)/0.8). Each published move is catalog bp × severity. */
export const STORY_SEVERITY_MIN = 0.6;
export const STORY_SEVERITY_MAX = 1.4;

/** Whether the crisis watched in `cycle`/`quartet` hits (3 in 4) or passes. Seeded, so a forecast is never a promise. */
export function crisisHits(seed: number, cycle: number, quartet: number): boolean {
  return hash(`${seed}:crisis:${cycle}:${quartet}`) % 4 !== 0;
}

function floorMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** murmur3 fmix32 finalizer. FNV-1a's low k bits depend only on the key's low k bits, so
 *  `hash % (i + 1)` reached only 12/24 crisis orders and ~4% of company decks (Gatekeeper q1). */
function mix32(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Fisher-Yates permutation of 0..n-1, drawn only from `hash` (never the quote RNG).
 *  j comes from the high bits of the mixed hash, so every permutation is reachable. */
export function shuffledIndices(n: number, seed: number, key: string): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor((mix32(hash(`${seed}:${key}:${i}`)) / 0x100000000) * (i + 1));
    const a = idx[i]!, b = idx[j]!;
    idx[i] = b;
    idx[j] = a;
  }
  return idx;
}

/** Far enough back that boot-history ticks (HISTORY_LOOKBACK = 720) stay on the repair chain. */
const SHUFFLE_CHAIN_START = -64;

function sameOrder(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Ticks per 16-slot cycle (96). Company slots are 2 apart (12 ticks), crisis watches 4 apart (24 ticks). */
const CYCLE_TICKS = CYCLE * STORY_EVERY;
const COMPANY_SLOT_TICKS = 2 * STORY_EVERY;
const CRISIS_SLOT_TICKS = 4 * STORY_EVERY;
/** Minimum ticks between two appearances of the same company headline. Above the 60/72-tick
 *  (5-6 real minute) repeats from the playtests; 84 is the largest floor that still leaves 127
 *  legal next decks (96 would force the identical deck). */
export const COMPANY_MIN_GAP_TICKS = 84;
/** Minimum ticks between two watches of the same crisis kind (main's rotation gave 72). 72 is the
 *  largest feasible floor for 4 crises: 96 would force the identical order. 7 legal next orders. */
export const CRISIS_MIN_GAP_TICKS = 72;

/** Each item's gap from its slot in `prev` to its slot in `order` (one cycle later) is >= minGap.
 *  Works on a prefix of `order` too, so the backtracking search can prune early. Inside one cycle
 *  every item appears once, so cross-cycle gaps are the only repeats. */
function gapsAtLeast(order: readonly number[], prev: readonly number[], slotTicks: number, minGap: number): boolean {
  const prevPos = new Map<number, number>();
  for (let p = 0; p < prev.length; p++) prevPos.set(prev[p]!, p);
  for (let q = 0; q < order.length; q++) {
    if (CYCLE_TICKS + slotTicks * (q - prevPos.get(order[q]!)!) < minGap) return false;
  }
  return true;
}

/** Reject an identical deck, first==previous last, and any company repeat closer than COMPANY_MIN_GAP_TICKS. */
/** Same headline key across different companies must also keep COMPANY_MIN_GAP_TICKS,
 *  including a prefix of `order` so backtracking can prune. Intra-cycle and one-cycle-back. */
function keyGapsAtLeast(order: readonly number[], prev: readonly number[], minGap: number): boolean {
  const last = new Map<string, { cycle: 0 | 1; pos: number }>();
  for (let p = 0; p < prev.length; p++) last.set(COMPANY_STORIES[prev[p]!].headlineKey, { cycle: 0, pos: p });
  for (let q = 0; q < order.length; q++) {
    const key = COMPANY_STORIES[order[q]!].headlineKey;
    const seen = last.get(key);
    if (seen) {
      const ticks = seen.cycle === 0
        ? CYCLE_TICKS + COMPANY_SLOT_TICKS * (q - seen.pos)
        : COMPANY_SLOT_TICKS * (q - seen.pos);
      if (ticks < minGap) return false;
    }
    last.set(key, { cycle: 1, pos: q });
  }
  return true;
}

function companyAcceptable(order: readonly number[], prev: readonly number[]): boolean {
  if (sameOrder(order, prev)) return false;
  if (order[0] === prev[prev.length - 1]) return false;
  return gapsAtLeast(order, prev, COMPANY_SLOT_TICKS, COMPANY_MIN_GAP_TICKS)
    && keyGapsAtLeast(order, prev, COMPANY_MIN_GAP_TICKS);
}

/** Reject an identical order, first==previous last, and any crisis repeat closer than CRISIS_MIN_GAP_TICKS. */
function crisisAcceptable(order: readonly number[], prev: readonly number[]): boolean {
  if (sameOrder(order, prev)) return false;
  if (order[0] === prev[prev.length - 1]) return false;
  return gapsAtLeast(order, prev, CRISIS_SLOT_TICKS, CRISIS_MIN_GAP_TICKS);
}

function pickCycleOrder(
  n: number,
  seed: number,
  kind: "co" | "order",
  cycle: number,
  prev: readonly number[] | null,
  acceptable: (order: readonly number[], prev: readonly number[]) => boolean,
): number[] {
  for (let attempt = 0; attempt < 64; attempt++) {
    const key = attempt === 0 ? `${kind}:${cycle}` : `${kind}:${cycle}:r${attempt}`;
    const order = shuffledIndices(n, seed, key);
    if (!prev || acceptable(order, prev)) return order;
  }
  // Complete search, still seeded: try items in a hash-derived preference order so
  // a valid permutation is always found when one exists (rotate-reverse can miss).
  // `acceptable` also judges a prefix (the identical-deck test needs the full length), so prune early.
  const pref = shuffledIndices(n, seed, `${kind}:${cycle}:bt`);
  const used = new Array<boolean>(n).fill(false);
  const acc: number[] = [];
  const search = (): boolean => {
    if (acc.length === n) return !prev || acceptable(acc, prev);
    for (const item of pref) {
      if (used[item]) continue;
      acc.push(item);
      used[item] = true;
      if ((!prev || acceptable(acc, prev)) && search()) return true;
      used[item] = false;
      acc.pop();
    }
    return false;
  };
  if (search()) return acc.slice();
  throw new Error(`wireStories: no valid ${kind} shuffle for cycle ${cycle}`);
}

const orderCache = new Map<string, number[][]>();

function cycleOrder(
  n: number,
  seed: number,
  kind: "co" | "order",
  cycle: number,
  acceptable: (order: readonly number[], prev: readonly number[]) => boolean,
): number[] {
  if (cycle < SHUFFLE_CHAIN_START) return shuffledIndices(n, seed, `${kind}:${cycle}`);
  const key = `${kind}:${seed}`;
  let chain = orderCache.get(key);
  if (!chain) { chain = []; orderCache.set(key, chain); }
  const idx = cycle - SHUFFLE_CHAIN_START;
  while (chain.length <= idx) {
    const c = SHUFFLE_CHAIN_START + chain.length;
    const prev = chain.length ? chain[chain.length - 1]! : null;
    chain.push(pickCycleOrder(n, seed, kind, c, prev, acceptable));
  }
  return chain[idx]!;
}

function companyOrder(seed: number, cycle: number): number[] {
  return cycleOrder(COMPANY_STORIES.length, seed, "co", cycle, companyAcceptable);
}

function crisisOrderOf(seed: number, cycle: number): number[] {
  return cycleOrder(CRISES.length, seed, "order", cycle, crisisAcceptable);
}

/** Severity in [0.6, 1.4] for this seed and key. */
export function storySeverity(seed: number, key: string): number {
  return STORY_SEVERITY_MIN + (STORY_SEVERITY_MAX - STORY_SEVERITY_MIN) * (hash(`${seed}:sev:${key}`) / 0x100000000);
}

/** Scale catalog effects by severity; keep sign and never collapse to 0 bp. */
export function scaleEffects(effects: readonly StoryEffect[], severity: number): StoryEffect[] {
  return effects.map((e) => {
    const bp = Math.round(e.bp * severity);
    return { assetId: e.assetId, bp: bp === 0 ? (e.bp < 0 ? -1 : 1) : bp };
  });
}

/** Catalog story on the STORY_EVERY grid, including ticks at or before START_TICK. Null off-grid.
 *  Company and crisis order are a seeded shuffle per cycle from hash(seed, cycleIndex), repaired
 *  against the previous cycle (a deterministic chain from SHUFFLE_CHAIN_START, not a shared stream),
 *  so jump-to-k equals a walk from 0 and consecutive cycles differ. Magnitudes vary. */
export function catalogStoryAt(seed: number, tick: number): StoryDef | null {
  const d = tick - START_TICK;
  if (!Number.isSafeInteger(d) || d % STORY_EVERY !== 0) return null;
  const slot = d / STORY_EVERY - 1;
  const cycle = Math.floor(slot / CYCLE), pos = floorMod(slot, CYCLE), quartet = Math.floor(pos / 4), step = pos % 4;
  // Per-cycle deck from hash(seed, cycle), repaired against the previous cycle's deck. Inside a
  // cycle each defId appears once; across a boundary the same company returns no sooner than
  // COMPANY_MIN_GAP_TICKS and the same crisis no sooner than CRISIS_MIN_GAP_TICKS. Consecutive
  // cycles differ, and jump-to-k equals a walk from 0 (the chain is recomputed, not stream state).
  const crisisOrder = crisisOrderOf(seed, cycle);
  const crisis = CRISES[crisisOrder[quartet]!]!;
  if (step === 0 || step === 2) {
    const coOrder = companyOrder(seed, cycle);
    const c = COMPANY_STORIES[coOrder[quartet * 2 + step / 2]!]!;
    const scaled = scaleEffects(c.effects, storySeverity(seed, `${tick}`));
    // RUMOR publishes as a forecast: belief may later move the mark; lnV waits on confirmation (05:324).
    return c.kind === "RUMOR"
      ? { ...c, phase: "forecast", breaking: false, effects: [], asserted: scaled }
      : { ...c, phase: "realized", breaking: false, effects: scaled };
  }
  const base = { kind: "WORLD_EVENT" as const, slots: {}, assets: crisis.assets, crisis: crisis.kind };
  if (step === 1) return { ...base, defId: `${crisis.slug}-watch`, headlineKey: `wire.crisis.${crisis.slug}.watch`, causeKey: `wire.cause.${crisis.slug}-watch`, phase: "forecast", effects: [], breaking: false };
  // V1-BOARD:44/:82 crises → prices. Hits apply catalog `crisis.hit` bp × severity; clock registers them as
  // session-scale decaying residuals (04:1033 / DEMO_CRISIS_HALF_LIFE) so the index has no permanent drift.
  return crisisHits(seed, cycle, quartet)
    ? { ...base, defId: `${crisis.slug}-hit`, headlineKey: `wire.crisis.${crisis.slug}.hit`, causeKey: `wire.cause.${crisis.slug}-hit`, phase: "realized", effects: scaleEffects(crisis.hit, storySeverity(seed, `${tick}`)), breaking: true }
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
