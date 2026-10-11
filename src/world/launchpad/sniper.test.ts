import { describe, expect, it } from 'vitest';
import { LP } from './constants';
import { spotAt } from './curve';
import { lpWorld, launch, run, CREATOR, TRADER } from './fixture';

/**
 * The NPC sniper's entry (L6.3, v1.2 review item 2). It fills inside the launch command, after the launch's own buzz, so no player's
 * fill can sit between the launch and the sniper's price impact (the front-run: a buy on the launch tick, a sell at launch + 2).
 */
describe('the NPC sniper entry (L6.3, launch-command fill)', () => {
  it('the sniper is in on the launch tick, before any player can trade the token', () => {
    const g = lpWorld('sniper-enter');
    launch(g, CREATOR, 'SNIP');
    const t = g.launchpad!.tokens.SNIP!;
    expect(t.sniperDone).toBe(true);
    expect(t.sniper).toBeDefined();
    expect(t.sniper!.tick).toBe(t.createdTick);
    expect(t.sniper!.tokens).toBeGreaterThan(0);
    expect(t.npcBal).toBeGreaterThanOrEqual(t.sniper!.tokens);
  });

  it('a buy on the launch tick is filled above the start price: the sniper and the launch buzz are already on the curve', () => {
    const g = lpWorld('sniper-first');
    launch(g, CREATOR, 'FIRS');
    const r = run(g, TRADER, { type: 'lp.buy', ticker: 'FIRS', spendCents: 200_000, maxSlip: 0.5 });
    expect(r.ok).toBe(true);
    const avg = (r.data as { avgPrice: number }).avgPrice;
    expect(avg).toBeGreaterThan(spotAt(LP.Y0));
  });
});
