'use client';

import { useState } from 'react';
import { newsBand, type NewsBand } from '@/engine';
import { t } from '@/i18n';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import type { WireItem } from '@/world/types';
import { TONE_TEXT } from './Shell';
import { openFromShell } from './os/openApp';
import { Chip } from './ui';

/** The Wire's filters (velvet-desktop-os.md, app 3). Each one lists the story kinds it shows. */
const FILTERS: { id: string; kinds: WireItem['kind'][] | null }[] = [
  { id: 'all', kinds: null },
  { id: 'markets', kinds: ['move', 'halt', 'reopen', 'liquidation', 'squeeze', 'world', 'listing'] },
  { id: 'earnings', kinds: ['earnings', 'preview', 'rumor'] },
  { id: 'macro', kinds: ['macro', 'rates', 'index'] },
  { id: 'players', kinds: ['biz', 'purchase', 'milestone', 'filing', 'alliance', 'chapter'] },
  { id: 'law', kinds: ['court', 'security'] },
];

const BAND_CLASS: Record<NewsBand, string> = {
  early: 'border-brass/60 text-brass-hi',
  mid: 'border-info/50 text-info',
  late: 'border-ink-3 text-fg-muted',
  done: 'border-ink-3 text-fg-faint',
};

/**
 * The Wire, its own app (velvet-desktop-os.md, app 3): the headlines newest first, filtered by kind. A story
 * about an asset opens the Broker on it (Broker is one tap away from any headline). A news move carries its
 * priced-in chip (newsBand): how much of it is already in the price, never the share.
 */
export function WireView() {
  const wire = useGame((s) => s.wire);
  const config = useGame((s) => s.config);
  const now = useGame((s) => s.frame?.tick ?? 0);
  const [f, setF] = useState('all');
  const kinds = FILTERS.find((x) => x.id === f)!.kinds;
  const items = wire.filter((w) => !kinds || kinds.includes(w.kind));
  return (
    <div className="os-body" data-testid="wire-view">
      <div className="os-seg flex gap-1 overflow-x-auto pb-1" role="group" aria-label={t('wire.filters')}>
        {FILTERS.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={f === x.id}
            data-testid={`wire-filter-${x.id}`}
            onClick={() => setF(x.id)}
            className={`shrink-0 rounded-chip border px-3 py-1 text-caption ${f === x.id ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted'}`}
          >
            {t(`wire.filter.${x.id}`)}
          </button>
        ))}
      </div>
      <ul>
        {items.map((w) => {
          const band = w.news && w.assetId ? newsBand(config, w.assetId, w.news, now - w.tick) : null;
          return (
            <li key={w.id} className="flex gap-3 border-t border-ink-2 py-2.5" data-testid="wire-row">
              <span className="num w-20 shrink-0 text-caption text-fg-faint">{clockLabel(w.tick, 720)}</span>
              <div className="min-w-0">
                <span className={`mr-2 text-caption font-semibold uppercase ${TONE_TEXT[w.tone]}`}>{w.tag}</span>
                {w.assetId ? (
                  <button
                    type="button"
                    className="text-left text-small text-fg hover:underline"
                    title={t('wire.openBroker', { ticker: w.assetId })}
                    onClick={() => openFromShell('broker', { ticker: w.assetId })}
                  >
                    {w.text}
                  </button>
                ) : (
                  <span className="text-small text-fg">{w.text}</span>
                )}
                {band !== null && (
                  <span className="ml-2 align-middle" data-testid={`news-band-${band}`}>
                    <Chip className={BAND_CLASS[band]}>{t(`news.band.${band}`)}</Chip>
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {!items.length && <li className="py-8 text-center text-small text-fg-faint">{t('wire.empty')}</li>}
      </ul>
    </div>
  );
}
