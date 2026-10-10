import { describe, expect, it } from 'vitest';
import { planLayout, type LayoutPlan } from './layouts';
import type { AppId } from './apps';

const all = () => true;
const lockedResearch = (app: AppId) => app !== 'research';
const VP_1920 = { w: 1920, h: 1080 };
const VP_1440 = { w: 1440, h: 900 };
const VP_1000 = { w: 1000, h: 800 };
const VP_900 = { w: 900, h: 800 };

/** Compact view of a plan: "app:slot[:filled]" in placement order. */
const shape = (p: LayoutPlan) =>
  p.placements.map((x) => `${x.app}${x.second ? '#2' : ''}:${typeof x.slot === 'string' ? x.slot : 'custom'}${x.filled ? ':filled' : ''}`);

describe('built-in layouts: feasibility fallback', () => {
  it('Trade at 1920x1080 uses thirds: Wire and Portfolio stacked on the right, Broker 2/3 left, Broker last (focused)', () => {
    const p = planLayout('trade', VP_1920, all, { ticker: 'HLCN' });
    expect(p.variant).toBe('thirds');
    expect(shape(p)).toEqual(['wire:R3T', 'portfolio:R3B', 'broker:L23']);
    expect(p.placements[2]!.props).toEqual({ ticker: 'HLCN' });
    expect(p.skipped).toEqual([]);
  });

  it('Trade at 1440x900 falls back to halves: the right third is 468 px, below the Portfolio minimum of 520', () => {
    const p = planLayout('trade', VP_1440, all, { ticker: 'HLCN' });
    expect(p.variant).toBe('halves');
    expect(shape(p)).toEqual(['wire:TR', 'portfolio:BR', 'broker:L2']);
  });

  it('Trade at 1000x800 falls back to halves with Broker and Wire: the Portfolio cannot fit a 488 px half', () => {
    const p = planLayout('trade', VP_1000, all, { ticker: 'HLCN' });
    expect(p.variant).toBe('halves');
    expect(shape(p)).toEqual(['wire:R2', 'broker:L2']);
    expect(p.skipped).toEqual(['portfolio']);
  });

  it('Trade at 900x800 (single mode) falls back to one window filled', () => {
    const p = planLayout('trade', VP_900, all, { ticker: 'HLCN' });
    expect(p.variant).toBe('filled');
    expect(shape(p)).toEqual(['broker:L23:filled']);
    expect(p.skipped).toEqual(['wire', 'portfolio']);
  });

  it('Research at 1920x1080 keeps the thirds: Research 2/3 left, Broker and Wire on the right', () => {
    const p = planLayout('research', VP_1920, all, { ticker: 'BRNT', fileId: 'f1' });
    expect(p.placements.find((x) => x.app === 'research')!.props).toEqual({ fileId: 'f1' });
    expect(p.variant).toBe('thirds');
    expect(shape(p)).toEqual(['broker:R3T', 'wire:R3B', 'research:L23']);
  });

  it('Research at 1440x900: Broker cannot fit the 468 px right third, so the Broker shows full-height on the right and Wire is tabbed away', () => {
    const p = planLayout('research', VP_1440, all, { ticker: 'BRNT', fileId: 'f1' });
    expect(p.variant).toBe('halves');
    expect(shape(p)).toEqual(['broker:R2', 'research:L2']);
    expect(p.skipped).toEqual(['wire']);
  });

  it('Research below R3: the Research slot is skipped and the Broker takes the freed 2/3 (C-25)', () => {
    const p = planLayout('research', VP_1920, lockedResearch, { ticker: 'BRNT' });
    expect(p.variant).toBe('thirds');
    expect(shape(p)).toEqual(['wire:R3B', 'broker:L23']);
    expect(p.skipped).toEqual(['research']);
  });

  it('Research without a file is skipped and the Broker takes its slot (no fileless Research window)', () => {
    const p = planLayout('research', VP_1920, all, { ticker: 'BRNT' });
    expect(p.variant).toBe('thirds');
    expect(shape(p)).toEqual(['wire:R3B', 'broker:L23']);
    expect(p.skipped).toEqual(['research']);
    expect(p.placements.every((x) => x.app !== 'research')).toBe(true);
  });

  it('Review at 1440x900 is two halves: Portfolio left and Wire right, until the journal view is built', () => {
    const p = planLayout('review', VP_1440, all, { views: [] });
    expect(p.variant).toBe('thirds');
    expect(shape(p)).toEqual(['wire:R2', 'portfolio:L2']);
    expect(p.placements.some((x) => x.second)).toBe(false);
    expect(p.placements[0]!.props).toEqual({});
  });

  it('Review with the journal view built is Portfolio left and the journal Portfolio (second instance) right', () => {
    const p = planLayout('review', VP_1440, all, { views: ['journal'] });
    expect(p.variant).toBe('thirds');
    expect(shape(p)).toEqual(['portfolio#2:R2', 'portfolio:L2']);
    expect(p.placements[0]!.props).toEqual({ view: 'journal' });
    expect(p.placements[1]!.props).toEqual({});
  });

  it('Review at 1000x800 cannot fit two Portfolios in halves, so it falls back to Portfolio filled', () => {
    const p = planLayout('review', VP_1000, all);
    expect(p.variant).toBe('filled');
    expect(shape(p)).toEqual(['portfolio:L2:filled']);
  });

  it('never places a locked app, and the main window always comes last', () => {
    for (const vp of [VP_1920, VP_1440, VP_1000, VP_900]) {
      for (const name of ['trade', 'review', 'research'] as const) {
        const p = planLayout(name, vp, lockedResearch, { ticker: 'HLCN' });
        expect(p.placements.some((x) => x.app === 'research')).toBe(false);
        expect(p.placements.length).toBeGreaterThan(0);
      }
    }
  });
});
