import { describe, expect, it } from 'vitest';
import { macroTables, type DailyHistoryRow } from '../schema';
import { schedWorld } from '../testkit/schedWorld';
import { credit364Of, historyAt, keepHistoryDay, MACRO_DEV_CHECKS, pruneHistory } from './history';

const H = macroTables.history.name;
const row = (key: string, d: number, credit: number | null = 1): DailyHistoryRow => ({ id: `${key}:${d}`, bloc: key, gameDay: d, credit } as unknown as DailyHistoryRow);

describe('T04-20 history retention', () => {
  it('keepHistoryDay: 421 days kept per key at today 1000; 2526 rows over 6 keys after 1001 closes', () => {
    let k = 0;
    for (let d = 0; d <= 1000; d++) if (keepHistoryDay(d, 1000)) k++;
    expect(k).toBe(421);
    const w = schedWorld('h');
    for (let d = 0; d <= 1000; d++) { for (const key of ['FDL', 'EUN', 'PYN', 'NKR', 'SRL', 'GLOBAL']) w.store.put(H, row(key, d)); pruneHistory(w.ctx, d); }
    expect(w.store.count(H)).toBe(2526);
    expect(historyAt(w.store, 'FDL', 600)).not.toBeNull();
    expect(historyAt(w.store, 'FDL', 599)).toBeNull();
    expect(historyAt(w.store, 'FDL', 546)).not.toBeNull();   // 546 = 91·6 (month start)
  });
  it('today 401 deletes none; today 402 deletes day 1', () => {
    const w = schedWorld('h');
    for (let d = 0; d <= 402; d++) w.store.put(H, row('FDL', d));
    expect(pruneHistory(w.ctx, 401)).toBe(0);
    expect(pruneHistory(w.ctx, 402)).toBe(1);
    expect(historyAt(w.store, 'FDL', 1)).toBeNull();
    expect(historyAt(w.store, 'FDL', 0)).not.toBeNull();
  });
  it('E-90 (4) credit364: null before day 364; MAC_HISTORY_GAP in dev; production falls back to null', () => {
    const w = schedWorld('h');
    expect(credit364Of(w.store, 'FDL', 363)).toBeNull();
    w.store.put(H, row('FDL', 0, 7));
    expect(credit364Of(w.store, 'FDL', 364)).toBe(7);
    expect(() => credit364Of(w.store, 'FDL', 365)).toThrow(/MAC_HISTORY_GAP|no history row/);
    MACRO_DEV_CHECKS.on = false;
    try { expect(credit364Of(w.store, 'FDL', 365)).toBeNull(); } finally { MACRO_DEV_CHECKS.on = true; }
  });
});
