import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cashOf } from '../core';
import { CROWD, curveAccountId, LP, NPC } from './constants';
import { cashReserveAt, spotAt } from './curve';
import { chatterCents, chatterOn, crowdTick, newsTheme, themeFromTicker, themeOfTagline, THEMES } from './crowd';
import { launchpadView, lpPageOf } from './view';
import { lpTick } from './flow';
import { npcLaunchDraw } from './launch';
import { CREATOR, TRADER, launch, lpWorld, run } from './fixture';
import type { GameState } from '../types';
import type { LpToken } from './types';
import { MICROFLOW } from './microflow';

/**
 * The crowd: holders, scalpers, faders, FOMO and news chasers. A player print is a delayed, capped signal. Copying it loses the fee.
 * A headline moves the theme it names. A crash cuts the story. Personalities are seeded per coin.
 */

function step(g: GameState, n = 1): void {
  for (let k = 0; k < n; k++) {
    g.market = { ...g.market, tick: g.market.tick + 1 };
    lpTick(g, null);
  }
}

/** What chatter adds to npcBuy over the next `n` steps, starting from `tick` (the world has not stepped yet). */
function chatterUsd(tick: number, ticker: string, n: number): number {
  let usd = 0;
  for (let k = 1; k <= n; k++) if (chatterOn(tick + k, ticker)) usd += chatterCents(ticker) / 100;
  return usd;
}

/** Launches a coin and lets the crowd see it once, before the player trades. */
function seen(seed: string, ticker: string, tagline?: string): { g: GameState; t: LpToken } {
  const g = lpWorld(seed);
  const extra = tagline ? { tagline } : {};
  expect(launch(g, CREATOR, ticker, extra).ok).toBe(true);
  step(g, 1);
  return { g, t: g.launchpad!.tokens[ticker]! };
}

describe('launch-coin crowd', () => {
  const npc = NPC as unknown as Record<string, number>;
  let viral = 0;
  // a viral shock is an arrival, not the crowd. These tests pin the crowd, so the shock stays off.
  let micro = true;
  // Isolate the legacy response policy; the funded burst path has its own integration tests.
  beforeEach(() => { viral = npc.VIRAL_PER_DAY!; npc.VIRAL_PER_DAY = 0; micro = MICROFLOW.enabled; MICROFLOW.enabled = false; });
  afterEach(() => { npc.VIRAL_PER_DAY = viral; MICROFLOW.enabled = micro; });

  it('a tagline has a theme, and two coins do not draw the same temperament', () => {
    expect(themeOfTagline('tg1')).toBe('tech');
    expect(themeOfTagline('tg8')).toBe('energy');
    expect(THEMES).toContain(themeFromTicker('ABCD'));
    const g = lpWorld('temper');
    // A ticker is letters only. The cooldown is cleared so three live coins can exist (the live cap is three).
    for (const ticker of ['TEMA', 'TEMB', 'TEMC']) {
      if (g.launchpad) g.launchpad.lastLaunch = {};
      expect(launch(g, CREATOR, ticker).ok, ticker).toBe(true);
    }
    step(g, 1);
    const crowds = ['TEMA', 'TEMB', 'TEMC'].map((id) => g.launchpad!.tokens[id]!.crowd!);
    for (const c of crowds) {
      expect(c.greed).toBeGreaterThanOrEqual(1.8);
      expect(c.greed).toBeLessThanOrEqual(4);
      expect(c.delay).toBeGreaterThanOrEqual(3);
      expect(c.delay).toBeLessThanOrEqual(12);
      expect(c.band).toBeGreaterThanOrEqual(0.03);
      expect(c.band).toBeLessThanOrEqual(0.07);
    }
    expect(new Set(crowds.map((c) => c.greed.toFixed(6))).size).toBeGreaterThan(1);
  });

  it('the same seed replays the same crowd', () => {
    const a = seen('replay', 'RPLY');
    const b = seen('replay', 'RPLY');
    run(a.g, TRADER, { type: 'lp.buy', ticker: 'RPLY', spendCents: 40_000, maxSlip: 0.5 });
    run(b.g, TRADER, { type: 'lp.buy', ticker: 'RPLY', spendCents: 40_000, maxSlip: 0.5 });
    step(a.g, 14);
    step(b.g, 14);
    expect(a.t.npcBal).toBe(b.t.npcBal);
    expect(a.t.crowd!.story).toBe(b.t.crowd!.story);
    expect(a.t.flows.npcBuy).toBe(b.t.flows.npcBuy);
  });

  it('a player buy is not copied in that tick, and the later chase lifts less than the round trip', () => {
    const { g, t } = seen('chase', 'CHSE');
    const bought = t.flows.npcBuy;
    const tick0 = g.market.tick;
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'CHSE', spendCents: 40_000, maxSlip: 0.5 }).ok).toBe(true);
    const afterPlayer = spotAt(t.y);
    step(g, 1);
    // the same tick is not a chase. Chatter may print; it is not the copy.
    expect(t.flows.npcBuy - bought).toBeCloseTo(chatterUsd(tick0, 'CHSE', 1), 5);
    step(g, t.crowd!.delay);
    const chase = t.flows.npcBuy - bought - chatterUsd(tick0, 'CHSE', 1 + t.crowd!.delay);
    expect(chase).toBeGreaterThan(1);
    const lift = spotAt(t.y) / afterPlayer - 1;
    expect(lift).toBeLessThan(LP_ROUND_TRIP);
    // the chase itself is at most the impact cap of the reserve
    expect(chase).toBeLessThanOrEqual(CROWD.IMPACT_CAP * cashReserveAt(t.y) * 1.05 + 1);
  });

  it('a one-dollar buy is not a signal, and clips in one tick are one signal', () => {
    const small = seen('tiny', 'TINY');
    const before = small.t.flows.npcBuy;
    const tick0 = small.g.market.tick;
    expect(run(small.g, TRADER, { type: 'lp.buy', ticker: 'TINY', spendCents: 100, maxSlip: 0.5 }).ok).toBe(true);
    step(small.g, 14);
    // a one-dollar print does not arm a chase. The only NPC buying is the quiet round trip.
    expect(small.t.flows.npcBuy - before).toBeCloseTo(chatterUsd(tick0, 'TINY', 14), 5);

    const clips = seen('clips', 'CLIP');
    const one = seen('clips', 'CLIP');
    for (let k = 0; k < 8; k++) expect(run(clips.g, TRADER, { type: 'lp.buy', ticker: 'CLIP', spendCents: 4_000, maxSlip: 0.5 }).ok).toBe(true);
    expect(run(one.g, TRADER, { type: 'lp.buy', ticker: 'CLIP', spendCents: 32_000, maxSlip: 0.5 }).ok).toBe(true);
    const c0 = clips.t.flows.npcBuy;
    const o0 = one.t.flows.npcBuy;
    step(clips.g, 14);
    step(one.g, 14);
    const cBuy = clips.t.flows.npcBuy - c0;
    const oBuy = one.t.flows.npcBuy - o0;
    expect(cBuy).toBeGreaterThan(1);
    expect(cBuy).toBeLessThan(oBuy * 1.25 + 5);
    expect(cBuy).toBeGreaterThan(oBuy * 0.75 - 5);
  });

  it('a headline in a sector is bought after a lag by that sector only, and a launch wire is not a headline', () => {
    const g = lpWorld('headline');
    expect(launch(g, CREATOR, 'TECH').ok).toBe(true);
    g.launchpad!.lastLaunch = {};
    expect(launch(g, CREATOR, 'NRGY', { tagline: 'tg8' }).ok).toBe(true);
    step(g, 1);
    const tech = g.launchpad!.tokens.TECH!;
    const energy = g.launchpad!.tokens.NRGY!;
    expect(tech.theme).toBe('tech');
    expect(energy.theme).toBe('energy');
    const tech0 = tech.flows.npcBuy;
    const energy0 = energy.flows.npcBuy;
    const tick0 = g.market.tick;
    g.wire.unshift({ id: 'w-earn', tick: g.market.tick, kind: 'earnings', tag: 'Earnings', text: 'HLCN beats', tone: 'gain', assetId: 'HLCN' });
    step(g, 1);
    const at = (ticker: string, n: number) => chatterUsd(tick0, ticker, n);
    expect(tech.flows.npcBuy - tech0).toBeCloseTo(at('TECH', 1), 5);
    expect(energy.flows.npcBuy - energy0).toBeCloseTo(at('NRGY', 1), 5);
    const lag = tech.crowd!.newsLag;
    step(g, lag);
    expect(tech.flows.npcBuy - tech0).toBeGreaterThan(at('TECH', 1 + lag) + 1);
    expect(energy.flows.npcBuy - energy0).toBeCloseTo(at('NRGY', 1 + lag), 5);

    const promo = seen('promo', 'PROM');
    const p0 = promo.t.flows.npcBuy;
    const pTick = promo.g.market.tick;
    const pSteps = promo.t.crowd!.newsLag + 2;
    promo.g.wire.unshift({ id: 'w-lp', tick: promo.g.market.tick, kind: 'launchpad', tag: 'Launchpad', text: 'listed', tone: 'info', assetId: 'HLCN' });
    step(promo.g, pSteps);
    expect(promo.t.flows.npcBuy - p0).toBeCloseTo(chatterUsd(pTick, 'PROM', pSteps), 5);
  });

  it('a crash cuts the story the crowd believes', () => {
    const { g, t } = seen('crash', 'CRSH');
    const floor = spotAt(LP.Y0);
    const before = t.crowd!.story - floor;
    g.wire.unshift({
      id: 'w-crash', tick: g.market.tick, kind: 'world', tag: 'World', text: 'A crash', tone: 'loss',
      ev: { type: 'world', id: 'e1', phase: 'start', kind: 'crash' },
    });
    step(g, 1);
    // The scare cuts the premium over the curve floor, not the price. A story near the floor barely moves in price.
    const after = t.crowd!.story - floor;
    expect(before).toBeGreaterThan(0);
    expect(after / before).toBeCloseTo(CROWD.SCARE_DROP, 2);
  });

  it('a world launch during a headline takes that headline\'s sector', () => {
    const g = lpWorld('born');
    g.wire.unshift({ id: 'w-move', tick: g.market.tick, kind: 'move', tag: 'Move', text: 'HLCN jumps', tone: 'gain', assetId: 'HLCN' });
    expect(newsTheme(g)).toBe('tech');
    expect(npcLaunchDraw(g, null)).toBe(true);
    const ticker = g.launchpad!.order[g.launchpad!.order.length - 1]!;
    expect(g.launchpad!.tokens[ticker]!.theme).toBe('tech');
  });

  it('buying a coin and selling it into the chase loses money', () => {
    const seeds = ['farm-a', 'farm-b', 'farm-c', 'farm-d', 'farm-e', 'farm-f'];
    const pnls: number[] = [];
    for (const seed of seeds) {
      const { g, t } = seen(seed, 'FARM');
      const cash0 = cashOf(g, TRADER);
      expect(run(g, TRADER, { type: 'lp.buy', ticker: 'FARM', spendCents: 30_000, maxSlip: 0.5 }).ok).toBe(true);
      step(g, t.crowd!.delay + 2);
      const have = Math.floor(t.bal[TRADER] ?? 0);
      expect(have).toBeGreaterThan(0);
      expect(run(g, TRADER, { type: 'lp.sell', ticker: 'FARM', tokens: have, maxSlip: 0.5 }).ok).toBe(true);
      pnls.push(cashOf(g, TRADER) - cash0);
    }
    for (const pnl of pnls) expect(pnl).toBeLessThan(1);
    const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    expect(mean).toBeLessThan(0);
  });

  it('quiet chatter prints many wallets and leaves the bag and the curve where they were', () => {
    const saved = CROWD.SCALP_TICK;
    CROWD.SCALP_TICK = 0;
    try {
      const g = lpWorld('chatter');
      expect(launch(g, CREATOR, 'CHAT').ok).toBe(true);
      step(g, 1);
      const t = g.launchpad!.tokens.CHAT!;
      const bal = t.npcBal;
      const y = t.y;
      const cash0 = g.market.accounts[curveAccountId('CHAT')]!.cash;
      step(g, 12);
      expect(t.npcBal).toBe(bal);
      expect(t.y).toBe(y);
      expect(Math.abs(g.market.accounts[curveAccountId('CHAT')]!.cash - cash0)).toBeLessThan(5);
      const anons = new Set(t.tape.filter((tr) => tr.npc && tr.anon).map((tr) => tr.anon));
      expect(anons.size).toBeGreaterThanOrEqual(6);
      // The page shows only settlement, including legacy chatter when that test mode is selected.
      expect(t.wall).toBeUndefined();
      const page = lpPageOf(g, CREATOR, 'CHAT')!;
      for (const row of page.tape) expect(t.tape.some(tr => tr.tick === row.tick && tr.anon === row.anon && tr.qty === row.qty)).toBe(true);
    } finally {
      CROWD.SCALP_TICK = saved;
    }
  });

  it('chatter does not reshuffle the newest feed', () => {
    const saved = CROWD.SCALP_TICK;
    CROWD.SCALP_TICK = 0;
    try {
      const g = lpWorld('feed-order');
      expect(launch(g, CREATOR, 'OLDR').ok).toBe(true);
      g.launchpad!.lastLaunch = {};
      expect(launch(g, CREATOR, 'NEWR').ok).toBe(true);
      step(g, 9);
      const v = launchpadView(g, TRADER);
      // The coin that chattered last would lead a sort on the raw tape. The feed follows the last real fill instead.
      const tailOf = (id: string) => g.launchpad!.tokens[id]!.tape[g.launchpad!.tokens[id]!.tape.length - 1]!;
      expect(tailOf('NEWR').chatter).toBe(true);
      expect(tailOf('OLDR').chatter).toBe(true);
      expect(tailOf('NEWR').tick).toBeGreaterThan(tailOf('OLDR').tick);
      expect(v.feeds.newest.map((c) => c.ticker)).toEqual(['OLDR', 'NEWR']);
      for (const id of ['OLDR', 'NEWR']) {
        const t = g.launchpad!.tokens[id]!;
        const card = v.feeds.newest.find((c) => c.ticker === id)!;
        const real = [...t.tape].reverse().find((tr) => !tr.chatter);
        expect(card.lastTrade).toBe(real ? real.tick : t.createdTick);
        expect(card.lastTrade).toBeLessThan(tailOf(id).tick);
      }
    } finally {
      CROWD.SCALP_TICK = saved;
    }
  });

  it('an old token with no crowd field takes a tick without throwing', () => {
    const { g, t } = seen('oldc', 'OLDC');
    delete t.crowd;
    expect(() => crowdTick(g, t, null)).not.toThrow();
    expect(t.crowd).toBeDefined();
  });
});

/** Round trip on the curve is 1% each way. The chase has to come in under this or a copier gets paid. */
const LP_ROUND_TRIP = 0.02;
