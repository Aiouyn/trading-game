'use client';

// Shared pieces of the Exchange: the three-part refusal box (what happened, why, what to do), the public chip, and a
// key-value line. A refusal always shows inline, next to the control that caused it. Never a modal, never only a toast.
import type { ReactNode } from 'react';
import { t } from '@/i18n';
import type { RefusalCopy } from './copy';

export function RefusalBox({ copy, testId = 'exchange-refusal' }: { copy: RefusalCopy; testId?: string }) {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-small" data-testid={testId}>
      <p className="font-medium text-fg">{copy.what}</p>
      <p className="text-fg-muted">{copy.why}</p>
      <p className="text-fg">{copy.do}</p>
    </div>
  );
}

/** The Public chip: a row that others can see. Velvet's `publ-chip` id. */
export function PublicChip() {
  return (
    <span data-testid="publ-chip" className="rounded-chip border border-steel/50 px-1.5 py-px text-micro uppercase tracking-wide text-steel">
      {t('exchange.public')}
    </span>
  );
}

/**
 * A labelled figure in a card: a caption over a mono value. A figure stays on one line and is never cut (the card grid
 * gives each cell room for it). A `prose` value (a band or a bucket word) wraps at spaces instead.
 */
export function Fact({ label, value, testId, prose = false }: { label: ReactNode; value: ReactNode; testId?: string; prose?: boolean }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="label">{label}</div>
      <div className={`num mt-0.5 text-small text-fg ${prose ? 'break-words' : 'whitespace-nowrap'}`}>{value}</div>
    </div>
  );
}

/** A section heading inside a card, with the Public chip where the rows are public. */
export function Section({ title, public: isPublic = false, children, testId }: { title: ReactNode; public?: boolean; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2 border-t border-ink-2 pt-3" data-testid={testId}>
      <div className="flex items-center gap-2">
        <h3 className="text-caption font-medium uppercase tracking-wide text-fg-muted">{title}</h3>
        {isPublic && <PublicChip />}
      </div>
      {children}
    </section>
  );
}
