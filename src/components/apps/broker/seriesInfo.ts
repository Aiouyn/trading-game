// What the Broker, the launcher and Recent show about any series: price, day move, and what the player may
// see. Pure reads of the store with no React, so the launcher and Recent can use it too (Phase 2 step 3).
import { indexLevel, indexMembers, type AssetClass, type WorldState } from '@/engine';
import { licenseFor } from '@/content/lifestyle';
import { dayOpen } from '@/game/history';
import { isIndex, useGame } from '@/game/store';
import { t } from '@/i18n';

export interface SeriesInfo {
  id: string; name: string; sector: string; cls: AssetClass | 'index'; tradable: boolean; locked: boolean;
  price: number; change: number; changePct: number; halted: boolean; blurb: string; region?: string;
}

export function seriesInfo(world: WorldState, id: string, rankId: string): SeriesInfo {
  const h = useGame.getState().history;
  if (isIndex(id)) {
    const p = indexLevel(world, id);
    const o = dayOpen(h, id) ?? p;
    const idx = useGame.getState().config.indices.find((i) => i.id === id)!;
    // members as of the last index review (indexMembers), not the config's list: the count changes at a reconstitution
    return {
      id, name: idx.name, sector: 'index', cls: 'index', tradable: false, locked: false, price: p, change: p - o,
      changePct: o ? p / o - 1 : 0, halted: false, blurb: t('broker.index.members', { n: indexMembers(world, idx).length }),
    };
  }
  const config = useGame.getState().config;
  const i = config.assets.findIndex((a) => a.id === id);
  const def = config.assets[i]!;
  const a = world.assets[i]!;
  const p = Math.exp(a.lnP);
  const o = Math.exp(a.lnOpen);
  const lic = licenseFor(rankId);
  return {
    id, name: def.name, sector: def.sector, cls: def.assetClass, tradable: def.listed !== false, locked: !lic.classes.includes(def.assetClass),
    price: p, change: p - o, changePct: p / o - 1, halted: a.haltUntil !== -1 && a.haltUntil > world.tick, blurb: def.blurb ?? '', region: def.region,
  };
}
