import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Store } from '../../server/db';
import { WorldHost, type HostOptions } from '../../server/host';

const opts: HostOptions = { seed: 'host-archive', tickMs: 5000, warmupDays: 2, snapshotEvery: 60 };

describe('the explain archive is stored per game day, not inside the snapshot (D-16)', () => {
  it('a snapshot carries no archive, the rows hold one day each, and a restart reads them back without duplicates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-archive-'));
    try {
      const store = new Store(dir);
      const host = new WorldHost(store, opts);
      host.boot();
      const days = host.g.market.ecology!.archive!.length;
      expect(days).toBeGreaterThan(0);
      expect(store.latestSnapshot()!.data.includes('"archive"')).toBe(false);
      expect(store.loadArchiveDays().length).toBe(days);

      host.snapshot();
      expect(store.loadArchiveDays().length).toBe(days);
      store.close();

      const store2 = new Store(dir);
      const again = new WorldHost(store2, opts);
      again.boot();
      expect(again.g.market.ecology!.archive!.map((d) => d.day)).toEqual(host.g.market.ecology!.archive!.map((d) => d.day));
      store2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
