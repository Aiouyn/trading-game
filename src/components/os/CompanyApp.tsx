'use client';

// Company (Velvet 13, velvet-company-app.md; R2 Owner). The tile appears from Owner rank (C-11). Building a
// company is Phase 4, so until then this is an honest empty state: nothing is set up and nothing is charged.
import { t } from '@/i18n';

export function CompanyApp() {
  return (
    <div className="os-body" data-testid="company">
      <section className="flex flex-col gap-2">
        <p className="font-serif text-title text-fg" data-testid="company-empty">{t('company.empty')}</p>
        <p className="text-small text-fg-muted" data-testid="company-later">{t('company.later')}</p>
      </section>
    </div>
  );
}
