'use client';

// Deals (C4): franchising (a royalty licence to an NPC operator, at 4 to 8% of its revenue, at most three per sector)
// and supply deals (a contract with another registered company, priced within the band of the market reference). A
// deal with a party the founder owns is related: it does not count in reported revenue, and the screen says so.
import { useState } from 'react';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { NumberField, Select, SpendReview, Td, Th } from '@/components/ui';
import type { CompanyFounderView } from '@/world/company/views';
import { RefusalNote, Section } from './Shared';
import { numberOrNull, percentOf, refusalOf, type Refusal } from './model';

export function Deals({ co }: { co: CompanyFounderView }) {
  return (
    <div className="flex flex-col gap-4" data-testid="company-deals">
      <Franchising co={co} />
      <Supply co={co} />
    </div>
  );
}

function Franchising({ co }: { co: CompanyFounderView }) {
  const act = useGame((s) => s.act);
  const [rate, setRate] = useState(String(percentOf(co.limits.franchiseRateMin)));
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const value = numberOrNull(rate);
  const grant = async () => {
    if (value === null || busy) return;
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId: co.id, action: { kind: 'licence', rate: value / 100 } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  return (
    <Section title={t('company.ui.deals.licence.title')} testId="company-franchise">
      <p className="text-caption text-fg-faint">
        {t('company.ui.deals.licence.range', { min: percentOf(co.limits.franchiseRateMin), max: percentOf(co.limits.franchiseRateMax) })}
      </p>
      <div className="mt-3 grid gap-3 @md:grid-cols-[1fr_auto] @md:items-end">
        <NumberField value={rate} onChange={setRate} min={percentOf(co.limits.franchiseRateMin)} step={0.5} testId="company-licence-rate" label={t('company.ui.deals.licence.rate')} suffix="%" className="h-11" />
        <SpendReview variant="brass" testId="company-licence-grant" label={t('company.ui.deals.licence.grant')} title={t('company.ui.deals.licence.grant')} rows={[{ label: t('company.ui.deals.licence.rate'), value: value === null ? '—' : pct(value / 100) }]} disabled={busy || value === null} onConfirm={grant} />
      </div>
      <div className="mt-3"><RefusalNote refusal={refusal} /></div>
      {co.licences.length === 0 ? (
        <p className="mt-3 text-small text-fg-muted">{t('company.ui.deals.licence.none')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" data-testid="company-licences">
          {co.licences.map((l) => (
            <li key={l.id} className="text-small text-fg">
              {t('company.ui.deals.licence.row', { rate: pct(l.rate), revenue: money(l.revenuePerDay) })}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Supply({ co }: { co: CompanyFounderView }) {
  const act = useGame((s) => s.act);
  const [sellerId, setSellerId] = useState(co.suppliers[0]?.id ?? '');
  const [units, setUnits] = useState('10');
  const [price, setPrice] = useState('50');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const unitsValue = numberOrNull(units);
  const priceValue = numberOrNull(price);
  const sign = async () => {
    if (!sellerId || unitsValue === null || priceValue === null || busy) return;
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId: co.id, action: { kind: 'supply', sellerId, unitsPerDay: unitsValue, price: priceValue } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  const nameOf = (id: string) => co.suppliers.find((s) => s.id === id)?.name ?? id;
  return (
    <Section title={t('company.ui.deals.supply.title')} testId="company-supply">
      {co.suppliers.length === 0 ? (
        <p className="text-small text-fg-muted">{t('company.ui.deals.supply.noSupplier')}</p>
      ) : (
        <div className="grid gap-3 @md:grid-cols-[1fr_auto_auto_auto] @md:items-end">
          <Select<string>
            value={sellerId}
            onChange={setSellerId}
            label={t('company.ui.deals.supply.supplier')}
            testId="company-supply-seller"
            className="h-11 w-full"
            options={co.suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
          <NumberField value={units} onChange={setUnits} min={1} step={1} testId="company-supply-units" label={t('company.ui.deals.supply.units')} className="h-11" />
          <NumberField value={price} onChange={setPrice} min={0} step={0.01} testId="company-supply-price" label={t('company.ui.deals.supply.price')} className="h-11" />
          <SpendReview variant="brass" testId="company-supply-sign" label={t('company.ui.deals.supply.sign')} title={t('company.ui.deals.supply.sign')} rows={[{ label: t('company.ui.deals.supply.units'), value: unitsValue === null ? '—' : String(unitsValue) }, { label: t('company.ui.deals.supply.price'), value: priceValue === null ? '—' : money(priceValue) }]} disabled={busy || unitsValue === null || priceValue === null} onConfirm={sign} />
        </div>
      )}
      <div className="mt-3"><RefusalNote refusal={refusal} /></div>
      {co.supplyDeals.length === 0 ? (
        <p className="mt-3 text-small text-fg-muted">{t('company.ui.deals.supply.none')}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left" data-testid="company-supply-deals">
            <thead>
              <tr>
                <Th>{t('company.ui.deals.supply.supplier')}</Th>
                <Th right>{t('company.ui.deals.supply.units')}</Th>
                <Th right>{t('company.ui.deals.supply.price')}</Th>
              </tr>
            </thead>
            <tbody>
              {co.supplyDeals.map((d) => (
                <tr key={d.id} className="border-t border-ink-2">
                  <Td>{nameOf(d.sellerId)}{d.related ? <span className="block text-caption text-fg-faint">{t('company.ui.deals.supply.related')}</span> : null}</Td>
                  <Td right num>{d.unitsPerDay}</Td>
                  <Td right num>{money(d.price)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
