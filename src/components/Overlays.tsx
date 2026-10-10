'use client';

import { useMemo, useState } from 'react';
import { portfolio } from '@/engine';
import { money, price, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { assetDefOf, useGame } from '@/game/store';
import { Button, Card, Modal, Progress } from './ui';
import { usePhone } from './os/phoneStore';

/** While You Were Away (bible core loop step 6). */
export function DigestModal() {
  const open = useGame((s) => s.digestOpen);
  const close = useGame((s) => s.closeDigest);
  const me = useGame((s) => s.me);
  if (!me?.digest) return null;
  const d = me.digest;
  const change = me.netWorth.total - d.netWorthThen;
  const income = me.businesses.reduce((s, b) => s + b.incomePerDay, 0);
  return (
    <Modal open={open} onClose={close} title="While you were away" testId="digest">
      <div className="flex items-baseline justify-between">
        <span className="text-small text-fg-muted">Since {clockLabel(d.since, 720)}</span>
        <span className={`num text-title ${toneText[tone(change)]}`}>{signedMoney(change)}</span>
      </div>
      {income > 0 && <p className="mt-1 text-small text-fg-muted">Your businesses earn {money(income)} per game day. Away for more than 12 hours, they slow down unless you automate them.</p>}
      <ul className="mt-4 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
        {d.items.map((n) => (
          <li key={n.id} className="rounded-md border border-ink-3 px-3 py-2 text-small">
            <span className="num mr-2 text-caption text-fg-faint">{clockLabel(n.tick, 720)}</span>{n.text}
          </li>
        ))}
      </ul>
      <Button variant="brass" className="mt-4 w-full" onClick={close}>Back to the market</Button>
    </Modal>
  );
}

/**
 * First-session coach (DESIGN §6b), one sentence per prompt, everything skippable, nothing
 * scripted: the first news card points at the biggest real move on a stock; after the first fill
 * it points at businesses; when the first position is down 1% the stop-loss explainer appears and
 * only pre-fills the ticket.
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
  const screen = useGame((s) => s.screen) as string;
  const sheetOpen = useGame((s) => s.tradeSheetOpen);
  // The Recent sheet on the phone sits over everything but the status bar: the tip waits for it to close.
  const recentOpen = usePhone((s) => s.recentOpen);
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
    card = {
      key: 1, title: firstNews.tag, body: firstNews.text,
      action: { label: `Look at ${firstNews.assetId}`, run: () => { select(firstNews.assetId!); setScreen('market'); void advance(1); } },
    };
  } else if (step < 2 && trades > 0) {
    card = {
      key: 2, title: 'First trade done', body: 'Trading is half the game. Businesses earn every tick, even while you sleep: a street food cart pays for itself in about a real day, and keeps paying.',
      action: { label: 'Open the Empire', run: () => { setScreen('empire'); void advance(2); } },
    };
  } else if (step < 3 && losing) {
    const stop = Math.round(losing.avgCost * 0.95 * 100) / 100;
    card = {
      key: 3, title: 'Protect the downside', body: `${losing.assetId} is down ${signedPct(losing.unrealizedPct)} since you bought. A stop-loss sells it for you if it falls to a price you choose.`,
      action: { label: `Set stop at ${price(stop)}`, run: () => { preset({ side: 'sell', type: 'stop', qty: losing.qty, stopPrice: stop }); void advance(3); } },
    };
  } else if (step >= 2 && bizCount > 0 && step < 4) {
    card = {
      key: 4, title: 'You’re in business', body: 'Check your three hourly contracts in Profile for quick rewards, and watch your rival in the top bar. Reach $20k to become a Hustler.',
      action: { label: 'Got it', run: () => { void advance(4, { done: true }); } },
    };
  }
  if (!card || hidden === card.key || sheetOpen || recentOpen || !['market', 'portfolio', 'empire'].includes(screen)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--tabbar-h)+84px)] z-30 flex justify-center md:inset-x-auto md:bottom-14 md:left-[calc(var(--rail-w)+24px)] md:justify-start" data-testid="coach">
      <Card className="pointer-events-auto w-full max-w-md border-brass/50 p-4 shadow-sheet">
        <div className="label text-brass">{card.title}</div>
        <p className="mt-1 text-small text-fg">{card.body}</p>
        <div className="mt-3 flex items-center gap-2">
          {card.action && <Button size="sm" variant="brass" onClick={card.action.run} testId="coach-action">{card.action.label}</Button>}
          <Button size="sm" variant="ghost" onClick={() => setHidden(card!.key)}>Not now</Button>
          <button type="button" className="ml-auto text-caption text-fg-faint hover:text-fg-muted" onClick={() => act({ type: 'onboarding', step: 9, skipped: true, done: true }, { silent: true })}>Skip tips</button>
        </div>
      </Card>
    </div>
  );
}

export function ConnectionBanner() {
  const status = useGame((s) => s.status);
  if (status !== 'offline') return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[80] bg-warn/90 px-4 py-1.5 text-center text-small text-on-brass" role="status">
      Connection lost. Reconnecting to the world…
    </div>
  );
}

export function RankProgressMini() {
  const me = useGame((s) => s.me);
  if (!me) return null;
  return <Progress value={me.rank.progress} />;
}
