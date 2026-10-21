// T02-06: generator, seeding, lazy mixing, epoch rotation, registry, manager faults, ledger, checkpoint, INV-ENG-002 (02#18).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { InvariantCtx } from '../invariant-port';
import { sha256, sha256Concat } from '../crypto/sha256';
import { u32be, utf8 } from '../crypto/hex';
import { EngineFault } from '../types';
import {
  FACT_RNG_DELTAS, FACT_RNG_LEDGER, INV_ENG_002, RngManager, STREAM_REGISTRY, matchStream, mixEntropy, seedStream, streamPrefix, xoNext,
} from './index';
import type { EpochRoots, RngStreamState } from './index';
import { SortedMap } from '../sorted';

const thrown = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof EngineFault ? e.code : `non-fault ${String(e)}`; } };
const roots: EpochRoots = {
  publicRoot: (k) => sha256Concat('test-public', u32be(k)),
  secretEpochRoot: (k) => sha256Concat('TYC/secret-epoch', utf8('test-secret'), u32be(k)),
};
/** Fake entropy words for tick t: sha256(tick) as 8 big-endian words. */
function words(t: number): Uint32Array {
  const h = sha256(u32be(t)), w = new Uint32Array(8);
  for (let i = 0; i < 8; i++) w[i] = ((h[4 * i]! << 24) | (h[4 * i + 1]! << 16) | (h[4 * i + 2]! << 8) | h[4 * i + 3]!) >>> 0;
  return w;
}
const MKT = ['mkt.idio', 'mkt.jump', 'mkt.factor'];

/** Independent straight-line xoshiro128** on BigInt (masking instead of Uint32Array wrap). */
function refXo(s: bigint[]): bigint {
  const M = 0xffffffffn, rl = (x: bigint, k: bigint): bigint => ((x << k) | (x >> (32n - k))) & M;
  const result = (rl((s[1]! * 5n) & M, 7n) * 9n) & M, t = (s[1]! << 9n) & M;
  s[2] = s[2]! ^ s[0]!; s[3] = s[3]! ^ s[1]!; s[1] = s[1]! ^ s[2]!; s[0] = s[0]! ^ s[3]!; s[2] = s[2]! ^ t; s[3] = rl(s[3]!, 11n);
  return result;
}

describe('T02-06 xoshiro128**', () => {
  it('reference sequence from s = [1,2,3,4]: 11520, 0, 5927040, 70819200, 2031721883, 1637235492', () => {
    const s = Uint32Array.from([1, 2, 3, 4]);
    expect(Array.from({ length: 6 }, () => xoNext(s))).toEqual([11520, 0, 5927040, 70819200, 2031721883, 1637235492]);
  });
  it('matches an independent BigInt implementation for 10,000 outputs from a random state', () => {
    const s = Uint32Array.from([0xdeadbeef, 0x12345678, 0x9abcdef0, 0x0badf00d]), r = Array.from(s, BigInt);
    for (let i = 0; i < 10000; i++) expect(xoNext(s)).toBe(Number(refXo(r)));
  });
});

describe('T02-06 seeding and mixing (02 §3.10.2/§3.10.3)', () => {
  it('seedStream: SHA-256(TYC/rng ‖ root ‖ key) LE words, 8 warm-up outputs, keyHash = LE words of SHA-256(key), draws 0, lastMixedTick −1', () => {
    const root = roots.publicRoot(1), st = seedStream('mkt.idio:ast_A', 'PUBLIC', root, 1);
    const b = sha256Concat('TYC/rng', root, 'mkt.idio:ast_A'), s = new Uint32Array(4);
    for (let i = 0; i < 4; i++) s[i] = (b[4 * i]! | (b[4 * i + 1]! << 8) | (b[4 * i + 2]! << 16) | (b[4 * i + 3]! << 24)) >>> 0;
    for (let i = 0; i < 8; i++) xoNext(s);
    expect(Array.from(st.s)).toEqual(Array.from(s));
    const h = sha256(utf8('mkt.idio:ast_A'));
    expect(st.keyHash[0]).toBe((h[0]! | (h[1]! << 8) | (h[2]! << 16) | (h[3]! << 24)) >>> 0);
    expect(st.draws).toBe(0n); expect(st.lastMixedTick).toBe(-1); expect(st.epoch).toBe(1); expect(st.root).toBe('PUBLIC');
  });
  it('mixEntropy: XOR words 0..3 and keyHash, then discard 4 outputs; sets lastMixedTick; all-zero state gets s[0] = 0x9E3779B9', () => {
    const st = seedStream('mkt.idio:ast_A', 'PUBLIC', roots.publicRoot(1), 1), w = words(7), s = st.s.slice();
    for (let i = 0; i < 4; i++) s[i] = (s[i]! ^ w[i]! ^ st.keyHash[i]!) >>> 0;
    for (let i = 0; i < 4; i++) xoNext(s);
    mixEntropy(st, 7, w);
    expect(Array.from(st.s)).toEqual(Array.from(s)); expect(st.lastMixedTick).toBe(7); expect(st.draws).toBe(0n);
    const z = seedStream('k', 'PUBLIC', roots.publicRoot(1), 1);
    const kill = Uint32Array.from([z.s[0]! ^ z.keyHash[0]!, z.s[1]! ^ z.keyHash[1]!, z.s[2]! ^ z.keyHash[2]!, z.s[3]! ^ z.keyHash[3]!]);
    mixEntropy(z, 1, kill);
    const e = Uint32Array.from([0x9e3779b9, 0, 0, 0]); for (let i = 0; i < 4; i++) xoNext(e);
    expect(Array.from(z.s)).toEqual(Array.from(e));
  });
});

describe('02#18 creating a new RNG stream for a new asset does not change any draw of any existing stream', () => {
  it('1,000 ticks: ast_A draws identical with and without an interleaved ast_NEW stream', () => {
    const a = new RngManager(roots), b = new RngManager(roots);
    for (let t = 0; t < 1000; t++) {
      a.beginTick(t, 1, words(t)); b.beginTick(t, 1, words(t));
      const xa = a.stream('05', MKT, 'mkt.idio:ast_A').next();
      b.stream('05', MKT, 'mkt.idio:ast_NEW').next();
      const xb = b.stream('05', MKT, 'mkt.idio:ast_A').next();
      b.stream('05', MKT, 'mkt.idio:ast_NEW').u53();
      expect(xb).toBe(xa);
    }
  });
});

describe('T02-06 manager', () => {
  it('02 §8 edge 8: unused for 50 ticks, then drawn = state after last use + mix of the current tick (no mixing while unused)', () => {
    const m = new RngManager(roots);
    m.beginTick(10, 1, words(10)); m.stream('05', MKT, 'mkt.idio:ast_A').next();
    const after = m.state().get('mkt.idio:ast_A')!, copy = { ...after, s: after.s.slice(), keyHash: after.keyHash.slice() };
    for (let t = 11; t <= 60; t++) { m.beginTick(t, 1, words(t)); m.stream('05', MKT, 'mkt.idio:ast_A'); }   // handle taken, never drawn
    expect(Array.from(m.state().get('mkt.idio:ast_A')!.s)).toEqual(Array.from(copy.s));
    m.beginTick(61, 1, words(61));
    const got = m.stream('05', MKT, 'mkt.idio:ast_A').next();
    mixEntropy(copy, 61, words(61));
    expect(got).toBe(xoNext(copy.s));
  });
  it('lazy mixing happens once per tick on the first draw', () => {
    const m = new RngManager(roots); m.beginTick(5, 1, words(5));
    const r = m.stream('05', MKT, 'mkt.idio:ast_A'), x = [r.next(), r.next(), r.next()];
    const st = seedStream('mkt.idio:ast_A', 'PUBLIC', roots.publicRoot(1), 1); mixEntropy(st, 5, words(5));
    expect(x).toEqual([xoNext(st.s), xoNext(st.s), xoNext(st.s)]);
  });
  it('epoch change re-seeds: first draws of epoch 2 = seedStream(epoch 2) + mix, independent of epoch-1 history', () => {
    const run = (n1: number): number[] => {
      const m = new RngManager(roots);
      for (let t = 0; t < 3; t++) { m.beginTick(t, 1, words(t)); const r = m.stream('05', MKT, 'mkt.idio:ast_A'); for (let i = 0; i < n1; i++) r.next(); }
      m.beginTick(3, 2, words(3)); const r = m.stream('05', MKT, 'mkt.idio:ast_A');
      return [r.next(), r.next()];
    };
    const st = seedStream('mkt.idio:ast_A', 'PUBLIC', roots.publicRoot(2), 2); mixEntropy(st, 3, words(3));
    const exp = [xoNext(st.s), xoNext(st.s)];
    expect(run(1)).toEqual(exp); expect(run(17)).toEqual(exp);
  });
  it('SECRET streams use secretEpochRoot(epoch), PUBLIC streams publicRoot(epoch)', () => {
    const m = new RngManager(roots); m.beginTick(0, 3, words(0));
    const x = m.stream('04', ['macro.gapest'], 'macro.gapest:EUN').next();
    const st = seedStream('macro.gapest:EUN', 'SECRET', roots.secretEpochRoot(3), 3); mixEntropy(st, 0, words(0));
    expect(x).toBe(xoNext(st.s)); expect(m.state().get('macro.gapest:EUN')!.root).toBe('SECRET');
  });
  it('foreign and unregistered keys fault; sim.bot:x is rejected for live modules', () => {
    const m = new RngManager(roots); m.beginTick(0, 1, words(0));
    expect(thrown(() => m.stream('05', MKT, 'mkt.foo:x'))).toBe('I0.rng_unregistered');
    expect(thrown(() => m.stream('05', MKT, 'mkt.idio:a/b'))).toBe('I0.rng_unregistered');   // '/' outside the segment charset
    expect(thrown(() => m.stream('05', MKT, 'mkt.idio'))).toBe('I0.rng_unregistered');       // no partial match
    expect(thrown(() => m.stream('05', MKT, 'macro.shock:EUN'))).toBe('I0.rng_foreign');     // 04's stream
    expect(thrown(() => m.stream('05', ['mkt.idio'], 'mkt.jump:ast_A'))).toBe('I0.rng_foreign');  // not declared by the caller
    expect(thrown(() => m.stream('05', ['macro.shock'], 'macro.shock:EUN'))).toBe('I0.rng_foreign');  // declared, but 04 owns it
    expect(thrown(() => m.stream('20', ['sim.bot'], 'sim.bot:x'))).toBe('I0.rng_unregistered');
    expect(thrown(() => m.stream('05', ['sim.bot'], 'sim.bot:x'))).toBe('I0.rng_unregistered');
    expect(thrown(() => new RngManager(roots).stream('05', MKT, 'mkt.idio:a'))).toBe('I0.rng_no_tick');
  });
  it('ledger: this tick only, sorted by key; draws counter is lifetime; discarded outputs are not draws', () => {
    const m = new RngManager(roots); m.beginTick(0, 1, words(0));
    m.stream('05', MKT, 'mkt.jump:b').normal(); m.stream('05', MKT, 'mkt.idio:z').next(); m.stream('05', MKT, 'mkt.idio:a').u53();
    expect(m.ledger()).toEqual([{ key: 'mkt.idio:a', draws: 2 }, { key: 'mkt.idio:z', draws: 1 }, { key: 'mkt.jump:b', draws: 2 }]);
    m.beginTick(1, 1, words(1)); expect(m.ledger()).toEqual([]);
    m.stream('05', MKT, 'mkt.idio:a').next();
    expect(m.ledger()).toEqual([{ key: 'mkt.idio:a', draws: 1 }]); expect(m.drawsBigint('mkt.idio:a')).toBe(3n); expect(m.drawsBigint('none')).toBe(0n);
    m.beginTick(2, 2, words(2)); expect(m.drawsBigint('mkt.idio:a')).toBe(3n);   // survives the epoch re-seed
  });
  it('checkpoint / restore rolls back states and counters exactly', () => {
    const m = new RngManager(roots); m.beginTick(0, 1, words(0)); m.stream('05', MKT, 'mkt.idio:a').next();
    const c = m.checkpoint();
    const r = m.stream('05', MKT, 'mkt.idio:a'), x = [r.next(), r.next()]; m.stream('05', MKT, 'mkt.idio:b').next();
    m.restore(c);
    expect(m.ledger()).toEqual([{ key: 'mkt.idio:a', draws: 1 }]); expect(m.state().has('mkt.idio:b')).toBe(false);
    const r2 = m.stream('05', MKT, 'mkt.idio:a'); expect([r2.next(), r2.next()]).toEqual(x);
  });
  it('state persists: a manager rebuilt from state() continues the same sequence', () => {
    const a = new RngManager(roots); a.beginTick(0, 1, words(0)); a.stream('05', MKT, 'mkt.idio:a').next();
    const snap = new SortedMap<string, RngStreamState>();   // deep copy, as a snapshot round-trip would produce
    for (const [k, v] of a.state()) snap.set(k, { ...v, s: v.s.slice(), keyHash: v.keyHash.slice() });
    const b = new RngManager(roots, snap);
    a.beginTick(1, 1, words(1)); b.beginTick(1, 1, words(1));
    expect(b.stream('05', MKT, 'mkt.idio:a').next()).toBe(a.stream('05', MKT, 'mkt.idio:a').next());
  });
});

describe('T02-06 registry (02 §3.10.4)', () => {
  it('row count = the 02 §3.10.4 table + E-63 macro.nowcast (80 live rows + sim.bot = 81); unique patterns', () => {
    expect(STREAM_REGISTRY.length).toBe(81);
    expect(STREAM_REGISTRY.filter((s) => s.root === 'HARNESS').map((s) => s.pattern)).toEqual(['sim.bot:<botId>']);
    expect(new Set(STREAM_REGISTRY.map((s) => s.pattern)).size).toBe(81);
    expect(matchStream('macro.fx:EUN:FDL')!.pattern).toBe('macro.fx:<base>:<quote>'); expect(matchStream('macro.fx:EUN/FDL')).toBeUndefined(); expect(matchStream('macro.fx:EUN')).toBeUndefined();
    expect(matchStream('macro.nowcast:chr_1:rel_2')).toMatchObject({ module: '04', root: 'SECRET' });
  });
  it('matchStream / streamPrefix', () => {
    expect(matchStream('mkt.idio:ast_A')!.module).toBe('05');
    expect(streamPrefix(matchStream('mkt.idio:ast_A')!)).toBe('mkt.idio');
    expect(matchStream('ins.cat:flood:rgn-1.a')!.pattern).toBe('ins.cat:<peril>:<regionId>');
    expect(matchStream('macro.global_regime')!.root).toBe('PUBLIC');
    expect(matchStream('macro.gapest:EUN')!.root).toBe('SECRET');
    expect(matchStream('macro.global_regime:x')).toBeUndefined();
    expect(matchStream('ins.cat:flood')).toBeUndefined();
    expect(matchStream('xmkt.idio:a')).toBeUndefined();
    expect(matchStream('mkt.idio:')).toBeUndefined();
    expect(matchStream('mktXidio:a')).toBeUndefined();   // '.' is literal
  });
});

describe('T02-06 INV-ENG-002', () => {
  const ctx = (ledger: unknown, deltas: unknown): InvariantCtx => ({
    tick: 1, worldSeedPublicSalt: new Uint8Array(), pre: { get: () => undefined },
    facts: (k) => (k === FACT_RNG_LEDGER ? [ledger] : k === FACT_RNG_DELTAS ? [deltas] : []),
  });
  it('def: TICK, FATAL', () => { expect(INV_ENG_002.def).toMatchObject({ id: 'INV-ENG-002', scope: 'TICK', severity: 'FATAL' }); });
  it('passes when every counter advanced exactly by the ledger draws', () => {
    const m = new RngManager(roots); m.beginTick(0, 1, words(0));
    const before = m.drawsBigint('mkt.idio:a'); m.stream('05', MKT, 'mkt.idio:a').normal();
    expect(INV_ENG_002.check(ctx(m.ledger(), [{ key: 'mkt.idio:a', before, after: m.drawsBigint('mkt.idio:a') }]))).toEqual({ ok: true });
  });
  it('negative: counter delta 5 but ledger 4 -> fails', () => {
    const r = INV_ENG_002.check(ctx([{ key: 'mkt.idio:a', draws: 4 }], [{ key: 'mkt.idio:a', before: 10n, after: 15n }]));
    expect(r.ok).toBe(false); if (!r.ok) expect(r.entityIds).toEqual(['mkt.idio:a']);
  });
  it('negative: unregistered key in the ledger; harness key; ledger row with no counter delta; delta with no ledger row', () => {
    expect(INV_ENG_002.check(ctx([{ key: 'mkt.foo:x', draws: 1 }], [{ key: 'mkt.foo:x', before: 0n, after: 1n }])).ok).toBe(false);
    expect(INV_ENG_002.check(ctx([{ key: 'sim.bot:x', draws: 1 }], [{ key: 'sim.bot:x', before: 0n, after: 1n }])).ok).toBe(false);
    expect(INV_ENG_002.check(ctx([{ key: 'mkt.idio:a', draws: 2 }], [])).ok).toBe(false);
    expect(INV_ENG_002.check(ctx([], [{ key: 'mkt.idio:a', before: 0n, after: 1n }])).ok).toBe(false);
  });
});

describe('AC-02-06-FAULTS: every I0.rng_* fault code (the full set raised by rng/*.ts)', () => {
  it('nine codes, each raised by its own guard', () => {
    const m = new RngManager(roots); m.beginTick(0, 1, words(0));
    const r = m.stream('05', MKT, 'mkt.idio:f');
    const got: Record<string, string | null> = {
      'I0.rng_unregistered': thrown(() => m.stream('05', MKT, 'mkt.foo:x')),
      'I0.rng_foreign': thrown(() => m.stream('05', MKT, 'macro.shock:EUN')),
      'I0.rng_no_tick': thrown(() => new RngManager(roots).stream('05', MKT, 'mkt.idio:f')),
      'I0.rng_entropy': thrown(() => m.beginTick(1, 1, new Uint32Array(3))),
      'I0.rng_int': thrown(() => r.int(0)),
      'I0.rng_student_t': thrown(() => r.studentT(9)),
      'I0.rng_exponential': thrown(() => r.exponential(0)),
      'I0.rng_poisson': thrown(() => r.poisson(31)),
      'I0.rng_categorical': thrown(() => r.categorical([['b', 1], ['a', 1]])),
    };
    for (const [code, v] of Object.entries(got)) expect(v).toBe(code);
    expect(Object.keys(got).length).toBe(9);
    // the code list is exactly the set used in the sources
    const dir = dirname(fileURLToPath(import.meta.url)), used: string[] = [];
    for (const f of readdirSync(dir).sort()) if (f.endsWith('.ts') && !f.endsWith('.test.ts')) for (const c of readFileSync(join(dir, f), 'utf8').match(/I0\.rng_[a-z_]+/g) ?? []) if (!used.includes(c)) used.push(c);
    expect(used.sort()).toEqual(Object.keys(got).sort());
  });
});

describe('E-63.5: macro.nowcast root class is S (SECRET)', () => {
  it('nowcast keys resolve to the SECRET root', () => {
    expect(STREAM_REGISTRY.find((s) => s.pattern === 'macro.nowcast:<chrId>:<releaseId>')?.root).toBe('SECRET');
    expect(matchStream('macro.nowcast:chr_7:rel_3')?.root).toBe('SECRET');
  });
});
