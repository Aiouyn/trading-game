import { describe, expect, it } from 'vitest';
import { RANKS } from '../content/lifestyle';
import { APPS, type AppId } from './apps';
import { RANK_ORDER, isAppUnlocked, makeWmCtx, rankOrdinal, workspaceCount } from './ctx';
import { planLayout } from './layouts';

describe('ctx: rank gate', () => {
  it('uses the rank ids from the lifestyle content, R0 to R6', () => {
    expect(RANK_ORDER).toEqual(RANKS.map((r) => r.id));
    expect(RANK_ORDER).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  });

  it('opens Broker, Portfolio and Wire from R0', () => {
    for (const a of ['broker', 'portfolio', 'wire', 'messages', 'settings', 'learn'] as AppId[]) {
      expect(isAppUnlocked(a, 'R0'), a).toBe(true);
    }
  });

  it('gates Research at R3, AI Lab and Company at R2, Security at R3', () => {
    expect(isAppUnlocked('research', 'R2')).toBe(false);
    expect(isAppUnlocked('research', 'R3')).toBe(true);
    expect(isAppUnlocked('ailab', 'R1')).toBe(false);
    expect(isAppUnlocked('ailab', 'R2')).toBe(true);
    expect(isAppUnlocked('company', 'R1')).toBe(false);
    expect(isAppUnlocked('company', 'R2')).toBe(true);
    expect(isAppUnlocked('security', 'R2')).toBe(false);
    expect(isAppUnlocked('security', 'R3')).toBe(true);
  });

  it('treats an unknown rank id as R0', () => {
    expect(rankOrdinal('R9')).toBe(0);
    expect(isAppUnlocked('research', 'R9')).toBe(false);
    expect(isAppUnlocked('broker', 'junk')).toBe(true);
  });

  it('builds a reducer context from the earned rank', () => {
    const ctx = makeWmCtx('R2', (t) => t === 'HLCN');
    expect(ctx.workspaces).toBe(3);
    expect(ctx.unlocked('ailab')).toBe(true);
    expect(ctx.unlocked('research')).toBe(false);
    expect(ctx.hasPendingOrder('HLCN')).toBe(true);
    expect(ctx.hasPendingOrder('BRNT')).toBe(false);
  });

  it('keeps every minRank as an existing rank', () => {
    for (const id of Object.keys(APPS) as AppId[]) {
      const r = APPS[id].minRank;
      if (r !== null) expect(RANK_ORDER).toContain(r);
    }
  });
});

describe('ctx: workspaces from earned rank (C-03)', () => {
  it('has Trade and News at R0 and R1, Portfolio from R2, Empire from R3', () => {
    expect(workspaceCount('R0')).toBe(2);
    expect(workspaceCount('R1')).toBe(2);
    expect(workspaceCount('R2')).toBe(3);
    expect(workspaceCount('R3')).toBe(4);
    expect(workspaceCount('R6')).toBe(4);
    expect(workspaceCount('nope')).toBe(2);
  });
});

describe('ctx: the built-in layout planner is wired from the rank', () => {
  it('plans Trade through the layouts module with the rank gate applied', () => {
    const vp = { w: 1920, h: 1080 };
    const r0 = makeWmCtx('R0');
    expect(r0.plan('trade', vp, { ticker: 'HLCN' }).map((p) => p.app)).toEqual(['wire', 'portfolio', 'broker']);
    expect(r0.plan('research', vp, { ticker: 'HLCN', fileId: 'f1' }).map((p) => p.app)).toEqual(['wire', 'broker']);
    expect(makeWmCtx('R3').plan('research', vp, { ticker: 'HLCN', fileId: 'f1' }).map((p) => p.app)).toEqual(['broker', 'wire', 'research']);
  });

  it('gives the same placements as the layouts module', () => {
    const vp = { w: 1440, h: 900 };
    const all = (): boolean => true;
    expect(makeWmCtx('R3').plan('trade', vp, { ticker: 'HLCN' })).toEqual(planLayout('trade', vp, all, { ticker: 'HLCN' }).placements);
  });
});
