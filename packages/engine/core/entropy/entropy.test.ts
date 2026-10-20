import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveTickEntropy, EntropyBuffer, EntropyChangeRefused, fallbackEntropy, fromHex, harnessEpochRoots, localSeedEntropy, partyRollU, sha256, toHex, utf8, verifyReveal, type EntropySource } from '../index';

function fakeSource(seed: number): EntropySource {
  let n = seed; return { random32: () => sha256(utf8(`fake-${n++}`)) };
}
const mk = (state?: unknown) => new EntropyBuffer({ worldId: 'w1', epochTicks: 720, revealLagTicks: 1000, source: fakeSource(1), state });

describe('entropy buffer (T02-07, 24 R28)', () => {
  it('02#20 for a test world every C(N) published at tick N − 720 matches SHA-256(e(N)) revealed at N + 1,000 for all N in a 10,000-tick run', () => {
    const b = mk(); const revealedAt: Record<number, { tick: number; secret: string }> = {};
    const eAt: Uint8Array[] = [];
    for (let t = 0; t < 10_000 + 2_440; t++) {
      b.ensureCommitted(t);
      if (t < 10_000) eAt[t] = b.eOf(t).value;
      for (const r of b.reveal(t)) revealedAt[r.epoch] = { tick: t, secret: r.secret };
    }
    const commits = b.commitments();
    for (let N = 0; N < 10_000; N++) {
      const e = b.epochOf(N); const c = commits.find((x) => x.epoch === e)!;
      if (N >= 1440) expect(c.publishedAtTick).toBeLessThanOrEqual(N - 720); else if (e < 2) expect(c.publishedAtTick).toBe(0);
      const r = revealedAt[e]!;
      expect(r.tick).toBeGreaterThanOrEqual(N + 1000);
      expect(verifyReveal(c, r.secret)).toBe(true);
      const t8 = Buffer.alloc(8); t8.writeBigUInt64BE(BigInt(N));
      expect(createHmac('sha256', Buffer.from(r.secret, 'hex')).update(Buffer.concat([Buffer.from('tick'), t8])).digest('hex')).toBe(toHex(eAt[N]!));
    }
  });
  it('02#21 changing e(N) after its commit is published is impossible through the coordinator API (the API refuses; test asserts the error)', () => {
    const b = mk(); b.ensureCommitted(0);
    const refuse = (x: EntropyBuffer, e: number) => { try { x.setSecret(e, new Uint8Array(32)); } catch (err) { return (err as EntropyChangeRefused).code; } return 'none'; };
    expect(refuse(b, 1)).toBe('ENT_ALREADY_COMMITTED');
    expect(refuse(b, 99)).toBe('ENT_UNKNOWN_EPOCH');
    const restored = mk(b.state());
    expect(refuse(restored, 1)).toBe('ENT_ALREADY_COMMITTED');
    expect(toHex(restored.eOf(5).value)).toBe(toHex(b.eOf(5).value));
    expect(Object.getOwnPropertyNames(EntropyBuffer.prototype).filter((m) => /secret/i.test(m))).toEqual(['setSecret']);
  });
  it('fallback path: eOf on an epoch with no secret returns fallback true', () => {
    expect(mk().eOf(5).fallback).toBe(true);
    expect(toHex(fallbackEntropy(Uint8Array.of(1)))).toBe(createHash('sha256').update(Buffer.concat([Buffer.from('TYC/fallback'), Buffer.of(1)])).digest('hex'));
  });
});

describe('tick entropy, roots, party roll (T02-07)', () => {
  it('deriveTickEntropy changes when any input byte changes; words are the 8 BE uint32 of value', () => {
    const z = new Uint8Array(32); const base = deriveTickEntropy('w', 5, z, z, z);
    for (const i of [0, 1, 2]) {
      const args: Uint8Array[] = [z, z, z]; const m = new Uint8Array(32); m[31] = 1; args[i] = m;
      expect(toHex(deriveTickEntropy('w', 5, args[0]!, args[1]!, args[2]!).value)).not.toBe(toHex(base.value));
    }
    expect(base.words[0]).toBe(new DataView(base.value.buffer).getUint32(0));
    expect(toHex(localSeedEntropy(z, 1))).not.toBe(toHex(localSeedEntropy(z, 2)));
  });
  it('harnessEpochRoots: deterministic from the local seed; public root of epoch k−2 revealable', () => {
    const r = harnessEpochRoots(utf8('seed'));
    expect(toHex(r.publicRoot(3))).toBe(toHex(harnessEpochRoots(utf8('seed')).publicRoot(3)));
    expect(r.revealablePublicRoot(1)).toBeUndefined();
    expect(r.revealablePublicRoot(4)).toEqual({ epoch: 2, root: toHex(r.publicRoot(2)) });
    expect(r.publicRootCommit(2)).toBe(toHex(sha256(r.publicRoot(2))));
    expect(toHex(r.secretEpochRoot(1))).not.toBe(toHex(r.secretEpochRoot(2)));
  });
  it('partyRollU deterministic, independent of subject id order, in [0,1)', () => {
    const e = fromHex('ab'.repeat(32));
    const u = partyRollU(e, 'ops.raid', ['chr_b', 'chr_a'], 0);
    expect(partyRollU(e, 'ops.raid', ['chr_a', 'chr_b'], 0)).toBe(u);
    expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThan(1);
    expect(partyRollU(e, 'ops.raid', ['chr_a', 'chr_b'], 1)).not.toBe(u);
  });
});
