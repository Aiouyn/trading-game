'use client';

import { useState } from 'react';
import { commission, estimateFill, type Side } from '@/engine';
import { money, qty as fmtQty } from '@/game/format';
import { isIndex, useGame } from '@/game/store';
import { t } from '@/i18n';
import { getDraft, setDraft } from '@/components/os/drafts';
import { Button, NumberField, Segmented } from '@/components/ui';
import { OrderTicket } from './OrderTicket';

function num(s: string): number {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

/**
 * The phone's sticky trade bar (spec 1.1): the side, the size and the Review button with the total. Review opens the full
 * ticket as the bottom sheet, where the order is sent. The bar keeps its own side and size and writes them as the ticket's
 * draft, so the sheet opens with them filled in. The parent remounts it (a new `key`) when the sheet closes.
 */
export function TradeBar({ ticker, onReview }: { ticker: string; onReview: () => void }) {
  const world = useGame((s) => s.world);
  const config = useGame((s) => s.config);
  const saved = getDraft(ticker);
  const [side, setSide] = useState<Side>(saved?.side ?? 'buy');
  const [q, setQ] = useState(saved?.q ?? '');
  const n = num(q);
  const def = config.assets.find((a) => a.id === ticker);
  const est = world && def && !isIndex(ticker) && n > 0 ? estimateFill(world, { assetId: ticker, side, qty: n }) : null;
  const notional = est ? n * est.price : 0;
  const fee = est && world && def ? commission(world, def, notional) : 0;
  const total = side === 'buy' ? notional + fee : notional - fee;
  const write = (nextSide: Side, nextQ: string) => {
    setSide(nextSide);
    setQ(nextQ);
    setDraft(ticker, { side: nextSide, q: nextQ });
  };
  const verb = side === 'buy' ? t('common.buy') : t('common.sell');
  return (
    <div className="flex items-center gap-2" data-testid="trade-bar">
      <Segmented
        className="shrink-0" label={t('broker.side')} size="sm" value={side}
        onChange={(v) => write(v as Side, q)}
        options={[{ value: 'buy', label: t('common.buy'), testId: 'bar-side-buy' }, { value: 'sell', label: t('common.sell'), testId: 'bar-side-sell' }]}
      />
      <NumberField
        value={q} onChange={(v) => write(side, v)}
        step={def?.assetClass === 'stock' ? 1 : 'any'} testId="bar-qty" className="h-9 min-w-[4.5rem] flex-1 px-2"
      />
      {/* no unit suffix and no field label in the bar: the input keeps its room, and the Review label wraps before it squeezes
          the input out (French labels are longer). The unit is in the sheet and in the summary. */}
      {/* The label wraps onto a second line instead of truncating ("Saisissez la quantité"): the height is the label's, not the 40 px button's. */}
      <Button variant="brass" size="md" className="min-w-0 max-w-[42%] shrink h-auto! min-h-10 py-1.5 leading-tight" disabled={!(n > 0) || !est} onClick={onReview} testId="bar-review">
        <span className="text-center">{n > 0 && est ? t('broker.bar.review', { verb, qty: fmtQty(n), total: money(total) }) : t('broker.bar.enter')}</span>
      </Button>
    </div>
  );
}

/**
 * The full ticket as the phone's bottom sheet (spec 1.1). The ticket keeps its own logic; the sheet only frames it, with a
 * close control. A market order closes it when it fills (the store does that), and the parent follows the store's flag.
 */
export function TradeSheet({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 z-[3] bg-black/40" data-testid="trade-sheet-scrim" />
      <div
        role="dialog" aria-modal="false" aria-label={t('broker.sheet.title', { ticker })} data-testid="trade-sheet"
        className="absolute inset-x-0 bottom-0 z-[4] flex max-h-[88%] flex-col rounded-t-lg border-t border-ink-3 bg-ink-1 shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between px-3 pt-2">
          <span className="mx-auto h-1 w-10 rounded-full bg-ink-3" aria-hidden />
          <button type="button" onClick={onClose} className="absolute right-2 top-1.5 h-7 rounded-sm px-2 text-caption text-fg-muted hover:text-fg" data-testid="trade-sheet-close">
            {t('common.close')}
          </button>
        </div>
        {/* The ticket is dense here: its refusal, confirm line and Buy/Sell button are a footer pinned under the fields (UX 4). */}
        <div className="flex min-h-0 flex-1 flex-col p-2">
          <OrderTicket ticker={ticker} dense />
        </div>
      </div>
    </>
  );
}
