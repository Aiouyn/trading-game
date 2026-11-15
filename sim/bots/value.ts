// Hold the market, and keep an extra clip of the cheapest earnings yields for half a year.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { BUFFER, heldQty, live, spendable, stockForName, stocks } from './lib.ts';

export const name = 'value';

const CLIP = 180;
const EPS = /^(.+?) Q\d:.*EPS \$([0-9]+(?:\.[0-9]+)?)/;
const learned = new WeakMap<World, Map<string, number>>();
const picksOf = new WeakMap<World, { day: number; names: string[] }>();
const rounds = new WeakMap<World, number>();

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  let eps = learned.get(w);
  if (!eps) { eps = new Map(); learned.set(w, eps); }
  const own = v.firm ? 'eq:' + v.firm : '';
  for (const n of v.news) {
    const m = EPS.exec(n.text);
    if (!m) continue;
    const cents = Math.round(Number(m[2]) * 100);
    if (!(cents > 0)) continue;
    const instr = stockForName(v, m[1]);
    if (instr && instr !== own) eps.set(instr, cents);
  }
  const now = stocks(v);
  let held = picksOf.get(w);
  if (!held || v.date.abs - held.day >= 180) {
    const rows: { instr: string; pe: number }[] = [];
    for (const s of now) {
      if (s.px < 400) continue;
      const e = eps.get(s.instr);
      if (!e || e <= 0) continue;
      rows.push({ instr: s.instr, pe: s.px / e });
    }
    rows.sort((a, b) => a.pe - b.pe);
    if (rows.length >= 8) {
      held = { day: v.date.abs, names: rows.slice(0, 5).map((r) => r.instr) };
      picksOf.set(w, held);
    }
  }
  const focus = new Set(held?.names ?? []);
  let sum = 0;
  for (const s of now) sum += s.px;
  if (!(sum > 0)) return [];
  const saved = rounds.get(w) ?? 0;
  const affordable = Math.floor(Math.max(0, v.netWorth - BUFFER) / sum);
  const want = Math.max(saved, affordable);
  if (want > saved) rounds.set(w, want);
  const tilt = (px: number): number => focus.size ? Math.min(800, Math.floor(v.netWorth * 0.2 / focus.size / px)) : 0;
  const tgt = (instr: string, px: number): number => focus.has(instr) ? want + tilt(px) : want;
  const cmds: Command[] = [];
  const parked = v.deposits.reduce((a, d) => a + d.cents, 0);
  let left = spendable(v);
  let need = 0;
  for (const s of now) need += Math.max(0, tgt(s.instr, s.px) - heldQty(v, s.instr)) * s.px;
  const take = Math.min(parked, Math.max(0, need - left));
  if (take >= 50_000) {
    cmds.push({ kind: 'cash', op: 'withdraw', cents: take });
    left += take;
  }
  for (const s of v.shares) {
    if (!s.instr.startsWith('eq:')) continue;
    const px = now.find((n) => n.instr === s.instr)?.px ?? 0;
    const goal = tgt(s.instr, px);
    if (s.qty > goal + (focus.has(s.instr) ? 0 : CLIP)) {
      cmds.push({ kind: 'order', side: 'sell', instr: s.instr, qty: Math.min(CLIP, s.qty - goal) });
    }
  }
  const ranked = now
    .map((s) => ({ ...s, gap: Math.max(0, tgt(s.instr, s.px) - heldQty(v, s.instr)) }))
    .filter((s) => s.gap >= 1)
    .sort((a, b) => (focus.has(b.instr) ? 1 : 0) - (focus.has(a.instr) ? 1 : 0) || b.gap * b.px - a.gap * a.px);
  for (const s of ranked) {
    const qty = Math.min(s.gap, focus.has(s.instr) ? CLIP : s.gap, Math.floor(left / s.px));
    if (qty < 1) continue;
    cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
    left -= qty * s.px;
    if (left < 2_000) break;
  }
  return cmds;
}
