'use client';

// Capital tab placeholder. The capital work (loans, guarantees, dividends, buybacks, the IPO and the trading plan) fills
// this file. Its contract with the Company shell is the file name and the props below, and nothing else.
import { t } from '@/i18n';

export interface CapitalTabProps {
  companyId: string;
}

export function CapitalTab({ companyId }: CapitalTabProps) {
  return (
    <section className="flex flex-col gap-2" data-testid="company-capital" data-company={companyId}>
      <p className="text-small text-fg-muted">{t('company.ui.capital.placeholder')}</p>
    </section>
  );
}
