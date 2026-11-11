// Multi-source rumor farm: 20 RUMOR_SOURCE authors, 8 rumors per game day (16:343, 16:562–566).
// Credibility uses the 16:566 shrink-to-0.5 / k=10 estimator and E-56 credBand cutoffs.
// Catalog desk rumors stay on the 05 Beta(2,2) path in rumorClaims.ts.
import { createHmac } from "node:crypto";
import { ASSETS } from "@/market/catalog";
import { STORY_EVERY, storyAt } from "@/market/wireStories";
import { TICKS_PER_DAY } from "@/server/market/meme";
import type { SourceBand } from "@/shell/contracts/channels";
import { START_TICK } from "@/shell/contracts/mockFeed";

/** Seed-only public schedule (planFarmDay). Never pass the server secret through this hash. */
function rumorHash(key: string): number {
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Murmur-style finalizer so nearby keys (rs-00…rs-19, day indexes) actually fill [0, 1). */
function mix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

export function farmUnit(key: string): number {
  return mix32(rumorHash(key)) / 0x1_0000_0000;
}

export const FARM = {
  authorCount: 20,
  perDay: 8,
  credPriorMean: 0.5,
  credPriorWeight: 10,
  bandLow: 0.40,
  bandSolid: 0.65,
  fadeHlTicks: 1 * TICKS_PER_DAY,
} as const;

/** Ordinary given+family names (22 §0.4 style). Indexed 0..19; sourceId is `rs-00`…`rs-19`. */
export const FARM_AUTHOR_NAMES: readonly string[] = [
  "Mara Ellison", "Jonah Whitaker", "Priya Nandakumar", "Luc Moreau", "Elena Voss",
  "Haruto Saito", "Camille Drexler", "Omar Haddad", "Sofie Lindgren", "Bennett Shaw",
  "Inés Calderón", "Wei Tan", "Nora Feldman", "Tomasz Krajewski", "Asha Reddy",
  "Gilles Perrault", "Yara Soliman", "Dominic Kane", "Mei-Ling Cho", "Rafael Costa",
];

export function farmSourceId(i: number): string {
  return `rs-${String(i).padStart(2, "0")}`;
}

export function farmSourceName(id: string): string {
  const i = FARM_AUTHOR_NAMES.findIndex((_, n) => farmSourceId(n) === id);
  return i >= 0 ? FARM_AUTHOR_NAMES[i]! : id;
}

export function isFarmSourceId(id: string | undefined): boolean {
  return typeof id === "string" && /^rs-\d{2}$/.test(id);
}

/** 22 §4.11 rumor kinds (assertedMove is a log). Twelve kinds, typical source "rumor". */
export const FARM_KINDS: readonly { kind: string; assertedMove: number; claim: string }[] = [
  { kind: "PRODUCT_DELAY", assertedMove: -0.08, claim: "a product delay at {company}" },
  { kind: "PRODUCT_FAILURE", assertedMove: -0.12, claim: "a product failure at {company}" },
  { kind: "TAKEOVER_INTEREST", assertedMove: 0.15, claim: "takeover interest in {company}" },
  { kind: "TAKEOVER_COLLAPSE", assertedMove: -0.10, claim: "takeover talks around {company} collapsing" },
  { kind: "EARNINGS_BEAT", assertedMove: 0.05, claim: "{company} will beat earnings" },
  { kind: "EARNINGS_MISS", assertedMove: -0.06, claim: "{company} will miss earnings" },
  { kind: "GUIDANCE_CUT", assertedMove: -0.08, claim: "a guidance cut coming at {company}" },
  { kind: "CEO_EXIT", assertedMove: -0.05, claim: "the chief executive of {company} will leave" },
  { kind: "ACTIVIST_STAKE", assertedMove: 0.06, claim: "an activist building a stake in {company}" },
  { kind: "CONTRACT_WIN", assertedMove: 0.07, claim: "{company} winning a large contract" },
  { kind: "CONTRACT_LOSS", assertedMove: -0.09, claim: "{company} losing a large customer" },
  { kind: "CREDIT_DOWNGRADE", assertedMove: -0.05, claim: "a downgrade coming for {company}" },
];

export const FARM_EQUITIES: readonly string[] = ASSETS.filter((a) => a.class === "equity").map((a) => a.assetId);

/** 16:566 / 23:1053–1054: track record shrunk to 0.5 with prior weight 10. */
export function farmCred(hits: number, resolved: number): number {
  const k = FARM.credPriorWeight, m = FARM.credPriorMean;
  return (hits + m * k) / (resolved + k);
}

/** 16:566 rumorImpulse = 0.5 × (2·cred − 1) × expectedMove; zero at cred 0.5. */
export function farmImpulse(assertedMove: number, hits: number, resolved: number): number {
  return 0.5 * (2 * farmCred(hits, resolved) - 1) * assertedMove;
}

/** E-56 §3 / 23:1055–1056 public credBand, mapped onto existing sourceBand. */
export function farmBand(hits: number, resolved: number): SourceBand {
  const s = farmCred(hits, resolved);
  if (s < FARM.bandLow) return "low";
  if (s >= FARM.bandSolid) return "solid";
  return "mixed";
}

/**
 * Sealed author accuracy: HMAC-SHA256(secret, seed|farm-acc|sourceId).
 * Same digest-to-unit as rumorClaims; the secret is the HMAC key, never an FNV input.
 */
function sealedUnit(secret: string, seed: number, kind: string, id?: string): number {
  const msg = id === undefined ? `${seed}|${kind}` : `${seed}|${kind}|${id}`;
  const digest = createHmac("sha256", secret).update(msg).digest();
  const hi = digest.readUInt32BE(0);
  const lo = digest.readUInt32BE(4);
  return (hi * 0x200000 + (lo >>> 11)) / 0x20_0000_0000_0000;
}

export function farmAccuracy(seed: number, sourceId: string, secret: string): number {
  return 0.40 + (0.70 - 0.40) * sealedUnit(secret, seed, "farm-acc", sourceId);
}

export function dayOfTick(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

export function dayCloseTick(day: number): number {
  return day * TICKS_PER_DAY + TICKS_PER_DAY - 1;
}

export function isDayClose(tick: number): boolean {
  return Number.isSafeInteger(tick) && tick >= 0 && tick % TICKS_PER_DAY === TICKS_PER_DAY - 1;
}

export interface FarmDraft {
  id: string;
  sourceId: string;
  sourceName: string;
  assetId: string;
  company: string;
  factKind: string;
  claim: string;
  assertedMove: number;
  bp: number;
  publishTick: number;
}

function catalogStoryTick(seed: number, tick: number): boolean {
  if (tick <= START_TICK) return false;
  if ((tick - START_TICK) % STORY_EVERY !== 0) return false;
  return storyAt(seed, tick) !== null;
}

function pickDistinct<T>(seed: number, tag: string, n: number, pool: readonly T[]): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  let k = 0;
  while (out.length < n && used.size < pool.length) {
    const i = rumorHash(`farm:${seed}:${tag}:${k++}`) % pool.length;
    if (used.has(i)) continue;
    used.add(i);
    out.push(pool[i]!);
  }
  return out;
}

function publishTicksForDay(seed: number, day: number): number[] {
  const start = day * TICKS_PER_DAY;
  const end = start + TICKS_PER_DAY; // exclusive
  const ticks: number[] = [];
  let k = 0;
  while (ticks.length < FARM.perDay && k < TICKS_PER_DAY * 4) {
    const t = start + (rumorHash(`farm:${seed}:pt:${day}:${k++}`) % TICKS_PER_DAY);
    if (t < start || t >= end) continue;
    if (catalogStoryTick(seed, t)) continue;
    if (ticks.includes(t)) continue;
    ticks.push(t);
  }
  // If the catalog grid ate the day (should not), fill anyway.
  for (let t = start; ticks.length < FARM.perDay && t < end; t++) {
    if (!ticks.includes(t)) ticks.push(t);
  }
  ticks.sort((a, b) => a - b);
  return ticks;
}

/** Seed+day plan is pure; cache so per-tick openFarmDue does not rebuild the day book. */
const PLAN_CACHE_CAP = 512;
const planCache = new Map<string, FarmDraft[]>();

/**
 * Pure day book for game day `day` (generated at the previous day close).
 * 8 rumors, 8 distinct authors, distinct equities when the catalog allows.
 */
export function planFarmDay(seed: number, day: number): FarmDraft[] {
  if (!Number.isSafeInteger(day) || day < 0) return [];
  const key = `${seed}:${day}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const authors = pickDistinct(seed, `au:${day}`, FARM.perDay, [...Array(FARM.authorCount).keys()]);
  const assets = pickDistinct(seed, `eq:${day}`, FARM.perDay, FARM_EQUITIES);
  const ticks = publishTicksForDay(seed, day);
  const out: FarmDraft[] = [];
  for (let i = 0; i < FARM.perDay; i++) {
    const ai = authors[i] ?? (i % FARM.authorCount);
    const assetId = assets[i] ?? FARM_EQUITIES[i % FARM_EQUITIES.length]!;
    const kind = FARM_KINDS[rumorHash(`farm:${seed}:kind:${day}:${i}`) % FARM_KINDS.length]!;
    const company = ASSETS.find((a) => a.assetId === assetId)?.name ?? assetId;
    const sourceId = farmSourceId(ai);
    const publishTick = ticks[i]!;
    const assertedMove = kind.assertedMove;
    const bp = Math.round((Math.exp(assertedMove) - 1) * 10_000);
    const claim = kind.claim.replaceAll("{company}", company);
    out.push({
      id: `w-r-${day}-${String(i).padStart(2, "0")}`,
      sourceId,
      sourceName: farmSourceName(sourceId),
      assetId,
      company,
      factKind: kind.kind,
      claim,
      assertedMove,
      bp,
      publishTick,
    });
  }
  if (planCache.size >= PLAN_CACHE_CAP) {
    const first = planCache.keys().next().value;
    if (first !== undefined) planCache.delete(first);
  }
  planCache.set(key, out);
  return out;
}

export function farmHeadlineSlots(d: FarmDraft): Record<string, string> {
  return { source: d.sourceName, company: d.company, claim: d.claim };
}
