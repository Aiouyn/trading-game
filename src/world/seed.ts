/**
 * A new world's seed: 16 hex characters from the platform's random source. The live world's seed is never a value in the
 * source (P5): the server stores the one it drew at first boot, and tests and end-to-end runs pass their own.
 */
export function freshWorldSeed(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
