// A landlord would buy homes and let them. The player has no command for that, so this bot cannot act.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';

export const name = 'landlord';
export const missing = 'buy, sell or let property: the player has no property command';

export function bot(_v: PlayerView, _w: World): Command[] {
  return [];
}
