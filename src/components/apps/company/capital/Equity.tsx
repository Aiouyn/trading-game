'use client';

// The equity cards of the Listing view: the cap table, the private round (NPC investors only, before listing) and the IPO
// (eligibility, the one-day book, the float slider, the lockup). Every number is the world's; the slider reads the previews.
import { useState } from 'react';
import { t } from '@/i18n';
import { money, pct, price, qty } from '@/game/format';
import { Button, NumberField, Select } from '@/components/ui';
import type { CapitalView, CapTableRow } from '@/world/company/capital';
import { Line, Note, Panel, RefusalBox, numOf, useAct, type Refusal } from './shared';

function holderLabel(r: CapTableRow): string {
  if (r.kind === 'founder') return t('company.capital.cap.founder');
  if (r.kind === 'investor') return t('company.capital.cap.investor', { kind: t(`company.capital.investor.${r.investor ?? 'other'}`) });
  return t(`company.capital.cap.${r.kind}`);
}

export function CapTablePanel({ cap }: { cap: CapitalView }) {
  return (
    <Panel
      testId="company-captable"
      title={t('company.capital.cap.title')}
      sub={t(cap.listed ? 'company.capital.cap.subListed' : 'company.capital.cap.subPrivate', { shares: qty(cap.shares) })}
      chip="private"
    >
      <table className="w-full text-small" data-testid="company-captable-rows">
        <thead>
          <tr className="text-caption text-fg-faint">
            <th className="py-1 text-left font-normal">{t('company.capital.cap.holder')}</th>
            <th className="py-1 text-right font-normal">{t('company.capital.cap.shares')}</th>
            <th className="py-1 text-right font-normal">{t('company.capital.cap.stake')}</th>
          </tr>
        </thead>
        <tbody>
          {cap.capTable.map((r) => (
            <tr key={r.key} className="border-t border-ink-2" data-kind={r.kind}>
              <td className="py-2 text-fg">{holderLabel(r)}</td>
              <td className="num py-2 text-right text-fg">{qty(r.shares)}</td>
              <td className="num py-2 text-right text-fg-muted">{pct(r.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note>{t('company.capital.cap.rule')}</Note>
    </Panel>
  );
}

export function RoundPanel({ cap }: { cap: CapitalView }) {
  const r = cap.rounds;
  const act = useAct();
  const [amount, setAmount] = useState('');
  const [vote, setVote] = useState<'yes' | 'no'>('no');
  const n = numOf(amount);
  const ok = r.open && Number.isFinite(n) && n > 0;
  return (
    <Panel testId="company-round" title={t('company.capital.round.title')} sub={t('company.capital.round.sub')} chip="private">
      <Line k={t('company.capital.round.price')} v={r.pricePerShare === null ? '—' : price(r.pricePerShare)} testId="company-round-price" />
      <Line k={t('company.capital.round.max')} v={r.maxAmount === null ? '—' : money(r.maxAmount)} testId="company-round-max" />
      <Line k={t('company.capital.round.pool')} v={money(r.poolCash)} />
      {!r.open && r.refusal && <RefusalBox refusal={r.refusal as Refusal} testId="company-round-refusal" />}
      {r.open && (
        <>
          <NumberField value={amount} onChange={setAmount} label={t('company.capital.round.amount')} suffix="$" min={0} step={1000} testId="company-round-amount" />
          <Select<'yes' | 'no'>
            value={vote}
            onChange={setVote}
            label={t('company.capital.round.vote')}
            testId="company-round-vote"
            options={[{ value: 'no', label: t('company.capital.round.vote.no') }, { value: 'yes', label: t('company.capital.round.vote.yes') }]}
          />
          <Note>{t('company.capital.round.voteRule', { share: Math.round(r.voteShare * 100) })}</Note>
          <Button
            variant="brass"
            disabled={!ok || act.busy}
            onClick={() => act.run({ type: 'company.act', companyId: cap.companyId, action: { kind: 'raiseRound', amount: n, founderVote: vote } }, t('company.capital.round.done'))}
            testId="company-round-raise"
          >
            {t('company.capital.round.raise')}
          </Button>
        </>
      )}
      {act.refusal && <RefusalBox refusal={act.refusal} />}
    </Panel>
  );
}

export function IpoPanel({ cap }: { cap: CapitalView }) {
  const ipo = cap.ipo;
  const act = useAct();
  const [floor, setFloor] = useState(Math.round(ipo.floatMin * 100));
  const preview = ipo.previews.find((p) => Math.round(p.floatPct * 100) === floor);
  const pctFloor = (x: number) => Math.round(x * 100);
  const requirements: { key: string; text: string }[] = [
    { key: 'quarters', text: t('company.capital.ipo.req.quarters', { filed: ipo.filedQuarters, min: ipo.minFiledQuarters }) },
    { key: 'value', text: t('company.capital.ipo.req.value', { value: money(ipo.filedV), min: money(ipo.minValue) }) },
    { key: 'rank', text: t('company.capital.ipo.req.rank', { rank: ipo.minRank }) },
  ];
  return (
    <Panel
      testId="company-ipo-prep"
      title={t('company.capital.ipo.title')}
      sub={t('company.capital.ipo.sub', { discount: pctFloor(ipo.discount), lockup: ipo.lockupDays })}
      chip="private"
    >
      {ipo.phase === 'listed' && (
        <Line k={t('company.capital.ipo.lockupEnds')} v={ipo.lockupUntil === null ? '—' : t('company.capital.day', { day: ipo.lockupUntil })} testId="company-ipo-lockup" />
      )}
      {ipo.phase === 'listed' && <Line k={t('company.capital.ipo.yourShares')} v={qty(ipo.founderShares)} testId="company-ipo-shares" />}
      {ipo.phase !== 'listed' && (
        <ul className="flex flex-col gap-1 text-small" data-testid="company-ipo-reqs">
          {requirements.map((q) => <li key={q.key} className="text-fg-muted">{q.text}</li>)}
        </ul>
      )}
      {ipo.book && (
        <div className="flex flex-col gap-1 rounded-md border border-brass/40 px-3 py-2 text-small" data-testid="company-ipo-book">
          <Line k={t('company.capital.ipo.bookPrice')} v={price(ipo.book.price)} />
          <Line k={t('company.capital.ipo.bookShares')} v={qty(ipo.book.ipoShares)} />
          <Line k={t('company.capital.ipo.listDay')} v={t('company.capital.day', { day: ipo.book.listDay })} />
        </div>
      )}
      {ipo.phase === 'eligible' && (
        <>
          <label className="flex flex-col gap-1 text-small text-fg-muted">
            <span>{t('company.capital.ipo.float', { float: floor })}</span>
            <input
              type="range"
              min={Math.round(ipo.floatMin * 100)}
              max={Math.round(ipo.floatMax * 100)}
              step={1}
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
              aria-label={t('company.capital.ipo.floatLabel')}
              data-testid="company-ipo-float"
              className="w-full accent-brass"
            />
          </label>
          {preview && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-small" data-testid="company-ipo-preview">
              <Line k={t('company.capital.ipo.price')} v={price(preview.price)} />
              <Line k={t('company.capital.ipo.newShares')} v={qty(preview.ipoShares)} />
              <Line k={t('company.capital.ipo.proceeds')} v={money(preview.proceeds)} />
              <Line k={t('company.capital.ipo.fee')} v={money(preview.fee)} />
            </div>
          )}
          <Button
            variant="brass"
            disabled={act.busy || !preview}
            onClick={() => act.run({ type: 'company.ipo', companyId: cap.companyId, floatPct: floor / 100 }, t('company.capital.ipo.requested'))}
            testId="company-ipo-request"
          >
            {t('company.capital.ipo.request')}
          </Button>
        </>
      )}
      {ipo.phase === 'blocked' && ipo.refusal && <RefusalBox refusal={ipo.refusal as Refusal} testId="company-ipo-refusal" />}
      <Note testId="company-ipo-no-cashout">{t('company.capital.ipo.noCashout')}</Note>
      <Note testId="company-ipo-no-buy">{t('company.capital.ipo.noBuy')}</Note>
      {act.refusal && <RefusalBox refusal={act.refusal} testId="company-ipo-error" />}
      <Note>{t('company.capital.simulated')}</Note>
    </Panel>
  );
}
