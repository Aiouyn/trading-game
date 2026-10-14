import { describe, expect, it } from 'vitest';
import { TPD } from '../core';
import { CROWD, LP, NPC } from './constants';
import { abandonShare } from './crowd';
import { spotAt } from './curve';
import { lpTick } from './flow';
import { absorbPending } from './absorb';
import { arrive, bleedPerTick, viralPerTick } from './demand';
import { buyCurve, liquidateCohort } from './trade';
import { cohortsOf } from './cohorts';
import { CREATOR, TRADER, launch, lpWorld, run } from './fixture';

/**
 * The v1.3 amendments of lead-launchpad.md: L6.7 (the viral hazard falls with age), L6.8 (each NPC cohort bleeds on a half-life tied to
 * tau; the instant exit is withdrawn; the capitulation stays), and L3.1 (the cash clock counts game-day closes). The L8.3 gate statistic
 * is tested in scripts/balance/launchpad-stat.test.ts.
 */

type Mutable = Record<string, number>;

/** runs `fn` with some NPC constants overridden, and restores them after (the constants are the tuning knobs) */
function withNpc<T>(over: Record<string, number>, fn: () => T): T {
  const cur = NPC as unknown as Mutable;
  const saved: Mutable = {};
  for (const k of Object.keys(over)) {
    saved[k] = cur[k]!;
    cur[k] = over[k]!;
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) cur[k] = saved[k]!;
  }
}

/**
 * The token with no sniper, no buzz, no pending demand and no NPC holding: the launch's own cohorts are cleared, so the test drives one
 * cohort at a time (the curve keeps its real cash, so its sales are payable).
 */
function quiet(g: ReturnType<typeof lpWorld>, ticker: string) {
  const t = g.launchpad!.tokens[ticker]!;
  t.sniperDone = true;
  t.sniper = undefined;
  t.buzz = { base: 0, board: 0, wire: 0 };
  t.npcPending = 0;
  t.npcPeak = 0;
  t.npcCohorts = [];
  t.npcBal = 0;
  t.npcCost = 0;
  return t;
}

/** moves the clock to a tick (forward only) and runs the Launchpad tick there */
function at(g: ReturnType<typeof lpWorld>, tick: number): void {
  g.market = { ...g.market, tick };
  lpTick(g, null);
}

/** scales the cost basis of every cohort (and the token total with it): a cohort far above or below its price */
function scaleCost(t: ReturnType<typeof quiet>, mult: number): void {
  const cs = cohortsOf(t);
  for (const c of cs) c.cost *= mult;
  t.npcCost = cs.reduce((a, c) => a + c.cost, 0);
}

describe('L6.7 the viral hazard falls with the token\'s age (v1.3)', () => {
  it('at launch the hazard is VIRAL_PER_DAY shocks per game day, spread over the ticks', () => {
    expect(viralPerTick(0)).toBeCloseTo(NPC.VIRAL_PER_DAY / TPD, 12);
  });

  it('the hazard is exp(-age / tau) times the launch hazard, with age in game days', () => {
    const base = viralPerTick(0);
    expect(viralPerTick(2 * TPD)).toBeCloseTo(base * Math.exp(-2 / NPC.VIRAL_TAU_DAYS), 12);
    expect(viralPerTick(NPC.VIRAL_TAU_DAYS * TPD) / base).toBeCloseTo(Math.exp(-1), 9);
  });

  it('after ten time constants the hazard is negligible (less than 1e-4 of the launch hazard)', () => {
    expect(viralPerTick(10 * NPC.VIRAL_TAU_DAYS * TPD) / viralPerTick(0)).toBeLessThan(1e-4);
  });

  it('the hazard is non-increasing in age and never negative', () => {
    let prev = Infinity;
    for (let age = 0; age <= 5 * TPD; age += TPD / 4) {
      const h = viralPerTick(age);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(prev);
      prev = h;
    }
  });

  it('a dead token takes no viral shock; a live token of the same age does', () => {
    withNpc({ VIRAL_PER_DAY: 1e9 }, () => {
      const g = lpWorld('l67-dead');
      launch(g, CREATOR, 'DEAD');
      const t = quiet(g, 'DEAD');
      t.status = 'dead';
      t.deadTick = g.market.tick;
      const buzz0 = t.buzz.base;
      const bal0 = t.npcBal;
      at(g, g.market.tick + 1);
      expect(t.buzz.base).toBe(buzz0);
      expect(t.npcBal).toBe(bal0);
      expect(t.npcPending ?? 0).toBe(0);
      // the same token alive takes its shock at once (the rate is over one for a tick here)
      const h = lpWorld('l67-live');
      launch(h, CREATOR, 'LIVE');
      const u = quiet(h, 'LIVE');
      at(h, h.market.tick + 1);
      expect(u.buzz.base).toBeGreaterThan(0);
    });
  });
});

describe('L6.8 each NPC cohort bleeds on a half-life tied to tau (v1.3)', () => {
  it('the bleed share per tick compounds to one half for each half-life (BLEED_HALF_TAU x tau)', () => {
    const halfTicks = NPC.BLEED_HALF_TAU * NPC.VIRAL_TAU_DAYS * TPD;
    expect(Math.pow(1 - bleedPerTick(), halfTicks)).toBeCloseTo(0.5, 9);
  });

  it('the instant exit is withdrawn: a living story does not sell the bag on the clock', () => {
    expect('TIME_SELL_PER_TICK' in NPC).toBe(false);
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l68-exit');
      launch(g, CREATOR, 'EXIT');
      const t = quiet(g, 'EXIT');
      buyCurve(g, null, 'EXIT', 100_000, 1, null, true);
      const before = t.npcBal;
      scaleCost(t, 3);
      at(g, g.market.tick + 1);
      expect(t.npcBal).toBe(before);
    });
  });

  it('a dead story abandons the bag on its own half-life, and a living story keeps it', () => {
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l68-half');
      launch(g, CREATOR, 'HALF');
      const t = quiet(g, 'HALF');
      buyCurve(g, null, 'HALF', 100_000, 1, null, true);
      at(g, g.market.tick + 1);
      const held = t.npcBal;
      for (let k = 0; k < 12; k++) at(g, g.market.tick + 1);
      expect(t.npcBal).toBe(held);
      t.crowd!.story = spotAt(LP.Y0);
      t.crowd!.fadeStory = t.crowd!.story;
      const start = t.npcBal;
      const n = 40;
      const saved = CROWD.ABANDON_HALF_DAYS;
      const savedTick = CROWD.SCALP_TICK;
      const savedRefill = CROWD.REFILL;
      CROWD.ABANDON_HALF_DAYS = n / TPD;
      CROWD.SCALP_TICK = 0;
      CROWD.REFILL = 0;
      try {
        for (let k = 0; k < n; k++) at(g, g.market.tick + 1);
        expect(t.status).toBe('live');
        expect(t.npcBal / start).toBeCloseTo(0.5, 1);
      } finally {
        CROWD.ABANDON_HALF_DAYS = saved;
        CROWD.SCALP_TICK = savedTick;
        CROWD.REFILL = savedRefill;
      }
    });
  });

  it('a small cohort keeps the fraction of a sale that does not make a whole token', () => {
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l68-small');
      launch(g, CREATOR, 'SMAL');
      const t = quiet(g, 'SMAL');
      buyCurve(g, null, 'SMAL', 100, 1, null, true);
      at(g, g.market.tick + 1);
      t.crowd!.story = spotAt(LP.Y0);
      t.crowd!.fadeStory = t.crowd!.story;
      const start = t.npcBal;
      expect(start).toBeGreaterThan(100);
      const saved = CROWD.ABANDON_HALF_DAYS;
      const savedTick = CROWD.SCALP_TICK;
      // the coin's price is a fraction of a cent, so a one-dollar bag is tens of thousands of tokens. The half-life has to be
      // long before a single tick sells less than one token; the carry then sells that token once it adds up.
      CROWD.ABANDON_HALF_DAYS = 400;
      CROWD.SCALP_TICK = 0;
      try {
        expect(start * abandonShare()).toBeLessThan(1);
        at(g, g.market.tick + 1);
        expect(t.npcBal).toBe(start);
        t.crowd!.holdCarry = 0.9;
        at(g, g.market.tick + 1);
        expect(t.npcBal).toBe(start - 1);
      } finally {
        CROWD.ABANDON_HALF_DAYS = saved;
        CROWD.SCALP_TICK = savedTick;
      }
    });
  });

  it('a cohort far above its cost takes profit; one below its cost does not', () => {
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l68-profit');
      launch(g, CREATOR, 'PROF');
      const t = quiet(g, 'PROF');
      buyCurve(g, null, 'PROF', 100_000, 1, null, true);
      at(g, g.market.tick + 1);
      buyCurve(g, null, 'PROF', 100_000, 1, null, true);
      const cs = cohortsOf(t);
      expect(cs.length).toBe(2);
      cs[0]!.cost *= 0.1;
      cs[1]!.cost *= 3;
      t.npcCost = cs[0]!.cost + cs[1]!.cost;
      t.crowd!.greed = 1.5;
      const savedTick = CROWD.SCALP_TICK;
      CROWD.SCALP_TICK = 0;
      const t0 = cs[0]!.tokens;
      const t1 = cs[1]!.tokens;
      try {
        at(g, g.market.tick + 1);
        const after = cohortsOf(t);
        expect(after[1]!.tokens).toBe(t1);
        expect(after[0]!.tokens).toBeLessThan(t0);
        expect(after[0]!.tokens).toBeGreaterThan(t0 * 0.5);
        expect(after.reduce((a, c) => a + c.tokens, 0)).toBe(t.npcBal);
      } finally {
        CROWD.SCALP_TICK = savedTick;
      }
    });
  });

  it('a fall of the buzz below its peak does not sell; a story that has died does', () => {
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l68-capit');
      launch(g, CREATOR, 'CAPI');
      const t = quiet(g, 'CAPI');
      buyCurve(g, null, 'CAPI', 100_000, 1, null, true);
      scaleCost(t, 3);
      t.npcPeak = 1;
      at(g, g.market.tick + 1);
      const before = t.npcBal;
      at(g, g.market.tick + 1);
      expect(t.npcBal).toBe(before);
      t.crowd!.story = spotAt(LP.Y0);
      t.crowd!.fadeStory = t.crowd!.story;
      at(g, g.market.tick + 1);
      expect(t.npcBal).toBeLessThan(before);
    });
  });

  it('the cohorts sum to the token totals after sells, and a snapshot without cohorts reads as one cohort', () => {
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l68-sum');
      launch(g, CREATOR, 'SUMC');
      const t = quiet(g, 'SUMC');
      buyCurve(g, null, 'SUMC', 60_000, 1, null, true);
      at(g, g.market.tick + 1);
      buyCurve(g, null, 'SUMC', 40_000, 1, null, true);
      for (let k = 0; k < 30; k++) at(g, g.market.tick + 1);
      const cs = cohortsOf(t);
      expect(cs.reduce((a, c) => a + c.tokens, 0)).toBe(t.npcBal);
      expect(cs.reduce((a, c) => a + c.cost, 0)).toBeCloseTo(t.npcCost, 6);
      // an old snapshot: no cohorts field, the holding is one cohort, and a living story does not dump it
      delete t.npcCohorts;
      const before = t.npcBal;
      at(g, g.market.tick + 1);
      expect(t.npcBal).toBe(before);
      expect(cohortsOf(t).length).toBe(1);
      expect(cohortsOf(t)[0]!.tokens).toBe(t.npcBal);
    });
  });

  it('each arrival is its own cohort: a viral shock after the launch adds a cohort with its own tick', () => {
    const g = lpWorld('l68-arrivals');
    launch(g, CREATOR, 'ARRC');
    const t = quiet(g, 'ARRC');
    const n0 = cohortsOf(t).length;
    g.market = { ...g.market, tick: g.market.tick + 100 };
    arrive(t, 2);
    absorbPending(g, t, null);
    const cs = cohortsOf(t);
    expect(cs.length).toBe(n0 + 1);
    expect(cs[cs.length - 1]!.tick).toBe(g.market.tick);
    expect(cs.reduce((a, c) => a + c.tokens, 0)).toBe(t.npcBal);
  });

  it('the no-trade clock counts player fills only: a cohort buy does not refresh it, a player trade does', () => {
    const g = lpWorld('l68-clock');
    launch(g, CREATOR, 'CLKT');
    const t = quiet(g, 'CLKT');
    const last0 = t.lastTradeTick;
    g.market = { ...g.market, tick: g.market.tick + 100 };
    arrive(t, 2);
    absorbPending(g, t, null);
    expect(t.lastTradeTick).toBe(last0);
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'CLKT', spendCents: 1_000, maxSlip: 0.5 }).ok).toBe(true);
    expect(t.lastTradeTick).toBe(g.market.tick);
  });
});

describe('L3.1 the cash clock counts game-day closes (v1.3)', () => {
  it('a close before day 3 does not count; the close of day 3 is the first', () => {
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l31-early');
      launch(g, CREATOR, 'EARL');
      liquidateCohort(g, g.launchpad!.tokens.EARL!, null); // the launch cohort sells back: the curve's cash is under the line (v1.4)
      const t = quiet(g, 'EARL');
      // the world starts on day 2: its close (tick 3 TPD) does not count; the close of day 3 (tick 4 TPD) is the first
      at(g, 3 * TPD);
      expect(t.lowCloses ?? 0).toBe(0);
      at(g, 4 * TPD);
      expect(t.lowCloses).toBe(1);
    });
  });

  it('a close above the line resets the count, and the clock restarts from zero', () => {
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l31-reset');
      launch(g, CREATOR, 'RESE');
      const t = quiet(g, 'RESE');
      for (let d = 3; d <= 6; d++) at(g, (d + 1) * TPD);
      expect(t.lowCloses).toBe(4);
      // day 7: a holder buys $5,000 (the curve is funded above the line at the close), then sells it all back before the next day
      expect(run(g, TRADER, { type: 'lp.buy', ticker: 'RESE', spendCents: 500_000, maxSlip: 0.5 }).ok).toBe(true);
      at(g, 8 * TPD);
      expect(t.lowCloses).toBe(0);
      expect(t.status).toBe('live');
      const have = t.bal[TRADER] ?? 0;
      expect(run(g, TRADER, { type: 'lp.sell', ticker: 'RESE', tokens: have, maxSlip: 0.5 }).ok).toBe(true);
      // six low closes after the reset (days 8 to 13) leave it alive; the seventh (the close of day 14) kills it
      for (let d = 8; d <= 13; d++) at(g, (d + 1) * TPD);
      expect(t.status).toBe('live');
      expect(t.lowCloses).toBe(6);
      at(g, 15 * TPD);
      expect(t.status).toBe('dead');
      expect(t.deadReason).toBe('cash');
      expect(t.deadTick).toBe(15 * TPD);
    });
  });

  it('an intraday round trip does not reset the clock: only the curve cash at each close counts', () => {
    withNpc({ VIRAL_PER_DAY: 0 }, () => {
      const g = lpWorld('l31-intraday');
      launch(g, CREATOR, 'INTR');
      liquidateCohort(g, g.launchpad!.tokens.INTR!, null); // the launch cohort sells back: the curve's cash is under the line (v1.4)
      const t = quiet(g, 'INTR');
      for (let d = 3; d <= 9; d++) {
        // mid-day the curve is funded (a buy inside the day), then the holder sells it all before the close
        g.market = { ...g.market, tick: d * TPD + 360 };
        expect(run(g, TRADER, { type: 'lp.buy', ticker: 'INTR', spendCents: 500_000, maxSlip: 0.5 }).ok).toBe(true);
        lpTick(g, null);
        const have = t.bal[TRADER] ?? 0;
        expect(run(g, TRADER, { type: 'lp.sell', ticker: 'INTR', tokens: have, maxSlip: 0.5 }).ok).toBe(true);
        at(g, (d + 1) * TPD);
        if (d < 9) expect(t.status).toBe('live');
      }
      expect(t.status).toBe('dead');
      expect(t.deadTick).toBe(10 * TPD);
    });
  });

  it('the death line is the same two per cent of the raise (the constant is unchanged by v1.3)', () => {
    expect(LP.DEAD_CASH_DAYS).toBe(7);
    expect(LP.DEAD_CASH_FROM_DAY).toBe(3);
    expect(LP.DEAD_CASH_FRAC).toBe(0.02);
    expect(spotAt(LP.Y0)).toBeGreaterThan(0);
  });
});

describe('the NPC sniper exit sells from the sniper cohort (v1.2 review item 5)', () => {
  it('the exit takes the sniper tokens from the sniper cohort; an older cohort keeps its tokens and cost basis', () => {
    withNpc({ VIRAL_PER_DAY: 0, CAPIT_PER_TICK: 0, PROFIT_PER_TICK: 0 }, () => {
      const g = lpWorld('l68-sniper-cohort');
      launch(g, CREATOR, 'SNPX');
      const t = quiet(g, 'SNPX');
      // an older cohort, then the sniper's own cohort (flagged, as sniperEnter flags it)
      buyCurve(g, null, 'SNPX', 100_000, 1, null, true);
      const older = { ...cohortsOf(t)[0]! };
      buyCurve(g, null, 'SNPX', 20_000, 1, null, true);
      const cs = cohortsOf(t);
      expect(cs.length).toBe(2);
      const sc = cs[1]!;
      sc.sniper = true;
      t.sniper = { tick: g.market.tick, tokens: sc.tokens, entry: spotAt(t.y) };
      const sniperTokens = sc.tokens;
      // the time exit (the sniper has been in for NPC.SNIPER_EXIT_TICKS)
      at(g, g.market.tick + NPC.SNIPER_EXIT_TICKS);
      expect(t.sniper).toBeUndefined();
      const after = cohortsOf(t);
      expect(after.length).toBe(1);
      expect(after[0]!.tick).toBe(older.tick);
      expect(after[0]!.tokens).toBe(older.tokens);
      expect(after[0]!.cost).toBeCloseTo(older.cost, 6);
      expect(after[0]!.sniper).toBeUndefined();
      expect(t.npcBal).toBe(older.tokens);
      expect(sniperTokens).toBeGreaterThan(0);
    });
  });

  it('after the sniper cohort is gone (the bleed took it), the exit sells nothing from the other cohorts', () => {
    withNpc({ VIRAL_PER_DAY: 0, CAPIT_PER_TICK: 0, PROFIT_PER_TICK: 0 }, () => {
      const g = lpWorld('l68-sniper-gone');
      launch(g, CREATOR, 'SNPG');
      const t = quiet(g, 'SNPG');
      buyCurve(g, null, 'SNPG', 100_000, 1, null, true);
      const before = cohortsOf(t)[0]!.tokens;
      t.sniper = { tick: g.market.tick, tokens: 500, entry: spotAt(t.y) };
      at(g, g.market.tick + NPC.SNIPER_EXIT_TICKS);
      expect(t.sniper).toBeUndefined();
      expect(t.npcBal).toBe(before);
    });
  });
});
