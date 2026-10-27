import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Rgb } from '@/city/art/color';
import { TOKEN_VARS, type Tokens } from '@/city/art/tokens';

/** Token values of the first palette in src/styles/tokens.css (Ink & Brass), parsed at test time. */
export const css = readFileSync(join(__dirname, '../../../src/styles/tokens.css'), 'utf8');
const v = (name: string): Rgb => {
  const m = css.match(new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i'))!;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as Rgb;
};
export const inkBrass = Object.fromEntries(Object.entries(TOKEN_VARS).map(([k, name]) => [k, v(name)])) as Tokens;
