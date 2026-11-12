"use client";
// Review / submitting / acked (UI cards 4 and 5). Review repeats the server's estimate and holds the Broker's only primary
// ("Place order"). The acked panel reads our IntentResult (and its MyFill) from `me`: nothing is computed here.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { decText } from "@/apps/portfolio/positions/format";
import type { IntentResult, MyFill, PreviewRes } from "@/shell/contracts/channels";
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
  /** `me` tick at submit while our intent is in flight; null otherwise. */
  pendingTick: number | null;
  /** Why the last Place failed: "error" (existing generic), "offline" (not sent, M2-05), "unknown" (sent, no answer). */
  failed: false | "error" | "offline" | "unknown";
  /** M2-05: the browser reports offline; Place is off and the estimate is the last received. */
  offline: boolean;
  onEdit: () => void;
  onPlace: () => void;
  /** Stop / stop-limit: "Sells if price falls to …" / "Buys if price rises to …". */
  trigger?: string | null;
  /** Preview rows rendered by the first-load ticket, so this lazy chunk does not import SimpleTicket. */
  previewRows?: ReactNode;
}

/** Keep the trigger line and Place inside the ticket column (or window body) of a short 840×560 window. */
function scrollReviewIntoColumn(block: HTMLElement) {
  const trigger = block.querySelector<HTMLElement>("[data-testid=br-trigger]");
  const place = block.querySelector<HTMLElement>("[data-testid=br-place]");
  const top = trigger ?? place ?? block;
  const bottom = place ?? trigger ?? block;
  if (block.closest(".br-phone")) return;
  const winBody = block.closest(".win-body");
  /* A tall edit form leaves the window body scrolled down; Review is shorter and sits at the top. */
  if (winBody instanceof HTMLElement) winBody.scrollTop = 0;
  const col = block.closest(".br-col-ticket");
  const box = (col instanceof HTMLElement ? col : winBody);
  if (!(box instanceof HTMLElement)) {
    top.scrollIntoView({ block: "nearest" });
    bottom.scrollIntoView({ block: "nearest" });
    return;
  }
  if (box.scrollHeight <= box.clientHeight + 1) {
    box.scrollTop = 0;
    return;
  }
  const cr = box.getBoundingClientRect();
  const t = top.getBoundingClientRect();
  if (t.top < cr.top) box.scrollTop -= cr.top - t.top;
  const b2 = bottom.getBoundingClientRect();
  if (b2.bottom > cr.bottom) box.scrollTop += b2.bottom - cr.bottom;
  const t2 = top.getBoundingClientRect();
  if (t2.top < cr.top) box.scrollTop -= cr.top - t2.top;
}

export function ReviewBlock({ t, action, stale, halted, canPlace, pendingTick, failed, offline, onEdit, onPlace, trigger, previewRows }: ReviewBlockProps) {
  const submitting = pendingTick !== null;
  const blockRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      if (blockRef.current) scrollReviewIntoColumn(blockRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [trigger, submitting]);
  return (
    <section ref={blockRef} className="br-review-block" data-testid="br-review-block" aria-labelledby="br-review-title">
      <h3 id="br-review-title" className="br-action" data-testid="br-action">{action}</h3>
      {trigger && <p className="br-note" data-testid="br-trigger">{trigger}</p>}
      {previewRows}
      {offline ? <p className="br-msg warn" data-testid="br-offline">{t.offlineNoPlace}</p>
        : stale && <p className="br-refreshing muted" data-testid="br-refreshing">{t.refreshing}</p>}
      {halted && <p className="br-queued" data-testid="br-queued">{t.haltedQueued}</p>}
      {submitting && <p className="br-pending muted" data-testid="br-pending">{t.pending(String(pendingTick))}</p>}
      {failed && <p className="br-msg warn" role="alert" data-testid="br-place-failed" data-why={failed}>{failed === "offline" ? t.placeOffline : failed === "unknown" ? t.placeUnknown : t.couldntLoad}</p>}
      <div className="br-actions">
        <Button variant="ghost" data-testid="br-edit" disabled={submitting} onClick={onEdit}>{t.edit}</Button>
        <Button variant="primary" data-testid="br-place" aria-label={t.placeAria(action)} aria-busy={submitting || undefined}
          disabled={!canPlace} onClick={onPlace}>{t.place}</Button>
      </div>
    </section>
  );
}

export interface AckPanelProps {
  t: BrStrings;
  locale: string;
  ticker: string;
  result: IntentResult;
  fill: MyFill | null;
  queued: boolean;
  /** Card 5: ACCEPTED with `order:{id}` that rests (not queued for reopen): "Order placed. It's in Open orders." */
  resting: boolean;
  onNew: () => void;
  onEdit: () => void;
}

export function AckPanel({ t, locale, ticker, result, fill, queued, resting, onNew, onEdit }: AckPanelProps) {
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
    <section className="br-ack" role="status" data-testid="br-ack" data-status={result.status}>
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
      <div className="br-actions"><Button variant="ghost" data-testid="br-new" onClick={onNew}>{t.newOrder}</Button></div>
    </section>
  );
}
