// Type-only stand-in for src/city/index.ts (owned by Spec 2) until City Dev's PR lands (Spec 1 §10).
// Types copied from Spec 2 §2; the real module replaces this automatically (next.config.ts resolveAlias).
import type { CityChannelClient, CityRenderer, CityRendererOptions, CityTier, TierReason } from "@/city";

export type { CityChannelClient, CityRenderer, CityRendererOptions };

/** Calls made on the stub, for e2e evidence (window.__cityCalls). */
const calls: string[] = [];
const log = (c: string) => {
  calls.push(c);
  (globalThis as { __cityCalls?: string[] }).__cityCalls = calls;
};

export async function createCityRenderer(opts: CityRendererOptions): Promise<CityRenderer> {
  log(`create:${Object.keys(opts).sort().join(",")}`);
  let tier: CityTier = opts.tierOverride === "auto" ? "T1" : opts.tierOverride;
  const reason: TierReason = opts.tierOverride === "auto" ? "initial" : "override";
  let el: HTMLElement | null = null;
  const noop = () => {};
  return {
    async mount(container) { el = container; log("mount"); },
    unmount() { el = null; log("unmount"); },
    setData: noop,
    setTier(t) { tier = t === "auto" ? "T1" : t; },
    getTier: () => ({ tier, reason }),
    setVisibility(v) { log(`visibility:${v}`); },
    setReducedMotion(on) { log(`reducedMotion:${on}`); },
    setOverlay: noop,
    setTimeOfDay: noop,
    focus: noop,
    onPick: () => noop,
    onTierChange: () => noop,
    openTable: noop,
    closeTable: noop,
    diagnostics: () => ({
      tier, tierReason: reason, fpsFirst2s: null, frameMsP95: null, drawCalls: 0, triangles: 0, buildingParts: 0,
      canvasPixels: 0, geometries: 0, textures: 0, gpuMemEstimateMb: 0, renders: 0, framesWhileHidden: 0,
      loadMs: { importThree: 0, firstChunk: 0, firstFrame: 0 }, stateVersion: null, subscribed: el !== null,
    }),
    dispose() { el = null; log("dispose"); },
  };
}
