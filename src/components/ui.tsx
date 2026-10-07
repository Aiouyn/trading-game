'use client';

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { money, signedMoney, signedPct, tone, toneText } from '@/game/format';

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
export function TickRing({ tick, ms, paused = false, size = 30, label }: { tick: number; ms: number; paused?: boolean; size?: number; label?: string }) {
  const stroke = size >= 28 ? 2.5 : 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? (paused ? 'Disconnected' : 'Next tick')} className="shrink-0" data-testid="tick-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-ink-3" strokeWidth={stroke} />
      {!paused && (
        <circle
          key={tick}
          cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-brass animate-tick" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c} transform={`rotate(-90 ${size / 2} ${size / 2})`}
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

export function CardHeader({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-4 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="font-serif text-title text-fg">{title}</h2>
        {sub && <p className="mt-0.5 text-small text-fg-faint">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, label, size = 'md', className = '',
}: {
  options: { value: T; label: string; testId?: string; disabled?: boolean }[];
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
            disabled={o.disabled}
            data-testid={o.testId}
            onClick={() => onChange(o.value)}
            className={`flex-1 whitespace-nowrap rounded-sm px-2.5 font-medium transition-colors duration-[var(--dur-fast)] disabled:cursor-not-allowed disabled:text-fg-disabled ${
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

export function Chip({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 rounded-chip border border-ink-3 px-2 py-0.5 text-micro uppercase text-fg-muted ${className}`}>{children}</span>;
}

export function BrassChip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-chip border border-brass/45 bg-brass/[0.07] px-2 py-0.5 text-micro uppercase text-brass-hi ${className}`}>{children}</span>;
}

/** Steel padlock, used for anything a license or rank has not opened yet. */
export function LockGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-label="Locked" role="img" className="shrink-0 fill-steel">
      <path d="M7 9V7a4 4 0 0 1 8 0v2h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1Zm2 0h4V7a2 2 0 0 0-4 0v2Z" />
    </svg>
  );
}

type BtnVariant = 'brass' | 'ghost' | 'outline' | 'danger' | 'quiet';

export function Button({
  children, onClick, variant = 'outline', size = 'md', disabled, className = '', type = 'button', title, testId, busy,
}: {
  children: ReactNode;
  onClick?: () => void | Promise<unknown>;
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  title?: string;
  testId?: string;
  busy?: boolean;
}) {
  const [working, setWorking] = useState(false);
  const sz = size === 'sm' ? 'h-8 px-3 text-caption' : size === 'lg' ? 'h-12 px-5 text-body' : 'h-10 px-4 text-small';
  const v = {
    brass: 'btn-brass',
    ghost: 'text-fg-muted hover:bg-ink-2 hover:text-fg rounded-md',
    outline: 'rounded-md border border-ink-3 text-fg hover:border-fg-faint hover:bg-ink-2',
    danger: 'rounded-md border border-loss/50 text-loss hover:bg-loss/10',
    quiet: 'rounded-md bg-ink-2 text-fg-muted hover:text-fg',
  }[variant];
  const isDisabled = disabled || working || busy;
  return (
    <button
      type={type}
      title={title}
      data-testid={testId}
      disabled={isDisabled}
      onClick={async () => {
        if (!onClick) return;
        const r = onClick();
        if (r && typeof (r as Promise<unknown>).then === 'function') {
          setWorking(true);
          try { await r; } finally { setWorking(false); }
        }
      }}
      className={`inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors duration-[var(--dur-fast)] disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export function Progress({ value, className = '', tone: t = 'brass', label }: { value: number; className?: string; tone?: 'brass' | 'gain' | 'loss' | 'steel' | 'warn'; label?: string }) {
  const bg = { brass: 'bg-brass', gain: 'bg-gain', loss: 'bg-loss', steel: 'bg-steel', warn: 'bg-warn' }[t];
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={`h-1 overflow-hidden rounded-chip bg-ink-3 ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className={`h-full ${bg} transition-[width] duration-[var(--dur-base)]`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, className = '', testId }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={`min-w-0 ${className}`} data-testid={testId}>
      <div className="label">{label}</div>
      <div className="num mt-1 truncate text-body text-fg">{value}</div>
      {sub && <div className="num mt-0.5 text-caption text-fg-faint">{sub}</div>}
    </div>
  );
}

export function KV({ k, v, className = '' }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 text-small ${className}`}>
      <span className="text-fg-muted">{k}</span>
      <span className="num text-right text-fg">{v}</span>
    </div>
  );
}

export function Money({ value, signed = false, className = '' }: { value: number; signed?: boolean; className?: string }) {
  const t = signed ? toneText[tone(value)] : '';
  return <span className={`num ${t} ${className}`}>{signed ? signedMoney(value) : money(value)}</span>;
}

export function Pct({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`num ${toneText[tone(value)]} ${className}`}>{signedPct(value)}</span>;
}

export function NumberField({
  value, onChange, label, suffix, min, step, testId, placeholder, className = '', id,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  suffix?: string;
  min?: number;
  step?: number | 'any';
  testId?: string;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  return (
    <label className={`flex h-11 items-center gap-2 rounded-md border border-ink-3 bg-ink-0 px-3 focus-within:border-brass/60 ${className}`}>
      {label && <span className="shrink-0 text-small text-fg-muted">{label}</span>}
      <input
        id={id}
        inputMode="decimal"
        type="number"
        min={min}
        step={step ?? 'any'}
        value={value}
        placeholder={placeholder ?? '0'}
        onChange={(e) => onChange(e.target.value)}
        className="num min-w-0 flex-1 bg-transparent text-right text-body text-fg outline-none placeholder:text-fg-disabled [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        data-testid={testId}
      />
      {suffix && <span className="shrink-0 text-caption text-fg-faint">{suffix}</span>}
    </label>
  );
}

export function TextField({ value, onChange, placeholder, maxLength, testId, className = '', onEnter, autoFocus, type = 'text', label }: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; testId?: string; className?: string; onEnter?: () => void; autoFocus?: boolean; type?: string; label?: string;
}) {
  return (
    <input
      aria-label={label ?? placeholder}
      type={type}
      value={value}
      autoFocus={autoFocus}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      className={`h-11 rounded-md border border-ink-3 bg-ink-0 px-3 text-body text-fg outline-none placeholder:text-fg-disabled focus:border-brass/60 ${className}`}
      data-testid={testId}
    />
  );
}

export function Select<T extends string>({ value, onChange, options, label, className = '', testId }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; label: string; className?: string; testId?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`h-10 rounded-md border border-ink-3 bg-ink-0 px-2 text-small text-fg outline-none focus:border-brass/60 ${className}`}
      data-testid={testId}
    >
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
}

/** Centered dialog (desktop) that becomes a bottom sheet on phones. */
export function Modal({ open, onClose, title, children, wide = false, testId }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink-0/75" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        data-testid={testId}
        className={`relative max-h-[90dvh] w-full overflow-y-auto rounded-t-lg border border-ink-3 bg-ink-1 shadow-sheet outline-none md:rounded-lg ${wide ? 'md:max-w-3xl' : 'md:max-w-lg'}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-ink-2 bg-ink-1 px-5 py-4">
          <h2 className="font-serif text-title text-fg">{title}</h2>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md text-fg-muted hover:bg-ink-2 hover:text-fg" aria-label="Close">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="font-serif text-title text-fg-muted">{title}</p>
      {action}
    </div>
  );
}

/** A locked feature: what it is, and what unlocks it. */
export function Locked({ what, need, progress }: { what: ReactNode; need: ReactNode; progress?: number }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      <LockGlyph size={32} />
      <p className="font-serif text-title text-fg">{what}</p>
      <p className="text-small text-fg-muted">{need}</p>
      {progress !== undefined && <Progress value={progress} className="w-56" label="Progress to unlock" />}
    </Card>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={`flex gap-1 overflow-x-auto border-b border-ink-2 ${className}`}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            data-testid={`tab-${t.id}`}
            className={`relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-small font-medium ${on ? 'border-brass text-fg' : 'border-transparent text-fg-faint hover:text-fg-muted'}`}
          >
            {t.label}
            {!!t.badge && <span className="num rounded-chip bg-brass/20 px-1.5 text-micro text-brass-hi">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Small table helpers keep numbers right-aligned and mono. */
export function Th({ children, right = false, className = '' }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={`label px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'} ${className}`}>{children}</th>;
}

export function Td({ children, right = false, className = '', num = false }: { children?: ReactNode; right?: boolean; className?: string; num?: boolean }) {
  return <td className={`px-3 py-2.5 ${right ? 'text-right' : 'text-left'} ${num ? 'num' : ''} ${className}`}>{children}</td>;
}

export function ConfirmButton({ children, confirm, onConfirm, variant = 'outline', size = 'sm', testId, disabled }: {
  children: ReactNode; confirm: string; onConfirm: () => void | Promise<unknown>; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; testId?: string; disabled?: boolean;
}) {
  const [ask, setAsk] = useState(false);
  if (ask) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button size={size} variant="danger" onClick={async () => { setAsk(false); await onConfirm(); }} testId={testId ? `${testId}-yes` : undefined}>{confirm}</Button>
        <Button size={size} variant="ghost" onClick={() => setAsk(false)}>Cancel</Button>
      </span>
    );
  }
  return <Button size={size} variant={variant} disabled={disabled} onClick={() => setAsk(true)} testId={testId}>{children}</Button>;
}

/** Countdown in game time from ticks. */
export function ticksLabel(ticks: number, tpd = 720): string {
  if (ticks <= 0) return 'now';
  const days = ticks / tpd;
  if (days >= 1) return `${days.toFixed(days >= 10 ? 0 : 1)} game days`;
  const min = Math.round((ticks * 5) / 60);
  return min >= 60 ? `${(min / 60).toFixed(1)} h` : `${Math.max(1, min)} min`;
}
