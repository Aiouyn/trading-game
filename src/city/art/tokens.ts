import { parseComputedColor, type Rgb } from './color';

// The one place that knows token names (PR #4 review A.4). V3 names (17 §2.5, S1 §7.1) are
// binding; the second name is the Ink & Brass name on main, kept for one release only. When
// Spec 1's tokens land on main, delete the fallbacks here and nowhere else.

/** Colour tokens: [V3 name, fallback on main]. */
export const TOKEN_VARS = {
  bg0: ['--bg0', '--color-ink-0'],
  win: ['--win', '--color-ink-1'],
  win2: ['--win2', '--color-ink-2'],
  line: ['--line', '--color-ink-3'],
  fg: ['--fg', '--color-fg'],
  fgMuted: ['--fg-muted', '--color-fg-muted'],
  fgFaint: ['--fg-faint', '--color-fg-faint'],
  acc: ['--acc', '--color-brass'],
  accHi: ['--acc-hi', '--color-brass-hi'],
  accLo: ['--acc-lo', '--color-brass-lo'],
  gain: ['--gain', '--color-gain'],
  loss: ['--loss', '--color-loss'],
  info: ['--info', '--color-info'],
  signal: ['--signal', '--color-signal'],
} as const;

/** Font tokens (S1 §7.1): [V3 name, fallback on main]. */
export const FONT_VARS = {
  display: ['--font-display', '--font-serif'],
  ui: ['--font-ui', '--font-sans'],
  num: ['--font-num', '--font-mono'],
} as const;

/** Type-scale tokens used by the city chrome: [V3 name, fallback px]. */
export const SIZE_VARS = {
  label: ['--fs-10_5', '10.5px'],
  small: ['--fs-12_5', '12.5px'],
  body: ['--fs-14', '14px'],
  mapLabel: ['--fs-16', '16px'],
} as const;

/** Every V3 name this module reads; the token-presence test checks Spec 1 defines each one. */
export const V3_TOKEN_NAMES: readonly string[] = [
  ...Object.values(TOKEN_VARS).map((v) => v[0]),
  ...Object.values(FONT_VARS).map((v) => v[0]),
  ...Object.values(SIZE_VARS).map((v) => v[0]),
];

export type TokenName = keyof typeof TOKEN_VARS;
export type Tokens = Record<TokenName, Rgb>;

export function cssVar(name: TokenName): string {
  const [a, b] = TOKEN_VARS[name];
  return `var(${a}, var(${b}))`;
}

export function fontVar(name: keyof typeof FONT_VARS): string {
  const [a, b] = FONT_VARS[name];
  return `var(${a}, var(${b}))`;
}

export function sizeVar(name: keyof typeof SIZE_VARS): string {
  const [a, b] = SIZE_VARS[name];
  return `var(${a}, ${b})`;
}

/** Reads every colour token through getComputedStyle on a probe element inside `host`. */
export function readTokens(host: HTMLElement): Tokens {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  host.appendChild(probe);
  const out = {} as Tokens;
  const missing: string[] = [];
  for (const name of Object.keys(TOKEN_VARS) as TokenName[]) {
    probe.style.color = '';
    probe.style.color = cssVar(name);
    const rgb = parseComputedColor(getComputedStyle(probe).color);
    if (!rgb) missing.push(name);
    out[name] = rgb ?? [0.5, 0.5, 0.5];
  }
  probe.remove();
  if (missing.length) console.warn('[city] unresolved tokens', missing);
  return out;
}

/** V3 names that do not resolve on `host` (no fallback). Empty once Spec 1's tokens are live. */
export function missingV3Tokens(host: HTMLElement): string[] {
  const cs = getComputedStyle(host);
  return V3_TOKEN_NAMES.filter((n) => cs.getPropertyValue(n).trim() === '');
}
