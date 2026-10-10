'use client';

// Pieces every company screen uses: the three-part refusal (what happened, why, what you can do), the private and
// public chips (Velvet 2.2) and a titled card. Copy comes from company.refusal.<code>.{what,why,do} (en and fr).
import type { ReactNode } from 'react';
import { hasKey, t } from '@/i18n';
import { Card } from '@/components/ui';
import type { Refusal } from './model';

export function RefusalNote({ refusal }: { refusal: Refusal | null }) {
  if (!refusal) return null;
  const base = `company.refusal.${refusal.code}`;
  if (!hasKey(`${base}.what`)) {
    return <p role="alert" className="text-small text-warn" data-testid="company-refusal">{t('company.ui.failed')}</p>;
  }
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(refusal)) if (k !== 'code' && (typeof v === 'number' || typeof v === 'string')) vars[k] = v;
  return (
    <div role="alert" className="rounded-md border border-warn/40 bg-ink-0 px-3 py-2" data-testid="company-refusal" data-code={refusal.code}>
      <p className="text-small font-medium text-fg">{t(`${base}.what`, vars)}</p>
      <p className="mt-0.5 text-caption text-fg-muted">{t(`${base}.why`, vars)}</p>
      <p className="mt-0.5 text-caption text-fg-muted">{t(`${base}.do`, vars)}</p>
    </div>
  );
}

/** The chip that marks a private card (Velvet 2.2): uppercase, faint, on a hairline. */
export function PrivateChip() {
  return <span className="rounded-chip border border-ink-3 px-2 py-0.5 text-[10.5px] uppercase tracking-[0.14em] text-fg-faint" data-testid="priv-chip">{t('company.ui.private')}</span>;
}

/** The info-blue chip for the public rows where the contrast matters. */
export function PublicChip() {
  return <span className="rounded-chip border border-info/50 px-2 py-0.5 text-[10.5px] uppercase tracking-[0.14em] text-info" data-testid="publ-chip">{t('company.ui.public')}</span>;
}

/** A titled card: the heading in the serif, an optional chip and a body. */
export function Section({ title, chip, testId, children, className = '' }: { title: ReactNode; chip?: ReactNode; testId?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-4 ${className}`} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-serif text-title text-fg">{title}</h2>
        {chip}
      </div>
      {children}
    </Card>
  );
}
