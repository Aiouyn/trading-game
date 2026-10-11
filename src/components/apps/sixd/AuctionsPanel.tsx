'use client';

// The weekly live auctions (6D.2): the week's lots, English ascending bids for one real hour. During an auction only the high
// bid, the count and whether the reserve is met are shown; the bidders appear at the end. The reserve is never shown.
import { useState } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, Chip } from '@/components/ui';
import type { AuctionLotView } from '@/world/auctions';
import { refusalVars, sixdRefusal, type SixdRefusal } from './copy';

/** Real minutes left on a lot, from the world tick (one tick is 5 real seconds). */
function minutesLeft(endTick: number, tick: number): number {
  return Math.max(0, Math.ceil(((endTick - tick) * 5) / 60));
}

export function AuctionsPanel() {
  const me = useGame((s) => s.me)!;
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const lots = me.sixd?.auctions.lots ?? [];
  return (
    <div className="flex flex-col gap-3" data-testid="auctions-panel">
      <Card className="p-4">
        <h2 className="font-serif text-hero text-fg">{t('sixd.auc.title')}</h2>
        <p className="text-small text-fg-muted">{t('sixd.auc.intro')}</p>
      </Card>
      <div className="grid gap-3 @md:grid-cols-2">
        {lots.map((lot) => (
          <AuctionLot key={lot.key} lot={lot} tick={tick} />
        ))}
        {lots.length === 0 && <p className="text-small text-fg-muted" data-testid="auctions-empty">{t('sixd.auc.none')}</p>}
      </div>
    </div>
  );
}

function AuctionLot({ lot, tick }: { lot: AuctionLotView; tick: number }) {
  const act = useGame((s) => s.act);
  const [amount, setAmount] = useState('');
  const [refusal, setRefusal] = useState<SixdRefusal | null>(null);
  const open = lot.status === 'open';
  const statusLabel = lot.status === 'open' ? t('sixd.auc.open') : lot.status === 'sold' ? t('sixd.auc.sold') : lot.status === 'unsold' ? t('sixd.auc.unsold') : t('sixd.auc.upcoming');
  const bid = async () => {
    const n = Number(amount);
    const r = await act({ type: 'auction.bid', lot: lot.key, amount: n }, { silent: true });
    if (r.ok) {
      setRefusal(null);
      setAmount('');
    } else {
      setRefusal(sixdRefusal(r.error ?? 'unknown', refusalVars(r.data)));
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid={`auction-lot-${lot.itemId}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-body font-semibold">{lot.name}</h3>
          <p className="text-caption text-fg-faint">{lot.category}</p>
        </div>
        <Chip><span data-testid={`auction-status-${lot.itemId}`}>{statusLabel}</span></Chip>
      </div>
      <div className="num grid grid-cols-2 gap-x-4 gap-y-1 text-caption text-fg-muted">
        <span>{t('sixd.auc.high')}</span>
        <span className="text-right text-fg" data-testid={`auction-high-${lot.itemId}`}>{lot.high !== null ? money(lot.high) : t('sixd.auc.noBid')}</span>
        <span>{t('sixd.auc.count')}</span>
        <span className="text-right text-fg" data-testid={`auction-count-${lot.itemId}`}>{lot.bidCount}</span>
        {open && (
          <>
            <span>{t('sixd.auc.min')}</span>
            <span className="text-right text-fg" data-testid={`auction-min-${lot.itemId}`}>{lot.minimum !== null ? money(lot.minimum) : '—'}</span>
            <span>{t('sixd.auc.ends')}</span>
            <span className="text-right text-fg">{t('sixd.auc.minutes', { min: minutesLeft(lot.endTick, tick) })}</span>
          </>
        )}
        {lot.reserveMet !== null && open && (
          <span className="col-span-2 text-caption text-fg-muted">{lot.reserveMet ? t('sixd.auc.reserveMet') : t('sixd.auc.reserveNotMet')}</span>
        )}
        {lot.mine && open && <span className="col-span-2 text-caption text-brass-hi">{t('sixd.auc.mine')}</span>}
      </div>
      {!open && lot.status === 'sold' && (
        <p className="text-caption text-fg" data-testid={`auction-winner-${lot.itemId}`}>
          {t('sixd.auc.wonBy', { handle: lot.winner ?? '—', amount: lot.hammer !== null ? money(lot.hammer) : '—' })}
        </p>
      )}
      {!open && lot.bidders && lot.bidders.length > 0 && (
        <p className="text-caption text-fg-faint">{t('sixd.auc.bidders', { list: lot.bidders.join(', ') })}</p>
      )}
      {open && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void bid(); }}>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-caption text-fg-muted">
            {t('sixd.auc.bidLabel')}
            <input
              type="number" min="0" step="0.01" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="num h-9 min-w-0 rounded-chip border border-ink-3 bg-ink-1 px-2 text-small text-fg"
              data-testid={`auction-amount-${lot.itemId}`}
            />
          </label>
          <Button variant="brass" onClick={bid} disabled={amount === ''} testId={`auction-submit-${lot.itemId}`}>{t('sixd.auc.bid')}</Button>
        </form>
      )}
      {refusal && (
        <div role="alert" className="rounded-chip border border-loss/40 p-3 text-caption" data-testid={`auction-refusal-${lot.itemId}`}>
          <p className="font-semibold text-fg">{refusal.what}</p>
          <p className="text-fg-muted">{refusal.why}</p>
          <p className="text-fg-muted">{refusal.do}</p>
        </div>
      )}
    </Card>
  );
}
