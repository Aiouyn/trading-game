# Port Avalon V2 — a coherent, beautiful, inhabitable city

## Goal
Make Port Avalon a distinctive, logically connected, responsive isometric city in which leasing and improving a small business feels tangible, without turning the financial game into a mandatory city-management game.

## 1. Scope, context and non-negotiables

### Verified starting point

Inspected on October 14, 2026. These are repository observations, not claims that new code or visual tests have run.

- Active workspace: `C:/Users/Mathis/Projects/trading-game`, branch `main`, with unrelated modified and untracked work. **Do not implement this plan in that checkout.** The plan itself lives there as requested.
- Prototype worktree: `C:/Users/Mathis/Projects/trading-game/.claude/worktrees/cities`.
- Prototype branch: `proto/cities`.
- Exact inspected commit: `3119fd0895cc55b371f53d6a651bc7a098c9632a`.
- Prototype worktree was clean when inspected.
- Launch: `node prototypes/cities/serve.mjs 3610`. An existing server was serving this version in the preceding turn. Do not kill or replace it implicitly.
- The prototype is plain JavaScript ES modules and an HTML page, **not the Next.js application**. `prototypes/cities/package.json` contains only `{"type":"module"}`.
- `index.html` currently loads Three.js `0.170.0` from a CDN through an import map. Do not upgrade it during this work.
- Root manifest declares `@playwright/test` and Node >=22.13. Actual inspected Node: v26.7.0. Playwright resolves from the main repository's `node_modules`.
- `tools/cityshot.mjs` has an absolute import pointing into a deleted `eval` worktree. That path does not exist. Fix tooling before trusting screenshots.
- Five cities plus the separate Isla Serena estate scene exist. Port Avalon seed is `1701`, size `2400` metres. Its named districts include Old Harbor, Midtown, Eastside Docks, Gilt Hill, Northgate, Westbank and Riverside Lofts.
- Previous conversation contains reports of performance gains and screenshots. They are historical reports, **not new hardware measurements**. Reproduce the baseline.

### Existing code map

All paths below are relative to the implementation worktree root.

| File | Actual responsibility / important constraint |
|---|---|
| `prototypes/cities/src/personalities.js` | Terrain functions, district centres, street fields, predefined arterials, palettes, archetype weights and height ranges |
| `prototypes/cities/src/gen.js` | Raster terrain → streets → graph → blocks → lots → access → buildings → demo owners → trees → growth → output |
| `prototypes/cities/src/roadgraph.js` | `planarize`, `cleanGraph`, `connectGraph`, `buildRoadGraph`, `SegGrid`; graph edges have numeric `a`, `b`, `cls`, `pts`, string `level` |
| `prototypes/cities/src/archetypes.js` | `Parts`, `buildArchetype`, landmarks and vegetation; packed part `STRIDE = 18`; numeric building IDs index renderer arrays |
| `prototypes/cities/src/render.js` | `CityView`, instancing, 400 m tiles, ground simplification, billboards, cutaway, labels, picking, adaptive pixel ratio |
| `prototypes/cities/src/shaders.js` | Building, road, ground and outskirts GLSL; facade material is currently inferred from colour |
| `prototypes/cities/src/outskirts.js` | 50 m outskirts grid extending to 7.2 km; shoreline height cap and outer highways |
| `prototypes/cities/src/lenses.js` | Eight lenses including Normal, per-building tint and bit 1 |
| `prototypes/cities/src/seethrough.js` | Occlusion boxes, focus and occluder flags; keep those flags independent of lens bit |
| `prototypes/cities/src/search.js` | Search records use numeric building IDs or district fly-to positions |
| `prototypes/cities/src/main.js` | City switching, worker loading, controls, selection, cards, `window.__cities` debug hooks |
| `prototypes/cities/src/gen.worker.js` | Worker generation; currently awaits cache write before transferring result |
| `prototypes/cities/src/citycache.js` | IndexedDB cache keyed only by city ID + `GEN_VERSION = 'gen-1'` |
| `prototypes/cities/index.html` | UI markup and CSS |
| `prototypes/cities/artifact.html` | Derived wrapperless HTML; must stay synchronized, not become a second source of truth |

### Important actual defects / limitations to address

1. Access currently measures distance from **any footprint edge**, not an entrance. A rear wall near an unrelated road can pass.
2. `gen.js` drops lots for which its straight-line driveway search fails. It exports counts, not a recoverable explanation for every rejection.
3. `city.graph.nodes` currently contains a **count**, not the node coordinates. Edges are not exported. Keep that compatibility field and add a separate `roadGraph` object.
4. Graph intersections currently have no explicit grade/layer handling. Rail is appended after graph construction. Do not introduce false rail/road connections.
5. Numeric building IDs are array positions. They are unsuitable as persistent ownership keys across generation changes.
6. Ownership is fake demo data written directly onto generated building records by `seatDemoOwners`.
7. Renderer selection calls `setHover(b.id)`; the fragment shader applies a 38% brass tint for hover, on top of an 8% focus tint. That explains a plausible source of the heavy gold look; verify with a captured comparison rather than calling it proven visually.
8. Normal scene lighting currently reacts directly to market mood for headquarters.
9. Main-thread scene construction still exists even with worker generation. Do not promise zero loading stalls because terrain generation is off-thread.
10. `main.js` retains generated cities in an unbounded Map. `render.js` disposes some scene objects, but texture/query/shared-resource lifetimes need an inventory before changing cleanup.
11. On hardware without GPU timer queries, `frame()` performs a synchronous `readPixels` after every draw. Remove this production synchronization; do not use CPU submission time as if it were GPU time.

### Product decisions already agreed

- City = the physical expression of the same financial life. Trading remains directly accessible without spatial navigation.
- Company, building, unit, occupant and owner are separate concepts.
- Lease first; purchase, renovation and development are later progression.
- Founding a company does not spawn a skyscraper. Several businesses can share one building.
- Addresses do not move because somebody's rank changes.
- Buildings should have believable physical entrances and street frontage.
- No cars or car-light particles. Do not reintroduce them for liveliness.
- No sound in this release.
- No interior decoration, collectible displays, customizable roofs, terraces, planting or courtyards. Architectural roofs still exist; they simply are not a player customization system.
- No compulsory walking, hunger, commuting, rent-check chores, timed paid skips or real-money purchases.
- Do not fabricate multiplayer activity. Label the ownership slice as a local demo.
- Port Avalon receives the authored art pass first. Other cities must remain functional; they do not receive five simultaneous redesigns.

### Deliverable boundaries

This release includes: reproducible evidence, Port Avalon structural improvements, a bounded art pass, better selection/UI, a local lease/name/upgrade loop and measured performance.

This release does **not** include: production server economy integration, player construction anywhere on the map, cross-player leases, new district expansion simulation, player governance, interior scenes, a new rendering engine, or a world rewrite.

A short integration-contract document is included so the prototype does not paint future work into a corner. It is not permission to implement the full economy.

## 2. Architecture / proposed approach

Keep the existing Three.js renderer, worker pipeline, instanced geometry and city personalities; add small pure modules around access, identity, visual recipes and local occupancy rather than replacing the generator wholesale. Separate immutable generated geography from mutable demo occupancy, retaining numeric render IDs while adding persistent parcel/unit keys. Improve one vertical slice at a time, measuring the actual browser and reviewing matched screenshots after each visual change.

## 3. Art direction — implementation constraints, not inspiration alone

**Target:** an illustrated harbour financial city, with warm masonry, slate, subdued blue-green water, readable street walls and sparse brass accents.

### Composition rules

- Whole-city view: bay and river first, Old Harbor second, Midtown height cluster third. Do not distribute towers uniformly.
- Old Harbor: connected narrow masonry frontages; mostly 3–5 storeys; a few civic exceptions; street curvature tied to the port. No random skyscrapers inside the old fabric.
- Midtown: midrise street-wall base, towers behind/above it; a cluster rather than one giant tower on every parcel. Preserve the Exchange's visual distinction.
- Eastside Docks: low warehouses, long roofs, loading access and coherent quay lines. Do not place cafe-style zebra crossings across every service entrance.
- Gilt Hill: low detached buildings, generous gaps and contour-following lanes. No tight ornamental loops pretending to be arterials.
- Westbank/Northgate: credible starter and middle-income streets, not empty filler around wealthy areas.
- Existing parks are intentional negative space. Failed lots are not automatically renamed parks to hide failures.
- Streets meet at plausible angles. Do not force every Old Harbor junction to 90 degrees. New Midtown perpendicular streets should remain recognizably perpendicular.
- No arbitrary paint changes to make screenshots appear detailed. Every doorway, sign and lane has a spatial reason.

### Palette and detailing rules

- Preserve the existing palette families. Use masonry as the dominant built material; reserve glass for the business district.
- No added bloom, screen-wide glow, photographic textures, new postprocessing chain or saturated rainbow buildings.
- Ownership in Normal mode: a small pin/sign and restrained silhouette, not gold-painted walls.
- Market colours belong to Market lens. A price decline does not physically close a headquarters.
- Details must fade below their useful projected size. Roof gravel, brick joints and road grain must not shimmer at district scale.
- At close view an entrance and frontage must be understandable without an ownership label.
- No additional random shader noise before structural and silhouette checks pass.

### Views to approve

Use identical hour, yaw, scale, viewport and quality tier before/after. Coordinate convention: generator `y` becomes renderer `z`.

| Name | x | z | scale m/CSS px | Purpose |
|---|---:|---:|---:|---|
| overview | fit | fit | fit | skyline, bay, district hierarchy |
| oldharbor | -60 | -60 | 0.18 | connected street walls, entrances, crossroads |
| midtown | 300 | -400 | 0.20 | tower bases, street readability, focus |
| gilthill | -650 | -500 | 0.25 | access, slopes, loops |
| westbank | -950 | 150 | 0.20 | starter neighbourhood |
| docks | 880 | 230 | 0.25 | warehouse access and quay coherence |

Capture hour 15 for all, hour 21 for overview/oldharbor/midtown, and all four 90-degree camera orientations for the selected shop. Do not move a failing camera to a nicer street and call the same case fixed.

## 4. Execution discipline

### Worktree setup — future execution only

Run these from the active workspace only after plan approval:

```bash
git status --short
git -C C:/Users/Mathis/Projects/trading-game/.claude/worktrees/cities status --short
git -C C:/Users/Mathis/Projects/trading-game/.claude/worktrees/cities rev-parse HEAD
git worktree add -b cities/inhabitable-v2 .hermes/worktrees/city-v2 3119fd0895cc55b371f53d6a651bc7a098c9632a
cd .hermes/worktrees/city-v2
```

Expected: new clean branch based on the pinned prototype, not `main` or `v1`. If the prototype has advanced, inspect its diff and deliberately rebase the plan before continuing; do not silently reset it.

- Change only `prototypes/cities/**` in this worktree. The plan file stays in the original workspace.
- No push or merge into `main`/`v1`. Frequent scoped commits on the implementation branch are authorized by this implementation plan once execution is approved.
- At most two coding agents, and only one heavy browser benchmark at a time. Shared files `gen.js`, `render.js`, `shaders.js`, `main.js` have one owner at a time.
- Never claim a particular agent model unless the launching tool confirms it. The historical Claude runs are not current live agents.
- Use an unused local port, proposed `3650`; keep the user's existing `3610` preview intact until acceptance.
- Keep screenshots under the implementation worktree's `prototypes/cities/evidence/`; retain only canonical before/after sets and JSON results. Check disk headroom before long captures; do not delete another session's worktrees/profiles.

### Task timing and TDD convention

Each numbered **microtask** below is intended as 2–5 minutes of focused editing/inspection, excluding test runtime. A phase is not a five-minute task. If a microtask is larger, stop and split its named fixture/behavior into additional RED/GREEN pairs in the execution checklist rather than rushing.

For every behavior change:

1. Write the named failing test.
2. Run the exact command shown; record the expected assertion failure. A syntax error or missing import is not the desired RED. New modules may initially expose the correct signature with an explicit not-implemented error; then add the real assertion and verify it fails for absent behavior.
3. Add the smallest implementation.
4. Run the same command and the prototype unit suite.
5. Review the diff; commit only the files in the completed slice.

Existing-behavior characterization tests may pass immediately; label them characterization, not TDD evidence. Visual changes need both a structural assertion and a deliberately reviewed before/after capture; pixel matching cannot determine good taste.

**Shared verification commands** (from implementation root, after Phase A creates the scripts):

```bash
node --test prototypes/cities/tests/*.test.mjs
node prototypes/cities/tools/check-source.mjs
node prototypes/cities/tools/run-browser.mjs
node prototypes/cities/tools/audit-city.mjs avalon
node prototypes/cities/tools/capture.mjs http://127.0.0.1:3650 prototypes/cities/evidence/after
```

Success: exit code 0, no failed tests, no JS/shader errors, `audit-city` reports zero invalid occupied entrances. Screenshot generation alone is not visual approval.

## 5. Step-by-step tasks

### Phase A — trustworthy tooling and baseline

**A1 — Record the branch and renderer baseline (read-only).**

Files inspected: `prototypes/cities/README.md`, `package.json`, `src/render.js`, `src/main.js` (all prototype-relative). Run `git status --short`, `git rev-parse HEAD`, `node --version`, and check free disk space through a read-only system query. Write actual metadata into `prototypes/cities/evidence/baseline.json` during execution: commit, browser version, OS, viewport, DPR, GL vendor/renderer, software-renderer flag, cache state and date. Do not insert guessed hardware names.

**A2 — Add source validation.**

Create `prototypes/cities/tools/check-source.mjs` using Appendix A. Verification: `node prototypes/cities/tools/check-source.mjs` prints `source checks passed`. Add a test fixture containing a conflict-marker line to `prototypes/cities/tests/tooling.test.mjs`; the checker must reject it when called on that fixture directory. Remove the temporary fixture through the test's own cleanup. Expected RED is checker accepting that fixture, not a parser crash. Commit: `test(cities): portable source validation`.

**A3 — Replace the broken screenshot dependency resolution.**

In `prototypes/cities/tools/cityshot.mjs` and `tools/lensshot.mjs`, replace absolute imports with `import { chromium } from 'playwright';`. Verify the second file's actual import before editing. Add `tests/tooling.test.mjs` assertions that both scripts contain no `file:///C:` imports and run `node --check` on both. Expected RED: obsolete absolute path detected. Expected GREEN: portable imports, syntax checks exit 0.

**A4 — Add fail-fast browser readiness.**

Create `tools/browser-ready.mjs` from Appendix A. Change both screenshot scripts to use it and close browser instances in `finally`. Fail on shader compilation errors as well as `pageerror`. Test it against a test-only page that throws `CITY_TEST_FAILURE`; command `node --test prototypes/cities/tests/tooling.test.mjs` must demonstrate rejection within the configured timeout and include the original error text. Do not wait three minutes and print only a timeout.

**A5 — Add portable Playwright configuration and browser runner.**

Create `prototypes/cities/playwright.config.mjs`, `tools/run-browser.mjs`, and `tests/browser/smoke.spec.mjs` from Appendix B. Run `node prototypes/cities/tools/run-browser.mjs`. Expected: Avalon reaches `window.__cities.city`, canvas has nonzero dimensions, no page errors. Capture actual failures; do not assume software rendering is enabled. Commit: `test(cities): browser readiness and smoke harness`.

**A6 — Capture the untouched reference build.**

Create `tools/capture.mjs` using Appendix B. Run the capture command with output directory `prototypes/cities/evidence/before`. It must write the named view PNGs plus `capture.json`. Inspect all retained screenshots with an image-capable tool or ask the user for visual approval if unavailable. DOM text is not proof of graphical appearance.

**A7 — Baseline benchmark protocol.**

Create `prototypes/cities/docs/performance-protocol.md` containing section 8 of this plan. Capture an initial desktop run with no forced SwiftShader flags. If renderer identifies as software, record it and do not count it as the hardware gate. Use one benchmark browser at a time. No artificial claim of mobile validation from viewport emulation.

### Phase B — deterministic identities and inspectable topology

**B1 — Add stable parcel identity helper and tests.**

Create `src/parcel-id.js` and `tests/parcel-id.test.mjs` from Appendix C. Run `node --test prototypes/cities/tests/parcel-id.test.mjs`. Cases: same input, different seed, different city, invalid numeric input, insertion of an unrelated record. Expected GREEN: every case passes. Commit: `feat(cities): stable parcel keys distinct from render ids`.

**B2 — Preserve building entrance orientation.**

In `src/archetypes.js`, include `front: L.front ?? -1` in the `rec` created by `buildArchetype`. Add a test building with `front: 1` and assert the returned record retains it. Verify with `node --test prototypes/cities/tests/archetypes.test.mjs`. Do not infer front again from the final mesh.

**B3 — Attach stable keys without changing numeric IDs.**

In `src/gen.js`, immediately after a successful `buildArchetype`, assign `rec.parcelId = parcelId(P.id, P.seed, lot.x, lot.y, lot.rot)` and `rec.blockKey` from the block's raster seed cell, not `buildings.length`. Add `b.seedCell = k0` when a block is first created in the flood fill; if the block object is constructed later, carry the same `k0` into it. Keep `rec.id`, `parts` bid fields and `buildings[id - 1]` intact. A generation test must assert unique parcel IDs for ordinary buildings and identical IDs on a repeat run. Collision is an error, never append an array index suffix.

**B4 — Export the full road graph additively.**

In `src/gen.js` return value, preserve existing `graph` summary and add:

```js
roadGraph: {
  nodes: graph.nodes.map(([x, y]) => [x, y]),
  edges: graph.edges.map(({ id, a, b, cls, level, pts }) => ({
    id, a, b, cls, level, pts: pts.map(([x, y]) => [x, y]),
  })),
},
```

Before doing this, add `tests/generation.test.mjs` asserting each graph edge endpoint equals its corresponding node within 0.01 m, numeric IDs are valid and no endpoint is NaN. This will initially fail because `roadGraph` is absent. Run `node --test prototypes/cities/tests/generation.test.mjs`.

**B5 — Preserve access provenance in road-segment tags.**

At the `net.add` calls in the access section of `src/gen.js`, carry `{ cls, edgeId: ln.id, a: ln.a, b: ln.b }` for ordinary road segments. A generated driveway must retain its connection to the parent street rather than becoming an untraceable closest line. Add a fixture proving an entry's graph edge exists.

**B6 — Cache version and seed contract.**

Create a pure exported `cityCacheKey(id, seed, version)` in `src/cache-key.js` and use it in `citycache.js`, passing the seed from `gen.worker.js`. The complete function is `export const cityCacheKey = (id, seed, version) => JSON.stringify([String(id), Number(seed), String(version)]);`. Test differing seeds/versions and equal tuples. Set `GEN_VERSION` to `inhabitable-v2-1`. Existing cached geometry must not load under the new schema. Do not erase local demo ownership to clear a geometry cache.

**B7 — Commit this compatibility checkpoint.**

Run unit tests, source checks and browser smoke. All six cities must still load. Commit only B files with `feat(cities): expose stable geography contracts`. No artistic or topology rewrite in this commit.

### Phase C — honest road and entrance access

**C1 — Regression fixture for a wall near a road but an inaccessible entrance.**

Create `src/access.js` and `tests/access.test.mjs` using Appendix D. First implement/test only `entranceOf`. A building with rotation 0, depth 10 and front -1 has its entrance at `(x, y - 5)`; rotating by 90 degrees moves that entrance to the corresponding side. Run `node --test prototypes/cities/tests/access.test.mjs`.

**C2 — Safe path fixture.**

Add the `routeGrid` wall-detour fixture in Appendix D. RED: no path or straight path crossing the obstacle. GREEN: valid deterministic path around the obstacle with no diagonal corner-cutting. Add a fully enclosed entrance fixture returning `null`, not deleting the building.

**C3 — Grade and corridor-width fixtures.**

Extend access tests to reject a route that passes water at its side even when its centre is dry, and a route whose adjacent sampled heights exceed the chosen grade. Use `canStand(x,y)` and `canStep(a,b)` callbacks from Appendix D; generator callbacks sample the centre and offsets at half the required access width. Footpath maximum grade: 0.15; vehicle driveway maximum: 0.12. These are game-design constraints, not engineering-code claims.

**C4 — Build an entrance-access adapter for Avalon.**

Create `src/entrance-access.js`. Export `planEntranceAccess({ lot, entrance, goal, canStand, canStep, step, maxVisited })`. Its complete implementation is a direct wrapper around `routeGrid` with the supplied callbacks; no generator globals. In `gen.js`, build the callbacks from `W`, `occ`, `roadCls`, `H`, and the current lot footprint. The current lot's entrance threshold is permitted; all other building footprints are forbidden. The path must reach the public sidewalk/road edge associated with the goal's `edgeId`, not stop at a conveniently nearby unconnected driveway.

**C5 — Resolve goal candidates before routing.**

For each entrance, collect up to 8 nearest ordinary street projections through the existing `SegGrid`, sorted by distance then edge ID. Exclude rail, open-water segments and inaccessible bridge decks. Try direct corridors first, then grid routing in a box around entrance/goal with 20 m margin. Use 2 m cells and at most 4096 visited cells per candidate; farm tracks may use 4 m cells and 8192 visits. Route width: 1.8 m pedestrian entry, existing 3.4 m driveway, 4 m farm track. Emit explicit `path.kind` so pedestrian entries do not get car lane paint. If no safe route exists, return `unserviceable` with reason, not `served` based on proximity.

Test command: `node --test prototypes/cities/tests/entrance-access.test.mjs`. Required failures first: rear wall shortcut, water crossing, blocked corner, bridge-deck shortcut. Required success: direct entry, one obstacle detour, shared public lane.

**C6 — Reserve front access before accepting new Avalon lots.**

Modify the Avalon placement path in `gen.js`: calculate the selected frontage and entry corridor before stamping a lot into `occ`. Reserve that corridor so later candidates cannot fill it. Copy the actual frontage normal into the lot's `front`, not just whichever long side happens to be nearest after placement. Start with `frontageLots` (Gilt Hill), then the row-lot branch in a separate microtask. A fixture placing two adjacent lots must prove the second cannot block the first entrance.

**C7 — Convert silent rejection into an auditable vacant parcel.**

Replace the access-stage discard-only behavior for Avalon with `parcelDiagnostics`: original candidate ID, district, status, reason and path outcome. Invalid initial candidates can remain unbuilt, but are counted separately from occupied buildings. Never delete already occupied/leased parcels during an upgrade or phase change. Add fields `candidateCount`, `servedCount`, `vacantCount`, `rejectedCount`; verify their sum against the candidate count in code. Do not apply the new layout to all other cities before Avalon passes.

**C8 — Independent audit, not the routing function verifying itself.**

Create `src/access-audit.js` and `tools/audit-city.mjs`. Audit each emitted access polyline independently at 0.5 m spacing: starts at the recorded entrance within 0.5 m, reaches its recorded edge within 0.5 m after accounting for sidewalk half-width, avoids water/other footprints, meets grade and has a BFS path through exported `roadGraph` to an arterial in that landmass. Audit must also inspect the whole segment corridor, not just its vertices. Private estates and offshore landmarks receive an explicit access mode (`water`/`landmark`) and are not silently counted as road-served.

Verification: `node prototypes/cities/tools/audit-city.mjs avalon`; expected exit 0 and `occupiedInvalid: 0`. Inject one broken path in `tests/access-audit.test.mjs`; expected test demonstrates audit failure. Include fixture assertion that an unreachable isolated road does not pass.

**C9 — Fix specific graph topology defects under small fixtures.**

File: `src/roadgraph.js`; tests: `tests/roadgraph.test.mjs`.

Separate RED/GREEN cycles:

1. At-grade X crossing → one degree-four node.
2. T endpoint touching a segment → one degree-three node.
3. Disconnected parallel street → no accidental junction.
4. Short legitimate dead end serving a parcel → retained when tagged `requiredAccess`.
5. Ordinary self-loop with no frontage → rejected and counted.

Do not implement general grade separation this release. Keep railway out of the road graph as today; explicitly test that no `rail` network record is offered as a street goal. If an actual elevated road crossing must be added, introduce and preserve numeric `layer` through every `planarize` stage before connecting it.

**C10 — Reduce redundant crossing paint.**

Extract junction-paint eligibility into `src/junction-style.js` with tests. A crossing is allowed only at an at-grade junction with degree >=3, a sidewalk on both sides of that arm, class >=3, and enough approach length for the paint. No crossings on driveways, farm tracks, rail, bridge spans or service-only dock arms. Deduplicate by node ID + arm ID. Keep existing crossing dimensions initially. Integrate into `buildRibbons` in `gen.js`; capture Kaiyo as a regression even though its architecture is not being redesigned.

**C11 — Inspect fixed cameras before declaring roads improved.**

Run audit + capture. Review Gilt Hill and Old Harbor in all four orientations. Use source checks to ensure no traffic shader code is restored. Commit: `feat(cities): entrance-connected Avalon streets`. If access works but the hill loop still looks implausible, log its coordinates and fix its generating street field or explicit path, not just erase its paint.

### Phase D — coherent architecture rather than extra noise

**D1 — Introduce explicit Avalon art recipes.**

Create `src/avalon-art.js` from Appendix E and `tests/avalon-art.test.mjs`. It returns a cloned Avalon personality; other cities return unchanged. Tests: input not mutated, Old Harbor height cap, permitted facade palette, Gilt Hill retains scatter placement, no new roof/interior customization fields. Run `node --test prototypes/cities/tests/avalon-art.test.mjs`.

**D2 — Apply recipes consistently in worker and fallback.**

Both generation paths use `preparePersonality(PERSONALITIES[id])`. Browser reattachment to `city.P` must use the same prepared personality, not the original one. Increment `GEN_VERSION`. Worker/main-thread comparison test excludes timing but compares IDs, buildings, network and typed-array contents. One artistic change must not cause a fallback-only city variant.

**D3 — Block-correlated cornice heights.**

In the building loop of `gen.js`, use Appendix E's `avalonHeight` only for Old Harbor/Northgate/Westbank ordinary buildings. Inputs are block seed, parcel key and existing proposed height. Architectural families share a baseline per block and small per-parcel variation. Keep intentional landmarks and headquarters separate. Test order independence and bounded adjacent cornice variation. Do not reseed the shared `R` stream for this purpose.

**D4 — Visible entrance primitive for ordinary premises.**

Add `addEntrance` from Appendix E to `archetypes.js` after the archetype switch, only for supported ordinary solid building families. It uses the retained frontage orientation and follows the actual exterior wall inset for that family. Test generated part dimensions and world orientation in `tests/archetypes.test.mjs`. Do not attach a door to containers, cranes, boats or a facade behind an inaccessible wall.

**D5 — Shop frontage primitive.**

For the three selected lease-demo units only, add a simple dark sign panel above the entrance, plus a slim frame; no new texture atlas or per-letter 3D geometry. Naming text is a DOM label shown at close zoom/selection, using `textContent`. Stage 1 renovation changes only the curated sign accent and entrance frame. Test that the parcel footprint, address and numeric building ID do not change after renovation.

**D6 — Normalize shader focus colour.**

In `src/shaders.js`, remove `if (isFocus) base = mix(base, uBrass, 0.08);`. Change hover tint from `0.38` to `0.06`. Keep the existing inverted-hull silhouette width at 1.5 CSS px initially. Capture focus On/Off with Normal lens; do not compare Mine lens, which intentionally tints ownership. Test that changing focus cannot alter material IDs or source geometry. Visually verify that masonry remains masonry.

**D7 — Detach Normal lighting from mood.**

Add `uMarketMode` uniform to `render.js` (default 0) and `partFrag`. Change only the existing headquarters mood branch to `if (hq && uMarketMode > 0.5)`. In `main.js` `setLens`, assign the uniform to 1 only for `market`. Update the mood help text in `index.html` to `Market lens shows simulated returns. Normal view follows time of day.` Browser test: fixed time/camera, Normal mood -100 and +100 have equal canvas output with animation frozen; Market outputs differ. Freeze animation before comparing; otherwise water creates false differences.

**D8 — Gate microscopic materials by quality and distance.**

Keep existing anti-aliasing/fade logic. Add `uDetail` (1 high, 0.5 balanced, 0 low) and multiply only microscopic material contrast/noise, not silhouette, signs, terrain or ownership visibility. Low mode must not call the additional fine-noise branches. Write a browser test that all three tiers compile and preserve building/parcel counts. Capture Old Harbor close and overview. Do not solve performance with a uniformly blurry canvas alone.

**D9 — Approve the first art plate.**

Produce the six daylight views and three night views. Checklist: street-wall continuity, visible entrances, no fully gold focus building, no horizon seam, no road paint through water, skyline hierarchy. Request the user's approval of this bounded art pass before replacing the look of the remaining cities. If rejected, change one named dimension (massing/palette/road width/detail contrast) at a time, not all four together.

Commit: `feat(cities): authored Avalon architectural language` after tests and review; do not describe an unreviewed screenshot as approved.

### Phase E — ownership slice without a second economy

**E1 — Pure lease state and validation.**

Create `src/inhabit.js` and `tests/inhabit.test.mjs` from Appendix F. Use integer demo currency. Operations: lease one unit, rename business, improve frontage once. Building owner remains civic/NPC owner; leasing a unit does not transfer the building. Test insufficient cash, duplicate lease, missing unit, invalid name, duplicate upgrade, unchanged caller state and second tenant in another unit of the same building.

**E2 — Deterministic lease candidates.**

Create `src/demo-units.js`: choose one serviced non-landmark low/midrise premises in each of Old Harbor, Westbank and Northgate. Sort by parcel ID before selection, exclude existing HQ/crown demo buildings, require a recorded entrance path. IDs: `${parcelId}/ground/shop-1`; civic owner `city:avalon`; use `shop`. Also create a second non-leasable demo unit in one building to prove multi-occupancy semantics. If a district has no valid candidate, show an explicit unavailable offer—never put a shop in open sea or label an office tower as a kiosk.

Prices are clearly **demo-only**: initial cash 5000, lease cost 600, 800, 1000 respectively; frontage improvement 300. No recurring rent, earnings, trading bonuses or production balance conclusions in this slice.

**E3 — Render an offer panel.**

Modify `index.html` and `main.js`. Add a `Try living here` button, a panel titled `Local ownership demo`, visible demo cash, and three offer cards. Each card contains district, persistent address, premises type, upfront demo cost and `View premises`. That action calls existing fly-to/select behavior. The confirmation button says `Lease for [amount] demo FDL`. Use DOM creation/textContent for player strings; do not insert the new business name into existing `showInfo` HTML unsafely. Escape existing `title` before it enters that template as part of this same security slice.

Browser tests in `tests/browser/inhabit.spec.mjs`: choose offer, confirm, cash decreases once, property owner unchanged, unit occupant becomes demo company, map label appears. Repeated confirmation must not debit twice.

**E4 — Name the shop and update its visible identity.**

Input accepts 1–32 visible characters after trimming and whitespace normalization; reject control characters and `<`/`>`. Label limited to 24 characters visually with full accessible title. Use `inhabit.rename`. Update offer/card/search/Mine lens from derived unit occupancy, not separate manual state in each component. A `refreshOccupancy()` function performs all four updates and marks view dirty. Test the name `A&B Coffee` renders as text, and `<img ...>` is rejected without DOM injection.

**E5 — Improve the frontage exactly once.**

Button: `Improve frontage — 300 demo FDL`. Call `inhabit.upgrade`; update the curated sign/frame appearance only. No whole-city regeneration. Implement a small per-building frontage state lookup, outside lens RGB/flags, so upgrading cannot erase cutaway or lens flags. Apply on scene load and after each transaction. Test `view.city.parts` and road graph identities unchanged; inspect close screenshots before/after.

**E6 — Persistence and reset.**

Store only mutable demo state under `cities.inhabit.v1`, with `{schema:1, worldKey, state}`; `worldKey` includes city, seed and geometry version. Validate parsed shape and IDs against `demo-units`; do not trust arbitrary localStorage JSON. If incompatible, show `This demo layout changed. Start a new local demo.` and offer an explicit reset. Do not silently charge or map old occupancy to a new address. If storage is blocked, the demo continues in memory with a small non-blocking notice.

Tests: refresh preserves lease/name/stage; corrupt state cannot crash; stale worldKey requires reset; reset only clears this demo key, never all IndexedDB/localStorage.

**E7 — Keep selection stable while hovering elsewhere.**

Current `main.js` hover processing can overwrite or hide the selected card. Add a browser regression: select shop, move pointer over empty map, card remains. Only hover-preview when no selection is pinned. Escape closes the selected card; typing in an input must not trigger city hotkeys.

**E8 — Commit and user-test the complete loop.**

Run unit, source, browser tests. Ask a tester to find the shop again after panning away, name it and improve it without instruction. Record whether completed and where they got stuck; do not manufacture usability scores. Commit: `feat(cities): local first-business ownership slice`.

### Phase F — legibility, cutaway and responsive interaction

**F1 — Default to selected-only cutaway.**

Change `seeMode` default in `main.js` from `mine` to `selected`; change the initial chip class in `index.html`. Keep all three modes and keyboard X. Browser regression: at initial load no buildings are cut; selecting one produces only its required occluders; Off clears flags after the return animation. Normal view should not have a neighbourhood pre-cut merely because five demo assets exist.

**F2 — Avoid new focus allocations when nothing changed.**

Test `setFocus` repeatedly with the same IDs: no new glow geometry, labels or outlines. Existing early return is a characterization baseline. Only alter it if the new occupancy integration breaks it. Do not add an extra outline pass per owned building.

**F3 — Label collision packing.**

Create `src/label-layout.js` from Appendix G. In `render.js placeLabels`, project candidates first; pack screen rectangles by priority: selected, leased premises, landmark, major district, other. Hide lower-priority overlaps; never move labels across the map to fabricate locations. Selected label may use a short leader line or a card when space is unavailable. Measure DOM sizes only after label text changes, not every frame. Unit tests cover priorities, stable tie-breaking, viewport bounds and panel exclusion rectangles.

**F4 — Controls and legend no longer overlap.**

In `index.html` CSS, put legend and controls in one dock flow on desktop rather than independent overlapping absolute panels. On narrow screens, one bottom sheet with tabs `Map` / `Selection`; max height 45dvh, independently scrollable body and reachable close button. Preserve at least the upper half of the map. Browser tests at 1440×900, 390×844 and 844×390 assert `Find my buildings` is clickable with Market legend open and no horizontal document overflow.

**F5 — Touch and keyboard path.**

Browser tests: pointer drag pans without selecting; tap selects; tab order reaches offers and controls; Escape closes topmost panel; Q/E and X ignored while editing a name; reduced-motion disables fly-to/cut transitions. Use controls with at least 44×44 CSS px hit areas, even when icons are smaller. Do not hide essential actions behind hover-only UI.

Commit: `fix(cities): selection and responsive map legibility`.

### Phase G — measured performance and resource correctness

**G1 — Add serializable diagnostics.**

Add `window.__cities.diagnostics()` returning city ID, seed, version, renderer information, current quality, draw calls, triangles, renders, `renderer.info.memory`, loading measures and active cache IDs. Do not expose credentials or production player data. Test shape in browser. This is observation, not a new per-frame logging loop.

**G2 — Remove synchronous production GPU reads.**

In `render.js frame`, remove the per-draw `gl.readPixels` fallback. Keep asynchronous GPU queries where available and record end-to-end animation cadence independently for adaptive quality when unavailable. Explicit benchmark scripts may use synchronization, but must label the measurement and must not ship it in the normal frame path. Test source has no `readPixels` call in `frame`, and browser panning/cutaway still updates.

**G3 — Quality policy as a pure function.**

Create `src/quality.js` from Appendix H; use it instead of ad-hoc thresholds. Separate tiers high/balanced/low from a user-selected saver mode. Drop quality only after consecutive slow windows, never from intentional 12 fps idle water ticks or hidden-page throttling. No automatic up/down oscillation in this release; user can reset Auto. Unit tests: slow active windows drop, fast windows reset pressure, idle windows ignored, manual quality respected.

**G4 — Dispose city-owned resources precisely.**

Inventory textures (`stateTex`, district/value/ground data textures), instance buffers, material clones, glow geometry and outstanding timer queries in `render.js`. Introduce `disposeCity()` called before `load()`, with Sets to deduplicate shared resources. Keep base geometries owned by `CityView` until final `dispose()`; remove event listeners and terminate the worker only on final teardown. Browser test cycles Avalon/Kaiyo ten times after warmup and asserts geometry/texture counts plateau rather than grow each cycle. Do not rely on a GC call to fix GPU-resource leaks.

**G5 — Bound in-memory city cache.**

Replace the unbounded `cache` Map usage in `main.js` with a two-entry LRU, retaining the active city and most recently used other city; IndexedDB retains generated data. Add `src/lru.js` as a minimal Map wrapper and `tests/lru.test.mjs`: get refreshes order, third put evicts oldest, replacement does not grow size. Never evict active scene buffers by reference without disposing the scene separately.

**G6 — Worker cache latency and stale requests.**

Fix request sequencing before optimizing cache writes: only the latest request may update visible progress or attach geometry. Test rapid Avalon→Kaiyo→Avalon and generation failure/retry. For cache writes, preserve structured-clone/transfer correctness: do not move `send` above `writeCity` if doing so detaches buffers still needed for storage. Measure current cost; if material, explicitly clone once for storage or post without transfer for that first result and compare memory/latency. Choose using measurements, not the claim that asynchronous means free.

**G7 — Scene upload chunking only if measured stalls fail the target.**

Instrument `CityView.load` stages. If its largest main-thread task exceeds the budget, split tile/instance creation into chunks with a time budget of 8 ms and yield using `setTimeout(resolve, 0)` between chunks. Keep old scene visible until new scene is ready, support request cancellation, and attach only the latest completed scene. Do not spread a half-built interactive city across frames without a loading state. Browser test: stale upload cannot replace the latest city; input/RAF continues during upload.

**G8 — Tile-size experiment, not automatic rewrite.**

Benchmark TILE 400, 600 and 800 using the same fixed camera sequence and quality. Keep the variant with best measured p95 interaction frame time without exceeding memory/visual budgets. Save all three result JSONs. Do not report triangle reduction alone as success or assume fewer draw calls always wins. Restore selected constant, remove experimental controls, commit the evidence summary.

**G9 — Real device validation.**

Run the protocol in section 8 on the user's GPU and at least one real mobile device. If unavailable, mark `mobile gate: BLOCKED`, retain a testable desktop build, and do not call the release mobile-ready. Do not keep agents running for hours attempting to turn SwiftShader into a hardware result.

### Phase H — integration contract, regression and handoff

**H1 — Write `prototypes/cities/docs/game-integration.md`.**

Document exact separation: CityManifest → Parcel → Building → Unit → Occupancy/Lease → Business/Company. Numeric `renderId` is ephemeral; persistent IDs and addresses are server-owned. Public map payload never contains trading positions, private cash or hidden home-owner details. Private homes are opt-in public. Lease/purchase/build commands must be server-authoritative and idempotent when integrated; local demo functions are not production endpoints.

**H2 — Write growth rules as a contract, not a fake simulation.**

In the same document define stages: occupy vacancies → renovate → infill serviced plots → redevelopment with consent → open an expansion district when sustained capacity pressure warrants it. The existing growth slider is labelled `Generation preview`, not player-driven economic growth. Geography seed/version and allocation manifest persist on the server; new districts append without regenerating addresses. Abandoned accounts do not cause endless land expansion or automatically destroy owned property. Production thresholds remain unimplemented until economy simulations support them.

**H3 — Synchronize artifact output mechanically.**

Create `tools/sync-artifact.mjs`: read `index.html`, remove doctype, outer html/head/body wrappers and meta lines as the existing artifact convention requires, and write `artifact.html`. It must offer `--check` that exits nonzero if stale without writing. Test idempotence on a fixture. Verify `node prototypes/cities/tools/sync-artifact.mjs --check` after generation. Do not publish externally during this task.

**H4 — Full regression, one browser worker.**

Run source/unit/browser/audit suites. Smoke all five cities plus Serena; lenses, search, cutaway, growth preview, time of day, battery saver, city switching. Avalon runs structural/ownership acceptance; other cities run compatibility acceptance. Include at least 3 deterministic Avalon seeds in generation tests, but ownership demo approval uses the canonical 1701 world only.

**H5 — Final review and handoff.**

Write `prototypes/cities/docs/v2-acceptance.md`: exact commit, commands and real results, approved screenshots, device results, rejected experiments, limitations, remaining issues. Start the accepted server on an agreed free port and verify the exact served assets match the worktree before opening it for the user. No merge into the game until this review is accepted.

## 6. Copy-pasteable implementation building blocks

These are plan snippets, not files already implemented. Apply them in the RED/GREEN order above; do not paste all implementation before tests.

### Appendix A — tooling

`prototypes/cities/tools/check-source.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(process.argv[2] ?? 'prototypes/cities');
async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'evidence', 'test-results'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}
for (const file of await walk(root)) {
  if (!['.js', '.mjs', '.html', '.json'].includes(extname(file))) continue;
  const source = await readFile(file, 'utf8');
  if (/^(<<<<<<< |=======$|>>>>>>> )/m.test(source)) {
    throw new Error(`unresolved conflict: ${file}`);
  }
  if (['.js', '.mjs'].includes(extname(file))) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${file}\n${result.stderr}`);
  }
}
console.log('source checks passed');
```

`prototypes/cities/tools/browser-ready.mjs`:

```js
export async function ready(page, url, timeout = 60000) {
  const errors = [];
  let rejectError;
  const fatal = new Promise((_, reject) => { rejectError = reject; });
  const fail = (message) => {
    errors.push(message);
    rejectError(new Error(message));
  };
  page.on('pageerror', e => fail(String(e)));
  page.on('console', m => {
    if (m.type() === 'error') fail(m.text());
  });
  // Start racing before navigation so early module errors are observed.
  await Promise.race([
    (async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForFunction(() => !!window.__cities?.city, null, { timeout });
    })(),
    fatal,
  ]);
  return errors;
}
```

After readiness, screenshot tools must also check returned `errors` before successful exit, because asynchronous console events can arrive during capture. Use test teardown to close the browser even on failure.

### Appendix B — browser setup and capture

`prototypes/cities/playwright.config.mjs`:

```js
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: './evidence/test-results',
  use: {
    baseURL: 'http://127.0.0.1:3650',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node serve.mjs 3650',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:3650',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
```

`fileURLToPath` preserves Windows drive paths, spaces and encoded characters. Do not replace it with an absolute path to an old worktree.

`prototypes/cities/tools/run-browser.mjs`:

```js
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');
const r = spawnSync(process.execPath, [
  cli, 'test', '--config', 'prototypes/cities/playwright.config.mjs',
  ...process.argv.slice(2),
], { stdio: 'inherit' });
process.exit(r.status ?? 1);
```

`prototypes/cities/tests/browser/smoke.spec.mjs`:

```js
import { test, expect } from '@playwright/test';
import { ready } from '../../tools/browser-ready.mjs';
test('Avalon produces a loaded canvas without page errors', async ({ page, baseURL }) => {
  const errors = await ready(page, `${baseURL}/?city=avalon&t=15`);
  const data = await page.evaluate(() => ({
    city: window.__cities.city.P.id,
    buildings: window.__cities.city.buildings.length,
    width: document.querySelector('#view').width,
  }));
  expect(data.city).toBe('avalon');
  expect(data.buildings).toBeGreaterThan(0);
  expect(data.width).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
```

`prototypes/cities/tools/capture.mjs`:

```js
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ready } from './browser-ready.mjs';
const [base = 'http://127.0.0.1:3650', dir = 'prototypes/cities/evidence/after'] = process.argv.slice(2);
const out = resolve(dir);
await mkdir(out, { recursive: true });
const views = [
  ['overview', null], ['oldharbor', [-60, -60, 0.18]],
  ['midtown', [300, -400, 0.2]], ['gilthill', [-650, -500, 0.25]],
  ['westbank', [-950, 150, 0.2]], ['docks', [880, 230, 0.25]],
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
  const errors = await ready(page, `${base}/?city=avalon&t=15`);
  const captures = [];
  for (const hour of [15, 21]) {
    for (const [name, camera] of views) {
      if (hour === 21 && !['overview', 'oldharbor', 'midtown'].includes(name)) continue;
      await page.evaluate(({ camera, hour }) => {
        const a = window.__cities;
        a.setTime(hour); a.setLens('normal'); a.setSee('off'); a.select(null);
        const v = a.view;
        v.motion = false;
        v.yaw = v.yawTarget = Math.PI / 4;
        if (camera) { v.target.set(camera[0], 0, camera[1]); v.scale = camera[2]; }
        else v.fit();
        v.dirty = true; v.frame(0);
      }, { camera, hour });
      const file = `${name}-${hour}.png`;
      await page.screenshot({ path: join(out, file) });
      captures.push({ file, camera, hour });
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(join(out, 'capture.json'), JSON.stringify({ browser: browser.version(), captures, errors }, null, 2));
  console.log(`captured ${captures.length} views`);
} finally {
  await browser.close();
}
```

The capture script expects a server already running on its supplied port. The Playwright test runner starts and stops its own server; do not run both concurrently on 3650. The screenshot script freezes visual time only; the interactive browser keeps normal behavior.

### Appendix C — stable parcel identity

`prototypes/cities/src/parcel-id.js`:

```js
export function parcelId(city, seed, x, y, rot) {
  if (![seed, x, y, rot].every(Number.isFinite)) throw new TypeError('finite parcel coordinates required');
  if (!/^[a-z][a-z0-9-]*$/.test(city)) throw new TypeError('invalid city id');
  const q = v => Math.round(v * 100);
  const angle = ((rot % Math.PI) + Math.PI) % Math.PI;
  return `${city}:${seed}:p:${q(x)}:${q(y)}:${Math.round(angle * 10000)}`;
}
```

These IDs are stable for an immutable geometry manifest; **they are not a migration strategy across new road layouts**. Freeze and persist the manifest before production occupancy. Never promise coordinate-derived IDs survive moving a parcel.

`prototypes/cities/tests/parcel-id.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parcelId } from '../src/parcel-id.js';
test('parcel identity is deterministic and independent of array position', () => {
  const a = parcelId('avalon', 1701, 10, -20, 0);
  const list = [[-5, 2], [10, -20]].map(([x, y]) => parcelId('avalon', 1701, x, y, 0));
  assert.equal(a, list[1]);
  assert.notEqual(a, parcelId('avalon', 1702, 10, -20, 0));
  assert.notEqual(a, parcelId('kaiyo', 1701, 10, -20, 0));
});
test('invalid geometry is rejected', () => {
  assert.throws(() => parcelId('avalon', 1701, NaN, 0, 0), TypeError);
});
```

### Appendix D — bounded, deterministic access search

`prototypes/cities/src/access.js`:

```js
export function entranceOf({ x, y, rot, dp, front = -1 }) {
  if (![x, y, rot, dp].every(Number.isFinite) || dp <= 0 || ![-1, 1].includes(front)) {
    throw new TypeError('invalid entrance geometry');
  }
  return [x - Math.sin(rot) * dp * 0.5 * front,
          y + Math.cos(rot) * dp * 0.5 * front];
}

// Cardinal-grid A*: deterministic, bounded and intentionally free of generator globals.
// Callbacks must validate the full corridor width and grade, not just point occupancy.
export function routeGrid({ start, goal, step = 2, margin = 20, maxVisited = 4096,
  canStand, canStep = () => true }) {
  if (!(step > 0) || !(maxVisited > 0) || !Number.isFinite(margin) || margin < 0) {
    throw new TypeError('invalid route limits');
  }
  const origin = [Math.min(start[0], goal[0]) - margin, Math.min(start[1], goal[1]) - margin];
  const nx = Math.ceil((Math.abs(goal[0] - start[0]) + margin * 2) / step) + 1;
  const ny = Math.ceil((Math.abs(goal[1] - start[1]) + margin * 2) / step) + 1;
  if (nx * ny > 1000000) return null;
  const point = id => [origin[0] + (id % nx) * step, origin[1] + Math.floor(id / nx) * step];
  const index = p => Math.round((p[1] - origin[1]) / step) * nx + Math.round((p[0] - origin[0]) / step);
  const s = index(start), g = index(goal);
  const ps = point(s), pg = point(g);
  if (!canStand(...start) || !canStand(...goal) || !canStand(...ps) || !canStand(...pg)
      || !canStep(start, ps) || !canStep(pg, goal)) return null;
  const cost = new Map([[s, 0]]), parent = new Map(), closed = new Set();
  const heuristic = id => Math.abs(id % nx - g % nx) + Math.abs(Math.floor(id / nx) - Math.floor(g / nx));
  const heap = [];
  const less = (a, b) => a.f < b.f || (a.f === b.f && a.id < b.id);
  function push(v) {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]]; i = p;
    }
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let j = i;
        for (const k of [i * 2 + 1, i * 2 + 2]) if (k < heap.length && less(heap[k], heap[j])) j = k;
        if (j === i) break;
        [heap[i], heap[j]] = [heap[j], heap[i]]; i = j;
      }
    }
    return first;
  }
  push({ id: s, f: heuristic(s) });
  while (heap.length && closed.size < maxVisited) {
    const { id } = pop();
    if (closed.has(id)) continue;
    if (id === g) {
      const ids = [g];
      while (ids[ids.length - 1] !== s) ids.push(parent.get(ids[ids.length - 1]));
      const path = [start, ...ids.reverse().map(point), goal];
      return path.filter((p, i) => i === 0 || p[0] !== path[i - 1][0] || p[1] !== path[i - 1][1]);
    }
    closed.add(id);
    const x = id % nx, y = Math.floor(id / nx), a = point(id);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
      const next = yy * nx + xx, b = point(next), n = cost.get(id) + 1;
      if (closed.has(next) || !canStand(...b) || !canStep(a, b) || n >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, n); parent.set(next, id); push({ id: next, f: n + heuristic(next) });
    }
  }
  return null;
}
```

Do not run this full search for already valid direct entries. Do not smooth a successful path without revalidating every new segment and width. The first version can merge collinear segments without changing its route.

`prototypes/cities/tests/access.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { entranceOf, routeGrid } from '../src/access.js';
test('entrance uses the front, not the nearest arbitrary wall', () => {
  assert.deepEqual(entranceOf({ x: 0, y: 0, rot: 0, dp: 10, front: -1 }), [0, -5]);
  const [x, y] = entranceOf({ x: 0, y: 0, rot: Math.PI / 2, dp: 10, front: -1 });
  assert.ok(Math.abs(x - 5) < 1e-8 && Math.abs(y) < 1e-8);
});
test('routes around a wall deterministically', () => {
  const options = {
    start: [0, 0], goal: [10, 0], step: 1, margin: 4,
    canStand: (x, y) => !(x >= 4 && x <= 6 && Math.abs(y) <= 2),
  };
  const path = routeGrid(options);
  assert.ok(path && path.some(([, y]) => Math.abs(y) > 2));
  assert.deepEqual(path, routeGrid(options));
  assert.ok(path.every(([x, y]) => options.canStand(x, y)));
});
test('unreachable entrance reports no route', () => {
  assert.equal(routeGrid({ start: [0, 0], goal: [10, 0], step: 1, margin: 2,
    canStand: (x, y) => x === 0 && y === 0 || x === 10 && y === 0 }), null);
});
```

### Appendix E — bounded art recipes and entrances

`prototypes/cities/src/avalon-art.js`:

```js
import { hash2 } from './noise.js';
const RECIPES = {
  oldharbor: { height: [14, 0.12, 9, 21], gap: 0,
    types: [['row', 4], ['midrise', 1]],
    facade: [0x9c5a43, 0x8a4b38, 0xa86b4f, 0xb07a5c] },
  midtown: { height: [52, 0.5, 18, 260],
    types: [['tower', 2], ['midrise', 3]] },
  docks: { height: [10, 0.16, 7, 18],
    types: [['warehouse', 5], ['loft', 1], ['containers', 2]] },
  gilthill: { height: [10, 0.12, 8, 15] },
  northgate: { height: [16, 0.16, 9, 28] },
  westbank: { height: [10, 0.14, 6, 18] },
};
export function preparePersonality(P) {
  if (P.id !== 'avalon') return P;
  return { ...P, districts: P.districts.map(d => ({ ...d, ...(RECIPES[d.id] ?? {}) })) };
}
export function avalonHeight(districtId, blockSeed, x, y, proposed) {
  if (!['oldharbor', 'northgate', 'westbank'].includes(districtId)) return proposed;
  const floorHeight = 3.3;
  const baseFloors = districtId === 'westbank' ? 2 : 3;
  const floors = baseFloors + Math.floor(hash2(blockSeed, 0, 1701) * 2);
  const variation = (hash2(Math.round(x * 10), Math.round(y * 10), 1701) - 0.5) * 0.8;
  return floors * floorHeight + variation;
}
```

The recipes are a first art-direction candidate, not approved final values. Save the initial comparison before tuning. Seeds other than 1701 must pass the actual city seed into the height helper before testing multi-seed variation; extend the function with a `seed = 1701` final argument and replace both literals with it in that microtask.

Entrance helper to place in `src/archetypes.js` (uses existing private `B` builder and `S` constants):

```js
function addEntrance(b, rec, front) {
  const depthFactor = {
    row: 1, house: 0.8, gabled: 0.92, midrise: 0.97,
    loft: 0.97, warehouse: 0.96,
  }[rec.type];
  if (depthFactor === undefined) return;
  const width = rec.type === 'warehouse' ? 3.2 : Math.min(1.5, rec.w * 0.22);
  const height = rec.type === 'warehouse' ? 3.2 : Math.min(2.5, rec.h * 0.65);
  const z = front * (rec.dp * depthFactor * 0.5 + 0.025);
  b.box(0, 0.05, z, width, height, 0.06, 0x343936, S.PLAIN);
  b.box(0, height + 0.05, z, width + 0.3, 0.18, 0.18, 0xb9ab90, S.PLAIN);
}
```

**Geometry caveat:** `entranceOf` initially computes the parcel-facing edge; actual inset facade doors can lie behind it. Persist `entryThreshold` (door) and `entryGate` (parcel boundary) separately. The public access audit checks the complete path from threshold, across the reserved setback, through gate to the street. Add this as a separate fixture before calling house access complete. Do not pretend the helper alone solves routing through setbacks.

### Appendix F — minimal unit/company/lease model

`prototypes/cities/src/inhabit.js`:

```js
export function cleanName(value) {
  if (typeof value !== 'string' || /[<>\u0000-\u001f\u007f]/u.test(value)) throw new Error('invalid-name');
  const name = value.trim().replace(/\s+/gu, ' ');
  if ([...name].length < 1 || [...name].length > 32) throw new Error('invalid-name');
  return name;
}
export function initialState(worldKey) {
  return { schema: 1, worldKey, cash: 5000, company: { id: 'demo:company', name: 'Your business' }, leases: {} };
}
function unitAt(units, id) {
  const unit = units.find(u => u.id === id);
  if (!unit || !unit.leasable || unit.use !== 'shop') throw new Error('unavailable-unit');
  return unit;
}
export function lease(state, units, id) {
  const unit = unitAt(units, id);
  if (state.leases[id]) throw new Error('already-leased');
  if (!Number.isSafeInteger(unit.cost) || unit.cost < 0) throw new Error('invalid-cost');
  if (state.cash < unit.cost) throw new Error('insufficient-cash');
  return { ...state, cash: state.cash - unit.cost, leases: {
    ...state.leases, [id]: { companyId: state.company.id, stage: 0 },
  } };
}
export function rename(state, value) {
  return { ...state, company: { ...state.company, name: cleanName(value) } };
}
export function upgrade(state, id) {
  const held = state.leases[id];
  if (!held) throw new Error('not-leased');
  if (held.stage !== 0) throw new Error('already-improved');
  if (state.cash < 300) throw new Error('insufficient-cash');
  return { ...state, cash: state.cash - 300, leases: {
    ...state.leases, [id]: { ...held, stage: 1 },
  } };
}
```

`prototypes/cities/tests/inhabit.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, lease, rename, upgrade } from '../src/inhabit.js';
const units = [
  { id: 'p1/shop-1', buildingId: 'b1', ownerId: 'city:avalon', use: 'shop', leasable: true, cost: 600 },
  { id: 'p1/shop-2', buildingId: 'b1', ownerId: 'city:avalon', use: 'shop', leasable: true, cost: 800 },
];
test('leasing changes occupancy and cash, never building ownership', () => {
  const before = initialState('avalon:1701:v2');
  const after = lease(before, units, units[0].id);
  assert.equal(after.cash, 4400);
  assert.equal(before.cash, 5000);
  assert.equal(units[0].ownerId, 'city:avalon');
  assert.equal(after.leases[units[0].id].companyId, 'demo:company');
  assert.throws(() => lease(after, units, units[0].id), /already-leased/);
  assert.equal(Object.keys(lease(after, units, units[1].id).leases).length, 2);
});
test('insufficient cash cannot partially mutate the state', () => {
  const before = { ...initialState('w'), cash: 10 };
  assert.throws(() => lease(before, units, units[0].id), /insufficient-cash/);
  assert.equal(before.cash, 10);
  assert.deepEqual(before.leases, {});
});
test('name is safe text and frontage improves once', () => {
  const held = lease(initialState('w'), units, units[0].id);
  assert.equal(rename(held, ' A&B   Coffee ').company.name, 'A&B Coffee');
  assert.throws(() => rename(held, '<script>'), /invalid-name/);
  const improved = upgrade(held, units[0].id);
  assert.equal(improved.cash, 4100);
  assert.equal(improved.leases[units[0].id].stage, 1);
  assert.throws(() => upgrade(improved, units[0].id), /already-improved/);
});
```

For double clicks, the event handler must read the latest state and disable during action; never close over a stale `before` snapshot. For production, replace this entire local command authority with server validation; client-side tests do not make it secure multiplayer code.

### Appendix G — deterministic label packing

`prototypes/cities/src/label-layout.js`:

```js
export function overlaps(a, b, gap = 4) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}
export function packLabels(candidates, width, height, exclusions = []) {
  const kept = [];
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority || String(a.id).localeCompare(String(b.id), 'en'));
  for (const r of sorted) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > width || r.y + r.h > height) continue;
    if (exclusions.some(e => overlaps(r, e)) || kept.some(e => overlaps(r, e))) continue;
    kept.push(r);
  }
  return kept.map(r => r.id);
}
```

Test with two overlapping labels, then reverse input order; selected ID must win both times. Test one label under the controls exclusion rectangle; it must not be returned. A selected label rejected for screen space remains represented in the pinned selection card.

### Appendix H — conservative quality policy

`prototypes/cities/src/quality.js`:

```js
export const QUALITY = Object.freeze({
  high: { dpr: 1.5, detail: 1, tile: 400 },
  balanced: { dpr: 1, detail: 0.5, tile: 400 },
  low: { dpr: 1, detail: 0, tile: 400 },
});
export function qualityWindow(state, { p95, active, hidden, manual }) {
  if (manual || hidden || !active || !Number.isFinite(p95)) return state;
  const slow = p95 > 34 ? state.slow + 1 : 0;
  if (slow < 3) return { ...state, slow };
  const tier = state.tier === 'high' ? 'balanced' : 'low';
  return { tier, slow: 0 };
}
```

One window = 60 active interaction RAF intervals, not idle scheduled renders. This policy targets responsiveness without claiming it measures GPU execution. Record CPU/RAF and GPU-query measurements separately. Do not reduce viewport/UI layout resolution; only canvas render quality changes.

## 7. Tests / validation matrix

### Unit and generator tests

| Test file to create | Required cases |
|---|---|
| `tests/tooling.test.mjs` | conflict markers, portable imports, browser readiness error propagation |
| `tests/parcel-id.test.mjs` | deterministic keys, uniqueness in generated city, no reliance on render-array position |
| `tests/generation.test.mjs` | canonical seed deterministic excluding timings; alternate seeds 1702/1703; graph endpoints valid; packed arrays finite and stride aligned; all six personalities generate |
| `tests/roadgraph.test.mjs` | X/T crossings, disconnected lines, required-access dead ends, invalid loops |
| `tests/access.test.mjs` | rotation/front, detour, no route, bounded search, no diagonal shortcut |
| `tests/entrance-access.test.mjs` | actual threshold-to-gate-to-road route, water/width/grade, excludes rail/elevated deck shortcut |
| `tests/access-audit.test.mjs` | independent rejection of bad routes, isolated component, false nearest-wall success |
| `tests/archetypes.test.mjs` | front retained, entrance on facade, geometry finite, no extra parts on nonbuilding props |
| `tests/avalon-art.test.mjs` | nonmutating recipe, district ranges, block-correlated heights, other cities unchanged |
| `tests/inhabit.test.mjs` | lease/rename/upgrade, insufficient funds, invalid names, duplicate actions, owner vs occupant |
| `tests/cache-key.test.mjs` | city/seed/version separation |
| `tests/label-layout.test.mjs` | priorities, exclusion rectangles, stable results |
| `tests/quality.test.mjs` | active pressure, idle ignored, manual respected, no oscillation |
| `tests/lru.test.mjs` | bounded retention, active access order |

For heavyweight generated fixtures, generate once per test file using `before`; do not regenerate a 2400 m city in every assertion. Exclude `ms` and `timings` from equality; do not exclude geometry differences to make determinism pass.

### Browser cases

Create `tests/browser/inhabit.spec.mjs`, `selection.spec.mjs`, `regression.spec.mjs`, `resources.spec.mjs` in addition to smoke:

- Local shop lease → rename → upgrade → refresh → find again.
- No incorrect owner transfer, no duplicate debit, no arbitrary HTML injection.
- Focus/hover and lens flags coexist; selected card stays pinned.
- Normal lighting independent of mood; Market lens still changes.
- Reduced motion, mobile layout, keyboard shortcuts in text inputs.
- All cities × each lens smoke; six scenes includes Serena but the game still has five expandable cities.
- Worker denied / storage denied / stale cache / rapid city switching / failed generation retry.
- Resize, rotate, max zoom and legal pan corners: no exposed outskirts edge.
- Resource plateau across ten city switches.
- No page errors, shader errors or WebGL context loss during normal cases.

### Visual acceptance is separate

A human or image-capable reviewer must inspect before/after captures at matched settings. Reject:

- Decorative road knots, inaccessible visible front doors, zebras over water, sidewalks ending inside walls.
- Full-gold selected buildings in Normal lens.
- Repeated identical towers across every block, random material changes at block boundaries, visible square ground seams.
- Unreadable selection at night, label stacks, panels covering the action needed to continue.
- Detail shimmer or LOD popping that distracts during ordinary zoom.

Do not automatically approve new screenshots as baselines. Each approval names the view and reason. No claim that all seeds are visually perfect from reviewing seed 1701 alone.

## 8. Performance protocol and budgets

These are **proposed acceptance targets**, not measured results. Record the actual device and negotiate any target change explicitly.

### Device classes

1. User's actual desktop GPU at 1440×900 CSS px, capped DPR 1.5.
2. Real midrange mobile device at its native browser viewport, canvas DPR cap 1.
3. SwiftShader only for functional regression and software-relative comparisons; never as proof of mobile FPS.

### Runs

- Close benchmark browsers from this task between runs; do not stop unrelated applications without permission.
- Warm shaders by visiting the three fixed view scales once.
- Five interleaved baseline/candidate runs for timing comparisons where practical.
- Each interaction run: pan continuously 10 s, zoom 10 s, rotate/select 10 s. Report median/p95 RAF interval and GPU time separately.
- Idle test: static view with decorative animation disabled, 10 s, then hidden tab 10 s. Expected zero scene renders after settling in both cases.
- Cold load: empty prototype geometry cache only; measure navigation → first usable map, worker time, largest main-thread long task, scene upload time.
- Warm load: same geometry version and seed; measure the same values.
- Resource test: alternate Avalon/Kaiyo ten times. Record geometry/texture counts and available JS memory measure. Unsupported memory APIs are `unavailable`, not zero.

### Targets

| Metric | Desktop | Mobile |
|---|---|---|
| Active interaction p95 frame interval | <=20 ms target | <=34 ms target |
| Selection card feedback | <=100 ms, independent of fly animation | <=150 ms |
| First usable city, local assets / warm library cache | <=3 s | <=5 s |
| Largest main-thread load task | <=100 ms; aim <=50 ms | <=100 ms; aim <=50 ms |
| Idle, animation disabled / hidden | 0 scene renders after settling | same |
| Resource lifetime | no monotonic geometry/texture growth after warmup | same |
| Cutaway/lens actions | no city regeneration | same |

- No feature may reduce performance by >10% against the newly measured baseline in the same quality tier without an explicit accepted tradeoff.
- Triangle/draw-call counts are diagnostic, not pass/fail by themselves. Initial ceiling: no increase above the canonical baseline geometry count at matched views unless performance still meets targets and visual benefit is approved.
- Local loading depends on a CDN Three.js module and Google fonts today. Record cold-network dependency timing separately. If those dependencies prevent reproducible testing, vendor the **same pinned Three.js build** and retain its license in a separate approved dependency task; do not quietly switch versions.
- If the mobile gate fails, cut microdetail/instance overhead before shrinking the visible world or removing property identity.

## 9. Risks, tradeoffs and open questions

### Risks and mitigations

- **Perfection is unbounded.** Scope is one approved art plate plus one ownership loop and measurable gates. Do not delay forever for five complete cities.
- **Procedural routes may become expensive.** Fast direct test first, bounded A* only for exceptional entries, shared lane reuse and profiling. If many parcels require A*, fix placement, not search limits.
- **Address stability vs redesign.** Geometry version changes invalidate demo state visibly. Production requires a persisted manifest and migrations before people own anything.
- **Painted geometry can still be structurally wrong.** Keep the independent access audit and bad fixtures; never accept proximity-only success.
- **More draw calls from tiling.** Measure the actual GPU before tuning tile size; no universal tile-size promise.
- **New architecture can break density or HQ assignment.** Track counts by district, business slots and reserved landmarks. Do not conceal losses by lowering acceptance thresholds. Record candidate/rejection counts alongside visible building totals.
- **A prototype isn't a secure economy.** Demo money and localStorage are explicitly disposable. No real game balance or multiplayer writes.
- **Company naming introduces injection risk.** Validate names and render text; existing card HTML paths must escape newly editable values.
- **Roads on hills need geometry-aware grade checks.** A smoother curve is not proof of a drivable slope. Grade fixtures and sampled audit are required.
- **Browser screenshots can consume disk and time.** Fixed view manifest, serial captures, delete only this task's rejected intermediates after retaining final evidence.
- **Old artifact packaging can drift.** One index source and checked derivation; no external publication in this work.

### Defaults chosen so work can start

- Port Avalon first; other cities regression-only.
- Illustrated isometric look retained; no engine/framework migration.
- Selected-only cutaway by default.
- One local business company, three alternative shop offers, one frontage upgrade.
- Exterior identity only; no interior/roof/landscaping editor.
- City growth slider remains a generation preview. Economy-driven expansion deferred.
- No cars or audio.
- At most two coding agents and one benchmark browser.

### Questions that require user/device input later, not before starting

1. Which real mobile phone can be used for the final hardware gate?
2. Does the approved Old Harbor/Midtown art plate match the user's taste before applying its rules more broadly?
3. Does leasing a unit, naming it and finding it again actually feel personal enough? If not, improve that interaction before adding house construction.
4. After this slice is accepted, should the next integrated asset be the player's home address or their company office? Do not build both speculatively now.

## 10. Completion checklist

- [ ] Implementation branch based on verified prototype commit; unrelated work untouched.
- [ ] Source/tooling tests catch stale import paths, conflict markers and real page errors.
- [ ] Stable manifest-scoped parcel IDs and separate numeric render IDs.
- [ ] Occupied premises have independently audited entrance-to-network access.
- [ ] Rejected candidates reported honestly; no occupied building disappears to improve metrics.
- [ ] Port Avalon art plate reviewed and approved at city/district/property scale.
- [ ] Normal view no longer acts as a stock-return heatmap.
- [ ] Lease/name/improve/find-again loop works and survives a compatible reload.
- [ ] Company, unit occupant and building owner remain distinct.
- [ ] No cars, sound or rejected customization scope introduced.
- [ ] Cutaway, labels and panels work at desktop and phone layouts.
- [ ] Real desktop performance measured; mobile gate passed or explicitly blocked.
- [ ] All five cities plus Serena remain functional.
- [ ] Artifact derivation checked, no external publishing or main-game merge.
- [ ] Final report contains actual commands/results, exact commit, reviewed screenshots and limitations.

## Final execution instruction

Execute Phase A first and report its actual baseline before structural changes. Then complete B→C→D→E→F→G→H in order, keeping each RED/GREEN slice small. Do not say “the cities are perfect”; report which acceptance gates passed, which required user review, and which hardware checks remain blocked.
