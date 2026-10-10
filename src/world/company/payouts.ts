/**
 * Dividends (quant-company-building v1.7 section 5.3; X5; Phase 4 B1). A dividend is allowed only when all four rules hold:
 * retained earnings stay above zero after it, cash after it covers 21 gd of opex and COGS, the covenants are clean (no breach
 * and no cure), and the dividend is at most the TTM filed FCF. Otherwise the declaration is refused (dividendNotPermitted),
 * and it is not just flagged. A permitted dividend drawn in a quarter with a new bank loan raises the public distress flag
 * until the next filing. The payment is a transfer from the company to the register: players get it as non-trading income,
 * NPC holders get it as cash, and the treasury (the company's own shares) gets nothing.
 */

import { COMPANY } from '@/content/company';
import { notify, bump, today } from '../core';
import type { GameState, StepOutput } from '../types';
import { post } from './company';
import { founderKeyOf, treasuryIdOf } from './ipo';
import { ttmOf } from './debt';
import type { Company, CompanyReject } from './types';

/** The treasury's shares: the company's own stock, which takes no dividend. */
export function treasuryShares(g: GameState, c: Company): number {
  if (!c.listed || !c.treasuryId) return 0;
  return g.market.accounts[treasuryIdOf(c.id)]?.positions[c.listed.assetId]?.qty ?? 0;
}

/** Which of the four rules fails, or null when the dividend is permitted (the order of the rules is the order of the copy). */
export function dividendRule(g: GameState, c: Company, perShare: number): 'filings' | 'covenant' | 'retained' | 'cash' | 'fcf' | null {
  if (c.filings.length === 0) return 'filings';
  if (c.covenant.status !== 'ok') return 'covenant';
  const payable = c.shares - treasuryShares(g, c);
  const total = perShare * payable;
  if (!(c.retained - total > 0)) return 'retained';
  const last = c.closed[c.closed.length - 1];
  const dailyCost = last ? (last.cogs + last.opex) / COMPANY.quarterDays : 0;
  if (c.cash - total < COMPANY.dividends.cashCoverDays * dailyCost) return 'cash';
  const fcf = ttmOf(c).fcf;
  if (!(fcf > 0) || total > fcf) return 'fcf';
  return null;
}

/** Declare a dividend per share. Refused with dividendNotPermitted when a rule fails (nothing changes). */
export function declareDividend(
  g: GameState, playerId: string, c: Company, perShare: number, out: StepOutput | null,
): { ok: true; value: Record<string, unknown> } | { ok: false; reject: CompanyReject } {
  if (c.ownerId !== playerId) return { ok: false, reject: { code: 'notFounder' } };
  if (!(Number.isFinite(perShare) && perShare > 0)) return { ok: false, reject: { code: 'dividendBadAmount' } };
  if (dividendRule(g, c, perShare) !== null) return { ok: false, reject: { code: 'dividendNotPermitted' } };
  const day = today(g);
  const payable = c.shares - treasuryShares(g, c);
  const total = perShare * payable;
  const w = g.companies!;
  post(w, c, day, 'dividend', -total, true);
  c.retained -= total;
  c.qtd.dividends += total;
  if (!c.listed) {
    for (const [holder, shares] of Object.entries(c.capTable)) {
      const pay = shares * perShare;
      if (holder === founderKeyOf(c.ownerId)) bump(g, playerId, pay);
      else if (w.investors[holder]) w.investors[holder]!.cash += pay;
    }
  } else {
    const assetId = c.listed.assetId;
    const tid = treasuryIdOf(c.id);
    for (const id of Object.keys(g.market.accounts).sort()) {
      if (id === tid) continue;
      const q = g.market.accounts[id]?.positions[assetId]?.qty ?? 0;
      if (q <= 0) continue;
      const pay = q * perShare;
      if (g.players[id]) bump(g, id, pay);
      else {
        const a = g.market.accounts[id]!;
        g.market = { ...g.market, accounts: { ...g.market.accounts, [id]: { ...a, cash: a.cash + pay } } };
      }
    }
  }
  if (c.lastDebtDrawDay >= c.qtd.startDay) c.divDistress = true;
  notify(g, out, playerId, { kind: 'system', tone: 'info', text: `${c.name} paid a dividend of $${perShare.toFixed(2)} a share.`, msg: { key: 'company.note.dividend', vars: { name: c.name, perShare: perShare.toFixed(2) } } });
  return { ok: true, value: { total, perShare, distress: c.divDistress } };
}
