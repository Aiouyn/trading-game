import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { capitalViewOf } from '@/world/company/capital';
import { FOUNDER, founded, listedWorld } from '@/world/company/b1fixture';
import { applyCommand } from '@/world/game';
import { useGame } from '@/game/store';
import type { PlayerView } from '@/world/view';
import { CapitalBody, CapitalTab } from './CapitalTab';

// The capital tab renders the world's numbers and nothing else: these tests render it from a real capital view.

function withView(view: ReturnType<typeof capitalViewOf>) {
  useGame.setState({ me: { capital: view } as unknown as PlayerView });
}

describe('CapitalTab', () => {
  it('renders the empty state when the player has no company', () => {
    useGame.setState({ me: { capital: null } as unknown as PlayerView });
    const html = renderToStaticMarkup(<CapitalTab companyId="co:none" />);
    expect(html).not.toContain('data-testid="company-capital"');
  });

  it('renders every card of a private company, with the IPO refusal inline', () => {
    const { g } = founded('tab-private');
    withView(capitalViewOf(g, FOUNDER));
    const html = renderToStaticMarkup(<CapitalBody cap={capitalViewOf(g, FOUNDER)!} />);
    for (const id of ['company-captable', 'company-round', 'company-ipo-prep', 'company-trading-window', 'company-plan-list', 'company-buybacks', 'company-debt', 'company-dividends', 'company-takeover', 'company-failure', 'clawback-warning']) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    expect(html).toContain('data-testid="company-ipo-refusal"');
    expect(html).toContain('data-testid="company-guarantee-sign"');
  });

  it('shows the listed company: the public plan row carries no minimum price and no size', () => {
    const { g, c } = listedWorld('tab-listed');
    const v = capitalViewOf(g, FOUNDER)!;
    const from = v.plans.lockUntil!;
    const days = Array.from({ length: 5 }, (_, i) => from + i);
    const r = applyCommand(g, FOUNDER, { type: 'company.plan', companyId: c.id, qtyPerDay: 1_234, days, minSellPrice: 0.02 });
    expect(r.ok).toBe(true);
    withView(capitalViewOf(g, FOUNDER));
    const html = renderToStaticMarkup(<CapitalBody cap={capitalViewOf(g, FOUNDER)!} />);
    expect(html).toContain('data-testid="company-plan-public"');
    const publicPart = html.slice(html.indexOf('data-testid="company-plan-public"'), html.indexOf('data-testid="company-plan-public"') + 400);
    expect(publicPart).not.toContain('1,234');
    expect(publicPart).not.toContain('0.02');
    expect(html).toContain('data-testid="company-ipo-no-cashout"');
    expect(html).toContain('data-testid="company-plan-row"');
  });
});
