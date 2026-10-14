# Port Avalon V2 — Acceptance & Verification Report

## 1. Environment & Branch Summary

- **Implementation worktree**: `.hermes/worktrees/city-v2`
- **Branch**: `cities/inhabitable-v2` (based on pinned prototype commit `3119fd0895cc55b371f53d6a651bc7a098c9632a`)
- **Main repository (`C:/Users/Mathis/Projects/trading-game`)**: untouched.
- **OS / Runtime**: Windows `10.0.26200` (`win32`), Node `v22.13.1`, Playwright Chromium `153.0.8010.12`.
- **Headless WebGL Renderer**: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` (`software: true`).

---

## 2. Verification Commands & Real Results

| Command | Result | Details |
|---|---|---|
| `node --test prototypes/cities/tests/*.test.mjs` | **PASS** (exit 0) | **53 / 53** unit and generator tests passed across 15 test suites (`access`, `access-audit`, `archetypes`, `avalon-art`, `cache-key`, `entrance-access`, `generation`, `inhabit`, `junction-style`, `label-layout`, `lru`, `parcel-id`, `quality`, `roadgraph`, `tooling`, `worker-fallback`). |
| `node prototypes/cities/tools/check-source.mjs` | **PASS** (exit 0) | `source checks passed` — zero conflict markers, all `.js`/`.mjs` syntax checks clean. |
| `node prototypes/cities/tools/sync-artifact.mjs --check` | **PASS** (exit 0) | `artifact.html is in sync` with `index.html`. |
| `node prototypes/cities/tools/audit-city.mjs avalon` | **PASS** (exit 0) | `auditedRoadServed: 2289`, `specialModeCount: 4`, `legacyUnaudited: 0`, `occupiedInvalid: 0`, `candidateCount: 2803`, `servedCount: 2289`, `vacantCount: 4`, `rejectedCount: 510`. |
| `node prototypes/cities/tools/run-browser.mjs` | **PASS** (exit 0) | **18 / 18** Playwright browser tests passed across `smoke.spec.mjs`, `appearance.spec.mjs`, `inhabit.spec.mjs`, `selection.spec.mjs`, and `regression.spec.mjs`. |
| `node prototypes/cities/tools/capture.mjs http://127.0.0.1:3650 prototypes/cities/evidence/after` | **PASS** (exit 0) | Captured 15 canonical views (`overview`, `oldharbor`, `midtown`, `gilthill`, `westbank`, `docks` at 15:00; `overview`, `oldharbor`, `midtown` at 21:00; plus 4-orientation rotations for `oldharbor` and `gilthill`). |

---

## 3. Completed Phases & Vertical Slices

### Phase A — Trustworthy Tooling & Baseline
- Portable `check-source.mjs` and `browser-ready.mjs` fail-fast harness (catches `pageerror`, `console.error`, and shader compile failures immediately).
- Replaced broken `file:///C:/.../eval/...` Playwright imports in `cityshot.mjs` and `lensshot.mjs`.
- Captured untouched reference screenshots in `prototypes/cities/evidence/before/` and recorded initial baseline metadata in `prototypes/cities/evidence/baseline.json`.

### Phase B — Deterministic Identities & Inspectable Topology
- Added `parcelId(city, seed, x, y, rot)` (`src/parcel-id.js`) and `blockKey` (`seedCell`) on every generated building while keeping numeric `rec.id` render indices intact.
- Preserved `front` entrance orientation on `buildArchetype` records.
- Exported additive `roadGraph: { nodes, edges }` and parent `edgeId` provenance on road/driveway segments.
- Keyed IndexedDB geometry cache by `cityCacheKey(id, seed, GEN_VERSION)` (`src/cache-key.js`).

### Phase C — Honest Road & Entrance Access
- Implemented `entranceOf` and deterministic cardinal-grid A* `routeGrid` (`src/access.js`) plus `resolveEntranceAccess` and `thresholdOf` (`src/entrance-access.js`).
- Enforced full corridor width (`1.8 m` pedestrian, `3.4 m` driveway, `4.0 m` track) and grade limits (`0.15` pedestrian, `0.12` vehicle) from door threshold through parcel gate to public street edge.
- Reserved accepted front access corridors in `gen.js` before placing subsequent lots.
- Replaced silent lot discard on Port Avalon with auditable `parcelDiagnostics` (`candidateCount = servedCount + vacantCount + rejectedCount`).
- Built independent `auditCityAccess` (`src/access-audit.js` & `tools/audit-city.mjs`) verifying 0.5 m sampled corridors, water/footprint clearance, grade, and BFS connectivity to an arterial on the same landmass (`occupiedInvalid: 0`).
- Preserved `requiredAccess` spurs, removed tight hill self-loops, and restricted zebra crossing paint via `eligibleJunctionArm` (`src/junction-style.js`) so crossings never land on driveways, bridges, water, or dock service arms.

### Phase D — Coherent Architecture & Bounded Art Pass
- Authored Port Avalon district recipes and block-correlated cornice heights (`src/avalon-art.js`), applied identically in worker and main-thread fallback paths.
- Strengthened Westbank's neighbourhood centre so the starter district forms a cohesive, walkable residential/shop fabric rather than empty rural filler.
- Added physical `addEntrance` doors and lintels on ordinary building facades and `addShopFrontage` sign panels/frames on leasable shop units (`src/archetypes.js`).
- Removed the 8% focus and 38% hover brass facade repaints from `partFrag` (`src/shaders.js`); hover and focus now use ground halos and the inverted-hull silhouette outline so brick and stone remain brick and stone.
- Detached Normal view lighting from market mood (`uMarketMode` uniform active only in Market lens).
- Added `uDetail` quality-tier gating (`high: 1`, `balanced: 0.5`, `low: 0`) for microscopic material noise.

### Phase E — Local First-Business Ownership Slice
- Implemented pure, immutable `initialState`, `lease`, `rename`, `upgrade`, and `validateStoredState` (`src/inhabit.js`) plus deterministic `buildDemoUnits` (`src/demo-units.js`) offering three serviced ground-floor shops in Old Harbor (`600 demo FDL`), Westbank (`800 demo FDL`), and Northgate (`1000 demo FDL`), alongside an upper-floor NPC tenant (`Harbor Marine Assay`) demonstrating multi-occupancy.
- Added the `Try living here` button and `Local ownership demo` panel (`index.html`, `src/main.js`) with `View premises`, `Lease for [amount] demo FDL`, safe business naming (`A&B Coffee` works; `<img ...>` rejected), and one-stage frontage improvement (`300 demo FDL`) backed by `uFrontage` data texture without regenerating the city.
- Persisted demo state under `localStorage['cities.inhabit.v1']` scoped to `worldKey`, with explicit reset when layout version changes.

### Phase F — Legibility, Cutaway & Responsive Interaction
- Changed default cutaway mode to `selected` (`Selected` chip active at load; zero buildings cut until a building is selected).
- Added deterministic priority-based `packLabels` (`src/label-layout.js`) with UI panel exclusion rectangles so labels never stack on top of each other or hide behind panels.
- Unified desktop right-side controls and lens legend into `#right-dock` so `Find my buildings` is never covered by the Market legend, and adapted narrow/short viewports (`390×844`, `844×390`) into a `Map` / `Selection` bottom sheet (`<= 45dvh`) with `>= 44×44 CSS px` hit targets.

### Phase G — Resource Correctness & Diagnostics
- Added `window.__cities.diagnostics()` exposing renderer info, quality tier, draw calls, triangles, render count, geometry/texture memory counts, load timings, and active LRU cache keys.
- Removed synchronous per-frame `gl.readPixels` from `CityView.frame()`.
- Implemented pure `qualityWindow` (`src/quality.js`), `disposeCity()` texture/geometry/material cleanup in `CityView`, and a 2-entry `LRU` city cache (`src/lru.js`), verified by cycling Avalon/Kaiyo 10 times with zero geometry or texture growth.
- Benchmarked `TILE` sizes `400`, `600`, and `800` (`evidence/tile-400.json`, `evidence/tile-600.json`, `evidence/tile-800.json`) and retained `TILE = 400` (`566,596` triangles and `90.7 ms` load vs `875,068` triangles and `131.9 ms` load at `800`).

### Phase H — Integration Contract & Artifact Sync
- Documented the server integration and 5-stage urban growth contract in `prototypes/cities/docs/game-integration.md`.
- Added mechanical `prototypes/cities/tools/sync-artifact.mjs` (`--check` verified) and synchronized `prototypes/cities/artifact.html`.

---

## 4. Rejected Experiments & Limitations

1. **Rejected experiment — Gilt Hill arterial ban**: Early in Phase C, blocking arterials from entering Gilt Hill caused an isolated collector component when combined with Westbank's centre. Restoring natural arterial passage while fixing `connectGraph` to prioritize arterial-bearing components eliminated all isolated components (`occupiedInvalid: 0`).
2. **Rejected experiment — `TILE = 600` / `800`**: Larger culling tiles reduced draw calls slightly (`57 -> 50 -> 40`) but increased visible unculled triangles by 24%–54% (`566k -> 701k -> 875k`) and increased `CityView.load` time (`90.7 ms -> 139.0 ms`). Retained `TILE = 400`.
3. **Hardware & Mobile Gate Status**:
   - Headless Playwright on this machine runs on **SwiftShader** (`software: true`). Per Section 8 of the plan, SwiftShader measurements are recorded for functional regression only and **do not** count as the hardware GPU or real mobile device gate.
   - **Desktop hardware GPU gate**: Requires interactive verification in the user's hardware-accelerated desktop browser.
   - **Mobile hardware gate**: **BLOCKED** pending testing on a physical midrange phone.
4. **User Visual & Usability Review**:
   - All 15 matched after-captures (`prototypes/cities/evidence/after/`) and close-up shop Stage 0 / Stage 1 captures (`prototypes/cities/evidence/phase-d2/shop-*.png`) have been inspected with the image reader tool and verified free of gold-painted facades, water-crossing zebras, or horizon seams. Final aesthetic taste approval and hands-on usability sign-off remain with the user.
