/**
 * R&D into product quality (spec v1.7 §3, CB-021..CB-028). A project's duration is T = T0_s / min(1, n_RD / n_req);
 * spend S is drawn evenly over T; the odds are p = p_s (1 - e^(-S/S_ref)) (pharma: three gates); the outcome and the
 * quality draw are fixed at the project's start from the company's rd stream (N11). The quality moves on the day the
 * project completes (no instant effect from spend). Patents (pharma and industrial) pause NPC imitation of the gain.
 */

import { COMPANY, PHARMA_GATES, SECTORS, type CompanySector } from '@/content/company';
import { Rng } from '@/engine';
import type { Company, Product, Project, ProjectKind } from './types';

export interface RdBand {
  /** the odds shown before launch: p +- 5 points (X15) */
  pLow: number;
  p: number;
  pHigh: number;
  /** the quality gain in ln at bear, base, bull (z = -1, 0, +1) */
  dqBear: number;
  dqBase: number;
  dqBull: number;
}

/** S_ref: 20 gd of the product's revenue, with a $20k floor (§3). */
export function sRef(revenuePerDay: number): number {
  return Math.max(COMPANY.rd.sRefDays * Math.max(0, revenuePerDay), COMPANY.rd.sRefMin);
}

/** The spend factor 1 - e^(-S/S_ref). */
export function spendFactor(spend: number, revenuePerDay: number): number {
  return 1 - Math.exp(-spend / sRef(revenuePerDay));
}

/** Success probability: p_s (1 - e^(-S/S_ref)); pharma uses the product of its three gate odds (§3). */
export function successOdds(sector: CompanySector, spend: number, revenuePerDay: number): number {
  if (sector === 'health') return PHARMA_GATES.odds.reduce((a, b) => a * b, 1);
  return SECTORS[sector].pSuccess * spendFactor(spend, revenuePerDay);
}

/** Quality gain in ln on success: 0.20 (1 - e^(-S/S_ref)) 0.8^k (1 + 0.25 z) (§3). */
export function qualityGain(spend: number, revenuePerDay: number, k: number, z: number): number {
  return COMPANY.rd.gain * spendFactor(spend, revenuePerDay) * Math.pow(COMPANY.rd.kDecay, k) * (1 + COMPANY.rd.zSpread * z);
}

/** The band shown before launch (X15, CB-024): odds +- 5 points, and the gain at z = -1, 0, +1. */
export function projectBand(sector: CompanySector, product: Product, spend: number, revenuePerDay: number): RdBand {
  const p = successOdds(sector, spend, revenuePerDay);
  const b = COMPANY.rd.pBand;
  return {
    pLow: Math.max(0, p - b),
    p,
    pHigh: Math.min(1, p + b),
    dqBear: qualityGain(spend, revenuePerDay, product.k, -1),
    dqBase: qualityGain(spend, revenuePerDay, product.k, 0),
    dqBull: qualityGain(spend, revenuePerDay, product.k, 1),
  };
}

/** Project duration in gd (§3). Pharma runs three gates of 20 gd each. `productiveRd` is the productive R&D heads. */
export function projectDays(sector: CompanySector, productiveRd: number): number {
  const base = sector === 'health' ? PHARMA_GATES.gateDays * PHARMA_GATES.odds.length : SECTORS[sector].rdDays;
  return Math.ceil(base / Math.min(1, productiveRd / COMPANY.rd.nReq));
}

/**
 * Start a project. The outcome is drawn now, from the company's rd stream (the stream is advanced and saved back):
 * the uniform for success, and z in U(-1, 1) for the gain; pharma draws one uniform per gate.
 */
export function startProject(
  c: Company, rng: Rng, kind: ProjectKind, product: Product, spend: number, day: number,
  revenuePerDay: number, productiveRd: number,
): Project {
  const sector = c.sector;
  const days = projectDays(sector, productiveRd);
  const pShown = successOdds(sector, spend, revenuePerDay);
  let gates: boolean[] = [];
  let success: boolean;
  if (sector === 'health') {
    gates = PHARMA_GATES.odds.map((odds) => rng.uniform() < odds);
    success = gates.every(Boolean);
  } else {
    success = rng.uniform() < pShown;
  }
  const z = 2 * rng.uniform() - 1;
  const id = `${c.id}:p${c.projSeq++}`;
  return {
    id, kind, productId: product.id, spend, spendPerDay: spend / days, startDay: day, endDay: day + days,
    success, z, pShown, gates,
  };
}

/**
 * Apply a completed project (§3): on success the quality rises by its gain (the next-gen project resets k first and
 * bumps the generation), a patent is granted where the sector has them, and a cost project improves cost efficiency.
 */
export function completeProject(c: Company, p: Project, day: number, revenuePerDay: number): void {
  const product = c.products.find((x) => x.id === p.productId);
  if (!product) return;
  if (!p.success) return;
  if (p.kind === 'cost') {
    const gain = COMPANY.rd.costGain * spendFactor(p.spend, revenuePerDay) * Math.pow(COMPANY.rd.kDecay, product.k) * (1 + COMPANY.rd.zSpread * p.z);
    c.eff = Math.min(COMPANY.rd.costEffCap, c.eff + Math.max(0, gain));
    product.k += 1;
    return;
  }
  if (p.kind === 'nextgen') {
    product.generation += 1;
    product.k = 0;
  }
  const gain = qualityGain(p.spend, revenuePerDay, product.k, p.z);
  product.q *= Math.exp(gain);
  product.k += 1;
  if (SECTORS[c.sector].patents) {
    product.patents.push({ until: day + COMPANY.rd.patentDays, lnGain: gain });
  }
}

/** Quality display score (§3, CB-025): clamp(round(80 + 30 ln(q / Q_f)), 0, 100). */
export function qualityScore(q: number, frontier: number): number {
  const raw = COMPANY.qualityScale.base + COMPANY.qualityScale.slope * Math.log(q / frontier);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** The frontier moves up at delta_s per gd (§3, CB-026). */
export function frontierStep(c: Company): void {
  c.frontierLn += Math.log1p(SECTORS[c.sector].frontierDrift);
}

export const RD_KINDS: ProjectKind[] = ['quality', 'cost', 'nextgen'];
