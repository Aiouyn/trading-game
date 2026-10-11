'use client';

// R&D (Velvet 4 and C4): the running projects with their odds (a band of plus or minus 5 points on the frozen odds), their
// gain (bear, base and bull in quality-score points) and, for pharma, the odds of each of the three gates; the patents in
// force, which pause NPC copying of a gain; and a form to start one. One project at a time: a second start is sent to the
// engine, which refuses it (projectBusy), and the refusal is shown inline.
import { useState } from 'react';
import { COMPANY, PHARMA_GATES } from '@/content/company';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { NumberField, Select, SpendReview, spendRows, TextField } from '@/components/ui';
import type { CompanyFounderView } from '@/world/company/views';
import type { ProjectKind } from '@/world/company/types';
import { PrivateChip, RefusalNote, Section } from './Shared';
import { numberOrNull, refusalOf, type Refusal } from './model';
import { PROJECT_IDS, projectLabel } from './labels';

export function RnD({ co }: { co: CompanyFounderView }) {
  const act = useGame((s) => s.act);
  const cash = useGame((s) => s.me?.account?.cash ?? 0);
  const [kind, setKind] = useState<ProjectKind>('quality');
  const [productId, setProductId] = useState(co.productsPrivate[0]?.id ?? '');
  const [spend, setSpend] = useState('50000');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = numberOrNull(spend);
  const productName = co.productsPrivate.find((p) => p.id === productId)?.name ?? '';
  const patented = co.productsPrivate.filter((p) => p.patents.length > 0);

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
                {p.gateOdds.length > 0 ? (
                  <div className="mt-2" data-testid="company-project-gates">
                    <p className="text-caption text-fg-faint">{t('company.ui.rd.gatesTitle')}</p>
                    <ol className="mt-1 flex flex-col gap-1">
                      {p.gateOdds.map((odds, i) => (
                        <li key={i} className="text-caption text-fg-muted" data-testid="company-project-gate">
                          {t('company.ui.rd.gate', { n: i + 1, odds: pct(odds), days: PHARMA_GATES.gateDays })}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-1 text-caption text-fg-faint">{t('company.ui.rd.gatesNote')}</p>
                  </div>
                ) : null}
                <p className="mt-2 text-caption text-fg-faint">{t('company.ui.rd.endsOn', { day: p.endDay })}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-caption text-fg-faint">{t('company.ui.rd.bandNote')}</p>
      </Section>
      <Section title={t('company.ui.rd.patents')} chip={<PrivateChip />} testId="company-patents">
        {patented.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.rd.patentsNone')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {patented.flatMap((p) => p.patents.map((pt, i) => (
              <li key={`${p.id}-${i}`} className="text-small text-fg" data-testid="company-patent">
                {t('company.ui.rd.patentRow', { product: p.name, points: pt.points.toFixed(1), until: pt.until })}
              </li>
            )))}
          </ul>
        )}
        <p className="mt-3 text-caption text-fg-faint">{t('company.ui.rd.patentsNote')}</p>
      </Section>
      <Launch co={co} />
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
            <SpendReview variant="brass" testId="company-rd-submit" label={t('company.ui.rd.start')} title={t('company.ui.rd.start')} rows={spendRows(amount ?? 0, cash)} disabled={busy || amount === null || !productId} onConfirm={start} />
          </div>
        </div>
      </Section>
    </div>
  );
}

/**
 * The next-gen launch (O-17, ruling O-20): a next-gen success waits as a launch credit. The form is always there: the
 * engine launches any credit, and the ready mark is advice. Below the mark the screen says so in three parts (what, why,
 * do) and asks the founder to confirm before the launch is sent. At or above the mark the form is plain. The engine's
 * refusals are shown inline.
 */
function Launch({ co }: { co: CompanyFounderView }) {
  const act = useGame((s) => s.act);
  const credit = co.launchCredits[0];
  const [name, setName] = useState<string | null>(null);
  const [price, setPrice] = useState(String(COMPANY.demand.priceRef));
  const [acceptBelow, setAcceptBelow] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = numberOrNull(price);
  const label = name ?? (credit ? t('company.ui.launch.defaultName', { generation: credit.generation }) : '');
  const mark = co.limits.qualityReady;
  const belowMark = credit !== undefined && !credit.ready;
  const blocked = busy || amount === null || label.trim() === '' || (belowMark && !acceptBelow);
  const launch = async () => {
    if (blocked) return;
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId: co.id, action: { kind: 'launchProduct', name: label.trim(), price: amount } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
    if (ack.ok) {
      setName(null);
      setAcceptBelow(false);
    }
  };
  return (
    <Section title={t('company.ui.launch.title')} chip={<PrivateChip />} testId="company-launch">
      {!credit ? (
        <p className="text-small text-fg-muted" data-testid="company-launch-none">{t('company.ui.launch.none')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {credit.ready ? (
            <p className="text-small text-fg" data-testid="company-launch-ready">{t('company.ui.launch.ready', { score: credit.score, mark })}</p>
          ) : (
            <div role="note" className="flex flex-col gap-1 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-small" data-testid="company-launch-not-ready">
              <p className="font-medium text-fg" data-testid="company-launch-warn-what">{t('company.ui.launch.belowMark.what', { score: credit.score, mark })}</p>
              <p className="text-fg-muted" data-testid="company-launch-warn-why">{t('company.ui.launch.belowMark.why')}</p>
              <p className="text-fg" data-testid="company-launch-warn-do">{t('company.ui.launch.belowMark.do')}</p>
            </div>
          )}
          {co.launchCredits.length > 1 ? (
            <p className="text-caption text-fg-faint">{t('company.ui.launch.queue', { count: co.launchCredits.length - 1 })}</p>
          ) : null}
          <div className="grid gap-3 @md:grid-cols-[2fr_1fr]">
            <TextField value={label} onChange={setName} maxLength={40} testId="company-launch-name" label={t('company.ui.launch.name')} />
            <NumberField value={price} onChange={setPrice} min={1} step={1} testId="company-launch-price" label={t('company.ui.launch.price')} className="h-11" />
          </div>
          <RefusalNote refusal={refusal} />
          {belowMark ? (
            <label className="flex items-center gap-2 text-small text-fg" data-testid="company-launch-accept">
              <input type="checkbox" checked={acceptBelow} onChange={(e) => setAcceptBelow(e.target.checked)} data-testid="company-launch-accept-input" />
              {t('company.ui.launch.acceptBelow', { score: credit.score, mark })}
            </label>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-caption text-fg-faint">{t('company.ui.launch.note')}</span>
            <SpendReview variant="brass" testId="company-launch-submit" label={t('company.ui.launch.submit')} title={t('company.ui.launch.submit')} rows={[{ label: t('commit.price'), value: money(amount ?? 0) }]} disabled={blocked} onConfirm={launch} />
          </div>
        </div>
      )}
    </Section>
  );
}
