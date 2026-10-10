import { describe, expect, it } from 'vitest';
import { createWorld, ecologyLog, stepMany, universeConfig, type AssetDef } from '@/engine';
import { appendAsset } from '@/engine/listings';
import { latestDepth } from './depth';

const TPD = 24;

describe('latestDepth (the Broker depth rows)', () => {
  it('reads the newest closed day for a name that has one', () => {
    const s = stepMany(createWorld('depth-read', universeConfig({ ticksPerDay: TPD, listings: {} })), TPD * 3).state;
    const log = ecologyLog(s);
    expect(log.length).toBeGreaterThan(0);
    const base = s.config.assets.find((a) => a.listed !== false && !a.delisted)!;
    const d = latestDepth(s, base.id)!;
    expect(d.day).toBe(log.at(-1)!.day);
    expect(Number.isFinite(d.depth)).toBe(true);
  });

  it('returns null for a listing that postdates the last close, and never throws', () => {
    const s = stepMany(createWorld('depth-listing', universeConfig({ ticksPerDay: TPD, listings: {} })), TPD * 3).state;
    const base = s.config.assets.find((a) => a.listed !== false && !a.delisted && a.assetClass === 'stock')!;
    const def: AssetDef = { ...base, id: 'NEWCO', name: 'New Co', listedDay: 3 };
    // appendAsset is what listings.ts does at an IPO: config, asset state and ecology grow, the log does not
    const after = appendAsset(s, def);
    expect(after.config.assets.some((a) => a.id === 'NEWCO')).toBe(true);
    expect(latestDepth(after, 'NEWCO')).toBeNull();
    expect(latestDepth(after, base.id)!.day).toBe(ecologyLog(after).at(-1)!.day);
  });

  it('returns null for an unknown name', () => {
    const s = createWorld('depth-unknown', universeConfig({ ticksPerDay: TPD, listings: {} }));
    expect(latestDepth(s, 'NOPE')).toBeNull();
  });
});
