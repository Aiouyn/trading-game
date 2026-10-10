'use client';

import { useMemo, useState } from 'react';
import { sectorName } from '@/engine';
import { sparkline } from '@/game/history';
import { price, signedPct, tone, toneText } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, Flash, LockGlyph, Sparkline, TextField } from '@/components/ui';
import { seriesInfo } from './seriesInfo';

type UniverseTab = 'watch' | 'stock' | 'crypto' | 'commodity' | 'forex' | 'bond' | 'index';

const TABS: { id: UniverseTab; key: string }[] = [
  { id: 'watch', key: 'broker.tab.watch' },
  { id: 'stock', key: 'broker.tab.stock' },
  { id: 'crypto', key: 'broker.tab.crypto' },
  { id: 'commodity', key: 'broker.tab.commodity' },
  { id: 'forex', key: 'broker.tab.forex' },
  { id: 'bond', key: 'broker.tab.bond' },
  { id: 'index', key: 'broker.tab.index' },
];

/**
 * The universe browser: the watchlist and every listed asset and index, searchable by name, ticker or sector.
 * Ids come from the live config, so the lists follow the universe. A delisted name stays in the lists with a
 * Delisted tag and cannot be traded (its last price stays on the chart). Index rows show their member count
 * (indexMembers, as of the last review). Picking a row calls `onPick`, which opens that ticker in a Broker.
 */
export function Universe({ ticker, onPick }: { ticker: string; onPick: (id: string) => void }) {
  const world = useGame((s) => s.world)!;
  const me = useGame((s) => s.me)!;
  useGame((s) => s.historyRev);
  const act = useGame((s) => s.act);
  const config = useGame((s) => s.config);
  const [tab, setTab] = useState<UniverseTab>('watch');
  const [q, setQ] = useState('');
  const watch = me.player.watchlist;
  const ids = useMemo(() => {
    const indexIds = config.indices.map((i) => i.id);
    const assetIds = config.assets.map((a) => a.id);
    const all = [...indexIds, ...assetIds];
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      return all.filter((id) => {
        const d = config.assets.find((a) => a.id === id);
        const idx = config.indices.find((i) => i.id === id);
        return id.toLowerCase().includes(s) || d?.name.toLowerCase().includes(s) || idx?.name.toLowerCase().includes(s)
          || (d && sectorName(d.sector).toLowerCase().includes(s));
      });
    }
    if (tab === 'watch') return watch;
    if (tab === 'index') return indexIds;
    return config.assets.filter((a) => a.assetClass === tab).map((a) => a.id);
  }, [tab, q, watch, config]);
  const h = useGame.getState().history;
  return (
    <Card className="flex min-h-0 flex-col" data-testid="watchlist">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-title">{t('broker.markets')}</h2>
          <span className="num text-caption text-fg-faint">{ids.length}</span>
        </div>
        <TextField
          value={q} onChange={setQ} placeholder={t('broker.search', { n: config.indices.length + config.assets.length })}
          className="mt-3 h-9 w-full text-small" testId="asset-search"
        />
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {TABS.map(({ id, key }) => (
            <button
              key={id} type="button" onClick={() => { setTab(id); setQ(''); }}
              className={`shrink-0 rounded-sm px-2 py-1 text-caption ${tab === id && !q ? 'bg-ink-3 text-fg' : 'text-fg-faint hover:text-fg-muted'}`}
              data-testid={`uni-${id}`}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>
      {ids.length === 0 && tab === 'watch' && !q && <p className="px-4 py-4 text-small text-fg-faint" data-testid="watch-empty">{t('broker.watch.empty')}</p>}
      {ids.length === 0 && q.trim() !== '' && <p className="px-4 py-4 text-small text-fg-faint" data-testid="search-none">{t('broker.search.none')}</p>}
      {ids.length === 0 && tab !== 'watch' && q.trim() === '' && <p className="px-4 py-4 text-small text-fg-faint" data-testid="tab-none">{t('broker.tab.none')}</p>}
      <ul className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {ids.map((id) => {
          const info = seriesInfo(world, id, me.player.rankId);
          const on = id === ticker;
          const inWatch = watch.includes(id);
          return (
            <li key={id} className={`group flex items-center ${on ? 'bg-ink-2 shadow-[inset_2px_0_0_var(--color-brass)]' : 'hover:bg-ink-2'}`}>
              <button type="button" onClick={() => onPick(id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left" data-testid={`watch-${id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="num text-small font-semibold text-fg">{id}</span>
                    {info.locked && <LockGlyph size={12} />}
                    {info.cls !== 'index' && info.delisted && <span className="text-micro text-loss" data-testid={`delisted-${id}`}>{t('broker.delisted')}</span>}
                    {info.cls !== 'index' && !info.tradable && !info.delisted && <span className="text-micro text-fg-faint" data-testid={`untradable-${id}`}>{t('broker.notTradable')}</span>}
                  </div>
                  <div className="truncate text-caption text-fg-faint">{info.cls === 'index' ? `${info.name} · ${info.blurb}` : info.name}</div>
                </div>
                <Sparkline data={sparkline(h, id, 1, 32)} width={52} height={20} className="hidden sm:block" />
                <div className="text-right">
                  <Flash value={info.price} className="num text-small text-fg">{price(info.price)}</Flash>
                  <div className={`num text-caption ${toneText[tone(info.changePct)]}`}>{signedPct(info.changePct)}</div>
                </div>
              </button>
              {info.cls !== 'index' && (
                <button
                  type="button"
                  aria-label={inWatch ? t('broker.watch.remove', { ticker: id }) : t('broker.watch.add', { ticker: id })}
                  title={inWatch ? t('broker.watch.removeTitle') : t('broker.watch.addTitle')}
                  onClick={() => act({ type: 'watch.set', assetIds: inWatch ? watch.filter((x) => x !== id) : [...watch, id] }, { silent: true })}
                  className={`mr-2 h-8 w-8 shrink-0 rounded-md text-caption ${inWatch ? 'text-brass' : 'text-fg-disabled md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'}`}
                >★</button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
