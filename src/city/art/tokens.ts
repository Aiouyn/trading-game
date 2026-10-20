import { parseComputedColor, type Rgb } from './color';

/** Spec 1 token names (17 §2.5), each with the Ink & Brass name on main as a fallback. */
export const TOKEN_VARS = {
  bg0: ['--bg0', '--color-ink-0'],
  win: ['--win', '--color-ink-1'],
  win2: ['--win2', '--color-ink-2'],
  line: ['--line', '--color-ink-3'],
  fg: ['--fg', '--color-fg'],
  fgMuted: ['--fg-muted', '--color-fg-muted'],
  acc: ['--acc', '--color-brass'],
  gain: ['--gain', '--color-gain'],
  loss: ['--loss', '--color-loss'],
  signal: ['--signal', '--color-signal'],
} as const;

export type TokenName = keyof typeof TOKEN_VARS;
export type Tokens = Record<TokenName, Rgb>;

export function cssVar(name: TokenName): string {
  const [a, b] = TOKEN_VARS[name];
  return `var(${a}, var(${b}))`;
}

/** Reads every token through getComputedStyle on a probe element inside `host`. */
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
