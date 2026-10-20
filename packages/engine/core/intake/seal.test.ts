import { describe, expect, it } from 'vitest';
import { assembleTickBatch, checkEnvelopes, type RawIntent } from '../index';
import { input, raw, shuffle } from './fixture';

const codes = (rs: RawIntent[], last: Record<string, bigint> = {}, tick = 100) =>
  Object.fromEntries(checkEnvelopes(input(rs, last, tick)).rejected.map((r) => [r.intentId, r.code]));

describe('envelope checks (T02-08)', () => {
  it('02#24 the 21st intent of a character in one tick is rejected REJECT_RATE_LIMIT; the first 20 (lowest nonces) are processed', () => {
    const own = shuffle(Array.from({ length: 21 }, (_, i) => raw({ intentId: `int_${i + 1}`, actorId: 'chr_C', nonce: BigInt(i + 1), channel: i % 2 ? 'API' : 'UI' })), 3);
    const o = checkEnvelopes(input(own));
    expect(o.rejected).toEqual([{ intentId: 'int_21', actorId: 'chr_C', code: 'REJECT_RATE_LIMIT', module: '02' }]);
    expect(o.accepted.length).toBe(20);
    // R07: an operator acting for the same character with 20 more is accepted (40 total)
    const op = (a: string, n: number) => Array.from({ length: n }, (_, i) => raw({ intentId: `int_${a}_${i}`, actorId: a, onBehalfOf: 'chr_C', mandateId: 'mdt_1', nonce: BigInt(i + 1), channel: 'AI' }));
    expect(checkEnvelopes(input([...own.filter((r) => r.intentId !== 'int_21'), ...op('ali_op1', 20)])).accepted.length).toBe(40);
    // five operators × 20 + own 20 = 120 -> 20 rejected (the last operator's), total kept 100
    const all = [...own.filter((r) => r.intentId !== 'int_21'), ...['ali_op1', 'ali_op2', 'ali_op3', 'ali_op4', 'ali_op5'].flatMap((a) => op(a, 20))];
    const r = checkEnvelopes(input(all));
    expect(r.accepted.length).toBe(100);
    expect(r.rejected.length).toBe(20);
    expect(r.rejected.every((x) => x.actorId === 'ali_op5' && x.code === 'REJECT_RATE_LIMIT')).toBe(true);
  });
  it('02#25 nonce not greater than the last sealed nonce -> REJECT_REPLAY; clientTick < N − 3 -> REJECT_STALE', () => {
    expect(codes([raw({ intentId: 'int_a', actorId: 'chr_A', nonce: 10n }), raw({ intentId: 'int_b', actorId: 'chr_B', nonce: 11n })], { chr_A: 10n, chr_B: 10n }))
      .toEqual({ int_a: 'REJECT_REPLAY' });
    expect(codes([raw({ intentId: 'int_a', actorId: 'chr_A', clientTick: 96 }), raw({ intentId: 'int_b', actorId: 'chr_B', clientTick: 97 })]))
      .toEqual({ int_a: 'REJECT_STALE' });
    const o = checkEnvelopes(input([raw({ intentId: 'int_b', actorId: 'chr_B', nonce: 11n })], { chr_B: 10n }));
    expect(o.nextNonces.get('chr_B')).toBe(11n);
  });
  it('duplicate intentId -> second REJECT_REPLAY; duplicate nonce -> REPLAY; bad signature; unknown kind; NPC without nonce is sealed and not limited', () => {
    expect(codes([raw({ intentId: 'int_a', actorId: 'chr_A', nonce: 1n }), raw({ intentId: 'int_a', actorId: 'chr_A', nonce: 2n })])).toEqual({ int_a: 'REJECT_REPLAY' });
    expect(codes([raw({ intentId: 'int_a', actorId: 'chr_A', nonce: 3n }), raw({ intentId: 'int_b', actorId: 'chr_A', nonce: 3n })])).toEqual({ int_b: 'REJECT_REPLAY' });
    expect(codes([raw({ intentId: 'int_s', actorId: 'chr_A', signatureValid: false })])).toEqual({ int_s: 'REJECT_SIGNATURE' });
    expect(codes([raw({ intentId: 'int_k', actorId: 'chr_A', kind: 'nope.kind' })])).toEqual({ int_k: 'REJECT_SCHEMA' });
    const npc = Array.from({ length: 30 }, (_, i) => raw({ intentId: `int_n${i}`, actorId: 'npc_S', nonce: 0n, channel: 'NPC', signatureValid: false }));
    expect(checkEnvelopes(input(npc)).accepted.length).toBe(30);
  });
  it('assembleTickBatch: a batch closed at sealedAtMs + 151 with grace 150 is rolled whole to N+1 and its gateway listed late', () => {
    const b = (g: string, closedAtMs: number) => ({ gatewayId: g, forTick: 100, closedAtMs, intents: [raw({ intentId: `int_${g}`, actorId: 'chr_A' })] });
    const r = assembleTickBatch(100, [b('gw_late', 1151), b('gw_ok', 1150)], 1000, 150);
    expect(r.intake.map((i) => i.intentId)).toEqual(['int_gw_ok']);
    expect(r.rolledToNext.map((x) => x.gatewayId)).toEqual(['gw_late']);
    expect(r.lateGateways).toEqual(['gw_late']);
  });
});
