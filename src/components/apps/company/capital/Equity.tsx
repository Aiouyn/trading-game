'use client';

// The equity cards of the Listing view: the cap table, the private round (NPC investors only, before listing) and the IPO
// (eligibility, the one-day book, the float slider, the lockup). Every number is the world's; the slider reads the previews.
import { useState } from 'react';
import { t } from '@/i18n';
import { money, pct, price, qty } from '@/game/format';
import { NumberField, Select, SpendReview } from '@/components/ui';
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
          <Note testId="company-round-votes">{t('company.capital.round.votes', { founder: qty(cap.voting.founderShares), npc: qty(cap.voting.npcShares) })}</Note>
          <SpendReview
            variant="brass"
            testId="company-round-raise"
            label={t('company.capital.round.raise')}
            title={t('company.capital.round.raise')}
            rows={[{ label: t('commit.amount'), value: money(Number.isFinite(n) ? n : 0) }, { label: t('company.capital.round.vote'), value: t(vote === 'yes' ? 'company.capital.round.vote.yes' : 'company.capital.round.vote.no') }]}
            disabled={!ok || act.busy}
            onConfirm={() => act.run({ type: 'company.act', companyId: cap.companyId, action: { kind: 'raiseRound', amount: n, founderVote: vote } }, t('company.capital.round.done'))}
          />
        </>
      )}
      {act.refusal && <RefusalBox refusal={act.refusal} testId="company-round-error" />}
    </Panel>
  );
}

export function IpoPanel({ cap }: { cap: CapitalView }) {
  const ipo = cap.ipo;
  const act = useAct();
  const [floor, setFloor] = useState(Math.round(ipo.floatMin * 100));
  const preview = ipo.previews.find((p) => Math.round(p.floatPct * 100) === floor);
  const pctFloor = (x: number) => Math.round(x * 100);
  // each eligibility rule of ipo.ts ipoEligibility, in its order; the refusal names the first one that fails
  const requirements: { key: string; text: string }[] = [
    { key: 'quarters', text: t('company.capital.ipo.req.quarters', { filed: ipo.filedQuarters, min: ipo.minFiledQuarters }) },
    { key: 'value', text: t('company.capital.ipo.req.value', { value: money(ipo.filedV), min: money(ipo.minValue) }) },
    { key: 'rank', text: t('company.capital.ipo.req.rank', { rank: ipo.minRank }) },
    { key: 'conviction', text: t('company.capital.ipo.req.conviction', { days: ipo.convictionDays }) },
    { key: 'covenant', text: t('company.capital.ipo.req.covenant') },
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
      <div className="flex flex-col gap-1 rounded-md border border-ink-3 px-3 py-2 text-small" data-testid="company-ipo-alloc">
        <p className="text-fg-muted">{t('company.capital.ipo.alloc.title')}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
          <li>{t('company.capital.ipo.alloc.cap', { pct: pctFloor(ipo.allocCapOfFloat), cap: qty(ipo.book?.cap ?? preview?.cap ?? 0) })}</li>
          <li>{t('company.capital.ipo.alloc.prorata')}</li>
          {ipo.cashLimited && <li>{t('company.capital.ipo.alloc.cash')}</li>}
          <li>{t('company.capital.ipo.alloc.age', { days: ipo.minAccountAgeDays })}</li>
          <li>{t('company.capital.ipo.alloc.owner')}</li>
        </ul>
      </div>
      {ipo.book && (
        <div className="flex flex-col gap-1 rounded-md border border-brass/40 px-3 py-2 text-small" data-testid="company-ipo-book">
          <Line k={t('company.capital.ipo.bookPrice')} v={price(ipo.book.price)} />
          <Line k={t('company.capital.ipo.bookShares')} v={qty(ipo.book.ipoShares)} />
          <Line k={t('company.capital.ipo.bookCap')} v={qty(ipo.book.cap)} testId="company-ipo-book-cap" />
          <Line k={t('company.capital.ipo.myOrder')} v={qty(ipo.book.myOrder)} testId="company-ipo-my-order" />
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
              <Line k={t('company.capital.ipo.previewCap')} v={qty(preview.cap)} testId="company-ipo-preview-cap" />
              <Line k={t('company.capital.ipo.proceeds')} v={money(preview.proceeds)} />
              <Line k={t('company.capital.ipo.fee')} v={money(preview.fee)} />
            </div>
          )}
          <SpendReview
            variant="brass"
            testId="company-ipo-request"
            label={t('company.capital.ipo.request')}
            title={t('company.capital.ipo.request')}
            rows={[{ label: t('company.capital.ipo.floatLabel'), value: `${floor}%` }, { label: t('commit.fee'), value: money(preview?.fee ?? 0) }]}
            disabled={act.busy || !preview}
            onConfirm={() => act.run({ type: 'company.ipo', companyId: cap.companyId, floatPct: floor / 100 }, t('company.capital.ipo.requested'))}
          />
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
