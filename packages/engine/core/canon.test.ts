import { describe, expect, it } from 'vitest';
import { canonDecode, canonEncode, canonHash, sha256, SortedMap, toHex } from './index';

const hex = (v: unknown) => toHex(canonEncode(v));
describe('canonEncode / canonDecode (02 §3.16.2, T19A stand-in)', () => {
  it('map keys sorted by byte order regardless of insertion order; undefined fields omitted', () => {
    expect(hex({ b: 1, a: 2 })).toBe(hex({ a: 2, b: 1 }));
    expect(hex({ a: 1, x: undefined })).toBe(hex({ a: 1 }));
    expect(hex(new SortedMap([['b', 1], ['a', 2]]))).toBe(hex({ a: 2, b: 1 }));
  });
  it('integers use the smallest MessagePack int; floats stay 8-byte float64', () => {
    expect(hex(0)).toBe('00'); expect(hex(127)).toBe('7f'); expect(hex(128)).toBe('cc80'); expect(hex(-1)).toBe('ff');
    expect(hex(-33)).toBe('d0df'); expect(hex(65536)).toBe('ce00010000'); expect(hex(-0)).toBe('00');
    expect(hex(1.5)).toBe('cb3ff8000000000000');
  });
  it('bigint is ext type 1 (sign byte + big-endian magnitude)', () => {
    expect(hex(0n)).toBe('d40100'); expect(hex(255n)).toBe('d50100ff'); expect(hex(-1n)).toBe('d5010101');
  });
  it('round trip of nested values; NaN, Infinity, undefined in arrays and class instances are rejected', () => {
    const v = { s: 'é😀', n: [1, -200, 3.25, 10n ** 30n, -(10n ** 30n)], b: Uint8Array.of(1, 2), t: true, f: false, z: null, o: { k: 'v' } };
    expect(canonDecode(canonEncode(v))).toEqual(v);
    for (const bad of [NaN, Infinity, [undefined], new Date(0)]) expect(() => canonEncode(bad)).toThrow();
    expect(() => canonDecode(Uint8Array.of(0x92, 0x01))).toThrow(/truncated/);
  });
  it('canonHash = sha256(canonEncode(v))', () => {
    expect(toHex(canonHash({ a: 1 }))).toBe(toHex(sha256(canonEncode({ a: 1 }))));
  });
});
