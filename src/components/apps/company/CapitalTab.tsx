'use client';

// Capital (Company app, Listing and Finance): the founder's cap table, private round, IPO, trading window, sell-only plans,
// buybacks, debt and covenants, dividends, takeover and the failure record. The numbers are the world's (capitalViewOf in
// the player view); this tab only shows them and sends the founder's commands. Refusals stay inline on their card.
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { money } from '@/game/format';
import { Empty } from '@/components/ui';
import type { CapitalView } from '@/world/company/capital';
import { BuybackPanel, PlansPanel, WindowPanel } from './capital/Trading';
import { CapTablePanel, IpoPanel, RoundPanel } from './capital/Equity';
import { DebtPanel, DividendPanel, FailurePanel, TakeoverPanel } from './capital/Money';

export function CapitalTab({ companyId }: { companyId: string }) {
  const cap = useGame((s) => s.me?.capital ?? null);
  if (!cap || cap.companyId !== companyId) {
    return <Empty title={t('company.capital.none')} />;
  }
  return <CapitalBody cap={cap} />;
}

/** The cards of one company's capital view (the tab renders this from the player view). */
export function CapitalBody({ cap }: { cap: CapitalView }) {
  return (
    <div className="flex flex-col gap-4" data-testid="company-capital">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-title text-fg">{cap.name}</h2>
          <p className="text-caption text-fg-muted" data-testid="company-capital-status">
            {t(`company.capital.status.${cap.bankrupt ? 'bankrupt' : cap.listed ? 'listed' : cap.tier}`)}
          </p>
        </div>
        <p className="text-small text-fg-muted">
          {t('company.capital.cashLine', { cash: money(cap.cash) })}
        </p>
      </header>
      <div className="grid gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
        <CapTablePanel cap={cap} />
        <RoundPanel cap={cap} />
        <IpoPanel cap={cap} />
        <WindowPanel cap={cap} />
        <PlansPanel cap={cap} />
        <BuybackPanel cap={cap} />
        <DebtPanel cap={cap} />
        <DividendPanel cap={cap} />
        <TakeoverPanel cap={cap} />
        <FailurePanel cap={cap} />
      </div>
    </div>
  );
}
