'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card } from '@/components/ui';
import type { ComebackPerk } from '@/world/types';
import type { ComebackView } from '@/world/comeback';
import { refusalText, useComeback, type SponsorCardState } from './state';

/** The lead's timings (velvet-rewarded-ads.md): a 15-second card, skippable after 5 s; the chapter hold is 1.2 s. */
const WATCH_MS = 15_000;
const SKIP_MS = 5_000;
const HOLD_MS = 1_200;
const MOMENT_MS = 2_400;
/** a game day is 720 ticks (one real hour), and the chapter screen counts days from the start of the world */
const TPD = 720;
const dayOf = (tick: number) => Math.max(0, Math.floor((tick - 1) / TPD));

/**
 * The host of the comeback's full-screen pieces: the sponsor card (a modal over the app), the chapter screen (single column,
 * `ink-0`), and the two-second-and-a-bit new-chapter moment. Mounted once in the shell.
 */
export function ComebackHost() {
  return (
    <>
      <SponsorBreak />
      <ChapterScreen />
      <NewChapterMoment />
    </>
  );
}

// ---------------------------------------------------------------- the sponsor card

/**
 * The sponsor card: a fictional brand, a 15-second run, a skip after 5 s (no reward), and the reward when it runs to the end.
 * The reward is granted by the world when the card is finished (`ad.finish`); the world checks the ticks, so a reload cannot
 * shorten the run. A card left open by a reload is picked up from the world's pending break.
 */
export function SponsorBreak() {
  const card = useComeback((s) => s.card);
  const setCard = useComeback((s) => s.setCard);
  const pending = useGame((s) => s.me?.comeback?.ad.pending ?? null);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const tickMs = useGame((s) => s.tickMs);
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef(false);
  const retryAt = useRef(0);
  const doneId = useRef<string | null>(null);

  // a break the world holds but this device does not show (a reload): it opens at the time already run
  useEffect(() => {
    if (card || !pending || doneId.current === pending.id) return;
    const ran = Math.max(0, (tick - pending.startTick) * (tickMs || 5000));
    setCard({ id: pending.id, brand: pending.brand, opened: Date.now() - ran });
  }, [card, pending, tick, tickMs, setCard]);

  useEffect(() => {
    if (!card) return;
    sent.current = false;
    const h = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(h);
  }, [card]);

  const elapsed = card ? Math.max(0, now - card.opened) : 0;

  const finish = async (c: SponsorCardState, skip: boolean) => {
    if (sent.current || Date.now() < retryAt.current) return;
    sent.current = true;
    const r = await act({ type: 'ad.finish', id: c.id, skip }, { silent: true });
    if (!r.ok && r.error === 'adTooSoon') {
      // the world has not counted the run yet (a tick lags the card): keep the card and try again in a second
      sent.current = false;
      retryAt.current = Date.now() + 1000;
      return;
    }
    doneId.current = c.id;
    setCard(null);
    if (!r.ok) {
      toast({ tone: 'warn', text: refusalText('ad.refusal', r.error ?? 'adNoBreak') });
      return;
    }
    const reward = (r.data as { reward?: number } | undefined)?.reward ?? 0;
    if (reward > 0) toast({ tone: 'gain', text: t('ad.toast.added', { amount: reward }) });
    else toast({ tone: 'info', text: t('ad.toast.none') });
  };

  useEffect(() => {
    if (!card || elapsed < WATCH_MS) return;
    void finish(card, false);
    // finish is re-made each render; the guard above keeps one request in flight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, elapsed]);

  if (!card) return null;
  const skipOpen = elapsed >= SKIP_MS;
  const sec = Math.min(15, Math.floor(elapsed / 1000));
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-0/90 p-4" data-testid="sponsor-break" role="dialog" aria-modal="true" aria-label={t('sponsor.card.label')}>
      <Card className="w-full max-w-[420px] p-5">
        <div className="label">{t('sponsor.card.label')}</div>
        <h2 className="mt-1 font-serif text-title text-fg" data-testid="sponsor-brand">{t(`sponsor.brand.${card.brand}.name`)}</h2>
        <p className="mt-1 text-small text-fg-muted">{t(`sponsor.brand.${card.brand}.line`)}</p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-3" aria-hidden="true">
          <div className="h-full bg-brass transition-[width] duration-200" style={{ width: `${Math.min(100, (elapsed / WATCH_MS) * 100)}%` }} data-testid="sponsor-progress" />
        </div>
        <div className="mt-2 flex items-center justify-between text-caption text-fg-faint">
          <span className="num" data-testid="sponsor-timer">{t('sponsor.card.watching', { s: sec })}</span>
          <span>{t('sponsor.card.reward', { amount: 250 })}</span>
        </div>
        <p className="mt-3 text-caption text-fg-faint">{t('sponsor.card.note')}</p>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" disabled={!skipOpen} onClick={() => void finish(card, true)} testId="sponsor-skip">
            {skipOpen ? t('sponsor.card.skip') : t('sponsor.card.skipIn', { s: Math.ceil((SKIP_MS - elapsed) / 1000) })}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- the chapter screen

/**
 * The chapter screen (velvet-bankruptcy.md section 3): opens from the low-cash card, or by itself on a forced close (the
 * clearing house closed the account). The label, the three numbers, what happened, kept and goes, the perk choice, the rules,
 * and the hold to confirm. The chapter's losses and the perk are private.
 */
export function ChapterScreen() {
  const cb = useGame((s) => s.me?.comeback ?? null);
  const open = useComeback((s) => s.chapterOpen);
  const forcedLeft = useComeback((s) => s.forcedLeft);
  if (!cb) return null;
  const forced = !!cb.bust && cb.bust.tick !== forcedLeft;
  const closing = !!cb.closing;
  if (!open && !forced && !closing) return null;
  return <ChapterBody cb={cb} forced={forced} />;
}

function ChapterBody({ cb, forced }: { cb: ComebackView; forced: boolean }) {
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const closeChapter = useComeback((s) => s.closeChapter);
  const leaveForced = useComeback((s) => s.leaveForced);
  const setMoment = useComeback((s) => s.setMoment);
  const perks = cb.perks.filter((p) => p.available);
  const [perk, setPerk] = useState<ComebackPerk>(perks[0]?.id ?? 'lessons');
  const closing = !!cb.closing;
  const n = cb.chapter + 1;
  const days = dayOf(tick) - dayOf(cb.chapterStartTick);

  const confirm = async () => {
    const r = await act({ type: 'comeback.confirm', perk }, { silent: true });
    if (!r.ok) {
      toast({ tone: 'warn', text: refusalText('comeback.refusal', r.error ?? 'comebackNotLow') });
      return;
    }
    closeChapter();
    setMoment({ chapter: n, amount: 5000 });
  };

  const leave = () => {
    if (forced && cb.bust) leaveForced(cb.bust.tick);
    else closeChapter();
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-ink-0" data-testid="chapter-screen" role="dialog" aria-modal="true" aria-label={t('chapter.closed')}>
      <div className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-2">
          <div className="label" data-testid="chapter-label">{t('chapter.label', { n: cb.chapter, from: dayOf(cb.chapterStartTick), to: dayOf(tick) })}</div>
          {forced && <p className="text-small text-warn" data-testid="chapter-forced">{t('chapter.forced')}</p>}
          <h1 className="font-serif text-hero text-fg">{t('chapter.closed')}</h1>
          <dl className="grid grid-cols-3 gap-3 pt-2 text-small">
            <div><dt className="label">{t('chapter.peak')}</dt><dd className="num text-fg" data-testid="chapter-peak">{money(cb.peak)}</dd></div>
            <div><dt className="label">{t('chapter.end')}</dt><dd className="num text-fg" data-testid="chapter-end">{money(cb.netWorth)}</dd></div>
            <div><dt className="label">{t('chapter.days')}</dt><dd className="num text-fg" data-testid="chapter-days">{days}</dd></div>
          </dl>
        </div>

        <section className="flex flex-col gap-2" data-testid="chapter-losses">
          <h2 className="label">{t('chapter.what')}</h2>
          {cb.losses.length === 0 ? (
            <p className="text-small text-fg-faint">{t('chapter.noLosses')}</p>
          ) : (
            <ul className="flex flex-col">
              {cb.losses.map((l, i) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-ink-2 py-2 text-small" data-testid={`chapter-loss-${i + 1}`}>
                  <span className="text-fg-muted">{l.assetId}</span>
                  <span className="num text-loss">{money(l.pnl)}</span>
                  {l.line && <span className="w-full text-caption text-fg-faint" data-testid={`chapter-loss-line-${i + 1}`}>{t(l.line.key, l.line.vars)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid grid-cols-2 gap-4 text-small" data-testid="chapter-kept-goes">
          <div>
            <h2 className="label">{t('chapter.kept')}</h2>
            <p className="mt-1 text-fg-muted">{t('chapter.keptList')}</p>
          </div>
          <div>
            <h2 className="label">{t('chapter.goes')}</h2>
            <p className="mt-1 text-fg-muted">{t('chapter.goesList')}</p>
          </div>
        </section>

        {!closing && (
          <section className="flex flex-col gap-2" data-testid="chapter-perks">
            <h2 className="label">{t('chapter.pick')}</h2>
            <div className="grid gap-2">
              {perks.map((p) => {
                const picked = perk === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => setPerk(p.id)}
                    data-testid={`perk-${p.id}`}
                    className={`flex flex-col gap-0.5 rounded-md border px-4 py-3 text-left ${picked ? 'border-brass' : 'border-ink-3'}`}
                  >
                    <span className="text-fg">{t(`chapter.perk.${p.id}`)}</span>
                    <span className="text-caption text-fg-muted">{t(`chapter.perk.${p.id}Sub`)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <p className="text-caption text-fg-faint" data-testid="chapter-rules">{t('chapter.rules')}</p>

        {closing ? (
          <p className="text-small text-fg-muted" data-testid="chapter-closing">{t('chapter.closing')}</p>
        ) : (
          <HoldButton label={t('chapter.start', { n, amount: money(5000) })} onHold={confirm} testId="chapter-confirm" />
        )}
        <div className="flex justify-center">
          {!closing && <Button variant="outline" size="sm" onClick={leave} testId="chapter-back">{t('chapter.back')}</Button>}
        </div>
      </div>
    </div>
  );
}

/** Hold to confirm for 1.2 seconds. A short press does nothing, and releasing early resets the ring. */
function HoldButton({ label, onHold, testId }: { label: string; onHold: () => void; testId: string }) {
  const [p, setP] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef(0);
  const stop = () => { if (raf.current !== null) cancelAnimationFrame(raf.current); raf.current = null; };
  const tickFrame = (now: number) => {
    const e = (now - start.current) / HOLD_MS;
    if (e >= 1) { stop(); setP(0); onHold(); return; }
    setP(e);
    raf.current = requestAnimationFrame(tickFrame);
  };
  const down = () => { if (raf.current !== null) return; start.current = performance.now(); raf.current = requestAnimationFrame(tickFrame); };
  const up = () => { stop(); setP(0); };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(); };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => { if (e.key === ' ' || e.key === 'Enter') up(); };
  useEffect(() => () => stop(), []);
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        data-testid={testId}
        onPointerDown={(e: PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture?.(e.pointerId); down(); }}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className="relative w-full overflow-hidden rounded-md border border-brass bg-ink-1 px-4 py-3 text-fg"
        aria-label={label}
        data-progress={Math.round(p * 100)}
      >
        <span className="absolute inset-y-0 left-0 bg-brass/30" style={{ width: `${Math.round(p * 100)}%` }} aria-hidden="true" data-testid="hold-ring" />
        <span className="relative">{label}</span>
      </button>
      <span className="text-caption text-fg-faint">{t('chapter.holdHint')}</span>
    </div>
  );
}

// ---------------------------------------------------------------- the new chapter

/** The new chapter's moment (2.4 s): the old page leaves, the cash comes in serif, then the market. */
export function NewChapterMoment() {
  const moment = useComeback((s) => s.moment);
  const setMoment = useComeback((s) => s.setMoment);
  useEffect(() => {
    if (!moment) return;
    const h = setTimeout(() => setMoment(null), MOMENT_MS);
    return () => clearTimeout(h);
  }, [moment, setMoment]);
  if (!moment) return null;
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-ink-0 px-4 text-center" data-testid="chapter-new" role="status">
      <div className="label">{t('chapter.newLabel', { n: moment.chapter })}</div>
      <div className="font-serif text-hero text-fg num">{money(moment.amount)}</div>
      <p className="text-small text-fg-muted">{t('chapter.newLine')}</p>
    </div>
  );
}
