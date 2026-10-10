'use client';

// R&D (Velvet 4 and C4): the running projects with their odds (a band of plus or minus 5 points on the frozen odds)
// and their gain (bear, base and bull in quality-score points), and a form to start one. One project at a time.
import { useState } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, NumberField, Select } from '@/components/ui';
import type { CompanyFounderView } from '@/world/company/views';
import type { ProjectKind } from '@/world/company/types';
import { PrivateChip, RefusalNote, Section } from './Shared';
import { numberOrNull, refusalOf, type Refusal } from './model';
import { PROJECT_IDS, projectLabel } from './labels';

export function RnD({ co }: { co: CompanyFounderView }) {
  const act = useGame((s) => s.act);
  const [kind, setKind] = useState<ProjectKind>('quality');
  const [productId, setProductId] = useState(co.productsPrivate[0]?.id ?? '');
  const [spend, setSpend] = useState('50000');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const busyAtOnce = co.projects.length >= co.limits.rdProjectsAtOnce;
  const amount = numberOrNull(spend);
  const productName = co.productsPrivate.find((p) => p.id === productId)?.name ?? '';

  const start = async () => {
    if (amount === null || !productId || busy) return;
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId: co.id, action: { kind: 'startProject', projectKind: kind, productId, spend: amount } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="company-rd">
      <Section title={t('company.ui.rd.title')} chip={<PrivateChip />} testId="company-rd-projects">
        {co.projects.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.rd.none')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {co.projects.map((p) => (
              <li key={p.id} className="rounded-md border border-ink-3 p-3" data-testid={`company-project-${p.id}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-small font-medium text-fg">{projectLabel(p.kind as ProjectKind)}</span>
                  <span className="num text-caption text-fg-faint">{money(p.spend)}</span>
                </div>
                <p className="mt-1 text-caption text-fg-muted" data-testid="company-project-odds">
                  {t('company.ui.rd.odds', { low: Math.round(p.pBand[0] * 100), high: Math.round(p.pBand[1] * 100) })}
                </p>
                <p className="text-caption text-fg-muted" data-testid="company-project-gain">
                  {t('company.ui.rd.gain', { bear: p.gainPoints[0].toFixed(1), base: p.gainPoints[1].toFixed(1), bull: p.gainPoints[2].toFixed(1) })}
                </p>
                <p className="text-caption text-fg-faint">{t('company.ui.rd.endsOn', { day: p.endDay })}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-caption text-fg-faint">{t('company.ui.rd.bandNote')}</p>
      </Section>
      <Section title={t('company.ui.rd.start')} testId="company-rd-start">
        <div className="grid gap-3 @md:grid-cols-3">
          <Select<ProjectKind>
            value={kind}
            onChange={setKind}
            label={t('company.ui.rd.kind')}
            testId="company-rd-kind"
            className="h-11 w-full"
            options={PROJECT_IDS.map((id) => ({ value: id, label: projectLabel(id) }))}
          />
          <Select<string>
            value={productId}
            onChange={setProductId}
            label={t('company.ui.rd.product')}
            testId="company-rd-product"
            className="h-11 w-full"
            options={co.productsPrivate.map((p) => ({ value: p.id, label: p.name }))}
          />
          <NumberField value={spend} onChange={setSpend} min={1} step={1} testId="company-rd-spend" label={t('company.ui.rd.spend')} className="h-11" />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <RefusalNote refusal={refusal} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption text-fg-faint">{productName}</span>
            <Button variant="brass" disabled={busy || busyAtOnce || amount === null || !productId} onClick={start} testId="company-rd-submit">
              {t('company.ui.rd.start')}
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
