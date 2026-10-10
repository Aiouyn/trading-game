/**
 * The company's market (spec v1.7 §2, §3): total demand, the logit share against NPC rivals with an outside option,
 * the NPC competitors (seeded, reacting, entering and exiting) and the imitation of the leader's quality (§3).
 *
 * Demand (§2): D_m(t) = D0 * exp(kappa_D (F_s(t) - F_s(0))) * R(regime)^cycleBeta_s.
 * Share (§2): u_j = a ln(q_j / Q_f) + b ln(1 + M_j / M_ref) - c ln(p_j / p_ref) + d ln(dist_j) + brand_j,
 *             s_j = exp(u_j) / (exp(u_0) + sum_k exp(u_k)), with the NPC rivals in the sum.
 * The software network term (nu ln(1 + users)) is not in A3: there are no users in the world yet.
 */

import { COMPANY, SECTORS } from '@/content/company';
import type { RegimeId } from '@/engine/types';
import { Rng, seedStream } from '@/engine';
import type { Company, Npc, Product } from './types';
import { productiveHeads } from './economics';

/** Total demand in units per gd (§2). */
export function demandPerDay(c: Company, sectorLevel: number, regime: RegimeId | string): number {
  const beta = SECTORS[c.sector].cycleBeta;
  const regimeMult = (COMPANY.demand.regimeMult as Record<string, number>)[regime] ?? 1;
  return c.d0 * Math.exp(COMPANY.demand.kappaD * (sectorLevel - c.sectorBase)) * Math.pow(regimeMult, beta);
}

/** Distribution level dist_j = base + 0.1 * ln(1 + sales heads) (§4). */
export function distributionLevel(c: Company, day: number): number {
  return COMPANY.demand.distBase + COMPANY.demand.distSalesWeight * Math.log(1 + productiveHeads(c.staff.sales, day));
}

/** Logit utility of a player product (§2). */
export function productUtility(p: Product, frontier: number, dist: number): number {
  const d = COMPANY.demand;
  return d.a * Math.log(p.q / frontier)
    + d.b * Math.log(1 + p.marketing / d.marketingRef)
    - d.c * Math.log(p.price / d.priceRef)
    + d.d * Math.log(dist)
    + p.brand;
}

/** Logit utility of an NPC rival: quality against the frontier, its own price and marketing, distribution 1, no brand. */
export function npcUtility(n: Npc, frontier: number): number {
  const d = COMPANY.demand;
  return d.a * (n.lnQ - Math.log(frontier))
    + d.b * Math.log(1 + n.marketing / d.marketingRef)
    - d.c * Math.log(n.price / d.priceRef);
}

export interface Shares {
  /** share of each player product, by product id */
  products: Record<string, number>;
  /** share of each NPC, by NPC id */
  npcs: Record<string, number>;
  /** the outside option's share */
  outside: number;
}

/**
 * The logit shares (§2) with the outside option u_0 = 0 in the denominator. Exponentials are shifted by the largest
 * utility so the sum never overflows (the shares are unchanged by the shift).
 */
export function shares(c: Company, day: number): Shares {
  const frontier = Math.exp(c.frontierLn);
  const dist = distributionLevel(c, day);
  const entries: { key: string; kind: 'p' | 'n'; u: number }[] = [];
  for (const p of c.products) entries.push({ key: p.id, kind: 'p', u: productUtility(p, frontier, dist) });
  for (const n of c.npcs) entries.push({ key: n.id, kind: 'n', u: npcUtility(n, frontier) });
  const u0 = COMPANY.demand.u0;
  const top = Math.max(u0, ...entries.map((e) => e.u));
  const e0 = Math.exp(u0 - top);
  let denom = e0;
  for (const e of entries) denom += Math.exp(e.u - top);
  const out: Shares = { products: {}, npcs: {}, outside: e0 / denom };
  for (const e of entries) {
    const s = Math.exp(e.u - top) / denom;
    if (e.kind === 'p') out.products[e.key] = s;
    else out.npcs[e.key] = s;
  }
  return out;
}

/** The NPC quality target: the leader's quality without the patented gains that are still in force (§3). */
export function imitableLeaderLnQ(c: Company, day: number): number {
  let best = -Infinity;
  for (const p of c.products) {
    let patented = 0;
    for (const pt of p.patents) if (pt.until > day) patented += pt.lnGain;
    best = Math.max(best, Math.log(p.q) - patented);
  }
  return Number.isFinite(best) ? best : 0;
}

/** Daily imitation: an NPC closes half of its gap to the leader every 126 gd (§3). */
export function imitateDaily(c: Company, day: number): void {
  const keep = Math.pow(0.5, 1 / COMPANY.rd.imitationHalfLife);
  const target = imitableLeaderLnQ(c, day);
  for (const n of c.npcs) n.lnQ = target + (n.lnQ - target) * keep;
}

/** Seed `count` NPC rivals from the company's npc stream (§2: 3-5 per market, seeded quality, price and marketing). */
export function seedNpcs(c: Company, count: number, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    const idx = c.npcSeq++;
    c.npcs.push({
      id: `${c.id}:npc${idx}`,
      lnQ: COMPANY.npc.qualitySpread * rng.normal(),
      price: COMPANY.demand.priceRef * (1 + 0.05 * rng.normal()),
      marketing: COMPANY.npc.marketingBase * (0.8 + 0.4 * rng.uniform()),
      negQuarters: 0,
    });
  }
}

/** Weekly reaction (§2): above a 25% share the NPCs cut price by up to 8% and raise marketing by 20%, bounded. */
export function npcWeeklyReaction(c: Company, maxShare: number): void {
  if (!(maxShare > COMPANY.npc.reactShare)) return;
  const floor = COMPANY.npc.priceFloor * COMPANY.demand.priceRef;
  for (const n of c.npcs) {
    n.price = Math.max(floor, n.price * (1 - COMPANY.npc.reactPriceCut));
    n.marketing *= 1 + COMPANY.npc.reactMarketing;
  }
}

/** The entry probability per quarter: 0.25 * max(0, margin - 10%) / 10%, capped at 0.6 (§2). */
export function entryProbability(sectorMargin: number): number {
  const n = COMPANY.npc;
  return Math.min(n.entryCap, (n.entryBase * Math.max(0, sectorMargin - n.entryMarginFloor)) / n.entryMarginStep);
}

/**
 * Quarterly NPC exits and entries (§2). An NPC's unit margin is its price against the sector's cost at the reference
 * load; it exits after `exitQuarters` quarters in a row of negative margin. Entry is a draw from the npc stream.
 */
export function npcQuarterly(c: Company, rng: Rng, day: number): void {
  const unitCost = (1 - SECTORS[c.sector].grossMargin) * COMPANY.demand.priceRef;
  for (const n of c.npcs) n.negQuarters = n.price < unitCost ? n.negQuarters + 1 : 0;
  c.npcs = c.npcs.filter((n) => n.negQuarters < COMPANY.npc.exitQuarters);
  const p = entryProbability(SECTORS[c.sector].grossMargin);
  const u = rng.uniform();
  if (u < p && c.npcs.length < COMPANY.npc.maxNpcs) {
    const leader = imitableLeaderLnQ(c, day);
    const idx = c.npcSeq++;
    c.npcs.push({
      id: `${c.id}:npc${idx}`,
      lnQ: leader + COMPANY.npc.qualitySpread * rng.normal() * 0.5,
      price: COMPANY.demand.priceRef * (1 + 0.05 * rng.normal()),
      marketing: COMPANY.npc.marketingBase,
      negQuarters: 0,
    });
  }
}

/** A fresh stream for the NPC draws of a market: seedStream(seed, `co:npc:<company>`) (§2, the stream naming). */
export function npcStream(seed: string, companyId: string): ReturnType<typeof seedStream> {
  return seedStream(seed, `co:npc:${companyId}`);
}
