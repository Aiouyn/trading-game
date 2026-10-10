import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { sectorName } from '@/engine';
import type { Locale, Msg } from '@/i18n';
import { closeMove } from '../close-move';
import type { TextProvider } from './index';

/**
 * The template provider: the daily close, written from fixed sentences in en.json and fr.json (keys `dayclose.*`). The
 * sentences are facts in the past tense. Numbers are formatted here, once, so every viewer sees the same figures.
 */

type Dict = Record<string, string>;
const DICTS: Record<Locale, Dict> = { en: en as Dict, fr: fr as Dict };

/** Fill `{name}` slots from a descriptor. A missing key falls back to English, then to the key itself. A var "@key" names another key. */
export function renderMsg(m: Msg, locale: Locale): string {
  const s = DICTS[locale][m.key] ?? DICTS.en[m.key] ?? m.key;
  const ref = (v: string | number): string => (typeof v === 'string' && v.startsWith('@') ? renderMsg({ key: v.slice(1) }, locale) : String(v));
  return s.replace(/\{(\w+)\}/g, (whole, k: string) => (m.vars && m.vars[k] !== undefined ? ref(m.vars[k]!) : whole));
}

/** A dollar amount, two decimals, thousands separated (en-US form, shared by both languages). */
export function usd(x: number): string {
  const body = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${x < 0 ? '-' : ''}$${body}`;
}

/** A signed percentage with two decimals, from a fraction (0.0123 is +1.23%). */
export function signedPct(x: number): string {
  return `${x > 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
}

/** An unsigned percentage, from a fraction. */
export function absPct(x: number): string {
  return `${Math.abs(x * 100).toFixed(2)}%`;
}

export const templateTextProvider: TextProvider = {
  dailyClose(c) {
    const out: Msg[] = [{ key: 'dayclose.title' }];
    const change = c.nwChange;
    const move = closeMove(change);
    if (move === 'flat') {
      out.push({ key: 'dayclose.nw.flat', vars: { now: usd(c.nwClose) } });
    } else {
      out.push({
        key: `dayclose.nw.${move}`,
        vars: { change: usd(Math.abs(change)), pct: absPct(c.nwChangePct), now: usd(c.nwClose) },
      });
    }
    if (c.best && c.worst) {
      out.push({ key: 'dayclose.best', vars: { asset: c.best.assetId, pct: signedPct(c.best.pct), usd: usd(c.best.usd) } });
      if (c.worst.assetId !== c.best.assetId) {
        out.push({ key: 'dayclose.worst', vars: { asset: c.worst.assetId, pct: signedPct(c.worst.pct), usd: usd(c.worst.usd) } });
      }
    } else {
      out.push({ key: 'dayclose.noPositions' });
    }
    out.push({ key: 'dayclose.gx', vars: { pct: signedPct(c.gx.pct) } });
    if (c.sectors) {
      out.push({ key: 'dayclose.sectorBest', vars: { sector: sectorName(c.sectors.best.sector), pct: signedPct(c.sectors.best.pct) } });
      out.push({ key: 'dayclose.sectorWorst', vars: { sector: sectorName(c.sectors.worst.sector), pct: signedPct(c.sectors.worst.pct) } });
    }
    for (const s of c.stories) {
      out.push({ key: `dayclose.story.${s.band}`, vars: { headline: s.headline, asset: s.assetId } });
    }
    if (c.event) {
      if (c.event.phase === 'active') out.push({ key: 'dayclose.event.active', vars: { headline: c.event.headline } });
      else out.push({ key: 'dayclose.event.ended', vars: { headline: c.event.headline, days: c.event.lastedDays ?? 0 } });
    }
    out.push({
      key: 'dayclose.ghosts',
      vars: { basket: usd(c.ghosts.basket), random: usd(c.ghosts.random), momentum: usd(c.ghosts.momentum), player: usd(c.ghosts.player) },
    });
    if (c.ghosts.percentile === null) out.push({ key: 'dayclose.noTrades' });
    else out.push({ key: 'dayclose.rank', vars: { beaten: c.ghosts.beaten } });
    return out;
  },
  deskMemo(f) {
    const dir = f.move > MOVE_FLAT ? 'up' : f.move < -MOVE_FLAT ? 'down' : 'flat';
    const out: Msg[] = [{ key: `desk.memo.${dir}`, vars: { asset: f.assetId, pct: absPct(f.move), from: f.from, to: f.to } }];
    if (dir !== 'flat' && f.dominant) out.push({ key: 'desk.memo.did', vars: { part: `@journal.part.${f.dominant}` } });
    if (f.pool) out.push({ key: `desk.memo.flow.${f.pool.buying ? 'buy' : 'sell'}`, vars: { pool: `@desk.pool.${f.pool.id}` } });
    return out.slice(0, 3);
  },
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
