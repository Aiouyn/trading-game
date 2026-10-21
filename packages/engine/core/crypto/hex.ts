import { EngineFault } from '../types';

/** UTF-8 encoder (pure; lone surrogates encode as U+FFFD). */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } else c = 0xfffd;
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

const HEX = '0123456789abcdef';
export function toHex(b: Uint8Array): string { let s = ''; for (const x of b) s += HEX[x >> 4]! + HEX[x & 15]!; return s; }
export function fromHex(h: string): Uint8Array {
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new EngineFault('I0.hex', `invalid hex: ${h}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

function beBytes(n: bigint, len: number, max: bigint): Uint8Array {
  if (n < 0n || n > max) throw new EngineFault('I0.uint_range', `${n} out of range for ${len}-byte uint`);
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}
function safeInt(n: number): bigint { if (!Number.isSafeInteger(n)) throw new EngineFault('I0.uint_range', `${n} is not a safe integer`); return BigInt(n); }
export function u32be(n: number): Uint8Array { return beBytes(safeInt(n), 4, 0xffffffffn); }
export function u48be(n: number): Uint8Array { return beBytes(safeInt(n), 6, 0xffffffffffffn); }
export function u64be(n: bigint): Uint8Array { return beBytes(n, 8, 0xffffffffffffffffn); }
