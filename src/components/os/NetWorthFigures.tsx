'use client';

// The money figures of the top bar: Cash and Net worth, each labelled, with today's change beside net worth (neutral at
// zero). Net worth is a button that opens a click-through breakdown from the player view (netWorthBreakdown in
// src/world/core.ts): markets, businesses, property, companies, funds, tokens, the lab and lifestyle, minus debts, so the
// rows add up to the total. The phone's status bar uses the same figures (phone). Escape or a press outside closes it.
import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { accountOpenPnl } from '@/game/accountPnl';
import { compactMoney, money, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { assetDefOf } from '@/game/store';
import type { NetWorthBreakdown } from '@/world/core';

export type NetWorthRow = 'cash' | 'markets' | 'businesses' | 'property' | 'companies' | 'funds' | 'tokens' | 'lab' | 'lifestyle' | 'debts';

/** The breakdown rows in display order. Debts are the mortgages, shown as a negative. The rows sum to `total`. */
export function netWorthRows(nw: NetWorthBreakdown): { key: NetWorthRow; value: number }[] {
  return [
    { key: 'cash', value: nw.cash },
    { key: 'markets', value: nw.markets },
    { key: 'businesses', value: nw.businesses },
    { key: 'property', value: nw.property },
    { key: 'companies', value: nw.companies },
    { key: 'funds', value: nw.funds },
    { key: 'tokens', value: nw.tokens },
    { key: 'lab', value: nw.lab },
    { key: 'lifestyle', value: nw.lifestyle },
    { key: 'debts', value: -nw.mortgages },
  ];
}

/**
 * The strip's narrow band (from 1500 px down): whole dollars without cents, so a figure keeps its digits, and compact money
 * from a million up. The full figure with cents shows wherever the strip has room for it.
 */
function shortMoney(n: number): string {
  return Math.abs(n) >= 1e6 ? compactMoney(n) : money(Math.round(n)).replace(/[.,]00(?!\d)/, '');
}

/** The short money with its sign: +$37 or a minus sign then $37. */
function shortSigned(n: number): string {
  return (n > 0 ? '+' : '') + shortMoney(n);
}

export function NetWorthFigures({ phone = false }: { phone?: boolean }) {
  const me = useGame((s) => s.me);
  const world = useGame((s) => s.world);
  const playerId = useGame((s) => s.playerId);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const breakdown = me?.netWorth;
  const nw = breakdown?.total ?? 0;
  const cash = breakdown?.cash ?? 0;
  const dayStart = me?.player.dayStart.netWorth ?? nw;
  const today = nw - dayStart;
  const todayPct = dayStart ? today / dayStart : 0;
  const fmt = phone ? compactMoney : money;
  // The account figures of the desktop strip (the phone keeps cash and net worth): the open P&L after the exit fee, and the
  // total change since arrival. The same figures the Portfolio and each Broker's Positions show.
  const arrival = me?.arrival ?? null;
  const openPnl = !phone && world && playerId && me ? accountOpenPnl(world, playerId, assetDefOf) : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className={`os-figs${phone ? ' os-figs-phone' : ''}`} data-testid="os-figures">
      <span className="os-fig os-soft" data-testid={phone ? 'os-phone-cash' : 'os-cash'}>
        <span className="os-fig-k">{t('common.cash')}</span> <span className="num">{fmt(cash)}</span>
      </span>
      <button
        type="button"
        className="os-nw"
        data-testid={phone ? 'os-phone-networth' : 'os-networth'}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('shell.nw.today')}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="os-fig-k">{t('common.netWorth')}</span> {phone ? <span className="num">{fmt(nw)}</span> : <><span className="num os-val-full">{money(nw)}</span><span className="num os-val-short">{shortMoney(nw)}</span></>}{' '}
        <span className={`num ${toneText[tone(today)]}`} data-testid={phone ? 'os-phone-today' : 'os-today'}>{signedPct(todayPct)}</span>
      </button>
      {openPnl !== null && (
        <span className="os-fig os-soft os-fig-pnl" data-testid="os-open-pnl" title={t('shell.pnl.openHint')}>
          <span className="os-fig-k">{t('shell.pnl.open')}</span>{' '}
          <span className={`num os-val-full ${toneText[tone(openPnl)]}`}>{signedMoney(openPnl)}</span>
          <span className={`num os-val-short ${toneText[tone(openPnl)]}`}>{shortSigned(openPnl)}</span>
        </span>
      )}
      {arrival !== null && !phone && (
        <span className="os-fig os-soft os-fig-arrival" data-testid="os-arrival-pnl" title={t('shell.pnl.arrivalHint', { pct: signedPct(arrival.changePct) })}>
          <span className="os-fig-k">{t('shell.pnl.arrival')}</span>{' '}
          <span className={`num ${toneText[tone(arrival.change)]}`}>{signedMoney(arrival.change)}</span>
        </span>
      )}
      {open && breakdown && (
        <section className="os-nw-pop" role="dialog" aria-label={t('shell.nw.breakdown')} data-testid="nw-breakdown">
          <h2 className="label">{t('shell.nw.breakdown')}</h2>
          <ul className="os-nw-rows">
            {netWorthRows(breakdown).map((r) => (
              <li key={r.key} className="os-nw-row" data-testid={`nw-row-${r.key}`}>
                <span className="text-small text-fg-muted">{t(`shell.nw.row.${r.key}`)}</span>
                <span className="num text-small text-fg">{money(r.value)}</span>
              </li>
            ))}
          </ul>
          <p className="os-nw-total" data-testid="nw-total">
            <span className="text-small font-medium text-fg">{t('shell.nw.total')}</span>
            <span className="num text-small font-medium text-fg">{money(nw)}</span>
          </p>
          <p className="mt-2 text-caption text-fg-faint">{t('shell.nw.breakdown.note')}</p>
        </section>
      )}
    </div>
  );
}
