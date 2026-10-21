"use client";
import { useEffect, useState } from "react";
import { Banner, WorldEventBanner, type Alert, type WorldEvent } from "@/components/shell/Banner";
import { Sheet } from "@/components/shell/Sheet";
import { HaltChip, HaltLayer, orderEntryLock, SystemOverlay, type OverlayKind } from "@/components/shell/SystemOverlays";
import { Button } from "@/components/ui/Button";
import { PALETTE_IDS, type PaletteId } from "@/styles/tokens";
import { APP_NAMES } from "@/shell/strings";

// Demo data only (not copy): exercises the components' states for tests and screenshots.
const P0: Alert = { id: "a1", priority: "P0", text: "Margin call: equity below maintenance on 2 positions", action: { label: "Open Risk", href: "/risk" } };
const P0b: Alert = { id: "a2", priority: "P0", text: "Second P0 (queued)", action: { label: "Open Broker", href: "/broker" } };
const P1: Alert = { id: "a3", priority: "P1", text: "Order partly filled: 400 of 1,000 GX", action: { label: "Open Broker", href: "/broker" } };
export const DEMO_EVENT: WorldEvent = { name: "Crash", day: 3, index: "GX", sincePct: "-18.40", todayPct: "-2.10" };
const RECENT = (["broker", "portfolio", "wire", "markets"] as const).map((a) => APP_NAMES[a]);

export function NoticesSheet({ show, palette }: { show: string; palette: string }) {
  useEffect(() => {
    if ((PALETTE_IDS as readonly string[]).includes(palette)) document.documentElement.dataset.palette = palette as PaletteId;
  }, [palette]);
  const parts = new Set(show.split(","));
  const alerts: Alert[] = parts.has("two-p0") ? [P0, P0b] : parts.has("alert") || parts.has("both") ? [P0] : parts.has("p1") ? [P1] : [];
  const event = parts.has("world") || parts.has("both") ? DEMO_EVENT : null;
  const [sheet, setSheet] = useState<"bottom" | "right" | null>(parts.has("sheet-right") ? "right" : parts.has("sheet-bottom") ? "bottom" : null);
  const overlay = (["disconnected", "update"] as OverlayKind[]).find((k) => parts.has(k));
  const [halted, setHalted] = useState(parts.has("halted"));
  const lock = orderEntryLock(halted);
  return (
    <div className="quay is-desktop ds-notices" data-testid="ds-notices">
      <div className="ds-strip" data-testid="ds-strip"><HaltChip halted={halted} /></div>
      <Banner alerts={alerts} />
      <WorldEventBanner event={event} />
      <main className="ds-notices-desk" data-testid="ds-desk">
        {parts.has("orderpad") && <div className="ds-orderpad" data-testid="mock-orderpad">{"OrderPad (mock)"}</div>}
        {parts.has("haltflow") && <Button data-testid="toggle-halt" onClick={() => setHalted((h) => !h)}>{"Toggle halt (mock)"}</Button>}
        <span title={lock.reason ?? undefined} data-testid="order-entry-wrap"><Button variant="primary" disabled={lock.disabled} data-testid="mock-order-entry" aria-describedby={lock.reason ? "order-lock-reason" : undefined}>{"Place order (mock)"}</Button></span>
        {lock.reason && <span id="order-lock-reason" className="sr-only">{lock.reason}</span>}
        <Button data-testid="open-sheet" onClick={() => setSheet(parts.has("phone") ? "bottom" : "right")}>{"Open sheet"}</Button>
        <div className="ds-readonly" data-testid="readonly-window" tabIndex={0} role="region" aria-label={"Read-only window (mock)"}>
          {Array.from({ length: 60 }, (_, i) => <p key={i}>{`Read-only row ${i + 1}`}</p>)}
        </div>
      </main>
      {sheet && (
        <Sheet side={sheet} label={"Recent"} onClose={() => setSheet(null)}>
          <ul className="ds-sheet-list">{RECENT.map((n) => <li key={n}><Button variant="ghost">{n}</Button></li>)}</ul>
        </Sheet>
      )}
      {overlay && <SystemOverlay kind={overlay} onAction={() => {}} />}
      <HaltLayer halted={halted} />
    </div>
  );
}
