'use client';

import { useMemo } from 'react';
import { depthByPool, ecologyLog, publicShortInterest } from '@/engine';
import { tone, toneText } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';

const POOLS = ['value', 'trend', 'retail', 'pension'] as const;

/**
 * Public short interest for a stock: the aggregate short position as a share of shares outstanding (the
 * engine's measure: the engine has no separate float figure). It names no account. When the shorts are
 * concentrated the engine withholds the figure (null), and the row says why in one line.
 */
export function ShortInterestRow({ ticker }: { ticker: string }) {
  const world = useGame((s) => s.world)!;
  const config = useGame((s) => s.config);
  const si = useMemo(() => publicShortInterest(world), [world]);
  const def = config.assets.find((a) => a.id === ticker);
  if (!def || def.assetClass !== 'stock' || !def.sharesOutstanding) return null;
  const v = si[ticker];
  return (
    <div data-testid="short-interest">
      <div className="flex justify-between gap-2 py-0.5 text-small">
        <span className="text-fg-faint">{t('broker.short.label')}</span>
        <span className="num text-fg-muted" data-testid="short-interest-value">
          {v === null || v === undefined ? t('broker.short.withheld') : v === 0 ? t('broker.short.none') : t('broker.short.pct', { p: (v * 100).toFixed(2) })}
        </span>
      </div>
      {v === null && <p className="text-caption text-fg-faint" data-testid="short-interest-why">{t('broker.short.why')}</p>}
    </div>
  );
}

/**
 * Order depth on the last closed day, by trader type (engine depthByPool). The depth factor is how thick the
 * book was (1 is full depth). Each pool's desired flow is what that type wanted to trade, in average daily
 * volume, before the market cleared it. Pool types only; no trader or account is named.
 */
export function DepthByPool({ ticker }: { ticker: string }) {
  const world = useGame((s) => s.world)!;
  const log = ecologyLog(world);
  const last = log.at(-1);
  const isAsset = world.config.assets.some((a) => a.id === ticker);
  if (!last || !isAsset) return <p className="text-caption text-fg-faint" data-testid="depth-none">{t('broker.depth.none')}</p>;
  const d = depthByPool(world, ticker, last.day);
  return (
    <div data-testid="depth-by-pool">
      <div className="flex justify-between gap-2 py-0.5 text-small">
        <span className="text-fg-faint">{t('broker.depth.factor')}</span>
        <span className="num text-fg-muted" data-testid="depth-factor">{d.depth.toFixed(2)}</span>
      </div>
      <p className="text-caption text-fg-faint">{t('broker.depth.day', { day: last.day + 1 })} · {t('broker.depth.explain')}</p>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {POOLS.map((k) => {
          const v = d.desired[k];
          const sign = v >= 0 ? '+' : '−';
          return (
            <li key={k} className="flex justify-between gap-2 text-small" data-testid={`depth-${k}`}>
              <span className="text-fg-faint">{t(`broker.pool.${k}`)}</span>
              <span className={`num ${toneText[tone(v)]}`}>{t('broker.depth.flow', { v: `${sign}${Math.abs(v).toFixed(2)}` })}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-caption text-fg-faint">{t('broker.depth.flowExplain')}</p>
    </div>
  );
}
