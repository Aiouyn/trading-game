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
import { post } from './books';
import { insiderByStake } from './contracts';
import { recordPayout } from './failure';
import { founderKeyOf, poolIdOf, treasuryIdOf } from './ipo';
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

/** The NPC investors that hold a listed company's pool shares, in key order (the founder, the float and the book are not). */
function poolHolders(c: Company, g: GameState): string[] {
  const w = g.companies!;
  return Object.keys(c.capTable)
    .filter((k) => k !== founderKeyOf(c.ownerId) && !k.startsWith('float:') && w.investors[k] && (c.capTable[k] ?? 0) > 0)
    .sort();
}

/**
 * The NPC pools' shares of a listed company sit in one engine account (the pool). Their dividend belongs to the investors
 * in the cap table, pro rata to their shares, so it is paid to each investor's own cash and the pool keeps no cash of its
 * own. The last investor takes the rounding remainder, so the pool's payment is paid out in full.
 */
function payPool(g: GameState, c: Company, pay: number): void {
  const w = g.companies!;
  const holders = poolHolders(c, g);
  const total = holders.reduce((x, k) => x + c.capTable[k]!, 0);
  let left = pay;
  holders.forEach((k, idx) => {
    const part = idx === holders.length - 1 ? left : (pay * c.capTable[k]!) / total;
    left -= part;
    w.investors[k]!.cash += part;
  });
}

/**
 * The NPC pool's own cash goes to its investors (O-9, B1 deviation 7). The pool account holds the pool's shares, and its fills
 * move its cash: a scheduled sale's proceeds come in, and any purchase goes out. Those belong to the investors in the cap
 * table, pro rata to their shares, as the dividend does, so the pool keeps no cash. Called on every tick (companyStep): a pool
 * with no cash does nothing, and a pool with no investor holding shares keeps its cash. Money is conserved: the pool's cash
 * moves to the investor pools, and nothing is made or lost.
 */
export function sweepPoolCash(g: GameState): void {
  const w = g.companies;
  if (!w) return;
  for (const c of Object.values(w.companies).sort((x, y) => x.id.localeCompare(y.id))) {
    const pid = poolIdOf(c.id);
    const a = g.market.accounts[pid];
    if (!a || a.cash === 0 || poolHolders(c, g).length === 0) continue;
    payPool(g, c, a.cash);
    g.market = { ...g.market, accounts: { ...g.market.accounts, [pid]: { ...a, cash: 0 } } };
  }
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
  // a dividend paid to a player is a covered payment (spec 5.3): the clawback can reach it for 63 gd, with its insider flag
  const covered = (pid: string, pay: number, stake: number) => recordPayout(c, {
    day, toPlayerId: pid, amount: pay, covered: pay, kind: 'dividend', termsDay: day, flagged: false,
    insider: insiderByStake(w, c, pid, stake),
  });
  if (!c.listed) {
    for (const [holder, shares] of Object.entries(c.capTable)) {
      const pay = shares * perShare;
      if (holder === founderKeyOf(c.ownerId)) {
        bump(g, playerId, pay);
        covered(playerId, pay, shares / c.shares);
      } else if (w.investors[holder]) w.investors[holder]!.cash += pay;
    }
  } else {
    const assetId = c.listed.assetId;
    const tid = treasuryIdOf(c.id);
    const pid = poolIdOf(c.id);
    for (const id of Object.keys(g.market.accounts).sort()) {
      if (id === tid) continue;
      const q = g.market.accounts[id]?.positions[assetId]?.qty ?? 0;
      // a short holder owes the dividend on the shares it is short (a negative holding pays a negative amount), so the
      // payments add up to the declared total exactly: no dividend is paid on shares that do not exist (X5, X11)
      if (q === 0) continue;
      const pay = q * perShare;
      if (g.players[id]) {
        bump(g, id, pay);
        covered(id, pay, q / c.shares);
      } else if (id === pid && poolHolders(c, g).length > 0) {
        payPool(g, c, pay);
      } else {
        const a = g.market.accounts[id]!;
        g.market = { ...g.market, accounts: { ...g.market.accounts, [id]: { ...a, cash: a.cash + pay } } };
      }
    }
  }
  if (c.lastDebtDrawDay >= c.qtd.startDay) c.divDistress = true;
  notify(g, out, playerId, { kind: 'system', tone: 'info', text: `${c.name} paid a dividend of $${perShare.toFixed(2)} a share.`, msg: { key: 'company.note.dividend', vars: { name: c.name, perShare: perShare.toFixed(2) } } });
  return { ok: true, value: { total, perShare, distress: c.divDistress } };
}
