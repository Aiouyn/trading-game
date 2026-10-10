'use client';

// What the market sees (Velvet 2.1): the same company as another player would read it, built only from CompanyPublic
// (see `marketOf` in model.ts). Every CompanyPublic field has its place here, and nothing on this screen reads a private
// field, so the toggle is a mirror, never a setting.
import { compactMoney, money, pct, qty } from '@/game/format';
import { t } from '@/i18n';
import { Td, Th } from '@/components/ui';
import type { CompanyPublic } from '@/world/company/views';
import { PublicChip, Section } from './Shared';
import { sectorLabel, tierLabel } from './labels';

const REASONS = ['volume', 'price', 'cap', 'halt', 'terminated', 'legal', 'tender'] as const;

/** A reason from the engine as plain words. An unknown id falls back to the generic line, never to the raw id. */
function reasonLabel(reason: string): string {
  return (REASONS as readonly string[]).includes(reason) ? t(`company.ui.reason.${reason}`) : t('company.ui.reason.other');
}

function band(range: [number, number]): string {
  return t('company.ui.public.band', { low: compactMoney(range[0]), high: compactMoney(range[1]) });
}

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
          <Field label={t('company.ui.public.founded')} value={String(pub.foundedDay)} />
          <Field label={t('company.ui.public.cities')} value={pub.cities.join(', ')} />
          <Field label={t('company.ui.public.headcount')} value={pub.headcountBand} />
          <Field label={t('company.ui.public.debt')} value={pub.debt.totalBand} />
          <Field label={t('company.ui.public.covenant')} value={t(`company.ui.public.covenant.${pub.debt.covenant}`)} testId="company-market-covenant" />
          <Field label={t('company.ui.public.credibility')} value={pct(pub.credibility)} />
          <Field label={t('company.ui.public.filings')} value={String(pub.filings.length)} />
        </dl>
        <p className="mt-3 text-small text-fg-muted" data-testid="company-market-distress">
          {pub.distressFlag ? t('company.ui.public.distress') : t('company.ui.public.noDistress')}
        </p>
      </Section>

      {pub.registry ? (
        <Section title={t('company.ui.public.registry')} testId="company-market-registry">
          <p className="text-caption text-fg-faint">{t('company.ui.public.registryNote')}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label={t('company.ui.public.tier')} value={tierLabel(pub.registry.tier)} />
            <Field label={t('company.ui.public.headcount')} value={pub.registry.headcountBand} />
            <Field label={t('company.ui.public.revenue')} value={pub.registry.revenueBand ? band(pub.registry.revenueBand) : t('company.ui.public.notFiled')} />
          </dl>
        </Section>
      ) : null}

      {pub.listed ? (
        <Section title={t('company.ui.public.listed')} testId="company-market-listed">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-3">
            <Field label={t('company.ui.public.ipoDay')} value={String(pub.listed.ipoDay)} />
            <Field label={t('company.ui.public.sharesOut')} value={qty(pub.listed.sharesOut)} />
            <Field label={t('company.ui.public.float')} value={qty(pub.listed.floatShares)} />
          </dl>
        </Section>
      ) : null}

      {pub.cashDebt ? (
        <Section title={t('company.ui.public.balance')} testId="company-market-balance">
          <p className="text-caption text-fg-faint">{t('company.ui.public.balanceNote', { day: pub.cashDebt.filedDay })}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label={t('company.ui.public.cash')} value={money(pub.cashDebt.cash)} />
            <Field label={t('company.ui.public.totalDebt')} value={money(pub.cashDebt.totalDebt)} />
          </dl>
        </Section>
      ) : null}

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

      <Section title={t('company.ui.public.filingsTitle')} testId="company-market-filings">
        {pub.filings.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.public.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-left" data-testid="company-market-filing-table">
              <thead>
                <tr>
                  <Th>{t('company.ui.public.col.quarter')}</Th>
                  <Th right>{t('company.ui.public.col.filed')}</Th>
                  <Th right>{t('company.ui.public.col.revenue')}</Th>
                  <Th right>{t('company.ui.public.col.netIncome')}</Th>
                  <Th right>{t('company.ui.public.col.cash')}</Th>
                </tr>
              </thead>
              <tbody>
                {pub.filings.map((f) => (
                  <tr key={f.quarter} className="border-t border-ink-2">
                    <Td>{t('company.ui.public.quarter', { q: f.quarter })}</Td>
                    <Td right num>{f.filedDay}</Td>
                    <Td right num>{money(f.income.revUnrelated)}</Td>
                    <Td right num>{money(f.income.netIncome)}</Td>
                    <Td right num>{money(f.balance.cash)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {pub.listed ? (
        <Section title={t('company.ui.public.signals')} testId="company-market-signals">
          {pub.signals.length === 0 ? (
            <p className="text-small text-fg-muted">{t('company.ui.public.none')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr>
                    <Th>{t('company.ui.public.col.day')}</Th>
                    <Th right>{t('company.ui.public.col.revenueQtd')}</Th>
                    <Th right>{t('company.ui.public.col.runRate')}</Th>
                    <Th right>{t('company.ui.public.col.bookings')}</Th>
                    <Th right>{t('company.ui.public.col.hires')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {pub.signals.map((s) => (
                    <tr key={s.day} className="border-t border-ink-2" data-testid="company-market-signal">
                      <Td>{s.day}</Td>
                      <Td right num>{band(s.revenueQtdBand)}</Td>
                      <Td right num>{band(s.runRateBand)}</Td>
                      <Td right num>{band(s.bookingsBand)}</Td>
                      <Td right>{t(`company.ui.public.hires.${s.netHires}`)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      ) : null}

      <Section title={t('company.ui.public.insider')} testId="company-market-insider">
        {pub.insiderTrades.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.public.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pub.insiderTrades.map((tr, i) => (
              <li key={`${tr.day}-${i}`} className="text-small text-fg-muted" data-testid="company-market-trade">
                {t('company.ui.public.tradeRow', { day: tr.day, filedDay: tr.filedDay, side: t(`company.ui.public.side.${tr.side}`), qty: qty(tr.qty) })}
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
                {p.ended ? <span className="block text-caption text-fg-faint">{t('company.ui.public.planEnded', { day: p.ended.day, reason: reasonLabel(p.ended.reason) })}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {pub.planSkips.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1" data-testid="company-market-skips">
            {pub.planSkips.map((s, i) => (
              <li key={`${s.day}-${i}`} className="text-caption text-fg-faint">{t('company.ui.public.skipRow', { day: s.day, reason: reasonLabel(s.reason) })}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title={t('company.ui.public.buybacks')} testId="company-market-buybacks">
        {pub.buybackPrograms.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.public.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pub.buybackPrograms.map((b, i) => (
              <li key={`${b.fromDay}-${i}`} className="text-small text-fg-muted">
                {t('company.ui.public.buybackRow', { size: money(b.size), from: b.fromDay, to: b.toDay })}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Field({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <dt className="text-caption text-fg-faint">{label}</dt>
      <dd className="num text-small text-fg">{value}</dd>
    </div>
  );
}
