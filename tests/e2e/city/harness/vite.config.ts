// Builds the City e2e harness: a stand-in for Spec 1's CityWindow (city.html) and a stand-in
// Broker route (broker.html), plus the reference-seed city files. Output goes outside the repo.
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateCity, CITY_ID } from '../fixtures/generate-city';

const here = fileURLToPath(new URL('.', import.meta.url));
const OUT = process.env.CITY_HARNESS_OUT ?? join(tmpdir(), 'city-harness');

/** Turns Spec 1's Tailwind @theme tokens into plain :root custom properties for the harness. */
function tokensCss(): string {
  const src = readFileSync(join(here, '../../../../src/styles/tokens.css'), 'utf8');
  const decls = [...src.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => `  ${m[1]}: ${m[2].trim()};`);
  // next/font's variables, pointing at the same faces loaded below (review B2)
  const fontVars = `  --font-instrument-serif: "Instrument Serif";\n  --font-inter: "Inter";\n  --font-jetbrains-mono: "JetBrains Mono";`;
  const faces = FONTS.map((f) => `@font-face { font-family: "${f.family}"; src: url("/fonts/${f.out}") format("truetype"); font-weight: ${f.weight}; font-display: block; }`).join('\n');
  return `${faces}\n:root {\n${decls.join('\n')}\n${fontVars}\n}\nhtml, body { margin: 0; height: 100%; background: var(--color-ink-0); }\n#app { position: fixed; inset: 0; }\n`;
}

/**
 * The real faces the app self-hosts via next/font (Inter, Instrument Serif, JetBrains Mono).
 * The harness has no next/font, so it serves the same families from CITY_FONTS_DIR (default: the
 * box's Google fonts folder). Missing files fail the fonts test rather than silently falling back.
 */
const FONTS_DIR = process.env.CITY_FONTS_DIR ?? '/usr/share/fonts/truetype/sand-box/google';
const FONTS = [
  { family: 'Instrument Serif', file: 'Instrument Serif/InstrumentSerif-Regular.ttf', out: 'instrument-serif.ttf', weight: '400' },
  { family: 'Inter', file: 'Inter/Inter-VariableFont_opsz,wght.ttf', out: 'inter.ttf', weight: '100 900' },
  { family: 'JetBrains Mono', file: 'JetBrains Mono/JetBrainsMono-VariableFont_wght.ttf', out: 'jetbrains-mono.ttf', weight: '100 800' },
];

function fixtures(): Plugin {
  return {
    name: 'city-fixtures',
    generateBundle() {
      const city = generateCity();
      for (const [url, bytes] of city.files) this.emitFile({ type: 'asset', fileName: url.replace(/^\//, ''), source: bytes });
      for (const [v, m] of city.manifests) this.emitFile({ type: 'asset', fileName: `city/${CITY_ID}/manifest.v${v}.json`, source: JSON.stringify(m) });
      // my places for ?mine=1: a few storefronts and properties near the centre (client-only data)
      const mine = city.snapshot.entities.filter((e) => e.kind === 'storefront' || e.kind === 'property').slice(5, 8).map((e) => e.id);
      this.emitFile({ type: 'asset', fileName: 'fixture-info.json', source: JSON.stringify({ cityId: CITY_ID, mine, versions: [...city.manifests.keys()] }) });
      for (const f of FONTS) {
        const path = join(FONTS_DIR, f.file);
        if (existsSync(path)) this.emitFile({ type: 'asset', fileName: `fonts/${f.out}`, source: readFileSync(path) });
        else this.warn(`font missing: ${path}`);
      }
      this.emitFile({ type: 'asset', fileName: 'tokens.css', source: tokensCss() });
    },
  };
}

/** Records, per output chunk, how many bytes of three.js it contains (C-04 bundle analysis). */
function threeReport(): Plugin {
  return {
    name: 'three-report',
    generateBundle(_o, bundle) {
      const chunks = Object.values(bundle)
        .filter((c) => c.type === 'chunk')
        .map((c) => {
          const ch = c as unknown as { fileName: string; isEntry: boolean; isDynamicEntry: boolean; imports: string[]; dynamicImports: string[]; modules: Record<string, { renderedLength: number }>; facadeModuleId: string | null };
          const threeBytes = Object.entries(ch.modules)
            .filter(([id]) => id.includes('/node_modules/three/'))
            .reduce((a, [, m]) => a + m.renderedLength, 0);
          return { fileName: ch.fileName, isEntry: ch.isEntry, isDynamicEntry: ch.isDynamicEntry, facade: ch.facadeModuleId, imports: ch.imports, dynamicImports: ch.dynamicImports, threeBytes };
        });
      this.emitFile({ type: 'asset', fileName: 'bundle-report.json', source: JSON.stringify(chunks, null, 2) });
    },
  };
}

export default defineConfig({
  root: here,
  base: '/',
  resolve: { alias: { '@': fileURLToPath(new URL('../../../../src', import.meta.url)) } },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    rollupOptions: { input: { city: join(here, 'city.html'), broker: join(here, 'broker.html') } },
  },
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_CITY_E2E': '"1"', 'process.env.NEXT_PUBLIC_CITY_CDN': '""' },
  worker: { format: 'es' },
  plugins: [fixtures(), threeReport()],
  logLevel: 'warn',
});
