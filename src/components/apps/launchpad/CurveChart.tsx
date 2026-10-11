'use client';

// The price over the token's ticks (the page's sampled chart, one point each few ticks). An area and a line in the brass
// token, drawn as SVG so it needs no chart library. The low and high figures sit under it, in full (never truncated).
import { t } from '@/i18n';
import { lpPrice } from './copy';

const W = 600;
const H = 160;
const PAD = 6;

export function CurveChart({ points, testId = 'lp-chart' }: { points: [number, number][]; testId?: string }) {
  if (points.length < 2) return <p className="text-small text-fg-muted" data-testid={testId}>{t('lp.chart.empty')}</p>;
  const first = points[0]![0];
  const last = points[points.length - 1]![0];
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, p] of points) {
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  const span = hi - lo > 0 ? hi - lo : 1;
  const x = (tick: number) => PAD + (last === first ? 0 : ((tick - first) / (last - first)) * (W - 2 * PAD));
  const y = (p: number) => H - PAD - ((p - lo) / span) * (H - 2 * PAD);
  const line = points.map(([tick, p], i) => `${i === 0 ? 'M' : 'L'}${x(tick).toFixed(2)} ${y(p).toFixed(2)}`).join(' ');
  const area = `${line} L${x(last).toFixed(2)} ${H - PAD} L${x(first).toFixed(2)} ${H - PAD} Z`;
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('lp.chart.label')} className="h-40 w-full overflow-visible">
        <path d={area} className="fill-brass/10" />
        <path d={line} fill="none" className="stroke-brass" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="num flex justify-between gap-3 text-caption text-fg-faint">
        <span className="whitespace-nowrap">{t('lp.chart.low', { price: lpPrice(lo) })}</span>
        <span className="whitespace-nowrap">{t('lp.chart.high', { price: lpPrice(hi) })}</span>
      </div>
    </div>
  );
}
