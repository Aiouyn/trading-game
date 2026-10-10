'use client';

import { t } from '@/i18n';

export interface WaterfallRow {
  key: string;
  label: string;
  /** the part, in the screen's units: the amount the row adds to the running total */
  value: number;
}

/**
 * The "why" waterfall (velvet-trade-journal-replay.md, velvet-research-desk.md): each part is a bar from the running total,
 * then the total. The values and the total come from the server (explainTrade or explainMove), so the screen only places
 * them: the bars are drawn from the same numbers, and the total is shown as the server sent it.
 */
export function Waterfall({ rows, total, totalLabel, format, testId, totalTestId = 'why-total' }: {
  rows: WaterfallRow[];
  total: number;
  totalLabel: string;
  format: (x: number) => string;
  testId: string;
  totalTestId?: string;
}) {
  // the running total before and after each part, to place each bar (drawing only: nothing here is shown as a number)
  const ends: number[] = [];
  let run = 0;
  for (const r of rows) { run += r.value; ends.push(run); }
  const starts = rows.map((_, i) => (i === 0 ? 0 : ends[i - 1]!));
  const points = [0, total, ...starts, ...ends];
  const lo = Math.min(0, ...points);
  const hi = Math.max(0, ...points);
  const span = hi - lo || 1;
  const at = (x: number) => ((x - lo) / span) * 100;

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {rows.map((r, i) => {
        const a = at(starts[i]!);
        const b = at(ends[i]!);
        const up = r.value >= 0;
        return (
          <div key={r.key} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-small" data-testid={`why-row-${r.key}`}>
            <span className="truncate text-fg-muted">{r.label}</span>
            <span className="relative h-2 rounded-chip bg-ink-2" aria-hidden>
              <span
                className={`absolute top-0 h-2 rounded-chip ${r.key === 'fees' ? 'bg-fg-faint' : up ? 'bg-gain/70' : 'bg-loss/70'}`}
                style={{ left: `${Math.min(a, b)}%`, width: `${Math.max(Math.abs(b - a), 0.5)}%` }}
              />
            </span>
            <span className={`num text-right ${r.key === 'fees' ? 'text-fg-muted' : up ? 'text-gain' : 'text-loss'}`}>{format(r.value)}</span>
          </div>
        );
      })}
      <div className="mt-1 grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 border-t border-ink-2 pt-2 text-small" data-testid="why-total-row">
        <span className="font-semibold text-fg">{totalLabel}</span>
        <span aria-hidden />
        <span className="num text-right font-semibold text-fg" data-testid={totalTestId}>{format(total)}</span>
      </div>
      {rows.length === 0 && <p className="text-small text-fg-faint">{t('journal.line.flat')}</p>}
    </div>
  );
}
