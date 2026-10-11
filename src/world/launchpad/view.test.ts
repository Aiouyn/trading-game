import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from '../game';
import { playerView } from '../view';
import { CREATOR, HOLDER, TRADER, launch, lpWorld, run } from './fixture';
import { launchpadView } from './view';

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
    const page = launchpadView(g, CREATOR).pages.REVL!;
    expect(Object.keys(page.buckets).sort()).toEqual(['holders', 'top10Share']);
    expect(page.buckets.holders).toBe(3);
    for (const tr of page.tape) {
      expect(Object.keys(tr).sort()).toEqual(['creator', 'npc', 'price', 'qty', 'side', 'tick']);
    }
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
    // the launch's own buzz and the NPC sniper (at most $400, about 3% of the curve) are bought at once (L6.4, sniperEnter)
    expect(v.feeds.newest[0]!.progress).toBeGreaterThan(0);
    expect(v.feeds.newest[0]!.progress).toBeLessThan(0.05);
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
    expect(v.pages).toEqual({});
    expect(g.launchpad).toBeUndefined();
  });

  it('an old snapshot without the Launchpad loads and steps, and the view reads it as empty', () => {
    const g = createGame('old-snap', { warmupDays: 0, npcs: false });
    const old = JSON.parse(JSON.stringify(g)) as typeof g;
    expect(old.launchpad).toBeUndefined();
    stepGame(old);
    expect(old.launchpad).toBeUndefined();
  });
});
