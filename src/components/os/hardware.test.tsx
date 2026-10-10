import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RankHardware } from './RankHardware';
import { RANKS, bezelPx, bootMs, hardwareParts, rankClass, type Rank } from './hardware';

const ids = (r: Rank) => hardwareParts(r).map((l) => l.testId);

describe('rank hardware R0-R6 (P2-190..P2-199)', () => {
  it('R0 has the 14 px bezel, the crack and the sticker', () => {
    expect(ids(0)).toEqual(['os-bezel', 'os-crack', 'os-hw-sticker']);
    expect(bezelPx(0)).toBe(14);
    expect(bootMs(0)).toBe(900);
  });

  it('R1 thins to 6 px, with no crack and a 500 ms boot', () => {
    expect(ids(1)).toEqual(['os-bezel']);
    expect(bezelPx(1)).toBe(6);
    expect(bootMs(1)).toBe(500);
  });

  it('R2 and R3 add no hardware layer (the shelf and workspaces change in CSS and layout)', () => {
    expect(ids(2)).toEqual([]);
    expect(ids(3)).toEqual([]);
    expect(bezelPx(2)).toBeNull();
    expect(bootMs(3)).toBeNull();
  });

  it('R4 adds the walnut edge; R5 adds the skyline; R6 the horizon instead of the skyline', () => {
    expect(ids(4)).toEqual(['os-hw-walnut']);
    expect(ids(5)).toEqual(['os-hw-walnut', 'os-hw-skyline']);
    expect(ids(6)).toEqual(['os-hw-walnut', 'os-hw-horizon']);
  });

  it('is cosmetic only: the layers are the same kind of element at every rank', () => {
    for (const r of RANKS) {
      for (const l of hardwareParts(r)) expect(l.testId.startsWith('os-')).toBe(true);
    }
  });

  it('names the shell class the CSS keys on', () => {
    expect(rankClass(0)).toBe('shell-r0');
    expect(rankClass(6)).toBe('shell-r6');
  });
});

describe('RankHardware markup', () => {
  it('renders the R0 frame with the Velvet ids and the localised sticker text', () => {
    const html = renderToStaticMarkup(<RankHardware rank={0} />);
    expect(html).toContain('data-testid="os-bezel"');
    expect(html).toContain('os-bezel-r0');
    expect(html).toContain('data-testid="os-crack"');
    expect(html).toContain('data-testid="os-hw-sticker"');
    expect(html).toContain('Port Avalon Electronics');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders nothing interactive at any rank', () => {
    for (const r of RANKS) {
      const html = renderToStaticMarkup(<RankHardware rank={r} />);
      expect(html).not.toMatch(/<(button|a|input)\b/);
    }
  });
});
