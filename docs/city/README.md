# City renderer (Spec 2)

`src/city/index.ts` is the seam. It exports types plus `createCityRenderer`. three.js is loaded
with a dynamic import, and only when the tier is T1 or T2.

| Folder | What lives there |
|---|---|
| `data/` | public-state shapes (Systems ruling), `canonical.ts` (the one serializer), `CityStore` (allowlist copy, pure `applyDelta`), manifest/hashed URLs, district names (spec 22) |
| `worker/` | CTY1 chunk format (integer cm, 128 m `{cx}_{cz}` grid), decoder, Web Worker client (falls back to decoding inline) |
| `tiers/` | tier choice (override → no WebGL2 → battery saver → T2), the 2 s fps measurement |
| `renderer/` | render-on-demand loop, camera maths, three.js scene (one shared ShaderMaterial), picking, overlays, dusk light, label layout, cut-away, T0 picture |
| `table/` | "View as table" (CTY-05), money/P&L formatting ("unavailable" when unknown) |
| `chrome/` | control sheet, labels, long-press menu |
| `art/` | tokens read with getComputedStyle, OKLab ramps (no colour literals) |
| `diagnostics/` | frame stats, `ui.perf` sample |

## Tests

```
npx vitest run -c tests/unit/city/vitest.config.ts        # unit (node)
npx playwright test -c tests/e2e/city/playwright.config.ts # e2e: builds a vite harness, serves it
```

The e2e harness (`tests/e2e/city/harness`) has two pages:
- `city.html` drives the renderer through `import('@/city')` with the fixture city and test hooks.
- `citywindow.html` mounts Spec 1's real `src/apps/city/CityWindow.tsx` in a real shell store (C-05).
- `broker.html` stands in for the Broker route. It is used for the bundle check (C-04).

Test cities come from `tests/e2e/city/fixtures/generate-city.ts`. This generator is tooling only.

Evidence (screenshots, perf JSON) goes to `CITY_EVIDENCE_DIR`, which defaults to the OS temp
folder. It is never committed.

## Data flow
Manifest (`/city/{cityId}/manifest.json`, the only mutable short-cache file) → the delta it lists
for my base version, otherwise its snapshot. Snapshot, deltas, chunks and ground are content-hashed
(`/city/{cityId}/h/{sha256}.{ext}`, hash of the uncompressed bytes). Applying a delta reproduces the next
snapshot byte for byte (17-AT-21 test in `tests/unit/city/data.test.ts`).

## Seam (agreed with Front Dev, PR #2 07b6de3)
`myEntityIds: readonly string[]` (required), `onPerfSample?(s)` with
`{tickRenderMsP50, tickRenderMsP95, fps, heapMb, renderTier}`, `handle.setMyPlaces(ids)`, `CityOverlay` exported.
The `ui.perf` window event is only sent when the e2e/dev test hook is on.

## Open proposals [P]
- `channel.clockTick` (for "City update pending" at > 720 ticks of lag) and `worldId` for the URLs are not on the seam yet.
- A quote source for the Movers lens and the table's Today column. Without one they show "unavailable".
- A repeated tap on the same spot (within 8 px and 1.5 s) picks the next entity behind it.
