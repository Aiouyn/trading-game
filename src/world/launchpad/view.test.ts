import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from '../game';
import { playerView } from '../view';
import { CREATOR, HOLDER, TRADER, launch, lpWorld, run } from './fixture';
import { LP, LP_K, NPC, bookAccountId } from './constants';
import { launchpadView, lpPageOf } from './view';
import { tokenOf } from './state';

/**
 * The share of the curve a launch buys at once: the launch cohort's demand (constant product, the fee left out, so an upper bound)
 * plus the largest sniper buy. The launch buzz is BASE0 * (u^(-1/alpha) - 1) (launch.ts launchBuzz), so its 99th percentile is
 * BASE0 * (0.01^(-1/alpha) - 1) buzz. The mean cohort is $3,000 (24.8% of the curve with the sniper); the measured runs are in
 * docs/V1-PHASE5.md section 8.5.
 */
const curveShareFor = (demand: number) => (LP.Y0 - LP_K / (LP.X0 + demand)) / LP.CURVE_SUPPLY;
const cohortShareBound = curveShareFor(NPC.BASE0 * (Math.pow(0.01, -1 / NPC.BASE0_ALPHA) - 1) * NPC.DEMAND_PER_BUZZ + 400);

describe('the Launchpad view (L1, L7)', () => {
  it('no-reveal: the view carries holder buckets and the tape, never a holder’s handle; the tape flags only the creator’s own trades', () => {
    const g = lpWorld('view-reveal');
    launch(g, CREATOR, 'REVL', { allocation: 2_000_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'REVL', spendCents: 5_000 });
    run(g, HOLDER, { type: 'lp.buy', ticker: 'REVL', spendCents: 2_000 });
    run(g, CREATOR, { type: 'lp.buy', ticker: 'REVL', spendCents: 1_000, maxSlip: 0.5 });
    const v = JSON.stringify(launchpadView(g, CREATOR));
    expect(v).not.toContain('trader_two');
    expect(v).not.toContain('zed_holder_x');
    const page = lpPageOf(g, CREATOR, 'REVL')!;
    expect(Object.keys(page.buckets).sort()).toEqual(['holders', 'top10Share']);
    // R-10-6: the NPC sniper's cohort is an anonymous holder too, so the three players and the cohort are four holders
    expect(page.buckets.holders).toBe(4);
    for (const tr of page.tape) {
      const keys = Object.keys(tr).sort();
      expect(keys.filter((k) => k !== 'anon')).toEqual(['creator', 'npc', 'price', 'qty', 'side', 'tick', 'usd']);
      // a player's line carries an anonymous id, never a handle
      if (tr.anon !== undefined) expect(tr.anon).toMatch(/^[0-9a-f]{6}$/);
    }
    expect(JSON.stringify(page)).not.toContain('trader_two');
    expect(page.holders.some((h) => h.role === 'npc')).toBe(true);
    expect(page.holders.some((h) => h.role === 'curve')).toBe(true);
    expect(page.tape.some((tr) => tr.creator)).toBe(true);
    expect(page.tape.filter((tr) => tr.creator).length).toBe(1);
    // the other player's view of the same token: the same no-reveal
    const other = JSON.stringify(playerView(g, TRADER)!.launchpad);
    expect(other).not.toContain('zed_holder_x');
    expect(other).toContain('maker_one');
  });

  it('a player sees only their own holdings, and the creator console is the creator’s alone', () => {
    const g = lpWorld('view-own');
    launch(g, CREATOR, 'OWNV', { allocation: 2_000_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'OWNV', spendCents: 5_000 });
    const trader = launchpadView(g, TRADER);
    expect(trader.holdings.map((h) => h.ticker)).toEqual(['OWNV']);
    expect(trader.console).toEqual([]);
    const creator = launchpadView(g, CREATOR);
    expect(creator.console.map((c) => c.ticker)).toEqual(['OWNV']);
    expect(creator.console[0]!.allocation).toBe(2_000_000);
    expect(creator.holdings.find((h) => h.ticker === 'OWNV')!.locked).toBe(2_000_000);
  });

  it('the feeds list the new token; the gate reads the launch rules for the viewer', () => {
    const g = lpWorld('view-feed');
    expect(launchpadView(g, CREATOR).feeds.newest).toHaveLength(0);
    launch(g, CREATOR, 'FEED');
    const v = launchpadView(g, TRADER);
    expect(v.feeds.newest.map((c) => c.ticker)).toEqual(['FEED']);
    expect(v.feeds.trending.map((c) => c.ticker)).toEqual(['FEED']);
    expect(v.feeds.graduated).toHaveLength(0);
    expect(v.gate).toBeNull();
    expect(v.feeds.newest[0]!.icon.startsWith('<svg')).toBe(true);
    // the v1.4 launch cohort (L6.9) and the NPC sniper are bought at once (L6.4, sniperEnter); the bound is what a 99th-percentile
    // launch buys (cohortShareBound above), not a fixed guess
    expect(v.feeds.newest[0]!.progress).toBeGreaterThan(0);
    expect(v.feeds.newest[0]!.progress).toBeLessThan(cohortShareBound);
    const cr = launchpadView(g, CREATOR);
    expect(cr.gate).toBe('cooldown');
  });

  it('a world that never launched has no Launchpad state and an empty Launchpad view', () => {
    const g = createGame('view-empty', { warmupDays: 0, npcs: false });
    expect(g.launchpad).toBeUndefined();
    const view = playerView(g, Object.keys(g.players)[0] ?? 'nobody');
    expect(view).toBeNull();
    const join = applyCommand(g, 'lp_x', { type: 'join', handle: 'empty_one', country: 'AV' });
    expect(join.ok).toBe(true);
    const v = playerView(g, 'lp_x')!.launchpad;
    expect(v.feeds.newest).toHaveLength(0);
    expect(v.holdings).toEqual([]);
    expect(v.console).toEqual([]);
    expect(g.launchpad).toBeUndefined();
  });

  it('a token page is read on demand for every row and holding, and the view carries no page (the per-tick payload stays small)', () => {
    const g = lpWorld('view-pages');
    launch(g, CREATOR, 'PGAA');
    launch(g, HOLDER, 'PGBB');
    run(g, TRADER, { type: 'lp.buy', ticker: 'PGAA', spendCents: 5_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'PGBB', spendCents: 2_000 });
    const v = launchpadView(g, TRADER);
    expect(v.feeds.newest.length).toBe(2);
    for (const c of [...v.feeds.newest, ...v.feeds.trending, ...v.feeds.graduated]) expect(lpPageOf(g, TRADER, c.ticker), c.ticker).not.toBeNull();
    for (const h of v.holdings) expect(lpPageOf(g, TRADER, h.ticker), h.ticker).not.toBeNull();
    expect(lpPageOf(g, TRADER, 'NOPE')).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"chart"');
    expect(JSON.stringify(v)).not.toContain('"tape"');
    // the creator launched with no allocation, so the trader is the one holder of PGAA: the page counts holders, never names them
    // R-10-6: the NPC sniper's cohort counts as an anonymous holder, so the trader and the cohort are two
    expect(lpPageOf(g, TRADER, 'PGAA')!.buckets.holders).toBe(2);
  });

  it('creator fees are on the page for the creator only (the figure is not public)', () => {
    const g = lpWorld('view-fees');
    launch(g, CREATOR, 'FEEA');
    run(g, TRADER, { type: 'lp.buy', ticker: 'FEEA', spendCents: 5_000 });
    expect(g.launchpad!.tokens.FEEA!.creatorFees).toBeGreaterThan(0);
    expect(lpPageOf(g, CREATOR, 'FEEA')!.creatorFees).toBeCloseTo(g.launchpad!.tokens.FEEA!.creatorFees, 9);
    expect('creatorFees' in lpPageOf(g, TRADER, 'FEEA')!).toBe(false);
  });

  it('a graduated token counts its holders from the engine positions, never the liquidity book', () => {
    const g = lpWorld('view-grad-holders');
    launch(g, CREATOR, 'GHLD', { allocation: 20_000_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'GHLD', spendCents: 10_000 });
    expect(applyCommand(g, 'admin', { type: 'admin.lpFill', ticker: 'GHLD' }).ok).toBe(true);
    const expected = Object.entries(g.market.accounts).filter(([id, a]) => id !== bookAccountId('GHLD') && (a.positions.GHLD?.qty ?? 0) > 0);
    const page = lpPageOf(g, TRADER, 'GHLD')!;
    expect(page.status).toBe('graduated');
    expect(page.buckets.holders).toBe(expected.length);
    expect(page.buckets.holders).toBeGreaterThan(0);
    expect(page.buckets.top10Share).toBeGreaterThan(0);
    expect(page.buckets.top10Share).toBeLessThanOrEqual(1);
  });

  it('a cancel is offered only while the launch is untraded', () => {
    const g = lpWorld('view-cancel');
    launch(g, CREATOR, 'CNCL');
    expect(launchpadView(g, CREATOR).console[0]!.cancellable).toBe(true);
    run(g, TRADER, { type: 'lp.buy', ticker: 'CNCL', spendCents: 1_000 });
    expect(launchpadView(g, CREATOR).console[0]!.cancellable).toBe(false);
  });

  it('a v1.2 launch stays cancellable though its own buzz and sniper are on the tape and the curve has moved (review item 5)', () => {
    const g = lpWorld('view-cancel-v12');
    launch(g, CREATOR, 'CNLX');
    const t = g.launchpad!.tokens.CNLX!;
    expect(t.tape.length).toBeGreaterThan(0);
    expect(t.y).toBeLessThan(LP.Y0);
    expect(launchpadView(g, CREATOR).console[0]!.cancellable).toBe(true);
    expect(run(g, CREATOR, { type: 'lp.cancel', ticker: 'CNLX' }).ok).toBe(true);
    expect(g.launchpad!.tokens.CNLX!.status).toBe('dead');
  });

  it('an old snapshot without the Launchpad loads and steps, and the view reads it as empty', () => {
    const g = createGame('old-snap', { warmupDays: 0, npcs: false });
    const old = JSON.parse(JSON.stringify(g)) as typeof g;
    expect(old.launchpad).toBeUndefined();
    stepGame(old);
    expect(old.launchpad).toBeUndefined();
  });
});

describe('the token lookups are own-property only (review item 1)', () => {
  it('a ticker that names an Object.prototype member is no token: the page is null and nothing throws', () => {
    const g = lpWorld('view-proto');
    launch(g, CREATOR, 'PROT');
    for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'Constructor', '']) {
      expect(() => lpPageOf(g, TRADER, bad)).not.toThrow();
      expect(lpPageOf(g, TRADER, bad)).toBeNull();
    }
    // the same guard holds for the commands that read a ticker
    expect(tokenOf(g, 'constructor')).toBeUndefined();
    expect(tokenOf(g, '__proto__')).toBeUndefined();
  });

  it('a real ticker is found in any case, and a page is built for it', () => {
    const g = lpWorld('view-case');
    launch(g, CREATOR, 'CASE');
    expect(lpPageOf(g, TRADER, 'CASE')?.ticker).toBe('CASE');
    expect(lpPageOf(g, TRADER, 'case')?.ticker).toBe('CASE');
  });

  it('the lp-page request never throws on a prototype name, even on a world with no launches', () => {
    const g = lpWorld('view-empty');
    expect(lpPageOf(g, TRADER, 'constructor')).toBeNull();
  });
});
