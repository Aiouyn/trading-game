"use client";
// Recent fills (UI card 8, 17B PF-C slice): `me.fills` as the server holds it, newest first. Every value is the
// server's string, only regrouped for the locale (decText); the list sorts by tick numbers and fillId, never by money,
// and shows no notional, P&L or sums (G1: no client maths).
// ENGINE-TBD: fills aging out of the 50 ring: the list shows exactly what `me.fills` holds, so a fill the ring drops
//   vanishes with no notice (whether the client is told a fill aged out is Engine's call).
// ENGINE-TBD: `counterpartyKind` (Player / NPC) is not displayed: a design / privacy call, left off.
import { useId } from "react";
import { Chip } from "@/components/ui/Chip";
import { brStrings, type BrStrings } from "@/apps/broker/strings";
import type { MyFill } from "@/shell/contracts/channels";
import { decText } from "./positions/format";
import { posStrings } from "./positions/strings";
import { FILL_COLS, pfStrings } from "./strings";

/** Desktop window >= 640 px at text scale < 1.5: a table. Narrower, phone, or larger text: rows of 2 lines, 3 from 1.5. */
export type FillsLayout = { kind: "table" } | { kind: "rows"; lines: 2 | 3 };

/** tick desc, then fillId (code-unit order). Ticks are numbers; nothing here is money. */
export function byNewest(a: MyFill, b: MyFill): number {
  if (a.tick !== b.tick) return a.tick > b.tick ? -1 : 1;
  return a.fillId < b.fillId ? -1 : a.fillId > b.fillId ? 1 : 0;
}

/** The text of one fill row, every field as display text. */
export interface FillWords { side: string; ticker: string; qty: string; price: string; fee: string; liquidity: string; tick: string; aria: string }

export function fillWords(locale: string, f: MyFill, br: BrStrings = brStrings(locale)): FillWords {
  const t = pfStrings(locale);
  const qty = decText(f.qty, locale), price = decText(f.price, locale), fee = decText(f.fee, locale);
  const liquidity = t.liq[f.liquidity];
  const tick = String(f.tick);
  return {
    side: f.side === "BUY" ? br.buy : br.sell, ticker: f.assetId, qty, price, fee: `${fee} ${f.feeCcy}`, liquidity, tick,
    aria: t.fillAria({ side: br.sideName[f.side], qty, ticker: f.assetId, price, fee, ccy: f.feeCcy, liquidity, tick }),
  };
}

export interface FillsProps { locale: string; fills: readonly MyFill[]; layout: FillsLayout }

export function Fills({ locale, fills, layout }: FillsProps) {
  const t = pfStrings(locale);
  const titleId = useId();
  const rows = [...fills].sort(byNewest).map((f) => ({ id: f.fillId, w: fillWords(locale, f) }));
  return (
    <section className="pf-fills" data-testid="pf-fills" data-layout={layout.kind === "table" ? "table" : `rows-${layout.lines}`} aria-labelledby={titleId}>
      <h3 id={titleId} className="pf-fills-title">
        {t.recentFills}
        <span className="pf-fills-count num muted" data-testid="pf-fills-count">{String(rows.length)}</span>
      </h3>
      <p className="pf-fills-help muted" data-testid="pf-fills-help">{t.fillsHelp}</p>
      {rows.length === 0 ? <p className="pf-fills-empty muted" data-testid="pf-fills-empty">{t.noFills}</p>
        : layout.kind === "table" ? (
          <table className="pf-fills-table" data-testid="pf-fills-table">
            <caption className="sr-only">{t.fillsCaption}</caption>
            <thead><tr>{FILL_COLS.map((c) => <th key={c} scope="col" className={`pf-fc-${c}`}>{t.col[c]}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ id, w }) => (
                <tr key={id} className="pf-fill" data-testid="pf-fill" data-fill={id} tabIndex={0} aria-label={w.aria}>
                  <td className="pf-fc-side" data-testid="pf-fill-side">{w.side}</td>
                  <td className="pf-fc-asset" data-testid="pf-fill-ticker">{w.ticker}</td>
                  <td className="pf-fc-qty num" data-testid="pf-fill-qty">{w.qty}</td>
                  <td className="pf-fc-price num" data-testid="pf-fill-price">{w.price}</td>
                  <td className="pf-fc-fee num" data-testid="pf-fill-fee">{w.fee}</td>
                  <td className="pf-fc-type"><Chip className="pf-fill-liq" data-testid="pf-fill-liq">{w.liquidity}</Chip></td>
                  <td className="pf-fc-tick num muted" data-testid="pf-fill-tick">{w.tick}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className={`pf-fills-list pf-fills-${layout.lines}`} data-testid="pf-fills-list">
            {rows.map(({ id, w }) => <FillRow key={id} id={id} w={w} lines={layout.lines} qtyAt={posStrings(locale).qtyAt(w.qty, w.price)} tickText={t.fillTick(w.tick)} />)}
          </ul>
        )}
    </section>
  );
}

/** 2 lines: side · ticker | liquidity / qty @ price | fee · tick. 3 lines (text scale >= 1.5): fee | tick on their own line. */
function FillRow({ id, w, lines, qtyAt, tickText }: { id: string; w: FillWords; lines: 2 | 3; qtyAt: string; tickText: string }) {
  const fee = <span className="pf-fill-fee num" data-testid="pf-fill-fee">{w.fee}</span>;
  const tick = <span className="pf-fill-tick muted" data-testid="pf-fill-tick">{tickText}</span>;
  return (
    <li className="pf-fill" data-testid="pf-fill" data-fill={id} tabIndex={0} aria-label={w.aria}>
      <span className="pf-fill-line">
        <span className="pf-fill-cluster"><span className="pf-fill-side" data-testid="pf-fill-side">{w.side}</span><span className="pf-fill-ticker" data-testid="pf-fill-ticker">{w.ticker}</span></span>
        <Chip className="pf-fill-liq" data-testid="pf-fill-liq">{w.liquidity}</Chip>
      </span>
      {lines === 2 ? (
        <span className="pf-fill-line">
          <span className="pf-fill-qtyat num" data-testid="pf-fill-qtyat">{qtyAt}</span>
          <span className="pf-fill-cluster">{fee}{tick}</span>
        </span>
      ) : (
        <>
          <span className="pf-fill-line"><span className="pf-fill-qtyat num" data-testid="pf-fill-qtyat">{qtyAt}</span></span>
          <span className="pf-fill-line">{fee}{tick}</span>
        </>
      )}
    </li>
  );
}
