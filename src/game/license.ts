import { portfolio, type AssetClass, type AssetDef, type WorldState } from '@/engine';
import { RANKS, type Rank } from './rank';

/**
 * Trading licenses (04 §3.1). A license is granted by reaching its rank and is never lost
 * (ranks key off peak net worth, no demotion). Anything gated (an asset class today; forex,
 * bonds and leverage later) asks for a license id, never for a ticker.
 */
export type LicenseId = 'retail' | 'pro' | 'derivatives' | 'institutional';

export interface License {
  id: LicenseId;
  name: string;
  rankId: Rank['id'];
  unlocks: string;
}

export const LICENSES: Record<LicenseId, License> = {
  retail: { id: 'retail', name: 'Retail', rankId: 'R0', unlocks: 'stocks and crypto' },
  pro: { id: 'pro', name: 'Pro', rankId: 'R2', unlocks: 'forex, commodities, bonds and 2\u00d7 leverage' },
  derivatives: { id: 'derivatives', name: 'Derivatives', rankId: 'R3', unlocks: 'options, futures and up to 10\u00d7 leverage' },
  institutional: { id: 'institutional', name: 'Institutional', rankId: 'R4', unlocks: 'institutional markets' },
};

/** Which license each asset class needs. New classes (forex, bonds) add a row here. */
export const CLASS_LICENSE: Record<AssetClass, LicenseId> = {
  stock: 'retail',
  crypto: 'retail',
  commodity: 'pro',
};

export function licenseRank(id: LicenseId): Rank {
  return RANKS.find((r) => r.id === LICENSES[id].rankId)!;
}

/** An asset may carry its own `license` flag; otherwise its class decides. */
export function requiredLicense(def: AssetDef): License {
  const own = (def as AssetDef & { license?: LicenseId }).license;
  return LICENSES[own ?? CLASS_LICENSE[def.assetClass]];
}

export function hasLicense(peakEquity: number, id: LicenseId): boolean {
  return peakEquity >= licenseRank(id).threshold;
}

export type LicenseCheck =
  | { ok: true; license: License }
  | { ok: false; license: License; rank: Rank; equity: number; progress: number };

export function licenseCheck(world: WorldState, playerId: string, assetId: string): LicenseCheck {
  const def = world.config.assets.find((a) => a.id === assetId);
  if (!def) return { ok: true, license: LICENSES.retail };
  const license = requiredLicense(def);
  const acct = world.accounts[playerId];
  if (!acct) return { ok: false, license, rank: licenseRank(license.id), equity: 0, progress: 0 };
  const pf = portfolio(world, playerId);
  if (hasLicense(pf.peakEquity, license.id)) return { ok: true, license };
  const rank = licenseRank(license.id);
  const floor = pf.startingCash;
  const progress = Math.min(1, Math.max(0, (pf.equity - floor) / (rank.threshold - floor)));
  return { ok: false, license, rank, equity: pf.equity, progress };
}

/** "Pro license at Owner, $250k" */
export function lockedText(c: Extract<LicenseCheck, { ok: false }>, money: (n: number) => string): string {
  return `${c.license.name} license at ${c.rank.name}, ${money(c.rank.threshold)}`;
}
