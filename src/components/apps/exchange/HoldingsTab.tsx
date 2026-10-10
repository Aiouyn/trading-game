'use client';

// The viewer's own fund holdings: what their units are worth, what waits for a redemption, what is owed to them, and any
// notice that applies (a front-running case, a verdict, the early-exit window). Only the viewer's own numbers appear here.
import { money, qty } from '@/game/format';
import { t } from '@/i18n';
import { Button, Card, Chip, ticksLabel } from '@/components/ui';
import type { FundHolding } from '@/world/exchange/view';
import { Fact } from './Shared';
import { statusKey, unitNav } from './copy';

export function HoldingsTab({ holdings, ticksPerDay, onOpen }: {
  holdings: FundHolding[];
  ticksPerDay: number;
  onOpen: (fundId: string) => void;
}) {
  if (holdings.length === 0) {
    return (
      <Card className="p-6" data-testid="exchange-holdings-empty">
        <p className="text-center text-fg-muted">{t('exchange.empty.mine')}</p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="exchange-holdings">
      {holdings.map((h) => (
        <Card key={h.fundId} className="flex flex-col gap-3 p-4" data-testid={`exchange-holding-${h.fundId}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate font-serif text-title text-fg">{h.name}</h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip>{t(statusKey(h.status))}</Chip>
                {h.convicted && <Chip>{t('exchange.holding.convicted')}</Chip>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpen(h.fundId)} testId={`exchange-holding-open-${h.fundId}`}>
              {t('exchange.holding.open')}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 @md:grid-cols-4">
            <Fact label={t('exchange.holding.value')} value={money(h.value)} testId={`exchange-holding-value-${h.fundId}`} />
            <Fact label={t('exchange.holding.units')} value={qty(h.units)} />
            <Fact label={t('exchange.holding.reserved')} value={qty(h.reserved)} />
            <Fact label={t('exchange.fund.nav')} value={unitNav(h.navPerUnit)} />
          </div>
          {h.pendingDeposit > 0 && (
            <p className="num text-small text-fg-muted">{t('exchange.holding.pendingDeposit', { amount: money(h.pendingDeposit) })}</p>
          )}
          {h.payable > 0 && <p className="num text-small text-fg">{t('exchange.holding.payable', { amount: money(h.payable) })}</p>}
          {h.earlyExitRemainingTicks > 0 && (
            <p className="text-small text-warn">{t('exchange.holding.earlyExit', { left: ticksLabel(h.earlyExitRemainingTicks, ticksPerDay) })}</p>
          )}
          {h.underCase && <p className="text-small text-warn">{t('exchange.holding.case')}</p>}
        </Card>
      ))}
    </div>
  );
}
