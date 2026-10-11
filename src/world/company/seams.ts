// Dev and test seams for the Company app's views (O-16 and O-17): the admin commands the e2e specs use to reach a late-tier
// filing and a next-gen launch credit without playing for months. They change only the named player's own company, and the
// server refuses admin.* from clients (server/index.ts), so a player never reaches them.
import { COMPANY } from '@/content/company';
import { today } from '../core';
import type { CommandResult, GameState } from '../types';
import { headcountBand } from './signals';
import type { Company, FilingPublic } from './types';

const fail = (error: string): CommandResult => ({ ok: false, error });

/** A filed quarter with whole, realistic figures (the figures the Filings tab shows). */
function seamFiling(c: Company, quarter: number, day: number): FilingPublic {
  return {
    quarter,
    periodCloseDay: quarter * COMPANY.quarterDays,
    filedDay: day,
    hash: `seam-${c.id}-${quarter}`,
    income: { revUnrelated: 1_284_560, relatedPartyIncome: 0, cogs: 612_340, opex: 402_110, ebitda: 270_110, netIncome: 214_880, niAdj: 214_880, interest: 0 },
    balance: { cash: 530_210, receivables: 88_200, inventory: 61_400, ppe: 412_000, debt: 0, equity: 1_010_000, retainedEarnings: 310_000 },
    cashFlow: { ocf: 240_000, capex: 58_000, capexMaint: 21_000, fcf: 182_000, dividends: 0, buybacks: 0 },
    headcountBand: headcountBand(25),
    backlog: 0,
    backlogContribution: 0,
    unitCost: 12,
    matUnit: 6,
    inputIndex: 1,
    backlogReversal: { nonConversion: 0, baseRate: 0, excessLift: 0, repayment: 0 },
  };
}

/**
 * The late tier with two filed quarters (dev and tests only): the Filings tab and the statement layout. The tier is set here;
 * the next filing sets it from the company's own record again, as for any company.
 */
export function seedFiledLate(c: Company, day: number): void {
  c.tier = 'late';
  if (c.filings.length === 0) for (const quarter of [1, 2]) c.filings.push(seamFiling(c, quarter, day));
}

/**
 * A next-gen launch credit at a quality score (dev and tests only): the quality q that reads that score on the company's
 * frontier (qualityScore: clamp(round(80 + 30 ln(q / frontier)))), so the screen shows the score the credit has.
 */
export function seedLaunchCredit(c: Company, score: number): void {
  const K = COMPANY.qualityScale;
  const frontier = Math.exp(c.frontierLn);
  c.launchCredits.push({ q: frontier * Math.exp((score - K.base) / K.slope), generation: 2 });
}

function ownCompany(g: GameState, playerId: string): Company | undefined {
  return g.companies ? Object.values(g.companies.companies).find((x) => x.ownerId === playerId) : undefined;
}

/** The admin command: the player's company is late-tier with two filed quarters. */
export function adminFiledLate(g: GameState, playerId: string): CommandResult {
  const c = ownCompany(g, playerId);
  if (!c) return fail('no company for this player');
  seedFiledLate(c, today(g));
  return { ok: true };
}

/** The admin command: a next-gen launch credit at `score` (a whole number from 0 to 100). */
export function adminLaunchCredit(g: GameState, playerId: string, score: number): CommandResult {
  const c = ownCompany(g, playerId);
  if (!c) return fail('no company for this player');
  if (!Number.isInteger(score) || score < 0 || score > 100) return fail('score must be a whole number from 0 to 100');
  seedLaunchCredit(c, score);
  return { ok: true };
}
