"use client";
// The chart as a table: the same candles, newest first, every value with its source. For keyboard and screen-reader players.
import { coverText, priceText, srcWords, stampLabel, volText, isIntraday, type Series } from "./terminalApi";

export function BarTable({ series }: { series: Series }) {
  const rows = series.bars.slice(-200).reverse();
  const u = series.unit;
  return (
    <div className="tm-table" role="region" tabIndex={0} aria-label={`${series.name}, ${series.tf} candles as a table`} data-testid="tm-table">
      <table>
        <caption>{series.name}, {series.tf} candles, newest first. Prices in {u === "cents" ? "dollars" : u === "pts" ? "index points" : "their own units"}.</caption>
        <thead><tr><th scope="col">Candle</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th><th scope="col">Volume</th><th scope="col">Source</th></tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.ts} title={coverText(b.ts, series.tf, series.session)}>
              <th scope="row">{stampLabel(b.ts, isIntraday(series.tf))}</th>
              <td>{priceText(u, b.o)}</td><td>{priceText(u, b.h)}</td><td>{priceText(u, b.l)}</td><td>{priceText(u, b.c)}</td>
              <td>{b.v > 0 ? volText(b.v) : "none"}</td>
              <td data-src={b.src}>{srcWords(b).bar.split(":")[0]}{b.v > 0 ? `, volume ${srcWords(b).vol}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
