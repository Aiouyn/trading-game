// Builds the City e2e harness: a stand-in for Spec 1's CityWindow (city.html) and a stand-in
// Broker route (broker.html), plus the reference-seed city files. Output goes outside the repo.
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateCity } from '../fixtures/generate-city';
import { snapshotUrl } from '../../../../src/city/data/urls';

const here = fileURLToPath(new URL('.', import.meta.url));
const OUT = process.env.CITY_HARNESS_OUT ?? join(tmpdir(), 'city-harness');

/** Turns Spec 1's Tailwind @theme tokens into plain :root custom properties for the harness. */
function tokensCss(): string {
  const src = readFileSync(join(here, '../../../../src/styles/tokens.css'), 'utf8');
  const decls = [...src.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => `  ${m[1]}: ${m[2].trim()};`);
  return `:root {\n${decls.join('\n')}\n}\nhtml, body { margin: 0; height: 100%; background: var(--color-ink-0); }\n#app { position: fixed; inset: 0; }\n`;
}

function fixtures(): Plugin {
  return {
    name: 'city-fixtures',
    generateBundle() {
      const v1 = generateCity();
      // v2: same geometry, one public rename — the target of "delta with unknown base → snapshot".
      const v2snap = { ...v1.snapshot, stateVersion: 2, entities: v1.snapshot.entities.map((e, i) => (i === 0 ? { ...e, name: `${e.name} (renamed)` } : e)) };
      const files = new Map(v1.files);
      files.set(snapshotUrl(v2snap.cityId, 2), new TextEncoder().encode(JSON.stringify(v2snap)));
      for (const [url, bytes] of files) this.emitFile({ type: 'asset', fileName: url.slice(1), source: bytes });
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
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_CITY_E2E': '"1"' },
  worker: { format: 'es' },
  plugins: [fixtures(), threeReport()],
  logLevel: 'warn',
});
