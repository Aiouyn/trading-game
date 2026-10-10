'use client';

import { earningsInfo, REGIONS, sectorName } from '@/engine';
import { RANGES, type RangeId } from '@/game/history';
import { INDICATORS } from '@/game/indicators';
import { price, signedChange, signedPct, tone, toneText } from '@/game/format';
import { isIndex, useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, Chip, Flash, LockGlyph, Segmented } from '@/components/ui';
import { PriceChart } from './PriceChart';
import { seriesInfo } from './seriesInfo';

const RANGE_OPTS = RANGES.map((r) => ({ value: r, label: r, testId: `range-${r}` }));

/**
 * The Broker's chart card: ticker, price and day move, the range and style switches, and the indicator
 * toggles. A window passes its own ticker. `narrow` (under 720 px wide) drops the one-quarter range and
 * the OHLC line so the header fits a phone-width window (P2-031).
 */
export function ChartCard({ ticker, narrow = false }: { ticker: string; narrow?: boolean }) {
  const world = useGame((s) => s.world)!;
  useGame((s) => s.historyRev);
  useGame((s) => s.config);
  const rankId = useGame((s) => s.me?.player.rankId ?? 'R0');
  const range = useGame((s) => s.range);
  const setRange = useGame((s) => s.setRange);
  const mode = useGame((s) => s.chartMode);
  const setMode = useGame((s) => s.setChartMode);
  const indicators = useGame((s) => s.indicators);
  const toggle = useGame((s) => s.toggleIndicator);
  const info = seriesInfo(world, ticker, rankId);
  const day = useGame.getState().history.series[ticker]?.daily.at(-1);
  const toneCls = toneText[tone(info.change)];
  const ranges = narrow ? RANGE_OPTS.filter((r) => r.value !== '1Q') : RANGE_OPTS;
  const region = REGIONS.find((r) => r.id === info.region);
  return (
    <Card className="flex flex-col p-4" data-testid="chart-card">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-body font-semibold text-fg" data-testid="chart-ticker">{info.id}</span>
            <span className="truncate text-small text-fg-muted">{info.name}</span>
            <Chip>{info.cls === 'index' ? t('broker.index') : sectorName(info.sector)}</Chip>
            {region && <Chip title={region.name}>{region.flag}</Chip>}
            {info.halted && <Chip className="border-warn/60 text-warn">{t('broker.halted')}</Chip>}
            {info.delisted && <Chip className="border-loss/60 text-loss">{t('broker.delisted')}</Chip>}
            {info.cls !== 'index' && !info.tradable && !info.delisted && <Chip title={t('broker.notTradable.note')}>{t('broker.notTradable')}</Chip>}
            {info.locked && <Chip className="border-steel/60 text-steel"><LockGlyph size={12} /> {t('broker.proLicense')}</Chip>}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <Flash value={info.price} className="num text-price text-fg"><span data-testid="chart-price">{price(info.price)}</span></Flash>
            <span className={`num text-small ${toneCls}`}>{signedChange(info.change, info.price)} ({signedPct(info.changePct)})</span>
            <span className="text-caption text-fg-faint">{t('broker.todayPct')}</span>
          </div>
          {day && !narrow && (
            <div className="num mt-1 flex flex-wrap gap-4 text-caption text-fg-faint">
              <span>{t('broker.ohlc.open')} <span className="text-fg-muted">{price(day.open)}</span></span>
              <span>{t('broker.ohlc.high')} <span className="text-fg-muted">{price(day.high)}</span></span>
              <span>{t('broker.ohlc.low')} <span className="text-fg-muted">{price(day.low)}</span></span>
              {day.volume !== undefined && <span>{t('broker.ohlc.volume')} <span className="text-fg-muted">{compactNum(day.volume)}</span></span>}
              <EarningsBadge assetId={info.id} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label={t('broker.chart.range')} size="sm" options={ranges} value={range} onChange={(v) => setRange(v as RangeId)} />
          <Segmented
            label={t('broker.chart.style')} size="sm"
            options={[{ value: 'candles', label: t('broker.chart.candles') }, { value: 'line', label: t('broker.chart.line') }]}
            value={mode} onChange={(v) => setMode(v as 'candles' | 'line')}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('broker.indicators')} role="group">
        {INDICATORS.map((ind) => (
          <button
            key={ind.id} type="button" title={t(`broker.ind.${ind.id}`)} onClick={() => toggle(ind.id)} aria-pressed={!!indicators[ind.id]}
            className={`rounded-chip border px-2 py-0.5 text-micro ${indicators[ind.id] ? 'border-brass/60 bg-brass/10 text-brass-hi' : 'border-ink-3 text-fg-faint hover:text-fg-muted'}`}
            data-testid={`ind-${ind.id}`}
          >
            {ind.label}
          </button>
        ))}
      </div>
      <div className="mt-3 h-[min(46vh,420px)] min-h-64">
        <PriceChart assetId={info.id} />
      </div>
    </Card>
  );
}

export function compactNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(n < 10 ? 2 : 0);
}

/** A report inside the next ten game days, shown on the chart header (never for an index). */
export function EarningsBadge({ assetId }: { assetId: string }) {
  const world = useGame((s) => s.world);
  if (!world || isIndex(assetId)) return null;
  const e = earningsInfo(world, assetId);
  if (!e || e.daysAway < 0 || e.daysAway > 10) return null;
  const when = e.daysAway === 0 ? t('broker.when.today') : e.daysAway === 1 ? t('broker.when.tomorrow') : t('broker.when.inDays', { n: e.daysAway });
  return <span className="text-brass">{t('broker.earningsBadge', { when })}</span>;
}
