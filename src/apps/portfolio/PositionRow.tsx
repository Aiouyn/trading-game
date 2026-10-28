"use client";
// One position (UI card 3, 17B PF-B). Table row (desktop) or 3-line card (phone, or text scale >= 1.5; Studio PF-B round 2).
// Strings are the contract's, regrouped only (PF-3-02); MoneyText formats Value and P&L. No brass on the row.
import { Chip } from "@/components/ui/Chip";
import { Glyph } from "@/components/shell/Glyph";
import { MoneyText, speakMoney } from "@/components/shell/MoneyText";
import type { Position, TickerRow } from "@/shell/contracts/channels";
import { ARROW, DIR_CLASS, decText, direction, signedText, unsigned } from "./positions/format";
import type { MarginState, PosStrings } from "./positions/strings";

/** E-56 §15 row fields not in Position yet (the strict schema rejects extra keys), so they render only when present;
 *  Studio PF-B ruling governs how. pnlPct / weightPct are optional Position fields (proposed, Engine to confirm). */
export interface PositionExtras { marginState?: MarginState | null; liqPrice?: string | null }
export type PositionData = Position & PositionExtras;

export interface RowProps { pos: PositionData; ticker: TickerRow | undefined; t: PosStrings; locale: string; stale: boolean; layout: "table" | "cards" }

export function rowLabel(pos: PositionData, ticker: TickerRow | undefined, t: PosStrings, locale: string): string {
  const pct = ticker?.chgPct ?? null;
  const last = ticker?.last ?? pos.mark;
  return t.rowLabel(pos.assetId, decText(pos.qty, locale), speakMoney(pos.value), pct === null ? null : direction(pct), unsigned(pct ?? ""))
    + t.avgLast(decText(pos.avgCost, locale), decText(last, locale));
}

export function Today({ pct, t, locale }: { pct: string | null; t: PosStrings; locale: string }) {
  if (pct === null) return <span className="pos-today muted" data-testid="pos-today">{t.none}</span>;
  const dir = direction(pct);
  return (
    <span className={`pos-today num ${DIR_CLASS[dir]}`} data-testid="pos-today" data-dir={dir}>
      {ARROW[dir] && <span className="pos-arrow" aria-hidden="true">{ARROW[dir]}</span>}{t.pct(decText(pct, locale))}
    </span>
  );
}

/** P&L amount (arrow + signed MoneyText), then pnlPct as sent in --fg-muted: "▲+$618.00 (+4.4%)". */
export function Pnl({ upl, pct, t, locale }: { upl: string; pct?: string | null; t: PosStrings; locale: string }) {
  const dir = direction(upl);
  return (
    <span className="pos-pnl-cell" data-testid="pos-pnl-cell">
      <span className={`pos-pnl ${DIR_CLASS[dir]}`} data-testid="pos-pnl" data-dir={dir}>
        {ARROW[dir] && <span className="pos-arrow" aria-hidden="true">{ARROW[dir]}</span>}<MoneyText amount={upl} ctx="delta" />
      </span>
      {pct ? <span className="pos-pnl-pct num" data-testid="pos-pnl-pct">{t.pnlPct(signedText(pct, locale))}</span> : null}
    </span>
  );
}

/** weightPct as sent, "4.4%", or nothing when absent. */
export function Weight({ pct, t, locale }: { pct?: string | null; t: PosStrings; locale: string }) {
  return pct ? <span className="pos-weight num" data-testid="pos-weight">{t.pct(decText(pct, locale))}</span> : null;
}

/** Studio PF-B: liqPrice "≈ {value}" + small-caps "approx." in --fg-muted; spoken "Liquidation price, approximate, {value}". */
export function LiqPrice({ value, t, locale }: { value: string; t: PosStrings; locale: string }) {
  const v = decText(value, locale);
  return (
    <span className="pos-liq num" data-testid="pos-liq" role="img" aria-label={t.liqAria(v)}>
      <span className="pos-liq-label" aria-hidden="true">{t.liq}</span> <span aria-hidden="true">{t.approxValue(v)}</span> <span className="pos-approx" aria-hidden="true">{t.approx}</span>
    </span>
  );
}

/** Studio PF-B: no chip for OK; CALL --signal; LIQUIDATING / DEFICIT --loss + alert glyph; CLOSED --fg-disabled. */
export function MarginChip({ state, t }: { state: MarginState | null | undefined; t: PosStrings }) {
  if (!state || state === "OK") return null;
  const alert = state === "LIQUIDATING" || state === "DEFICIT";
  const cls = state === "CALL" ? "pos-margin-call" : alert ? "pos-margin-alert" : "pos-margin-closed";
  return <Chip outline className={`pos-margin ${cls}`} data-testid="pos-margin" data-state={state}>{alert && <Glyph name="alert" size={12} />}{t.margin[state]}</Chip>;
}

function Badges({ pos, ticker, t, locale }: { pos: PositionData; ticker: TickerRow | undefined; t: PosStrings; locale: string }) {
  const pledged = pos.pledgedQty !== "0", lent = pos.lentQty !== "0";
  const any = pledged || lent || ticker?.halted || (pos.marginState && pos.marginState !== "OK") || pos.liqPrice;
  if (!any) return null;
  return (
    <span className="pos-badges">
      {ticker?.halted && <Chip outline className="pos-chip pos-halted" data-testid="pos-halted">{t.halted}</Chip>}
      {pledged && <Chip outline className="pos-chip" data-testid="pos-pledged">{t.pledged(decText(pos.pledgedQty, locale))}</Chip>}
      {lent && <Chip outline className="pos-chip" data-testid="pos-lent">{t.lent(decText(pos.lentQty, locale))}</Chip>}
      <MarginChip state={pos.marginState} t={t} />
      {pos.liqPrice ? <LiqPrice value={pos.liqPrice} t={t} locale={locale} /> : null}
    </span>
  );
}

export function PositionRow({ pos, ticker, t, locale, stale, layout }: RowProps) {
  const last = ticker?.last ?? pos.mark;
  const label = rowLabel(pos, ticker, t, locale);
  const lastCls = `num pos-last${stale ? " pos-stale" : ""}`;
  if (layout === "cards") {
    return (
      <li className="pos-card" tabIndex={0} aria-label={label} data-testid="pos-row" data-asset={pos.assetId}>
        <div className="pos-line pos-line1">
          <span className="pos-ticker" data-testid="pos-ticker">{pos.assetId}</span>
          <Pnl upl={pos.upl} pct={pos.pnlPct} t={t} locale={locale} />
        </div>
        <div className="pos-line pos-line2">
          <span className="pos-value-w">
            <span className="pos-value" data-testid="pos-value"><MoneyText amount={pos.value} ctx="table" /></span>
            {pos.weightPct ? <><span className="pos-dot" aria-hidden="true">{t.dot}</span><Weight pct={pos.weightPct} t={t} locale={locale} /></> : null}
          </span>
        </div>
        <div className="pos-line pos-line3">
          <span className="num pos-qtyat" data-testid="pos-qtyat">{t.qtyAt(decText(pos.qty, locale), decText(pos.avgCost, locale))}</span>
          <Today pct={ticker?.chgPct ?? null} t={t} locale={locale} />
        </div>
        <Badges pos={pos} ticker={ticker} t={t} locale={locale} />
      </li>
    );
  }
  return (
    <tr className="pos-tr" tabIndex={0} aria-label={label} data-testid="pos-row" data-asset={pos.assetId}>
      <th scope="row" className="pos-asset"><span className="pos-ticker">{pos.assetId}</span><Badges pos={pos} ticker={ticker} t={t} locale={locale} /></th>
      <td className="num" data-testid="pos-qty">{decText(pos.qty, locale)}</td>
      <td className="num pos-col-avg" data-testid="pos-avg">{decText(pos.avgCost, locale)}</td>
      <td className={`${lastCls} pos-col-last`} data-testid="pos-last">{decText(last, locale)}</td>
      <td><Today pct={ticker?.chgPct ?? null} t={t} locale={locale} /></td>
      <td data-testid="pos-value"><MoneyText amount={pos.value} ctx="table" /></td>
      <td className="pos-col-weight"><Weight pct={pos.weightPct} t={t} locale={locale} /></td>
      <td><Pnl upl={pos.upl} pct={pos.pnlPct} t={t} locale={locale} /></td>
    </tr>
  );
}
