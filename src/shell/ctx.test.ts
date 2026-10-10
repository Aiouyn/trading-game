import { describe, expect, it } from 'vitest';
import { RANKS } from '../content/lifestyle';
import { APPS, type AppId } from './apps';
import { RANK_ORDER, isAppUnlocked, makeWmCtx, rankOrdinal, workspaceCount } from './ctx';

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
    expect(isAppUnlocked('lab', 'R1')).toBe(false);
    expect(isAppUnlocked('lab', 'R2')).toBe(true);
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
    expect(ctx.workspaces).toBe(2);
    expect(ctx.unlocked('lab')).toBe(true);
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
  it('has one workspace at R0 and R1, two at R2, three from R3 up', () => {
    expect(workspaceCount('R0')).toBe(1);
    expect(workspaceCount('R1')).toBe(1);
    expect(workspaceCount('R2')).toBe(2);
    expect(workspaceCount('R3')).toBe(3);
    expect(workspaceCount('R6')).toBe(3);
    expect(workspaceCount('nope')).toBe(1);
  });
});
