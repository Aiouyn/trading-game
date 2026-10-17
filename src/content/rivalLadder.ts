/**
 * The rival ladder (R-10-7): fictional funds, six per rank band, so the Rivals board always has rivals near the player at any
 * rank. Every name is invented; no fund here is a real firm. A band's funds sit between its rank threshold and the next one
 * (`RANKS` in content/lifestyle.ts), so a player's neighbours on the board are funds of about their own size.
 */
import { RANKS } from './lifestyle';

/** Funds per rank band. */
export const LADDER_PER_BAND = 6;

/** The net worth floor of the first band (the first rank's threshold is zero). */
export const LADDER_FLOOR = 500;

/** The ceiling of the last band (the last rank has no next threshold). */
export const LADDER_CEILING = 500_000_000_000;

/** The fictional funds of each band, in ladder order (the lowest first). */
export const LADDER_NAMES: Record<string, readonly string[]> = {
  R0: ['Lantern Row Savings', 'Pebble Street Credit', 'Tallow Lane Thrift', 'Kettle Yard Capital', 'Marlow Corner Fund', 'Bramble Gate Pooling'],
  R1: ['Ostrava Quay Partners', 'Fennick Ridge Capital', 'Hollin Bay Holdings', 'Dunnock Field Fund', 'Sallow Reach Advisors', 'Corrin Mill Partners'],
  R2: ['Harbour Glass Capital', 'Whitmore Vale Fund', 'Ardent Cross Partners', 'Quarry Lantern Holdings', 'Sterling Fen Advisors', 'Tessel Ward Investments'],
  R3: ['Calloway Peak Partners', 'Northmere Capital', 'Vesper Ridge Fund', 'Ironwood Lane Holdings', 'Ferrand Quay Advisors', 'Orlaith Strand Capital'],
  R4: ['Brightwater Mercantile', 'Kessler Bridge Partners', 'Lowell Marsh Capital', 'Ardenne Crest Holdings', 'Senlow Harbor Fund', 'Maddox Pell Partners'],
  R5: ['Galloway Summit Capital', 'Hesper Vaults', 'Wrenn Coast Partners', 'Castellan Reach Holdings', 'Orsholm Tor Fund', 'Valdane Keel Partners'],
  R6: ['Aurelian Keystone Group', 'Sovereign Lattice Partners', 'Meridian Drift Capital', 'Corvantis Global', 'Halcyon Strand Holdings', 'Trident Ardor Fund'],
};

export interface LadderRung {
  /** the fund's stable id (never shown as a name; the board shows the name) */
  id: string;
  name: string;
  /** the rank band the fund sits in */
  band: string;
  /** the fund's anchor net worth: its level before the day's moves */
  anchor: number;
}

/**
 * The ladder: every fund, lowest first. Each band runs from its rank's threshold to the next one, split geometrically into
 * LADDER_PER_BAND rungs, so the rungs grow evenly on a log scale and the ladder covers every net worth from the floor up.
 */
export function ladderRungs(): LadderRung[] {
  const out: LadderRung[] = [];
  RANKS.forEach((r, i) => {
    const lo = i === 0 ? LADDER_FLOOR : r.threshold;
    const hi = RANKS[i + 1]?.threshold ?? LADDER_CEILING;
    const names = LADDER_NAMES[r.id] ?? [];
    const ratio = Math.pow(hi / lo, 1 / LADDER_PER_BAND);
    for (let k = 0; k < LADDER_PER_BAND; k++) {
      out.push({ id: `lad-${r.id}-${k}`, name: names[k] ?? `${r.id} fund ${k + 1}`, band: r.id, anchor: lo * Math.pow(ratio, k) });
    }
  });
  return out;
}
