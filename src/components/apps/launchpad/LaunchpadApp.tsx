'use client';

// The Launchpad (Phase 5, lead-launchpad.md L7): player-made memecoins on a bonding curve. Five tabs (New, Trending, Graduated,
// Holdings, Create); a token's page opens from any row. Every number comes from the player view (`me.launchpad`), which the
// world builds; the view carries no other player's holdings and no token pages. The open token's page is read from the world
// (`loadLpPage`) on each tick, so it stays current and works for any token, whether or not it is still in a feed.
import { useEffect, useState } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, StatStrip, Tabs, Button } from '@/components/ui';
import { normalizeName } from '@/world/launchpad/moderate';
import type { LpPage } from '@/world/launchpad/view';
import { CreateTab } from './CreateTab';
import { FeedTab } from './FeedTab';
import { HoldingsTab } from './HoldingsTab';
import { DeskStrip, KingBanner, TradesBar } from './Board';
import { TokenPage } from './TokenPage';

type Tab = 'new' | 'trending' | 'graduated' | 'holdings' | 'create';

export function LaunchpadApp() {
  const me = useGame((s) => s.me);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const loadLpPage = useGame((s) => s.loadLpPage);
  const [tab, setTab] = useState<Tab>('new');
  const [open, setOpen] = useState<string | null>(null);
  // the open token's page as the world read it, with the ticker it is for (a page for another ticker is never shown)
  const [read, setRead] = useState<{ ticker: string; page: LpPage | null } | null>(null);
  // R-10-6: an action on the open page (a trade, a reply, a promotion, a case) reads the page again at once, not at the next tick
  const [reread, setReread] = useState(0);
  // the dollars a feed card spends on one click (pump.fun's preset). It stays while the player moves between feeds.
  const [quickBuy, setQuickBuy] = useState(50);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadLpPage(open).then((p) => { if (live) setRead({ ticker: open, page: p }); });
    return () => { live = false; };
  }, [open, tick, reread, loadLpPage]);
  const onChanged = () => setReread((n) => n + 1);
  if (!me) return null;
  const lp = me.launchpad;
  const shown = open !== null && read?.ticker === open ? read : null;
  const page = shown?.page ?? null;
  const missing = open !== null && shown !== null && page === null;
  const holdingsValue = lp.holdings.reduce((a, h) => a + h.value, 0);
  const fees = lp.console.reduce((a, c) => a + c.fees, 0);
  const takenNames = takenNamesOf([...lp.feeds.newest, ...lp.feeds.trending, ...lp.feeds.graduated, ...lp.holdings, ...lp.console]);
  const openToken = (ticker: string) => setOpen(ticker);

  return (
    <div className="flex flex-col gap-4" data-testid="launchpad-view">
      {page ? (
        <TokenPage
          page={page}
          held={lp.holdings.find((h) => h.ticker === page.ticker)?.qty ?? 0}
          locked={lp.holdings.find((h) => h.ticker === page.ticker)?.locked ?? 0}
          isCreator={page.creatorHandle !== null && page.creatorHandle === me.player.handle}
          tick={tick}
          onBack={() => setOpen(null)}
          onOpen={openToken}
          onChanged={onChanged}
        />
      ) : (
        <>
          {missing && (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4" >
              <p className="text-small text-fg-muted" data-testid="lp-missing">{t('lp.page.missing', { ticker: open ?? '' })}</p>
              <Button size="sm" variant="outline" testId="lp-back" onClick={() => setOpen(null)}>{t('lp.back')}</Button>
            </Card>
          )}
          <StatStrip
            testId="lp-stats"
            intro={t('lp.app.intro')}
            items={[
              { label: t('lp.app.stat.live'), value: `${lp.live.count} / ${lp.live.max}`, testId: 'lp-stat-live' },
              { label: t('lp.app.stat.holdings'), value: money(holdingsValue), testId: 'lp-stat-holdings' },
              { label: t('lp.app.stat.fees'), value: money(fees), testId: 'lp-stat-fees' },
            ]}
          />
          {tab !== 'holdings' && tab !== 'create' && <DeskStrip rows={lp.desks ?? []} />}
          {tab !== 'holdings' && tab !== 'create' && <TradesBar rows={lp.bar} tick={tick} onOpen={openToken} />}
          {tab === 'new' && <KingBanner king={lp.king} tick={tick} onOpen={openToken} />}
          {/* no wrap: the row scrolls with its fade cue, so the last tab never sits alone on a second line on a phone (review item 11) */}
          <Tabs<Tab>
            tabs={[
              { id: 'new', label: t('lp.tab.new') },
              { id: 'trending', label: t('lp.tab.trending') },
              { id: 'graduated', label: t('lp.tab.graduated') },
              { id: 'holdings', label: t('lp.tab.holdings'), badge: lp.holdings.length },
              { id: 'create', label: t('lp.tab.create') },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'new' && <FeedTab rows={lp.feeds.newest} kind="new" tick={tick} onOpen={openToken} onTab={setTab} quickBuy={quickBuy} onQuickBuy={setQuickBuy} />}
          {tab === 'trending' && <FeedTab rows={lp.feeds.trending} kind="trending" tick={tick} onOpen={openToken} onTab={setTab} quickBuy={quickBuy} onQuickBuy={setQuickBuy} />}
          {tab === 'graduated' && <FeedTab rows={lp.feeds.graduated} kind="graduated" tick={tick} onOpen={openToken} onTab={setTab} />}
          {tab === 'holdings' && <HoldingsTab holdings={lp.holdings} console={lp.console} onOpen={openToken} onTab={setTab} />}
          {tab === 'create' && <CreateTab lp={lp} takenNames={takenNames} onOpen={openToken} />}
        </>
      )}
    </div>
  );
}

/** The normalised names this viewer can see (the feeds, holdings and console), for the Create form's live check. The world checks all. */
function takenNamesOf(cards: { name: string }[]): Set<string> {
  const out = new Set<string>();
  for (const c of cards) out.add(normalizeName(c.name).joined);
  return out;
}
