// What every strategy is allowed to see, and a few reads of that view.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';

export type Bot = (view: PlayerView, w: World) => Command[];

/** Spendable cash after a living buffer, in cents. Wages and shopping need the rest. */
export const BUFFER = 800_000;

export function live(v: PlayerView): boolean {
  return v.alive && !v.over;
}

export function spendable(v: PlayerView): number {
  return Math.max(0, v.cash - BUFFER);
}

export function stocks(v: PlayerView): { instr: string; px: number }[] {
  const out: { instr: string; px: number }[] = [];
  for (const p of v.prices) if (p.instr.startsWith('eq:') && p.px > 0) out.push({ instr: p.instr, px: p.px });
  return out;
}

export function bondQuotes(v: PlayerView): { tenor: string; px: number }[] {
  const out: { tenor: string; px: number }[] = [];
  for (const p of v.prices) {
    const m = /^bond:([^:]+):/.exec(p.instr);
    if (m && p.px > 0) out.push({ tenor: m[1], px: p.px });
  }
  return out;
}

/** Match a firm name inside a sentence to a listed ticker. The view never pairs them. */
export function stockForName(v: PlayerView, text: string): string | undefined {
  const low = text.toLowerCase();
  let best: { instr: string; n: number } | undefined;
  for (const s of stocks(v)) {
    const slug = s.instr.slice(3).replace(/^frm_/, '').replace(/_/g, ' ');
    const tokens = slug.split(' ').filter((t) => t.length >= 5);
    let n = 0;
    for (const t of tokens) if (low.includes(t)) n += t.length;
    if (n > 0 && (!best || n > best.n)) best = { instr: s.instr, n };
  }
  return best?.instr;
}

export function unit(seed: string, day: number, salt: number): number {
  let h = 2166136261;
  const s = `${seed}:${day}:${salt}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function heldQty(v: PlayerView, instr: string): number {
  for (const s of v.shares) if (s.instr === instr) return s.qty;
  return 0;
}
