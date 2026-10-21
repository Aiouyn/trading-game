// Canonical encoder of 02 §3.16.2 (deterministic MessagePack variant).
// SPEC GAP: the card re-exports canonEncode/canonDecode from '@tycoon/protocol' (T19A), which does not exist yet;
// the encoder lives here until T19A lands, then this file becomes the re-export the card names.
import { sha256 } from './crypto/sha256';
import { utf8 } from './crypto/hex';
import { SortedMap } from './sorted';
import { EngineFault } from './types';

function cmpBytes(a: Uint8Array, b: Uint8Array): number {
  const n = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

function fault(msg: string): never { throw new EngineFault('I0.canon', msg); }

class Out {
  private buf: number[] = [];
  byte(...b: number[]): void { for (const x of b) this.buf.push(x & 255); }
  be(n: number, len: number): void { for (let i = len - 1; i >= 0; i--) this.buf.push(Number((BigInt(n) >> BigInt(8 * i)) & 0xffn)); }
  bytes(b: Uint8Array): void { for (const x of b) this.buf.push(x); }
  done(): Uint8Array { return Uint8Array.from(this.buf); }
}

function lenHeader(o: Out, n: number, fix: number | null, fixMax: number, c8: number | null, c16: number, c32: number): void {
  if (fix !== null && n <= fixMax) o.byte(fix | n);
  else if (c8 !== null && n < 0x100) o.byte(c8, n);
  else if (n < 0x10000) { o.byte(c16); o.be(n, 2); } else { o.byte(c32); o.be(n, 4); }
}

function encInt(o: Out, n: number): void {
  if (n >= 0) {
    if (n < 0x80) o.byte(n);
    else if (n < 0x100) o.byte(0xcc, n);
    else if (n < 0x10000) { o.byte(0xcd); o.be(n, 2); }
    else if (n < 0x100000000) { o.byte(0xce); o.be(n, 4); }
    else { o.byte(0xcf); o.be(n, 8); }
  } else {
    if (n >= -32) o.byte(0xe0 | (n + 32));
    else if (n >= -0x80) o.byte(0xd0, n);
    else if (n >= -0x8000) { o.byte(0xd1); o.be(n & 0xffff, 2); }
    else if (n >= -0x80000000) { o.byte(0xd2); o.be(n >>> 0, 4); }
    else { o.byte(0xd3); const u = BigInt.asUintN(64, BigInt(n)); for (let i = 7; i >= 0; i--) o.byte(Number((u >> BigInt(8 * i)) & 0xffn)); }
  }
}

function encBigint(o: Out, v: bigint): void {
  let m = v < 0n ? -v : v; const mag: number[] = [];
  while (m > 0n) { mag.unshift(Number(m & 0xffn)); m >>= 8n; }
  const data = [v < 0n ? 1 : 0, ...mag], n = data.length;
  const fixext: Record<number, number> = { 1: 0xd4, 2: 0xd5, 4: 0xd6, 8: 0xd7, 16: 0xd8 };
  if (fixext[n] !== undefined) o.byte(fixext[n]!);
  else if (n < 0x100) o.byte(0xc7, n);
  else if (n < 0x10000) { o.byte(0xc8); o.be(n, 2); } else { o.byte(0xc9); o.be(n, 4); }
  o.byte(1, ...data);
}

function encMap(o: Out, pairs: [Uint8Array, unknown][]): void {
  pairs.sort((a, b) => cmpBytes(a[0], b[0]));
  for (let i = 1; i < pairs.length; i++) if (cmpBytes(pairs[i - 1]![0], pairs[i]![0]) === 0) fault('duplicate map key');
  lenHeader(o, pairs.length, 0x80, 15, null, 0xde, 0xdf);
  for (const [k, v] of pairs) { lenHeader(o, k.length, 0xa0, 31, 0xd9, 0xda, 0xdb); o.bytes(k); enc(o, v); }
}

function enc(o: Out, v: unknown): void {
  if (v === null) return o.byte(0xc0);
  if (v === false) return o.byte(0xc2);
  if (v === true) return o.byte(0xc3);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) fault('NaN/Infinity is not encodable');
    if (Number.isSafeInteger(v)) return encInt(o, v === 0 ? 0 : v);
    const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); o.byte(0xcb); return o.bytes(b);
  }
  if (typeof v === 'bigint') return encBigint(o, v);
  if (typeof v === 'string') { const b = utf8(v); lenHeader(o, b.length, 0xa0, 31, 0xd9, 0xda, 0xdb); return o.bytes(b); }
  if (v instanceof Uint8Array) { lenHeader(o, v.length, null, 0, 0xc4, 0xc5, 0xc6); return o.bytes(v); }
  if (Array.isArray(v)) {
    lenHeader(o, v.length, 0x90, 15, null, 0xdc, 0xdd);
    for (const x of v) { if (x === undefined) fault('undefined in array'); enc(o, x); }
    return;
  }
  if (v instanceof SortedMap) { const pairs: [Uint8Array, unknown][] = []; for (const [k, x] of v) if (x !== undefined) pairs.push([utf8(k), x]); return encMap(o, pairs); }
  if (typeof v === 'object' && v !== null && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
    const pairs: [Uint8Array, unknown][] = [];
    for (const k of Object.keys(v)) { const x = (v as Record<string, unknown>)[k]; if (x !== undefined) pairs.push([utf8(k), x]); }
    return encMap(o, pairs);
  }
  fault(`unsupported value of type ${typeof v}`);
}

export function canonEncode(v: unknown): Uint8Array { const o = new Out(); enc(o, v); return o.done(); }

function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length;) {
    const c = b[i]!; let cp: number, n: number;
    if (c < 0x80) { cp = c; n = 1; } else if (c < 0xe0) { cp = c & 31; n = 2; } else if (c < 0xf0) { cp = c & 15; n = 3; } else { cp = c & 7; n = 4; }
    for (let j = 1; j < n; j++) cp = (cp << 6) | (b[i + j]! & 63);
    i += n;
    if (cp >= 0x10000) { cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)); } else s += String.fromCharCode(cp);
  }
  return s;
}

/** Inverse of canonEncode: maps decode to plain objects, ext type 1 to bigint, bin to Uint8Array. */
export function canonDecode(b: Uint8Array): unknown {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let p = 0;
  const need = (n: number): void => { if (p + n > b.length) fault('truncated input'); };
  const uint = (n: number): number => { need(n); let x = 0; for (let i = 0; i < n; i++) x = x * 256 + b[p++]!; return x; };
  const bytes = (n: number): Uint8Array => { need(n); const r = b.slice(p, p + n); p += n; return r; };
  const str = (n: number): string => utf8Decode(bytes(n));
  const arr = (n: number): unknown[] => { const r: unknown[] = []; for (let i = 0; i < n; i++) r.push(dec()); return r; };
  const map = (n: number): Record<string, unknown> => {
    const r: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) { const k = dec(); if (typeof k !== 'string') fault('map key is not a string'); Object.defineProperty(r, k, { value: dec(), enumerable: true, writable: true, configurable: true }); }
    return r;
  };
  const ext = (n: number): bigint => {
    const t = uint(1); if (t !== 1) fault(`unknown ext type ${t}`);
    const d = bytes(n); if (d.length < 1) fault('empty bigint ext');
    let m = 0n; for (let i = 1; i < d.length; i++) m = (m << 8n) | BigInt(d[i]!);
    return d[0] === 1 ? -m : m;
  };
  function dec(): unknown {
    need(1); const c = b[p++]!;
    if (c < 0x80) return c;
    if (c >= 0xe0) return c - 256;
    if (c >= 0xa0 && c <= 0xbf) return str(c & 31);
    if (c >= 0x90 && c <= 0x9f) return arr(c & 15);
    if (c >= 0x80 && c <= 0x8f) return map(c & 15);
    switch (c) {
      case 0xc0: return null; case 0xc2: return false; case 0xc3: return true;
      case 0xc4: return bytes(uint(1)); case 0xc5: return bytes(uint(2)); case 0xc6: return bytes(uint(4));
      case 0xc7: return ext(uint(1)); case 0xc8: return ext(uint(2)); case 0xc9: return ext(uint(4));
      case 0xcb: { need(8); const x = dv.getFloat64(p); p += 8; return x; }
      case 0xcc: return uint(1); case 0xcd: return uint(2); case 0xce: return uint(4); case 0xcf: return uint(8);
      case 0xd0: { need(1); return dv.getInt8(p++); }
      case 0xd1: { need(2); const x = dv.getInt16(p); p += 2; return x; }
      case 0xd2: { need(4); const x = dv.getInt32(p); p += 4; return x; }
      case 0xd3: { need(8); const x = Number(dv.getBigInt64(p)); p += 8; return x; }
      case 0xd4: return ext(1); case 0xd5: return ext(2); case 0xd6: return ext(4); case 0xd7: return ext(8); case 0xd8: return ext(16);
      case 0xd9: return str(uint(1)); case 0xda: return str(uint(2)); case 0xdb: return str(uint(4));
      case 0xdc: return arr(uint(2)); case 0xdd: return arr(uint(4));
      case 0xde: return map(uint(2)); case 0xdf: return map(uint(4));
      default: return fault(`unsupported tag 0x${c.toString(16)}`);
    }
  }
  const v = dec(); if (p !== b.length) fault('trailing bytes'); return v;
}

/** sha256(canonEncode(v)) */
export function canonHash(v: unknown): Uint8Array { return sha256(canonEncode(v)); }
