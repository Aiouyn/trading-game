'use client';

// The rank-up ceremony as an OS update (velvet-desktop-os.md "Ceremony", P2-200..P2-209): the desktop dims,
// INSTALLING with a progress hairline, the rank name rises, three cards, then Keep going. About five seconds.
// It waits for no pending order, 10 s idle and no world takeover (P2-201), and never plays over another
// full-screen moment (P2-209). It is skippable after one second by a tap or Esc (C-31). Reduced motion shows
// the last beat at once (P2-206). Only the player's own rank-up plays it (P2-207): the store's rankUp is theirs.
import { type ReactNode, useEffect, useState } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { compactMoney, money } from '@/game/format';
import { RANKS } from '@/content/lifestyle';
import { alsoRanks, ceremonyBeat, ceremonyMayStart } from '@/shell/ceremony';
import { rankOrdinal } from '@/shell/ctx';
import { idleMs, listenActivity } from './idle';

/** The ceremony for the player's own rank-up. The listener for idle time runs whenever the shell is up. */
export function OsUpdate() {
  const rankUp = useGame((s) => s.rankUp);
  const from = useGame((s) => s.rankUpFrom);
  useEffect(() => listenActivity(), []);
  if (rankUp === null) return null;
  return <Ceremony key={rankUp} rankId={rankUp} from={from} />;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function Ceremony({ rankId, from }: { rankId: string; from: string | null }) {
  const pending = useGame((s) => (s.me?.orders ?? []).some((o) => o.status === 'open'));
  const nw = useGame((s) => s.me?.netWorth.total ?? 0);
  const [reduced] = useState(reducedMotion);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // The calm moment (P2-201): checked every quarter second until the gate opens.
  useEffect(() => {
    if (startedAt !== null) return;
    const check = () => {
      if (ceremonyMayStart({ pendingOrder: pending, idleMs: idleMs(), worldTakeover: false })) setStartedAt(Date.now());
    };
    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, [startedAt, pending]);

  // The beats run on a 100 ms step while the ceremony is on screen.
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const beat = ceremonyBeat(elapsed, reduced);
  const skippable = beat.skippable;

  // Esc skips once the skip has opened (C-31). Before then it does nothing.
  useEffect(() => {
    if (!skippable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useGame.getState().closeRankUp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skippable]);

  if (startedAt === null) return null;

  const r = RANKS.find((x) => x.id === rankId) ?? RANKS[0]!;
  const idx = rankOrdinal(rankId);
  const next = RANKS[idx + 1];
  const close = () => useGame.getState().closeRankUp();
  // A multi-rank update names the ranks it also passed on card 1, in fg-muted (P2-204).
  const also = alsoRanks(from, rankId).map((id) => RANKS.find((x) => x.id === id)?.name ?? id);
  const cards: ReactNode[] = [
    <>
      {t(`ceremony.hw.${rankId}`)}
      {also.length > 0 && <span className="mt-2 block text-fg-muted">{t('ceremony.also', { rank: also.join(' · ') })}</span>}
    </>,
    // the first unlock of the rank (rank.unlocks.<id> joins them with ' · ')
    t(`rank.unlocks.${rankId}`).split(' · ')[0] ?? '',
    next ? t('ceremony.next', { name: next.name, amount: compactMoney(next.threshold) }) : t('ceremony.top'),
  ];

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label={t('ceremony.label')}
      data-testid="os-update"
      data-beat={beat.done ? 'done' : beat.installing ? 'install' : 'start'}
    >
      <div className="absolute inset-0" aria-hidden style={{ background: `color-mix(in srgb, var(--color-ink-0) ${Math.round(beat.dim * 100)}%, transparent)` }} />
      {skippable && (
        <button type="button" className="absolute inset-0 cursor-pointer" aria-label={t('ceremony.skip')} data-testid="os-update-skip" onClick={close} />
      )}
      <div className="pointer-events-none relative flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        {beat.installing && (
          <>
            <div className="label text-brass" data-testid="os-update-label">{t('ceremony.installing')}</div>
            <div className="num text-small text-fg-muted">{t('ceremony.release', { n: idx, rank: r.name })}</div>
            <div className="absolute top-0 left-0 h-px bg-brass" style={{ width: `${Math.round(beat.progress * 100)}%` }} aria-hidden />
          </>
        )}
        <h2
          data-testid="rankup-name"
          className={`mt-2 font-serif text-[56px] leading-none text-fg transition-all duration-[420ms] md:text-[72px] ${beat.rankShown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
        >
          {r.name}
        </h2>
        <div className={`flex items-center gap-3 transition-opacity duration-[420ms] ${beat.rankShown ? 'opacity-100' : 'opacity-0'}`}>
          <span className="num rounded-chip border border-brass/50 px-2 text-small text-brass">{r.id} · {r.name}</span>
          <span className="num text-small text-fg-muted">{money(nw)}</span>
        </div>
        <div className="mt-4 grid w-full max-w-xl gap-2 sm:grid-cols-3">
          {cards.map((text, i) => (
            <div
              key={i}
              data-testid={`rankup-card-${i + 1}`}
              className={`rounded-md border border-ink-3 bg-ink-1 p-3 text-small text-fg transition-all duration-[220ms] ${beat.cards > 0 ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              style={{ transitionDelay: `${i * 120}ms` }}
            >
              {text}
            </div>
          ))}
        </div>
        <button
          type="button"
          data-testid="rankup-keep-going"
          onClick={close}
          className={`btn-brass mt-6 h-11 px-6 text-body transition-opacity ${beat.keepGoing ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          {t('ceremony.keepGoing')}
        </button>
      </div>
    </div>
  );
}
