import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPANY } from '@/content/company';
import { foundCompany, emptyCompanyWorld, type CompanyEnv } from '@/world/company/company';
import { founderCompanyView, type CompanyFounderView } from '@/world/company/views';
import type { CompanyWorld } from '@/world/company/types';
import { People } from './People';

// O-16: the CEO change on People. Before an announcement the founder sees the days and the confirm; once announced, the
// recorded days and the pending state, and no second confirm (a second change is refused by the engine).

function view(): CompanyFounderView {
  const env: CompanyEnv = { seed: 'people-view', day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R2', money: { cash: () => 2_000_000, take: () => undefined } };
  const w: CompanyWorld = emptyCompanyWorld('people-view');
  const r = foundCompany(w, env, 'founder', { name: 'Plan Co.', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return founderCompanyView(w, 'founder', r.value.id, 40);
}

describe('CEO change on People (O-16)', () => {
  it('before an announcement: the days and the confirm are shown, and no pending state', () => {
    const html = renderToStaticMarkup(<People co={view()} />);
    expect(html).toContain('data-testid="company-ceo-plan"');
    expect(html).toContain('data-testid="company-ceo-submit"');
    expect(html).not.toContain('data-testid="company-ceo-pending"');
  });

  it('once announced: the recorded days and the pending state, with no second confirm', () => {
    const v = view();
    const eff = 40 + COMPANY.governance.ceo.noticeDays;
    const html = renderToStaticMarkup(<People co={{ ...v, ceoPending: { announcedDay: 40, effectiveDay: eff, freezeUntil: eff + COMPANY.governance.ceo.exitFreezeDays, cooldownUntil: eff + COMPANY.governance.ceo.cooldownDays, successor: 'npc' } }} />);
    expect(html).toContain('data-testid="company-ceo-pending"');
    expect(html).toContain('data-testid="company-ceo-announce"');
    expect(html).toContain('data-testid="company-ceo-successor"');
    expect(html).toContain('data-testid="company-ceo-pending-note"');
    expect(html).not.toContain('data-testid="company-ceo-submit"');
  });
});
