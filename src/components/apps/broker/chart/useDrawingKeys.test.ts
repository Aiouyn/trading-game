import { describe, expect, it, vi } from 'vitest';
import { placeSelectedPosition } from './useDrawingKeys';

describe('chart-scoped position placement', () => {
  it('only clicks the matching panel in the owning chart (Enter and right-click share this path)', () => {
    const click = vi.fn();
    const button = { disabled: false, click };
    const panel = { dataset: { assetId: 'X', drawingId: 'd1' }, querySelector: () => button };
    const root = { querySelector: () => panel } as unknown as ParentNode;
    expect(placeSelectedPosition(root, 'Y', 'd1')).toBe(false);
    expect(placeSelectedPosition(root, 'X', 'd2')).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(placeSelectedPosition(root, 'X', 'd1')).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    button.disabled = true;
    expect(placeSelectedPosition(root, 'X', 'd1')).toBe(false);
    expect(placeSelectedPosition(null, 'X', 'd1')).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
