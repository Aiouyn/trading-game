import { describe, expect, it } from 'vitest';
import { unlockLine, unlockProgress } from './unlock';

describe('the unlock line (Stage 4)', () => {
  it('says what opens the tile, the peak it needs, and where the player is', () => {
    const { text, progress } = unlockLine('R2', 5_300);
    expect(text).toContain('Owner');
    expect(text).toContain('250,000');
    expect(text).toContain('5,300');
    expect(progress).toBe(2);
  });

  it('clamps progress to 0..100 and treats a zero threshold as done', () => {
    expect(unlockProgress(0, 250_000)).toBe(0);
    expect(unlockProgress(900_000, 250_000)).toBe(100);
    expect(unlockProgress(10, 0)).toBe(100);
  });
});
