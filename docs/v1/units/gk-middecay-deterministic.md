# UNIT — deterministic GK residual mid-decay test

Written **2026-11-12 20:04 Europe/Paris (CET)**, before the test edit. Branch `sys/gk-middecay-deterministic`; base `origin/main` `84c537643f1121c80398da9fdcc16a9ec9a337f7` (PR #161). Identity Forge (trading-game bot) <forge@trading-game.local>. Tier: low (tests and review-lesson notes only). Root `UNIT.md` is unchanged and equals main.

## Player outcome and scope

No product change. `tests/unit/gk/gk-residual-middecay.test.ts` ("LiveMarket restart mid-decay restores residual rows and does not full-reapply stockApplied on base") was flaky: the mid-decay residual still had to land more than 0.5 away from a full `stockApplied` re-apply on the catalog base, but the restored AVB last was not stable across runs, so CI could fail the bound even when the restore path was correct. This unit seeds the clock's already-supported test hooks so that assertion is deterministic. It does not change LiveMarket, ShockFeed, or the rumor book, and it does not weaken the bound.

## Grounding

- Gatekeeper: the test at line 40 went red on PR #156 `ci/checks` (run 43276541504): `expected 0.42 to be greater than 0.5`. Twelve local runs had restored prices 71.34–94.89; CI got 97.31 against the 97.73 full-on-base bound. Lesson: seed LiveMarket's randomness in that test, or assert on a deterministic quantity.
- This checkout, 12 isolated runs of the same test on `84c53764` (unseeded): `after` was always 97.79 and `fullOnBase` always 97.73, but `decayed` ranged 347.96–502.37 and `restored` 74.44–107.39 (12 unique values). Failures 0/12 here; the CI miss is the tight 0.5 bound on a moving `restored`.
- `LiveMarketOptions` already accepts `seed` and `rumorSecret` (`src/server/market/clock.ts`). Production seed is `PORT_AVALON_MARKET_SEED` (17). The quote walk, storm schedule, and `forceStormForTests` use that seed. The unseeded RNG is the rumor book's `newRumorSecret()` (`crypto.randomBytes(32).toString("hex")` in `src/server/market/rumorClaims.ts`), used as the HMAC key for rumor truth, horizon, and accuracy. Over the test's 10 game days, those resolutions move marks (and the rematerialized residual), so `restored` changes every run when the secret is not injected.
- Probe on this checkout: two unseeded clocks minted secrets `41d906d8…` and `6cb07e6e…` and different prices; two clocks with `rumorSecret: "gk-residual-middecay-test-secret"` both returned `decayed` 439.77 and `restored` 94.07 (`|restored - fullOnBase|` 3.66, still greater than 0.5).
- Same injection pattern as `tests/unit/gk/gk-analyst-notes.test.ts` and `tests/unit/gk/gk-rumor-claims.test.ts`.

## Plan

- Change only the test file (and this unit note plus a REVIEW-LESSONS entry). Pass `seed: PORT_AVALON_MARKET_SEED` and a fixed `rumorSecret` into both LiveMarket constructions in the mid-decay restart test, and into the erpAccrued restart test that also built an unseeded LiveMarket.
- Keep the existing asserts, including `|restored - fullOnBase| > 0.5`. Do not loosen the bound and do not replace it with a weaker check.
- No `src/` change: the hooks already exist.

## Acceptance / proof

- The mid-decay test is deterministic. `npx vitest run tests/unit/gk/gk-residual-middecay.test.ts -t "LiveMarket restart mid-decay restores residual" --repeats 200` exited 0 at 20:08:23 CET: 201 `GK_RES_MID` lines (1 initial + 200 repeats), 0 failures, one unique payload. Stable values: `after` 97.79, `decayed` 439.77, `restored` 94.07, `fullOnBase` 97.73, `|restored - fullOnBase|` 3.66 (still greater than 0.5). Evidence `/workspace/avalon/evidence/sys-gk-middecay-deterministic/repeats/`.
- The same file stays green under the full parallel `npm test` (recorded with the preflight).
- Lint, typecheck, build, check-hooks, route-budget, ledger-no-dup, `test:formal-money`, and verify-port-avalon pass on the final head. Root `UNIT.md` equals main.
