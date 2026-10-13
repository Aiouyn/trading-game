'use client';

// Founding (Velvet 3.1 and the C4 founder template): name, sector, city and starting capital. The company starts at R2
// with one product, the template's people and four first goals. A refusal is shown inline with its three parts.
import { useState } from 'react';
import { CITIES } from '@/engine';
import { COMPANY, type CompanySector } from '@/content/company';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { isAppUnlocked } from '@/shell/ctx';
import { Card, NumberField, Select, SpendReview, spendRows, TextField } from '@/components/ui';
import { RefusalNote, Section } from './Shared';
import { numberOrNull, refusalOf, type Refusal } from './model';
import { SECTOR_IDS, sectorLabel } from './labels';

export function Found() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [name, setName] = useState('');
  const [sector, setSector] = useState<CompanySector>(COMPANY.founding.sector);
  const [cityId, setCityId] = useState(CITIES[0]?.id ?? '');
  const [capital, setCapital] = useState(String(COMPANY.founding.capital));
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isAppUnlocked('company', me.player.rankId)) {
    return (
      <Card className="p-6 text-center" data-testid="company-locked">
        <p className="font-serif text-title text-fg-muted">{t('company.ui.locked')}</p>
      </Card>
    );
  }

  const amount = numberOrNull(capital);
  const ready = name.trim().length > 0 && amount !== null && amount >= COMPANY.founding.minEquity;
  const heads = COMPANY.founding.heads;
  const headCount = heads.ops + heads.sales + heads.rd + heads.ga;

  const found = async () => {
    if (!ready || amount === null || busy) return;
    setBusy(true);
    const ack = await act({ type: 'company.found', name: name.trim(), sector, cityId, capital: amount }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="company-found">
      <Section title={t('company.ui.found.title')}>
        <p className="text-small text-fg-muted">{t('company.ui.found.intro')}</p>
        <div className="mt-4 grid gap-3 @md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="label">{t('company.ui.found.name')}</span>
            <TextField value={name} onChange={setName} maxLength={40} testId="company-name" label={t('company.ui.found.name')} className="w-full" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">{t('company.ui.found.sector')}</span>
            <Select<CompanySector>
              value={sector}
              onChange={setSector}
              label={t('company.ui.found.sector')}
              testId="company-sector"
              className="h-11 w-full"
              options={SECTOR_IDS.map((id) => ({ value: id, label: sectorLabel(id) }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">{t('company.ui.found.city')}</span>
            <Select<string>
              value={cityId}
              onChange={setCityId}
              label={t('company.ui.found.city')}
              testId="company-city"
              className="h-11 w-full"
              options={CITIES.map((c) => ({ value: c.id, label: c.name }))}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="label">{t('company.ui.found.capital')}</span>
            <NumberField value={capital} onChange={setCapital} min={COMPANY.founding.minEquity} testId="company-found-capital" label="$" />
            <span className="text-caption text-fg-faint">{t('company.ui.found.minCapital', { min: money(COMPANY.founding.minEquity) })}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <RefusalNote refusal={refusal} />
          <div className="flex justify-end">
            <SpendReview variant="brass" testId="company-found-submit" label={t('company.ui.found.submit')} title={t('company.ui.found.submit')} rows={spendRows(amount ?? 0, me.account?.cash ?? 0)} disabled={!ready || busy} onConfirm={found} />
          </div>
        </div>
      </Section>
      <Section title={t('company.ui.found.template')} testId="company-template">
        <p className="text-small text-fg-muted">
          {t('company.ui.found.templateBody', { price: money(COMPANY.founding.productPrice), heads: headCount })}
        </p>
      </Section>
    </div>
  );
}
