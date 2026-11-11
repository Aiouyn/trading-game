# Broker entry split — evidence index

Written 2026-11-11T20:00:24+01:00 (Europe/Paris, CET). UNIT-only first commit: `e14606324d5d8c01c6681a095c74478d5e46bf90`.
Base: `110583b0aa73ece1dc3b856665f3be0405f1acc3`; fetched remote calibration tip matches exactly. Local `492d60e4` init was ignored.

## Final change
- Load inactive Settings through the existing lazy-app/Suspense contract; remove the now-unused eager-only dispatch path.
- Load Broker News only when selected, with exactly its existing loading skeleton.
- Keep Overview synchronous. A larger prototype saved bytes but collapsed scroll height on phone at text scale2. The unchanged base passed its existing screenshot; keeping Overview eager fixes the actual regression without scroll-restoration machinery or new CSS.
- No chart/table/indicator/trendline implementation, engine, market, economy, budget-limit/helper, or hook edits. No Wire dictionary extraction was needed.
- Cold optional requests can show the existing shell/News skeleton. Loaded content, focus, drafts, navigation and appearance remain the acceptance contract.

## Authoritative final results
All artifact evidence is under `/workspace/avalon/evidence/ui-broker-entry-split/`.
`FINAL-MANIFEST.json` and `REPORT.md` are generated after this index commit, from the final Git SHA. Their actual statuses and values are authoritative; an absent/incomplete manifest is NOT a pass. This index does not predeclare checks still running when it was written.

- `final-checks/checks.json` plus individual logs: lint, typecheck, normal build, check-hooks, locked-ledger map-no-dup, npm test and unchanged route-budget.
- `final-probe-1.json`, `final-probe-2.json`, `final-assets/VERIFIED.json`: two stable exact browser-probe files, four fresh pages, raw SHA256 and Node gzip verification against actual production files.
- `base-probe-*.json`, `base-assets/VERIFIED.json`:218932 counted baseline bytes, independently reproduced from exact base in scratch.
- `stack/INPUTS.json`: exact approved card1–4 SHAs. `stack/FINAL-INPUTS.json`, final probes/assets/comparison: final branch merged locally with those exact approved commits. Baseline219719 bytes is independently reproduced; documentation-only conflicts preserve both documents. Source conflicts fail closed.
- Acceptance requires >=10240 counted gzip bytes saved on BOTH baselines and <=215KiB, unchanged 60KiB plot exclusion. This is artifact-size proof, not a runtime speedup claim. Per-module estimates were used only to investigate, never as savings proof.

## Browser proof
- `e2e/INPUTS.json`, `e2e/results.json`, final archived artifacts: one fresh detached checkout per attempt, fresh npm ci and .data, desktop and touch-phone projects. Complete cohort covers import boundaries/cold Account, BR-7 table/chart, M1-07 candles, M1-06 orders, SMA/EMA, BB/RSI/VWAP, trendlines and storage, About, Settings, phone navigation.
- Before: `before-stable/` and `before-optional/`. Final after: `after-final/` and `after-final-optional/`. Desktop1440×900; phone viewport390×844. Text/focus, raw pixel comparisons and image paths are recorded in final manifest. Only the expected build-version line is excluded in Settings About; no chart pixels masked. Known12-pixel rounded-tab antialiasing noise is reported, not disguised as raw equality.
- Existing strict BR-10 scale2 screenshot remains unchanged and is part of the final clean cohort. No baseline regeneration or assertion removal.

## Failed attempts retained honestly
`e2e/initial/`:91 pass/70 project skips/7 failures. `e2e/cohort2/`:96/70/2. `e2e/cohort3/`:97/70/1. Initial screenshot-run readiness deadlock and unsettled-canvas captures are also retained.

Corrections: wait for cold UI before freezing fake timers; wait for a lazy News body under the paused clock; target chart coordinates after the tool's auto-scroll at every drawing session; let a prior touch pan stop before checking a separate no-pan draw. Exact base reproduces the original desktop stale-coordinate failure. A later BB failure restored a closed fixed-asset window because navigation raced the pending device-layout save; existing close helpers now await the existing flush hook AFTER closing. All original trading, indicator, drawing, persistence and strict screenshot assertions remain.

## Qualifications and cleanup
- Only apt/`playwright install --with-deps` is omitted per explicit owner instruction: no root/apt-lock permission. Plain Chromium install runs; cached browsers/system libraries work. No repo check or hook bypass.
- Node24.22.1 locally; remote CI uses22. No remote CI/Gatekeeper certification claimed.
- Existing phone second-Enter `focusPortfolio` issue is out of scope and unchanged.
- Owned temporary e2e/integration worktrees are removed after evidence capture; cleanup manifests identify paths/inode counts. Main UI worktrees and earlier evidence are retained.
- No push, PR, merge to a target branch, deploy, spending or Gatekeeper handoff. Owner may push the verified branch normally.
