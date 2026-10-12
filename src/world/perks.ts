import type { ComebackPerk, Player } from './types';

/**
 * The comeback perks' rules (velvet-bankruptcy.md): the numbers the business and fee paths read. Kept apart from comeback.ts so
 * assets.ts and the fill path import them without a cycle.
 */
export const PERK_RULES = {
  /** Old contacts: one T1 business at this share of its price, once */
  contactsOff: 0.5,
  /** Second wind: business income multiplier while it runs */
  windMult: 1.25,
  /** Lessons learned: the share of a trading fee given back while it runs */
  lessonsRebate: 0.5,
};

/** The business income multiplier of the Second wind perk, while it runs (7 real days after a fresh start). */
export function windMultOf(p: Player, tick: number): number {
  const perk = p.comeback?.perk;
  return perk && perk.id === 'wind' && perk.untilTick > tick ? PERK_RULES.windMult : 1;
}

/** The fee rebate of Lessons learned on a fill of this player, while it runs (0 otherwise). */
export function lessonsRebateOf(p: Player, tick: number, fee: number): number {
  const perk = p.comeback?.perk;
  return perk && perk.id === 'lessons' && perk.untilTick > tick && fee > 0 ? fee * PERK_RULES.lessonsRebate : 0;
}

export type { ComebackPerk };
