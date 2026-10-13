'use client';

// The trading cards: the window (its state and the closing notice), the sell-only trading plans (commit by hold, the private rows
// with their quantities and minimum price, and the public rows with neither) and the buybacks (filed on F + 1, capped at 1% of
// float a day). Rules are the world's (Quant 5.2, 6.1); the forms only send the terms.
import { useState } from 'react';
import { t } from '@/i18n';
import { money, sharePrice, qty } from '@/game/format';
import { NumberField, SpendReview } from '@/components/ui';
import { buybackFit, buybackRoomOver, type CapitalView } from '@/world/company/capital';
import { HoldButton, Line, Note, Panel, PublChip, RefusalBox, numOf, useAct, type Refusal } from './shared';

/** A plan's end reason as copy; a reason with no copy reads as the generic end, never as a raw key. */
function endReason(reason: string): string {
  const k = `company.capital.end.${reason}`;
  const s = t(k);
  return s === k ? t('company.capital.end.unknown') : s;
}

export function WindowPanel({ cap }: { cap: CapitalView }) {
  const w = cap.window;
  const covered = w.covered.length > 0 ? t('company.capital.window.coveredList', { name: cap.name }) : t('company.capital.window.coveredNone');
  return (
    <Panel
      testId="company-trading-window"
      title={t('company.capital.window.title')}
      sub={t('company.capital.window.sub')}
      chip="public"
    >
      {!w.hasWindow && <Note testId="company-window-none">{t('company.capital.window.none')}</Note>}
      {w.hasWindow && w.open && (
        <p className="text-small text-fg" data-testid="company-window-state">
          {t('company.capital.window.open', { day: w.closesDay ?? 0 })}
        </p>
      )}
      {w.hasWindow && !w.open && (
        <p className="text-small text-fg" data-testid="company-window-state">
          {t('company.capital.window.closed', { day: w.opensDay ?? w.nextOpenDay })}
        </p>
      )}
      {w.hasWindow && !w.open && <Note>{t('company.capital.window.plansRun')}</Note>}
      {w.closingSoon && (
        <div className="flex flex-col gap-1 rounded-md border border-brass/50 px-3 py-2 text-small" data-testid="company-window-notice" role="status">
          <p className="text-fg">{t('company.capital.window.closingIn', { days: w.closesInDays ?? 0 })}</p>
          <p className="text-fg-muted">{covered}</p>
          <p className="text-fg-muted" data-testid="company-window-open-orders">{t('company.capital.window.openOrders', { day: w.closesDay ?? 0 })}</p>
          <p className="text-fg-muted">{t('company.capital.window.nextWindow', { day: w.nextOpenDay })}</p>
        </div>
      )}
      {w.hasWindow && <Note>{t('company.capital.window.backstop')}</Note>}
      {!w.hasWindow && w.listed && <Note>{covered}</Note>}
    </Panel>
  );
}

export function PlansPanel({ cap }: { cap: CapitalView }) {
  const p = cap.plans;
  const act = useAct();
  const [qtyPerDay, setQty] = useState('');
  const [first, setFirst] = useState('');
  const [count, setCount] = useState('5');
  const [minPrice, setMinPrice] = useState('');
  const firstDay = first.trim() === '' ? (p.lockUntil !== null && p.lockUntil > p.earliestDay ? p.lockUntil : p.earliestDay) : numOf(first);
  const n = numOf(count);
  const q = numOf(qtyPerDay);
  const mp = numOf(minPrice);
  const days = Number.isInteger(n) && n > 0 && n <= 120 && Number.isFinite(firstDay)
    ? Array.from({ length: n }, (_, i) => firstDay + i)
    : [];
  const valid = p.listed && p.commitRefusal === null && Number.isInteger(q) && q > 0 && days.length > 0 && Number.isFinite(mp) && mp > 0;
  const commit = () => act.run(
    { type: 'company.plan', companyId: cap.companyId, qtyPerDay: q, days, minSellPrice: mp },
    t('company.capital.plan.committed'),
  );
  return (
    <Panel
      testId="company-plan-list"
      title={t('company.capital.plan.title')}
      sub={t('company.capital.plan.sub', { live: p.live, limit: p.limit })}
      chip="private"
    >
      <p className="text-small text-fg" data-testid="company-plan-reserve">
        {t('company.capital.plan.reserve', { locked: qty(p.locked), sellable: qty(p.sellable) })}
      </p>
      {p.lockUntil !== null && p.lockUntil > cap.day && (
        <Note testId="company-plan-lockup">{t('company.capital.plan.lockup', { day: p.lockUntil })}</Note>
      )}
      {!p.listed && <Note testId="company-plan-unlisted">{t('company.capital.plan.unlisted')}</Note>}
      {p.listed && p.commitRefusal && <RefusalBox refusal={p.commitRefusal as Refusal} testId="company-plan-commit-refusal" />}
      {p.listed && !p.commitRefusal && (
        <div className="flex flex-col gap-3" data-testid="company-plan-form">
          <p className="text-caption text-fg-faint">{t('company.capital.plan.formSell')}</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField value={qtyPerDay} onChange={setQty} label={t('company.capital.plan.qty')} min={1} step={1} testId="company-plan-qty" />
            <NumberField value={count} onChange={setCount} label={t('company.capital.plan.count')} min={1} step={1} testId="company-plan-count" />
            <NumberField value={first} onChange={setFirst} label={t('company.capital.plan.first', { day: firstDay })} min={p.earliestDay} step={1} testId="company-plan-first" />
            <NumberField value={minPrice} onChange={setMinPrice} label={t('company.capital.plan.minPrice')} min={0} step="any" testId="company-plan-minprice" />
          </div>
          <Note>{t('company.capital.plan.earliest', { day: p.earliestDay })}</Note>
          {p.floorMax !== null && <Note>{t('company.capital.plan.floorMax', { max: sharePrice(p.floorMax) })}</Note>}
          {p.lockUntil !== null && p.lockUntil > firstDay && <Note>{t('company.capital.plan.lockEnds', { day: p.lockUntil })}</Note>}
          <p className="text-small text-fg" data-testid="company-plan-cant">{t('company.capital.plan.cantChange')}</p>
          <Note>{t('company.capital.plan.filedNextDay')}</Note>
          <HoldButton
            testId="company-plan-commit"
            label={t('company.capital.plan.commit')}
            hint={t('company.capital.plan.commitHint')}
            disabled={!valid || act.busy}
            onHold={() => { void commit(); }}
          />
        </div>
      )}
      {act.refusal && <RefusalBox refusal={act.refusal} testId="company-plan-error" />}
      <div className="flex flex-col gap-3" data-testid="company-plan-rows">
        {p.rows.length === 0 && <Note>{t('company.capital.plan.none')}</Note>}
        {p.rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-1 border-t border-ink-2 pt-3 text-small" data-testid="company-plan-row">
            <Line k={t('company.capital.plan.rowDays', { from: r.fromDay, to: r.toDay })} v={t('company.capital.plan.rowQty', { qty: qty(r.qtyPerDay) })} />
            <Line k={t('company.capital.plan.rowMin')} v={sharePrice(r.minSellPrice)} testId="company-plan-min" />
            <Line k={t('company.capital.plan.rowCommitted')} v={t('company.capital.day', { day: r.committedDay })} />
            {r.escrow > 0 && <Line k={t('company.capital.plan.rowLocked')} v={qty(r.escrow)} testId="company-plan-locked" />}
            {r.priceHold > 0 && r.holdUntil !== null && (
              <Note testId="company-plan-locked-until">{t('company.capital.plan.lockedUntil', { qty: qty(r.priceHold), day: r.holdUntil })}</Note>
            )}
            {r.ended && <Note>{t('company.capital.plan.ended', { day: r.ended.day, reason: endReason(r.ended.reason) })}</Note>}
          </div>
        ))}
      </div>
      {/* the market's rows come from the public view only: days and end reason, never a minimum price or a size */}
      <div className="flex flex-col gap-2 border-t border-ink-2 pt-3" data-testid="company-plan-public-section">
        <p className="flex items-center gap-2 text-caption text-fg-muted"><PublChip />{t('company.capital.plan.publicHead')}</p>
        <ul className="flex flex-col gap-1 text-caption text-fg-muted" data-testid="company-plan-public-rows">
          {p.publicRows.map((r, i) => (
            <li key={`${r.fromDay}-${r.toDay}-${i}`} data-testid="company-plan-public">
              {t('company.capital.plan.publicRow', { from: r.fromDay, to: r.toDay })}
              {r.ended && <span className="ml-2">{t('company.capital.plan.ended', { day: r.ended.day, reason: endReason(r.ended.reason) })}</span>}
            </li>
          ))}
        </ul>
      </div>
      {p.skips.length > 0 && (
        <ul className="flex flex-col gap-1 text-caption text-fg-muted" data-testid="company-plan-skips">
          {p.skips.map((s, i) => (
            <li key={`${s.day}-${i}`} data-testid="company-plan-skip">{t('company.capital.plan.skip', { day: s.day, reason: t(`company.capital.skip.${s.reason}`) })}</li>
          ))}
        </ul>
      )}
      <Note>{t('company.capital.plan.footer')}</Note>
    </Panel>
  );
}

export function BuybackPanel({ cap }: { cap: CapitalView }) {
  const b = cap.buybacks;
  const act = useAct();
  const [size, setSize] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const fromDay = numOf(from);
  const toDay = numOf(to);
  const sz = numOf(size);
  // the fit against the daily cap, read from the world's rule (capital.ts buybackFit); the engine still decides at filing
  const fit = buybackFit(b, sz, fromDay, toDay);
  const ready = b.filesToday && fit !== null && fit.fits;
  return (
    <Panel
      testId="company-buybacks"
      title={t('company.capital.buyback.title')}
      sub={t('company.capital.buyback.sub', { cap: qty(b.perDayCap) })}
      chip="public"
    >
      <Line k={t('company.capital.buyback.filingDay')} v={b.filingDay === null ? '—' : t('company.capital.day', { day: b.filingDay })} testId="company-buyback-filing" />
      <Line k={t('company.capital.buyback.cash')} v={money(b.cash)} />
      {b.reservePerShare !== null && <Line k={t('company.capital.buyback.reserve')} v={sharePrice(b.reservePerShare)} />}
      {b.programs.map((p) => (
        <p key={p.id} className="text-small text-fg-muted" data-testid="company-buyback-program">
          {t('company.capital.buyback.program', { size: qty(p.size), from: p.fromDay, to: p.toDay })}
        </p>
      ))}
      {b.listed && !b.filesToday && b.refusal && <RefusalBox refusal={b.refusal as Refusal} testId="company-buyback-refusal" />}
      {b.listed && (
        <div className="grid grid-cols-3 gap-3">
          <NumberField value={size} onChange={setSize} label={t('company.capital.buyback.size')} min={1} step={1} testId="company-buyback-size" />
          <NumberField value={from} onChange={setFrom} label={t('company.capital.buyback.from')} min={0} step={1} testId="company-buyback-from" />
          <NumberField value={to} onChange={setTo} label={t('company.capital.buyback.to')} min={0} step={1} testId="company-buyback-to" />
        </div>
      )}
      {b.listed && (
        <Line
          k={t('company.capital.buyback.room')}
          v={fit === null ? qty(buybackRoomOver(b, fromDay, toDay)) : t('company.capital.buyback.roomFit', { room: qty(fit.room), perDay: qty(fit.perDay) })}
          testId="company-buyback-room"
        />
      )}
      {b.listed && fit !== null && !fit.fits && (
        <RefusalBox refusal={{ code: 'buybackTooLarge', maxPerDay: fit.room }} testId="company-buyback-over" />
      )}
      {b.listed && (
        <SpendReview
          variant="brass"
          testId="company-buyback-file"
          label={t('company.capital.buyback.file')}
          title={t('company.capital.buyback.file')}
          rows={[{ label: t('company.capital.buyback.size'), value: qty(Number.isFinite(sz) ? sz : 0) }, { label: t('company.capital.buyback.from'), value: String(fromDay) }, { label: t('company.capital.buyback.to'), value: String(toDay) }]}
          disabled={!ready || act.busy}
          onConfirm={() => act.run({ type: 'company.buyback', companyId: cap.companyId, size: sz, fromDay, toDay }, t('company.capital.buyback.filed'))}
        />
      )}
      {act.refusal && <RefusalBox refusal={act.refusal} testId="company-buyback-error" />}
      <Note>{t('company.capital.buyback.rule')}</Note>
    </Panel>
  );
}
