import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { applyCommand } from '../game';
import { credit, today, TPD } from '../core';
import { advanceTo, BUYER_A, FOUNDER, listedWorld } from './b1fixture';
import { windowAt } from './insiders';
import { fundById } from '../funds/state';
import type { FundFees, FundMandate } from '../funds/types';
import type { GameState } from '../types';
import type { Company } from './types';

/**
 * The insider surveillance points for window abuse and plan abuse (O-15; spec 6.2; COMPANY.failure.insiderPoints). The engine
 * refuses the attempts (closedWindow, planImmutable); the company module scores the player who made them. An outsider is never
 * refused by the window, so it scores nothing.
 */

const MANDATE: FundMandate = { classes: ['stock', 'crypto', 'commodity', 'forex', 'bond'], maxLeverage: 1, maxPositionPct: 0.2 };
const FEES: FundFees = { mgmt: 0.02, perf: 0.2 };

function points(g: GameState, pid: string): number {
  return g.companies?.insider?.[pid]?.points ?? 0;
}

function reasonsOf(g: GameState, pid: string): string[] {
  return g.companies?.insider?.[pid]?.reasons ?? [];
}

function untilWindow(g: GameState, c: Company, open: boolean): void {
  for (let k = 0; k < 400 && windowAt(c, today(g)).open !== open; k++) advanceTo(g, today(g) + 1);
  expect(windowAt(c, today(g)).open).toBe(open);
}

describe('the insider backstop scores window and plan abuse (O-15)', () => {
  it('a closed-window order by the insider scores the window points; an open-window order scores nothing more', () => {
    const { g, c, assetId } = listedWorld('surv-window');
    untilWindow(g, c, false);
    const before = points(g, FOUNDER);
    const r = applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'buy', type: 'market', qty: 1 } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('closedWindow');
    expect(points(g, FOUNDER) - before).toBe(COMPANY.failure.insiderPoints.windowAttempt);
    expect(reasonsOf(g, FOUNDER)).toContain('closed-window attempt');
    expect(g.companies!.insider![FOUNDER]!.companyId).toBe(c.id);

    untilWindow(g, c, true);
    const open = points(g, FOUNDER);
    expect(applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'buy', type: 'market', qty: 1 } }).ok).toBe(true);
    expect(points(g, FOUNDER)).toBe(open);
  });

  it('a fund the insider manages, refused by the window, scores the manager', () => {
    const { g, c, assetId } = listedWorld('surv-fund');
    g.players[FOUNDER]!.joinedTick = -1000 * TPD;
    g.players[FOUNDER]!.lastSeenTick = g.market.tick;
    credit(g, FOUNDER, 2_000_000, 'test');
    const made = applyCommand(g, FOUNDER, { type: 'fund.create', name: 'Harbour Fund', mandate: MANDATE, fees: FEES, stake: 300_000 });
    expect(made.ok).toBe(true);
    const f = fundById(g, (made.data as { id: string }).id)!;
    untilWindow(g, c, false);
    const before = points(g, FOUNDER);
    const r = applyCommand(g, FOUNDER, { type: 'fund.trade', fundId: f.id, assetId, side: 'buy', qty: 1 });
    expect((r.data as { reason?: string } | undefined)?.reason).toBe('closedWindow');
    expect(points(g, FOUNDER) - before).toBe(COMPANY.failure.insiderPoints.windowAttempt);
  });

  it('an outsider is never refused by the window, so its order scores nothing', () => {
    const { g, c, assetId } = listedWorld('surv-outsider');
    untilWindow(g, c, false);
    const r = applyCommand(g, BUYER_A, { type: 'order.place', order: { assetId, side: 'buy', type: 'market', qty: 1 } });
    expect(r.ok).toBe(true);
    expect(g.companies!.insider?.[BUYER_A]).toBeUndefined();
  });

  it('a plan cannot be cancelled: the attempt is refused planImmutable and scores the plan points', () => {
    const { g, c } = listedWorld('surv-plan');
    const before = points(g, FOUNDER);
    const r = applyCommand(g, FOUNDER, { type: 'company.planCancel', companyId: c.id, planId: 'missing' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('planImmutable');
    expect(points(g, FOUNDER) - before).toBe(COMPANY.failure.insiderPoints.planAbuse);
    expect(reasonsOf(g, FOUNDER)).toContain('plan change refused');
  });

  it('an outsider who sends company.planCancel on another company is refused notFounder and scores nothing (O-15 review)', () => {
    const { g, c } = listedWorld('surv-plan-outsider');
    const r = applyCommand(g, BUYER_A, { type: 'company.planCancel', companyId: c.id, planId: 'missing' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('notFounder');
    expect(g.companies!.insider?.[BUYER_A]).toBeUndefined();
    expect(points(g, BUYER_A)).toBe(0);
    // the listed stock's insider is untouched too
    expect(g.companies!.insider?.[FOUNDER]?.points ?? 0).toBe(0);
  });
});
