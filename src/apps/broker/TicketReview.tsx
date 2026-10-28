"use client";
// Review / submitting / acked (UI cards 4 and 5). Review repeats the server's estimate and holds the Broker's only primary
// ("Place order"). The acked panel reads our IntentResult (and its MyFill) from `me`: nothing is computed here.
import { Button } from "@/components/ui/Button";
import { decText } from "@/apps/portfolio/positions/format";
import type { IntentResult, MyFill, PreviewRes } from "@/shell/contracts/channels";
import { PreviewRows } from "./SimpleTicket";
import { rejectCopy, type BrStrings } from "./strings";

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
  failed: boolean;
  onEdit: () => void;
  onPlace: () => void;
}

export function ReviewBlock({ t, locale, action, preview, stale, halted, canPlace, pendingTick, failed, onEdit, onPlace }: ReviewBlockProps) {
  const submitting = pendingTick !== null;
  return (
    <section className="br-review-block" data-testid="br-review-block" aria-labelledby="br-review-title">
      <h3 id="br-review-title" className="br-action" data-testid="br-action">{action}</h3>
      {preview && <PreviewRows t={t} locale={locale} res={preview} stale={stale} />}
      {stale && <p className="br-refreshing muted" data-testid="br-refreshing">{t.refreshing}</p>}
      {halted && <p className="br-queued" data-testid="br-queued">{t.haltedQueued}</p>}
      {submitting && <p className="br-pending muted" data-testid="br-pending">{t.pending(String(pendingTick))}</p>}
      {failed && <p className="br-msg warn" role="alert" data-testid="br-place-failed">{t.couldntLoad}</p>}
      <div className="br-actions">
        <Button variant="ghost" data-testid="br-edit" disabled={submitting} onClick={onEdit}>{t.edit}</Button>
        <Button variant="primary" data-testid="br-place" aria-label={t.placeAria(action)} aria-busy={submitting || undefined}
          disabled={!canPlace} onClick={onPlace}>{t.place}</Button>
      </div>
    </section>
  );
}

/** The fill an ACCEPTED market intent names in `effects` ("fill:{id}"), if `me` carries it. */
export function fillOf(result: IntentResult, fills: readonly MyFill[]): MyFill | null {
  const ids = (result.effects ?? []).filter((e) => e.startsWith("fill:")).map((e) => e.slice(5));
  return fills.find((f) => ids.includes(f.fillId)) ?? null;
}
/** The open order an intent created ("order:{id}"), for the queued-for-reopen label and the resting ack. */
export function orderIdOf(result: IntentResult): string | null {
  const e = (result.effects ?? []).find((x) => x.startsWith("order:"));
  return e ? e.slice(6) : null;
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
