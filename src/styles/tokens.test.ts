import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ART_SLUGS, WALLPAPER_PALETTES, type ArtSlug } from '@/components/os/wallpaper';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const TOKENS = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** Body of the first block that starts with `selector {` (no nesting in tokens.css beyond @keyframes). */
function block(selector: string, css = TOKENS): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed block ${selector}`);
}

/** `--name: value;` declarations in a block. */
function decls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  // strip comments, then read declarations at any depth (keyframe bodies are skipped by the regex)
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const THEME = decls(block('@theme'));
const ROOT = decls(block(':root'));
const PALETTE: Record<ArtSlug | 'ink-brass', Record<string, string>> = {
  'ink-brass': { ...THEME },
  broadsheet: { ...THEME, ...decls(block('html[data-palette="broadsheet"]')) },
  phosphor: { ...THEME, ...decls(block('html[data-palette="phosphor"]')) },
  riviera: { ...THEME, ...decls(block('html[data-palette="riviera"]')) },
};

function hex(v: string | undefined): string {
  if (!v || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`not a hex colour: ${v}`);
  return v.toUpperCase();
}

function luminance(h: string): number {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__fixtures__' || name === 'node_modules') continue;
      yield* walk(p);
    } else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.ts$/.test(name)) {
      yield p;
    }
  }
}

describe('tokens.css v2', () => {
  it('keeps the default palette on :root / @theme as Ink & Brass', () => {
    expect(hex(THEME['--color-ink-0'])).toBe('#0B0D10');
    expect(hex(THEME['--color-brass'])).toBe('#C9A45C');
    expect(ROOT['--os-strip-h']).toBe('34px');
    expect(ROOT['--os-shelf-h']).toBe('52px');
  });

  it('keeps every v1 layout token the app still reads', () => {
    for (const name of ['--rail-w', '--side-w', '--topbar-h', '--tabbar-h', '--focus-ring']) {
      expect(ROOT[name], name).toBeTruthy();
    }
  });

  it('sets color-scheme per palette (Broadsheet light, the rest dark)', () => {
    const scheme = (sel: string) => block(sel).match(/color-scheme:\s*(\w+)/)?.[1];
    expect(scheme('html[data-palette="broadsheet"]')).toBe('light');
    for (const p of ['phosphor', 'riviera'] as const) {
      expect(scheme(`html[data-palette="${p}"]`)).toBe('dark');
    }
  });

  it('keeps reduced motion and the high-contrast hook', () => {
    expect(TOKENS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(TOKENS).toContain('html[data-contrast="high"]');
  });

  it('gives the art table the same colours as the tokens of each palette', () => {
    for (const slug of ART_SLUGS) {
      const p = WALLPAPER_PALETTES[slug];
      const t = PALETTE[slug];
      expect(hex(t['--color-ink-0']), `${slug} bg0`).toBe(p.bg0);
      expect(hex(t['--color-brass']), `${slug} acc`).toBe(p.acc);
      expect(hex(t['--color-ink-3']), `${slug} line`).toBe(p.line);
      expect(hex(t['--color-fg-faint']), `${slug} faint`).toBe(p.faint);
    }
  });
});

describe('every var(--x) in src resolves', () => {
  // Set at runtime rather than in tokens.css: next/font variables and the ring length set in ui.tsx.
  const RUNTIME = new Set([
    '--font-instrument-serif',
    '--font-inter',
    '--font-jetbrains-mono',
    '--ring-length', // set inline by TickRing (ui.tsx)
    '--os-origin', // set per window by WindowFrame (the open animation origin)
  ]);

  it('finds only declared tokens or known runtime variables', () => {
    // Declared = tokens.css, plus custom properties that a shell stylesheet sets on a class (os.css, os-phone.css).
    const declared = new Set([...Object.keys(THEME), ...Object.keys(ROOT), ...Object.keys(decls(TOKENS))]);
    const files = [...walk(SRC)];
    for (const file of files) {
      if (file.endsWith('.css')) for (const name of Object.keys(decls(readFileSync(file, 'utf8')))) declared.add(name);
    }
    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/var\((--[\w-]+)/g)) {
        const name = m[1]!;
        if (!declared.has(name) && !RUNTIME.has(name)) missing.push(`${relative(SRC, file)}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('contrast (C-20, WCAG on win / win2 / chrome)', () => {
  // Floors per velvet-desktop-os.md 249-256: body text 4.5:1, gain and loss text 3:1 (the spec's own bar
  // for market colours). The one KNOWN entry is the Ink & Brass fg-faint exception the spec names
  // (4.4:1 on win2), with its measured value so any regression fails the test. Velvet owns the fix.
  const SURFACES = ['--color-ink-1', '--color-ink-2', '--color-chrome'] as const;
  const TEXT = ['--color-fg', '--color-fg-muted', '--color-fg-faint', '--color-gain', '--color-loss'] as const;
  const MARKET = new Set<string>(['--color-gain', '--color-loss']);
  const KNOWN: Record<string, number> = {
    // Ink & Brass faint text on win2 measures 4.44:1 (C-20). Faint text is banned on hover rows.
    'ink-brass|--color-fg-faint|--color-ink-2': 4.44,
  };

  for (const slug of ['ink-brass', 'broadsheet', 'phosphor', 'riviera'] as const) {
    it(`${slug}: body text 4.5:1, gain and loss 3:1, except the listed exception`, () => {
      const t = PALETTE[slug];
      const failures: string[] = [];
      for (const s of SURFACES) {
        for (const f of TEXT) {
          const r = contrast(hex(t[f]), hex(t[s]));
          const key = `${slug}|${f}|${s}`;
          const floor = KNOWN[key] ?? (MARKET.has(f) ? 3 : 4.5);
          if (r < floor) failures.push(`${key} ${r.toFixed(3)}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it('records the known exception with its measured value', () => {
    const faint = contrast(hex(PALETTE['ink-brass']['--color-fg-faint']), hex(PALETTE['ink-brass']['--color-ink-2']));
    expect(faint).toBeGreaterThanOrEqual(4.44);
    expect(faint).toBeLessThan(4.5);
  });

  it('holds Broadsheet gain on chrome at the spec 3:1 bar (measures 4.04:1, no waiver needed)', () => {
    const gain = contrast(hex(PALETTE.broadsheet['--color-gain']), hex(PALETTE.broadsheet['--color-chrome']));
    expect(gain).toBeGreaterThanOrEqual(3);
  });
});
