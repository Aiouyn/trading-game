import { concatBytes, sha256 } from './sha256';

/** HMAC-SHA-256 per RFC 2104 (block size 64). */
export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const k = new Uint8Array(64); k.set(key.length > 64 ? sha256(key) : key);
  const ipad = k.map((b) => b ^ 0x36), opad = k.map((b) => b ^ 0x5c);
  return sha256(concatBytes([opad, sha256(concatBytes([ipad, msg]))]));
}
