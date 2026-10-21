import type { CityTier, TierReason } from '../index';

/** `ui_city_render_fps_threshold` (17 §3.18). */
export const FPS_THRESHOLD = 45;
/** Measurement window after the first chunk is drawn (spec §3). */
export const MEASURE_MS = 2000;

export interface BatteryLike {
  charging: boolean;
  level: number;
}

/** Battery saver [P]: discharging at or below 20 %. */
export function isBatterySaver(b: BatteryLike | null): boolean {
  return b !== null && !b.charging && b.level <= 0.2;
}

export async function readBattery(nav: Navigator): Promise<BatteryLike | null> {
  const get = (nav as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery;
  if (typeof get !== 'function') return null;
  try {
    const b = await get.call(nav);
    return { charging: Boolean(b.charging), level: Number(b.level) };
  } catch {
    return null;
  }
}

/** Order: override → no WebGL2 → battery saver → T2 (spec §3). */
export function initialTier(input: {
  override: 'auto' | CityTier;
  hasWebGL2: boolean;
  batterySaver: boolean;
}): { tier: CityTier; reason: TierReason } {
  if (input.override !== 'auto') {
    // An override can't conjure a WebGL2 context; T1/T2 without one degrade to T0.
    if (input.override !== 'T0' && !input.hasWebGL2) return { tier: 'T0', reason: 'no-webgl2' };
    return { tier: input.override, reason: 'override' };
  }
  if (!input.hasWebGL2) return { tier: 'T0', reason: 'no-webgl2' };
  if (input.batterySaver) return { tier: 'T0', reason: 'battery-saver' };
  return { tier: 'T2', reason: 'initial' };
}

/**
 * Mean fps over the first 2 s of active rendering. `timestamps` are frame times (ms) from the
 * injected clock, starting at the first drawn chunk. Returns null until the window is full.
 */
export function measureFps(timestamps: readonly number[]): number | null {
  if (timestamps.length < 2) return null;
  const span = timestamps[timestamps.length - 1] - timestamps[0];
  if (span < MEASURE_MS) return null;
  return ((timestamps.length - 1) * 1000) / span;
}

/** Steps down only, never up within a session [P]. */
export function autoStep(tier: CityTier, fps: number): CityTier {
  return tier === 'T2' && fps < FPS_THRESHOLD ? 'T1' : tier;
}
