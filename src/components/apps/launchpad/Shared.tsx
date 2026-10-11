'use client';

// Shared pieces of the Launchpad: the three-part refusal (shown inline, next to the control that caused it, never a modal),
// the token icon (the world's generated SVG, from the ticker), the status and flag chips, and the Public chip.
import type { ReactNode } from 'react';
import { t } from '@/i18n';
import type { RefusalCopy } from './copy';
import { reasonKey, statusKey } from './copy';

export function RefusalBox({ copy, testId = 'lp-refusal' }: { copy: RefusalCopy; testId?: string }) {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-small" data-testid={testId}>
      <p className="font-medium text-fg">{copy.what}</p>
      <p className="text-fg-muted">{copy.why}</p>
      <p className="text-fg">{copy.do}</p>
    </div>
  );
}

/** A token's icon: the procedural SVG the world makes from its ticker (no uploads). Decorative: the ticker is printed beside it. */
export function TokenIcon({ svg, size = 40 }: { svg: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 overflow-hidden rounded-md border border-ink-3 [&>svg]:block [&>svg]:size-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone = status === 'graduated' ? 'border-gain/50 text-gain' : status === 'dead' ? 'border-fg-faint/50 text-fg-faint' : 'border-brass/50 text-brass';
  return (
    <span className={`rounded-chip border px-1.5 py-px text-micro uppercase tracking-wide ${tone}`} data-testid={`lp-status-${status}`}>
      {t(statusKey(status))}
    </span>
  );
}

/** The public rug flag on a token (the world's `flag`): a loss-coloured chip with its reason. */
export function FlagChip({ reason }: { reason: 'dump' | 'sweep' }) {
  return (
    <span className="rounded-chip border border-loss/50 px-1.5 py-px text-micro uppercase tracking-wide text-loss" data-testid="lp-flag">
      {t('lp.flag.chip', { reason: t(reasonKey(reason)) })}
    </span>
  );
}

export function SponsoredChip() {
  return (
    <span className="rounded-chip border border-steel/50 px-1.5 py-px text-micro uppercase tracking-wide text-steel" data-testid="lp-sponsored">
      {t('lp.sponsored')}
    </span>
  );
}

/** The Public chip: a list that everyone can see (the tape, the creator's rows). Velvet's `publ-chip` look. */
export function PublicChip() {
  return (
    <span data-testid="publ-chip" className="rounded-chip border border-steel/50 px-1.5 py-px text-micro uppercase tracking-wide text-steel">
      {t('lp.public')}
    </span>
  );
}

/** A section inside a card, with the Public chip where the rows are public. */
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

/** A labelled figure: a caption over a value that never truncates or splits (`whitespace-nowrap`). */
export function Fact({ label, value, testId }: { label: ReactNode; value: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="label">{label}</div>
      <div className="num mt-0.5 whitespace-nowrap text-small text-fg">{value}</div>
    </div>
  );
}
