'use client';

// Bank & Credit (Velvet app 8). Cash, player loans, mortgages and margin. Every action here is an
// existing command: deal.offer / deal.respond / deal.cancel / deal.repay (loans, src/world/social.ts),
// prop.repay (mortgages, src/world/players.ts) and the license that sets margin (src/content/lifestyle.ts).
// There is no bank-issued credit line in the world yet, so that section says so instead of faking one.
import { useState } from 'react';
import { buyingPower } from '@/engine';
import { LICENSES, licenseFor, rankIndex } from '@/content/lifestyle';
import { compactMoney, money } from '@/game/format';
import { useGame } from '@/game/store';
import { usePublicPanel } from '@/game/usePublicPanel';
import { DEALS_RANK } from '@/world/social';
import type { Command, Deal } from '@/world/types';
import { t } from '@/i18n';
import { Button, Card, CardHeader, NumberField, Stat, TextField, ticksLabel } from '@/components/ui';
import { RestrictedNote } from '@/components/comeback/LowCashCard';

const TPD = 720;

export function BankApp() {
  usePublicPanel('directory');
  const me = useGame((s) => s.me)!;
  const world = useGame((s) => s.world);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const directory = useGame((s) => s.directory);
  const acct = me.account;
  const cash = acct?.cash ?? 0;
  const lic = licenseFor(me.player.rankId);
  const name = (id: string) => directory.find((d) => d.id === id)?.handle ?? id;
  const loans = me.deals.filter((d) => d.kind === 'loan');
  const owed = loans.filter((d) => d.toId === me.player.id && d.status === 'active');
  const lent = loans.filter((d) => d.fromId === me.player.id && d.status === 'active');
  const offersIn = loans.filter((d) => d.toId === me.player.id && d.status === 'offered');
  const offersOut = loans.filter((d) => d.fromId === me.player.id && d.status === 'offered');
  const mortgages = me.properties.filter((p) => p.mortgage > 0);
  const bp = world ? buyingPower(world, me.player.id) : null;
  return (
    <div className="flex flex-col gap-4" data-testid="bank-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-hero text-fg">{t('shell.app.bank')}</h1>
            <p className="text-small text-fg-muted">{t('bank.intro')}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 @md:grid-cols-4">
            <Stat label={t('common.cash')} value={money(cash)} testId="bank-cash" />
            <Stat label={t('bank.stat.owed')} value={compactMoney(owed.reduce((s, d) => s + (d.outstanding ?? 0), 0))} testId="bank-owed" />
            <Stat label={t('bank.stat.mortgages')} value={compactMoney(me.properties.reduce((s, p) => s + p.mortgage, 0))} />
            <Stat label={t('bank.stat.license')} value={lic.name} />
          </div>
        </div>
      </Card>

      <RestrictedNote />
      <div className="grid gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4" data-testid="bank-margin">
          <CardHeader title={t('bank.margin.title')} sub={t('bank.margin.sub')} />
          {acct?.marginCallTick !== undefined && (
            <p className="mt-2 rounded-md border border-warn/50 px-3 py-2 text-small text-warn" role="status">{t('bank.margin.call')}</p>
          )}
          <dl className="mt-2 flex flex-col gap-1 text-small">
            <Row k={t('bank.margin.license')} v={`${lic.name} · ${t(`license.blurb.${lic.id}`)}`} />
            <Row k={t('bank.margin.leverage')} v={`${acct?.maxLeverage ?? 1}×`} />
            <Row k={t('bank.margin.buyingPower')} v={bp === null ? '—' : money(bp)} />
            <Row k={t('bank.margin.shorting')} v={acct?.canShort ? t('bank.yes') : t('bank.no')} />
            <Row k={t('bank.margin.options')} v={acct?.canOptions ? t('bank.yes') : t('bank.no')} />
            <Row k={t('bank.margin.interestEarned')} v={money(acct?.interestEarned ?? 0)} />
            <Row k={t('bank.margin.interestPaid')} v={money(acct?.interestPaid ?? 0)} />
            <Row k={t('bank.margin.borrowPaid')} v={money(acct?.borrowPaid ?? 0)} />
          </dl>
          <p className="mt-3 text-caption text-fg-faint">{t('bank.margin.licenses', { list: LICENSES.map((l) => `${l.name} ${l.maxLeverage}×`).join(' · ') })}</p>
        </Card>

        <Card className="p-4" data-testid="bank-credit">
          <CardHeader title={t('bank.credit.title')} sub={t('bank.credit.sub')} />
          <p className="mt-2 text-small text-fg-muted" data-testid="bank-credit-empty">{t('bank.credit.none')}</p>
        </Card>
      </div>

      <Card className="p-4" data-testid="bank-mortgages">
        <CardHeader title={t('bank.mortgages.title')} sub={t('bank.mortgages.sub')} />
        {mortgages.length === 0 ? <p className="px-1 pb-2 text-small text-fg-faint">{t('bank.mortgages.none')}</p> : (
          <ul className="mt-2 flex flex-col">
            {mortgages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-2 py-3 text-small" data-testid={`bank-mortgage-${p.id}`}>
                <span className="min-w-0 text-fg-muted">{t('bank.mortgage.line', { value: compactMoney(p.value), rate: (p.mortgageRate * 100).toFixed(2) })}</span>
                <span className="flex items-center gap-3">
                  <span className="num text-fg">{money(p.mortgage)}</span>
                  <Button size="sm" disabled={cash <= 0} onClick={() => run({ type: 'prop.repay', propId: p.id, amount: p.mortgage }, t('bank.mortgage.repaid'))} testId={`bank-repay-mortgage-${p.id}`}>{t('bank.mortgage.repay')}</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4" data-testid="bank-owed-list">
          <CardHeader title={t('bank.owed.title')} sub={t('bank.owed.sub')} />
          {owed.length === 0 ? <p className="px-1 pb-2 text-small text-fg-faint">{t('bank.owed.none')}</p> : (
            <ul className="mt-2 flex flex-col">
              {owed.map((d) => <OwedRow key={d.id} d={d} from={name(d.fromId)} tick={tick} cash={cash} />)}
            </ul>
          )}
        </Card>
        <Card className="p-4" data-testid="bank-offers-in">
          <CardHeader title={t('bank.offersIn.title')} sub={t('bank.offersIn.sub')} />
          {offersIn.length === 0 ? <p className="px-1 pb-2 text-small text-fg-faint">{t('bank.offersIn.none')}</p> : (
            <ul className="mt-2 flex flex-col">
              {offersIn.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 border-t border-ink-2 py-3 text-small" data-testid={`bank-offer-${d.id}`}>
                  <span className="text-fg">{t('bank.offer.line', { from: name(d.fromId), amount: money(d.amount), rate: (d.rate * 100).toFixed(1), days: d.termDays })}</span>
                  {d.note && <span className="text-caption text-fg-faint">{t('bank.offer.note', { note: d.note })}</span>}
                  <span className="flex gap-2">
                    <Button size="sm" variant="brass" onClick={() => run({ type: 'deal.respond', dealId: d.id, accept: true }, t('bank.offer.accepted'))} testId={`bank-accept-${d.id}`}>{t('bank.offer.accept')}</Button>
                    <Button size="sm" onClick={() => run({ type: 'deal.respond', dealId: d.id, accept: false }, t('bank.offer.declined'))} testId={`bank-decline-${d.id}`}>{t('bank.offer.decline')}</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4" data-testid="bank-lent">
          <CardHeader title={t('bank.lent.title')} sub={t('bank.lent.sub')} />
          {lent.length === 0 && offersOut.length === 0 ? <p className="px-1 pb-2 text-small text-fg-faint">{t('bank.lent.none')}</p> : (
            <ul className="mt-2 flex flex-col">
              {lent.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-2 py-3 text-small">
                  <span className="text-fg-muted">{t('bank.lent.line', { to: name(d.toId), rate: (d.rate * 100).toFixed(1) })}</span>
                  <span className="num text-fg">{money(d.outstanding ?? d.amount)}</span>
                  <span className="text-caption text-fg-faint">{t('bank.matures', { when: ticksLabel((d.startTick ?? tick) + d.termDays * TPD - tick) })}</span>
                </li>
              ))}
              {offersOut.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-2 py-3 text-small" data-testid={`bank-offer-out-${d.id}`}>
                  <span className="text-fg-muted">{t('bank.offerOut.line', { to: name(d.toId), amount: money(d.amount) })}</span>
                  <Button size="sm" onClick={() => run({ type: 'deal.cancel', dealId: d.id }, t('bank.offerOut.cancelled'))} testId={`bank-cancel-${d.id}`}>{t('common.cancel')}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <OfferLoan />
      </div>
    </div>
  );
}

/** Runs one bank command through the game store: a success line on the toast, the refusal text otherwise. */
function run(cmd: Command, success: string) {
  return useGame.getState().act(cmd, { success });
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ink-2 py-1.5 first:border-t-0">
      <dt className="text-fg-muted">{k}</dt>
      <dd className="num text-right text-fg">{v}</dd>
    </div>
  );
}

function OwedRow({ d, from, tick, cash }: { d: Deal; from: string; tick: number; cash: number }) {
  const [amount, setAmount] = useState('');
  const owed = d.outstanding ?? d.amount;
  const maturity = (d.startTick ?? tick) + d.termDays * TPD;
  const pay = (value: number) => run({ type: 'deal.repay', dealId: d.id, amount: value }, t('bank.repay.done'));
  return (
    <li className="flex flex-col gap-2 border-t border-ink-2 py-3 text-small" data-testid={`bank-loan-${d.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-fg-muted">{t('bank.owed.line', { from, rate: (d.rate * 100).toFixed(1) })}</span>
        <span className="num text-fg">{money(owed)}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-fg-faint">
        <span>{t('bank.matures', { when: ticksLabel(maturity - tick) })}</span>
        <span>{t('bank.paidSoFar', { amount: money(d.paid) })}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NumberField label={t('bank.repay.amount')} value={amount} onChange={setAmount} suffix="$" className="h-9 w-52" testId={`bank-repay-amount-${d.id}`} />
        <Button size="sm" disabled={!(Number(amount) > 0) || cash <= 0} onClick={() => pay(Number(amount))} testId={`bank-repay-${d.id}`}>{t('bank.repay.button')}</Button>
        <Button size="sm" variant="brass" disabled={cash <= 0} onClick={() => pay(owed)} testId={`bank-repay-all-${d.id}`}>{t('bank.repay.all')}</Button>
      </div>
    </li>
  );
}

/**
 * Offer a loan to another player (deal.offer, kind loan). The lender (the sender) must be Hustler or above:
 * offerDeal checks the sender for a loan, and the recipient only for a transfer (social.ts, DEALS_RANK).
 * Below that rank the form is replaced by the rank it needs, so no Send button is ever a dead control.
 */
function OfferLoan() {
  const me = useGame((s) => s.me)!;
  const directory = useGame((s) => s.directory);
  const cash = me.account?.cash ?? 0;
  const others = directory.filter((d) => d.id !== me.player.id);
  // The directory can arrive after mount, so the recipient is derived: the pick while it is still listed, else the first.
  const [pickTo, setPickTo] = useState<string | null>(null);
  const to = pickTo && others.some((o) => o.id === pickTo) ? pickTo : (others[0]?.id ?? '');
  const [amount, setAmount] = useState('5000');
  const [rate, setRate] = useState('5');
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const canLend = rankIndex(me.player.rankId) >= rankIndex(DEALS_RANK);
  const valid = canLend && !!to && Number(amount) >= 100 && Number(amount) <= cash && Number(rate) >= 0 && Number(rate) <= 100 && Number(days) >= 1 && Number(days) <= 252;
  if (!canLend) {
    return (
      <Card className="p-4" data-testid="bank-offer-form">
        <CardHeader title={t('bank.offer.form.title')} sub={t('bank.offer.form.sub')} />
        <p className="mt-2 text-small text-fg-muted" data-testid="bank-offer-locked">{t('bank.offer.locked', { rank: t(`rank.${DEALS_RANK}`) })}</p>
      </Card>
    );
  }
  return (
    <Card className="p-4" data-testid="bank-offer-form">
      <CardHeader title={t('bank.offer.form.title')} sub={t('bank.offer.form.sub')} />
      {others.length === 0 ? <p className="px-1 pb-2 text-small text-fg-faint">{t('bank.offer.form.nobody')}</p> : (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-small text-fg-muted">
            {t('bank.offer.form.to')}
            <select value={to} onChange={(e) => setPickTo(e.target.value)} className="h-10 rounded-md border border-ink-3 bg-ink-0 px-2 text-small text-fg" data-testid="bank-offer-to">
              {others.map((o) => <option key={o.id} value={o.id}>{o.handle}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label={t('bank.offer.form.amount')} value={amount} onChange={setAmount} suffix="$" testId="bank-offer-amount" />
            <NumberField label={t('bank.offer.form.rate')} value={rate} onChange={setRate} suffix="%" testId="bank-offer-rate" />
            <NumberField label={t('bank.offer.form.days')} value={days} onChange={setDays} testId="bank-offer-days" />
          </div>
          <TextField value={note} onChange={setNote} label={t('bank.offer.form.note')} placeholder={t('bank.offer.form.note')} maxLength={120} className="w-full" testId="bank-offer-note" />
          <p className="text-caption text-fg-faint">{t('bank.offer.form.cash', { cash: money(cash) })}</p>
          <Button variant="brass" disabled={!valid} testId="bank-offer-send" onClick={() => run({ type: 'deal.offer', kind: 'loan', toId: to, amount: Number(amount), rate: Number(rate) / 100, termDays: Number(days), note }, t('bank.offer.sent'))}>
            {t('bank.offer.form.send')}
          </Button>
        </div>
      )}
    </Card>
  );
}
