import { sha256, utf8, type RawIntent, type SealInput, type TickEntropy } from '../index';

export const raw = (o: Partial<RawIntent> & { intentId: string; actorId: string }): RawIntent => ({
  kind: 'mkt.order', payload: { q: 1 }, clientTick: 100, nonce: 1n, channel: 'UI', receivedSeq: 0, gatewayId: 'gw_1', signatureValid: true, partitionId: 'p0', ...o,
});
export const input = (rs: RawIntent[], last: Record<string, bigint> = {}, tick = 100): SealInput => ({
  tick, raw: rs, nonces: { last: (a) => last[a] }, limits: { maxAgeTicks: 3, perActor: 20, perPrincipal: 100 },
  knownKinds: (k) => k !== 'nope.kind', schemaOk: () => true,
});
export const entropy = (s = 'e'): TickEntropy => ({ tick: 100, value: sha256(utf8(s)), words: new Uint32Array(8) });
/** deterministic shuffle for tests */
export function shuffle<T>(a: readonly T[], seed: number): T[] {
  const r = [...a]; let x = seed >>> 0;
  for (let i = r.length - 1; i > 0; i--) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; const j = x % (i + 1); [r[i], r[j]] = [r[j]!, r[i]!]; }
  return r;
}
