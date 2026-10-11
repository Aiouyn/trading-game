'use client';

import { signedPct } from '@/game/format';
import { t, tm } from '@/i18n';
import type { DeskDossier } from '@/world/ledger-types';
import { Waterfall, type WaterfallRow } from '../analyst/Waterfall';

/**
 * The dossier (velvet-research-desk.md section 3): one scrolling column with the header, the memo, the waterfall in parts of
 * the move, the flow by pool type, the headlines in the window, and the daily closes. The server writes every number and
 * sentence; this screen only lays them out. No player is named anywhere in it.
 */

const CHART_W = 640;
const CHART_H = 120;

export function Dossier({ d, upkeepDay }: { d: DeskDossier; upkeepDay?: number }) {
  const rows: WaterfallRow[] = d.rows.map((r) => ({ key: r.row, label: t(`why.${r.row}`), value: r.value }));
  const pts = chartPoints(d.bars);
  return (
    <article className="flex flex-col gap-5" data-testid="desk-dossier">
      <header className="flex flex-col gap-1">
        <span className="label" data-testid="desk-file">{t('desk.file.title', { no: String(d.no).padStart(4, '0') })}</span>
        <h2 className="font-serif text-title text-fg" data-testid="desk-header">
          {t('desk.header', { asset: d.assetId, from: d.from, to: d.to })}
        </h2>
        <p className="num flex flex-wrap gap-x-4 text-small">
          <span className={d.move >= 0 ? 'text-gain' : 'text-loss'} data-testid="desk-move">{signedPct(d.move)}</span>
          {d.gx !== null && <span className="text-fg-muted">{t('desk.gx', { pct: signedPct(d.gx) })}</span>}
        </p>
      </header>

      <div className="flex flex-col gap-1 font-serif text-[20px] leading-snug text-fg" data-testid="desk-memo">
        {d.memo.map((m, i) => <p key={`${m.key}-${i}`}>{tm(m)}</p>)}
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="desk-why-title">
        <h3 id="desk-why-title" className="label">{t('desk.why')}</h3>
        <Waterfall
          rows={rows}
          total={d.move}
          totalLabel={t('desk.move')}
          format={signedPct}
          testId="desk-waterfall"
          totalTestId="desk-total"
          note={rows.some((r) => r.key === 'market') ? t('why.market.note') : undefined}
        />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="desk-flow-title" data-testid="desk-flow-block">
        <h3 id="desk-flow-title" className="label">{t('desk.flow')}</h3>
        {d.flow.map((p) => {
          // buying runs right of the centre line (gain), selling left of it (loss); the bar is the share of gross flow
          const up = Math.max(0, p.share) * 50;
          const down = Math.max(0, -p.share) * 50;
          return (
            <div key={p.pool} className="grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-3 text-small" data-testid={`desk-flow-${p.pool}`}>
              <span className="truncate text-fg-muted">{t(`desk.pool.${p.pool}`)}</span>
              <span className="relative h-2 rounded-chip bg-ink-2" aria-hidden>
                <span className="absolute top-0 h-2 bg-gain/70" style={{ left: '50%', width: `${up}%` }} />
                <span className="absolute top-0 h-2 bg-loss/70" style={{ left: `${50 - down}%`, width: `${down}%` }} />
                <span className="absolute top-0 h-2 w-px bg-fg-faint" style={{ left: '50%' }} />
              </span>
              <span className={`num text-right ${p.share >= 0 ? 'text-gain' : 'text-loss'}`}>{Math.round(p.share * 100)}%</span>
            </div>
          );
        })}
        <p className="text-caption text-fg-faint">{t('desk.flow.note')}</p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="desk-headlines-title">
        <h3 id="desk-headlines-title" className="label">{t('desk.headlines')}</h3>
        {d.headlines.length === 0 ? (
          <p className="text-small text-fg-faint" data-testid="desk-headlines-none">{t('desk.headlines.none')}</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="desk-headlines">
            {d.headlines.map((h, i) => (
              <li key={`${h.day}-${i}`} className="flex gap-3 text-small">
                <span className="num shrink-0 text-fg-faint">{t('desk.day', { day: h.day })}</span>
                <span className="text-fg">{h.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="desk-chart-title">
        <h3 id="desk-chart-title" className="label">{t('desk.chart')}</h3>
        {pts && (
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-auto w-full" role="img" aria-label={t('desk.chart')} data-testid="desk-chart">
            <polyline points={pts} fill="none" className="stroke-fg" strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
        )}
      </section>

      <footer className="flex flex-col gap-1 text-small text-fg-faint">
        <p>{t('desk.footer')}</p>
        {upkeepDay !== undefined && <p data-testid="desk-upkeep">{t('desk.upkeep', { day: upkeepDay })}</p>}
      </footer>
    </article>
  );
}

/** The daily closes as a polyline in the chart box (drawing only). Null with fewer than two closes. */
function chartPoints(bars: { day: number; px: number }[]): string | null {
  if (bars.length < 2) return null;
  const d0 = bars[0]!.day;
  const d1 = bars[bars.length - 1]!.day;
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) { if (b.px < lo) lo = b.px; if (b.px > hi) hi = b.px; }
  const dspan = d1 - d0 || 1;
  const pspan = hi - lo || 1;
  const pad = 8;
  return bars
    .map((b) => `${(pad + ((b.day - d0) / dspan) * (CHART_W - 2 * pad)).toFixed(1)},${(pad + (1 - (b.px - lo) / pspan) * (CHART_H - 2 * pad)).toFixed(1)}`)
    .join(' ');
}
