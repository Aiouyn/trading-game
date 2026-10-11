import { COMPANY } from '@/content/company';
import { vwap30, type WorldState } from '@/engine';
import { bump, notify, priceOf, spendableCash, today } from '../core';
import type { GameState, StepOutput } from '../types';
import { BANK_POOL } from './debt';
import { bankrupt, type FailureMoney } from './failure';
import { addShares, founderKeyOf, npcBookIdOf } from './ipo';
import type { Company, CompanyWorld } from './types';

/**
 * The founder's stakes in the company layer at a fresh start (velvet-bankruptcy.md, lead-phase6.md 6B ruling):
 *
 * - a PRIVATE company whose only owner is the founder goes through the existing company failure path (failure.ts
 *   `bankrupt`): its creditors are paid from its estate, the founder's guarantees are called, and what is left is written off;
 * - a LISTED company's founder shares go to its market book (`npc:book:<asset>`) at 70% of the 30-day VWAP (or of the last
 *   price). The book pays from its own cash, so the block is capped by that cash: the book buys what it can afford, and the
 *   shares it cannot pay for pass to the book for no payment. That short-book outcome is defined, not a dead end: the locked
 *   founder shares would otherwise stall the sell-down, and a busted founder keeps no stake. The proceeds are cash, and the
 *   bust sweep takes them with the rest. The sale runs first in the close. The engine's `tenderOffer` is not used: it settles
 *   every holder at one price, at or above 1.2 x VWAP30, and delists the company, so it cannot price a 70% block;
 * - the founder's guarantees are called once and settled: the company-level guarantee pays the company's cash (a capital
 *   injection, the failure path's "estate" for a live company), and each guaranteed bank loan is paid down to the bank pool.
 *   A call the founder cannot cover (above the court floor) is booked as personal debt once, and the guarantee is discharged,
 *   so a later chapter does not book it again.
 *
 * Every move is a transfer (a company, the bank pool or the market book gives or takes the same cent), so the world money
 * identity closes. A company with other owners is not touched (the ruling covers only the founder's own company).
 */

/** The 70% price of a listed founder sale, of the 30-day VWAP (the fallback is the last price when there is no VWAP yet). */
export const FOUNDER_SALE_RATIO = 0.7;

/** The founder's companies: owned by the player and not yet failed. */
export function founderCompanies(w: CompanyWorld | undefined, pid: string): Company[] {
  if (!w) return [];
  return Object.values(w.companies).filter((c) => c.ownerId === pid && !c.bankrupt).sort((a, b) => a.id.localeCompare(b.id));
}

/** A private company whose only holder is the founder (no investor pool or other holder has shares). */
export function onlyFounderOwns(c: Company, pid: string): boolean {
  if (c.listed) return false;
  const own = founderKeyOf(pid);
  return Object.entries(c.capTable).every(([k, v]) => k === own || !(v > 0));
}

/** The money the failure path needs: the spendable cash (restricted cash is not spent), and transfers in and out. */
function failureMoney(g: GameState): FailureMoney {
  return {
    money: {
      cash: (pid) => spendableCash(g, pid),
      take: (pid, amount) => bump(g, pid, -amount),
      give: (pid, amount) => bump(g, pid, amount),
    },
  };
}

const round2 = (x: number): number => Math.round(x * 100) / 100;
const money = (x: number): string => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The private companies the founder alone owns go through the failure path. Returns the companies that failed (their names
 * are the notice's copy). Idempotent: a failed company is no longer a founder company.
 */
export function failPrivateFounderCompanies(g: GameState, pid: string, out: StepOutput | null): string[] {
  const w = g.companies;
  const failed: string[] = [];
  for (const c of founderCompanies(w, pid)) {
    if (!w || !onlyFounderOwns(c, pid)) continue;
    bankrupt(w, c, failureMoney(g), today(g));
    failed.push(c.name);
  }
  if (failed.length) notify(g, out, pid, { kind: 'system', tone: 'warn', text: `${failed.join(', ')} closed with its creditors paid from its own assets.`, msg: { key: 'comeback.company.failed', vars: { names: failed.join(', ') } } });
  return failed;
}

/**
 * The founder's shares in each listed company they founded go to the market book at 70% of the 30-day VWAP (or of the last
 * price). The book pays from its cash: it buys min(stake, floor(cash / price)) shares, and the rest of the stake passes to
 * the book for no payment (the short-book outcome, see the header). Returns the proceeds. Idempotent: once the founder's
 * holding is gone, a second call does nothing.
 */
export function sellListedFounderStakes(g: GameState, pid: string, out: StepOutput | null): number {
  let proceeds = 0;
  for (const c of founderCompanies(g.companies, pid)) {
    if (!c.listed) continue;
    const assetId = c.listed.assetId;
    const own = founderKeyOf(pid);
    const held = Math.max(0, g.market.accounts[pid]?.positions[assetId]?.qty ?? 0);
    const stake = Math.min(held, Math.max(0, c.capTable[own] ?? 0));
    if (stake <= 0) continue;
    const bookId = npcBookIdOf(assetId);
    const book = g.market.accounts[bookId];
    if (!book) continue;
    const base = vwap30(g.market, assetId) ?? priceOf(g, assetId);
    const price = round2(base * FOUNDER_SALE_RATIO);
    if (!(price > 0)) continue;
    const bookCash = Math.max(0, book.cash);
    const payable = Math.min(stake, Math.floor(bookCash / price));
    const unpaid = stake - payable;
    const amount = Math.min(round2(payable * price), round2(bookCash));
    // the whole holding moves to the book; the book's cash moves to the founder for what it paid (nothing is created)
    const pos = g.market.accounts[pid]!.positions[assetId]!;
    let s: WorldState = g.market;
    s = { ...s, accounts: { ...s.accounts, [pid]: { ...g.market.accounts[pid]!, positions: { ...g.market.accounts[pid]!.positions, [assetId]: { ...pos, qty: pos.qty - stake } } } } };
    s = addShares(s, bookId, assetId, stake, price);
    if (amount > 0) s = { ...s, accounts: { ...s.accounts, [bookId]: { ...s.accounts[bookId]!, cash: s.accounts[bookId]!.cash - amount } } };
    g.market = s;
    if (amount > 0) bump(g, pid, amount);
    c.capTable[own] = (c.capTable[own] ?? 0) - stake;
    if (c.capTable[own]! <= 0) delete c.capTable[own];
    c.capTable[bookId] = (c.capTable[bookId] ?? 0) + stake;
    proceeds += amount;
    if (payable > 0) {
      notify(g, out, pid, { kind: 'system', tone: 'brass', text: `Your founder shares in ${c.name} were sold back to the market for $${money(amount)}.`, msg: { key: 'comeback.stake.sold', vars: { name: c.name, amount: money(amount) } } });
    }
    if (unpaid > 0) {
      notify(g, out, pid, { kind: 'system', tone: 'warn', text: `The market could not pay for ${unpaid.toLocaleString('en-US')} of your founder shares in ${c.name}, so they passed with no payment.`, msg: { key: 'comeback.stake.unpaid', vars: { name: c.name, shares: unpaid.toLocaleString('en-US') } } });
    }
  }
  return proceeds;
}

/**
 * The founder's guarantees on a listed company are called once and settled (velvet-bankruptcy.md edge cases): the company-level
 * guarantee pays the company's cash, each guaranteed bank loan is paid down to the bank pool. Each call is taken above the
 * court floor; what the founder cannot pay is personal debt, booked once. The guarantee is then discharged, paid or not, so
 * a second call (a later chapter) books nothing again. Returns the amount paid.
 */
export function callFounderGuarantees(g: GameState, pid: string, out: StepOutput | null): number {
  const w = g.companies;
  if (!w) return 0;
  const floor = COMPANY.failure.floor;
  const bank = w.investors[BANK_POOL];
  let called = 0;
  for (const c of founderCompanies(w, pid)) {
    if (!c.listed) continue;
    const calls: { amount: number; apply: (got: number) => void; discharge: () => void }[] = [];
    if (c.guarantee?.playerId === pid && c.guarantee.amount > 0) {
      calls.push({ amount: c.guarantee.amount, apply: (got) => { c.cash += got; }, discharge: () => { c.guarantee = null; } });
    }
    for (const d of c.debts) {
      if (d.guarantor === pid && d.guaranteedAmount > 0 && d.principal > 0 && bank) {
        const amount = Math.min(d.guaranteedAmount, d.principal);
        calls.push({ amount, apply: (got) => { d.principal -= got; bank.cash += got; }, discharge: () => { d.guaranteedAmount = 0; } });
      }
    }
    for (const call of calls) {
      const got = Math.min(call.amount, Math.max(0, spendableCash(g, pid) - floor));
      if (got > 0) {
        bump(g, pid, -got);
        call.apply(got);
        called += got;
      }
      const unpaid = call.amount - got;
      if (unpaid > 0) {
        w.personalDebt ??= {};
        w.personalDebt[pid] = (w.personalDebt[pid] ?? 0) + unpaid;
      }
      call.discharge();
    }
  }
  if (called > 0) notify(g, out, pid, { kind: 'system', tone: 'warn', text: `Guarantees of $${money(called)} were called on your companies' debts.`, msg: { key: 'comeback.guarantee.called', vars: { amount: money(called) } } });
  return called;
}
