import type { CityDistrict } from '../data/types';

/** Evidence and default clock before the shell sends game time: dusk, 19:00 (review M1). */
export const DEFAULT_GAME_MINUTE = 19 * 60;

/** Market lights overlay (10 §3.20.1): per HQ, from that company's published day return. */
export function litRatio(dayReturn: number): number {
  return 0.5 + 0.3 * Math.max(-1, Math.min(1, dayReturn / 0.05));
}

/** City occupancy from published district vacancy (mean over uses and districts), 0..1. */
export function occupancy(districts: readonly CityDistrict[]): number {
  const v: number[] = [];
  for (const d of districts) for (const u of Object.values(d.byUse)) if (u) v.push(u.vacancy);
  if (!v.length) return 0.85;
  return 1 - v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * Default lighting follows time of day × occupancy only (SR headline 1). Returns the sun
 * direction (key light from the west-south-west at dusk, so south faces are lit and east faces shaded in the default view), how much of the facade light comes from the key,
 * an overall exposure, and the share of windows lit (30–50 % at dusk for a normal city).
 */
export function lightAt(gameMinute: number, occ: number): {
  sunDir: [number, number, number];
  night: number;
  exposure: number;
  windowsLit: number;
} {
  const m = ((gameMinute % 1440) + 1440) % 1440;
  const a = ((m - 360) / 720) * Math.PI; // 06:00 → 0, 12:00 → π/2, 18:00 → π
  const elev = Math.sin(a);
  // keep a low raking key at dusk/night so faces keep three shades
  const sunDir: [number, number, number] = [Math.cos(a) || -1, Math.max(0.35, elev), 0.8];
  const night = 1 - smooth(-0.05, 0.35, elev);
  return { sunDir, night, exposure: 1 - 0.18 * night, windowsLit: Math.max(0, Math.min(1, occ)) * 0.46 * night };
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
