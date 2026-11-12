"use client";
// Loaded only after the first user interaction (see ConsentBoot in QuayShell), so a guest
// /broker first-load does not request this chunk or the prompt's copy.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { needsTelemetryConsentPrompt } from "@/shell/telemetryConsent";
import { SHELF_H, viewportOf } from "@/shell/wm";
import { useShell, useShellStore } from "./ShellContext";
import { ConsentPrompt } from "./ConsentPrompt";

export function ConsentHost() {
  const [open, setOpen] = useState(() => needsTelemetryConsentPrompt());
  const store = useShellStore();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const slot = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      store.getState().setConsentH(0);
      return;
    }
    // Phone: the prompt sits in a layout slot above the bottom row; no work-area reserve.
    if (phone) {
      store.getState().setConsentH(0);
      return;
    }
    const apply = () => {
      const el = slot.current?.querySelector("[data-testid=quay-consent]") ?? slot.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const shelfTop = window.innerHeight - SHELF_H;
      store.getState().setConsentH(Math.max(0, Math.ceil(shelfTop - top)));
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (slot.current) ro.observe(slot.current);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      store.getState().setConsentH(0);
    };
  }, [open, phone, store]);

  if (!open) return null;
  const tree: ReactNode = (
    <div ref={slot}>
      <ConsentPrompt onDone={() => setOpen(false)} />
    </div>
  );
  // PhoneHome keeps a stable [data-testid=consent-dock] in the flex column. Querying it
  // here (instead of storing it in an effect) ports the strip into reserved in-flow space.
  if (phone && typeof document !== "undefined") {
    const dock = document.querySelector("[data-testid=consent-dock]");
    if (dock) return createPortal(tree, dock);
  }
  return tree;
}
