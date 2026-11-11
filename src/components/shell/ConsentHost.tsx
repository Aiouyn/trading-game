"use client";
// Tiny host in the shell. The prompt chunk is imported only after the first user
// interaction, so a guest /broker first-load (quay-ready + networkidle) does not
// request it — same budget rule as the Feedback form.
import { Suspense, useEffect, useState, type ComponentType } from "react";
import { needsTelemetryConsentPrompt } from "@/shell/telemetryClient";

const loadPrompt = () => import("./ConsentPrompt").then((m) => ({ default: m.ConsentPrompt }));
let Prompt: ComponentType<{ onDone: () => void }> | null = null;

export function ConsentHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!needsTelemetryConsentPrompt()) return;
    let cancelled = false;
    const start = () => {
      if (cancelled || Prompt) {
        if (!cancelled && Prompt && needsTelemetryConsentPrompt()) setOpen(true);
        return;
      }
      void loadPrompt().then((m) => {
        Prompt = m.default;
        if (!cancelled && needsTelemetryConsentPrompt()) setOpen(true);
      });
    };
    const opts = { once: true } as const;
    window.addEventListener("pointerdown", start, opts);
    window.addEventListener("keydown", start, opts);
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, []);

  if (!open || !Prompt) return null;
  return (
    <Suspense fallback={null}>
      <Prompt onDone={() => setOpen(false)} />
    </Suspense>
  );
}
