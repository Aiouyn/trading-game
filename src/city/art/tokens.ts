import { parseComputedColor, type Rgb } from './color';

// The one place that knows token names (PR #4 review A.4): the V3 names (17 §2.5, S1 §7.1) as
// defined by Spec 1's src/styles/tokens.css on main. No fallbacks: the Ink & Brass names are gone.

/** Colour tokens. */
export const TOKEN_VARS = {
  bg0: '--bg0',
  win: '--win',
  win2: '--win2',
  line: '--line',
  fg: '--fg',
  fgMuted: '--fg-muted',
  fgFaint: '--fg-faint',
  acc: '--acc',
  accHi: '--acc-hi',
  accLo: '--acc-lo',
  gain: '--gain',
  loss: '--loss',
  info: '--info',
  signal: '--signal',
  /** card 2 night key light; per palette from tokens.css (Studio ruling 3) */
  steel: '--steel',
} as const;

/** Font tokens (S1 §7.1). */
export const FONT_VARS = {
  display: '--font-display',
  ui: '--font-ui',
  num: '--font-num',
} as const;

/** Type-scale tokens used by the city chrome. */
export const SIZE_VARS = {
  label: '--fs-10_5',
  small: '--fs-12_5',
  body: '--fs-14',
  mapLabel: '--fs-16',
} as const;

/** Every V3 name this module reads; the token-presence test checks Spec 1 defines each one. */
export const V3_TOKEN_NAMES: readonly string[] = [
  ...Object.values(TOKEN_VARS),
  ...Object.values(FONT_VARS),
  ...Object.values(SIZE_VARS),
];

export type TokenName = keyof typeof TOKEN_VARS;
export type Tokens = Record<TokenName, Rgb>;

export function cssVar(name: TokenName): string {
  return `var(${TOKEN_VARS[name]})`;
}

export function fontVar(name: keyof typeof FONT_VARS): string {
  return `var(${FONT_VARS[name]})`;
}

export function sizeVar(name: keyof typeof SIZE_VARS): string {
  return `var(${SIZE_VARS[name]})`;
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

/** Token names that do not resolve on `host`. Empty when Spec 1's tokens are loaded. */
export function missingV3Tokens(host: HTMLElement): string[] {
  const cs = getComputedStyle(host);
  return V3_TOKEN_NAMES.filter((n) => cs.getPropertyValue(n).trim() === '');
}
