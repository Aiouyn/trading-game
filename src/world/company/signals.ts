/**
 * Weekly operating signals and the consensus (spec v1.7 §6.2, CB-069..CB-076). Listed companies only (signals start at
 * listing). Each band centre is true * exp(eps); eps is drawn once per filing (G20) from the company's sig stream; the
 * consensus is bias-corrected (centre * exp(-sigma^2/2)) and moves fully at each signal (alpha = 1, no smoothing).
 *
 * The lnV step of a signal, ln(V_cons,new / V_cons,old), and each unreported order's lift l_o = sens * cm_o are recorded
 * as data. The engine's value pool reads them in stage A2; nothing in this file moves a price.
 */

import { COMPANY, SECTORS } from '@/content/company';
import { Rng } from '@/engine';
import { backlogLift, clippedGrowth, lnPerShare, sensCB, vEngine, type ValuationInputs } from './valuation';
import { totalHeads } from './staff';
import type { Company, FilingPublic, NoiseDraw, Order, WeeklySignal } from './types';

/** Bias correction for a lognormal band centre: E[centre] = true * exp(sigma^2 / 2) (§6.2). */
export function biasCorrect(center: number, sigma: number): number {
  return center * Math.exp(-(sigma * sigma) / 2);
}

/** The band around a centre, +- width (ordered low to high). */
export function band(center: number, width: number): [number, number] {
  const a = center * (1 - width);
  const b = center * (1 + width);
  return a <= b ? [a, b] : [b, a];
}

/** Draw the quarter's noise once per filing: one eps per component, carried by every report until the next filing (G20). */
export function noiseFor(c: Company, rng: Rng): NoiseDraw {
  if (c.noise && c.noise.filings === c.filingCount) return c.noise;
  c.noise = {
    filings: c.filingCount,
    eRevenue: COMPANY.signals.sigRevenue * rng.normal(),
    eBacklog: COMPANY.signals.sigBacklog * rng.normal(),
  };
  return c.noise;
}

/** The headcount band of §6.2: 1-10, 11-50, 51-200, 201-1k, 1k-5k, 5k+. */
export function headcountBand(heads: number): string {
  const edges = COMPANY.headcountBands;
  const labels = ['1-10', '11-50', '51-200', '201-1k', '1k-5k', '5k+'];
  for (let i = 0; i < edges.length; i++) if (heads <= edges[i]!) return labels[i]!;
  return labels[labels.length - 1]!;
}

/** The utilization band of §6.2 (keys): < 60, 60-85, 85-100, > 100 percent. */
export function utilizationBand(u: number): string {
  const [a, b, d] = COMPANY.utilBands;
  if (u < a!) return 'lt60';
  if (u < b!) return 'b60_85';
  if (u <= d!) return 'b85_100';
  return 'gt100';
}

/** Filed TTM summary: the last `n` filings, summed (the caller annualizes). */
export function ttmFiled(filings: FilingPublic[], n: number): { rev: number; ni: number; ocfMinusDa: number; gp: number; count: number } {
  const xs = filings.slice(-n);
  let rev = 0, ni = 0, ocfMinusDa = 0, gp = 0;
  for (const f of xs) {
    rev += f.income.revUnrelated;
    ni += f.income.niAdj;
    ocfMinusDa += f.cashFlow.ocf - f.cashFlow.capexMaint;
    gp += f.income.revUnrelated - f.income.cogs;
  }
  return { rev, ni, ocfMinusDa, gp, count: xs.length };
}

/**
 * Valuation inputs from the filed record only (section 6.4): the last four filed quarters, annualized, and the net debt
 * of the latest filing. No current-quarter estimate and no private field is read, so two companies with the same
 * filings value the same way.
 */
export function filedInputs(c: Company, dCB: number): ValuationInputs {
  const past = ttmFiled(c.filings, 4);
  const n = past.count;
  const scale = n > 0 ? 4 / n : 0;
  const ttm8 = ttmFiled(c.filings, 8);
  const prior4 = c.filings.length >= 8 ? ttmFiled(c.filings.slice(0, c.filings.length - 4), 4) : null;
  const growth = prior4 && prior4.rev > 0 && ttm8.count === 8 ? past.rev / prior4.rev - 1 : 0;
  const last = c.filings[c.filings.length - 1];
  const netDebt = last ? last.balance.debt - last.balance.cash : 0;
  return {
    revU: past.rev * scale,
    eStar: n > 0 ? Math.min(past.ni * scale, past.ocfMinusDa * scale) : 0,
    growth: clippedGrowth(growth),
    credibility: COMPANY.valuation.cInit,
    netDebt,
    dCB,
    margin: past.rev > 0 ? past.gp / past.rev : SECTORS[c.sector].grossMargin,
  };
}

/**
 * The consensus inputs (section 6.2, G23) from the consensus estimates only: the last three filed quarters plus the
 * current quarter projected from the consensus of shipped revenue. Units are estimated as revenue over the public price
 * and the consensus margin is the filed unit cost times that price (G23).
 */
export function consensusInputs(c: Company, revQtdCons: number, cbCons: number, elapsed: number, priceAvg: number): ValuationInputs {
  const past = ttmFiled(c.filings, 3);
  const quarters = past.count + 1;
  const qRev = revQtdCons * (COMPANY.quarterDays / Math.max(1, elapsed));
  const rev = (past.rev + qRev) * (4 / quarters);
  const base = filedInputs(c, cbCons - c.cbFiled);
  const last = c.filings[c.filings.length - 1];
  let eStar = base.eStar;
  let qGp = 0;
  if (last && priceAvg > 0) {
    const unitsEst = qRev / priceAvg;
    const gpEst = unitsEst * (priceAvg - last.unitCost);
    qGp = gpEst;
    const gpFiled = last.income.revUnrelated - last.income.cogs;
    eStar = base.eStar + 4 * (gpEst - gpFiled);
  }
  const sumRev = past.rev + qRev;
  const margin = sumRev > 0 ? clampMargin((past.gp + qGp) / sumRev, base.margin) : base.margin;
  return { ...base, revU: rev, eStar, margin };
}

function clampMargin(m: number, fallback: number): number {
  return Number.isFinite(m) ? m : fallback;
}

export interface SignalInputs {
  c: Company;
  day: number;
  rng: Rng;
  shares: number;
  /** the true values; they only ever reach the public record through the noisy, banded reports below */
  revQtd: number;
  revPerWeek: number;
  backlog: number;
  backlogContribution: number;
  utilization: number;
  /** days elapsed in the quarter and the public price average (for the consensus projection) */
  elapsed: number;
  priceAvg: number;
}

/**
 * The weekly signal (section 6.2). The bands are centre * exp(eps) around the true values, so they are the only true
 * information that leaves the company. The consensus is then updated from those reports (bias-corrected, alpha = 1),
 * the valuation inputs are built from the consensus only, and each order not yet reported gets its lift
 * l_o = sens * cm_o. Returns the signal and the lnV step ln(V_cons,new / V_cons,old).
 */
export function publishSignal(a: SignalInputs): { signal: WeeklySignal; dLnV: number } {
  const { c, day, rng, shares } = a;
  const noise = noiseFor(c, rng);
  const sigRev = Math.exp(noise.eRevenue);
  const sigBk = Math.exp(noise.eBacklog);
  const revCenter = a.revQtd * sigRev;
  const cbCenter = a.backlogContribution * sigBk;
  const bkCenter = a.backlog * sigBk;
  const heads = totalHeads(c);
  const netHires: WeeklySignal['netHires'] = heads > c.headsAtSignal ? 'up' : heads < c.headsAtSignal ? 'down' : 'flat';
  c.headsAtSignal = heads;

  // the consensus after this report (bias-corrected, alpha = 1)
  const revCons = biasCorrect(revCenter, COMPANY.signals.sigRevenue);
  const cbCons = biasCorrect(cbCenter, COMPANY.signals.sigBacklog);
  const bkCons = biasCorrect(bkCenter, COMPANY.signals.sigBacklog);
  const prev = c.consensus;
  const cbPrev = prev ? prev.backlogContribution : c.cbFiled;
  const inputs = consensusInputs(c, revCons, cbCons, a.elapsed, a.priceAvg);
  const dNow = cbCons - c.cbFiled;
  const dPrev = cbPrev - c.cbFiled;
  const vNow = vEngine({ ...inputs, dCB: dNow });
  const lnNow = lnPerShare(vNow, shares);
  const lift = backlogLift(inputs, dNow, dPrev, shares);
  const sens = sensCB({ ...inputs, dCB: dNow });
  const fair = Math.exp(lnNow);
  const prevLn = prev ? prev.lnV : lnPerShare(vEngine({ ...inputs, dCB: dPrev }), shares);
  const dLnV = lnNow - prevLn;

  const idx = c.signalSeq++;
  c.consensus = { revQtd: revCons, backlog: bkCons, backlogContribution: cbCons, v: vNow, lnV: lnNow };
  for (const o of c.orders) {
    if (o.reportedSig >= 0) continue;
    o.reportedSig = idx;
    o.lift = sens * orderContribution(o);
  }

  const signal: WeeklySignal = {
    day,
    revenueQtdBand: band(revCenter, COMPANY.signals.bandRevenue),
    runRateBand: band(a.revPerWeek * sigRev, COMPANY.signals.bandRunRate),
    bookingsBand: band(bkCenter, COMPANY.signals.bandBacklog),
    netHires,
    utilizationBand: utilizationBand(a.utilization),
    launches: [],
    debtDrawn: 0,
    backlogContributionBand: band(cbCenter, COMPANY.signals.bandBacklog),
    backlogLift: lift,
  };
  c.signals.push(signal);
  if (c.signals.length > COMPANY.signals.keep) c.signals.splice(0, c.signals.length - COMPANY.signals.keep);
  c.sigLog.push({ idx, day, fair, sens, lift });
  if (c.sigLog.length > 40) c.sigLog.splice(0, c.sigLog.length - 40);
  c.lastSens = sens;
  c.lastFair = fair;
  return { signal, dLnV };
}

/** The contribution of one booked order (v1.6): its effective booked units times (price - variable cost). */
export function orderContribution(o: Order): number {
  return (o.qty - o.npcCut) * (o.price - o.vc);
}

/** The open book: effective units not yet shipped, with their $ and contribution (the CB of §5). */
export function openBook(orders: Order[]): { backlog: number; contribution: number; units: number } {
  let backlog = 0, contribution = 0, units = 0;
  for (const o of orders) {
    const rem = o.qty - o.npcCut - o.shipped;
    backlog += rem * o.price;
    contribution += rem * (o.price - o.vc);
    units += rem;
  }
  return { backlog, contribution, units };
}

/** The sector's cancel rate c_s for a company (§2). */
export function cancelRateOf(c: Company): number {
  return SECTORS[c.sector].cancelRate;
}
