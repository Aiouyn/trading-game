// T04-08 internal helper shared by reserves.ts (IOR) and facilities.ts (deposit facility): the signed cbk ↔ bank interest posting.
import type { Money, PhaseCtx, StoreRead } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import type { MacroPorts } from '../ports';
import type { BlocId } from '../schema';

/** Player-economy bank: the owner-group chain ends at a chr (03 perimeter PLAYER). */
export function isPlayerBank(s: StoreRead, ports: MacroPorts, bankId: string): boolean { return ports.players.ownerGroupOf(s, bankId).startsWith('chr_'); }

/** Signed amount between the cbk and a bank: + pays the bank (P mint / W pay), − charges it (P burn / W pay to the cbk). */
export function postCbInterest(ctx: PhaseCtx, b: BlocId, bankId: string, player: boolean, amt: Money, pos: string): void {
  if (amt === 0n) return;
  const L = ctx.ledger, cbk = cbkId(b);
  if (amt > 0n) { if (player) L.mint(bankId, amt, b, `${pos}_P`); else L.pay(cbk, bankId, amt, b, `${pos}_W`); return; }
  if (player) L.burn(bankId, -amt, b, 'CBK_NEGATIVE_RATE_CHARGE_P'); else L.pay(bankId, cbk, -amt, b, 'CBK_NEGATIVE_RATE_CHARGE_W');
}

