import { earningsCalendar } from '@/engine';
import { CALENDAR_DAYS } from '@/content/learning';
import { TPD, playerBusinesses, today } from './core';
import type { Msg } from '@/i18n';
import type { GameState } from './types';

/**
 * The always-busy calendar (Phase 3, section 4): the dated items in the next game days, drawn only from schedules the
 * world really keeps: the daily close, the contract roll, earnings, the central bank and the macro release, index reviews
 * announced on the Wire, the player's analyst and desk dues, and the business incidents still running. Nothing is invented,
 * and a world event appears only as the announced kind on the Wire (never its end or its duration).
 */

export interface CalendarItem {
  /** game day the item falls on */
  day: number;
  /** days from today (0 = today) */
  offset: number;
  kind: 'close' | 'contracts' | 'earnings' | 'bank' | 'release' | 'index' | 'analyst' | 'desk' | 'business';
  assetId?: string;
  msg: Msg;
}

export function calendarFor(g: GameState, pid: string, days = CALENDAR_DAYS): CalendarItem[] {
  const p = g.players[pid];
  if (!p) return [];
  const d0 = today(g);
  const inHorizon = (day: number) => day >= d0 && day < d0 + days;
  const items: CalendarItem[] = [];
  const add = (day: number, kind: CalendarItem['kind'], msg: Msg, assetId?: string) => {
    if (!inHorizon(day)) return;
    items.push({ day, offset: day - d0, kind, msg, ...(assetId ? { assetId } : {}) });
  };

  // the close of each day in the horizon (the day ends at its last tick)
  for (let k = 0; k < days; k++) {
    const off = k;
    add(d0 + off, 'close', { key: `work.cal.close.${off === 0 ? 'today' : off === 1 ? 'tomorrow' : 'later'}`, vars: { n: off } });
  }
  // the contract roll is the same dated event for every player; today's contracts end at today's close
  if (p.contracts.length) add(d0, 'contracts', { key: 'work.cal.contracts.end', vars: { n: p.contracts.length } });
  add(d0 + 1, 'contracts', { key: 'work.cal.contracts.new' });
  for (const e of earningsCalendar(g.market, Math.max(0, days - 1))) {
    add(d0 + e.daysAway, 'earnings', { key: 'work.cal.earnings', vars: { asset: e.assetId } }, e.assetId);
  }
  const r = g.market.rates;
  if (r) {
    add(r.nextMeeting, 'bank', { key: 'work.cal.bank' });
    add(r.nextRelease, 'release', { key: r.releaseKind === 'cpi' ? 'work.cal.release.cpi' : 'work.cal.release.jobs' });
  }
  for (const w of g.wire) {
    if (w.ev?.type !== 'index' || w.ev.phase !== 'announced' || w.ev.day === undefined) continue;
    const idx = g.market.config.indices.find((x) => x.id === w.ev!.indexId);
    add(w.ev.day, 'index', { key: 'work.cal.index', vars: { index: idx?.name ?? w.ev.indexId ?? '' } });
  }
  if (p.analyst) add(p.analyst.paidThroughDay, 'analyst', { key: 'work.cal.analyst.due' });
  if (p.desk && !p.desk.lapsed) add(p.desk.paidThroughDay, 'desk', { key: 'work.cal.desk.due' });
  for (const b of playerBusinesses(g, pid)) {
    if (b.event && b.event.untilTick > g.market.tick) {
      add(Math.floor((b.event.untilTick - 1) / TPD), 'business', { key: 'work.cal.business.ends', vars: { name: b.name } });
    }
  }
  return items.sort((a, b) => a.day - b.day || a.kind.localeCompare(b.kind) || (a.assetId ?? '').localeCompare(b.assetId ?? ''));
}
