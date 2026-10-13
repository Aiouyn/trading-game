'use client';

import { useEffect, useState } from 'react';
import { t, tm, type Msg } from '@/i18n';
import { signedMoney } from '@/game/format';
import { useReducedMotion } from '@/components/os/motion';
import { Button } from '@/components/ui';
import type { JournalReplay } from '@/world/journal';

/**
 * The trade replay (velvet-trade-journal-replay.md): the price from before the entry to after the exit, from the daily closes.
 * The held window is shaded, the average cost is a dashed line between entry and exit, and after the exit a dashed
 * continuation runs to the last closed day ("If held"). Play draws it from entry to exit; the scrubber moves through it.
 * Reduced motion: no play button, the scrubber only.
 */

const W = 640;
const H = 220;
const PAD = { l: 10, r: 10, t: 14, b: 22 };
const PLAY_MS = 4000;

/** A headline pin: a dot on the line at its day (Senior only; the headlines of the holding window). */
export interface ReplayPin {
  msg?: Msg;
  day: number;
  text: string;
}

export function Replay({ replay, pins = [] }: { replay: JournalReplay; pins?: ReplayPin[] }) {
  const reduce = useReducedMotion();
  const series = replay.series;
  const n = series.length;
  const entryIdx = Math.max(0, series.findIndex((p) => p.day >= replay.entryDay));
  // a pending exit (the trade closed on the still-open day) has no exit on the chart: play runs to the last closed day
  const exitDay = replay.exitDay;
  const exitIdx = exitDay === null ? n - 1 : Math.max(entryIdx, series.reduce((k, p, i) => (p.day <= exitDay ? i : k), entryIdx));
  const [pos, setPos] = useState(n - 1);
  const [playing, setPlaying] = useState(false);

  // play: step the position from the entry to the exit, evenly over PLAY_MS (the play handler sets the start)
  useEffect(() => {
    if (!playing) return undefined;
    const steps = Math.max(1, exitIdx - entryIdx);
    let k = 0;
    const timer = setInterval(() => {
      k++;
      if (k >= steps) {
        setPos(exitIdx);
        setPlaying(false);
        clearInterval(timer);
      } else {
        setPos(entryIdx + k);
      }
    }, PLAY_MS / steps);
    return () => clearInterval(timer);
  }, [playing, entryIdx, exitIdx]);

  const days = [...series.map((p) => p.day), ...replay.held.map((p) => p.day)];
  const prices = [...series.map((p) => p.px), ...replay.held.map((p) => p.px), replay.avgEntry, ...(exitDay === null ? [] : [replay.avgExit])];
  const d0 = Math.min(...days);
  const d1 = Math.max(...days);
  const p0 = Math.min(...prices);
  const p1 = Math.max(...prices);
  const dspan = d1 - d0 || 1;
  const pspan = p1 - p0 || 1;
  const x = (day: number) => PAD.l + ((day - d0) / dspan) * (W - PAD.l - PAD.r);
  const y = (px: number) => PAD.t + (1 - (px - p0) / pspan) * (H - PAD.t - PAD.b);
  const pts = (rows: { day: number; px: number }[]) => rows.map((r) => `${x(r.day).toFixed(1)},${y(r.px).toFixed(1)}`).join(' ');

  const shown = series.slice(0, Math.max(1, pos + 1));
  const exitShown = exitDay !== null && pos >= exitIdx;
  const entryShown = pos >= entryIdx;
  const ex = series[exitIdx] ?? series[n - 1]!;
  const en = series[entryIdx] ?? series[0]!;
  const dayStart = t('desk.day', { day: en.day });
  const dayEnd = t('desk.day', { day: ex.day });

  return (
    <div className="flex flex-col gap-2" data-testid="replay">
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-fg-faint">{t('journal.replay')}</span>
        {!reduce && (
          <Button size="sm" variant="quiet" onClick={() => { setPos(entryIdx); setPlaying(true); }} disabled={playing || n < 2} testId="replay-play">
            {t('journal.replay.play')}
          </Button>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={t('journal.replay')}
        data-testid="replay-chart"
      >
        {/* the held window, shaded (once the exit is known) */}
        {exitDay !== null && (
          <rect x={x(replay.entryDay)} y={PAD.t} width={Math.max(1, x(exitDay) - x(replay.entryDay))} height={H - PAD.t - PAD.b} className="fill-brass" fillOpacity={0.06} />
        )}
        {/* the average cost between entry and exit */}
        {entryShown && (
          <line x1={x(replay.entryDay)} x2={x(exitDay ?? d1)} y1={y(replay.avgEntry)} y2={y(replay.avgEntry)} className="stroke-fg-faint" strokeDasharray="4 4" strokeWidth={1} />
        )}
        {/* the price path, drawn up to the position */}
        <polyline points={pts(shown)} fill="none" className="stroke-fg" strokeWidth={1.5} strokeLinejoin="round" />
        {/* the headline pins: a dot on the line at each headline day */}
        {pins.map((pin, i) => {
          const at = series.find((p) => p.day === pin.day);
          if (!at) return null;
          return <circle key={`${pin.day}-${i}`} cx={x(at.day)} cy={y(at.px)} r={3} className="fill-info" data-testid="replay-pin"><title>{tm(pin.msg, pin.text)}</title></circle>;
        })}
        {/* if held: the continuation from the exit to the last closed day */}
        {exitShown && replay.held.length > 1 && (
          <polyline points={pts(replay.held)} fill="none" className="stroke-fg-faint" strokeWidth={1.25} strokeDasharray="5 4" data-testid="if-held-line" />
        )}
        {entryShown && (
          <polygon points={`${x(replay.entryDay)},${y(replay.avgEntry) - 7} ${x(replay.entryDay) - 5},${y(replay.avgEntry) + 3} ${x(replay.entryDay) + 5},${y(replay.avgEntry) + 3}`} className="fill-brass" data-testid="replay-entry" />
        )}
        {exitShown && exitDay !== null && (
          <polygon points={`${x(exitDay)},${y(replay.avgExit) + 7} ${x(exitDay) - 5},${y(replay.avgExit) - 3} ${x(exitDay) + 5},${y(replay.avgExit) - 3}`} className="fill-brass" data-testid="replay-exit" />
        )}
        <text x={PAD.l} y={H - 6} className="fill-fg-faint" fontSize={11}>{dayStart}</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-fg-faint" fontSize={11}>{dayEnd}</text>
      </svg>
      <input
        type="range"
        min={0}
        max={Math.max(0, n - 1)}
        value={Math.min(pos, Math.max(0, n - 1))}
        onChange={(e) => { setPlaying(false); setPos(Number(e.target.value)); }}
        aria-label={t('journal.replay.scrub')}
        data-testid="replay-scrub"
        className="w-full accent-brass"
        disabled={n < 2}
      />
      <p className="num text-small text-fg-muted" data-testid="if-held">
        {replay.ifHeld !== null ? t('journal.ifHeld', { amount: signedMoney(replay.ifHeld) }) : ''}
      </p>
    </div>
  );
}
