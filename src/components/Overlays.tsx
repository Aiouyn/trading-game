'use client';

import { useMemo, useState } from 'react';
import { portfolio } from '@/engine';
import { money, price, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { assetDefOf, useGame } from '@/game/store';
import { useIsPhone } from '@/game/useMedia';
import { t } from '@/i18n';
import { OsSheet } from './os/OsSheet';
import { useShell } from './os/shellStore';
import { usePhone } from './os/phoneStore';
import { useCloseCardShowing } from './CloseCard';
import { Button, Progress } from './ui';

/**
 * While You Were Away (bible core loop step 6). A sheet over the desktop, not a page overlay: the strip,
 * the shelf and the windows stay in view (P2-069). On the phone it rises as a bottom sheet.
 */
export function DigestModal() {
  const open = useGame((s) => s.digestOpen);
  const close = useGame((s) => s.closeDigest);
  const me = useGame((s) => s.me);
  if (!open || !me?.digest) return null;
  const d = me.digest;
  const change = me.netWorth.total - d.netWorthThen;
  const income = me.businesses.reduce((s, b) => s + b.incomePerDay, 0);
  return (
    <OsSheet title={t('digest.title')} testId="digest" onClose={close}>
      <div className="flex items-baseline justify-between">
        <span className="text-small text-fg-muted">{t('digest.since', { time: clockLabel(d.since, 720) })}</span>
        <span className={`num text-title ${toneText[tone(change)]}`}>{signedMoney(change)}</span>
      </div>
      {income > 0 && <p className="text-small text-fg-muted">{t('digest.income', { amount: money(income) })}</p>}
      <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
        {d.items.map((n) => (
          <li key={n.id} className="rounded-md border border-ink-3 px-3 py-2 text-small">
            <span className="num mr-2 text-caption text-fg-faint">{clockLabel(n.tick, 720)}</span>{n.text}
          </li>
        ))}
      </ul>
      <Button variant="brass" className="w-full" onClick={close}>{t('digest.close')}</Button>
    </OsSheet>
  );
}

/** The phone apps the coach may sit over: Broker, Portfolio and Businesses (the old market, portfolio and empire screens). */
const COACH_PHONE_APPS: ReadonlySet<string> = new Set(['broker', 'portfolio', 'businesses']);

/**
 * First-session coach (DESIGN §6b), one sentence per prompt, everything skippable, nothing
 * scripted: the first news card points at the biggest real move on a stock; after the first fill
 * it points at businesses; when the first position is down 1% the stop-loss explainer appears and
 * only pre-fills the ticket. It is a sheet on the desktop, and the actions open the window they name.
 */
export function Coach() {
  const me = useGame((s) => s.me);
  const wire = useGame((s) => s.wire);
  const world = useGame((s) => s.world);
  const playerId = useGame((s) => s.playerId);
  const select = useGame((s) => s.select);
  const setScreen = useGame((s) => s.setScreen);
  const preset = useGame((s) => s.presetTicket);
  const act = useGame((s) => s.act);
  const [hidden, setHidden] = useState<number | null>(null);
  // A close card is a sheet too: the tip waits behind it (one sheet at a time, the card first).
  const closeUp = useCloseCardShowing();
  // The Recent sheet on the phone sits over everything but the status bar: the tip waits for it to close.
  const recentOpen = usePhone((s) => s.recentOpen);
  // The tip waits while a trade ticket is open (the old gate). On the phone it shows only over the three apps
  // it talks about (the old screen gate): a full-width sheet over home or Chat would cover their tiles and inputs.
  // Over the desktop it never blocks the shelf: the sheet sits above it.
  const sheetOpen = useGame((s) => s.tradeSheetOpen);
  const phone = useIsPhone();
  // Interim (UX redesign 1.1, principle 6): on the desktop a tip sheet over an open Broker would sit on the ticket's CTA, so
  // the tips wait until no Broker window is open. Stage 2 turns them into toasts and notification-center items.
  const brokerOpen = useShell((s) => s.shell.wins.some((w) => w.app === 'broker' && w.state === 'open'));
  const phoneApp = usePhone((s) => s.current);
  const step = me?.player.onboarding.step ?? 0;
  const done = me?.player.onboarding.done || me?.player.onboarding.skipped;
  const trades = me?.player.stats.trades ?? 0;
  const bizCount = me?.businesses.length ?? 0;

  const firstNews = useMemo(() => wire.find((w) => (w.kind === 'move' || w.kind === 'earnings') && w.assetId && assetDefOf(w.assetId)?.assetClass === 'stock'), [wire]);
  const losing = useMemo(() => {
    if (!world || !playerId || !me?.account) return null;
    const pf = portfolio(world, playerId);
    return pf.positions.find((p) => p.qty > 0 && p.unrealizedPct <= -0.01) ?? null;
  }, [world, playerId, me?.account]);

  if (!me || done) return null;
  const advance = (s: number, extra: { done?: boolean } = {}) => act({ type: 'onboarding', step: s, ...extra }, { silent: true });

  let card: { key: number; title: string; body: string; action?: { label: string; run: () => void } } | null = null;
  if (step < 1 && firstNews) {
    const ticker = firstNews.assetId ?? '';
    card = {
      key: 1, title: firstNews.tag, body: firstNews.text,
      action: { label: t('coach.look', { ticker }), run: () => { select(ticker); setScreen('market'); void advance(1); } },
    };
  } else if (step < 2 && trades > 0) {
    card = {
      key: 2, title: t('coach.tradeDone.title'), body: t('coach.tradeDone.body'),
      action: { label: t('coach.tradeDone.action'), run: () => { setScreen('empire'); void advance(2); } },
    };
  } else if (step < 3 && losing) {
    const stop = Math.round(losing.avgCost * 0.95 * 100) / 100;
    card = {
      key: 3, title: t('coach.protect.title'), body: t('coach.protect.body', { ticker: losing.assetId, pct: signedPct(losing.unrealizedPct) }),
      action: { label: t('coach.protect.action', { price: price(stop) }), run: () => { preset({ side: 'sell', type: 'stop', qty: losing.qty, stopPrice: stop }); void advance(3); } },
    };
  } else if (step >= 2 && bizCount > 0 && step < 4) {
    card = {
      key: 4, title: t('coach.business.title'),
      body: t('coach.business.body', { amount: t('coach.business.amount'), rank: t('rank.R1') }),
      action: { label: t('coach.gotIt'), run: () => { void advance(4, { done: true }); } },
    };
  }
  // The first-run desktop opens the Broker maximized (UX redesign 1.1): no tip card over it before the first trade. The
  // coach resumes after the first fill, on the desktop as before.
  const firstRunDesktop = !phone && trades === 0;
  const overBroker = !phone && brokerOpen;
  if (!card || hidden === card.key || recentOpen || sheetOpen || closeUp || firstRunDesktop || overBroker || (phone && !COACH_PHONE_APPS.has(phoneApp ?? ''))) return null;
  const c = card;
  return (
    <OsSheet title={c.title} testId="coach" onClose={() => setHidden(c.key)}>
      <p className="text-small text-fg">{c.body}</p>
      <div className="os-sheet-actions">
        {c.action && <Button size="sm" variant="brass" onClick={c.action.run} testId="coach-action">{c.action.label}</Button>}
        <Button size="sm" variant="ghost" onClick={() => setHidden(c.key)}>{t('coach.notNow')}</Button>
        <button
          type="button"
          className="ml-auto text-caption text-fg-faint hover:text-fg-muted"
          onClick={() => act({ type: 'onboarding', step: 9, skipped: true, done: true }, { silent: true })}
        >
          {t('coach.skip')}
        </button>
      </div>
    </OsSheet>
  );
}

export function ConnectionBanner() {
  const status = useGame((s) => s.status);
  if (status !== 'offline') return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[80] bg-warn/90 px-4 py-1.5 text-center text-small text-on-brass" role="status">
      {t('common.offline')}
    </div>
  );
}

export function RankProgressMini() {
  const me = useGame((s) => s.me);
  if (!me) return null;
  return <Progress value={me.rank.progress} />;
}
