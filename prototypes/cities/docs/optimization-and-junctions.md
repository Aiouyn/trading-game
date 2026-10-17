# Rendering and junction handoff — 2026-10-17

Implemented in the standalone city prototype. The main game's integration is still separate.

## Road surfaces

`src/junction-mesh.js` and `src/gen.js` replace overlapping full-length road ribbons at junctions with clipped approaches and one shared intersection surface. Mouths use the approach's exact tangent and height; rounded corner pavements stop at the mouths instead of crossing the carriageway. Short edges retain usable road length. Terrain is graded before parcels are placed, and adjacent overlapping junction beds share a grade so their shoulders cannot bury each other. Water is protected.

The generated geometry cache version is `inhabitable-v2-45-junction-surfaces`; keep this version when integrating so old cached meshes are not reused.

Actual generator audits:

| City | Junction vertices | Nonfinite | Buried vertices | Buried triangle centers |
|---|---:|---:|---:|---:|
| Avalon | 5,407 | 0 | 0 | 0 |
| Kaiyo | 11,677 | 0 | 0 | 0 |

These checks establish terrain clearance at sampled vertices and triangle centers, not exhaustive geometric proof for every seed. Inspect the six actual renders in `evidence/performance/junctions/` (T and cross junctions, plan and two oblique angles). Buildings are hidden there to expose the road surfaces. `evidence/plans/full.png` and the layer sheets have also been refreshed from the renderer.

## Rendering work

- Quality tiers cap both DPR and total render pixels: high 2.4 million, balanced 1.4 million, low 700,000. Saver uses the low budget. Automatic quality responds to sustained interaction frame times; a manual selection remains respected.
- Ground and outskirts are culled by tile. Balanced/low have coarser ground away from protected roads, intersections, and foundations. Building bodies and roof silhouettes remain present at every tier.
- Static landscape noise is baked once per renderer into a 512-square texture. Water avoids land shading work. Low-quality building shading keeps windows, night lighting, and lenses with less microscopic detail.
- Instance buffers are allocated to their final typed-array sizes. Visible tree billboards are compacted into one draw; unchanged visible sets reuse the buffer. Outlines submit selected instances only.
- Chunk uploads have a frame budget and continue naturally until complete. Label layout runs when its inputs change. Asynchronous GPU queries are bounded; ordinary rendering has no synchronous pixel readback.
- Returning to a previously culled area restores its terrain and roads. City disposal releases geometry, textures, materials, labels, and retained city references. The demo caches one city on devices reporting at most 4 GB memory, otherwise two.

## Measurements

Before/after profiles and screenshots are retained under `evidence/performance/`. The baseline uses the source snapshots in `before/source/`, also served by `baseline-runtime/` for the hardware comparison. Both versions use Avalon seed 1701 and the same camera path, 1280×800 CSS viewport, device scale 2. Each tier is explicitly selected, shaders are warmed, and 16 animation-frame intervals are sampled while panning. These are short comparison runs, not the longer five-run interaction protocol in `performance-protocol.md`.

### SwiftShader software renderer

Median browser frame intervals, milliseconds (lower is better):

| Camera / tier | Before | After | After triangles |
|---|---:|---:|---:|
| Overview / high | 416.7 | 449.9 | 365,737 |
| Overview / balanced | 283.4 | 266.6 | 331,899 |
| Overview / low | 283.4 | 216.7 | 331,899 |
| Street / high | 366.7 | 366.7 | 175,711 |
| Street / balanced | 216.7 | 200.0 | 163,369 |
| Street / low | 216.7 | 149.9 | 163,369 |

Low street view reduces submitted triangles by 48% (314,561 → 163,369) and frame time by 31%. Low overview frame time improves by 24%. High overview is 8% slower on software despite fewer triangles. Software rendering remains slow and does **not** establish acceptable mobile FPS.

### Native desktop GPU

Verified renderer: ANGLE / NVIDIA GeForce RTX 3080 Ti / Direct3D11, not SwiftShader. Every sampled camera/tier stayed around 16.7 ms median browser cadence; p95 was at most 16.8 ms. The display cap hides throughput differences. Asynchronous GPU timer medians below are separate from browser cadence:

| Camera / tier | Before GPU ms | After GPU ms |
|---|---:|---:|
| Overview / high | 2.08 | 3.69 |
| Overview / balanced | 1.67 | 0.80 |
| Overview / low | 1.84 | 0.66 |
| Street / high | 1.21 | 1.81 |
| Street / balanced | 1.18 | 1.00 |
| Street / low | 1.11 | 0.69 |

High quality costs more GPU time with the repaired surfaces and preserved building geometry. Low/balanced are the faster paths. These short samples do not clear every acceptance gate or establish a statistically stable speedup.

### Loading and memory tradeoffs

The native-GPU cold run's worker generation was 2,536 → 2,656 ms; main scene load 190 → 279 ms; navigation-to-ready 3,859 → 4,144 ms. Extra junction geometry and terrain variants increase persistent data/work. Generated typed-array bytes are 25,291,976 → 26,484,004 (about +1.14 MiB); this excludes GPU allocations, JS objects, and additional renderer terrain variants. No claim of lower total memory or faster cold loading is made. Temporary instance packing and lifetime behavior improved, but the protocol's 100 ms load-task goal remains unmet. The generator changed parcel placement around junctions, so baseline/candidate building counts differ.

## Verification

- 70 unit tests passed, including junction mouths/winding, terrain grading, protected LOD, typed instance packing, pixel budgets, and deterministic noise.
- 22 browser tests passed: all six cities, natural deferred loading, culling return, selected outlines, 4K low-tier pixel budget, hover appearance, controls, selection, idle rendering, and repeated city-switch resource bounds.
- Source syntax/conflict checks and artifact synchronization passed.
- Vertex/triangle-center terrain audits passed for Avalon and Kaiyo. Evidence: `junction-audit.json`, `junction-audit-kaiyo.json`, `unit-tests.txt`, `browser-tests.txt`.

## Integrating into the game

The prototype imports the pinned Three.js `0.170.0` build through its HTML import map. Supply that dependency through the game's build system and include the `src/` module dependency graph; do not copy only `render.js`. WebGL2 is required. The demo currently also has CDN/font dependencies, so it is not an offline package.

`CityView` from `src/render.js` accepts `(canvas, labelLayer)`. Give the canvas a real CSS size, then call `load(city)` with the generated city and its prepared personality attached. The game should own one animation loop calling `frame(dt)` (seconds); do not also run the demo's `main.js` loop. Call `resize()` when the containing panel changes size. `setQualityTier('high' | 'balanced' | 'low')`, `resetAutoQuality()`, and `setSaver(boolean)` are available. Call `dispose()` when unmounting the view. Keep gameplay state separate from generated/render data.

Reuse the module-worker generation/cache path in `gen.worker.js` and `main.js`: it prepares the personality consistently, generates off the main thread, and transfers typed-array buffers. Those buffers detach from the worker on transfer. Preserve request IDs when switching cities so a stale worker response cannot replace the latest request.

Before a game release: test a real mobile/integrated-GPU device, longer pan/zoom/selection runs, and cold-load responsiveness in the game's actual UI. The desktop result is usable, but "runs on anything" is not verified.
