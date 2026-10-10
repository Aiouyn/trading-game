import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import golden from './__fixtures__/glyphs.golden.json';
import { APP_GLYPH_NAMES, GLYPHS, GLYPH_NAMES, Glyph, glyphMarkup, glyphViewBox, type GlyphName } from './glyphs';

describe('Quay glyphs (golden vs docs/team/design/redesign/src/glyphs.js)', () => {
  const entries = Object.entries(golden as Record<string, string>);

  it('has a golden entry for every mock glyph', () => {
    expect(entries.length).toBeGreaterThan(0);
    const mockNames = new Set(entries.map(([k]) => k.split('|')[0]));
    expect(mockNames.size).toBe(23);
    for (const name of mockNames) expect(GLYPH_NAMES).toContain(name);
  });

  it.each(entries)('%s renders byte-identical to the mock', (key, svg) => {
    const [name, size, sw] = key.split('|') as [GlyphName, string, string];
    expect(renderToStaticMarkup(<Glyph name={name} size={Number(size)} strokeWidth={Number(sw)} />)).toBe(svg);
  });

  it('adds the mirrored class without changing the markup', () => {
    const html = renderToStaticMarkup(<Glyph name="chev" mirror />);
    expect(html).toContain('class="g os-glyph-mirror"');
    expect(html.replace(' os-glyph-mirror', '')).toBe(golden['chev|18|1.5']);
  });
});

describe('Quay glyph family rules (P2-228)', () => {
  it('covers the 17 app glyphs, the new four included (C-38)', () => {
    expect(APP_GLYPH_NAMES).toHaveLength(17);
    for (const name of ['calendar', 'exchange', 'launchpad', 'learn'] as const) {
      expect(APP_GLYPH_NAMES).toContain(name);
    }
    for (const name of APP_GLYPH_NAMES) expect(GLYPHS[name]).toBeDefined();
  });

  it.each(GLYPH_NAMES)('%s is a single-weight line: no fills except currentColor dots', (name) => {
    const markup = glyphMarkup(name);
    const fills = [...markup.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    for (const f of fills) expect(f === 'currentColor').toBe(true);
    // a dot is the only filled shape, and it is stroke="none"
    for (const m of markup.matchAll(/<circle[^>]*fill="currentColor"[^>]*\/>/g)) {
      expect(m[0]).toContain('stroke="none"');
      expect(m[0]).toMatch(/r="\.9"/);
    }
  });

  it('uses the 16 px viewBox for the small icons and 24 px otherwise', () => {
    expect(glyphViewBox('close')).toBe('0 0 16 16');
    expect(glyphViewBox('check')).toBe('0 0 16 16');
    expect(glyphViewBox('calendar')).toBe('0 0 24 24');
  });

  it.each(['calendar', 'exchange', 'launchpad', 'learn', 'check'] as const)('%s renders a valid svg', (name) => {
    const html = renderToStaticMarkup(<Glyph name={name} />);
    expect(html.startsWith('<svg class="g"')).toBe(true);
    expect(html.endsWith('</svg>')).toBe(true);
  });
});
