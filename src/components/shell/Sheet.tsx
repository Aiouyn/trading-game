"use client";
// 17A T5 §5: Sheet (17 §3.3.3). Bottom (phone) or right (desktop). Focus trap, Esc / scrim tap closes, focus
// returns to the opener. role="dialog" + aria-modal. No backdrop-filter, ever [P].
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Sheet({ side = "bottom", label, onClose, children, testId = "sheet" }: {
  side?: "bottom" | "right"; label: string; onClose: () => void; children: ReactNode; testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab") return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (f.length === 0) { e.preventDefault(); el.focus(); return; }
      const first = f[0]!, last = f.at(-1)!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); opener?.focus?.(); };
  }, []);
  return (
    <div className="qs-layer" data-testid={`${testId}-layer`}>
      <div className="qs-scrim" data-testid={`${testId}-scrim`} onClick={() => close.current()} />
      <div ref={ref} className={`qsheet qs-${side}`} data-testid={testId} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {side === "bottom" && <span className="qs-handle" aria-hidden="true" />}
        <div className="qs-body">{children}</div>
      </div>
    </div>
  );
}
