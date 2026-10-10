'use client';

// Shared pieces of the Company capital tab: the panel frame, the Private and Public chips, the inline refusal (three parts:
// what happened, why, what you can do), the hold-to-confirm control (Velvet 6.3, 8) and the command helper that keeps a refusal
// on its panel instead of a toast.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import type { Command } from '@/world/types';
import { Card, CardHeader } from '@/components/ui';

/** A refusal as the world returns it: its code and the copy variables (numbers and strings only). */
export type Refusal = { code: string } & Record<string, string | number | boolean | null | undefined>;

/** The three copy keys of a refusal code, and the variables they take (company.refusal.<code>.what / .why / .do). */
export function refusalCopy(r: Refusal): { what: string; why: string; do: string; vars: Record<string, string | number> } {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r)) if (k !== 'code' && (typeof v === 'number' || typeof v === 'string')) vars[k] = v;
  const base = `company.refusal.${r.code}`;
  return { what: `${base}.what`, why: `${base}.why`, do: `${base}.do`, vars };
}

/** The Ack of a command, as a refusal (the world puts the reject in `data`; anything else is the bare error code). */
function refusalOf(r: { error?: string; data?: unknown }): Refusal {
  const d = r.data as Refusal | undefined;
  if (d && typeof d === 'object' && typeof d.code === 'string') return d;
  return { code: r.error ?? 'unknown' };
}

export function RefusalBox({ refusal, testId }: { refusal: Refusal; testId?: string }) {
  const c = refusalCopy(refusal);
  const known = t(c.what) !== c.what;
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md border border-warn/50 px-3 py-2 text-small" data-testid={testId ?? 'company-plan-error'}>
      {known ? (
        <>
          <p className="text-fg">{t(c.what, c.vars)}</p>
          <p className="text-fg-muted">{t(c.why, c.vars)}</p>
          <p className="text-fg-muted">{t(c.do, c.vars)}</p>
        </>
      ) : (
        <p className="text-fg">{t('company.capital.refusal.unknown', { code: refusal.code })}</p>
      )}
    </div>
  );
}

/** A command on a panel: the result is the success flag, and a refusal stays on the panel until the next command. */
export function useAct() {
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  async function run(cmd: Command, success: string): Promise<boolean> {
    setBusy(true);
    const r = await useGame.getState().act(cmd, { silent: true, success });
    if (!mounted.current) return r.ok;
    setBusy(false);
    setRefusal(r.ok ? null : refusalOf(r));
    return r.ok;
  }
  return { run, refusal, busy, clear: () => setRefusal(null) };
}

export function Panel({ title, sub, chip, right, testId, children, className = '' }: {
  title: ReactNode; sub?: ReactNode; chip?: 'private' | 'public'; right?: ReactNode; testId: string; children: ReactNode; className?: string;
}) {
  return (
    <Card className={`p-0 ${className}`} data-testid={testId}>
      <CardHeader
        title={<span className="flex flex-wrap items-center gap-2">{title}{chip === 'private' && <PrivChip />}{chip === 'public' && <PublChip />}</span>}
        sub={sub}
        right={right}
      />
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
    </Card>
  );
}

/** A quiet "Private" chip: faint text on a hairline (Velvet 2.2). */
export function PrivChip() {
  return <span className="priv rounded-sm border border-ink-3 px-1.5 text-caption uppercase tracking-wide text-fg-faint" data-testid="priv-chip">{t('company.capital.chip.private')}</span>;
}

/** The info-blue "Public" chip, only where the contrast matters (Velvet 2.2). */
export function PublChip() {
  return <span className="publ rounded-sm border border-info/50 px-1.5 text-caption uppercase tracking-wide text-info" data-testid="publ-chip">{t('company.capital.chip.public')}</span>;
}

export function Line({ k, v, testId }: { k: ReactNode; v: ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-small" data-testid={testId}>
      <span className="text-fg-muted">{k}</span>
      <span className="num text-right text-fg">{v}</span>
    </div>
  );
}

export function Note({ children, testId }: { children: ReactNode; testId?: string }) {
  return <p className="text-caption text-fg-muted" data-testid={testId}>{children}</p>;
}

/**
 * A button that commits only when held: the fill runs left to right over `ms` while pressed, and letting go (or leaving the
 * button) stops and resets it. Keyboard: Enter or Space held does the same (Velvet 6.3).
 */
export function HoldButton({ label, hint, onHold, disabled, ms = 1200, testId }: {
  label: string; hint?: string; onHold: () => void; disabled?: boolean; ms?: number; testId: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onHold();
    }, ms);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(); }}
        onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') stop(); }}
        className="relative h-10 overflow-hidden rounded-md border border-brass/60 px-4 text-small text-brass-hi disabled:cursor-not-allowed disabled:opacity-45"
        data-testid={testId}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-brass/30"
          style={{ width: holding ? '100%' : '0%', transition: holding ? `width ${ms}ms linear` : 'none' }}
        />
        <span className="relative">{label}</span>
      </button>
      {hint && <p className="text-caption text-fg-faint">{hint}</p>}
    </div>
  );
}

/** A number read from a text field; anything else is NaN (the world refuses it, never the client). */
export function numOf(s: string): number {
  return s.trim() === '' ? NaN : Number(s);
}
