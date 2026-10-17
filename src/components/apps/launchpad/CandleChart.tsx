'use client';

// The token's candle chart (R-10-6, Phase 10; review fix: real candles). The world keeps the candles on the game clock: a minute bar is
// one real minute (12 ticks) and an hour bar is one game day (720 ticks), each with its open, high, low and close from the trades (a
// minute with no trade carries its last price flat). The timeframes are built here from those bars: 1m and 5m, 15m from the minute bars,
// 1h from the hour bars. The axis reads the price or the market cap in dollars. A local SVG, because the Broker's chart reads the engine's
// asset history and a curve token has none (see docs/V1-PHASE10.md section 10C for the shared-engine note).
import { useMemo, useState } from 'react';
import { money } from '@/game/format';
import { t } from '@/i18n';
import { LP } from '@/world/launchpad/constants';
import type { LpBar } from '@/world/launchpad/types';
import { lpPrice } from './copy';

/** The timeframes, in ticks of the game clock (12 ticks is a real minute, 720 a game day), and the bars each is built from. */
export const TIMEFRAMES = [
  { id: '1m', ticks: 12, src: 'm' },
  { id: '5m', ticks: 60, src: 'm' },
  { id: '15m', ticks: 180, src: 'm' },
  { id: '1h', ticks: 720, src: 'h' },
] as const;
export type Timeframe = (typeof TIMEFRAMES)[number]['id'];

export interface Candle {
  /** the first tick of the bucket (aligned to the game clock) */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/**
 * The candles of a series of bars, one per bucket of `ticks` on the game clock: the bucket's open is its first bar's open, its high and
 * low the extremes of its bars, its close the last bar's close. Pure, so the tests read it without a DOM.
 */
export function candlesOf(bars: LpBar[], ticks: number): Candle[] {
  const out: Candle[] = [];
  for (const [t0, o, h, l, c] of bars) {
    const b = Math.floor(t0 / ticks) * ticks;
    const cur = out[out.length - 1];
    if (cur && cur.t === b) {
      cur.h = Math.max(cur.h, h);
      cur.l = Math.min(cur.l, l);
      cur.c = c;
    } else out.push({ t: b, o, h, l, c });
  }
  return out;
}

const W = 600;
const H = 220;
const PAD = 8;
/** the candles shown at most (the newest) */
const SHOW = 90;

export function CandleChart({ bars, testId = 'lp-candles' }: { bars: { m: LpBar[]; h: LpBar[] }; testId?: string }) {
  const [tf, setTf] = useState<Timeframe>('1m');
  const [axis, setAxis] = useState<'price' | 'mcap'>('price');
  const scale = axis === 'mcap' ? LP.SUPPLY : 1;
  const candles = useMemo(() => {
    const frame = TIMEFRAMES.find((x) => x.id === tf)!;
    return candlesOf(frame.src === 'h' ? bars.h : bars.m, frame.ticks).slice(-SHOW);
  }, [bars, tf]);
  const last = candles[candles.length - 1];
  const fmt = (v: number) => (axis === 'mcap' ? money(v * scale) : lpPrice(v));

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.l < lo) lo = c.l;
    if (c.h > hi) hi = c.h;
  }
  const span = hi - lo > 0 ? hi - lo : 1;
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const step = candles.length > 0 ? (W - 2 * PAD) / candles.length : 1;
  const bodyW = Math.max(1.5, step * 0.62);

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
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
      </div>

      {!last ? (
        <p className="text-small text-fg-muted" data-testid="lp-chart-empty">{t('lp.chart.empty')}</p>
      ) : (
        <>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-fg-muted" data-testid="lp-ohlc">
            <span className="num whitespace-nowrap">{t('lp.chart.o')} {fmt(last.o)}</span>
            <span className="num whitespace-nowrap">{t('lp.chart.h')} {fmt(last.h)}</span>
            <span className="num whitespace-nowrap">{t('lp.chart.l')} {fmt(last.l)}</span>
            <span className={`num whitespace-nowrap ${last.c >= last.o ? 'text-gain' : 'text-loss'}`}>{t('lp.chart.c')} {fmt(last.c)}</span>
          </p>
          <div className="flex items-stretch gap-2">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('lp.chart.label')} className="h-56 min-w-0 flex-1" data-testid="lp-candle-svg">
              {candles.map((c, i) => {
                const x = PAD + step * i + step / 2;
                const up = c.c >= c.o;
                const top = y(Math.max(c.o, c.c));
                const bottom = y(Math.min(c.o, c.c));
                return (
                  <g key={c.t} className={up ? 'stroke-gain fill-gain' : 'stroke-loss fill-loss'}>
                    <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <rect x={x - bodyW / 2} width={bodyW} y={top} height={Math.max(1, bottom - top)} />
                  </g>
                );
              })}
            </svg>
            <div className="flex w-20 shrink-0 flex-col justify-between py-1 text-right text-micro text-fg-faint" aria-hidden>
              <span className="num whitespace-nowrap">{fmt(hi)}</span>
              <span className="num whitespace-nowrap">{fmt(lo)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
