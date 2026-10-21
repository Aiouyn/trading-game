// T04-01b step 1 (E-45 item 2): p10-universe region slugs are ids only, normalised to canonical bloc codes at the content boundary.
// Display names come from 22 (e.g. slug `meridian`, city "Meridia").
import { EngineFault } from '@tycoon/engine-core';
import type { BlocId } from './schema';

export type RegionSlug = 'avalon' | 'meridian' | 'kaiyo' | 'nordhaven' | 'sundara';
const REGION_SLUGS: readonly RegionSlug[] = ['avalon', 'meridian', 'kaiyo', 'nordhaven', 'sundara'];
const REGION_BLOC: readonly BlocId[] = ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'];

export function blocOfRegionSlug(slug: RegionSlug): BlocId {
  const i = REGION_SLUGS.indexOf(slug);
  if (i < 0) throw new EngineFault('I0.macro_region_slug', `unknown region slug ${String(slug)}`);
  return REGION_BLOC[i]!;
}
