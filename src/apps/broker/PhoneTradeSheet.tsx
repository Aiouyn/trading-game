"use client";
import { useEffect, useRef, useState, type KeyboardEventHandler, type ReactNode, type RefObject } from "react";
import { Sheet } from "@/components/shell/Sheet";
import { Button } from "@/components/ui/Button";
import type { BrStrings } from "./strings";

export function PhoneTradeSheet({ t, assetId, qtyRef, openSeq = 0, onDismiss, onKeyDown, children }: {
  t: BrStrings; assetId: string; qtyRef: RefObject<HTMLInputElement | null>;
  /** Bumped by a Positions Close prefill (card 27): open the sheet on the pre-filled ticket. */
  openSeq?: number;
  onDismiss: () => void; onKeyDown: KeyboardEventHandler<HTMLDivElement>; children: ReactNode;
}) {
  const label = `${t.tradeTicket} · ${assetId}`;
  const [open, setOpen] = useState(openSeq > 0);
  const scope = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const justOpened = useRef(openSeq > 0);
  const lastFocus = useRef<HTMLElement | null>(null);
  const dismiss = () => { onDismiss(); setOpen(false); };
  const seenSeq = useRef(openSeq);
  useEffect(() => {
    if (openSeq === seenSeq.current) return;
    seenSeq.current = openSeq;
    justOpened.current = true;
    setOpen(true);
  }, [openSeq]);

  useEffect(() => {
    if (!open || !scope.current) return;
    const restore = () => {
      if (!scope.current) return;
      const opening = justOpened.current;
      const at = document.activeElement;
      const inContent = !!(content.current && at instanceof Node && content.current.contains(at));
      const lastInContent = !!(lastFocus.current?.isConnected && content.current?.contains(lastFocus.current));
      const onChrome = !!(at instanceof HTMLElement && scope.current.contains(at) && content.current && !content.current.contains(at));
      // After the first content restore, keep native moves (including Close and a blurred Quantity).
      if (!opening && (inContent || lastInContent || onChrome)) return;
      const qty = qtyRef.current?.isConnected ? qtyRef.current : null;
      const action = content.current?.querySelector<HTMLElement>('button:not([disabled]):not([aria-disabled="true"])');
      // A lazy Review/Ack body may not have a control yet; don't fall back to Close, and
      // keep justOpened so the first real action can still take focus.
      if (!qty && !action) return;
      justOpened.current = false;
      (qty ?? action)?.focus();
    };
    restore();
    // PR105 loads Review/Ack through retryableLazy; the content buttons appear after this effect.
    const mo = new MutationObserver(restore);
    if (content.current) mo.observe(content.current, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [open, children, qtyRef]);

  return (
    <>
      <div className="br-trade-bar" data-testid="br-trade-bar">
        <Button variant={open ? "secondary" : "primary"} className="br-trade-fab" data-testid="br-trade"
          aria-haspopup="dialog" aria-expanded={open}
          onClick={(e) => { e.currentTarget.focus(); justOpened.current = true; setOpen(true); }}>{t.viewTrade}</Button>
      </div>
      {open && <div className="br-phone-order">
        <Sheet side="bottom" label={label} onClose={dismiss} testId="br-sheet" restoreToFirst={false}>
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
