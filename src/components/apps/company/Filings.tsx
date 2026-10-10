'use client';

// Filings (O-17, spec 7 and 6.1): the founder's own filed quarters, each with its income, balance sheet and cash flow lines,
// the day it was filed, and the next filing day. Only filed data is read here (the statements in `filings` are the frozen,
// filed ones): the quarter in progress and the unfiled statements stay private. Figures never truncate or split.
import { money } from '@/game/format';
import { t } from '@/i18n';
import { Stat } from '@/components/ui';
import type { CompanyFounderView } from '@/world/company/views';
import type { FilingPublic } from '@/world/company/types';
import { Section } from './Shared';
import { tierLabel } from './labels';

type Group = 'income' | 'balance' | 'cashflow';
interface Row { group: Group; id: string; label: string; value: number }

/** The filed lines of one statement, grouped (labels read from the copy, values from the filing). */
function rowsOf(f: FilingPublic): Row[] {
  return [
    { group: 'income', id: 'revenue', label: t('company.ui.filings.line.revenue'), value: f.income.revUnrelated },
    { group: 'income', id: 'cogs', label: t('company.ui.filings.line.cogs'), value: f.income.cogs },
    { group: 'income', id: 'opex', label: t('company.ui.filings.line.opex'), value: f.income.opex },
    { group: 'income', id: 'ebitda', label: t('company.ui.filings.line.ebitda'), value: f.income.ebitda },
    { group: 'income', id: 'interest', label: t('company.ui.filings.line.interest'), value: f.income.interest },
    { group: 'income', id: 'netIncome', label: t('company.ui.filings.line.netIncome'), value: f.income.netIncome },
    { group: 'balance', id: 'cash', label: t('company.ui.filings.line.cash'), value: f.balance.cash },
    { group: 'balance', id: 'receivables', label: t('company.ui.filings.line.receivables'), value: f.balance.receivables },
    { group: 'balance', id: 'inventory', label: t('company.ui.filings.line.inventory'), value: f.balance.inventory },
    { group: 'balance', id: 'ppe', label: t('company.ui.filings.line.ppe'), value: f.balance.ppe },
    { group: 'balance', id: 'debt', label: t('company.ui.filings.line.debt'), value: f.balance.debt },
    { group: 'balance', id: 'equity', label: t('company.ui.filings.line.equity'), value: f.balance.equity },
    { group: 'cashflow', id: 'ocf', label: t('company.ui.filings.line.ocf'), value: f.cashFlow.ocf },
    { group: 'cashflow', id: 'capex', label: t('company.ui.filings.line.capex'), value: f.cashFlow.capex },
    { group: 'cashflow', id: 'fcf', label: t('company.ui.filings.line.fcf'), value: f.cashFlow.fcf },
    { group: 'cashflow', id: 'dividends', label: t('company.ui.filings.line.dividends'), value: f.cashFlow.dividends },
    { group: 'cashflow', id: 'buybacks', label: t('company.ui.filings.line.buybacks'), value: f.cashFlow.buybacks },
  ];
}

const GROUP_TITLE: Record<Group, () => string> = {
  income: () => t('company.ui.filings.income'),
  balance: () => t('company.ui.filings.balance'),
  cashflow: () => t('company.ui.filings.cashflow'),
};

export function Filings({ co }: { co: CompanyFounderView }) {
  const newest = co.filings.slice().reverse();
  const quarterly = co.tier === 'late' || co.listed !== undefined;
  return (
    <div className="flex flex-col gap-4" data-testid="company-filings">
      <Section title={t('company.ui.filings.title')} testId="company-filings-list">
        <p className="text-caption text-fg-faint" data-testid="company-filings-note">{t('company.ui.filings.note')}</p>
        <p className="mt-2 text-small text-fg" data-testid="company-filings-next">{t('company.ui.filings.next', { day: co.nextFilingDay })}</p>
        {!quarterly ? (
          <div className="mt-3 flex flex-col gap-1" data-testid="company-filings-registry">
            <p className="text-small text-fg-muted">{t('company.ui.filings.seed')}</p>
            <p className="text-caption text-fg-faint">{t('company.ui.filings.registry', { tier: tierLabel(co.tier), band: co.registry?.headcountBand ?? co.headcountBand })}</p>
          </div>
        ) : null}
        {newest.length === 0 ? <p className="mt-3 text-small text-fg-muted" data-testid="company-filings-none">{t('company.ui.filings.none')}</p> : null}
      </Section>
      {newest.map((f) => <FilingCard key={f.quarter} f={f} />)}
    </div>
  );
}

function FilingCard({ f }: { f: FilingPublic }) {
  const rows = rowsOf(f);
  const groups: Group[] = ['income', 'balance', 'cashflow'];
  return (
    <article className="flex flex-col gap-4 rounded-md border border-ink-3 p-4" data-testid="company-filing" data-quarter={f.quarter}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-title text-fg">{t('company.ui.public.quarter', { q: f.quarter })}</h2>
        <div className="flex flex-col items-end">
          <span className="num text-caption text-fg-muted" data-testid="company-filing-filed">{t('company.ui.filings.filedOn', { day: f.filedDay })}</span>
          <span className="num text-caption text-fg-faint">{t('company.ui.filings.closedOn', { day: f.periodCloseDay })}</span>
        </div>
      </header>
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2" data-testid={`company-filing-${g}`}>
          <h3 className="text-caption text-fg-faint">{GROUP_TITLE[g]()}</h3>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-2 @2xl:grid-cols-3">
            {rows.filter((r) => r.group === g).map((r) => (
              <Stat key={r.id} label={r.label} value={money(r.value)} figure testId={`company-filing-${f.quarter}-${r.id}`} />
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
