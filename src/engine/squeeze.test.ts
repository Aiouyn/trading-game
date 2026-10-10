import { describe, expect, it } from 'vitest';
import { createWorld, quote, shockValue, stepMany } from './sim';
import { universeConfig } from './universe';
import { openAccount, setAccountPermissions } from './trading';
import { DEFAULT_ECOLOGY, ecologyLog } from './ecology';
import type { StepEvent, WorldConfig, WorldState } from './types';

const TPD = 24;
const STOCK = 'OSTV';
// The seed is the scenario's price path. With the closing auction printing news in full and the GARCH 0.12 / 0.86 universe
// (V1-PHASE1 r3), 'squeeze-test' fires on game day 7, the last day of this test, where the plain headline is already
// saturated at +1 by an unrelated up move, so the headline check cannot separate the two runs. 'squeeze-test-f' fires on
// day 6 with the plain headline at -0.574 and the squeezed one at +0.426, and day 7 exists for the next-day check.
const SEED = 'squeeze-test-f';
const NO_LISTINGS = { odds: { ipo: 0, bankruptcy: 0, merger: 0, spinoff: 0 } };
/**
 * the crowded book: five margin accounts, each short 15% of the stock's ADV, with half their short notional as collateral.
 * A 6% book lifts the close only about 0.5% (measured 2026-10-10); 15% lifts it about 1% by day 8.
 */
const TRADERS = ['trader-a', 'trader-b', 'trader-c', 'trader-d', 'trader-e'];
const SHORT_SHARE_OF_ADV = 0.15;
/** the shock: the stock's fundamental value jumps 60% on day 0, and the closing auction pulls the price toward it */
const SHOCK = 0.6;
const DAYS = 8;

function config(squeezeOn: boolean): WorldConfig {
  const cfg = universeConfig({ ticksPerDay: TPD, listings: NO_LISTINGS });
  return squeezeOn ? cfg : { ...cfg, squeeze: undefined };
}

function crowdedShorts(s: WorldState): WorldState {
  const def = s.config.assets.find((a) => a.id === STOCK)!;
  const adv = (def.advNotional ?? 1e9) / def.initialPrice;
  const q = Math.floor(SHORT_SHARE_OF_ADV * adv);
  let out = s;
  for (const id of TRADERS) {
    out = openAccount(out, id, 0);
    out = setAccountPermissions(out, id, { canShort: true, maxLeverage: 3 });
    const acct = out.accounts[id]!;
    const cash = 1.5 * q * def.initialPrice;
    out = {
      ...out,
      accounts: {
        ...out.accounts,
        [id]: {
          ...acct, cash, startingCash: cash, peakEquity: cash, dayStartEquity: cash,
          positions: { [STOCK]: { qty: -q, avgCost: def.initialPrice, realizedPnl: 0 } },
        },
      },
    };
  }
  return out;
}

interface Run {
  state: WorldState;
  events: StepEvent[];
  /** the stock's price and retail headline at the close of each game day, after the shock */
  closes: number[];
  headlines: number[];
}

function run(withShorts: boolean, squeezeOn: boolean): Run {
  let s = createWorld(SEED, config(squeezeOn));
  if (withShorts) s = crowdedShorts(s);
  s = shockValue(stepMany(s, 1).state, STOCK, SHOCK);
  const events: StepEvent[] = [];
  const closes: number[] = [];
  const headlines: number[] = [];
  for (let d = 0; d < DAYS; d++) {
    const r = stepMany(s, TPD);
    s = r.state;
    events.push(...r.events);
    closes.push(quote(s, STOCK).price);
    headlines.push(s.ecology!.assets.find((a) => a.id === STOCK)!.headline);
  }
  return { state: s, events, closes, headlines };
}

describe('short squeeze', () => {
  const squeezed = run(true, true);
  const plain = run(false, true);

  it('a crowded short book is liquidated by a positive shock', () => {
    const liq = squeezed.events.filter((e) => e.type === 'liquidation');
    expect(liq.length).toBeGreaterThanOrEqual(TRADERS.length);
    expect(liq.every((e) => e.type === 'liquidation' && e.assetId === STOCK)).toBe(true);
    expect(plain.events.some((e) => e.type === 'liquidation')).toBe(false);
  });

  it('emits one squeeze event for the stock once the day covers past the share of ADV', () => {
    const sq = squeezed.events.filter((e): e is Extract<StepEvent, { type: 'squeeze' }> => e.type === 'squeeze');
    expect(sq).toHaveLength(1);
    expect(sq[0]!.assetId).toBe(STOCK);
    expect(sq[0]!.cover).toBeGreaterThanOrEqual(0.2);
    expect(plain.events.some((e) => e.type === 'squeeze')).toBe(false);
  });

  it('the buy-ins lift the price above the same shock with no shorts, by a visible margin', () => {
    const last = DAYS - 1;
    expect(squeezed.closes[last]!).toBeGreaterThan(plain.closes[last]!);
    expect(squeezed.closes[last - 1]!).toBeGreaterThan(plain.closes[last - 1]!);
    expect(squeezed.closes[last]! / plain.closes[last]! - 1).toBeGreaterThan(0.005);
  });

  it('the squeeze reads as a retail headline at the close of its day, as a jump would', () => {
    const sq = squeezed.events.find((e) => e.type === 'squeeze')!;
    const day = Math.floor((sq.tick - 1) / TPD);
    expect(squeezed.headlines[day]!).toBeGreaterThan(plain.headlines[day]!);
  });

  it('feeds itself: the next day retail buys more of the stock, by the headline it adds', () => {
    const sq = squeezed.events.find((e) => e.type === 'squeeze')!;
    const day = Math.floor((sq.tick - 1) / TPD);
    const next = (s: WorldState) => {
      const row = ecologyLog(s).find((x) => x.day === day + 1)?.assets.find((a) => a.id === STOCK);
      if (!row) throw new Error('no ecology log row for the day after the squeeze');
      return row;
    };
    const withSq = next(squeezed.state).desired.retail;
    const without = next(plain.state).desired.retail;
    expect(withSq).toBeGreaterThan(without);
    // retail reads the headline a day late: the headline adds retailHeadline times the headline gap on the squeeze day.
    // The retail pool's capacity cut (ecology.ts: a pool already loaded on that side trades less) divides that term when
    // retail holds a position of the same sign, so on this path the gap is an upper bound, not exact: the cut only
    // shrinks it. (The noise stream is shared by both runs, so the difference is the headline term less the cut.)
    const gap = squeezed.headlines[day]! - plain.headlines[day]!;
    expect(gap).toBeGreaterThan(0);
    expect(withSq - without).toBeGreaterThan(0);
    expect(withSq - without).toBeLessThanOrEqual(DEFAULT_ECOLOGY.retailHeadline * gap + 1e-9);
  });

  it('names the asset and never an account in the event', () => {
    const sq = squeezed.events.find((e) => e.type === 'squeeze')!;
    const text = JSON.stringify(sq);
    for (const id of TRADERS) expect(text).not.toContain(id);
    expect(text).not.toContain('playerId');
  });

  it('the forced buy-ins reach that day\'s closing auction as own flow', () => {
    const sq = squeezed.events.find((e) => e.type === 'squeeze')!;
    const day = Math.floor((sq.tick - 1) / TPD);
    const row = ecologyLog(squeezed.state).find((x) => x.day === day)?.assets.find((a) => a.id === STOCK);
    expect(row).toBeDefined();
    expect(row!.desired.own).toBeGreaterThan(0);
  });

  it('is off without a squeeze block: the liquidations still happen, with no event and no tally', () => {
    const off = run(true, false);
    expect(off.events.some((e) => e.type === 'liquidation')).toBe(true);
    expect(off.events.some((e) => e.type === 'squeeze')).toBe(false);
    expect(off.state.assets.every((a) => a.coverTally === undefined)).toBe(true);
  });

  it('is deterministic: the same seed and book replay the same events and prices', () => {
    const again = run(true, true);
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(squeezed.events));
    expect(again.closes).toEqual(squeezed.closes);
  });
});
