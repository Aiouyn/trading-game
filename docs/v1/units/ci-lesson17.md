# ci-lesson17 — skipped checks are not passes

Lesson 17 (`docs/v1/REVIEW-LESSONS.md`). A required check that was skipped, focused away, or ran zero tests is not a pass. Handoffs list pass, fail, and skip separately (b8257aaf and later reviews).

## Check

`node tools/ci/skipped-checks.mjs`

The script exits 1 when the tree can turn a skip into a green result:

- a root-suite file (`npm test` includes: `src/**/*.test.ts(x)`, `scripts/**/*.test.ts`, `tests/unit/**/*.test.ts(x)`, `tests/contract/**/*.test.ts`) uses `.skip(`, `.skipIf(`, `.only(`, `fit` / `fdescribe`, or `xit` / `xdescribe`, and that call is not on the allowlist
- any committed `*.test.ts(x)` or `*.spec.ts(x)` under `src`, `scripts`, `tests`, or `packages` uses `.only(`, `fit` / `fdescribe`, `xit` / `xdescribe`, or an unconditional `.skip(` (no runtime condition, or the condition is the literal `true`)
- a `vitest.config.*` sets `passWithNoTests: true` (zero tests, exit 0)
- a workflow step sets `continue-on-error` to anything other than false, a workflow or `package.json` script contains `|| true`, or a required gate `run:` has an `if:` that can skip it

`auditRun` rejects a reported vitest, jest, or Playwright summary with `total === 0`, or a skipped test whose file and title are not allowlisted. The unit test feeds those samples. The CI step scans the tree.

Allowlisted skips are printed as `SKIP` with the reason. They are not printed as passes.

## Allowlist

1. `tests/unit/city/paths.test.ts` — C-16 runs only on a City Dev branch. Every other branch runs the companion test that asserts the skip verdict, so this case is not an unrun gate.
2. `tests/contract/17b-channels.swap.test.ts` — CH-06 cannot name protocol types until `packages/protocol` exists. The body is `expect.fail`, so the suite fails closed once that package lands.

## Not this check

- Playwright `test.skip(condition)` viewport and project filters. The other project still runs the spec.
- Macro nightly `skipIf` behind `TYCOON_CALIB`, `TYCOON_CRISIS_CALIB`, or `TYCOON_PERF_REF`.
- `npm run check:paths`, already conditional on `v3/quay-shell*` heads.
- `it.todo` in the ledger package. Vitest reports those as todo, not as this allowlist.
- The same characters inside a string, a comment, a regex literal, or a template (outside `${}`), a local `fit()` helper, a `skipIf` function that is not `it` / `test` / `describe`, and any file that is not a test. The match has to be a real test call.

## Proof

`tests/unit/ci/skipped-checks.test.ts`. CI runs the script from `.github/workflows/ci.yml` (local preflight phase `skipped-checks`).
