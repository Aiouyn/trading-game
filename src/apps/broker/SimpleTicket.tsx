"use client";
// Simple market ticket (UI card 4): side segment (#38, no colour), whole-number quantity (format check only), the fixed
// "Market · Day" line, the server's estimate and "Review order". Nothing here creates an intent (17-AT-07).
import { Fragment, type ReactNode, type RefObject } from "react";
import { MoneyText } from "@/components/shell/MoneyText";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { decText } from "@/apps/portfolio/positions/format";
import type { PreviewRes, Side } from "@/shell/contracts/channels";
import type { BrStrings } from "./strings";

/** The estimate rows, verbatim from PreviewRes (BRK spec). `stale` greys them while a fresh preview is due. */
export function PreviewRows({ t, locale, res, stale = false }: { t: BrStrings; locale: string; res: PreviewRes; stale?: boolean }) {
  const rows: [string, string, ReactNode][] = [
    ["price", t.price, <span key="v" className="num">{decText(res.price, locale)}</span>],
    ["estFill", t.estFill, <span key="v" className="num">{decText(res.estFill, locale)}</span>],
    ["fee", t.fee, <MoneyText key="v" amount={res.fee} ctx="table" />],
    ["impact", t.impact, <Fragment key="v"><span className="num">{t.bp(res.impactBp)}</span>{" "}<MoneyText amount={res.impactMoney} ctx="table" /></Fragment>],
    ["total", t.total, <MoneyText key="v" amount={res.total} ctx="table" />],
    ["bpAfter", t.bpAfter, <MoneyText key="v" amount={res.buyingPowerAfter} ctx="table" />],
  ];
  if (res.firstTradeCapRemaining !== null) rows.push(["capLeft", t.capLeft, <MoneyText key="v" amount={res.firstTradeCapRemaining} ctx="table" />]);
  return (
    <section className={`br-est${stale ? " stale" : ""}`} data-testid="br-est" data-stale={stale ? "1" : undefined} aria-label={t.estimateAt(String(res.computedAtTick))}>
      <p className="br-est-title muted" data-testid="br-est-title">{t.estimateAt(String(res.computedAtTick))}</p>
      <dl className="br-rows">
        {rows.map(([k, label, value]) => (
          <div key={k} className="br-row" data-testid={`br-row-${k}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export interface SimpleTicketProps {
  t: BrStrings;
  locale: string;
  side: Side;
  qtyText: string;
  onSide: (s: Side) => void;
  onQty: (text: string) => void;
  onQtyBlur: () => void;
  /** Format message under the input (qtyEmpty / qtyDigits), or the server's reasonCode copy. */
  message: { text: string; tone: "muted" | "warn" } | null;
  preview: PreviewRes | null;
  reviewDisabled: boolean;
  onReview: () => void;
  readOnly: boolean;
  qtyRef: RefObject<HTMLInputElement | null>;
}

export function SimpleTicket({ t, locale, side, qtyText, onSide, onQty, onQtyBlur, message, preview, reviewDisabled, onReview, readOnly, qtyRef }: SimpleTicketProps) {
  const msgId = "br-qty-msg";
  return (
    <section className="br-ticket" data-testid="br-ticket" aria-label={t.orderKind}>
      <div className="br-field">
        <Label id="br-side-label">{t.side}</Label>
        <div className="br-seg" role="group" aria-labelledby="br-side-label" data-testid="br-side">
          {(["BUY", "SELL"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={side === s} data-testid={`br-side-${s.toLowerCase()}`} disabled={readOnly} onClick={() => onSide(s)}>
              {s === "BUY" ? t.buy : t.sell}
            </button>
          ))}
        </div>
      </div>
      <label className="br-field">
        <Label>{t.qty}</Label>
        <input ref={qtyRef} className="br-qty num" data-testid="br-qty" inputMode="numeric" autoComplete="off" value={qtyText} readOnly={readOnly}
          aria-invalid={message?.tone === "warn" || undefined} aria-describedby={message ? msgId : undefined}
          onChange={(e) => onQty(e.target.value)} onBlur={onQtyBlur} />
      </label>
      {message && <p id={msgId} className={`br-msg ${message.tone}`} data-testid="br-qty-msg">{message.text}</p>}
      <p className="br-kind muted" data-testid="br-kind">{t.orderKind}</p>
      {preview && <PreviewRows t={t} locale={locale} res={preview} />}
      <p className="br-note muted" data-testid="br-note">{t.note}</p>
      <Button variant="secondary" className="br-review" data-testid="br-review" disabled={reviewDisabled} onClick={onReview}>{t.review}</Button>
    </section>
  );
}
