// Found a firm with own cash, list it when it earns, and bid when the bid can be paid.
// Half of seeds lever the firm and the book; a call that cuts the estate ends the raid.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { live, spendable, stocks, unit } from './lib.ts';

export const name = 'raider';

const SECTORS = ['RETAIL', 'MANUFACTURING', 'CONSTRUCTION', 'AGRICULTURE', 'TRANSPORT'];
const opened = new WeakMap<World, number>();
const peak = new WeakMap<World, number>();
const stopped = new WeakMap<World, boolean>();
const bidOnce = new WeakMap<World, boolean>();
const lastFound = new WeakMap<World, number>();

function bold(w: World): boolean {
  return unit(w.seed, 0, 85) >= 0.65;
}

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  if (stopped.get(w)) return [];
  const start = opened.get(w) ?? v.netWorth;
  if (!opened.has(w)) opened.set(w, v.netWorth);
  const hi = Math.max(peak.get(w) ?? v.netWorth, v.netWorth);
  peak.set(w, hi);
  // After a wipe the court keeps the shares. Do not found again on a written-off loan.
  if (hi > start * 1.05 && v.netWorth < hi * 0.35) {
    stopped.set(w, true);
    return [];
  }
  if (v.netWorth < start * 0.45 && v.date.abs > 200) {
    stopped.set(w, true);
    return [];
  }
  const cmds: Command[] = [];
  const ran = v.companies.filter((c) => c.role === 'chief executive');
  const lever = bold(w);
  if (!ran.length) {
    const prev = lastFound.get(w) ?? -999;
    const cash = spendable(v);
    if (v.date.abs - prev >= 120 && cash >= 1_500_000 && v.netWorth >= start * 0.7) {
      lastFound.set(w, v.date.abs);
      const sector = SECTORS[(v.date.year + (lever ? 1 : 0)) % SECTORS.length];
      const put = Math.min(cash, Math.max(1_500_000, Math.floor(cash * (lever ? 0.45 : 0.28))));
      cmds.push({
        kind: 'found',
        name: `Booth ${sector.slice(0, 3)} ${v.date.year}.${v.date.month}`,
        sector,
        cents: put,
        loan: lever,
      });
    }
    return cmds;
  }
  for (const c of ran) {
    if (c.workers < 8 && c.cash > 400_000) cmds.push({ kind: 'ceo', firm: c.id, op: 'hires', value: Math.max(6, c.workers + 2) });
    if (c.profit > 0 && c.cash > 500_000 && v.date.day <= 7) cmds.push({ kind: 'ceo', firm: c.id, op: 'invest', value: 1 });
    if (!c.listed && c.workers >= 6 && c.profit > 0 && v.date.month % 4 === 1 && v.date.day <= 7) {
      cmds.push({ kind: 'ipo', firm: c.id, fraction: lever ? 0.35 : 0.5 });
    }
  }
  if (lever && (v.shares.length || ran.length)) cmds.push({ kind: 'cash', op: 'borrow', cents: 100_000_000 });
  const book = stocks(v);
  if (lever) {
    const priced = book.slice().sort((a, b) => b.px - a.px).find((s) => s.px >= 100);
    const purse = Math.max(0, v.cash - 300_000);
    if (priced && purse > 50_000) {
      const qty = Math.min(4_000, Math.floor(purse / priced.px));
      if (qty >= 1) cmds.push({ kind: 'order', side: 'buy', instr: priced.instr, qty });
    }
    if (v.date.month % 3 === 2 && v.date.day <= 7) {
      const target = book.slice().sort((a, b) => a.px - b.px)[0];
      if (target) {
        const paper = ran.some((c) => c.listed);
        cmds.push({ kind: 'bid', firm: target.instr, cents: 0, multiple: 1.25, paper });
      }
    }
    return cmds;
  }
  if (v.date.month % 2 === 0 && v.date.day <= 7) {
    const mid = book.slice().sort((a, b) => a.px - b.px);
    const pick = mid[Math.floor(mid.length * 0.4)];
    const purse = Math.floor(spendable(v) * 0.12);
    if (pick && purse > pick.px) {
      const qty = Math.min(200, Math.floor(purse / pick.px));
      if (qty >= 1) cmds.push({ kind: 'order', side: 'buy', instr: pick.instr, qty });
    }
  }
  if (!bidOnce.get(w) && v.date.month % 6 === 3 && v.date.day <= 7 && ran.some((c) => c.listed)) {
    const target = book.slice().sort((a, b) => a.px - b.px)[0];
    if (target && spendable(v) > 2_000_000) {
      bidOnce.set(w, true);
      cmds.push({ kind: 'bid', firm: target.instr, cents: 0, multiple: 1.05, paper: true });
    }
  }
  return cmds;
}
