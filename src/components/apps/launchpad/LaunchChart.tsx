'use client';

// The token chart is the Broker chart (the same candles, drawing tools and studies). The series is the curve's own bars:
// 5s is one game tick, which is 5 real seconds at 1× and faster when the player speeds the clock up. A curve token has no
// broker book, so a position drawing stays a mark until the token graduates.
import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '@/game/format';
import { type Bar } from '@/game/history';
import { t } from '@/i18n';
import { PriceChart } from '@/components/apps/broker/PriceChart';
import { DrawingPanel } from '@/components/apps/broker/chart/DrawingPanel';
import { DrawingToolbar } from '@/components/apps/broker/chart/DrawingToolbar';
import { useDrawings } from '@/components/apps/broker/chart/drawingStore';
import { useDrawingKeys } from '@/components/apps/broker/chart/useDrawingKeys';
import { IndicatorMenu } from '@/components/apps/broker/ChartCard';
import { LP } from '@/world/launchpad/constants';
import type { LpBar } from '@/world/launchpad/types';
import { TIMEFRAMES, candlesOf, type Timeframe } from './CandleChart';
import { lpPrice } from './copy';

/** The Broker bars of one timeframe, from the curve's tick, minute or hour bars. */
export function barsForFrame(bars: { m: LpBar[]; h: LpBar[]; s: LpBar[] }, tf: Timeframe, mcap: boolean): Bar[] {
  const frame = TIMEFRAMES.find((x) => x.id === tf)!;
  const src = frame.src === 'h' ? bars.h : frame.src === 's' ? bars.s : bars.m;
  const scale = mcap ? LP.SUPPLY : 1;
  return candlesOf(src, frame.ticks).map((c) => ({
    time: c.t, open: c.o * scale, high: c.h * scale, low: c.l * scale, close: c.c * scale,
  }));
}

export function LaunchChart({ ticker, bars, graduated }: {
  ticker: string;
  bars: { m: LpBar[]; h: LpBar[]; s: LpBar[] };
  /** a graduated token is listed, so the position tool may send a broker order */
  graduated: boolean;
}) {
  const [tf, setTf] = useState<Timeframe>('5s');
  const [axis, setAxis] = useState<'price' | 'mcap'>('price');
  const candles = useMemo(() => barsForFrame(bars, tf, axis === 'mcap'), [bars, tf, axis]);
  const formatPrice = axis === 'mcap' ? money : lpPrice;
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const root = useRef<HTMLElement>(null);
  useDrawingKeys(ticker, hover || focus, root);
  const canUndo = useDrawings((s) => (s.past[ticker]?.length ?? 0) > 0);
  const canRedo = useDrawings((s) => (s.future[ticker]?.length ?? 0) > 0);
  useEffect(() => { void useDrawings.getState().load(ticker); }, [ticker]);
  const frame = TIMEFRAMES.find((x) => x.id === tf)!;

  return (
    <section
      ref={root}
      className="flex flex-col gap-2"
      data-testid="lp-candles"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false); }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={t('lp.chart.timeframe')} className="flex flex-wrap gap-1">
          {TIMEFRAMES.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={tf === x.id}
              data-testid={`lp-tf-${x.id}`}
              onClick={() => setTf(x.id)}
              className={`rounded-chip border px-2 py-0.5 text-caption ${tf === x.id ? 'border-brass/60 bg-brass/10 text-fg' : 'border-ink-3 text-fg-muted hover:text-fg'}`}
            >
              {t(`lp.chart.tf.${x.id}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('lp.chart.axis')} className="flex gap-1">
            {(['price', 'mcap'] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={axis === a}
                data-testid={`lp-axis-${a}`}
                onClick={() => setAxis(a)}
                className={`rounded-chip border px-2 py-0.5 text-caption ${axis === a ? 'border-brass/60 bg-brass/10 text-fg' : 'border-ink-3 text-fg-muted hover:text-fg'}`}
              >
                {t(`lp.chart.axis.${a}`)}
              </button>
            ))}
          </div>
          <IndicatorMenu />
        </div>
      </div>
      <div className="flex h-[28rem] min-h-0 overflow-hidden rounded-md border border-ink-2">
        <DrawingToolbar
          onDeleteAll={() => { const st = useDrawings.getState(); st.commit(ticker, []); st.select(null); }}
          onUndo={() => useDrawings.getState().undo(ticker)}
          onRedo={() => useDrawings.getState().redo(ticker)}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <div className="relative min-w-0 flex-1">
          <PriceChart
            drawings
            candles={candles}
            formatPrice={formatPrice}
            assetId={ticker}
            interval={frame.src === 'h' ? '1D' : '1m'}
            range="ALL"
            testId="lp-price-chart"
          />
          <DrawingPanel assetId={ticker} orders={graduated} />
        </div>
      </div>
    </section>
  );
}
