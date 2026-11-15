// Cash in the bank. No trades. Spare cash sits in a time deposit; wages stay liquid.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { BUFFER, live } from './lib.ts';

export const name = 'nothing';

export function bot(v: PlayerView, _w: World): Command[] {
  if (!live(v)) return [];
  const excess = v.cash - BUFFER;
  if (excess < 50_000) return [];
  return [{ kind: 'cash', op: 'deposit', cents: excess }];
}
