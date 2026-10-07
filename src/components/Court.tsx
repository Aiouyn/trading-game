'use client';

import { useState } from 'react';
import { compactMoney, money } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import type { CourtCase } from '@/world/types';
import { Button, Card, CardHeader, Chip, NumberField, Select, ticksLabel } from './ui';

const COUNSEL = [
  { value: '0', label: 'Represent yourself · $0' },
  { value: '1', label: 'Junior counsel · $5,000' },
  { value: '2', label: 'Senior partner · $25,000' },
  { value: '3', label: 'Star litigator · $120,000' },
];

/**
 * The court (bible 03): evidence against a bar decides; lawyers nudge the odds a little but can't
 * buy a verdict. Fines are a share of net worth and mostly destroyed; the victim gets damages.
 */
export function CourtView() {
  const me = useGame((s) => s.me)!;
  const directory = useGame((s) => s.directory);
  const act = useGame((s) => s.act);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const others = directory.filter((d) => d.id !== me.player.id);
  const evidenceIds = me.security.evidence.map((e) => e.against);
  const defaulters = me.deals.filter((d) => d.status === 'defaulted' && d.fromId === me.player.id).map((d) => d.toId);
  const suggested = [...new Set([...evidenceIds, ...defaulters])];
  const [def, setDef] = useState(suggested[0] ?? others[0]?.id ?? '');
  const [kind, setKind] = useState<CourtCase['kind']>(defaulters.includes(suggested[0] ?? '') ? 'loan default' : 'cyber intrusion');
  const [counsel, setCounsel] = useState('1');
  const name = (id: string) => directory.find((d) => d.id === id)?.handle ?? id;
  const mine = me.cases.slice().sort((a, b) => b.filedTick - a.filedTick);
  return (
    <div className="flex flex-col gap-4" data-testid="court-view">
      <Card className="p-4">
        <h1 className="font-serif text-hero">Port Avalon Court</h1>
        <p className="max-w-2xl text-small text-fg-muted">Cases need evidence: 40 points clears the civil bar, model theft needs 55. Counsel shifts the odds slightly, never decisively. Verdicts award damages to you and a fine (a share of the loser’s net worth) that mostly leaves the economy. Nothing takes anyone below $5,000.</p>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[380px_1fr] [&>*]:min-w-0">
        <Card className="p-4">
          <h3 className="font-serif text-title">File a case</h3>
          <div className="mt-3 flex flex-col gap-2">
            <Select label="Defendant" value={def} onChange={setDef} options={[...suggested.map((id) => ({ value: id, label: `${name(id)} (you have a claim)` })), ...others.filter((o) => !suggested.includes(o.id)).map((o) => ({ value: o.id, label: o.handle }))]} />
            <Select label="Claim" value={kind} onChange={setKind} options={[
              { value: 'cyber intrusion', label: 'Cyber intrusion' }, { value: 'model theft', label: 'Model theft (watermark evidence)' },
              { value: 'loan default', label: 'Loan default' }, { value: 'contract breach', label: 'Contract breach' },
            ]} />
            <Select label="Counsel" value={counsel} onChange={setCounsel} options={COUNSEL} />
            <p className="text-caption text-fg-faint">Evidence against {name(def)}: {Math.round(me.security.evidence.find((e) => e.against === def)?.points ?? (defaulters.includes(def) ? 80 : 0))} points. Filing fee $2,000 + counsel.</p>
            <Button variant="brass" onClick={() => act({ type: 'court.file', defendantId: def, kind, counsel: Number(counsel) }, { success: 'Case filed. Hearing in 2 game days.' })} testId="file-case">File</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Your cases" />
          {mine.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">No cases.</p> : (
            <ul>
              {mine.map((c) => <CaseRow key={c.id} c={c} me={me.player.id} name={name} tick={tick} />)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function CaseRow({ c, me, name, tick }: { c: CourtCase; me: string; name: (id: string) => string; tick: number }) {
  const act = useGame((s) => s.act);
  const [offer, setOffer] = useState('');
  const plaintiff = c.plaintiffId === me;
  return (
    <li className="border-t border-ink-2 px-4 py-3" data-testid={`case-${c.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small"><b>{name(c.plaintiffId)}</b> v. <b>{name(c.defendantId)}</b> · {c.kind}</span>
        <Chip className={c.status === 'won' ? (plaintiff ? 'border-gain/50 text-gain' : 'border-loss/50 text-loss') : c.status === 'lost' ? (plaintiff ? 'border-loss/50 text-loss' : 'border-gain/50 text-gain') : ''}>{c.status}</Chip>
      </div>
      <p className="num mt-1 text-caption text-fg-faint">Filed {clockLabel(c.filedTick, 720)} · evidence {Math.round(c.evidence)} vs bar {c.bar}{c.status === 'filed' ? ` · hearing in ${ticksLabel(c.hearingTick - tick)}` : ''}</p>
      {c.verdictText && <p className="mt-1 text-small text-fg-muted">{c.verdictText}</p>}
      {c.status === 'filed' && !plaintiff && (
        <div className="mt-2 flex items-center gap-2">
          <NumberField label="Settle for" value={offer} onChange={setOffer} suffix="$" className="h-9 w-56" />
          <Button size="sm" onClick={() => act({ type: 'court.settle', caseId: c.id, amount: Number(offer) }, { success: 'Settlement offered' })}>Offer</Button>
        </div>
      )}
      {c.status === 'filed' && plaintiff && c.settlementOffer && (
        <div className="mt-2 flex items-center gap-2 text-small">
          <span>Settlement offered: <b className="num">{money(c.settlementOffer)}</b></span>
          <Button size="sm" variant="brass" onClick={() => act({ type: 'court.acceptSettlement', caseId: c.id }, { success: 'Settled' })}>Accept</Button>
        </div>
      )}
      {c.damages > 0 && <p className="num mt-1 text-caption text-fg-faint">Damages {compactMoney(c.damages)} · fine {compactMoney(c.fine)}</p>}
    </li>
  );
}
