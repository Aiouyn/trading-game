// E-84 (Systems, 2026-10-27): incremental tick invariants and money totals. AC-03-INV-INCR-EQ, -MUTANT (a)(b)(c), -PERF.
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as L from '../src';
import { CCYS, SortedMap, type Bal } from '../src';
import { driveTick, runDriver } from './driver';
import { fixture, prng } from './fixture';

const FIELDS = ['m0', 'm0sys', 'm2', 'netIssuance', 'bridge2909', 'escrow1001', 'sum2160', 'sum1070'] as const;
const full = (w: L.LedgerWorld) => new SortedMap<string, Bal>(w.accounts()); // live ∪ dormant, a fresh map
const totalsOf = (w: L.LedgerWorld) => (w.testHooks() as unknown as { totals: L.Totals }).totals;
const hooks = (w: L.LedgerWorld) => w.testHooks() as unknown as { totals: L.Totals; index: L.AccountIndex; lastView: L.CheckView; accounts: L.Accounts };
const rows = (t: L.Totals) => CCYS.flatMap((c) => { const x = t.get(c) as L.CcyTotals; return [...FIELDS.map((f) => `${c} ${f} ${x[f]}`), ...x.mirror.entries().map(([k, v]) => `${c} mirror ${k} ${v}`)]; });
const DAYS = 3; const TICKS = 720 * DAYS;

describe('AC-03-INV-INCR-EQ: incremental = full recompute', () => {
  it(`fast-check, 3 seeds × ${DAYS} game days: every ccy and field equal at every DAY_CLOSE; the in-world cross-check never fires`, () => {
    let closes = 0;
    fc.assert(fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
      runDriver(seed, TICKS, (w, r) => {
        expect(r.failures).toEqual([]);
        if ((w.tick - 1) % 720 === 719) { expect(rows(totalsOf(w))).toEqual(rows(L.scanTotals(full(w)))); closes++; }
      });
    }), { seed: 84, numRuns: 3 });
    expect(closes).toBe(3 * DAYS);
  });
  it(`ledger_inv_full_scan_every_tick (nightly fallback): ${DAYS} game days, the full-scan side is used and incremental = full on every tick`, () => {
    const w0 = fixture({ params: { ledger_inv_full_scan_every_tick: true } });
    let ticks = 0;
    runDriver(Number(process.env.LEDGER_FULL_SCAN_SEED ?? 42), TICKS, (w, r) => {
      expect(r.failures).toEqual([]);
      expect(rows(totalsOf(w))).toEqual(rows(L.scanTotals(full(w))));
      expect('endTotals' in (hooks(w).lastView.balances ?? {})).toBe(false); // the scanned side, not the incremental one
      ticks++;
    }, w0);
    expect(ticks).toBe(TICKS);
  });
  it('the same seed gives the same entry log and snapshot with the flag on or off (the flag only adds checks)', () => {
    const a = runDriver(7, 800); const b = runDriver(7, 800, undefined, fixture({ params: { ledger_inv_full_scan_every_tick: true } }));
    expect(L.hashHex(L.canonEncode(b.entryLog()))).toBe(L.hashHex(L.canonEncode(a.entryLog())));
    expect(b.snapshot()).toBe(a.snapshot());
  });
  it('restore rebuilds the running totals from a full scan (load / replay)', () => {
    const w = runDriver(5, 900); const cp = w.checkpoint();
    totalsOf(w).get('FDL')!.m2 += 3n;
    w.restore(cp);
    expect(rows(totalsOf(w))).toEqual(rows(L.scanTotals(full(w))));
    for (const r of w.runTicks(720)) expect(r.failures).toEqual([]);
  });
});

describe('AC-03-INV-INCR-MUTANT', () => {
  const committed = () => { const w = fixture(); w.apiFor('21').ledger.mint('chr_A', 50n, 'FDL', 'ADM_CORRECTION_IN'); expect(w.runP13().failures).toEqual([]); return w; };
  it('(a) a balance written directly through the store (no posting) is in the dirty set and caught by the balance/flow checks in the same tick', () => {
    const cases: [string, bigint, string[]][] = [
      ['chr_A:1001:FDL', 5n, ['INV-LED-019', 'INV-LED-021']],                                // ΔM0_player / Σ m vs flows
      ['cbk_FDL:1910:FDL', 5n, ['INV-LED-003', 'INV-LED-004', 'INV-LED-015', 'INV-LED-019']], // ΔM0_sys, ΔM0_cb vs FAUCET − SINK
    ];
    for (const [k, d, ids] of cases) {
      const w = committed(); const a = hooks(w).accounts; const b = a.get(k) ?? { balance: 0n, qty: 0n };
      a.set(k, { balance: b.balance + d, qty: b.qty });
      const r = w.runP13();
      expect(r.safeMode).toBe(true);
      for (const id of ids) expect(r.failedInvariants).toContain(id);
      expect(rows(totalsOf(w))).toEqual(rows(L.scanTotals(full(w)))); // abort: totals rebuilt by a full scan of the store
    }
  });
  it('(a) the dirty set comes from the store journal: a direct write shows up as a dirty account with its committed start value', () => {
    const w = committed(); const a = hooks(w).accounts;
    a.set('chr_B:1001:FDL', { balance: 9n, qty: 0n });
    expect(a.writes()).toEqual([['chr_B:1001:FDL', undefined]]);
    const r = w.runP13(); expect(r.failedInvariants).toContain('INV-LED-019');
    expect(a.writeCount).toBe(0);
  });
  const NAME = { m0: 'M0', m0sys: 'M0_sys', m2: 'M2', netIssuance: 'netIssuance', bridge2909: 'bridge2909', escrow1001: 'Σ 1001 ESCROW', sum2160: 'Σ 2160', sum1070: 'Σ 1070' } as const;
  /** Corrupts the world's committed running totals (or index), runs to the end of day 0; returns the first failing tick and result. */
  const corruptAndRun = (mutate: (w: L.LedgerWorld) => void) => {
    const w = committed(); mutate(w);
    const rs = w.runTicks(719); const i = rs.findIndex((r) => r.failures.length > 0);
    return { w, at: i + 1, r: rs[i] };
  };
  it('(b) a corrupted M0 or M2 running total (read only as tick deltas) passes every tick check and is FATAL at the DAY_CLOSE cross-check', () => {
    for (const f of ['m0', 'm2'] as const) {
      const { w, at, r } = corruptAndRun((x) => { (totalsOf(x).get('FDL') as L.CcyTotals)[f] += 7n; });
      expect(at).toBe(719); expect(r.safeMode).toBe(true);
      const want = L.scanTotals(full(w)).get('FDL') as L.CcyTotals;
      expect(r.failures).toEqual([{ invariantId: 'INV-LED-013', severity: 'FATAL', observed: `E-84 FDL ${NAME[f]}: incremental ${want[f] + 7n} vs full ${want[f]}`, expected: 'incremental = full recompute (E-84 DAY_CLOSE cross-check)' }]);
      expect(rows(totalsOf(w))).toEqual(rows(L.scanTotals(full(w)))); // the run does not continue on the incremental values
    }
  });
  it('(b) every other corrupted running total, the I17 mirror and the account index are FATAL by the next DAY_CLOSE at the latest', () => {
    const muts: [string, (w: L.LedgerWorld) => void][] = [
      ...(['m0sys', 'netIssuance', 'bridge2909', 'escrow1001', 'sum2160', 'sum1070'] as const).map((f): [string, (w: L.LedgerWorld) => void] => [f, (w) => { (totalsOf(w).get('FDL') as L.CcyTotals)[f] += 7n; }]),
      ['mirror', (w) => { (totalsOf(w).get('FDL') as L.CcyTotals).mirror.set('hh_C1', 4n); }],
      ['index negative', (w) => { hooks(w).index.negative.set('chr_A:1001:FDL', -1n); }],
    ];
    for (const [name, m] of muts) {
      const { w, at, r } = corruptAndRun(m);
      expect(at, name).toBeGreaterThan(0); expect(at, name).toBeLessThanOrEqual(719);
      expect(r.safeMode, name).toBe(true); expect(r.failures.every((x) => x.severity === 'FATAL'), name).toBe(true);
      expect(rows(totalsOf(w))).toEqual(rows(L.scanTotals(full(w))));
    }
  });
  it('(b) the DAY_CLOSE cross-check itself names the ccy, the field and both values for every total, the mirror, m(e) and the index', () => {
    const w = runDriver(42, 300); const live = hooks(w).accounts; const good = L.scanTotals(live); const idx = L.scanIndex(live);
    const h = L.scanHoldings(live, () => undefined);
    expect(L.totalsCrossCheck(good, L.scanTotals(live), h, h, idx, live)).toEqual([]);
    for (const f of FIELDS) {
      const bad = L.copyTotals(good); (bad.get('EUN') as L.CcyTotals)[f] -= 2n;
      expect(L.totalsCrossCheck(bad, good, h, h, idx, live).map((x) => x.observed)).toEqual([`E-84 EUN ${NAME[f]}: incremental ${(good.get('EUN') as L.CcyTotals)[f] - 2n} vs full ${(good.get('EUN') as L.CcyTotals)[f]}`]);
    }
    const h2 = h.clone(); h2.set('chr_A|FDL', (h.get('chr_A|FDL') ?? 0n) + 1n);
    expect(L.totalsCrossCheck(good, good, h2, h, idx, live).map((x) => x.observed)).toEqual([`E-84 FDL m(chr_A): incremental ${(h.get('chr_A|FDL') ?? 0n) + 1n} vs full ${h.get('chr_A|FDL') ?? 0n}`]);
  });
  it('(c) structural: the balance side reads store balances only; it never reads a posting', () => {
    const src = readFileSync(new URL('../src/balside.ts', import.meta.url), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    for (const banned of ['./types', './templates', 'Posting', 'posting', 'Entry', 'debitAccount', 'creditAccount', 'flowLeg', '.amount', 'postingEffect'])
      expect(src.includes(banned), banned).toBe(false);
    const world = readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
    expect(world).toMatch(/start = new SortedMap<string, Bal \| undefined>\(post\.writes\(\)\); for \(const \[k, b\] of outsideWrites\)/); // dirty set = store journal
    expect(world).toContain('const inc = incrementalSide(this.totals, dirty);');
    expect(world).toContain('const holdPost = advanceHoldings(this.s.holdings, dirtyNow(), victim);');
    const inv = readFileSync(new URL('../src/invariants.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/sysinv.ts', import.meta.url), 'utf8');
    expect(inv).not.toMatch(/computeM0sys\(v\.p(re|ost)|computeM0\(v\.p(re|ost)|computeM2\(v\.p(re|ost)|netIssuance\(v\.post|bridge2909\(v\.post/);
  });
  it('(c) behavioural: INV-LED-003/004/015/019 take the balance side from v.balances, independent of the postings', () => {
    const w = committed(); w.apiFor('21').ledger.mint('chr_A', 20n, 'FDL', 'ADM_CORRECTION_IN'); expect(w.runP13().failures).toEqual([]);
    const v = hooks(w).lastView; const bs = v.balances as L.BalanceSide;
    for (const chk of [L.INV_LED_003, L.INV_LED_004, L.INV_LED_015]) expect(chk(v)).toEqual([]);
    const off = (c: L.CcyTotals): L.CcyTotals => ({ ...c, m0sys: c.m0sys + 1n });
    const forged = { ...v, balances: { ...bs, end: (c: L.Ccy) => (c === 'FDL' ? off(bs.end(c)) : bs.end(c)) } };
    for (const chk of [L.INV_LED_003, L.INV_LED_004, L.INV_LED_015]) expect(chk(forged).length).toBeGreaterThan(0);
  });
});

/** Per-tick invariant time (every TICK and SYS check) with `idle` extra live accounts that no tick touches. */
function invariantMs(idle: number, ticks: number): number {
  const w = fixture();
  for (let i = 0; i < idle / 2; i++) { const id = `chr_I${String(i).padStart(6, '0')}`; w.registerEntity({ id }); w.apiFor('21').ledger.mint(id, 1n, 'FDL', 'ADM_CORRECTION_IN'); }
  expect(w.runP13().failures).toEqual([]); // 2 live accounts per mint (holder 1001 + cbk 2001 sub)
  let ms = 0;
  const all = [...L.TICK_INVARIANTS, ...L.SYS_INVARIANTS] as [string, (v: L.CheckView) => L.Failure[]][];
  const orig = all.map(([, f]) => f);
  all.forEach((row, i) => { row[1] = (v) => { const t0 = performance.now(); const r = orig[i](v); ms += performance.now() - t0; return r; }; });
  try {
    const rnd = prng(3); const loans: { id: string; amt: bigint; borrower: string }[] = [];
    for (let t = 0; t < ticks; t++) { driveTick(w, rnd, loans); expect(w.runP13().failures).toEqual([]); }
  } finally { all.forEach((row, i) => { row[1] = orig[i]; }); }
  return ms / ticks;
}
describe('AC-03-INV-INCR-PERF', () => {
  const long = process.env.TYCOON_LONG === '1';
  it(`doubling the idle accounts changes per-tick invariant time by < 10% (asserted on the nightly run, TYCOON_LONG=1; logged otherwise)`, { timeout: 600_000 }, () => {
    const n = long ? 40_000 : 4_000; const ticks = long ? 700 : 150;
    const a: number[] = []; const b: number[] = [];
    for (let i = 0; i < (long ? 3 : 1); i++) { a.push(invariantMs(n, ticks)); b.push(invariantMs(2 * n, ticks)); } // interleaved, min of each
    const ratio = Math.min(...b) / Math.min(...a);
    console.log(`[INCR-PERF] idle ${n}: ${Math.min(...a).toFixed(4)} ms/tick; idle ${2 * n}: ${Math.min(...b).toFixed(4)} ms/tick; ratio ${ratio.toFixed(3)}`);
    if (long) expect(ratio).toBeLessThan(1.1);
  });
});
