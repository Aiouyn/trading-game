import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Wallpaper, safeIdPrefix } from './DesktopWallpaper';

describe('Wallpaper id prefix (useId output has colons)', () => {
  it('drops characters that are not valid in an SVG id or url(#...) reference', () => {
    expect(safeIdPrefix(':r1:')).toBe('r1');
    expect(safeIdPrefix('wp-1_a')).toBe('wp-1_a');
    expect(safeIdPrefix('a b"c')).toBe('abc');
  });

  it('renders no colon in any id or url(#) reference', () => {
    const html = renderToStaticMarkup(<Wallpaper slug="broadsheet" width={390} height={844} idPrefix=":r2:" />);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).not.toContain(':');
      expect(id.startsWith('r2')).toBe(true);
    }
    for (const ref of html.matchAll(/url\(#([^)]+)\)/g)) expect(ref[1]).not.toContain(':');
  });
});
