"use client";
// The board by sector: productivity growth beside the year's return and the P/E, so a player can see why a sector trades at the multiple it does.
// The broad index shows its price and its total return (the price plus the whole payout).
import { titleWord } from "@/components/ui/format";
import type { Quote } from "@/shell/simSession";
import { signedPct, tone } from "./why";

export type QuoteX = Quote & { ret1y?: number | null; prod?: number | null };
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

export function IndexStrip({ tape }: { tape: TapeX | undefined }) {
  if (!tape || !tape.index) return null;
  const tr = tape.indexTR;
  return (
    <div className="mk-index" data-testid="mk-index">
      <div>
        <span className="label">Port Avalon index</span>
        <p className="mk-index-fig num">{tape.index.toFixed(1)}</p>
        <p className="muted">Price. {plain(tape.indexYr)} on the year</p>
      </div>
      {tr != null ? (
        <div>
          <span className="label">Total return</span>
          <p className="mk-index-fig num">{tr.toFixed(1)}</p>
          <p className="muted">Price and payouts. {plain(tape.indexTRYr)} on the year</p>
        </div>
      ) : null}
      <p className="muted mk-index-note">Both start at 100 when the city opens.</p>
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
    ret: median(list.flatMap((q) => (q.ret1y != null && Number.isFinite(q.ret1y) ? [q.ret1y] : []))),
    pe: median(list.flatMap((q) => (q.pe != null && Number.isFinite(q.pe) ? [q.pe] : []))),
    names: list.length,
  }));
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
              <th scope="col">Return a year</th>
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
                <td data-label="Return a year"><span className={`num ${tone(r.ret ?? 0)}`}>{r.ret == null ? "—" : signedPct(r.ret)}</span></td>
                <td data-label="P/E"><span className="num">{r.pe == null ? "—" : r.pe.toFixed(1)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted mk-sector-note">Productivity is output per worker, compounded from the opening (the plan rate before a year has passed). Return and P/E are medians of the sector&apos;s names.</p>
    </section>
  );
}
