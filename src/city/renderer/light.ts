import { mixOklab, type Rgb } from '../art/color';
import type { Ramps } from '../art/ramps';

/** Market lights (10 §3.26): litRatio = 0.50 + 0.30·clamp(dayReturn/0.05, −1, 1). */
export function litRatio(dayReturn: number): number {
  return 0.5 + 0.3 * Math.max(-1, Math.min(1, dayReturn / 0.05));
}

/** Default before the shell sends the game clock: dusk (17 §3.15). */
export const DEFAULT_GAME_MINUTE = 18 * 60 + 30;

/**
 * Light that follows the game clock with a dusk grade: warm key, cool fill (17 §3.15). Flat-ish:
 * the fill carries most of the light so facades read as architecture, not as shading.
 */
export function lightAt(gameMinute: number, ramps: Ramps): {
  sunDir: [number, number, number];
  night: number;
  key: Rgb;
  fill: Rgb;
} {
  const m = ((gameMinute % 1440) + 1440) % 1440;
  const a = ((m - 360) / 720) * Math.PI; // 06:00 → 0, 12:00 → π/2, 18:00 → π
  const elev = Math.sin(a);
  const sunDir: [number, number, number] = [Math.cos(a), Math.max(0.15, elev), 0.45];
  const night = 1 - smooth(-0.05, 0.35, elev);
  const dusk = 1 - Math.abs(elev) / 0.6;
  const key = mixOklab(ramps.fillLight, ramps.keyLight, 0.6 + 0.4 * Math.max(0, Math.min(1, dusk)));
  const k = 0.75 + 0.35 * (1 - night);
  return { sunDir, night, key: key.map((c) => c * k) as Rgb, fill: ramps.fillLight.map((c) => c * (0.85 + 0.25 * (1 - night))) as Rgb };
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
