"use client";
// Switch and segmented control for Settings, to Studio's #38 rulings (sizes in settings.css).
import { useId, useLayoutEffect, useRef, useState } from "react";

export function Switch({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  const id = useId();
  return (
    <div className="set-row">
      <span id={id} className="set-row-label">{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} data-testid={testId} className="set-switch" onClick={() => onChange(!checked)}>
        <span className="set-switch-track" aria-hidden="true"><span className="set-switch-knob" /></span>
      </button>
    </div>
  );
}

export function Segment<T extends string>({ label, value, options, onChange, testId, stacked = false }: {
  label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; testId?: string; stacked?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const overflow = useRowOverflow(ref);
  const stack = stacked || overflow;
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.id === value);
    onChange(options[(i + dir + options.length) % options.length].id);
  };
  return (
    <div ref={ref} className={`set-seg${stack ? " stacked" : ""}`} data-stacked={stack ? (stacked ? "scale" : "overflow") : undefined} role="radiogroup" aria-label={label} data-testid={testId}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      }}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} tabIndex={o.id === value ? 0 : -1} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Would the segment's labels overflow its container laid out in one row (unwrapped)? Studio #38: then stack, so a
 * label is never truncated. Measured in a transient one-row state, re-checked on every container resize.
 */
export function rowOverflows(el: HTMLElement): boolean {
  const host = el.parentElement;
  if (!host) return false;
  el.classList.add("measure-row");
  const need = el.scrollWidth;
  el.classList.remove("measure-row");
  return need > host.clientWidth;
}

function useRowOverflow(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.parentElement) return;
    const check = () => setOver(rowOverflows(el));
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [ref]);
  return over;
}
