# City renderer (Spec 2)

`src/city/index.ts` is the seam. It exports types plus `createCityRenderer`. three.js is loaded
with a dynamic import, and only when the tier is T1 or T2.

| Folder | What lives there |
|---|---|
| `data/` | snapshot and delta shapes, `CityStore` (idempotent by stateVersion, keeps public fields only), snapshot URL |
| `worker/` | binary chunk format v1, decoder, Web Worker client (falls back to decoding inline) |
| `tiers/` | tier choice (override → no WebGL2 → battery saver → T2), the 2 s fps measurement |
| `renderer/` | render-on-demand loop, camera maths, three.js scene (one shared ShaderMaterial), picking, overlays, light, T0 picture |
| `table/` | "View as table" (CTY-05) |
| `chrome/` | control sheet, labels, long-press menu |
| `art/` | tokens read with getComputedStyle, OKLab ramps (no colour literals) |
| `diagnostics/` | frame stats, `ui.perf` sample |

## Tests

```
npx vitest run -c tests/unit/city/vitest.config.ts        # unit (node)
npx playwright test -c tests/e2e/city/playwright.config.ts # e2e: builds a vite harness, serves it
```

The e2e harness (`tests/e2e/city/harness`) has two pages:
- `city.html` stands in for Spec 1's `CityWindow.tsx` and reaches the renderer only through `import('@/city')`.
- `broker.html` stands in for the Broker route. It is used for the bundle check (C-04).

Test cities come from `tests/e2e/city/fixtures/generate-city.ts`. This generator is tooling only.

Evidence (screenshots, perf JSON) goes to `CITY_EVIDENCE_DIR`, which defaults to the OS temp
folder. It is never committed.

## Proposals awaiting sign-off [P]
- `CityRendererOptions.myEntityIds?`: how the shell passes "my places", computed client-side.
- `ui.perf` is sent as a `window` CustomEvent named `ui.perf`. The sink belongs to Spec 1.
- Wire formats: the snapshot JSON (`data/types.ts`), the chunk binary (`worker/format.ts`) and the
  snapshot URL `/city/{id}/v{n}/snapshot.json`.
- A repeated tap on the same spot picks the next entity behind it, so occluded buildings can still be reached on the map.
