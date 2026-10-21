import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonEncode, CCYS, FLOW_CLASSES, hashHex, legKey, SortedMap, tickFlowsOf, type FlowClass } from '../src';
import { runDriver, runDriverYielding } from './driver';

const fcParams = { numRuns: 25, seed: 20261020 };

describe('property and long-run tests', () => {
  it('FT3: the driver\'s composed trade + fee entries commit (valid, both codes posted); none is invalid', () => {
    const w = runDriver(7, 200);
    const composed = w.entryLog().filter((e) => e.template === 'SWAP_ASSET');
    expect(composed.length).toBeGreaterThan(0);
    expect(composed.filter((e) => e.invalid)).toEqual([]);
    expect(composed.every((e) => e.postings.some((p) => p.reason === 'MKT_EXCHANGE_FEE'))).toBe(true);
  });
  it('spec test 1 (INV-LED-015 property): (a)-(d) hold every tick for random entries incl. composed, cbCredit and REVALUE', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
      runDriver(seed, 60, (w, r, before) => {
        expect(r.failures).toEqual([]);
        const tick = w.tick - 1;
        const entries = w.entryLog().filter((e) => e.tick === tick && !e.invalid);
        for (const e of entries) {
          const n = new SortedMap<string, number>();
          for (const p of e.postings) n.set(legKey(p), (n.get(legKey(p)) ?? 0) + (p.flowLeg ? 1 : 0));
          expect(n.values().every((c) => c === 1)).toBe(true); // (a)
        }
        for (const ccy of CCYS) {
          const f = w.flowReader().tickFlows(ccy, tick)!;
          const byCode = new SortedMap<string, bigint>();
          for (const e of entries) for (const p of e.postings) if (p.flowLeg && p.ccy === ccy) byCode.set(p.reason, (byCode.get(p.reason) ?? 0n) + p.amount);
          expect(f.byCode.entries()).toEqual(byCode.entries()); // (b)
          const byClass = new SortedMap<FlowClass, bigint>(FLOW_CLASSES.map((c) => [c, 0n]));
          for (const [c, a] of byCode) { const k = w.catalog.get(c)!.cls; byClass.set(k, byClass.get(k)! + a); }
          expect(f.byClass.entries()).toEqual(byClass.entries());
          const fs = f.byClass.get('FAUCET')! - f.byClass.get('SINK')!;
          if (ccy === 'FDL') expect(w.aggregates('FDL').M0_sys - before.M0_sys).toBe(fs); // (c)
          expect(f.m0sysDelta).toBe(fs);
          const transferOnly = entries.length > 0 && entries.every((e) => e.postings.every((p) => w.catalog.get(p.reason)!.cls === 'TRANSFER'));
          if (transferOnly) expect([f.byClass.get('FAUCET'), f.byClass.get('SINK')]).toEqual([0n, 0n]); // (d)
        }
      });
    }), fcParams);
  });

  it('03#39 / p10 zerosum port: 14 game days; FlowDay totals = sums recomputed from the postings; exact 0n residual every day', async () => {
    const days = process.env.TYCOON_LONG === '1' ? 2688 : 14;
    const w = await runDriverYielding(39, 720 * days, (_w, r) => expect(r.failures).toEqual([]));
    const log = w.entryLog();
    let m0sys = 0n;
    for (let d = 0; d < days; d++) {
      const fd = w.flowReader().dayFlows('FDL', d)!;
      const sums = new SortedMap<FlowClass, bigint>(FLOW_CLASSES.map((c) => [c, 0n]));
      const byCode = new SortedMap<string, bigint>();
      for (const e of log) if (!e.invalid && Math.floor(e.tick / 720) === d) for (const p of e.postings) if (p.flowLeg && p.ccy === 'FDL') {
        const c = w.catalog.get(p.reason)!.cls; sums.set(c, sums.get(c)! + p.amount); byCode.set(p.reason, (byCode.get(p.reason) ?? 0n) + p.amount);
      }
      for (const c of FLOW_CLASSES) expect(fd.byClass[c]).toBe(String(sums.get(c)));
      for (const [code, a] of byCode) if (['FAUCET', 'SINK'].includes(w.catalog.get(code)!.cls)) expect(fd.byCode[code]).toBe(String(a)); // test 1: Σ TickFlows = FlowDay
      m0sys += sums.get('FAUCET')! - sums.get('SINK')!;
      expect(BigInt(fd.M0_sys)).toBe(m0sys); // residual exactly 0n (p10 tolerated < 0.01/day)
      await new Promise<void>((res) => setImmediate(res)); // yield between days (CI heartbeat)
    }
  });

  it('spec test 5 / p10 invariants.property port: two runs with the same seed are byte-identical; another seed differs', () => {
    const h = (seed: number) => {
      const w = runDriver(seed, 800);
      const flows = [];
      for (let t = 0; t < 800; t++) for (const c of CCYS) flows.push(w.flowReader().tickFlows(c, t) ?? null);
      return [hashHex(canonEncode(w.entryLog())), hashHex(canonEncode(flows)), w.snapshot()];
    };
    const a = h(7); const b = h(7);
    expect(b).toEqual(a);
    expect(h(8)[0]).not.toBe(a[0]);
  });

  it('spec test 5: inserting the same SortedMap keys in a different order gives the same TickFlows hash', () => {
    const w = runDriver(11, 50);
    const entries = w.entryLog().filter((e) => !e.invalid);
    const f1 = tickFlowsOf(entries, w.catalog, 1, () => 0n);
    const f2 = tickFlowsOf([...entries].reverse(), w.catalog, 1, () => 0n);
    expect(hashHex(canonEncode(f2))).toBe(hashHex(canonEncode(f1)));
    expect(canonEncode(new SortedMap([['b', 1n], ['a', 2n]]))).toBe(canonEncode(new SortedMap([['a', 2n], ['b', 1n]])));
  });
});
