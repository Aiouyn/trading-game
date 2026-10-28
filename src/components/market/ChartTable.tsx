"use client";
// The price chart as a table (UI card 7, "View as table"): the same bars the chart plots, newest first, every value the
// server's string with only locale grouping (decText). Lives outside the lazy chart chunk so it never waits on it.
import type { BrStrings } from "@/apps/broker/strings";
import { decText } from "@/apps/portfolio/positions/format";
import type { Bar } from "@/shell/contracts/history";
import { clockAt, clockLabel } from "@/shell/mockChannels";
import { clockStrings } from "@/shell/strings";

/** A bar's time in the shell's own game clock format (top bar strip: "Day 39 · 11:22"); tickLabel below tick 0. */
export function barTime(t: number, locale: string, s: Pick<BrStrings, "tickLabel">): string {
  if (!Number.isSafeInteger(t) || t < 0) return s.tickLabel(String(t));
  const { day, hhmm } = clockLabel(clockAt(t));
  return clockStrings(locale).strip(day, hhmm);
}

const COLS = ["open", "high", "low", "close", "volume"] as const;
const FIELD = { open: "o", high: "h", low: "l", close: "c", volume: "v" } as const;

export function ChartTable({ bars, t, locale, label }: { bars: readonly Bar[]; t: BrStrings; locale: string; label: string }) {
  const rows = [...bars].reverse();
  return (
    <div className="br-chart-table" role="region" tabIndex={0} aria-label={label} data-testid="br-chart-table">
      <table>
        <thead>
          <tr>
            <th scope="col">{t.col.time}</th>
            {COLS.map((c) => <th scope="col" key={c}>{t.col[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.t} data-t={b.t}>
              <th scope="row">{barTime(b.t, locale, t)}</th>
              {COLS.map((c) => <td key={c} className="num" data-col={c}>{decText(b[FIELD[c]], locale)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
