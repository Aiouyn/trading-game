// Free-tier T1 NPC analyst notes: one daily public Wire claim (16:557 T1, no paid tiers).
// Schedule is seed-only / public clock. Hidden accuracy and truth use HMAC in rumorClaims (secret is the key, never FNV input).
import { createHmac } from "node:crypto";
import { ASSET_BY_ID } from "@/market/catalog";
import { TICKS_PER_DAY } from "@/server/market/meme";
import { START_TICK } from "@/shell/contracts/mockFeed";

/** Seed-only public schedule. Never pass the server secret through this hash. */
function publicHash(key: string): number {
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const ANALYST = {
  /** Publish when tick % TICKS_PER_DAY === slot and tick >= firstTick. Seed 17's first note is 27760. */
  slot: 400,
  firstTick: START_TICK + 21,
  accMin: 0.40,
  accMax: 0.55,
} as const;

/** Listed equities that map onto a 22 §10.8 sector analyst. VOLT (Utilities), GX, and coins are out. */
export const ANALYST_ROSTER: readonly {
  assetId: string;
  sector: string;
  sourceId: string;
  name: string;
  house: string;
}[] = [
  { assetId: "NMBS", sector: "TECH", sourceId: "an-TECH", name: "Priya Holloway", house: "Keystone Research" },
  { assetId: "VRDN", sector: "ENERGY", sourceId: "an-ENERGY", name: "Ragna Sæther", house: "Fjell Energy Research" },
  { assetId: "KILN", sector: "MATERIALS", sourceId: "an-MATERIALS", name: "Esteban Ferreyra", house: "Cordillera Research" },
  { assetId: "HALC", sector: "INDUSTRIALS", sourceId: "an-INDUSTRIALS", name: "Marek Vogel", house: "Brenner & Kessel Research" },
  { assetId: "AVB", sector: "FINANCIALS", sourceId: "an-FINANCIALS", name: "Grace Abbott", house: "Bayard Bank Research" },
  { assetId: "ORCA", sector: "HEALTH", sourceId: "an-HEALTH", name: "Elise Morel", house: "Lumière Santé Research" },
  { assetId: "MRDN", sector: "STAPLES", sourceId: "an-STAPLES", name: "Camila Duarte", house: "Granero Analytics" },
  { assetId: "TIDE", sector: "REAL_ESTATE", sourceId: "an-REAL_ESTATE", name: "Hana Mori", house: "Kaiyo Land Research" },
];

/** 22 kinds tagged for an analyst note. assertedMove is a log. */
export const ANALYST_KINDS: readonly { kind: string; assertedMove: number; claim: string }[] = [
  { kind: "PRODUCT_DELAY", assertedMove: -0.08, claim: "a product delay at {company}" },
  { kind: "EARNINGS_BEAT", assertedMove: 0.05, claim: "{company} will beat earnings" },
  { kind: "EARNINGS_MISS", assertedMove: -0.06, claim: "{company} will miss earnings" },
];

const SOURCE_IDS = new Set(ANALYST_ROSTER.map((r) => r.sourceId));

export function isAnalystSourceId(id: string | undefined): boolean {
  return typeof id === "string" && SOURCE_IDS.has(id);
}

export function analystBySourceId(id: string): (typeof ANALYST_ROSTER)[number] | undefined {
  return ANALYST_ROSTER.find((r) => r.sourceId === id);
}

/** Stable masthead id for a research house treated as an NPC outlet (15:828 / 15:827). */
export function analystOutletId(house: string): string {
  const slug = house.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `out_rs_${slug}`;
}

export function isAnalystPublishTick(tick: number): boolean {
  return Number.isSafeInteger(tick) && tick % TICKS_PER_DAY === ANALYST.slot && tick >= ANALYST.firstTick;
}

export function analystClaimId(publishTick: number): string {
  return `w-a-${publishTick}`;
}

export function analystSourceName(id: string): string {
  return analystBySourceId(id)?.name ?? id;
}

/**
 * Sealed T1 accuracy: HMAC-SHA256(secret, seed|analyst-acc|sourceId) in [0.40, 0.55].
 * The secret is the HMAC key, never an FNV input.
 */
function sealedUnit(secret: string, seed: number, kind: string, id?: string): number {
  const msg = id === undefined ? `${seed}|${kind}` : `${seed}|${kind}|${id}`;
  const digest = createHmac("sha256", secret).update(msg).digest();
  const hi = digest.readUInt32BE(0);
  const lo = digest.readUInt32BE(4);
  return (hi * 0x200000 + (lo >>> 11)) / 0x20_0000_0000_0000;
}

export function analystAccuracy(seed: number, sourceId: string, secret: string): number {
  return ANALYST.accMin + (ANALYST.accMax - ANALYST.accMin) * sealedUnit(secret, seed, "analyst-acc", sourceId);
}

export interface AnalystDraft {
  id: string;
  sourceId: string;
  analyst: string;
  house: string;
  outletId: string;
  sector: string;
  assetId: string;
  company: string;
  factKind: string;
  a: number;
  bp: number;
  publishTick: number;
  headlineKey: string;
  causeKey: string;
  slots: Record<string, string>;
}

export function planAnalystNote(seed: number, publishTick: number): AnalystDraft | null {
  if (!isAnalystPublishTick(publishTick)) return null;
  const day = Math.floor(publishTick / TICKS_PER_DAY);
  const roster = ANALYST_ROSTER[publicHash(`analyst:${seed}:asset:${day}`) % ANALYST_ROSTER.length]!;
  const kind = ANALYST_KINDS[publicHash(`analyst:${seed}:kind:${day}`) % ANALYST_KINDS.length]!;
  const company = ASSET_BY_ID[roster.assetId]?.name ?? roster.assetId;
  const id = analystClaimId(publishTick);
  const claim = kind.claim.replace("{company}", company);
  return {
    id,
    sourceId: roster.sourceId,
    analyst: roster.name,
    house: roster.house,
    outletId: analystOutletId(roster.house),
    sector: roster.sector,
    assetId: roster.assetId,
    company,
    factKind: kind.kind,
    a: kind.assertedMove,
    bp: Math.round(kind.assertedMove * 10_000),
    publishTick,
    headlineKey: "wire.news.analyst-note",
    causeKey: "wire.cause.analyst-note",
    slots: {
      house: roster.house,
      company,
      sector: roster.sector,
      kind: kind.kind,
      claim,
      rumorId: id,
    },
  };
}
