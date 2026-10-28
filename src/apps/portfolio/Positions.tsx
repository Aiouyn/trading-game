"use client";
// Positions (UI card 3, 17B PF-B): the player's holdings from `me`, with Last / Today from `ticker:wl_default`.
// Desktop: a 7-column table (Avg cost + Last hidden under 640 px of window, kept in the row label). Phone, and any
// text scale >= 1.5: 3-line cards (Studio PF-B round 2). Rows are A→Z by assetId. No tick flash, no brass.
import { Button } from "@/components/ui/Button";
import { useShell } from "@/components/shell/ShellContext";
import type { MeTradingBody, TickerBody, TickerRow } from "@/shell/contracts/channels";
import { getFeed, useChannel, type ChannelView } from "@/shell/contracts/useChannel";
import { PositionRow, type PositionData } from "./PositionRow";
import { posStrings } from "./positions/strings";
import { STACK_SCALE } from "./strings";
import "./positions.css";

export const POS_TICKER = "ticker:wl_default" as const;
/** Rows stack into cards from this text scale (#67 ruling, same threshold as the tab segment). */
export const POS_STACK_SCALE = STACK_SCALE;
const SKELETON_ROWS = 3;

export interface PositionsViewProps {
  view: ChannelView<MeTradingBody>;
  tickers: Record<string, TickerRow> | null;
  locale: string;
  cards: boolean;
  phone: boolean;
  /** Text scale >= 1.5: the fixed 3-line card with the P&L % under its amount (Studio PF-B round 2). */
  big?: boolean;
  onRetry: () => void;
}

/** A→Z by assetId; plain code-unit order so the order does not depend on the locale. */
export function sortedPositions(me: MeTradingBody): PositionData[] {
  return Object.values(me.positions).sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));
}

export function PositionsView({ view, tickers, locale, cards, phone, big = false, onRetry }: PositionsViewProps) {
  const t = posStrings(locale);
  const cls = `pos${cards ? " pos-cards" : ""}${phone ? " pos-phone" : ""}${big ? " pos-big" : ""}`;
  const layout = cards ? "cards" : "table";
  if (view.state === "loading") {
    return (
      <section className={cls} data-testid="pf-positions" data-state="loading" aria-busy="true" aria-label={t.loading}>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => <div key={i} className="pos-skel" data-testid="pos-skel" />)}
      </section>
    );
  }
  if (view.body === null) {
    return (
      <section className={cls} data-testid="pf-positions" data-state={view.state} aria-label={t.table}>
        <div className="pf-error" data-testid="pos-error">
          <span role="alert">{t.couldntLoad}</span>
          <Button className="pf-retry" data-testid="pos-retry" onClick={onRetry}>{t.retry}</Button>
        </div>
      </section>
    );
  }
  const rows = sortedPositions(view.body);
  const stale = view.state === "stale";
  const common = { t, locale, stale, layout } as const;
  return (
    <section className={cls} data-testid="pf-positions" data-state={view.state} aria-label={t.table}>
      {stale && <p className="pf-updating muted" role="status" data-testid="pos-updating">{t.updating}</p>}
      {rows.length === 0 ? (
        <div className="pos-empty" data-testid="pos-empty">
          <p className="pos-empty-title">{t.emptyTitle}</p>
          <p className="muted">{t.emptyBody}</p>
        </div>
      ) : cards ? (
        <ul className="pos-list" data-testid="pos-list">
          {rows.map((p) => <PositionRow key={p.assetId} pos={p} ticker={tickers?.[p.assetId]} {...common} />)}
        </ul>
      ) : (
        <table className="pos-table" data-testid="pos-table">
          <thead><tr>
            <th scope="col">{t.colAsset}</th>
            <th scope="col">{t.colQty}</th>
            <th scope="col" className="pos-col-avg">{t.colAvg}</th>
            <th scope="col" className="pos-col-last">{t.colLast}</th>
            <th scope="col">{t.colToday}</th>
            <th scope="col">{t.colValue}</th>
            <th scope="col" className="pos-col-weight">{t.colWeight}</th>
            <th scope="col">{t.colPnl}</th>
          </tr></thead>
          <tbody>{rows.map((p) => <PositionRow key={p.assetId} pos={p} ticker={tickers?.[p.assetId]} {...common} />)}</tbody>
        </table>
      )}
    </section>
  );
}

export function Positions({ phone }: { phone: boolean }) {
  const view = useChannel("me");
  const ticker: ChannelView<TickerBody> = useChannel(POS_TICKER);
  const locale = useShell((s) => s.prefs.locale);
  const big = useShell((s) => s.prefs.textScale >= POS_STACK_SCALE);
  return <PositionsView view={view} tickers={ticker.body?.rows ?? null} locale={locale} cards={phone || big} phone={phone} big={big} onRetry={() => getFeed().resync("me")} />;
}
