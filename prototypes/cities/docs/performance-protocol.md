# Performance protocol and budgets

These are **proposed acceptance targets**, not measured results. Record the actual device and negotiate any target change explicitly.

## Device classes

1. User's actual desktop GPU at 1440×900 CSS px, capped DPR 1.5.
2. Real midrange mobile device at its native browser viewport, canvas DPR cap 1.
3. SwiftShader only for functional regression and software-relative comparisons; never as proof of mobile FPS.

## Runs

- Close benchmark browsers from this task between runs; do not stop unrelated applications without permission.
- Warm shaders by visiting the three fixed view scales once.
- Five interleaved baseline/candidate runs for timing comparisons where practical.
- Each interaction run: pan continuously 10 s, zoom 10 s, rotate/select 10 s. Report median/p95 RAF interval and GPU time separately.
- Idle test: static view with decorative animation disabled, 10 s, then hidden tab 10 s. Expected zero scene renders after settling in both cases.
- Cold load: empty prototype geometry cache only; measure navigation → first usable map, worker time, largest main-thread long task, scene upload time.
- Warm load: same geometry version and seed; measure the same values.
- Resource test: alternate Avalon/Kaiyo ten times. Record geometry/texture counts and available JS memory measure. Unsupported memory APIs are `unavailable`, not zero.

## Targets

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
