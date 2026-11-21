"use client";
// The board by sector: productivity growth beside the year's return and the P/E, so a player can see why a sector trades at the multiple it does.
// The broad index shows its price and its total return (the price plus the whole payout).
import { titleWord } from "@/components/ui/format";
import type { Quote } from "@/shell/simSession";
import { signedPct, tone } from "./why";

export type QuoteX = Quote & { ret1y?: number | null; ret?: number | null; retWindow?: string; retSessions?: number; prod?: number | null; prodWindow?: string };
/** "1 year" once a year of sessions exists, else "since listing, N sessions": the window a return was measured over. */
export function windowWord(w: string | undefined): string {
  if (!w) return "window not stated";
  return w === "1y" ? "over the last year" : w.replace("since listing, ", "since listing, ");
}
export interface TapeX {
  index: number;
  indexChg: number;
  indexTR?: number;
  indexYr?: number | null;
  indexTRYr?: number | null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function plain(v: number | null | undefined, digits = 1): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

export function IndexStrip({ tape, today, monthEnd }: { tape: TapeX | undefined; today?: string; monthEnd?: string }) {
  if (!tape || !tape.index) return null;
  const tr = tape.indexTR;
  return (
    <div className="mk-index" data-testid="mk-index">
      <div>
        <span className="label">Port Avalon index, price</span>
        <p className="mk-index-fig num">{tape.index.toFixed(1)}</p>
        <p className="muted">As of {today ?? "now"}, each session. {tape.indexYr == null ? "Less than a year of history, so no yearly change yet" : `${plain(tape.indexYr)} over the last year`}</p>
      </div>
      {tr != null ? (
        <div>
          <span className="label">Total return, price plus payouts</span>
          <p className="mk-index-fig num">{tr.toFixed(1)}</p>
          <p className="muted">As of {monthEnd ?? "the last month-end"}: it updates monthly. {tape.indexTRYr == null ? "No yearly change yet" : `${plain(tape.indexTRYr)} over the last year`}</p>
        </div>
      ) : null}
      <p className="muted mk-index-note" data-testid="mk-index-method">Both start at 100 on the opening day. The price index follows the exchange's total value of shares, linked day to day so that a split, a listing or a delisting moves the divisor and never the index. Total return adds the dividends paid, on a monthly clock, so the two can sit apart until the month closes.</p>
    </div>
  );
}

interface SectorRow { sector: string; prod: number | null; ret: number | null; pe: number | null; names: number }

export function SectorTable({ quotes, onPick }: { quotes: QuoteX[]; onPick: (sector: string) => void }) {
  const by = new Map<string, QuoteX[]>();
  for (const q of quotes) {
    const key = q.sector || "Other";
    const list = by.get(key);
    if (list) list.push(q); else by.set(key, [q]);
  }
  const rows: SectorRow[] = [...by.entries()].map(([sector, list]) => ({
    sector,
    prod: list.find((q) => q.prod != null)?.prod ?? null,
    ret: median(list.flatMap((q) => (q.ret != null && Number.isFinite(q.ret) ? [q.ret] : q.ret1y != null && Number.isFinite(q.ret1y) ? [q.ret1y] : []))),
    pe: median(list.flatMap((q) => (q.pe != null && Number.isFinite(q.pe) ? [q.pe] : []))),
    names: list.length,
  }));
  const win = quotes.find((q) => q.retWindow)?.retWindow;
  const retHead = win === "1y" || !win ? "Return, last year" : "Return " + win.replace("since listing, ", "since listing, ");
  rows.sort((a, b) => (b.prod ?? -1) - (a.prod ?? -1) || a.sector.localeCompare(b.sector));
  if (!rows.length) return null;
  return (
    <section className="mk-sectors" data-testid="mk-sectors" aria-label="Sectors">
      <h3 className="label">By sector</h3>
      <div className="mk-scroll">
        <table className="mk-table mk-sector-table">
          <thead>
            <tr>
              <th scope="col">Sector</th>
              <th scope="col">Productivity a year</th>
              <th scope="col" title="The window each return was measured over">{retHead}</th>
              <th scope="col">P/E</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sector} data-testid="mk-sector-row">
                <td data-label="Sector">
                  <button type="button" className="mk-open" onClick={() => onPick(r.sector)} aria-label={`Show ${titleWord(r.sector)} only`}>
                    {titleWord(r.sector)} <span className="muted">· {r.names}</span>
                  </button>
                </td>
                <td data-label="Productivity a year"><span className={`num ${tone(r.prod ?? 0)}`}>{plain(r.prod, 2)}</span></td>
                <td data-label={retHead}><span className={`num ${tone(r.ret ?? 0)}`}>{r.ret == null ? "—" : signedPct(r.ret)}</span></td>
                <td data-label="P/E"><span className="num">{r.pe == null ? "—" : r.pe.toFixed(1)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted mk-sector-note">Productivity is output per worker over a year; before a year has passed it shows a dash. Return is the median of the sector&apos;s names over the window in its heading: a full year only once a year of sessions exists, otherwise since listing. P/E is the median too.</p>
    </section>
  );
}
