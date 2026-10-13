// @vitest-environment node
// The owned businesses table (R-9-10): a Tax column shows each shop's tax for the day, with the owner's bracket in its tooltip.
// Rendered on the server, in English and in French.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUSINESSES } from '@/content/businesses';
import { useLocale } from '@/i18n';
import { applyCommand, createGame } from '@/world/game';
import { playerView } from '@/world/view';
import type { PlayerView } from '@/world/view';
import { OwnedBusinesses } from './OwnedBusinesses';

const holder = vi.hoisted(() => ({ me: null as unknown }));
vi.mock('@/game/store', () => ({
  useGame: (sel: (s: { me: unknown }) => unknown) => sel({ me: holder.me }),
}));

/** A player with one food shop, as the page's player view holds it. */
function viewWithShop(): PlayerView {
  const g = createGame('owned-biz-tax', { warmupDays: 1, npcs: false });
  applyCommand(g, 'u1', { type: 'join', handle: 'tycoon', country: 'AV' });
  g.players.u1!.onboarding.skipped = true;
  const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
  const r = applyCommand(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
  if (!r.ok) throw new Error(`buy failed: ${r.error}`);
  const me = playerView(g, 'u1');
  if (!me) throw new Error('no player view');
  return me;
}

function render(): { html: string; bizId: string } {
  const me = viewWithShop();
  holder.me = me;
  return { html: renderToStaticMarkup(<OwnedBusinesses onBrowse={() => {}} />), bizId: me.businesses[0]!.id };
}

function inFrench<T>(fn: () => T): T {
  useLocale.getState().setLocale('fr');
  try {
    return fn();
  } finally {
    useLocale.getState().setLocale('en');
  }
}

afterEach(() => {
  useLocale.getState().setLocale('en');
});

describe('the owned businesses table shows each shop\'s tax for the day', () => {
  it('in English: a Tax per day column, and the cell with the day\'s tax carries the bracket as its tooltip', () => {
    const { html, bizId } = render();
    expect(html).toContain('Tax per day');
    expect(html).toMatch(/title="Tax \(bracket \d+%\)" data-testid="biz-[^"]+-tax"/);
    expect(html).toContain(`data-testid="biz-${bizId}-tax"`);
    expect(html).toMatch(/\$\d[\d,]*\.\d{2}/);
  });

  it('in French: the column is "Impôt par jour", the tooltip names the bracket, and the money uses the French format', () => {
    const { html, bizId } = inFrench(() => render());
    expect(html).toContain('Impôt par jour');
    expect(html).toContain(`data-testid="biz-${bizId}-tax"`);
    expect(html).toMatch(/title="Impôt \(tranche \d+\s%\)" data-testid="biz-[^"]+-tax"/);
    expect(html).toMatch(/\d+,\d{2} \$/);
  });
});
