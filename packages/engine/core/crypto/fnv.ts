import { utf8 } from './hex';

/** FNV-1a 32-bit over the UTF-8 bytes of s. */
export function fnv1a32(s: string): number {
  let h = 2166136261;
  for (const b of utf8(s)) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h >>> 0;
}
