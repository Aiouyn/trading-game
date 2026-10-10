'use client';

// THE PORT AVALON CLOSE (velvet-daily-close.md, Phase 3 B1): the player's front page at each game-day close. The card
// is built from the stored facts the server sends (DailyClose, computed by src/world/close.ts): nothing is worked out
// here. It is a sheet over the desktop (a bottom sheet on the phone), not a page overlay. It waits behind the digest,
// a rank-up, the trade ticket, the event panel and any pending order, and never stacks two cards.
import { sectorName } from '@/engine';
import { money, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { type GameStore, useGame } from '@/game/store';
import { t, tm, useLocale } from '@/i18n';
import { closeMove } from '@/world/close-move';
import type { DailyClose, MoveLine } from '@/world/ledger-types';
import { useEventPanel } from './os/EventBanner';
import { OsSheet } from './os/OsSheet';
import { Button, Chip } from './ui';

const BAND_CHIP: Record<'early' | 'mid' | 'late', string> = {
  early: 'border-brass/60 text-brass-hi',
  mid: 'border-info/50 text-info',
  late: 'border-ink-3 text-fg-muted',
};

/**
 * The card the player should see now: the close they asked for (Messages, the closes list), else the latest close not yet
 * seen, once nothing is in the way. The seen day is the server's (closeSeenDay) or this session's dismissal, whichever is later.
 * One selector, so the coach waits for exactly the cards this one shows.
 */
export function shownClose(s: GameStore, eventOpen: boolean): DailyClose | null {
  const me = s.me;
  if (!me) return null;
  const closes = me.trading.closes;
  // a request always opens its card (it is the player's own action); a request for a close not in the list falls through
  const asked = s.closeOpen !== null ? closes.find((c) => c.day === s.closeOpen) : undefined;
  if (asked) return asked;
  const latest = closes[0];
  if (!latest) return null;
  const seen = Math.max(me.trading.closeSeenDay ?? -1, s.closeDismissed);
  const pending = me.orders.some((o) => o.status === 'open');
  // While You Were Away replaces the card (it marks the latest close seen when it closes), and the rank-up always goes first
  const waiting = s.digestOpen || s.rankUp !== null || s.tradeSheetOpen || eventOpen || pending;
  // a close the player was away for waits in Messages (its notice opens it); it never pops up on connect
  return latest.offline || latest.day <= seen || waiting ? null : latest;
}

/** Whether a close card is on screen now (the coach waits behind it). */
export function useCloseCardShowing(): boolean {
  const eventOpen = useEventPanel((s) => s.open);
  return useGame((s) => shownClose(s, eventOpen) !== null);
}

export function CloseCard() {
  const eventOpen = useEventPanel((s) => s.open);
  const card = useGame((s) => shownClose(s, eventOpen));
  return card ? <CloseSheet key={card.day} card={card} /> : null;
}

/** The headline: the same direction rule as the Copy summary (closeMove), so a sub-dollar day reads flat in both. */
function headline(c: DailyClose): string {
  const move = closeMove(c.nwChange);
  return move === 'flat' ? t('close.head.flat') : t(`close.head.${move}`, { amount: money(Math.abs(c.nwChange)) });
}

/** The plain-text summary the Copy button puts on the clipboard: the card's descriptors, in the viewer's language. */
export function closeSummary(c: DailyClose): string {
  return c.lines.map((m) => tm(m)).join('\n');
}

function CloseSheet({ card }: { card: DailyClose }) {
  const dismiss = useGame((s) => s.dismissClose);
  const toast = useGame((s) => s.toast);
  const handle = useGame((s) => s.me?.player.handle ?? '');
  useLocale((s) => s.locale);
  const done = () => dismiss(card.day);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(closeSummary(card));
      toast({ tone: 'gain', text: t('close.copied') });
    } catch {
      toast({ tone: 'warn', text: t('close.copyFailed') });
    }
  };
  const solo = !!card.best && !!card.worst && card.best.assetId === card.worst.assetId;
  return (
    <OsSheet title={t('dayclose.title')} testId="close-card" onClose={done}>
      <div>
        <p className="label" data-testid="close-masthead">{t('close.day', { n: card.day + 1 })}</p>
        <p className="text-caption text-fg-muted" data-testid="close-player">{handle}</p>
      </div>
      <p className="font-serif text-[40px] leading-tight text-fg" data-testid="close-headline">{headline(card)}</p>
      <p className="num text-small text-fg-muted" data-testid="close-rates">
        <span className={toneText[tone(card.nwChangePct)]}>{signedPct(card.nwChangePct)}</span>
        <span className="mx-2">·</span>
        <span className={toneText[tone(card.gx.pct)]}>{t('close.gx', { pct: signedPct(card.gx.pct) })}</span>
      </p>

      {card.best ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <MoveCell label={t('close.best')} line={card.best} testId="close-best" note={solo ? t('close.onlyHolding') : undefined} />
          {!solo && card.worst && <MoveCell label={t('close.worst')} line={card.worst} testId="close-worst" />}
        </div>
      ) : (
        <p className="text-small text-fg-muted" data-testid="close-cashday">{t('close.cashDay', { gx: signedPct(card.gx.pct) })}</p>
      )}

      {card.sectors && (
        <p className="text-caption text-fg-muted" data-testid="close-sectors">
          {t('close.sectors', {
            best: sectorName(card.sectors.best.sector), bestPct: signedPct(card.sectors.best.pct),
            worst: sectorName(card.sectors.worst.sector), worstPct: signedPct(card.sectors.worst.pct),
          })}
        </p>
      )}

      {card.stories.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('close.stories')}>
          {card.stories.map((s) => (
            <div key={`${s.assetId}-${s.headline}`} className="rounded-md bg-ink-2 p-3" data-testid="close-story">
              <p className="font-serif text-[20px] leading-snug text-fg">{s.headline}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-fg-muted">
                <span className="num">{s.assetId}</span>
                {s.band !== 'done' && (
                  <span data-testid={`close-band-${s.band}`} title={t('close.band.hint')}>
                    <Chip className={BAND_CHIP[s.band]}>{t(`close.band.${s.band}`)}</Chip>
                  </span>
                )}
              </p>
            </div>
          ))}
        </section>
      )}

      {card.event && (
        <p className="text-small text-fg" data-testid="close-event">
          {card.event.phase === 'active'
            ? t('dayclose.event.active', { headline: card.event.headline })
            : t('dayclose.event.ended', { headline: card.event.headline, days: card.event.lastedDays ?? 0 })}
        </p>
      )}

      <section className="rounded-md border border-ink-3 p-3" data-testid="close-ghosts">
        <h3 className="label">{t('close.ghosts')}</h3>
        <ul className="mt-2 flex flex-col gap-1 text-small">
          <GhostRow label={t('close.ghost.basket')} value={card.ghosts.basket} />
          <GhostRow label={t('close.ghost.random')} value={card.ghosts.random} />
          <GhostRow label={t('close.ghost.momentum')} value={card.ghosts.momentum} />
          <GhostRow label={t('close.ghost.you')} value={card.ghosts.player} strong />
        </ul>
        <p className="mt-2 text-small text-fg-muted" data-testid="close-rank">
          {card.ghosts.percentile === null ? t('dayclose.noTrades') : t('dayclose.rank', { beaten: card.ghosts.beaten })}
        </p>
      </section>

      <div className="os-sheet-actions">
        <Button size="sm" variant="ghost" onClick={copy} testId="close-share">{t('close.copy')}</Button>
        <Button size="sm" variant="brass" className="ml-auto" onClick={done} testId="close-done">{t('close.done')}</Button>
      </div>
    </OsSheet>
  );
}

function MoveCell({ label, line, testId, note }: { label: string; line: MoveLine; testId: string; note?: string }) {
  return (
    <div className="rounded-md border border-ink-3 px-3 py-2" data-testid={testId}>
      <p className="label">{label}</p>
      <p className="num text-small text-fg">
        <span>{line.assetId}</span>{' '}
        <span className={toneText[tone(line.pct)]}>{signedPct(line.pct)}</span>
        <span className="mx-1 text-fg-muted">·</span>
        <span className={toneText[tone(line.usd)]}>{signedMoney(line.usd)}</span>
      </p>
      {note && <p className="text-caption text-fg-faint">{note}</p>}
    </div>
  );
}

function GhostRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={strong ? 'font-semibold text-fg' : 'text-fg-muted'}>{label}</span>
      <span className={`num ${strong ? 'font-semibold text-fg' : 'text-fg'}`}>{money(value)}</span>
    </li>
  );
}
