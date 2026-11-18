// Who is a player seat. Seats act only through commands: no module may trade, bet or buy for them on its own.
import type { World } from './world.ts';

interface SeatState { who?: number; ids?: string[]; seat?: Record<string, { who?: number }> }

/** True when person `i` is the person behind any player seat. */
export function isSeatPerson(w: World, i: number): boolean {
  const p = w.state.player as SeatState | undefined;
  if (!p) return false;
  if (p.who === i) return true;
  if (p.seat) for (const id of p.ids ?? []) if (p.seat[id]?.who === i) return true;
  return false;
}

/** True when ledger actor `id` (`p_<n>`) is the person behind a player seat. */
export function isSeatActor(w: World, id: string): boolean {
  return id.startsWith('p_') && isSeatPerson(w, +id.slice(2));
}
