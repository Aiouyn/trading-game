// Going out: six venues whose crowds come from the real population, and the people the player meets there.
// The logic is in world.ts; this file registers the module and the player's commands.
import type { Module, World } from '../../kernel/index.ts';
import { setJobBoost } from '../careers/jobs.ts';
import '../player/outings.ts';
import { init, jobBoost, monthly, yearly } from './world.ts';

export { VENUES, cityBook, metClassmate } from './world.ts';

export const venues: Module = {
  id: 'venues',
  init(w: World) { init(w); setJobBoost(jobBoost); },
  monthEnd(w: World) { monthly(w); },
  stats(w: World) { return yearly(w); },
};
