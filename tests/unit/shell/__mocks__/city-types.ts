// Type declarations for the `@/city` stub (copied from Spec 2 §2). A regular module, not an ambient
// `declare module` (that clashed with the real src/city types on PR #4). tsconfig "paths" maps `@/city`
// to src/city/index.ts first and falls back to the runtime stub ./city.ts, which re-exports these.
export type CityTier = "T0" | "T1" | "T2";
export type TierReason = "auto-fps" | "no-webgl2" | "battery-saver" | "override" | "context-lost" | "initial";
export type Visibility = "visible" | "background" | "hidden";
export type CityOverlay =
  | "none" | "my_places" | "districts" | "sectors" | "for_sale" | "auctions" | "movers" | "development";
export type CitySnapshot = { stateVersion: number } & Record<string, unknown>;
export type CityDelta = { stateVersion: number } & Record<string, unknown>;

export interface CityChannelClient {
  subscribe(cityId: string, onDelta: (d: CityDelta) => void): () => void;
  stateVersion(cityId: string): number | null;
}
export interface CityRendererOptions {
  cityId: string;
  tierOverride: "auto" | CityTier;
  reducedMotion: boolean;
  myCityOverlay: boolean;
  channel: CityChannelClient;
  fetchChunk: (url: string) => Promise<ArrayBuffer>;
  locale: string;
  /** The player's own places, computed locally from `me`; never uploaded (17 §2.2, 17-AT-21). */
  myEntityIds: readonly string[];
  /** Shell-owned telemetry sink for ui.perf (17 §5.2); sampled once per minute while visible (S2 §9). */
  onPerfSample?: (s: { tickRenderMsP50: number; tickRenderMsP95: number; fps: number | null; heapMb: number; renderTier: CityTier }) => void;
}
export interface PickResult {
  kind: "company_hq" | "storefront" | "property" | "landmark" | "crown_tower" | "district" | "listing";
  entityId: string; parcelId: string; screen: { x: number; y: number };
}
export interface CityDiagnostics {
  tier: CityTier; tierReason: TierReason; fpsFirst2s: number | null; frameMsP95: number | null;
  drawCalls: number; triangles: number; buildingParts: number; canvasPixels: number;
  geometries: number; textures: number; gpuMemEstimateMb: number;
  renders: number; framesWhileHidden: number;
  loadMs: { importThree: number; firstChunk: number; firstFrame: number };
  stateVersion: number | null; subscribed: boolean;
}
export interface CityRenderer {
  mount(container: HTMLElement): Promise<void>;
  unmount(): void;
  setData(snapshotOrDelta: CitySnapshot | CityDelta): void;
  setTier(tier: "auto" | CityTier): void;
  getTier(): { tier: CityTier; reason: TierReason };
  setVisibility(v: Visibility): void;
  setReducedMotion(on: boolean): void;
  setOverlay(o: CityOverlay): void;
  setMyPlaces(ids: readonly string[]): void;
  setTimeOfDay(gameMinute: number): void;
  focus(target: { entityId: string } | { parcelId: string }): void;
  onPick(cb: (p: PickResult) => void): () => void;
  onTierChange(cb: (t: CityTier, reason: TierReason) => void): () => void;
  openTable(): void;
  closeTable(): void;
  diagnostics(): CityDiagnostics;
  dispose(): void;
}
export declare function createCityRenderer(opts: CityRendererOptions): Promise<CityRenderer>;
