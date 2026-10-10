'use client';

// The Portfolio's two private learning panels (Phase 3 B1): the ghosts and luck or skill (quant-ghosts.md), and the list of
// the daily closes (velvet-daily-close.md, "Closes"). Both read the owner's own record from the view (me.trading); nothing
// here is computed, and nothing is shown to another player.
import { GHOSTS } from '@/content/learning';
import { money, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, CardHeader, Stat } from './ui';

/** Luck or skill: the player's equity against the three ghosts at the last close, the percentile and the plain explanation. */
export function LuckCard() {
  const me = useGame((s) => s.me)!;
  const b = me.trading.benchmark;
  return (
    <Card className="p-4" data-testid="luck-skill">
      <h3 className="font-serif text-title">{t('luck.title')}</h3>
      {!b ? (
        <p className="mt-2 text-small text-fg-faint" data-testid="luck-none">{t('luck.none')}</p>
      ) : (
        <>
          <p className="text-caption text-fg-faint">{t('luck.asOf', { n: b.day + 1 })}</p>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Stat
              label={t('luck.percentileLabel')}
              value={b.noTrades || b.percentile === null ? t('luck.noTrades') : <span data-testid="ghost-percentile-value">{b.percentile}</span>}
              sub={b.noTrades ? undefined : t('luck.percentile', { beaten: b.beaten })}
              testId="ghost-percentile"
            />
          </div>
          {b.noTrades && <p className="mt-3 text-small text-fg-muted" data-testid="luck-no-trades">{t('luck.noTradesBody')}</p>}
          <ul className="mt-4 flex flex-col divide-y divide-ink-2">
            <GhostLine label={t('luck.you')} value={b.player} change={b.change.player} testId="ghost-you" strong />
            <GhostLine label={t('close.ghost.basket')} value={b.basket} change={b.change.basket} testId="ghost-line" />
            <GhostLine label={t('close.ghost.random')} value={b.random} change={b.change.random} testId="ghost-line" />
            <GhostLine label={t('close.ghost.momentum')} value={b.momentum} change={b.change.momentum} testId="ghost-line" />
          </ul>
          <div className="mt-4 flex flex-col gap-2 text-small text-fg-muted">
            <p>{t('luck.explain.1')}</p>
            <p>{t('luck.explain.2', { picks: GHOSTS.picks, days: GHOSTS.rebalanceDays, momentum: GHOSTS.momentumDays })}</p>
            <p>{t('luck.explain.3')}</p>
          </div>
        </>
      )}
    </Card>
  );
}

/** One equity: its value and its change since the start cash (both from the view). */
function GhostLine({ label, value, change, testId, strong = false }: { label: string; value: number; change: number; testId: string; strong?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2" data-testid={testId}>
      <span className={`text-small ${strong ? 'font-semibold text-fg' : 'text-fg-muted'}`} data-testid="ghost-label">{label}</span>
      <span className="num text-small text-fg">
        <span data-testid="ghost-value">{money(value)}</span>{' '}
        <span className={toneText[tone(change)]}>{signedPct(change)}</span>
      </span>
    </li>
  );
}

/** The closes, newest first. Each row reopens its card. */
export function ClosesCard() {
  const me = useGame((s) => s.me)!;
  const openClose = useGame((s) => s.openClose);
  const closes = me.trading.closes;
  return (
    <Card data-testid="closes-history">
      <CardHeader title={t('close.history.title')} sub={t('close.history.sub')} />
      {closes.length === 0 ? (
        <p className="px-4 pb-6 text-small text-fg-faint">{t('close.history.empty')}</p>
      ) : (
        <ul className="flex flex-col pb-2">
          {closes.map((c) => (
            <li key={c.day} className="border-t border-ink-2">
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left hover:bg-ink-2"
                data-testid={`close-row-${c.day}`}
                onClick={() => openClose(c.day)}
              >
                <span className="text-small text-fg">{t('close.day', { n: c.day + 1 })}</span>
                <span className="num text-small">
                  <span className={toneText[tone(c.nwChange)]}>{signedMoney(c.nwChange)}</span>
                  <span className="ml-3 text-fg-muted">{money(c.nwClose)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
