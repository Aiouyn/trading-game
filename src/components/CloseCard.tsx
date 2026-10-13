'use client';

// THE PORT AVALON CLOSE (velvet-daily-close.md, Phase 3 B1): the player's front page at each game-day close. The card
// is built from the stored facts the server sends (DailyClose, computed by src/world/close.ts): nothing is worked out
// here. UX stage 2: the close is no longer a sheet over the desktop. CloseAnnouncer raises one non-blocking toast (a
// click opens the Wire), the notification center keeps it, and the Wire shows the latest close at its top (CloseBrief).
// The announcement waits behind the digest, a rank-up, the trade ticket, the event panel and any pending order.
import { useEffect, useRef } from 'react';
import { sectorLabel } from '@/game/sectorLabel';
import { money, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { useGame, type GameStore } from '@/game/store';
import { t, tm, useLocale } from '@/i18n';
import type { DailyClose, MoveLine } from '@/world/ledger-types';
import { useEventPanel } from './os/EventBanner';
import { focusOrOpen } from './os/shellStore';
import { isPhoneViewport, phoneOpen } from './os/phoneStore';
import { Button, Chip } from './ui';

const BAND_CHIP: Record<'early' | 'mid' | 'late', string> = {
  early: 'border-brass/60 text-brass-hi',
  mid: 'border-info/50 text-info',
  late: 'border-ink-3 text-fg-muted',
};

/**
 * The card the player should see now: the close they asked for (Messages, the closes list), else the latest close not yet
 * seen, once nothing is in the way. The seen day is the server's (closeSeenDay) or this session's dismissal, whichever is later.
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
  // While You Were Away waits its turn (it marks the latest close seen when it closes), and the rank-up always goes first
  const waiting = s.digestOpen || s.rankUp !== null || s.tradeSheetOpen || eventOpen || pending;
  // a close the player was away for waits in Messages (its notice opens it); it never pops up on connect
  return latest.offline || latest.day <= seen || waiting ? null : latest;
}

/** The headline: trading alone (the same direction rule as the Copy summary, so a sub-dollar day reads flat in both). */
function headline(c: DailyClose): string {
  return tm(c.lines.find((m) => m.key.startsWith('txt.narr.head.')));
}

/** The rank line: the narrator's ranking or no-trades line from the close's descriptors. */
function rankLine(c: DailyClose): string {
  return tm(c.lines.find((m) => m.key.startsWith('txt.narr.rank.') || m.key.startsWith('txt.narr.noTrades.')));
}

/**
 * Where the net worth change came from: trading first, then valuation, income and costs, the business tax (R-9-10, shown when the
 * player owns a business that day, at its bracket), and the grants left out. The rows sum to the change.
 */
function SplitRows({ card }: { card: DailyClose }) {
  const rows: { key: string; label: string; value: number; testId: string }[] = [
    { key: 'trading', label: t('close.split.trading'), value: card.trading, testId: 'close-split-trading' },
    { key: 'valuation', label: t('close.split.valuation'), value: card.valuation, testId: 'close-split-valuation' },
    { key: 'income', label: t('close.split.income'), value: card.income, testId: 'close-split-income' },
  ];
  if (card.biz && card.biz.businesses > 0) {
    rows.push({ key: 'tax', label: t('close.split.tax', { rate: Math.round(card.biz.rate * 100) }), value: card.tax, testId: 'close-split-tax' });
  }
  return (
    <section className="flex flex-col gap-1" aria-label={t('close.split.title')} data-testid="close-split">
      <p className="label">{t('close.split.title')}</p>
      <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-small">
        {rows.map((r) => (
          <div key={r.key} className="contents">
            <dt className="text-fg-muted">{r.label}</dt>
            <dd className={toneText[tone(r.value)]} data-testid={r.testId}>{signedMoney(r.value)}</dd>
          </div>
        ))}
        <div className="col-span-2 mt-1 border-t border-ink-2 pt-1 text-caption text-fg-muted">
          <span>{t('close.split.external')}: {signedMoney(card.external)}</span>
        </div>
        <div className="contents">
          <dt className="font-medium text-fg">{t('close.split.net')}</dt>
          <dd className={`font-medium ${toneText[tone(card.nwChange)]}`} data-testid="close-split-net">{signedMoney(card.nwChange)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** The plain-text summary the Copy button puts on the clipboard: the card's descriptors, in the viewer's language. */
export function closeSummary(c: DailyClose): string {
  return c.lines.map((m) => tm(m)).join('\n');
}

/**
 * Announces a close without blocking anything (UX stage 2): one toast, and the card is marked seen. The notification center
 * keeps the toast, and the Wire shows the card. A close the player asked for opens the Wire at once.
 */
export function CloseAnnouncer() {
  const eventOpen = useEventPanel((s) => s.open);
  const card = useGame((s) => shownClose(s, eventOpen));
  const askedDay = useGame((s) => s.closeOpen);
  const toast = useGame((s) => s.toast);
  const dismiss = useGame((s) => s.dismissClose);
  const announced = useRef<number | null>(null);
  const askedSeen = useRef<number | null>(null);
  useLocale((s) => s.locale);
  useEffect(() => {
    if (!card) return;
    // A close the player asked for opens the Wire once, and stays the one the Wire shows (closeOpen).
    if (askedDay === card.day) {
      if (askedSeen.current !== card.day) {
        askedSeen.current = card.day;
        // the phone draws its own stack (the desktop windows are not drawn there), so the Wire opens there
        if (isPhoneViewport()) phoneOpen('wire', {});
        else focusOrOpen('wire');
      }
      return;
    }
    askedSeen.current = null;
    if (announced.current === card.day) return;
    announced.current = card.day;
    toast({ tone: 'brass', kind: 'close', day: card.day, text: headline(card), app: 'wire' });
    dismiss(card.day);
  }, [card, askedDay, toast, dismiss]);
  return null;
}

/** The latest close as a block at the top of the Wire (UX stage 2): the same card, with no sheet and no Done button. */
export function CloseBrief() {
  // The close the player asked for (closeOpen) stays on top; otherwise the latest close.
  const card = useGame((s) => {
    const closes = s.me?.trading.closes ?? [];
    return closes.find((c) => c.day === s.closeOpen) ?? closes[0] ?? null;
  });
  useLocale((s) => s.locale);
  // The Wire shows the card, so its close notice is read: the notice leaves on screen, and the bell's unread mark clears.
  const cardDay = card?.day ?? null;
  const dismissMany = useGame((s) => s.dismissToasts);
  const markRead = useGame((s) => s.markCloseRead);
  useEffect(() => {
    const ids = useGame.getState().toasts.filter((x) => x.kind === 'close').map((x) => x.id);
    if (ids.length > 0) dismissMany(ids);
    if (cardDay !== null) markRead(cardDay);
  }, [cardDay, dismissMany, markRead]);
  if (!card) return null;
  return (
    <section className="rounded-md border border-ink-3 p-3" data-testid="close-card" aria-label={t('dayclose.title')}>
      <CloseBody card={card} />
    </section>
  );
}

function CloseBody({ card }: { card: DailyClose }) {
  const toast = useGame((s) => s.toast);
  const handle = useGame((s) => s.me?.player.handle ?? '');
  useLocale((s) => s.locale);
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
    <div className="flex flex-col gap-4">
      <div>
        <p className="label" data-testid="close-masthead">{t('close.day', { n: card.day + 1 })}</p>
        <p className="text-caption text-fg-muted" data-testid="close-player">{handle}</p>
      </div>
      <p className="font-serif text-[32px] leading-tight text-fg" data-testid="close-headline">{headline(card)}</p>
      <p className="num text-small text-fg-muted" data-testid="close-rates">
        <span className={toneText[tone(card.nwChangePct)]}>{signedPct(card.nwChangePct)}</span>
        <span className="mx-2">·</span>
        <span className={toneText[tone(card.gx.pct)]}>{t('close.gx', { pct: signedPct(card.gx.pct) })}</span>
      </p>

      <SplitRows card={card} />

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
            best: sectorLabel(card.sectors.best.sector), bestPct: signedPct(card.sectors.best.pct),
            worst: sectorLabel(card.sectors.worst.sector), worstPct: signedPct(card.sectors.worst.pct),
          })}
        </p>
      )}

      {card.stories.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('close.stories')}>
          {card.stories.map((s) => (
            <div key={`${s.assetId}-${s.headline}`} className="rounded-md bg-ink-2 p-3" data-testid="close-story">
              <p className="font-serif text-[20px] leading-snug text-fg">{tm(s.headlineMsg, s.headline)}</p>
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
          {tm(card.lines.find((m) => m.key.startsWith('txt.narr.event.')), card.event.headline)}
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
          {rankLine(card)}
        </p>
      </section>

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={copy} testId="close-share">{t('close.copy')}</Button>
      </div>
    </div>
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
