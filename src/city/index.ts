// The single seam between the shell (Spec 1) and the City renderer (Spec 2).
// Types plus createCityRenderer only. three.js is never imported statically from here: the
// implementation is loaded with a dynamic import, and it loads three only for tiers T1/T2.
import type { CityDelta, CitySnapshot } from './data/types';

export type CityTier = 'T0' | 'T1' | 'T2';
export type TierReason = 'auto-fps' | 'no-webgl2' | 'battery-saver' | 'override' | 'context-lost' | 'initial';
export type Visibility = 'visible' | 'background' | 'hidden';
export type CityOverlay =
  | 'none'
  | 'my_places'
  | 'districts'
  | 'sectors'
  | 'for_sale'
  | 'auctions'
  | 'movers'
  | 'development';

export interface CityRendererOptions {
  cityId: string;
  tierOverride: 'auto' | CityTier;
  reducedMotion: boolean;
  myCityOverlay: boolean;
  channel: CityChannelClient;
  fetchChunk: (url: string) => Promise<ArrayBuffer>;
  locale: string;
  /**
   * Entity ids of the player's own places, computed locally from `me` and never uploaded
   * (17 §2.2, 17-AT-21). Not in Spec 2 §2 yet: proposed addition, needs Spec 1 sign-off. [P]
   */
  myEntityIds?: readonly string[];
}

export interface CityChannelClient {
  subscribe(cityId: string, onDelta: (d: CityDelta) => void): () => void;
  stateVersion(cityId: string): number | null;
}

export interface PickResult {
  kind: 'company_hq' | 'storefront' | 'property' | 'landmark' | 'crown_tower' | 'district' | 'listing';
  entityId: string;
  parcelId: string;
  screen: { x: number; y: number };
}

export interface CityDiagnostics {
  tier: CityTier;
  tierReason: TierReason;
  fpsFirst2s: number | null;
  frameMsP95: number | null;
  drawCalls: number;
  triangles: number;
  buildingParts: number;
  canvasPixels: number;
  geometries: number;
  textures: number;
  gpuMemEstimateMb: number;
  renders: number;
  framesWhileHidden: number;
  loadMs: { importThree: number; firstChunk: number; firstFrame: number };
  stateVersion: number | null;
  subscribed: boolean;
}

export interface CityRenderer {
  mount(container: HTMLElement): Promise<void>;
  unmount(): void;
  setData(snapshotOrDelta: CitySnapshot | CityDelta): void;
  setTier(tier: 'auto' | CityTier): void;
  getTier(): { tier: CityTier; reason: TierReason };
  setVisibility(v: Visibility): void;
  setReducedMotion(on: boolean): void;
  setOverlay(o: CityOverlay): void;
  setTimeOfDay(gameMinute: number): void;
  focus(target: { entityId: string } | { parcelId: string }): void;
  onPick(cb: (p: PickResult) => void): () => void;
  onTierChange(cb: (t: CityTier, reason: TierReason) => void): () => void;
  openTable(): void;
  closeTable(): void;
  diagnostics(): CityDiagnostics;
  dispose(): void;
}

export async function createCityRenderer(opts: CityRendererOptions): Promise<CityRenderer> {
  const { createRenderer } = await import('./renderer/create');
  return createRenderer(opts);
}

export type { CitySnapshot, CityDelta } from './data/types';
