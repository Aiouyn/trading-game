import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { dayClose } from './close';
import { TPD, overhead } from './core';
import { valuationAndIncome } from './ledger';
import { textProvider } from './text';
import type { GameState } from './types';

/** A joined player, run past a few closes. */
function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = applyCommand(g, 'u1', { type: 'join', handle: 'trader_split', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  while (g.market.tick < 3 * TPD) stepGame(g);
  return g;
}

describe('the day close splits the change into trading, valuation and income (Stage 3)', () => {
  it('a business marked up while the only holding fell reads as a trading loss, with the valuation shown apart', () => {
    const g = joined('close-split-fall');
    const L = g.ledgers!.u1!;
    const prev = L.days[1]!;
    const cur = L.days[2]!;
    // yesterday: valuation 100, income 0. Today: valuation up 300 (a business re-marked), income up 10, trading -3.51
    prev.val = 100; prev.inc = 0;
    cur.val = 400; cur.inc = 10;
    cur.nw = prev.nw + 300 + 10 - 3.51;
    const card = dayClose(g, 'u1', 2)!;
    expect(card.valuation).toBeCloseTo(300, 6);
    expect(card.income).toBeCloseTo(10, 6);
    expect(card.trading).toBeCloseTo(-3.51, 6);
    expect(card.trading + card.valuation + card.income + card.external).toBeCloseTo(card.nwChange + card.external, 6);
    const copy = textProvider.dailyClose(card).map((m) => m.key);
    // the headline is the narrator's trading line (a down day), then the valuation and income lines
    expect(copy[0]).toBe('dayclose.title');
    expect(copy[1]).toMatch(/^txt\.narr\.head\.down\.\d+$/);
    expect(copy.slice(2, 4)).toEqual(['dayclose.valuation', 'dayclose.income']);
  });

  it('a day with no stored split counts the whole change as trading, as before', () => {
    const g = joined('close-split-old');
    const L = g.ledgers!.u1!;
    const prev = L.days[1]!;
    const cur = L.days[2]!;
    delete prev.val; delete prev.inc; delete cur.val; delete cur.inc;
    cur.nw = prev.nw + 25;
    const card = dayClose(g, 'u1', 2)!;
    expect(card.valuation).toBe(0);
    expect(card.income).toBe(0);
    expect(card.trading).toBeCloseTo(25, 6);
  });

  it('owner costs (upkeep, salaries, desk fees) are overheads: they lower income, so they never read as trading', () => {
    const g = joined('close-split-overheads');
    const before = valuationAndIncome(g, 'u1').inc;
    overhead(g, 'u1', 40, 'property upkeep');
    expect(valuationAndIncome(g, 'u1').inc).toBeCloseTo(before - 40, 6);
    expect(g.players.u1!.stats.overheads).toBe(40);
  });
});

describe('the business tax is its own split row (R-9-10): the four parts sum to the change', () => {
  it('a day with a business tax takes the tax out of trading and shows it as a row, the headline still reads trading', () => {
    const g = joined('close-split-tax');
    const L = g.ledgers!.u1!;
    const prev = L.days[1]!;
    const cur = L.days[2]!;
    // the same day as above, plus a 20 business tax booked at the close: the tax lowers net worth, not valuation or income
    prev.val = 100; prev.inc = 0;
    cur.val = 400; cur.inc = 10;
    cur.biz = { businesses: 1, net: 200, tax: 20, rate: 0.1 };
    cur.nw = prev.nw + 300 + 10 - 3.51 - 20;
    const card = dayClose(g, 'u1', 2)!;
    expect(card.tax).toBeCloseTo(-20, 6);
    expect(card.trading).toBeCloseTo(-3.51, 6);
    expect(card.valuation).toBeCloseTo(300, 6);
    expect(card.income).toBeCloseTo(10, 6);
    expect(card.trading + card.valuation + card.income + card.tax).toBeCloseTo(card.nwChange, 6);
    expect(card.biz).toEqual({ businesses: 1, net: 200, tax: 20, rate: 0.1 });
    const keys = textProvider.dailyClose(card).map((m) => m.key);
    expect(keys.slice(2, 5)).toEqual(['dayclose.valuation', 'dayclose.income', 'dayclose.tax']);
    expect(keys[1]).toMatch(/^txt\.narr\.head\.down\.\d+$/);
  });

  it('a day with no business has no tax row and no tax line', () => {
    const g = joined('close-split-tax-none');
    const L = g.ledgers!.u1!;
    const prev = L.days[1]!;
    const cur = L.days[2]!;
    cur.nw = prev.nw + 25;
    const card = dayClose(g, 'u1', 2)!;
    expect(card.tax).toBe(0);
    expect(card.biz ?? null).toBeNull();
    expect(textProvider.dailyClose(card).map((m) => m.key)).not.toContain('dayclose.tax');
  });
});
