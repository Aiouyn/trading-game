# Port Avalon V2 execution checkpoint

Implementation worktree: `.hermes/worktrees/city-v2`, branch `cities/inhabitable-v2`.
Pinned prototype: `3119fd0895cc55b371f53d6a651bc7a098c9632a`. Main checkout and port 3610 remain untouched.

## Phase A baseline (reported, not hardware acceptance)

`evidence/baseline.json`: Windows 10.0.26200, Node v22.13.1, Chromium 153.0.8010.12,
1440×900, canvas DPR 1.5. Chromium selected **SwiftShader**, without forced software flags.
Fresh browser context navigation-to-city readiness: 1466ms. Generation: 917ms.
Original city: 1932 buildings, 58 headquarters. A 60-frame pan probe had median 638.8ms,
p95 662.9ms. This was a software-renderer probe, **not** the full performance protocol or
proof of desktop/mobile readiness; shader warmup, upload long tasks, cold network dependency
timings, GPU time, hidden-tab idle and real hardware measurements remain outstanding.

Original nine matched reference images are in `evidence/before/`. The source checker and
portable browser harness are committed. Original conflict-check test was characterization
(already passed); other new behavior tests recorded RED/GREEN. The original readiness test
used a fake page; a real throwing-page regression still needs adding.

## Phase B

Committed at `515e210`: stable manifest-scoped parcel keys, frontage orientation, block seed
cells, additive road graph export, parent-edge provenance and seed/version geometry cache.
All six scenes passed browser loading smoke.

## Phase C work in progress

The initial proximity audit was too permissive: width caps, endpoint exemptions, inferred
doors after routing and grade slack could allow invalid corridors. New fixtures caught these
failures. Routing and audit now sample the full path width at 0.5m, include endpoints and
other landmarks, and enforce 0.15 pedestrian / 0.12 vehicle grade without the old 0.03 slack.
Archetype/frontage is chosen before acceptance; actual frontage routes are reserved before
neighbouring lots are placed. A fractional entrance anchors the routing lattice.

Latest unit run: 31/31 pass. Source checks pass. Six-scene browser smoke passes (17.2s test).
Independent canonical audit passes; final counts and visual review are recorded in evidence
when the checkpoint is committed. Do not call Phase C visually accepted from this file alone.

OpenCode Go delegation was attempted with GPT-6 Luna; the provider refused it because the
Go usage limit was exhausted. No delegated review result exists. Work continues with one owner.

## Remaining gates

D architectural art and user approval; E lease/name/improve/persistence; F responsive labels
and interactions; G full performance/resource measurements; H contracts/artifact/regressions.
Real desktop GPU and real mobile gates: **BLOCKED pending available devices**.
No merge, push, publication, production economy or expansion simulation is authorized here.
