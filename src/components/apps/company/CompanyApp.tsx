'use client';

// The Company app shell (Velvet 2): the founder's views in a rail on desktop and a tab row on the phone, the "What the
// market sees" toggle, and the founding flow until the player has a company. The founder view reaches this app only
// through the store (`me.company`); the market side is built from CompanyPublic alone (`marketOf`).
import { useState } from 'react';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Segmented } from '@/components/ui';
import { Found } from './Found';
import { Overview } from './Overview';
import { Products } from './Products';
import { RnD } from './RnD';
import { People } from './People';
import { Deals } from './Deals';
import { CapitalTab } from './CapitalTab';
import { PublicPanel } from './PublicPanel';
import type { CompanyFounderView } from '@/world/company/views';
import { VIEWS, isCompanyView, marketOf, type CompanyViewId } from './model';

type Mode = 'founder' | 'market';

export function CompanyApp({ view }: { view?: string }) {
  const me = useGame((s) => s.me);
  const [tab, setTab] = useState<CompanyViewId>(isCompanyView(view) ? view : 'overview');
  const [mode, setMode] = useState<Mode>('founder');
  if (!me) return null;
  const co = me.company ?? null;
  return (
    <div className="flex flex-col gap-4" data-testid="company">
      {co === null ? (
        <Found />
      ) : (
        <div className="flex flex-col gap-4 @md:flex-row @md:items-start">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink-2 pb-1 @md:w-40 @md:flex-col @md:border-b-0 @md:pb-0" aria-label={t('company.ui.views')} data-testid="company-rail">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                aria-current={tab === v ? 'page' : undefined}
                onClick={() => setTab(v)}
                className={`h-9 shrink-0 rounded-sm px-3 text-left text-small transition-colors ${tab === v ? 'bg-ink-3 text-fg' : 'text-fg-muted hover:text-fg'}`}
                data-testid={`company-tab-${v}`}
              >
                {t(`company.ui.tab.${v}`)}
              </button>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2" data-testid="company-view-toggle">
              <h1 className="font-serif text-title text-fg">{t('company.ui.title')}</h1>
              <Segmented<Mode>
                label={t('company.ui.views')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'founder', label: t('company.ui.view.founder'), testId: 'company-view-founder' },
                  { value: 'market', label: t('company.ui.view.market'), testId: 'company-view-market' },
                ]}
              />
            </div>
            <Body mode={mode} tab={tab} co={co} />
          </div>
        </div>
      )}
    </div>
  );
}

function Body({ mode, tab, co }: { mode: Mode; tab: CompanyViewId; co: CompanyFounderView }) {
  if (mode === 'market' || tab === 'public') return <PublicPanel pub={marketOf(co)} />;
  switch (tab) {
    case 'overview': return <Overview co={co} />;
    case 'products': return <Products co={co} />;
    case 'rd': return <RnD co={co} />;
    case 'people': return <People co={co} />;
    case 'deals': return <Deals co={co} />;
    case 'capital': return <CapitalTab companyId={co.id} />;
  }
}
