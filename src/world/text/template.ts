import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { sectorName } from '@/engine';
import type { Locale, Msg, MsgVar } from '@/i18n';
import { closeMove } from '../close-move';
import type { TextProvider } from './index';
import { analystMsg, executivesMsg, moderatorMsg, narratorMsg, newsroomMsg, rivalMsg, rumorMsg, vkey } from './roles';

/** A sector as a message variable: "@sector.<id>" (the viewer's language names it) when the dictionaries carry it. */
const sectorRef = (id: string): string => (`sector.${id}` in en ? `@sector.${id}` : sectorName(id));

/**
 * The template provider: the daily close, written from fixed sentences in en.json and fr.json (keys `dayclose.*`). The
 * sentences are facts in the past tense. Numbers are formatted here, once, so every viewer sees the same figures.
 */

type Dict = Record<string, string>;
const DICTS: Record<Locale, Dict> = { en: en as Dict, fr: fr as Dict };

/** Fill `{name}` slots from a descriptor. A missing key falls back to English, then to the key itself. A var "@key" names another key. */
export function renderMsg(m: Msg, locale: Locale): string {
  // a count picks the plural form first (key_one / key_other), as the client's t() does
  const count = m.vars?.count;
  const plural = typeof count === 'number' ? `${m.key}_${count === 1 ? 'one' : 'other'}` : null;
  const s = (plural && (DICTS[locale][plural] ?? DICTS.en[plural])) || DICTS[locale][m.key] || DICTS.en[m.key] || m.key;
  const ref = (v: MsgVar): string => {
    // a list of descriptors (the lab's signal picks) joins with the same separator the client uses
    if (Array.isArray(v)) return (v as readonly Msg[]).map((x) => renderMsg(x, locale)).join(' · ');
    if (typeof v === 'object') return renderMsg(v as Msg, locale);
    return typeof v === 'string' && v.startsWith('@') ? renderMsg({ key: v.slice(1) }, locale) : String(v);
  };
  return s.replace(/\{(\w+)\}/g, (whole, k: string) => (m.vars && m.vars[k] !== undefined ? ref(m.vars[k]!) : whole));
}

/**
 * One formatter for every dollar figure. `toLocaleString` builds a formatter on each call (about 28 us here), and a
 * player's view formats about fifty figures per tick (ten daily closes, five figures each); the cached one is about 20
 * times faster and prints the same text.
 */
const USD_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A dollar amount, two decimals, thousands separated (en-US form, shared by both languages). */
export function usd(x: number): string {
  return `${x < 0 ? '-' : ''}$${USD_FORMAT.format(Math.abs(x))}`;
}

/** A signed percentage with two decimals, from a fraction (0.0123 is +1.23%). */
export function signedPct(x: number): string {
  return `${x > 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
}

/** A dollar amount with an explicit sign (+$12.00, -$3.51). */
export function signedUsd(x: number): string {
  return `${x > 0 ? '+' : ''}${usd(x)}`;
}

/** An unsigned percentage, from a fraction. */
export function absPct(x: number): string {
  return `${Math.abs(x * 100).toFixed(2)}%`;
}

export const templateTextProvider: TextProvider = {
  dailyClose(c) {
    // the masthead is a label; every other line is a narrator variant (roles.ts narratorMsg), keyed by the close's day
    const out: Msg[] = [{ key: 'dayclose.title' }];
    // the headline is trading alone; valuation and income are their own lines, so a marked-up business never reads as a gain made today
    const trade = closeMove(c.trading);
    const day = `${c.day}`;
    out.push(narratorMsg({ id: `${day}:head`, kind: 'head', move: trade, amount: usd(Math.abs(c.trading)) }));
    out.push({ key: 'dayclose.valuation', vars: { change: signedUsd(c.valuation) } });
    out.push({ key: 'dayclose.income', vars: { change: signedUsd(c.income) } });
    const move = closeMove(c.nwChange);
    if (move === 'flat') {
      out.push({ key: vkey('txt.narr.nw.flat', `${c.day}:nw`), vars: { now: usd(c.nwClose) } });
    } else {
      out.push({
        key: vkey(`txt.narr.nw.${move}`, `${c.day}:nw`),
        vars: { change: usd(Math.abs(c.nwChange)), pct: absPct(c.nwChangePct), now: usd(c.nwClose) },
      });
    }
    if (c.best && c.worst) {
      out.push(narratorMsg({ id: `${day}:best`, kind: 'best', asset: c.best.assetId, pct: signedPct(c.best.pct), usd: usd(c.best.usd) }));
      if (c.worst.assetId !== c.best.assetId) {
        out.push(narratorMsg({ id: `${day}:worst`, kind: 'worst', asset: c.worst.assetId, pct: signedPct(c.worst.pct), usd: usd(c.worst.usd) }));
      }
    } else {
      out.push(narratorMsg({ id: `${day}:none`, kind: 'noPositions' }));
    }
    out.push(narratorMsg({ id: `${day}:gx`, kind: 'gx', pct: signedPct(c.gx.pct) }));
    if (c.sectors) {
      out.push(narratorMsg({ id: `${day}:sector:best`, kind: 'sector', which: 'best', sector: sectorRef(c.sectors.best.sector), pct: signedPct(c.sectors.best.pct) }));
      out.push(narratorMsg({ id: `${day}:sector:worst`, kind: 'sector', which: 'worst', sector: sectorRef(c.sectors.worst.sector), pct: signedPct(c.sectors.worst.pct) }));
    }
    for (const s of c.stories) {
      out.push({ key: vkey(`txt.narr.story.${s.band}`, `${c.day}:${s.assetId}`), vars: { headline: s.headlineMsg ?? s.headline, asset: s.assetId } });
    }
    if (c.event) {
      const headline = c.event.headlineMsg ?? c.event.headline;
      if (c.event.phase === 'active') out.push({ key: vkey('txt.narr.event.active', `${c.day}:event`), vars: { headline } });
      else out.push({ key: vkey('txt.narr.event.ended', `${c.day}:event`), vars: { headline, days: c.event.lastedDays ?? 0 } });
    }
    out.push(narratorMsg({
      id: `${day}:ghosts`, kind: 'ghosts', basket: usd(c.ghosts.basket), random: usd(c.ghosts.random), momentum: usd(c.ghosts.momentum), player: usd(c.ghosts.player),
    }));
    if (c.ghosts.percentile === null) out.push(narratorMsg({ id: `${day}:rank`, kind: 'noTrades' }));
    else out.push(narratorMsg({ id: `${day}:rank`, kind: 'rank', beaten: c.ghosts.beaten }));
    return out;
  },
  deskMemo(f) {
    const dir = f.move > MOVE_FLAT ? 'up' : f.move < -MOVE_FLAT ? 'down' : 'flat';
    const id = `${f.assetId}:${f.from}:${f.to}`;
    const out: Msg[] = [analystMsg({ id, kind: 'move', dir, asset: f.assetId, pct: f.move, from: f.from, to: f.to })];
    if (dir !== 'flat' && f.dominant) out.push(analystMsg({ id, kind: 'did', part: f.dominant }));
    if (f.pool) out.push(analystMsg({ id, kind: 'flow', buying: f.pool.buying, pool: f.pool.id }));
    return out.slice(0, 3);
  },
  newsroom: newsroomMsg,
  executives: executivesMsg,
  rumor: rumorMsg,
  narrator: narratorMsg,
  rival: rivalMsg,
  moderator: moderatorMsg,
  tripLine(f) {
    if (Math.abs(f.realized) < 1) return { key: 'journal.line.even' };
    const parts = Object.entries(f.rows).filter((e): e is [string, number] => (e[1] ?? 0) !== 0);
    if (parts.length === 0) return { key: 'journal.line.flat' };
    const [top, topValue] = parts.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
    if (top === 'fees') return { key: 'journal.line.fees' };
    const part = { part: `@journal.part.${top}` };
    if (Math.sign(topValue) !== Math.sign(f.realized)) return { key: 'journal.line.against', vars: part };
    return { key: f.realized > 0 ? 'journal.line.gain' : 'journal.line.loss', vars: part };
  },
  render: (m, locale) => renderMsg(m, locale),
};

/** A move under this fraction reads as flat in a desk memo (0.05%). */
const MOVE_FLAT = 0.0005;
