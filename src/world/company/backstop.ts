import { COMPANY } from '@/content/company';
import { keyedRng, today } from '../core';
import { openCase } from '../court';
import type { GameState, StepOutput } from '../types';

/**
 * The insider backstop (spec 6.2, DECISIONS C4, the court's `insider` case). Surveillance points accumulate per player from
 * related-party prices outside the band, closed-window attempts and plan abuse. Once the points reach the civil bar, the
 * backstop opens a case with odds that rise with the points, capped at 60% (never automatic, never certain). The plaintiff
 * is the largest non-insider long holder of the company's stock: the victim who traded against the insider. The verdict
 * follows the court's evidence bar and penalties (court.ts), so the backstop only files a case.
 */

/** The victim: the non-insider player with the largest long position in the listed stock of the company (none: no case). */
function victimOf(g: GameState, companyId: string, insiderId: string): string | null {
  const assetId = g.companies?.companies[companyId]?.listed?.assetId;
  if (!assetId) return null;
  let best: string | null = null;
  let bestQty = 0;
  for (const pid of Object.keys(g.market.accounts).sort()) {
    if (pid === insiderId) continue;
    const p = g.players[pid];
    if (!p || p.npc) continue;
    const q = g.market.accounts[pid]!.positions[assetId]?.qty ?? 0;
    if (q > bestQty) {
      best = pid;
      bestQty = q;
    }
  }
  return best;
}

/** Runs the backstop for the day: opens cases on the points, once per player per day at most (a keyed draw, so replays agree). */
export function insiderBackstop(g: GameState, out: StepOutput | null): void {
  const w = g.companies;
  if (!w?.insider) return;
  const F = COMPANY.failure;
  for (const pid of Object.keys(w.insider).sort()) {
    const rec = w.insider[pid]!;
    if (rec.points < F.insiderBar || !g.players[pid]) continue;
    const odds = Math.min(F.insiderOddsCap, rec.points * F.insiderOddsPerPoint);
    if (!keyedRng(g, `insider:${pid}:${today(g)}`).chance(odds)) continue;
    const victim = victimOf(g, rec.companyId ?? '', pid);
    if (!victim) continue;
    openCase(g, victim, pid, 'insider', rec.points, out);
    rec.points = 0;
    rec.reasons = [];
  }
}
