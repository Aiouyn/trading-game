import type { CityDistrict } from '../data/types';
import { mixOklab, type Rgb } from '../art/color';
import type { Tokens } from '../art/tokens';

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

/** One daylight key (card 2 §2.3): key light colour × strength, sky / fill colour × strength, exposure. */
export interface DayKey { key: Rgb; keyK: number; sky: Rgb; skyK: number; exposure: number }
/** Night 23:00, dawn 06:30, day 13:00, dusk 19:00; dusk is main's M1 grade (--acc-lo .16, --info .10, .82). */
export interface DayKeys { night: DayKey; dawn: DayKey; day: DayKey; dusk: DayKey }

export function dayKeys(t: Pick<Tokens, 'steel' | 'bg0' | 'info' | 'fg' | 'accLo'>): DayKeys {
  return {
    night: { key: mixOklab(t.steel, t.bg0, 0.35), keyK: 0.08, sky: mixOklab(t.info, t.bg0, 0.55), skyK: 0.12, exposure: 0.76 },
    dawn: { key: mixOklab(t.fg, t.accLo, 0.35), keyK: 0.14, sky: mixOklab(t.info, t.fg, 0.3), skyK: 0.1, exposure: 0.92 },
    day: { key: t.fg, keyK: 0.22, sky: mixOklab(t.info, t.fg, 0.5), skyK: 0.1, exposure: 1 },
    dusk: { key: t.accLo, keyK: 0.16, sky: t.info, skyK: 0.1, exposure: 0.82 },
  };
}

const H = 60;
/** Segments [from, to, a, b] in game minutes around the clock; a key holds between its segments. */
const SEGMENTS: readonly [number, number, keyof DayKeys, keyof DayKeys][] = [
  [4.5 * H, 6.5 * H, 'night', 'dawn'],
  [6.5 * H, 9 * H, 'dawn', 'day'],
  [16 * H, 19 * H, 'day', 'dusk'],
  [19 * H, 21.5 * H, 'dusk', 'night'],
];
/** Windows lit share (× occupancy): 0 from 07:30 to 17:30, up to .46 at 19:00, down to .30 by 21:30, to 0 from 04:30 to 07:30. */
const WINDOWS: readonly [number, number][] = [[4.5 * H, 0.3], [7.5 * H, 0], [17.5 * H, 0], [19 * H, 0.46], [21.5 * H, 0.3], [28.5 * H, 0.3]];

/** Under reduced motion the light steps once per game hour (§2.3 Motion). */
export const lightMinute = (gameMinute: number, reducedMotion: boolean) => (reducedMotion ? Math.floor(gameMinute / H) * H : gameMinute);

/**
 * The canonical game minute for a tick: `ticksToGameDate(tick).minuteOfDay` in packages/engine/core/calendar/date.ts
 * (0-based, 720 ticks × 2 game min). It cannot be imported here: the app tsconfig excludes `packages/` and type-checking
 * the engine under it fails (ES2017 target, Set lib), so tests/unit/city/light.test.ts checks this against the engine's.
 */
export const TICKS_PER_GAME_DAY = 720;
export const minuteOfTick = (tick: number) => 2 * (tick % TICKS_PER_GAME_DAY);

function keyAt(m: number, k: DayKeys): DayKey {
  for (const [a, b, ka, kb] of SEGMENTS) {
    if (m < a || m > b) continue;
    const x = smooth(a, b, m);
    const A = k[ka], B = k[kb];
    if (x === 0) return A;
    if (x === 1) return B;
    const lerp = (p: number, q: number) => p + (q - p) * x;
    return { key: mixOklab(A.key, B.key, x), keyK: lerp(A.keyK, B.keyK), sky: mixOklab(A.sky, B.sky, x), skyK: lerp(A.skyK, B.skyK), exposure: lerp(A.exposure, B.exposure) };
  }
  return m > 9 * H && m < 16 * H ? k.day : k.night;
}

function windowsAt(m: number): number {
  const w = m < WINDOWS[0][0] ? m + 1440 : m;
  for (let i = 1; i < WINDOWS.length; i++) {
    const [a, va] = WINDOWS[i - 1], [b, vb] = WINDOWS[i];
    if (w <= b) return va + (vb - va) * smooth(a, b, w);
  }
  return WINDOWS[0][1];
}

/**
 * Default lighting follows time of day × occupancy only (SR headline 1), keyframed (card 2 §2.3).
 * The sun direction keeps main's arc (east at 06:00, west at 18:00, y ≥ 0.35 so faces keep three shades).
 */
export function lightAt(gameMinute: number, occ: number, keys: DayKeys): DayKey & { sunDir: [number, number, number]; windowsLit: number } {
  const m = ((gameMinute % 1440) + 1440) % 1440;
  const a = ((m - 360) / 720) * Math.PI; // 06:00 → 0, 12:00 → π/2, 18:00 → π
  const sunDir: [number, number, number] = [Math.cos(a) || -1, Math.max(0.35, Math.sin(a)), 0.8];
  return { ...keyAt(m, keys), sunDir, windowsLit: Math.max(0, Math.min(1, occ)) * windowsAt(m) };
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
