"use client";
// Review / submitting / acked (UI cards 4 and 5). Review repeats the server's estimate and holds the Broker's only primary
// ("Place order"). The acked panel reads our IntentResult (and its MyFill) from `me`: nothing is computed here.
import type { ReactNode } from "react";
import { MoneyText } from "@/components/shell/MoneyText";
import { Button } from "@/components/ui/Button";
import { decText } from "@/apps/portfolio/positions/format";
import type { IntentResult, MyFill, Position, PreviewRes } from "@/shell/contracts/channels";
import { rejectCopy, type BrStrings } from "./strings-en";
import { fillOf, orderIdOf } from "./ticketResult";

export { fillOf, orderIdOf };

export interface ReviewBlockProps {
  t: BrStrings;
  locale: string;
  action: string;
  preview: PreviewRes | null;
  /** The estimate is older than the ticker (computedAtTick < tick): grey rows, Place disabled until the fresh one. */
  stale: boolean;
  halted: boolean;
  /** Place is live: fresh valid estimate, feed not stale, nothing sent yet. */
  canPlace: boolean;
  /** Card 19: why Place is disabled during an outage (connection lost); shown under the actions. */
  blockedReason?: string | null;
  /** `me` tick at submit while our intent is in flight; null otherwise. */
  pendingTick: number | null;
  /** Why the last Place failed: "error" (existing generic), "offline" (not sent, M2-05), "unknown" (sent, no answer). */
  failed: false | "error" | "offline" | "unknown";
  /** M2-05: the browser reports offline; Place is off and the estimate is the last received. */
  offline: boolean;
  onEdit: () => void;
  onPlace: () => void;
  /** Preview rows rendered by the first-load ticket, so this lazy chunk does not import SimpleTicket. */
  previewRows?: ReactNode;
}

export function ReviewBlock({ t, action, stale, halted, canPlace, blockedReason = null, pendingTick, failed, offline, onEdit, onPlace, previewRows }: ReviewBlockProps) {
  const submitting = pendingTick !== null;
  return (
    <section className="br-review-block" data-testid="br-review-block" aria-labelledby="br-review-title">
      <h3 id="br-review-title" className="br-action" data-testid="br-action">{action}</h3>
      {previewRows}
      {offline ? <p className="br-msg warn" data-testid="br-offline">{t.offlineNoPlace}</p>
        : stale && <p className="br-refreshing muted" data-testid="br-refreshing">{t.refreshing}</p>}
      {halted && <p className="br-queued" data-testid="br-queued">{t.haltedQueued}</p>}
      {submitting && <p className="br-pending muted" data-testid="br-pending">{t.pending(String(pendingTick))}</p>}
      {failed && <p className="br-msg warn" role="alert" data-testid="br-place-failed" data-why={failed}>{failed === "offline" ? t.placeOffline : failed === "unknown" ? t.placeUnknown : t.couldntLoad}</p>}
      <div className="br-actions">
        <Button variant="ghost" data-testid="br-edit" disabled={submitting} onClick={onEdit}>{t.edit}</Button>
        <Button variant="primary" data-testid="br-place" aria-label={t.placeAria(action)} aria-busy={submitting || undefined}
          disabled={!canPlace} aria-describedby={!canPlace && blockedReason ? "br-place-reason" : undefined} onClick={onPlace}>{t.place}</Button>
      </div>
      {!canPlace && blockedReason && <p id="br-place-reason" className="br-review-reason muted" role="status" data-testid="br-place-reason">{blockedReason}</p>}
    </section>
  );
}

export interface AckPanelProps {
  t: BrStrings;
  locale: string;
  ticker: string;
  result: IntentResult;
  fill: MyFill | null;
  position: Position | null;
  stale: boolean;
  queued: boolean;
  /** Card 5: ACCEPTED with `order:{id}` that rests (not queued for reopen): "Order placed. It's in Open orders." */
  resting: boolean;
  onNew: () => void;
  onEdit: () => void;
}

export function AckPanel({ t, locale, ticker, result, fill, position, stale, queued, resting, onNew, onEdit }: AckPanelProps) {
  if (result.status === "REJECTED") {
    const code = result.rejectCode ?? "";
    const copy = rejectCopy(t, code, result.rejectParams);
    return (
      <section className="br-ack" role="status" data-testid="br-ack" data-status="REJECTED">
        <p className="br-ack-title" data-testid="br-ack-title">{copy === null ? t.rejectedCode(code) : t.rejected}</p>
        {copy !== null && <p className="br-ack-line" data-testid="br-ack-reason">{copy}</p>}
        <div className="br-actions"><Button variant="ghost" data-testid="br-ack-edit" onClick={onEdit}>{t.edit}</Button></div>
      </section>
    );
  }
  const filled = result.status === "ACCEPTED" && fill !== null;
  return (
    <section className="br-ack" data-testid="br-ack" data-status={result.status}>
      <div className="br-receipt" role="status" data-testid="br-receipt">
        {filled ? (
          <>
            <p className="br-ack-title" data-testid="br-ack-title">
              {(fill.side === "BUY" ? t.bought : t.sold)(decText(fill.qty, locale), ticker, decText(fill.price, locale))}
            </p>
            <p className="br-ack-line num" data-testid="br-ack-fee">{t.feeLine(decText(fill.fee, locale))}</p>
          </>
        ) : (
          <>
            <p className="br-ack-title" data-testid="br-ack-title">{resting ? t.restingAck : t.received}</p>
            {queued && <p className="br-queued" data-testid="br-queued">{t.haltedQueued}</p>}
          </>
        )}
      </div>
      {filled && position !== null && (
        <div className="br-fill-position" data-testid="br-fill-position">
          <p data-testid="br-fill-holding">{t.positionHolding(decText(position.qty, locale), position.assetId)}</p>
          <p className="br-fill-pnl" data-testid="br-fill-pnl">
            <span className="muted">{stale ? t.lastKnownPnl : t.unrealizedPnl}</span>
            <MoneyText amount={position.upl} ctx="delta" />
          </p>
          <p className="muted" data-testid="br-fill-help">{t.positionPnlHelp}</p>
        </div>
      )}
      <div className="br-actions"><Button variant="ghost" data-testid="br-new" onClick={onNew}>{t.newOrder}</Button></div>
    </section>
  );
}
