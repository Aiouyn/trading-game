"use client";
import { useEffect, useRef, useState, type KeyboardEventHandler, type ReactNode, type RefObject } from "react";
import { Sheet } from "@/components/shell/Sheet";
import { Button } from "@/components/ui/Button";
import type { BrStrings } from "./strings";

export function PhoneTradeSheet({ t, assetId, qtyRef, onDismiss, onKeyDown, children }: {
  t: BrStrings; assetId: string; qtyRef: RefObject<HTMLInputElement | null>;
  onDismiss: () => void; onKeyDown: KeyboardEventHandler<HTMLDivElement>; children: ReactNode;
}) {
  const label = `${t.tradeTicket} · ${assetId}`;
  const [open, setOpen] = useState(false);
  const scope = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const justOpened = useRef(false);
  const lastFocus = useRef<HTMLElement | null>(null);
  const dismiss = () => { onDismiss(); setOpen(false); };

  useEffect(() => {
    if (!open || !scope.current) return;
    if (!justOpened.current && (scope.current.contains(document.activeElement) || lastFocus.current?.isConnected)) return;
    justOpened.current = false;
    const action = content.current?.querySelector<HTMLElement>('button:not([disabled]):not([aria-disabled="true"])');
    (qtyRef.current ?? action ?? scope.current.querySelector<HTMLElement>("button"))?.focus();
  }, [open, children, qtyRef]);

  return (
    <>
      <Button variant={open ? "secondary" : "primary"} className="br-trade-fab" data-testid="br-trade"
        aria-haspopup="dialog" aria-expanded={open}
        onClick={(e) => { e.currentTarget.focus(); justOpened.current = true; setOpen(true); }}>{t.viewTrade}</Button>
      {open && <div className="br-phone-order">
        <Sheet side="bottom" label={label} onClose={dismiss} testId="br-sheet">
          <div ref={scope} onKeyDown={onKeyDown} onFocusCapture={(e) => {
            if (e.target instanceof HTMLElement) lastFocus.current = e.target;
          }}>
            <header className="br-sheet-head">
              <h2>{label}</h2>
              <Button variant="ghost" data-testid="br-sheet-close" onClick={dismiss}>{t.closeTicket}</Button>
            </header>
            <div ref={content}>{children}</div>
          </div>
        </Sheet>
      </div>}
    </>
  );
}
