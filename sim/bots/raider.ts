// Found a firm, hire, invest, list it, and bid for the cheapest listed name.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { live, spendable, stocks } from './lib.ts';

export const name = 'raider';

const SECTORS = ['RETAIL', 'MANUFACTURING', 'CONSTRUCTION', 'AGRICULTURE', 'TRANSPORT'];
const lastTry = new WeakMap<World, number>();

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  const cmds: Command[] = [];
  const ran = v.companies.filter((c) => c.role === 'chief executive');
  if (!ran.length) {
    const prev = lastTry.get(w) ?? -999;
    const cash = spendable(v);
    if (v.date.abs - prev >= 90 && cash >= 1_500_000) {
      lastTry.set(w, v.date.abs);
      const sector = SECTORS[v.date.month % SECTORS.length];
      const put = Math.min(cash, Math.max(1_500_000, Math.floor(cash * 0.35)));
      cmds.push({
        kind: 'found',
        name: `Booth ${sector.slice(0, 3)} ${v.date.year}.${v.date.month}`,
        sector,
        cents: put,
        loan: false,
      });
      const left = v.cash - put - 800_000;
      if (left >= 50_000) cmds.push({ kind: 'cash', op: 'deposit', cents: left });
    } else if (v.cash - 4_000_000 >= 50_000) {
      cmds.push({ kind: 'cash', op: 'deposit', cents: v.cash - 4_000_000 });
    }
  }
  for (const c of ran) {
    if (c.workers < 10 && c.cash > 400_000) cmds.push({ kind: 'ceo', firm: c.id, op: 'hires', value: Math.max(8, c.workers + 2) });
    if (c.profit > 0 && c.cash > 300_000 && v.date.day <= 7) cmds.push({ kind: 'ceo', firm: c.id, op: 'invest', value: 1 });
    if (!c.listed && c.workers >= 4 && c.profit > 0 && v.date.month % 3 === 1 && v.date.day <= 7) {
      cmds.push({ kind: 'ipo', firm: c.id, fraction: 0.5 });
    }
  }
  if (ran.length && v.cash - 800_000 >= 50_000) cmds.push({ kind: 'cash', op: 'deposit', cents: v.cash - 800_000 });
  if (v.date.month % 3 === 2 && v.date.day <= 7) {
    const book = stocks(v).slice().sort((a, b) => a.px - b.px);
    const target = book[0];
    if (target) {
      const paper = ran.some((c) => c.listed);
      cmds.push({ kind: 'bid', firm: target.instr, cents: 0, multiple: 1.3, paper });
    }
  }
  return cmds;
}
