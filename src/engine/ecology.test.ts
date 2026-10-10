import { describe, expect, it } from 'vitest';
import { createWorld, step, stepMany } from './sim';
import { defaultConfig } from './config';
import { universeConfig } from './universe';
import { openAccount, placeOrder } from './trading';
import { DEFAULT_ECOLOGY, ecoDayInput, ecologyDay, ecologyLog, ecologyWeight, initEcology } from './ecology';
import type { StepEvent, WorldConfig, WorldState } from './types';

/**
 * Market ecology, ported from engine-staging (specs/quant-market-ecology.md). The staging fingerprint fixture pins
 * staging's own legacy engine, so on this engine the same guarantees are checked against a live run instead.
 */
const TPD = 24;
const base = defaultConfig({ ticksPerDay: TPD });
const withEco = (ecology: WorldConfig['ecology']): WorldConfig => ({ ...base, ecology });
const FULL = withEco({ mode: 'full', weight: 1 });
const SHADOW = withEco({ mode: 'shadow' });

function run(cfg: WorldConfig, seed: string, days: number, trade?: (s: WorldState, t: number) => WorldState) {
  let s = createWorld(seed, cfg);
  const events: StepEvent[] = [];
  for (let t = 1; t <= days * TPD; t++) {
    if (trade) s = trade(s, t);
    const r = step(s);
    s = r.state;
    for (const e of r.events) events.push(e);
  }
  return { s, events };
}

// the ecology's own per-day bookkeeping on each asset (dayLnV, dayEvent) is not a live value: strip it with the ecology
const strip = (s: WorldState) => ({
  ...s, ecology: undefined, config: undefined,
  assets: s.assets.map((a) => { const b = { ...a }; delete b.dayLnV; delete b.dayEvent; return b; }),
});

describe('ecology modes', () => {
  it('weight: full = 1, hybrid 0.25 or 1, anything else (made-up weights, unknown modes) = 0', () => {
    expect(ecologyWeight(FULL)).toBe(1);
    expect(ecologyWeight(withEco({ mode: 'full' }))).toBe(1);
    expect(ecologyWeight(withEco({ mode: 'full', weight: 0.25 }))).toBe(0);
    expect(ecologyWeight(withEco({ mode: 'hybrid', weight: 0.25 }))).toBe(0.25);
    expect(ecologyWeight(withEco({ mode: 'hybrid', weight: 0.3 }))).toBe(0);
    expect(ecologyWeight(SHADOW)).toBe(0);
    expect(ecologyWeight(base)).toBe(0);
  });

  it('the game universe runs full ecology', () => {
    expect(ecologyWeight(universeConfig())).toBe(1);
  });

  it("absent or 'off': no ecology state, and the market is the live engine's, byte for byte", () => {
    const a = run(base, 'off', 10).s;
    const b = run(withEco({ mode: 'off' }), 'off', 10).s;
    expect(a.ecology).toBeUndefined();
    expect(b.ecology).toBeUndefined();
    expect(JSON.stringify(strip(a))).toBe(JSON.stringify(strip(b)));
  });

  it('shadow computes the pools but never moves a live price, value, volume or stream', () => {
    const off = run(base, 'shadow', 12).s;
    const sh = run(SHADOW, 'shadow', 12).s;
    expect(sh.ecology).toBeDefined();
    expect(JSON.stringify(strip(sh))).toBe(JSON.stringify(strip(off)));
  });
});

describe('full ecology: the pools set the close (closing auction)', () => {
  const { s, events } = run(FULL, 'full', 30);

  it('the printed close is the ecology close every day, with an auction event', () => {
    s.assets.forEach((a, i) => expect(a.lnP).toBe(s.ecology!.assets[i]!.lnS));
    const auctions = events.filter((e) => e.type === 'auction');
    expect(auctions.length).toBe(30);
    expect(auctions.every((e) => e.tick % TPD === 0)).toBe(true);
  });

  it('logs a cause vector that sums to each printed close-to-close move', () => {
    const log = ecologyLog(s);
    expect(log.length).toBe(DEFAULT_ECOLOGY.logDays);
    for (let k = 1; k < log.length; k++) {
      log[k]!.assets.forEach((a, i) => {
        expect(Object.keys(a.cause).sort()).toEqual(['event', 'maker', 'news', 'own', 'pension', 'retail', 'trend', 'value']);
        const sum = Object.values(a.cause).reduce((x, y) => x + y, 0);
        expect(sum).toBeCloseTo(a.lnS - log[k - 1]!.assets[i]!.lnS, 12);
        expect(a.depth).toBeGreaterThanOrEqual(DEFAULT_ECOLOGY.depthMin);
        expect(a.depth).toBeLessThanOrEqual(1);
      });
    }
  });

  it('moves prices vs the live engine, but stays near it (the pools track the same value)', () => {
    const off = run(base, 'full', 30).s;
    let diff = 0;
    s.assets.forEach((a, i) => { diff += Math.abs(a.lnP - off.assets[i]!.lnP); });
    expect(diff).toBeGreaterThan(0);
    s.assets.forEach((a, i) => expect(Math.abs(a.lnP - a.lnV)).toBeLessThan(Math.abs(off.assets[i]!.lnP - off.assets[i]!.lnV) + 0.5));
  });

  it('is deterministic and resumes from a JSON save mid-day', () => {
    const again = run(FULL, 'full', 30).s;
    expect(JSON.stringify(again)).toBe(JSON.stringify(s));
    let a = createWorld('resume', FULL);
    a = stepMany(a, 5 * TPD + 7).state;
    const saved = JSON.parse(JSON.stringify(a)) as WorldState;
    const x = stepMany(a, 3 * TPD).state;
    const y = stepMany(saved, 3 * TPD).state;
    expect(JSON.stringify(y)).toBe(JSON.stringify(x));
  });

  it("the accounts' buying is the own-flow term and lifts the close", () => {
    const id = 'OSTV';
    const buy = (st: WorldState, t: number) => {
      if (t === 1) st = openAccount(st, 'p', 1e9);
      return t === 3 ? placeOrder(st, { playerId: 'p', assetId: id, side: 'buy', type: 'market', qty: 2e6 }).state : st;
    };
    const traded = run(FULL, 'own', 1, buy).s;
    const quiet = run(FULL, 'own', 1).s;
    const i = traded.config.assets.findIndex((a) => a.id === id);
    const day0 = ecologyLog(traded)[0]!.assets[i]!;
    expect(day0.desired.own).toBeGreaterThan(0);
    expect(day0.cause.own).toBeGreaterThan(0);
    expect(traded.assets[i]!.lnP).toBeGreaterThan(quiet.assets[i]!.lnP);
    // the pools' orders join the shared day tally
    expect(traded.assets[i]!.dayTraded!.buy).toBeGreaterThan(2e6 * 30);
  });

  it('10 accounts close where one account of the same total does', () => {
    const id = 'SYN';
    const total = 3e6;
    const close = (n: number) => {
      const r = run(FULL, 'split', 1, (st, t) => {
        if (t === 1) for (let k = 0; k < n; k++) st = openAccount(st, `a${k}`, 1e8);
        if (t === 2) for (let k = 0; k < n; k++) st = placeOrder(st, { playerId: `a${k}`, assetId: id, side: 'buy', type: 'market', qty: total / n }).state;
        return st;
      }).s;
      return r.assets[r.config.assets.findIndex((a) => a.id === id)]!.lnP;
    };
    const quiet = run(FULL, 'split', 1).s;
    const q = quiet.assets[quiet.config.assets.findIndex((a) => a.id === id)]!.lnP;
    const one = close(1) - q, ten = close(10) - q;
    expect(one).toBeGreaterThan(0);
    expect(Math.abs(ten / one - 1)).toBeLessThanOrEqual(0.01);
  });
});

/**
 * F8 (Phase 1 huge money): the player's own flow enters the close capped at maxAdvPerTick (3 x ADV), in either direction
 * (ecology.ts ecologyDay). Uncapped, own flow of 50 ADV moved FROG's close like a 50 ADV pool (+5.88 log in one day). Capped,
 * anything above 3 ADV moves the close, the book and the inventory exactly as 3 ADV does. Below the cap own flow enters in full.
 */
describe('F8 own-flow cap at the close', () => {
  const c = universeConfig({ ticksPerDay: 24 });
  const w = createWorld('f8-cap', c);
  const i = c.assets.findIndex((a) => a.id === 'FROG');
  const eco0 = initEcology(w);
  const input = ecoDayInput(w, 0);
  const closeWith = (own: number) => {
    const eco = { ...eco0, assets: eco0.assets.map((a, k) => (k === i ? { ...a, own } : a)) };
    return ecologyDay(c, eco, input, { setsClose: true, full: true }).assets[i]!;
  };

  it('own buying above the cap closes, books and inventories exactly as the cap does', () => {
    const cap = closeWith(3);
    const big = closeWith(50);
    expect(big.lnS).toBe(cap.lnS);
    expect(big.core).toBe(cap.core);
    expect(big.skew).toBe(cap.skew);
    expect(big.inv).toBe(cap.inv);
  });

  it('own selling above the cap is capped the same way, in the other direction', () => {
    const cap = closeWith(-3);
    const big = closeWith(-50);
    expect(big.lnS).toBe(cap.lnS);
    expect(big.inv).toBe(cap.inv);
  });

  it('below the cap own flow is not clipped, and the cap is not a no-op (3 ADV moves the close)', () => {
    expect(closeWith(2).lnS).not.toBe(closeWith(3).lnS);
    expect(closeWith(3).lnS).not.toBe(closeWith(0).lnS);
    expect(closeWith(-2).lnS).not.toBe(closeWith(-3).lnS);
  });
});
