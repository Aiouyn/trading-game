// @vitest-environment node
// The Shops tab, rendered on the server: the overdraft notice follows the owner's cash (the e2e admin route cannot take
// cash below zero, so the notice is checked here against the same player view the page holds).
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUSINESSES } from '@/content/businesses';
import { applyCommand, createGame } from '@/world/game';
import { playerView } from '@/world/view';
import type { PlayerView } from '@/world/view';
import { ShopsTab } from './Shops';

// The server render reads the store's initial state, so the store is stood in for by a holder the test fills in.
const holder = vi.hoisted(() => ({ me: null as unknown }));
vi.mock('@/game/store', () => ({
  useGame: (sel: (s: { me: unknown }) => unknown) => sel({ me: holder.me }),
}));

/** A player with one food shop, as the page's player view holds it. */
function viewWithShop(): PlayerView {
  const g = createGame('shops-tab', { warmupDays: 1, npcs: false });
  applyCommand(g, 'u1', { type: 'join', handle: 'tycoon', country: 'AV' });
  g.players.u1!.onboarding.skipped = true;
  const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
  const r = applyCommand(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
  if (!r.ok) throw new Error(`buy failed: ${r.error}`);
  const me = playerView(g, 'u1');
  if (!me) throw new Error('no player view');
  return me;
}

function renderWithCash(cash: number): string {
  const me = viewWithShop();
  const account = me.account ? { ...me.account, cash } : null;
  holder.me = { ...me, account };
  return renderToStaticMarkup(<ShopsTab />);
}

describe('the Shops tab overdraft notice', () => {
  it('shows while cash is below zero, with the owner told what to do', () => {
    const html = renderWithCash(-50);
    expect(html).toContain('data-testid="shops-overdraft"');
    expect(html).toContain('Your cash is below zero.');
  });

  it('is absent while cash is zero or above', () => {
    expect(renderWithCash(0)).not.toContain('shops-overdraft');
    expect(renderWithCash(1000)).not.toContain('shops-overdraft');
  });
});
