/**
 * Quarter close, filing, the backlog reversal and the tiers (spec v1.7 §5, §6.1, §6.2, CB-051, CB-075, CB-077..CB-080).
 * The close freezes the quarter's statements and hashes them; the filing publishes them on F = close + 3 and checks the
 * hash. Nothing after the close can change a frozen statement (restatements do not exist in v1).
 */

import { COMPANY, type CompanyTierId } from '@/content/company';
import { sha256Hex } from './hash';
import { headcountBand, ttmFiled } from './signals';
import { loanBook } from './contracts';
import { totalHeads } from './staff';
import type { Company, FilingPublic, Resolved, Statements } from './types';

/** The §5 tier of a company on its frozen statements. Growth and Late may drop; Seed is the floor. */
export function tierFor(closed: Statements[]): CompanyTierId {
  const t = COMPANY.tiers;
  const last4 = closed.slice(-4);
  const last2 = closed.slice(-2);
  if (last4.length === 4) {
    const rev4 = last4.reduce((s, x) => s + x.revenue, 0);
    const profitable = last4.filter((x) => x.netIncome > 0).length;
    if (rev4 >= t.late.revenueLast4 && profitable >= t.late.profitableOfLast4) return 'late';
  }
  if (last2.length === 2) {
    const rev2 = last2.reduce((s, x) => s + x.revenue, 0);
    if (rev2 >= t.growth.revenueLast2 && last2[1]!.ocf > 0) return 'growth';
  }
  return 'seed';
}

/**
 * Tax on the quarter (§1): 20% of max(0, EBT - loss carryforward). A loss adds to the carryforward. Pure: the caller
 * posts the tax and stores the new carryforward.
 */
export function quarterTax(ebit: number, lossCarry: number): { tax: number; lossCarry: number } {
  if (ebit <= 0) return { tax: 0, lossCarry: lossCarry + -ebit };
  const used = Math.min(lossCarry, ebit);
  return { tax: COMPANY.taxRate * (ebit - used), lossCarry: lossCarry - used };
}

/** The open book's backlog $ and contribution CB (§5, v1.6): the effective units not yet shipped. */
export function openBookTotals(c: Company): { backlog: number; contribution: number } {
  let backlog = 0, contribution = 0;
  for (const o of c.orders) {
    const rem = o.qty - o.npcCut - o.shipped;
    backlog += rem * o.price;
    contribution += rem * (o.price - o.vc);
  }
  return { backlog, contribution };
}

/**
 * The frozen statements of the quarter that closed at `closeDay` (§6.1), built from the quarter's accumulators, the
 * tax already posted, and the balance sheet at the close tick.
 */
export function buildStatements(c: Company, closeDay: number, quarter: number, tax: number, ocfAfterTax: number): Statements {
  const q = c.qtd;
  const ebitda = q.revenue - q.cogs - q.opex;
  const ebit = ebitda - q.da;
  const ni = ebit - tax;
  const bl = openBookTotals(c);
  const lb = loanBook(c);
  const retained = c.retained + ni;
  return {
    quarter,
    periodCloseDay: closeDay,
    revenue: q.revenue,
    relatedRevenue: q.relatedRevenue ?? 0,
    relatedCash: c.relatedCash ?? 0,
    debt: lb.debt,
    loansOut: lb.loansOut,
    cogs: q.cogs,
    opex: q.opex,
    ebitda,
    da: q.da,
    ebit,
    tax,
    netIncome: ni,
    niAdj: ni,
    ocf: ocfAfterTax,
    capex: q.capex,
    fcf: ocfAfterTax - q.capex,
    cash: c.cash,
    receivables: c.ar,
    inventory: c.inv,
    payables: c.ap,
    ppe: c.ppe,
    equity: c.paidIn + retained,
    retained,
    backlog: bl.backlog,
    backlogContribution: bl.contribution,
    unitsShipped: q.units,
    unitCost: q.units > 0 ? q.cogs / q.units : 0,
    matUnit: q.units > 0 ? q.matCogs / q.units : 0,
    inputIndex: c.indexLast,
    heads: totalHeads(c),
    grossMargin: q.revenue > 0 ? (q.revenue - q.cogs) / q.revenue : 0,
  };
}

/** sha256 of the JSON of the frozen statements (§6.1): the hash the filing carries and the unit test checks. */
export function statementsHash(s: Statements): string {
  return sha256Hex(JSON.stringify(s));
}

/**
 * The §6.2 reversal over the orders that resolved since the last filing. Each resolved order o with a positive lift
 * l_o contributes l_o times its non-converted share (1 - shipped/qty) to l_nc, and a_o l_o to the allowance, with
 * a_o = floor(c_s q_o)/q_o (G17). X = max(0, l_nc - allowance). X is split across the signals by their non-converted lift
 * (X_k = X * l_nc,k / l_nc, G16), and R = sum_k fair_k (1 - e^(-X_k)) S_k, where S_k is the shares counted in signal k's
 * interval (the trading side supplies them; A3 passes zero until then).
 */
export function reversal(resolved: Resolved[], fairBySig: Record<number, number>, sharesBySig: Record<number, number>): {
  nonConversion: number;
  baseRate: number;
  excessLift: number;
  repayment: number;
  perSignal: Record<number, number>;
} {
  let qty = 0, unshipped = 0, lNc = 0, allowance = 0, baseRate = 0;
  const lNcBySig: Record<number, number> = {};
  for (const o of resolved) {
    qty += o.qty;
    unshipped += o.qty - o.shipped;
    baseRate = o.cs;
    if (!(o.lift > 0) || o.qty <= 0) continue;
    const nonconv = (o.qty - o.shipped) / o.qty;
    const a = Math.floor(o.cs * o.qty) / o.qty;
    lNc += o.lift * nonconv;
    allowance += a * o.lift;
    if (nonconv > 0) lNcBySig[o.reportedSig] = (lNcBySig[o.reportedSig] ?? 0) + o.lift * nonconv;
  }
  const X = Math.max(0, lNc - allowance);
  const perSignal: Record<number, number> = {};
  let R = 0;
  for (const [k, lk] of Object.entries(lNcBySig)) {
    const sig = Number(k);
    const xk = lNc > 0 ? (X * lk) / lNc : 0;
    perSignal[sig] = xk;
    R += (fairBySig[sig] ?? 0) * (1 - Math.exp(-xk)) * (sharesBySig[sig] ?? 0);
  }
  return {
    nonConversion: qty > 0 ? unshipped / qty : 0,
    baseRate,
    excessLift: X,
    repayment: R,
    perSignal,
  };
}

/** The public filing (CB-100) for frozen statements, with the reversal line (always present). */
export function filingOf(s: Statements, hash: string, filedDay: number, reversalLine: FilingPublic['backlogReversal'], heads: number): FilingPublic {
  return {
    quarter: s.quarter,
    periodCloseDay: s.periodCloseDay,
    filedDay,
    hash,
    income: {
      revUnrelated: s.revenue,
      relatedPartyIncome: s.relatedRevenue ?? 0,
      cogs: s.cogs,
      opex: s.opex,
      ebitda: s.ebitda,
      netIncome: s.netIncome,
      niAdj: s.niAdj,
    },
    relatedCash: s.relatedCash ?? 0,
    balance: {
      cash: s.cash,
      receivables: s.receivables,
      inventory: s.inventory,
      ppe: s.ppe,
      debt: s.debt ?? 0,
      equity: s.equity,
      retainedEarnings: s.retained,
      loansOut: s.loansOut ?? 0,
    },
    cashFlow: { ocf: s.ocf, capex: s.capex, capexMaint: s.da, fcf: s.fcf, dividends: 0, buybacks: 0 },
    headcountBand: headcountBand(heads),
    backlog: s.backlog,
    backlogContribution: s.backlogContribution,
    unitCost: s.unitCost,
    matUnit: s.matUnit,
    inputIndex: s.inputIndex,
    backlogReversal: reversalLine,
  };
}

/** TTM gross margin from the filed record (the valuation's m before the clip), with a fallback for no filings. */
export function filedMargin(filings: FilingPublic[], fallback: number): number {
  const t = ttmFiled(filings, 4);
  return t.rev > 0 ? t.gp / t.rev : fallback;
}
