'use client';

import { clockLabel } from '@/game/clock';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, ticksLabel } from '@/components/ui';
import { refusalText, useComeback } from './state';

/**
 * The low-cash card (velvet-bankruptcy.md section 1): not a modal. It sits at the top of Portfolio while net worth is under
 * $1,000, or while a sponsor offer is open for the day (the day-start cash rule). Three rows, in this order: the fresh start,
 * the ad for $250, and keep trading (a dismissal hides the card for a real day).
 */
export function LowCashCard() {
  const me = useGame((s) => s.me);
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const openChapter = useComeback((s) => s.openChapter);
  const setCard = useComeback((s) => s.setCard);
  const cb = me?.comeback;
  if (!cb || !cb.card) return null;

  const startAd = async () => {
    const r = await act({ type: 'ad.start' }, { silent: true });
    if (!r.ok) {
      toast({ tone: 'warn', text: refusalText('ad.refusal', r.error ?? 'adNotOffered') });
      return;
    }
    const d = r.data as { id: string; brand: string };
    setCard({ id: d.id, brand: d.brand, opened: Date.now() });
  };

  const keepTrading = () => { void act({ type: 'comeback.dismiss' }, { silent: true }); };

  return (
    <Card className="p-4" data-testid="lowcash-card">
      <h2 className="font-serif text-title text-fg">{t('lowcash.title')}</h2>
      <p className="mt-1 text-small text-fg-muted">{t('lowcash.line', { amount: money(cb.netWorth) })}</p>
      <ul className="mt-3 flex flex-col">
        {cb.low && (
          <li className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-2 py-3 text-small" data-testid="lowcash-fresh-row">
            <span className="min-w-0">
              <span className="block text-fg">{t('lowcash.fresh')}</span>
              <span className="block text-caption text-fg-faint">{t('lowcash.freshSub')}</span>
            </span>
            {cb.freshAvailable ? (
              <Button size="sm" variant="brass" onClick={openChapter} testId="lowcash-fresh">{t('lowcash.fresh')}</Button>
            ) : (
              <span className="text-caption text-fg-muted" data-testid="lowcash-fresh-next">
                {t('lowcash.next', { time: ticksLabel(cb.cooldownLeft) })}
              </span>
            )}
          </li>
        )}
        {cb.ad.offered && (
          <li className="flex flex-col gap-2 border-t border-ink-2 py-3 text-small" data-testid="lowcash-ad-row">
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-fg">{t('lowcash.ad')}</span>
              <span className="flex items-center gap-3">
                <span className="num text-caption text-fg-faint" data-testid="ad-count">{t('lowcash.adCount', { used: cb.ad.used, cap: cb.ad.cap })}</span>
                <Button size="sm" onClick={startAd} testId="lowcash-ad">{t('lowcash.ad')}</Button>
              </span>
            </span>
            <span className="text-caption text-fg-faint" data-testid="ad-note">{t('lowcash.adNote')}</span>
          </li>
        )}
        <li className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-2 py-3 text-small">
          <span className="text-fg-muted">{t('lowcash.keep')}</span>
          <Button size="sm" onClick={keepTrading} testId="lowcash-keep">{t('lowcash.keep')}</Button>
        </li>
      </ul>
    </Card>
  );
}

/**
 * The AD pill (velvet-rewarded-ads.md): a small brass-outlined note while any ad or fresh-start cash is still restricted. Its
 * time is the engine's (the earliest lot's release), and it shows nothing when no cash is restricted.
 */
export function RestrictedNote() {
  const cb = useGame((s) => s.me?.comeback ?? null);
  if (!cb || cb.restricted.amount <= 0 || cb.restricted.until === null) return null;
  const kind = cb.restricted.kind;
  const pill = kind === 'start' ? 'START' : 'AD';
  return (
    <p className="flex flex-wrap items-center gap-2 text-caption text-fg-muted" data-testid="ad-pill-row">
      <span className="rounded-sm border border-brass px-1.5 py-0.5 font-mono text-[11px] text-brass" data-testid="ad-pill">
        {pill === 'START' ? t('ad.pillStart') : t('ad.pill')}
      </span>
      <span data-testid="ad-pill-note">
        {t('ad.pillNote', { amount: money(cb.restricted.amount), kind: t(`ad.kind.${kind}`), when: clockLabel(cb.restricted.until, 720) })}
      </span>
    </p>
  );
}
