"use client";
// Order type (UI card 5, BRK-A ProTicket slice): Market · Limit · Stop · Stop limit, TIF fixed Day. A #38 segment under
// Side and the type's price boxes (stop first). The boxes check format only (`parsePriceInput`); tick size, bands and
// which side of the market a stop sits on are the server's `valid` / `reasonCode` (card 5 Gap 2).
import { useLayoutEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/Label";
import { decText } from "@/apps/portfolio/positions/format";
import { parsePriceInput, type DayOrderType } from "@/shell/contracts/orders";
import type { BrStrings } from "./strings";
import "./openOrders.css";

export const ORDER_TYPES: readonly DayOrderType[] = ["market", "limit", "stop", "stop_limit"];
const TYPE_KEY = { market: "market", limit: "limit", stop: "stop", stop_limit: "stopLimit" } as const satisfies Record<DayOrderType, keyof BrStrings["t"]>;

/** Wire type -> label. A type this build does not know (server added one) shows as sent. */
export function typeLabel(t: BrStrings, type: string): string {
  return type in TYPE_KEY ? t.t[TYPE_KEY[type as DayOrderType]] : type;
}

/** "Market" / "Limit 42.10" / "Stop 40.00" / "Stop 40.00 · Limit 39.80": the prices are server or sent strings, via decText. */
export function termsText(t: BrStrings, locale: string, o: { type: string; limit?: string; stop?: string }): string {
  const d = (s: string | undefined) => decText(s ?? "", locale);
  switch (o.type) {
    case "limit": return t.termsLimit(d(o.limit));
    case "stop": return t.termsStop(d(o.stop));
    case "stop_limit": return t.termsStopLimit(d(o.stop), d(o.limit));
    default: return typeLabel(t, o.type);
  }
}

/** Which price boxes a type shows, in display order (stop first). */
export const priceFields = (type: DayOrderType): readonly ("stop" | "limit")[] =>
  type === "limit" ? ["limit"] : type === "stop" ? ["stop"] : type === "stop_limit" ? ["stop", "limit"] : [];

/** Field copy for one price box: empty (once touched) or bad format; null when the format is fine. */
export function priceMessage(t: BrStrings, text: string, touched: boolean): { text: string; tone: "muted" | "warn" } | null {
  const p = parsePriceInput(text);
  return p.kind === "badFormat" ? { text: t.priceFormat, tone: "warn" } : p.kind === "empty" && touched ? { text: t.priceEmpty, tone: "muted" } : null;
}

export interface OrderTypeProps {
  t: BrStrings;
  type: DayOrderType;
  limitText: string;
  stopText: string;
  readOnly: boolean;
  /** Text scale >= BR_STACK_SCALE: the segment stacks whatever the width. */
  stacked: boolean;
  onType: (type: DayOrderType) => void;
  onPrice: (field: "limit" | "stop", text: string) => void;
}

export function OrderType({ t, type, limitText, stopText, readOnly, stacked, onType, onPrice }: OrderTypeProps) {
  const overflow = useSegOverflow();
  const [touched, setTouched] = useState({ limit: false, stop: false });
  const text = { limit: limitText, stop: stopText };
  return (
    <>
      <div className="br-field">
        <Label id="br-type-label">{t.orderType}</Label>
        <div ref={overflow.ref} className={`br-seg br-type-seg${stacked || overflow.on ? " br-seg-stack" : ""}`} role="group" aria-labelledby="br-type-label" data-testid="br-type">
          {ORDER_TYPES.map((k) => (
            <button key={k} type="button" aria-pressed={type === k} data-testid={`br-type-${k}`} disabled={readOnly} onClick={() => onType(k)}>
              {typeLabel(t, k)}
            </button>
          ))}
        </div>
      </div>
      {priceFields(type).map((f) => {
        const msg = priceMessage(t, text[f], touched[f]);
        const msgId = `br-price-${f}-msg`;
        return (
          <div key={f} className="br-price-field">
            <label className="br-field">
              <Label>{f === "limit" ? t.limitPrice : t.stopPrice}</Label>
              <input className="br-qty br-price num" data-testid={`br-price-${f}`} inputMode="decimal" autoComplete="off" value={text[f]} readOnly={readOnly}
                aria-invalid={msg?.tone === "warn" || undefined} aria-describedby={msg ? msgId : undefined}
                onChange={(e) => { setTouched((s) => ({ ...s, [f]: true })); onPrice(f, e.target.value); }}
                onBlur={() => setTouched((s) => ({ ...s, [f]: true }))} />
            </label>
            {msg && <p id={msgId} className={`br-msg ${msg.tone}`} data-testid={`br-price-${f}-msg`}>{msg.text}</p>}
          </div>
        );
      })}
    </>
  );
}

/** The four buttons no longer fit on one line: stack them. Remembers the one-line width so a wider window un-stacks. */
function useSegOverflow() {
  const ref = useRef<HTMLDivElement>(null);
  const need = useRef(0);
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => {
      if (!el.classList.contains("br-seg-stack")) need.current = el.scrollWidth;
      const room = el.parentElement?.clientWidth ?? el.clientWidth;
      setOn(need.current > room);
    };
    check();
    const ro = new ResizeObserver(check);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, []);
  return { ref, on };
}
