"use client";
// Broker header (UI card 4): ticker, Last, Today (price direction only), Halted chip, holding and FDL cash.
// Every number is the server's string, only regrouped for the locale (decText / signedText / formatPercent).
// UI card 10: the muted company name under the ticker, "TICKER · Name" select options, and the Quote shared with the
// asset page's Overview (one component, so both read the same text at the same tick).
import { MoneyText } from "@/components/shell/MoneyText";
import { Chip } from "@/components/ui/Chip";
import { Label } from "@/components/ui/Label";
import { formatPercent } from "@/components/ui/percent";
import { ARROW, DIR_CLASS, decText, direction, signedText } from "@/apps/portfolio/positions/format";
import { assetName } from "@/shell/contracts/assetDetail";
import type { TickerRow } from "@/shell/contracts/channels";
import type { ReactNode } from "react";
import type { BrStrings } from "./strings";

export interface AssetHeaderProps {
  /** UI card 7: the price chart, under the quote and above the holdings line. */
  chart?: ReactNode;
  t: BrStrings;
  locale: string;
  assetId: string;
  row: TickerRow | undefined;
  /** Select options when the window has no asset context (ticker keys A→Z); null when the context names the asset. */
  choices: readonly string[] | null;
  onPick: (assetId: string) => void;
  holdQty: string | null;
  cash: string | undefined;
  /** UI card 10: Back to trade focuses the ticker heading (or the select in a no-context window). */
  focusRef?: (el: HTMLElement | null) => void;
}

/** "+0.28%" / "−0.28%": formatPercent gives the locale's digits and minus; the "+" is a sign, as in signedText. */
function pctText(chgPct: string, locale: string): string {
  const p = formatPercent(chgPct, locale) ?? chgPct;
  return direction(chgPct) === "up" && !chgPct.startsWith("+") ? `+${p}` : p;
}

export function Today({ row, locale, t, testId = "br-today" }: { row: TickerRow | undefined; locale: string; t: BrStrings; testId?: string }) {
  if (!row || row.chg === null) return <span className="br-today muted num" data-testid={testId}>{t.none}</span>;
  const dir = direction(row.chg);
  const pct = row.chgPct === null ? null : pctText(row.chgPct, locale);
  return (
    <span className={`br-today num ${DIR_CLASS[dir]}`} data-testid={testId} data-dir={dir}>
      {ARROW[dir] && <span aria-hidden="true">{ARROW[dir]}</span>}
      {signedText(row.chg, locale)}
      {pct !== null && ` (${pct})`}
    </span>
  );
}

/** Last and Today. `ids` prefixes the testids ("br" in the header, so `br-last` / `br-today`). */
export function Quote({ row, locale, t, ids = "br" }: { row: TickerRow | undefined; locale: string; t: BrStrings; ids?: string }) {
  return (
    <div className="br-quote">
      <span className="br-q">
        <Label>{t.last}</Label>
        <span className="br-last num" data-testid={`${ids}-last`}>{row ? decText(row.last, locale) : t.none}</span>
      </span>
      <span className="br-q">
        <Label>{t.today}</Label>
        <Today row={row} locale={locale} t={t} testId={`${ids}-today`} />
      </span>
    </div>
  );
}

export function AssetHeader({ t, locale, assetId, row, choices, onPick, holdQty, cash, chart, focusRef }: AssetHeaderProps) {
  const name = choices ? null : assetName(assetId);
  return (
    <header className="br-head" data-testid="br-head">
      <div className="br-title">
        {choices ? (
          <label className="br-pick">
            <Label>{t.asset}</Label>
            <select ref={focusRef} className="br-select" data-testid="br-asset-select" value={assetId} onChange={(e) => onPick(e.target.value)}>
              {choices.map((k) => { const n = assetName(k); return <option key={k} value={k}>{n === null ? k : t.assetOption(k, n)}</option>; })}
            </select>
          </label>
        ) : (
          <h2 ref={focusRef} className="br-ticker" data-testid="br-ticker" tabIndex={-1}>{assetId}</h2>
        )}
        {row?.halted && <Chip tone="steel" outline className="br-halted" data-testid="br-halted">{t.halted}</Chip>}
      </div>
      {name !== null && <p className="br-name muted" data-testid="br-name">{name}</p>}
      <Quote row={row} locale={locale} t={t} />
      {chart}
      <p className="br-hold muted" data-testid="br-hold">
        {holdQty !== null && <><span data-testid="br-you-hold">{t.youHold(decText(holdQty, locale))}</span><span aria-hidden="true">{" · "}</span></>}
        <span className="br-cash">{t.cash} {cash === undefined ? t.none : <MoneyText amount={cash} ctx="table" />}</span>
      </p>
    </header>
  );
}
