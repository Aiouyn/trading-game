// Hold the market. A name that just beat its number is bought in clips and kept for a quarter.
// The market book is not sold to pay for it: cash left in hand is what the household spends.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { BUFFER, heldQty, live, spendable, stockForName, stocks } from './lib.ts';

export const name = 'momentum';

const CLIP = 180;
const BEAT = /^(.+?) Q\d:.*\(beat ([0-9.]+)%\)/;
const beats = new WeakMap<World, Map<string, number>>();
const rounds = new WeakMap<World, number>();

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  let hot = beats.get(w);
  if (!hot) { hot = new Map(); beats.set(w, hot); }
  const own = v.firm ? 'eq:' + v.firm : '';
  for (const n of v.news) {
    const m = BEAT.exec(n.text);
    if (!m || Number(m[2]) < 8) continue;
    const instr = stockForName(v, m[1]);
    if (instr && instr !== own) hot.set(instr, n.day);
  }
  const now = stocks(v);
  const picks = now.filter((s) => {
    const day = hot.get(s.instr);
    return s.instr !== own && s.px >= 400 && day !== undefined && v.date.abs - day <= 70 && day <= v.date.abs;
  }).sort((a, b) => (hot.get(b.instr) ?? 0) - (hot.get(a.instr) ?? 0)).slice(0, 4);
  const focus = new Set(picks.map((s) => s.instr));
  let sum = 0;
  for (const s of now) sum += s.px;
  if (!(sum > 0)) return [];
  const saved = rounds.get(w) ?? 0;
  const affordable = Math.floor(Math.max(0, v.netWorth - BUFFER) / sum);
  const want = Math.max(saved, affordable);
  if (want > saved) rounds.set(w, want);
  const tilt = (px: number): number => picks.length ? Math.min(800, Math.floor(v.netWorth * 0.2 / picks.length / px)) : 0;
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
    if (!s.instr.startsWith('eq:') || focus.has(s.instr)) continue;
    if (s.qty > want + CLIP) cmds.push({ kind: 'order', side: 'sell', instr: s.instr, qty: Math.min(CLIP, s.qty - want) });
  }
  for (const s of v.shares) {
    if (!focus.has(s.instr)) continue;
    const px = now.find((n) => n.instr === s.instr)?.px ?? 0;
    const goal = tgt(s.instr, px);
    if (s.qty > goal) cmds.push({ kind: 'order', side: 'sell', instr: s.instr, qty: Math.min(CLIP, s.qty - goal) });
  }
  const ranked = now
    .map((s) => ({ ...s, gap: Math.max(0, tgt(s.instr, s.px) - heldQty(v, s.instr)) }))
    .filter((s) => s.gap >= 1 && s.instr !== own)
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
