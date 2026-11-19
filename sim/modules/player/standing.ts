// How well off the player is, as a multiple used to scale what the city charges for a night, a course or a table.
// A newcomer on a single wage pays the plain price; someone with a lot of money is shown the dearer room.
// A leaf file: it imports only types and the deposit name.
import type { World } from '../../kernel/index.ts';
import { DEP, type EconState } from '../economy/index.ts';

const econ = (w: World): EconState => w.state.economy as EconState;

/** Cash in days of the city's wage. 60 days (about $5,000 at the opening wage) is the plain-price footing. */
export function wageDays(w: World, person: number): number {
  const s = econ(w);
  if (person < 0 || person >= s.P.n) return 0;
  return w.ledger.balS(s.P.slot[person], DEP) / Math.max(1, s.wage);
}

/** 0.6 for someone with next to nothing, 1.0 for a newcomer's savings, up to 2.5 for the very rich. */
export function standingMult(w: World, person: number): number {
  const days = Math.max(0, wageDays(w, person));
  return Math.max(0.6, Math.min(2.5, 0.6 + 0.4 * Math.log2(1 + days / 60) * 1.0 + 0.0));
}

/** 0 for most people, 1 above about 20 days of wages in the bank, 2 above 80, 3 above 400. Invitations come from your own tier or below. */
export function tierOf(w: World, person: number): number {
  const d = wageDays(w, person);
  return d >= 400 ? 3 : d >= 80 ? 2 : d >= 20 ? 1 : 0;
}
