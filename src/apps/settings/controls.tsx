"use client";
// Switch and segmented control for Settings, to Studio's #38 rulings (sizes in settings.css).
import { useId } from "react";

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
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.id === value);
    onChange(options[(i + dir + options.length) % options.length].id);
  };
  return (
    <div className={`set-seg${stacked ? " stacked" : ""}`} role="radiogroup" aria-label={label} data-testid={testId}
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
