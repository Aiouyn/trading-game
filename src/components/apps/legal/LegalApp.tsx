'use client';

// Legal & Court (Velvet app 9): file a case, follow your cases, settle. Evidence decides; counsel nudges
// the odds a little but cannot buy a verdict (bible 03).
import { useState } from 'react';
import { compactMoney, money } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import { COUNSEL_COST } from '@/world/court';
import type { EcaInquiryView } from '@/world/eca';
import type { CourtCase } from '@/world/types';
import { t } from '@/i18n';
import { Button, Card, CardHeader, Chip, NumberField, Select, ticksLabel } from '@/components/ui';

const COUNSEL_FEES = ['0', '1', '2', '3'] as const;
const COUNSEL_NAME = ['selfRep', 'junior', 'senior', 'star'] as const;

type Kind = CourtCase['kind'];

export function LegalApp() {
  const me = useGame((s) => s.me)!;
  const directory = useGame((s) => s.directory);
  const act = useGame((s) => s.act);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const others = directory.filter((d) => d.id !== me.player.id);
  const evidenceIds = me.security.evidence.map((e) => e.against);
  const defaulters = me.deals.filter((d) => d.status === 'defaulted' && d.fromId === me.player.id).map((d) => d.toId);
  const suggested = [...new Set([...evidenceIds, ...defaulters])];
  // The directory can arrive after mount, so the defendant is derived: the pick while it is still a valid
  // target, else the first suggestion, else the first other player. Launch never sits on an empty value.
  const [pickDef, setDef] = useState<string | null>(null);
  const def = pickDef && (others.some((o) => o.id === pickDef) || suggested.includes(pickDef)) ? pickDef : (suggested[0] ?? others[0]?.id ?? '');
  const [kind, setKind] = useState<Kind>(defaulters.includes(def) ? 'loan default' : 'cyber intrusion');
  const [counsel, setCounsel] = useState('1');
  const name = (id: string) => directory.find((d) => d.id === id)?.handle ?? id;
  const mine = me.cases.slice().sort((a, b) => b.filedTick - a.filedTick);
  const points = Math.round(me.security.evidence.find((e) => e.against === def)?.points ?? (defaulters.includes(def) ? 80 : 0));
  return (
    <div className="flex flex-col gap-4" data-testid="court-view">
      <Card className="p-4">
        <h1 className="font-serif text-hero">{t('shell.app.legal')}</h1>
        <p className="max-w-2xl text-small text-fg-muted">{t('legal.intro')}</p>
      </Card>
      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,380px)_1fr] [&>*]:min-w-0">
        <Card className="p-4">
          <h2 className="font-serif text-title">{t('legal.file.title')}</h2>
          <div className="mt-3 flex flex-col gap-2">
            <Select label={t('legal.file.defendant')} value={def} onChange={(v) => setDef(v)} options={[
              ...suggested.map((id) => ({ value: id, label: t('legal.file.claim', { name: name(id) }) })),
              ...others.filter((o) => !suggested.includes(o.id)).map((o) => ({ value: o.id, label: o.handle })),
            ]} />
            <Select label={t('legal.file.kind')} value={kind} onChange={setKind} options={[
              { value: 'cyber intrusion', label: t('legal.kind.intrusion') },
              { value: 'model theft', label: t('legal.kind.theft') },
              { value: 'loan default', label: t('legal.kind.default') },
              { value: 'contract breach', label: t('legal.kind.breach') },
            ]} />
            <Select label={t('legal.file.counsel')} value={counsel} onChange={setCounsel} options={COUNSEL_FEES.map((c) => ({
              value: c,
              label: t(`legal.counsel.${COUNSEL_NAME[Number(c)]}`, { cost: compactMoney(COUNSEL_COST[c]) }),
            }))} />
            <p className="text-caption text-fg-faint">{t('legal.file.evidence', { name: name(def), points })}</p>
            <Button variant="brass" onClick={() => act({ type: 'court.file', defendantId: def, kind, counsel: Number(counsel) }, { success: t('legal.filed') })} testId="file-case">{t('legal.file.button')}</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title={t('legal.cases.title')} />
          {mine.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">{t('legal.cases.none')}</p> : (
            <ul>
              {mine.map((c) => <CaseRow key={c.id} c={c} me={me.player.id} name={name} tick={tick} />)}
            </ul>
          )}
        </Card>
      </div>
      <EcaCard inquiries={me.regulator ?? []} />
    </div>
  );
}

/** The market regulator's letters to this player (M16 v2): each inquiry's stage and its letters, every letter in three parts. */
function EcaCard({ inquiries }: { inquiries: EcaInquiryView[] }) {
  return (
    <Card data-testid="eca-view">
      <CardHeader title={t('legal.eca.title')} />
      <p className="px-4 pb-2 text-small text-fg-muted">{t('legal.eca.intro')}</p>
      {inquiries.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">{t('legal.eca.none')}</p> : (
        <ul>
          {inquiries.map((q) => (
            <li key={q.id} className="border-t border-ink-2 px-4 py-3" data-testid={`eca-${q.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-small">{t('legal.eca.inquiry', { ticker: q.ticker })}</span>
                <Chip>{t(`legal.eca.stage.${q.stage}`)}</Chip>
              </div>
              <p className="num mt-1 text-caption text-fg-faint">{t('legal.eca.opened', { day: q.openedDay })}</p>
              {q.letters.map((l, i) => (
                <div key={`${q.id}-${i}`} className="mt-2 rounded-md border border-ink-2 p-3" data-testid={`eca-letter-${q.id}-${i}`}>
                  <p className="text-caption text-fg-faint">{t(`legal.eca.letter.${l.kind}`)} · {t('legal.eca.day', { day: l.day })}</p>
                  <dl className="mt-1 flex flex-col gap-1 text-small">
                    <div><dt className="inline font-medium">{t('legal.eca.part.what')}: </dt><dd className="inline">{t(l.what.key, l.what.vars)}</dd></div>
                    <div><dt className="inline font-medium">{t('legal.eca.part.why')}: </dt><dd className="inline">{t(l.why.key, l.why.vars)}</dd></div>
                    <div><dt className="inline font-medium">{t('legal.eca.part.do')}: </dt><dd className="inline">{t(l.do.key, l.do.vars)}</dd></div>
                  </dl>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CaseRow({ c, me, name, tick }: { c: CourtCase; me: string; name: (id: string) => string; tick: number }) {
  const act = useGame((s) => s.act);
  const [offer, setOffer] = useState('');
  const plaintiff = c.plaintiffId === me;
  const statusKey = `legal.status.${c.status}` as const;
  return (
    <li className="border-t border-ink-2 px-4 py-3" data-testid={`case-${c.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small">{t('legal.case.parties', { plaintiff: name(c.plaintiffId), defendant: name(c.defendantId) })} · {t(`legal.kind.${kindKey(c.kind)}`)}</span>
        <Chip className={c.status === 'won' ? (plaintiff ? 'border-gain/50 text-gain' : 'border-loss/50 text-loss') : c.status === 'lost' ? (plaintiff ? 'border-loss/50 text-loss' : 'border-gain/50 text-gain') : ''}>{t(statusKey)}</Chip>
      </div>
      <p className="num mt-1 text-caption text-fg-faint">
        {t('legal.case.filed', { when: clockLabel(c.filedTick, 720), evidence: Math.round(c.evidence), bar: c.bar })}
        {c.status === 'filed' ? ` · ${t('legal.case.hearing', { when: ticksLabel(c.hearingTick - tick) })}` : ''}
      </p>
      {c.verdictText && <p className="mt-1 text-small text-fg-muted">{c.verdictText}</p>}
      {c.status === 'filed' && !plaintiff && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NumberField label={t('legal.settle.for')} value={offer} onChange={setOffer} suffix="$" className="h-9 w-56" testId={`case-offer-${c.id}`} />
          <Button size="sm" onClick={() => act({ type: 'court.settle', caseId: c.id, amount: Number(offer) }, { success: t('legal.settle.offered') })}>{t('legal.settle.offer')}</Button>
        </div>
      )}
      {c.status === 'filed' && plaintiff && c.settlementOffer && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-small">
          <span>{t('legal.settle.received')} <b className="num">{money(c.settlementOffer)}</b></span>
          <Button size="sm" variant="brass" onClick={() => act({ type: 'court.acceptSettlement', caseId: c.id }, { success: t('legal.settle.done') })}>{t('legal.settle.accept')}</Button>
        </div>
      )}
      {c.damages > 0 && <p className="num mt-1 text-caption text-fg-faint">{t('legal.case.damages', { damages: compactMoney(c.damages), fine: compactMoney(c.fine) })}</p>}
    </li>
  );
}

/** Translation key suffix for a case kind (the kind strings are data; the labels are copy). */
function kindKey(kind: Kind): 'intrusion' | 'theft' | 'default' | 'breach' {
  if (kind === 'model theft') return 'theft';
  if (kind === 'loan default') return 'default';
  if (kind === 'contract breach') return 'breach';
  return 'intrusion';
}
