import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fnv1a32, fromHex, hmacSha256, sha256, sha256Concat, toHex, u32be, u48be, u64be, utf8 } from '../index';

const sha = (s: string) => toHex(sha256(utf8(s)));
describe('crypto (T02-01)', () => {
  it('SHA-256 FIPS 180-4 vectors', () => {
    expect(sha('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it.runIf(process.env.NIGHTLY)('NIGHTLY: SHA-256 of one million "a"', () => {
    expect(toHex(sha256(new Uint8Array(1_000_000).fill(0x61)))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
  it('SHA-256 agrees with node:crypto on lengths 0..200 (padding boundaries)', () => {
    for (let n = 0; n <= 200; n++) { const b = new Uint8Array(n).map((_, i) => (i * 31 + n) & 255); expect(toHex(sha256(b))).toBe(createHash('sha256').update(b).digest('hex')); }
    expect(toHex(sha256Concat('ab', Uint8Array.of(0x63)))).toBe(sha('abc'));
  });
  it('HMAC-SHA-256 RFC 4231 test cases 1 and 2', () => {
    expect(toHex(hmacSha256(new Uint8Array(20).fill(0x0b), utf8('Hi There')))).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    expect(toHex(hmacSha256(utf8('Jefe'), utf8('what do ya want for nothing?')))).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    const long = new Uint8Array(131).fill(0xaa);
    expect(toHex(hmacSha256(long, utf8('x')))).toBe(createHmac('sha256', long).update('x').digest('hex'));
  });
  it('fnv1a32 vectors', () => {
    expect(fnv1a32('')).toBe(2166136261);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
  it('hex round trip; utf8 matches Buffer; big-endian helpers', () => {
    const b = Uint8Array.of(0, 1, 127, 128, 255);
    expect(fromHex(toHex(b))).toEqual(b);
    expect(() => fromHex('abc')).toThrow();
    for (const s of ['', 'é', '€', '😀', 'a\u{10FFFF}']) expect(utf8(s)).toEqual(new Uint8Array(Buffer.from(s, 'utf8')));
    expect(toHex(u32be(0x01020304))).toBe('01020304');
    expect(toHex(u48be(541440))).toBe('000000084300');
    expect(toHex(u64be(2n ** 64n - 1n))).toBe('ffffffffffffffff');
  });
});
