import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkEnvelopes, cmpStr, orderKeyOf, sealTick, sha256, toHandlerIntent, toHex, utf8 } from '../index';
import { entropy, input, raw, shuffle } from './fixture';

describe('fair order (T02-08)', () => {
  it('02#22 with 1,000 intents from distinct actors in one tick, the processing order equals ascending orderKey, and changing gateway receipt order does not change the outcome hash', () => {
    const rs = Array.from({ length: 1000 }, (_, i) => raw({ intentId: `int_${i}`, actorId: `chr_${i}`, receivedSeq: i, gatewayId: `gw_${i % 3}` }));
    const run = (x: typeof rs) => { const o = checkEnvelopes(input(x)); return { o, sealed: sealTick(o.accepted, 100, entropy()) }; };
    const base = run(rs);
    expect(base.sealed.length).toBe(1000);
    for (let i = 1; i < 1000; i++) expect(cmpStr(base.sealed[i - 1]!.orderKey, base.sealed[i]!.orderKey)).toBe(-1);
    for (let s = 1; s <= 20; s++) {
      const perm = shuffle(rs, s).map((r, i) => ({ ...r, receivedSeq: 999 - i, gatewayId: `gw_${(i + s) % 5}` }));
      const p = run(perm);
      expect(p.sealed.map((x) => x.intentId)).toEqual(base.sealed.map((x) => x.intentId));
      expect(toHex(p.o.intentsRoot)).toBe(toHex(base.o.intentsRoot));
    }
  });
  it('02#23 one actor submitting 3 intents in a tick has them processed consecutively in nonce order', () => {
    const others = Array.from({ length: 50 }, (_, i) => raw({ intentId: `int_o${i}`, actorId: `chr_o${i}` }));
    const x = [7n, 5n, 6n].map((n) => raw({ intentId: `int_x${n}`, actorId: 'chr_X', nonce: n }));
    const sealed = sealTick(checkEnvelopes(input([...others, ...x])).accepted, 100, entropy());
    const at = sealed.findIndex((s) => s.actorId === 'chr_X');
    expect(sealed.slice(at, at + 3).map((s) => s.nonce)).toEqual([5n, 6n, 7n]);
    const minKey = x.map((r) => orderKeyOf(entropy().value, r.intentId)).sort(cmpStr)[0]!;
    const before = sealed.slice(0, at).filter((s) => s.actorId !== 'chr_X');
    expect(before.every((s) => cmpStr(s.orderKey, minKey) < 0)).toBe(true);
    expect(sealed.slice(at + 3).every((s) => cmpStr(s.orderKey, minKey) > 0)).toBe(true);
  });
  it('worked example: orderKeyOf(sha256("e"), "int_1")', () => {
    const e = createHash('sha256').update('e').digest();
    expect(orderKeyOf(sha256(utf8('e')), 'int_1')).toBe(createHash('sha256').update(Buffer.concat([Buffer.from('TYC/order'), e, Buffer.from('int_1')])).digest('hex'));
  });
  it('toHandlerIntent keeps the G6 fields only', () => {
    const [s] = sealTick([raw({ intentId: 'int_1', actorId: 'chr_a', onBehalfOf: 'chr_b' })], 100, entropy());
    expect(Object.keys(toHandlerIntent(s!)).sort()).toEqual(['actorId', 'channel', 'intentId', 'kind', 'onBehalfOf', 'orderKey', 'payload', 'tick']);
  });
});
