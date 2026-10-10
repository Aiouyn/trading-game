import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import { grantLockedShares } from './companyAssets';
import { commitPlan, programsDay } from './programs';
import { restrictionsOf, setSellCap, sellCapOf, soldOn } from './restrictions';
import { openAccount, placeOrder } from './trading';
import type { AssetDef, RegimeDef, RegimeId, StepEvent, WorldState } from './types';

/**
 * The founder's daily sell cap (quant-company-building v1.7 §5.1, §6.1): window sells and plan fills share one room per
 * capped account and game day. A plan sells first; a plan day above the room is cut, and its rest is a `cap` skip (never a
 * price hold). Uncapped accounts are not touched.
 */

const TPD = 10;

function calmRegimes(): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, volMult: 1, jumpMult: 1, jumpUpShift: 0, marketLoadMult: 1, idioMult: 1, meanDays: 1e12 };
  }
  return out;
}

function flat(id: string): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 'x', initialPrice: 100, sharesOutstanding: 1e6,
    vol: 1e-7, drift: 0, cycleBeta: 0, wMarket: 0.5, wSector: 0.5, wCrypto: 0,
    halfLifeDays: 1e9, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 1e9, qtyStep: 1,
  });
}

const run = (s: WorldState, n: number): WorldState => stepMany(s, n).state;
const atDay = (s: WorldState, d: number) => run(s, d * TPD - s.tick);
const heldOf = (s: WorldState, pid: string) => s.accounts[pid]?.positions.CO?.qty ?? 0;

/** Two holders of 100 CO each; p1 is capped at `cap` shares a game day. */
function capped(cap: number): WorldState {
  let s = createWorld('sellcap', defaultConfig({ ticksPerDay: TPD, regimes: calmRegimes(), assets: [flat('CO')], indices: [] }));
  s = openAccount(s, 'p1');
  s = openAccount(s, 'p2');
  s = grantLockedShares(s, 'p1', 'CO', 100, 100, 0);
  s = grantLockedShares(s, 'p2', 'CO', 100, 100, 0);
  return { ...s, restrictions: setSellCap(restrictionsOf(s), 'CO', 'p1', cap) };
}

const plan = (qtyPerDay: number, id = 'pl1') => ({
  id, playerId: 'p1', assetId: 'CO', side: 'sell' as const, qtyPerDay, days: [70, 71, 72], minPrice: 50,
});

describe('the founder sell cap (engine)', () => {
  it('a window sell is held to the day cap; the rest waits and sells on the next day', () => {
    let s = atDay(capped(10), 70);
    s = placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 25 }).state;
    s = run(s, TPD); // the whole of day 70
    expect(heldOf(s, 'p1')).toBe(90);
    expect(soldOn(restrictionsOf(s), 'CO', 'p1', 70)).toBe(10);
    s = run(s, TPD); // day 71: the room is new
    expect(heldOf(s, 'p1')).toBe(80);
    expect(soldOn(restrictionsOf(s), 'CO', 'p1', 71)).toBe(10);
    expect(sellCapOf(restrictionsOf(s), 'CO', 'p1')).toBe(10);
  });

  it('a plan sells first: a window sell waits while the open plan takes the room', () => {
    let s = capped(10);
    s = commitPlan(s, plan(10)).state;
    s = atDay(s, 70);
    s = placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 10 }).state;
    s = programsDay(s).state;
    s = run(s, TPD);
    expect(heldOf(s, 'p1')).toBe(90); // the plan's 10, not the window sell
    const manual = s.orders.find((o) => o.playerId === 'p1' && o.program === undefined && o.side === 'sell')!;
    expect(manual.status).toBe('open');
    expect(manual.filledQty).toBe(0);
    expect(soldOn(restrictionsOf(s), 'CO', 'p1', 70)).toBe(10);
  });

  it('a plan day above the cap sells the cap, and the rest is a cap skip, not a price hold', () => {
    let s = commitPlan(capped(6), plan(10)).state;
    s = atDay(s, 70);
    const pd = programsDay(s);
    s = pd.state;
    const events: StepEvent[] = [...pd.events];
    const r = stepMany(s, TPD);
    events.push(...r.events);
    s = r.state;
    expect(heldOf(s, 'p1')).toBe(94);
    expect(events).toContainEqual(expect.objectContaining({ type: 'planSkipped', reason: 'cap', qty: 4 }));
    const p = restrictionsOf(s).programs.pl1!;
    expect(p.priceHold).toBe(0);
    expect(p.escrow).toBe(20); // 30 locked, 6 sold, the 4 of the cap skip released
  });

  it('an uncapped account is not limited by the cap', () => {
    let s = atDay(capped(10), 70);
    s = placeOrder(s, { playerId: 'p2', assetId: 'CO', side: 'sell', type: 'market', qty: 25 }).state;
    s = run(s, 2);
    expect(heldOf(s, 'p2')).toBe(75);
    expect(soldOn(restrictionsOf(s), 'CO', 'p2', 70)).toBe(0);
  });

  it('the day tally and the cap survive a save and reload', () => {
    let s = atDay(capped(10), 70);
    s = placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 4 }).state;
    s = run(s, 2);
    const reloaded = JSON.parse(JSON.stringify(s)) as WorldState;
    expect(soldOn(restrictionsOf(reloaded), 'CO', 'p1', 70)).toBe(4);
    expect(sellCapOf(restrictionsOf(reloaded), 'CO', 'p1')).toBe(10);
    const a = run(s, 3);
    const b = run(reloaded, 3);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
