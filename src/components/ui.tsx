'use client';

import { useState, type HTMLAttributes, type ReactNode } from 'react';

/** Background flash when a value changes; motion explains the change (DESIGN.md §6). */
export function Flash({ value, children, className = '' }: { value: number; children: ReactNode; className?: string }) {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState<{ dir: 'gain' | 'loss'; n: number } | null>(null);
  if (value !== prev) {
    setPrev(value);
    setFlash({ dir: value > prev ? 'gain' : 'loss', n: (flash?.n ?? 0) + 1 });
  }
  const cls = flash ? (flash.dir === 'gain' ? 'animate-flash-gain' : 'animate-flash-loss') : '';
  return (
    <span key={flash?.n ?? 0} className={`rounded-sm ${cls} ${className}`}>
      {children}
    </span>
  );
}

/** One market tick, drawn as a ring that fills over the tick's real duration. */
export function TickRing({ tick, ms, paused, size = 30, label }: { tick: number; ms: number; paused: boolean; size?: number; label?: string }) {
  const stroke = size >= 28 ? 2.5 : 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? (paused ? 'Paused' : 'Next tick')}
      className="shrink-0"
      data-testid="tick-ring"
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-ink-3" strokeWidth={stroke} />
      {!paused && (
        <circle
          key={tick}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-brass animate-tick"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ ['--ring-length' as string]: c, animationDuration: `${ms}ms`, animationIterationCount: 1, animationFillMode: 'forwards' }}
        />
      )}
      {paused && (
        <g className="fill-fg-muted">
          <rect x={size / 2 - size * 0.14} y={size * 0.32} width={size * 0.09} height={size * 0.36} rx={1} />
          <rect x={size / 2 + size * 0.05} y={size * 0.32} width={size * 0.09} height={size * 0.36} rx={1} />
        </g>
      )}
    </svg>
  );
}

/** Tiny line chart; color follows the move over the window. */
export function Sparkline({ data, width = 72, height = 24, className = '' }: { data: number[]; width?: number; height?: number; className?: string }) {
  if (data.length < 2) return <svg width={width} height={height} aria-hidden className={className} />;
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 1 - ((v - min) / span) * (height - 2)).toFixed(1)}`)
    .join(' ');
  const up = data[data.length - 1]! >= data[0]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={className}>
      <polyline points={pts} fill="none" strokeWidth={1.25} strokeLinejoin="round" className={up ? 'stroke-gain' : 'stroke-loss'} />
    </svg>
  );
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-lg border border-ink-3 bg-ink-1 ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, label, size = 'md', className = '',
}: {
  options: { value: T; label: string; testId?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-md border border-ink-3 bg-ink-0 p-0.5 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-testid={o.testId}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-sm px-2.5 font-medium transition-colors duration-[var(--dur-fast)] ${
              size === 'sm' ? 'h-7 text-caption' : 'h-9 text-small'
            } ${on ? 'bg-ink-3 text-fg' : 'text-fg-faint hover:text-fg-muted'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-chip border border-ink-3 px-2 py-0.5 text-micro uppercase text-fg-muted ${className}`}>{children}</span>;
}
