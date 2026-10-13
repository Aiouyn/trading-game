'use client';

// Desktop prompts that never block (UX stage 2, principle 6): While You Were Away and the first-session coach are
// announced as toasts, and their detail goes to the notification center behind the bell. Nothing here draws a sheet
// over the trade surface. The phone keeps its own rules (the coach only over the apps it talks about).
import { useEffect, useMemo, useRef } from 'react';
import { portfolio } from '@/engine';
import { price, signedMoney, signedPct } from '@/game/format';
import { assetDefOf, useGame } from '@/game/store';
import { useIsPhone } from '@/game/useMedia';
import { t, tm } from '@/i18n';
import { wireTagMsg } from '@/world/text/wireTags';
import { usePhone } from './os/phoneStore';
import { Progress } from './ui';

/**
 * While You Were Away (bible core loop step 6). Announced as one toast; its items go to the notification center. The Wire
 * keeps the close card, so nothing the digest says is lost when the toast leaves.
 */
export function DigestAnnouncer() {
  const open = useGame((s) => s.digestOpen);
  const close = useGame((s) => s.closeDigest);
  const notify = useGame((s) => s.notify);
  const toast = useGame((s) => s.toast);
  const me = useGame((s) => s.me);
  const digest = me?.digest;
  useEffect(() => {
    if (!open || !digest || !me) return;
    const change = me.netWorth.total - digest.netWorthThen;
    toast({ tone: change < 0 ? 'loss' : 'info', kind: 'other', text: `${t('digest.title')}: ${signedMoney(change)}`, app: 'wire' });
    notify(digest.items.map((n) => ({ tone: 'info' as const, text: tm(n.msg, n.text) })));
    close();
    // the digest is announced once per open; the store clears digestOpen in closeDigest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return null;
}

/** The phone apps the coach may talk about: Broker, Portfolio and Businesses (the old market, portfolio and empire screens). */
const COACH_PHONE_APPS: ReadonlySet<string> = new Set(['broker', 'portfolio', 'businesses']);

/**
 * First-session coach (DESIGN §6b), one sentence per prompt, everything skippable, nothing scripted: the first news card
 * points at the biggest real move on a stock; after the first fill it points at businesses; when the first position is
 * down 1% the stop-loss explainer appears and only pre-fills the ticket. UX stage 2: each tip is a toast whose click
 * performs its action, and the tip waits in the notification center. No tip before the first trade on the desktop, so the
 * first-run Broker stays clear.
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
  const toast = useGame((s) => s.toast);
  const phone = useIsPhone();
  const recentOpen = usePhone((s) => s.recentOpen);
  const phoneApp = usePhone((s) => s.current);
  const emitted = useRef<number | null>(null);
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

  const advance = (s: number, extra: { done?: boolean } = {}) => act({ type: 'onboarding', step: s, ...extra }, { silent: true });

  let card: { key: number; title: string; body: string; action?: { label: string; run: () => void } } | null = null;
  if (me && !done) {
    if (step < 1 && firstNews) {
      const ticker = firstNews.assetId ?? '';
      card = {
        key: 1, title: tm(wireTagMsg(firstNews.tag), firstNews.tag), body: tm(firstNews.msg, firstNews.text),
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
  }
  // The first-run desktop keeps its Broker clear: no tip before the first trade. The phone shows tips only over the apps they name.
  const firstRunDesktop = !phone && trades === 0;
  const gated = !card || recentOpen || firstRunDesktop || (phone && !COACH_PHONE_APPS.has(phoneApp ?? ''));
  const key = card?.key ?? null;
  const run = card?.action?.run;
  const title = card?.title ?? '';
  const body = card?.body ?? '';
  useEffect(() => {
    if (gated || key === null) return;
    if (emitted.current === key) return;
    emitted.current = key;
    toast({ tone: 'brass', kind: 'coach', text: `${title}. ${body}`, run });
    // The tip is announced once per step: the toast's click runs the action and the step advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated, key]);
  return null;
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
