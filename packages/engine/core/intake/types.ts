export type Channel = 'UI' | 'API' | 'AI' | 'MANAGER' | 'SYSTEM' | 'NPC' | 'ADMIN';
export interface RawIntent { intentId: string; actorId: string; onBehalfOf?: string; mandateId?: string; kind: string; payload: unknown;
  clientTick: number; nonce: bigint; channel: Channel; receivedSeq: number; gatewayId: string; signatureValid: boolean; partitionId: string }
export interface SealedIntentFull extends RawIntent { orderKey: string; tick: number }
export interface G6SealedIntent<P = unknown> { intentId: string; actorId: string; onBehalfOf?: string; mandateId?: string; kind: string; payload: P;
  channel: Channel; orderKey: string; tick: number }
export type EnvelopeRejectCode = 'REJECT_REPLAY' | 'REJECT_STALE' | 'REJECT_RATE_LIMIT' | 'REJECT_SCHEMA' | 'REJECT_SIGNATURE';
export interface EnvelopeReject { intentId: string; actorId: string; code: EnvelopeRejectCode; module: '02' }

/** SYSTEM / NPC / ADMIN intents skip nonce, signature and rate limits (02 §6.1, §3.5.4). */
export const isSystemChannel = (c: Channel): boolean => c === 'SYSTEM' || c === 'NPC' || c === 'ADMIN';

export function toHandlerIntent(s: SealedIntentFull): G6SealedIntent {
  const h: G6SealedIntent = { intentId: s.intentId, actorId: s.actorId, kind: s.kind, payload: s.payload, channel: s.channel, orderKey: s.orderKey, tick: s.tick };
  if (s.onBehalfOf !== undefined) h.onBehalfOf = s.onBehalfOf;
  if (s.mandateId !== undefined) h.mandateId = s.mandateId;
  return h;
}
