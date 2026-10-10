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

/** The markup between two test ids (the open tag of the first up to the open tag of the second). */
function between(html: string, from: string, to: string): string {
  const a = html.indexOf(`data-testid="${from}"`);
  const b = html.indexOf(`data-testid="${to}"`, a + 1);
  if (a < 0 || b < 0) throw new Error(`missing ${from} or ${to}`);
  return html.slice(a, b);
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
    expect(html).toContain('data-testid="company-ipo-alloc"');
    expect(html).toContain('data-testid="company-div-rule-filings"');
  });

  it('the guarantee shows its no-guarantee consequence by default, and never the personal-liability box', () => {
    const { g } = founded('tab-guarantee');
    const html = renderToStaticMarkup(<CapitalBody cap={capitalViewOf(g, FOUNDER)!} />);
    // the default option is "without": the box says only the company owes, and no personal amount is shown
    expect(html).toContain('data-testid="company-no-guarantee"');
    expect(html).not.toContain('data-testid="company-guarantee-amount"');
  });

  it('the takeover stance shows neither option until the founder answers', () => {
    const { g } = founded('tab-stance');
    const html = renderToStaticMarkup(<CapitalBody cap={capitalViewOf(g, FOUNDER)!} />);
    expect(html).toContain('data-testid="company-stance-unset"');
  });

  it('shows the listed company: the public plan rows carry no minimum price and no size, the private row does', () => {
    const { g, c } = listedWorld('tab-listed');
    const v = capitalViewOf(g, FOUNDER)!;
    const from = v.plans.lockUntil!;
    const days = Array.from({ length: 5 }, (_, i) => from + i);
    const r = applyCommand(g, FOUNDER, { type: 'company.plan', companyId: c.id, qtyPerDay: 1_234, days, minSellPrice: 0.02 });
    expect(r.ok).toBe(true);
    withView(capitalViewOf(g, FOUNDER));
    const html = renderToStaticMarkup(<CapitalBody cap={capitalViewOf(g, FOUNDER)!} />);

    // the market's list: built from the public view only (days and end reason), nothing else
    expect(html).toContain('data-testid="company-plan-public-rows"');
    const publicList = html.slice(html.indexOf('data-testid="company-plan-public-rows"'), html.indexOf('</ul>', html.indexOf('data-testid="company-plan-public-rows"')));
    expect(publicList).toContain('data-testid="company-plan-public"');
    expect(publicList).not.toContain('1,234');
    expect(publicList).not.toContain('0.02');
    expect(publicList).not.toMatch(/minimum/i);

    // the founder's rows carry the minimum price (positive control: the private number is there)
    const privateRows = between(html, 'company-plan-rows', 'company-plan-public-section');
    expect(privateRows).toContain('data-testid="company-plan-min"');
    expect(privateRows).toContain('0.02');

    expect(html).toContain('data-testid="company-ipo-no-cashout"');
    expect(html).toContain('data-testid="company-plan-row"');
  });

  it('a round refused after listing shows its refusal on the round card, with its own test id', () => {
    const { g } = listedWorld('tab-round');
    withView(capitalViewOf(g, FOUNDER));
    const html = renderToStaticMarkup(<CapitalBody cap={capitalViewOf(g, FOUNDER)!} />);
    const round = between(html, 'company-round', 'company-ipo-prep');
    expect(round).toContain('data-testid="company-round-refusal"');
    expect(round).not.toContain('data-testid="company-round-error"');
  });
});
