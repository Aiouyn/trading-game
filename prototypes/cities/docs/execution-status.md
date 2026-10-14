# Port Avalon V2 execution checkpoint

Implementation worktree: `.hermes/worktrees/city-v2`, branch `cities/inhabitable-v2`.
Pinned prototype: `3119fd0895cc55b371f53d6a651bc7a098c9632a`. The main checkout and the
user's port 3610 preview remain untouched.

## Phase A baseline (reported, NOT hardware acceptance)

`evidence/baseline.json`: Windows 10.0.26200, Node v22.13.1, Chromium 153.0.8010.12,
1440x900, canvas DPR 1.5. Chromium selected **SwiftShader**, with no forced software flags.
Fresh-context navigation to a usable map: 1466 ms. Generation: 917 ms.
Original city: 1932 buildings, 58 headquarters. A 60-frame pan probe measured median
638.8 ms, p95 662.9 ms. This was a **software-renderer probe**, not the section 8 protocol:
shader warmup, upload long tasks, cold CDN/font timings, GPU time, hidden-tab idle and
real hardware remain outstanding. Do not cite it as desktop or mobile readiness.

Nine matched reference captures are in `evidence/before/`. Source checker, portable
Playwright config and a fail-fast readiness harness are committed. The original
conflict-marker test passed on arrival, so it is characterization, not TDD evidence.

## Phase B (committed 515e210)

Stable manifest-scoped parcel keys, frontage orientation on the building record, block
seed cells, additive road graph export, parent-edge provenance, seed/version cache key.
All six scenes load in the browser.

## Phase C (committed e5876cd)

The first proximity audit was too permissive: width caps, endpoint exemptions, doors
inferred after routing and 0.03 grade slack admitted invalid corridors. New fixtures
caught each of those. Routing and audit now sample the full path width at 0.5 m including
endpoints, honour 0.15 pedestrian and 0.12 vehicle grade, and the archetype is chosen
before acceptance. The accepted corridor is reserved before neighbouring lots are placed.
Junction paint requires an at-grade, sidewalked class>=3 arm and never lands on water or
a bridge span.

The audit is independent of the routing module. Buildings without recorded paths are
counted as `legacyUnaudited`, never as a pass; `audit-city` exits nonzero if any remain.

**Avalon: 2320 candidates, 1828 served, 6 vacant, 486 rejected, occupiedInvalid 0.**
Rejections are now auditable records, not silent discards. Other cities keep proximity
access and report as legacy (nordhaven 2120, meridia 2354, sundara 1356, kaiyo 3978).
Per the plan, only Avalon received the new layout.

## Phase D so far

- Art recipes (`src/avalon-art.js`): Old Harbor is a 3-5 storey masonry band (567
  buildings, 536 row / 31 midrise, heights 9.6-15.2 m) with no interior lots; Midtown
  weights towers 2:3 so towers cluster; docks and hill bands capped; Gilt Hill keeps
  scatter placement. Ordinary masonry districts take a per-block cornice baseline with
  small per-parcel variation.
- Both generation paths use `preparePersonality`, so a worker fallback no longer yields a
  different city. Three Avalon seeds asserted deterministic excluding timings.
- Focus and hover no longer tint facades; mood is gated behind the Market lens. The glow
  pool is keyed by building id and reused instead of rebuilt per focus change.

## Verification state at this checkpoint

`node --test prototypes/cities/tests/*.test.mjs` -> 42 pass, 0 fail.
`node prototypes/cities/tools/check-source.mjs` -> passed.
`node prototypes/cities/tools/run-browser.mjs` -> 7 passed.
`node prototypes/cities/tools/audit-city.mjs avalon` -> occupiedInvalid 0, legacyUnaudited 0.

The two appearance regression tests were confirmed genuine: restoring the old shader makes
both fail. An earlier version of those tests passed against the broken code because
`readPixels` read an already-presented buffer; the harness now draws and reads in one
evaluate.

## Not done, and not claimed

- **Phase D approval**: the art plate (six day + three night views in `evidence/phase-d2`)
  has NOT been approved by the user. No other city was restyled.
- **Phases E, F, G, H**: lease/name/improve loop, responsive layout, full performance
  measurements, integration contracts, artifact sync and final regression.
- **Performance**: still unmeasured against the protocol. SwiftShader results are not a
  hardware gate. Real desktop GPU and real mobile gate: **BLOCKED pending devices**.
- No merge, push, publication, production economy or expansion simulation.

## Delegation

One OpenCode Go review was attempted with GPT-6 Luna; the provider refused it because the
Go usage limit was exhausted. No delegated review result exists. Work continues with a
single owner.