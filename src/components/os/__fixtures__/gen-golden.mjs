// Regenerates the golden fixtures for the Quay glyph and wallpaper ports.
// Runs the ORIGINAL mock sources (docs/team/design/redesign/src/*.js) under node's vm and
// writes their output. The TS ports must match these files byte for byte.
//   node src/components/os/__fixtures__/gen-golden.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = new URL('.', import.meta.url);
const mockDir = new URL('../../../../docs/team/design/redesign/src/', import.meta.url);

const ctx = vm.createContext({ Math, URLSearchParams, location: { search: '' }, document: undefined });
for (const f of ['palettes.js', 'glyphs.js', 'wallpaper.js']) {
  vm.runInContext(readFileSync(new URL(f, mockDir), 'utf8'), ctx, { filename: f });
}
const { G, glyph, PALETTES, wallpaper } = vm.runInContext('({ G, glyph, PALETTES, wallpaper })', ctx);

// Glyphs: every name at the sizes and stroke widths the mocks use.
const glyphs = {};
for (const name of Object.keys(G)) {
  for (const [size, sw] of [[18, 1.5], [20, 1.5], [16, 1.6]]) {
    glyphs[`${name}|${size}|${sw}`] = glyph(name, size, sw);
  }
}
writeFileSync(new URL('glyphs.golden.json', here), JSON.stringify(glyphs, null, 1) + '\n');

// Wallpapers: each palette at desktop and phone sizes, with the mocks' horizon fraction (.79).
const wpDir = new URL('wallpaper/', here);
mkdirSync(wpDir, { recursive: true });
for (const slug of Object.keys(PALETTES)) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const svg = wallpaper(slug, w, h, PALETTES[slug], 0.79);
    writeFileSync(new URL(`${slug}-${w}x${h}.svg`, wpDir), svg);
  }
}
console.log(`wrote ${Object.keys(glyphs).length} glyph fixtures and ${Object.keys(PALETTES).length * 2} wallpapers to ${fileURLToPath(here)}`);
