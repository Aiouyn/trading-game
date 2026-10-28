"use client";
// Open orders (UI card 5, BRK-C OrdersTabs slice): `me.orders` for every asset, read-only. No Cancel / Modify and no
// disabled placeholder (card 6). Every value is the server's string (decText regroups for the locale); the list only
// sorts by tick numbers and orderId, never by money.
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { decText } from "@/apps/portfolio/positions/format";
import type { MeTradingBody, OpenOrder } from "@/shell/contracts/channels";
import { getFeed, type ChannelView } from "@/shell/contracts/useChannel";
import { termsText } from "./OrderType";
import type { BrStrings } from "./strings";
import "./openOrders.css";

/** placedTick desc, then orderId (code-unit order). Ticks are numbers; nothing here is money. */
export function byRecent(a: OpenOrder, b: OpenOrder): number {
  if (a.placedTick !== b.placedTick) return a.placedTick > b.placedTick ? -1 : 1;
  return a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0;
}

export function statusText(t: BrStrings, status: string): string {
  if (status === "QUEUED_AUCTION") return t.haltedQueued;
  return status in t.s ? t.s[status as keyof BrStrings["s"]] : status;
}

export interface OpenOrdersProps {
  t: BrStrings;
  locale: string;
  me: ChannelView<MeTradingBody>;
  /** The order our last Place rested, during the tick its ack arrived (1-tick highlight). */
  freshId: string | null;
}

export function OpenOrders({ t, locale, me, freshId }: OpenOrdersProps) {
  const orders = me.body ? Object.values(me.body.orders).sort(byRecent) : [];
  return (
    <section className="br-oo" data-testid="br-oo" data-oo="1" data-state={me.state} aria-labelledby="br-oo-title" aria-busy={me.state === "loading" || undefined}>
      <h3 id="br-oo-title" className="br-oo-title">
        {t.openOrders}
        {me.body && <span className="br-oo-count num muted" data-testid="br-oo-count">{String(orders.length)}</span>}
      </h3>
      {me.state === "loading" && (
        <div className="br-oo-skel" data-testid="br-oo-loading" aria-label={t.loadingOrders}>
          <div className="br-skel br-oo-skel-row" />
          <div className="br-skel br-oo-skel-row" />
        </div>
      )}
      {(me.state === "denied" || me.state === "error") && (
        <div className="br-oo-error" data-testid="br-oo-error">
          <span>{t.couldntLoad}</span>
          <Button data-testid="br-oo-retry" onClick={() => getFeed().resync("me")}>{t.retry}</Button>
        </div>
      )}
      {me.state === "stale" && <p className="br-oo-updating muted" data-testid="br-oo-updating">{t.updating}</p>}
      {me.body && orders.length === 0 && <p className="br-oo-empty muted" data-testid="br-oo-empty">{t.noOpenOrders}</p>}
      {orders.length > 0 && (
        <ul className="br-oo-list" data-testid="br-oo-list">
          {orders.map((o) => <Row key={o.orderId} t={t} locale={locale} o={o} fresh={o.orderId === freshId} />)}
        </ul>
      )}
    </section>
  );
}

function Row({ t, locale, o, fresh }: { t: BrStrings; locale: string; o: OpenOrder; fresh: boolean }) {
  const side = o.side === "BUY" ? t.buy : t.sell;
  const terms = termsText(t, locale, o);
  const qty = decText(o.qty, locale);
  const amount = o.filled !== "0" ? t.filledOf(decText(o.filled, locale), qty) : qty;
  const status = statusText(t, o.status);
  return (
    <li className={`br-oo-row${fresh ? " fresh" : ""}`} data-testid={`br-oo-row-${o.orderId}`} data-fresh={fresh ? "1" : undefined} data-status={o.status}
      tabIndex={0} aria-label={t.rowAria(side, amount, o.assetId, terms, status)}>
      <span className="br-oo-side" data-testid="br-oo-side">{side}</span>
      <span className="br-oo-ticker" data-testid="br-oo-ticker">{o.assetId}</span>
      <span className="br-oo-terms num" data-testid="br-oo-terms">{terms}</span>
      <span className="br-oo-qty num" data-testid="br-oo-qty">{amount}</span>
      <Chip className="br-oo-chip" data-testid="br-oo-status">{status}</Chip>
      <span className="br-oo-meta muted" data-testid="br-oo-meta">{t.rowMeta(String(o.placedTick))}</span>
    </li>
  );
}
