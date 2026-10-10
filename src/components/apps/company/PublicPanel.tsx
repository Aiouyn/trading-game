'use client';

// What the market sees (Velvet 2.1): the same company as another player would read it, built only from CompanyPublic
// (see `marketOf` in model.ts). Nothing on this screen reads a private field, so the toggle is a mirror, never a setting.
import { money } from '@/game/format';
import { t } from '@/i18n';
import type { CompanyPublic } from '@/world/company/views';
import { PublicChip, Section } from './Shared';
import { sectorLabel, tierLabel } from './labels';

export function PublicPanel({ pub }: { pub: CompanyPublic }) {
  const w = pub.window;
  return (
    <div className="flex flex-col gap-4" data-testid="company-market">
      <Section title={t('company.ui.public.title')} chip={<PublicChip />} testId="company-market-card">
        <p className="text-caption text-fg-faint">{t('company.ui.public.note')}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-3">
          <Field label={t('company.ui.found.name')} value={pub.name} />
          <Field label={t('company.ui.found.sector')} value={sectorLabel(pub.sector)} />
          <Field label={t('company.ui.public.tier')} value={tierLabel(pub.tier)} />
          <Field label={t('company.ui.public.headcount')} value={pub.headcountBand} />
          <Field label={t('company.ui.public.debt')} value={pub.debt.totalBand} />
          <Field label={t('company.ui.public.filings')} value={String(pub.filings.length)} />
        </dl>
      </Section>
      <Section title={t('company.ui.public.products')} testId="company-market-products">
        {pub.products.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.products.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pub.products.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center justify-between text-small text-fg">
                <span>{p.name}</span>
                <span className="num text-fg-muted">{money(p.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t('company.ui.public.window')} testId="company-market-window">
        <p className="text-small text-fg-muted">
          {!w
            ? t('company.ui.public.noWindow')
            : w.open
              ? t('company.ui.public.windowOpen', { day: w.closesDay ?? 0 })
              : t('company.ui.public.windowClosed', { day: w.opensDay ?? 0 })}
        </p>
      </Section>
      <Section title={t('company.ui.public.plans')} testId="company-market-plans">
        {pub.plans.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.public.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pub.plans.map((p, i) => (
              <li key={`${p.fromDay}-${i}`} className="text-small text-fg-muted" data-testid="company-market-plan">
                {t('company.ui.public.planRow', { from: p.fromDay, to: p.toDay })}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption text-fg-faint">{label}</dt>
      <dd className="num text-small text-fg">{value}</dd>
    </div>
  );
}
