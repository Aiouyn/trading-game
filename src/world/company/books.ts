import type { Company, CompanyWorld } from './types';

/**
 * The company books (B2 moved this out of company.ts so that governance, failure and commerce can post without importing
 * the day step). Cash in or out of a company's own books. A plain posting is money the world creates (a faucet, positive)
 * or destroys (a sink, negative). A `transfer` moves money between real parties (a player, another company, a creditor's
 * estate) and is neither, so the money-conservation identity stays exact: sum of cash + sink - faucet is constant.
 */
export function post(w: CompanyWorld, c: Company, day: number, reason: string, amount: number, transfer = false): void {
  if (amount === 0) return;
  c.cash += amount;
  if (!transfer) {
    if (amount > 0) w.flows.faucet += amount;
    else w.flows.sink += -amount;
  }
  c.ledger.push({ day, reason, amount });
  if (c.ledger.length > 200) c.ledger.splice(0, c.ledger.length - 200);
  c.ledgerTotals[reason] = (c.ledgerTotals[reason] ?? 0) + amount;
}
