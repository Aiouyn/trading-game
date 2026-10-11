import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { placeOrder, restrictionsOf, sellCapOf, soldOn } from '@/engine';
import { applyCommand, stepGame } from '../game';
import { TPD, today } from '../core';
import type { GameState } from '../types';
import { advanceTo, BUYER_A, companyOf, FOUNDER, founded, listedWorld, THREE_FILINGS_DAY, totalMoney } from './b1fixture';
import { BANK_POOL, annualEbitdaOf, covenantBreachOf } from './debt';
import { nextOpenDay, windowAt } from './insiders';
import { poolIdOf } from './ipo';
import type { Company, FilingPublic, IpoBook } from './types';

// The B1 review fixes: the round gate, the sell cap, the IPO fee, the NPC pool's dividend, the leverage annualization, the
// cure rate, the missed-payment default and the founder's window-close line.

/** A founder at R3 with three filed quarters, an open IPO book and buyer A's order: the state before the listing day. */
function preListing(seed: string): { g: GameState; c: Company; book: IpoBook } {
  const { g } = founded(seed);
  advanceTo(g, THREE_FILINGS_DAY);
  const c = companyOf(g);
  c.filedV = 100_000_000;
  g.players[FOUNDER]!.rankId = 'R3';
  g.players[BUYER_A]!.rankId = 'R3';
  applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 });
  applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 10_000 });
  return { g, c, book: c.ipo as IpoBook };
}

function round(g: GameState, companyId: string, amount: number) {
  return applyCommand(g, FOUNDER, { type: 'company.act', companyId, action: { kind: 'raiseRound', amount } });
}

describe('a private round is pre-listing and NPC-only', () => {
  it('is refused while the IPO book is open, and moves no shares', () => {
    const { g, c } = preListing('round-book');
    const shares = c.shares;
    const r = round(g, c.id, 100_000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('roundDuringIpo');
    expect(c.shares).toBe(shares);
    expect(c.capTable['npc:seed'] ?? 0).toBe(0);
  });

  it('is refused once the company is listed, and moves no shares', () => {
    const { g, c } = listedWorld('round-listed');
    const shares = c.shares;
    const r = round(g, c.id, 100_000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('roundAfterListing');
    expect(c.shares).toBe(shares);
  });
});

describe('the underwriting fee is a sink, and the IPO conserves money', () => {
  it('books 5% of the gross float value as a sink, and the total moves by the booked faucet less that sink', () => {
    const { g, c, book } = preListing('ipo-fee');
    const totalBefore = totalMoney(g);
    const faucetBefore = g.companies!.flows.faucet;
    const sinkBefore = g.companies!.flows.sink;
    advanceTo(g, book.listDay);
    // the company's own operations book sinks too, so the fee is read off the IPO's own ledger line
    const fee = -(c.ledgerTotals.underwriting ?? 0);
    expect(fee).toBeCloseTo(COMPANY.ipo.underwritingFee * c.listed!.floatCap, 4);
    expect(fee).toBeCloseTo(COMPANY.ipo.underwritingFee * book.ipoShares * book.price, 4);
    expect(g.companies!.flows.sink - sinkBefore).toBeGreaterThanOrEqual(fee - 1e-6);
    expect(totalMoney(g) - totalBefore).toBeCloseTo((g.companies!.flows.faucet - faucetBefore) - (g.companies!.flows.sink - sinkBefore), 4);
  });
});

describe('the founder sell cap (v1.7 §5.1, §6.1)', () => {
  it('is set at listing to 2% of the shares outstanding, for the founder only', () => {
    const { g, c, assetId } = listedWorld('cap-set');
    const r = restrictionsOf(g.market);
    expect(sellCapOf(r, assetId, FOUNDER)).toBe(Math.floor(COMPANY.insiders.sellCapPct * c.listed!.sharesOut));
    expect(sellCapOf(r, assetId, BUYER_A)).toBeUndefined();
  });

  it('holds on the founder window sales: no more than the cap is sold in a game day', () => {
    const { g, c, assetId } = listedWorld('cap-sell');
    const cap = Math.floor(COMPANY.insiders.sellCapPct * c.listed!.sharesOut);
    // past the lockup (listing + 168 gd) and inside the window of the filing on day 381
    advanceTo(g, 385);
    expect(windowAt(c, 385).open).toBe(true);
    const day = 385;
    applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'sell', type: 'market', qty: cap * 3, tif: 'gtc' } });
    while (g.market.tick < (day + 1) * TPD) stepGame(g);
    const sold = soldOn(restrictionsOf(g.market), assetId, FOUNDER, day);
    expect(sold).toBeGreaterThan(0);
    expect(sold).toBeLessThanOrEqual(cap);
  });
});

/** A listed company with a private round from the NPC seed pool before its IPO, so the pool holds shares after the listing. */
function listedWithInvestor(seed: string): { g: GameState; c: Company; assetId: string } {
  const { g } = founded(seed);
  advanceTo(g, THREE_FILINGS_DAY);
  const c = companyOf(g);
  c.filedV = 100_000_000;
  g.players[FOUNDER]!.rankId = 'R3';
  g.players[BUYER_A]!.rankId = 'R3';
  expect(round(g, c.id, 1_000_000).ok).toBe(true);
  applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 });
  applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 10_000 });
  advanceTo(g, (c.ipo as IpoBook).listDay);
  return { g, c, assetId: c.listed!.assetId };
}

describe('the NPC pool dividend goes to the investors', () => {
  it('pays the pool shares to the NPC investors pro rata, and conserves the money', () => {
    const { g, c, assetId } = listedWithInvestor('div-pool');
    const pool = g.market.accounts[poolIdOf(c.id)];
    expect(pool).toBeDefined();
    const poolQty = pool!.positions[assetId]?.qty ?? 0;
    expect(poolQty).toBeGreaterThan(0);
    const invBefore = Object.values(g.companies!.investors).reduce((x, p) => x + p.cash, 0);
    const poolCashBefore = pool!.cash;
    const totalBefore = totalMoney(g);
    const r = applyCommand(g, FOUNDER, { type: 'company.dividend', companyId: c.id, perShare: 0.000001 });
    expect(r.ok).toBe(true);
    const invAfter = Object.values(g.companies!.investors).reduce((x, p) => x + p.cash, 0);
    expect(invAfter - invBefore).toBeCloseTo(poolQty * 0.000001, 6);
    expect(g.market.accounts[poolIdOf(c.id)]!.cash).toBeCloseTo(poolCashBefore, 6);
    expect(totalMoney(g)).toBeCloseTo(totalBefore, 6);
  });
});

describe('leverage uses annualized EBITDA (§5: net debt / annualized EBITDA)', () => {
  /** a company with two filings of 100 EBITDA each: TTM 200, annualized 400 */
  function twoFilings(): Company {
    const f = (): FilingPublic => ({ income: { ebitda: 100, interest: 0 }, cashFlow: { fcf: 0 } }) as unknown as FilingPublic;
    return { filings: [f(), f()] } as unknown as Company;
  }

  it('annualizes a TTM sum built from fewer than four filings', () => {
    expect(annualEbitdaOf(twoFilings())).toBe(400);
  });

  it('does not breach at 2.5x when the annualized EBITDA supports the debt (the unannualized TTM would breach at 5x)', () => {
    expect(covenantBreachOf(twoFilings(), 1_000, 0)).toBeNull();
  });
});

describe('the covenant cure, the missed payment and the default', () => {
  it('a cure adds 0.05% a game day to the bank rate for as long as it is open', () => {
    const { g, c } = listedWorld('cure-rate');
    c.tier = 'growth';
    applyCommand(g, FOUNDER, { type: 'company.loan', companyId: c.id, amount: 9_000_000 });
    c.cash = 1_000_000;
    advanceTo(g, 255);
    expect(c.covenant.status).toBe('cure');
    const bank = g.companies!.investors[BANK_POOL]!;
    const before = bank.cash;
    advanceTo(g, 256);
    expect(c.covenant.status).toBe('cure');
    expect(bank.cash - before).toBeCloseTo(9_000_000 * (COMPANY.debt.ratePerDay + COMPANY.debt.cureRatePerDay), 6);
  });

  /** A listed company with a 9M bank loan drawn and its cash set to `cash`: the interest is 4,500 a game day. */
  function drawn(seed: string, cash: number) {
    const { g, c } = listedWorld(seed);
    c.tier = 'growth';
    applyCommand(g, FOUNDER, { type: 'company.loan', companyId: c.id, amount: 9_000_000 });
    c.cash = cash;
    return { g, c, bank: g.companies!.investors[BANK_POOL]! };
  }

  it('cash below zero with a loan drawn opens a five-day cure, with a founder notice; the day interest is still paid', () => {
    const { g, c, bank } = drawn('liq-open', 100);
    const bankBefore = bank.cash;
    advanceTo(g, today(g) + 1);
    const opened = today(g);
    expect(c.liquidityCureUntilDay).toBe(opened + COMPANY.debt.liquidityCureDays);
    expect(c.liquidityCureUntilDay! - opened).toBe(5);
    expect(c.cash).toBeLessThan(0);
    expect(bank.cash - bankBefore).toBeCloseTo(4_500, 6);
    expect(c.covenant.status).not.toBe('default');
    const note = g.players[FOUNDER]!.inbox.find((i) => i.msg?.key === 'company.note.liquidityCure');
    expect(note?.msg?.vars).toEqual({ name: c.name, day: opened + 5 });
  });

  it('a cure that is not cured is a default on its fifth day, and not before', () => {
    // the founder does nothing: the company stays short of what the bank is owed, every day of the cure
    const { g, c } = drawn('liq-default', -1_000_000);
    advanceTo(g, today(g) + 1);
    expect(c.liquidityCureUntilDay).not.toBeNull();
    const until = c.liquidityCureUntilDay!;
    advanceTo(g, until - 1);
    expect(c.covenant.status).not.toBe('default');
    expect(c.liquidityCureUntilDay).toBe(until);
    advanceTo(g, until);
    expect(c.covenant.status).toBe('default');
    expect(g.players[FOUNDER]!.inbox.some((i) => i.msg?.key === 'company.note.liquidityDefault')).toBe(true);
  });

  it('interest missed in the cure accrues as arrears at the facility rate, and no money moves to the bank', () => {
    const { g, c, bank } = drawn('liq-arrears', -1_000_000);
    advanceTo(g, today(g) + 1);
    const bankAfterOpen = bank.cash;
    const r = COMPANY.debt.ratePerDay;
    const I = 9_000_000 * r;
    // the day after opening: the day's interest is missed, so it is the arrears
    advanceTo(g, today(g) + 1);
    expect(c.debts[0]!.arrears).toBeCloseTo(I, 6);
    // the next day: the arrears accrue at the facility rate, and today's interest is added
    advanceTo(g, today(g) + 1);
    expect(c.debts[0]!.arrears).toBeCloseTo(I * (1 + r) + I, 6);
    expect(bank.cash).toBe(bankAfterOpen);
  });

  it('arrears accrue at the facility rate even in a covenant cure: the surcharge is on the day interest only', () => {
    const { g, c } = drawn('liq-cure-rate', -1_000_000);
    c.covenant = { status: 'cure', cureUntilDay: today(g) + 999 };
    advanceTo(g, today(g) + 1);
    expect(c.liquidityCureUntilDay).not.toBeNull();
    const s = COMPANY.debt.cureRatePerDay;
    const r = COMPANY.debt.ratePerDay;
    const I = 9_000_000 * (r + s);
    advanceTo(g, today(g) + 1);
    expect(c.covenant.status).toBe('cure');
    expect(c.debts[0]!.arrears).toBeCloseTo(I, 6);
    advanceTo(g, today(g) + 1);
    expect(c.covenant.status).toBe('cure');
    // the arrears grow at the facility rate r, and the day's interest carries the cure rate r + s
    expect(c.debts[0]!.arrears).toBeCloseTo(I * (1 + r) + I, 6);
  });

  it('the arrears are owed before the principal: a full repayment needs the cash for both, and the bank gets both', () => {
    const { g, c, bank } = drawn('liq-repay', -1_000_000);
    advanceTo(g, today(g) + 1);
    advanceTo(g, today(g) + 1);
    const arrears = c.debts[0]!.arrears!;
    expect(arrears).toBeCloseTo(4_500, 6);
    const debtId = c.debts[0]!.id;
    // the cash covers the principal but not the arrears on top: refused, and nothing moves
    c.cash = 9_000_000;
    const refused = applyCommand(g, FOUNDER, { type: 'company.repay', companyId: c.id, debtId, amount: 9_000_000 });
    expect(refused.error).toBe('insufficientFunds');
    expect(c.debts[0]!.principal).toBe(9_000_000);
    expect(c.debts[0]!.arrears).toBeCloseTo(arrears, 6);
    // with the arrears covered too, the repayment closes the loan and the bank receives both
    c.cash = 9_000_000 + arrears + 1_000;
    const bankBefore = bank.cash;
    const ok = applyCommand(g, FOUNDER, { type: 'company.repay', companyId: c.id, debtId, amount: 9_000_000 });
    expect(ok.ok).toBe(true);
    expect(bank.cash - bankBefore).toBeCloseTo(9_000_000 + arrears, 6);
    expect(c.debts).toHaveLength(0);
  });

  it('after a default no cure reopens: the company is not given a second window, and the arrears build with no money moved', () => {
    const { g, c, bank } = drawn('liq-post-default', -1_000_000);
    advanceTo(g, today(g) + 1);
    const until = c.liquidityCureUntilDay!;
    advanceTo(g, until);
    expect(c.covenant.status).toBe('default');
    expect(c.liquidityCureUntilDay).toBeNull();
    const notesAtDefault = g.players[FOUNDER]!.inbox.filter((i) => i.msg?.key === 'company.note.liquidityCure').length;
    const bankAtDefault = bank.cash;
    const arrearsAtDefault = c.debts[0]!.arrears!;
    advanceTo(g, until + 2);
    expect(c.covenant.status).toBe('default');
    expect(c.liquidityCureUntilDay).toBeNull();
    expect(g.players[FOUNDER]!.inbox.filter((i) => i.msg?.key === 'company.note.liquidityCure').length).toBe(notesAtDefault);
    expect(bank.cash).toBe(bankAtDefault);
    expect(c.debts[0]!.arrears!).toBeGreaterThan(arrearsAtDefault);
  });

  it('a covenant default ends an open liquidity cure: the company is in default, with no window left to run', () => {
    const { g, c } = drawn('liq-cov-default', -1_000_000);
    advanceTo(g, today(g) + 1);
    expect(c.liquidityCureUntilDay).not.toBeNull();
    c.covenant = { status: 'cure', cureUntilDay: today(g) };
    advanceTo(g, today(g) + 1);
    expect(c.covenant.status).toBe('default');
    expect(c.liquidityCureUntilDay).toBeNull();
    advanceTo(g, today(g) + 6);
    expect(c.covenant.status).toBe('default');
    expect(c.liquidityCureUntilDay).toBeNull();
  });

  it('a cure is ended early when the cash covers what is owed: the bank is paid, the arrears clear, the cure closes', () => {
    const { g, c, bank } = drawn('liq-cured', -1_000_000);
    advanceTo(g, today(g) + 1);
    advanceTo(g, today(g) + 1);
    expect(c.liquidityCureUntilDay).not.toBeNull();
    const owed = c.debts[0]!.arrears! * (1 + COMPANY.debt.ratePerDay) + 9_000_000 * COMPANY.debt.ratePerDay;
    c.cash = owed + 1_000_000;
    const bankBefore = bank.cash;
    advanceTo(g, today(g) + 1);
    expect(c.liquidityCureUntilDay).toBeNull();
    expect(c.debts[0]!.arrears).toBe(0);
    expect(bank.cash - bankBefore).toBeCloseTo(owed, 4);
    expect(c.covenant.status).not.toBe('default');
    expect(g.players[FOUNDER]!.inbox.some((i) => i.msg?.key === 'company.note.liquidityCured')).toBe(true);
  });
});

describe('the founder window-close line (§6.1, Q7)', () => {
  it('tells the founder how many orders the close cancelled and the next day the window opens; nothing is public', () => {
    const { g, c, assetId } = listedWorld('close-line');
    advanceTo(g, 213);
    applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'buy', type: 'limit', limitPrice: 0.0001, qty: 1, tif: 'gtc' } });
    const target = 214 * TPD + 1;
    while (g.market.tick < target) stepGame(g);
    const lines = g.players[FOUNDER]!.inbox.filter((i) => i.msg?.key === 'company.note.windowClosed');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.msg!.vars).toEqual({ name: c.name, count: 1, reopensDay: nextOpenDay(c, 214) });
    expect(nextOpenDay(c, 214)).toBe(213 + 44);
    expect(g.players[BUYER_A]!.inbox.some((i) => i.msg?.key === 'company.note.windowClosed')).toBe(false);
  });
});

describe('a listed save from before the sell cap gets it on its next day', () => {
  it('restores the founder cap at the day step, and leaves the other accounts uncapped', () => {
    const { g, c, assetId } = listedWorld('cap-migrate');
    const r = restrictionsOf(g.market);
    g.market = { ...g.market, restrictions: { ...r, sellCaps: {} } };
    expect(sellCapOf(restrictionsOf(g.market), assetId, FOUNDER)).toBeUndefined();
    advanceTo(g, today(g) + 1);
    expect(sellCapOf(restrictionsOf(g.market), assetId, FOUNDER)).toBe(Math.floor(COMPANY.insiders.sellCapPct * c.listed!.sharesOut));
    expect(sellCapOf(restrictionsOf(g.market), assetId, BUYER_A)).toBeUndefined();
  });
});

describe("the NPC pool's sale proceeds go to its investors (O-9, B1 deviation 7)", () => {
  it('a sale by the pool credits the investors pro rata to their shares, and the pool keeps no cash', () => {
    const { g, c, assetId } = listedWithInvestor('pool-sale');
    // the pool shares are locked for 168 game days from the listing: sell after the lockup lifts
    advanceTo(g, today(g) + 170);
    const pid = poolIdOf(c.id);
    expect(g.market.accounts[pid]!.positions[assetId]?.qty ?? 0).toBeGreaterThan(0);
    const holders = Object.keys(c.capTable).filter((k) => !!g.companies!.investors[k] && (c.capTable[k] ?? 0) > 0);
    expect(holders.length).toBeGreaterThan(0);
    const totalShares = holders.reduce((x, k) => x + c.capTable[k]!, 0);
    const invBefore = Object.fromEntries(holders.map((k) => [k, g.companies!.investors[k]!.cash]));
    const totalBefore = totalMoney(g);

    g.market = placeOrder(g.market, { playerId: pid, assetId, side: 'sell', type: 'market', qty: 500 }).state;
    // the sale fills over the day's ticks (the stock's volume cap per tick); stop short of the next game day, so no daily
    // finance runs and the money total moves only by the sale
    const poolFills: ReturnType<typeof stepGame>['fills'] = [];
    for (let k = 0; k < TPD - 2; k++) poolFills.push(...stepGame(g).fills.filter((f) => f.playerId === pid));
    expect(poolFills.length).toBeGreaterThan(0);
    expect(poolFills.reduce((x, f) => x + f.qty, 0)).toBe(500);
    // the pool's cash from its fills: a sale's proceeds, less the commission (which the book receives)
    const proceeds = poolFills.reduce((t, f) => t + (f.side === 'sell' ? f.qty * f.price - f.fee : -(f.qty * f.price + f.fee)), 0);
    expect(proceeds).toBeGreaterThan(0);

    // the pool keeps none of it, and the investors have it, each pro rata to its shares in the cap table
    expect(g.market.accounts[pid]!.cash).toBeCloseTo(0, 6);
    for (const k of holders) {
      const gain = g.companies!.investors[k]!.cash - invBefore[k]!;
      expect(gain, `investor ${k}`).toBeCloseTo((proceeds * c.capTable[k]!) / totalShares, 6);
    }
    const paid = holders.reduce((x, k) => x + (g.companies!.investors[k]!.cash - invBefore[k]!), 0);
    expect(paid).toBeCloseTo(proceeds, 6);
    // money is conserved: the pool's proceeds moved to the investors, the commission to the book
    expect(totalMoney(g)).toBeCloseTo(totalBefore, 6);
  });
});
