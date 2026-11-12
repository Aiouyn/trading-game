# UNIT-DELTA: Gatekeeper quals on 364d1546 (scrub, e2e flag, phone feedback, rotate)

**Branch:** `eng/broker-headroom` (stacked on `364d1546` / merge `6c433b8c`)  
**Base of this delta:** `4b391554` (broker first-load headroom already on the branch)  
**Worktree:** `/workspace/avalon/broker-headroom`  
**When written:** 2026-11-11 23:17:54 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper **bounded PASS qualified** on `364d1546` (REVIEW in `/workspace/avalon/evidence/launchpad/gatekeeper/364d1546/`). No blockers. Fold the listed quals into one small commit on this branch, then finish headroom (exact-head, affected e2e, stray-init, push, handoff). Charge path and the 215 KB first-load cap are unchanged.

## Quals to close

1. **Scrub stack home paths.** Absolute paths in stacks stay today: `/home/alice/src/quay/app.ts:10:2`, `/Users/alice/...`, `C:\Users\Alice\...`. Redact the home prefix (`/home/<user>`, `/Users/<name>`, `C:\Users\<Name>` / forward-slash form) to `[redacted]`, keep the rest of the frame.
2. **`ACC_ID` before the phone regex.** `acc_0123456789abcdef0123456789abcdef` is currently chewed into `acc_[redacted]abcdef[redacted]abcdef`. Run `acc_…` replacement first so the whole id becomes `[redacted]`.
3. **Stop over-redaction of prices and UA versions.** The phone regex treats `.` as a separator, so `123456.78` becomes `[redacted]`. The IPv4 regex eats `Chrome/122.0.0.0`. Keep decimal quantities and `/major.minor.patch.build` product versions; still redact real phones and dotted IPv4 peers.
4. **Limit the `\s+at\s+` fold.** `foldTelemetryText` rewrites every ` at ` to `@`, so `HALC will rise at 11:20` becomes `HALC will rise@11:20` (the time itself already survives). Fold `at` only in email-like context (`local at domain.tld`), same as `[at]` / `(at)` / `{at}`. Plain English `rise at 11:20` and `resolved at tick 27700` stay.
5. **Build-time guard so a production artifact cannot ship with the consent prompt off.** `NEXT_PUBLIC_QUAY_E2E=1` without an explicit official-e2e marker must fail `next build` (and not inline `"1"`). Official Playwright `webServer.env` sets both `NEXT_PUBLIC_QUAY_E2E=1` and `QUAY_OFFICIAL_E2E_BUILD=1`. A normal no-flag production build still inlines `"0"` and still cannot skip the prompt at `next start` runtime. (4b391554 already inlines the flag as `"0"`/`"1"` and forbids the name in check-hooks; this guard closes the remaining footgun of building with the flag set.)
6. **Phone feedback sheet below the top chrome.** On phone the form's `boundingBox.y` is about **−13** (under the 44 px status bar, which is `overflow: hidden`). Submit still works; move the sheet so it sits fully below the status bar (`y` ≥ 44 px), still usable, no layout jump of the bar itself.
7. **Rotate crash safety, if cheap.** `rotateStream` unlinks `.3` first, then renames down the chain. A crash after `.2` has moved to `.3` can lose an extra generation on the next rotate. Prefer write-the-new-file then atomic rename (files are ≤ 64 KB): copy source to `dest.tmp`, rename onto dest, then drop source. Live content is not discarded; the 1 MB dir ceiling and live+3 cap stay.

## Proof

Extend the official scrub matrix in `tests/unit/telemetry/telemetry-delta.test.ts` with rows for (1)–(4). A small unit test for the e2e-flag helper (throws without the marker; returns `"1"` only when both are set). Rotation still respects live+3 and the dir ceiling; leftover `.tmp` is not retained. Phone feedback: the form and thanks are visible below the status bar (e2e assertion on the box). Official `/broker` first-load stays ≤ 205 KB counted (215 cap unchanged).

## Acceptance

UNIT-DELTA written first (this file). One small product commit. Then finish `eng/broker-headroom` as planned: exact-head checks, broad affected e2e once on a clean temp tree / fresh `.data` / desktop+phone covering the lazy panels **and** these telemetry quals (consent, feedback on phone), stray-init, normal push, no PR, evidence-only handoff. Preview :3199 stays 200.

## Not in this delta

Re-opening B1/B2 as blockers. Changing consent from opt-in. Raising the 215 KB cap. Charge path. A live SIGKILL mid-rename (write-then-rename is the cheap hardening; no new crash-injection harness).
