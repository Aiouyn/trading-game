# Infra unit: Isolate preflight test git from hook GIT_* env

Written before application code: 2026-11-11T20:07:16+01:00 Europe/Paris (UTC+1).
Base: `bd4636f7bfcd949cb1b5f9caa7119c37364c7eb7` (`origin/main` after fetch, 2026-11-11 20:05 Europe/Paris).

## Outcome
`npm test` can run inside a git hook (or any other process that sets `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE`, or other `GIT_*` variables) without writing commits, config, or index changes into the repository that set those variables.

The failure mode: `tests/unit/ci/preflight.test.ts` helper `git(cwd, args)` calls `spawnSync('git', args, { cwd })` and inherits `process.env`. Hook env then makes `git init`, `git config user.email pf@test`, and `git commit -m init` (which adds `tracked.txt`) land in the real repo on the branch being pushed.

## Acceptance checks
1. The test-file `git()` helper, and any production preflight git helper that the tests drive, run git with an env that has every `GIT_*` variable stripped. `cwd` alone selects the intended repo.
2. A regression test creates a throwaway victim repo with one commit, records its HEAD and index, sets `process.env.GIT_DIR` / `GIT_INDEX_FILE` / `GIT_WORK_TREE` at the victim, runs the helper's init/config/commit flow on a separate temp directory, restores env in `finally`, and asserts the victim's HEAD and index are unchanged.
3. That regression test fails without the env-stripping fix and passes with it (both runs recorded in evidence).
4. Other `spawnSync`/`execSync` git call sites in `tests/` and production preflight are inventoried. Test-side mutating leaks are fixed. A production leak, if present, is reported and fixed minimally. Read-only call sites that only inspect the current checkout are reported if left unchanged.
5. Run, from this worktree: `npm run lint`, `npm run typecheck`, `npm run build`, `node tools/check-hooks.mjs .next/static .next/server`, route-budget for `/broker` (BUDGET_PORT in 3300-3399), ledger `map-no-dup`, and `npm test` from a plain shell with `GIT_*` unset. No e2e unless a check requires it.
6. Before push, `git log -3` has no stray `init` / `pf@test` commit. Push `fix/preflight-git-env` normally (hooks on, no force, no PR, no merge). After push, re-check `git log -3` and `git status` to prove the hook run did not leave a new stray commit.

## Out of scope
No player-facing UI. No merge to main. No hook bypass.
