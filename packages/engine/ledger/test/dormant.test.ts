// PR #6 option A perf: zero accounts are parked out of the live map and the M0/M2/netIssuance/2909 scans are cached per map version.
// These tests prove the live, cached values always equal the full recompute over every account (live ∪ dormant), and that the
// day-close cross-check is FATAL when the parking is broken.
import { describe, expect, it } from 'vitest';
import * as L from '../src';
import { CCYS, SortedMap, type Bal } from '../src';
import { runDriver } from './driver';
import { fixture } from './fixture';

const full = (w: L.LedgerWorld) => new SortedMap<string, Bal>(w.accounts()); // a fresh map: no cache, every account
const scans = (a: L.Accounts, c: L.Ccy) => [L.computeM0Scan(a, c), L.computeM2Scan(a, c), L.netIssuanceScan(a, c), L.bridge2909Scan(a, c)];

describe('perf: live-only scans = full recompute (PR #6 option A)', () => {
  it('driver seed 42, 1 day: every tick, cached live M0/M2/netIssuance/2909 and aggregates() = full recompute; dormant is 0n/0n and disjoint', () => {
    let parked = 0;
    runDriver(42, 720, (w) => {
      const { accounts: live, dormant } = w.testHooks(); const all = full(w);
      for (const c of CCYS) {
        expect([L.computeM0(live, c), L.computeM2(live, c), L.netIssuance(live, c), L.bridge2909(live, c)]).toEqual(scans(all, c));
        const g = w.aggregates(c); expect([g.M0, g.M2]).toEqual([L.computeM0Scan(all, c), L.computeM2Scan(all, c)]);
      }
      for (const [k, b] of dormant) { expect([b.balance, b.qty]).toEqual([0n, 0n]); expect(live.has(k)).toBe(false); }
      expect(all.size).toBe(live.size + dormant.size);
      parked = Math.max(parked, dormant.size);
    });
    expect(parked).toBeGreaterThan(50); // not vacuous: the driver's repaid loans park over a hundred accounts a day
  });
  it('a write invalidates the cached value (memo keyed by map version)', () => {
    const w = fixture(); w.apiFor('21').ledger.mint('chr_A', 50n, 'FDL', 'ADM_CORRECTION_IN'); w.runP13();
    const a = w.testHooks().accounts; const m0 = L.computeM0(a, 'FDL');
    a.set('cbk_FDL:2001:chr_A:FDL', { balance: (a.get('cbk_FDL:2001:chr_A:FDL')?.balance ?? 0n) - 7n, qty: 0n });
    expect(L.computeM0(a, 'FDL')).toBe(m0 + 7n); expect(L.computeM0(a, 'FDL')).toBe(L.computeM0Scan(a, 'FDL'));
  });
  it('an account zeroed by a commit is parked and comes back live when posted again; accounts() still lists it', () => {
    const w = fixture(); const k = 'chr_A:1001:FDL';
    w.apiFor('21').ledger.mint('chr_A', 50n, 'FDL', 'ADM_CORRECTION_IN'); w.runP13();
    w.apiFor('21').ledger.burn('chr_A', 50n, 'FDL', 'ADM_CORRECTION_OUT'); w.runP13();
    expect(w.testHooks().dormant.has(k)).toBe(true); expect(w.testHooks().accounts.has(k)).toBe(false);
    expect(w.accounts().find(([x]) => x === k)?.[1]).toEqual({ balance: 0n, qty: 0n });
    w.apiFor('21').ledger.mint('chr_A', 9n, 'FDL', 'ADM_CORRECTION_IN'); w.runP13();
    expect(w.testHooks().dormant.has(k)).toBe(false); expect(w.balance(k)).toBe(9n);
  });
  it('day-close cross-check: a non-zero dormant account, or one that is also live, is INV-LED-013 FATAL', () => {
    for (const bad of [{ k: 'chr_B:1001:FDL', b: { balance: 5n, qty: 0n } }, { k: 'chr_A:1001:FDL', b: { balance: 0n, qty: 0n } }]) {
      const w = fixture(); w.apiFor('21').ledger.mint('chr_A', 50n, 'FDL', 'ADM_CORRECTION_IN'); w.runP13();
      w.testHooks().dormant.set(bad.k, bad.b);
      const rs = w.runTicks(719); const last = rs[rs.length - 1];
      expect(rs.slice(0, -1).every((r) => r.failures.length === 0)).toBe(true);
      expect(last.safeMode).toBe(true); expect(last.failures.map((f) => f.invariantId)).toContain('INV-LED-013');
      expect(last.failures.some((f) => f.observed.startsWith(`dormant ${bad.k}`))).toBe(true);
    }
    expect(L.dormantCrossCheck(new SortedMap(), new SortedMap([['x_1:1001:FDL', { balance: 0n, qty: 0n }]]))).toEqual([]);
  });
});
