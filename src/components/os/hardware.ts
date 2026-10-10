// Rank as hardware, R0 to R6 (velvet-desktop-os.md 177-190; P2-190..P2-199). Cosmetic only:
// no rank changes tick timing, order types, information, window limits or keyboard reach (P2-191).
// Pure data, so the rule can be tested without a DOM.

export const RANKS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Rank = (typeof RANKS)[number];

export type HardwarePart = 'bezel' | 'crack' | 'sticker' | 'walnut' | 'skyline' | 'horizon';

export interface HardwareLayer {
  part: HardwarePart;
  /** data-testid for the element. "os-bezel" and "os-crack" are the Velvet ids (C-14); the rest are os-hw-<part>. */
  testId: string;
}

/**
 * Layers drawn for a rank. The walnut edge carries from R4 up, the skyline is R5 only, and the sea
 * horizon replaces it at R6. R2 and R3 change the shelf and workspace count (CSS and layout), not hardware.
 */
export function hardwareParts(rank: Rank): HardwareLayer[] {
  const parts: HardwarePart[] = [];
  if (rank === 0) parts.push('bezel', 'crack', 'sticker');
  if (rank === 1) parts.push('bezel');
  if (rank >= 4) parts.push('walnut');
  if (rank === 5) parts.push('skyline');
  if (rank === 6) parts.push('horizon');
  return parts.map((part) => ({ part, testId: testIdFor(part) }));
}

export function testIdFor(part: HardwarePart): string {
  if (part === 'bezel') return 'os-bezel';
  if (part === 'crack') return 'os-crack';
  return `os-hw-${part}`;
}

/** Bezel thickness in px for the frame classes (R0 14, R1 6). Null when the rank has no bezel. */
export function bezelPx(rank: Rank): number | null {
  if (rank === 0) return 14;
  if (rank === 1) return 6;
  return null;
}

/** Boot time before the save loads, in ms (P2-192). R0 and R1 only; other ranks boot without this step. */
export function bootMs(rank: Rank): number | null {
  if (rank === 0) return 900;
  if (rank === 1) return 500;
  return null;
}

/** The shell class on the root, which the rank CSS keys on. */
export function rankClass(rank: Rank): `shell-r${Rank}` {
  return `shell-r${rank}`;
}
