# ci-lesson13 — pid-file-only kills

One check. It enforces review lesson 13 and nothing else.

Lesson 13: on the shared box, kill a server by the pid in its pid file. Never `pkill` or `killall` by name. A reviewer cleanup that killed by name took down the server on port 3199.

The lesson does not ask for a /proc start-time, command-line, or port-owner check before a pid-file kill. This unit does not add one. `kill` of a pid, including a pid read from a pid file, stays allowed. So does `process.kill` of a child the same process spawned.

## Check

`npm run ci:lesson13` runs `node tools/ci/lesson13-pid-kills.mjs`. Exit 0 when the tree is clean. Exit 1 and print `file:line` when it finds a name-kill.

It scans only:

- `scripts/` and `tools/` source (`.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`, `.sh`, `.bash`, `.py`)
- the `scripts` values in the root `package.json`
- `playwright.config.*` at the repo root and under `tests/`
- shell fences tagged `bash`, `sh`, `shell`, or `zsh` in docs whose path contains `runbook`, plus a runbook file that is itself shell or source

Comments are ignored. A hit is a command token that is exactly `pkill` or `killall`, including after `sudo`, `command`, `nohup`, `nice`, `time`, `xargs`, `eval`, or `exec`, after a leading `NAME=value`, and inside a quoted script (`exec("pkill …")`, `bash -c "pkill …"`, a fenced runbook line). The word as a non-command argument (`echo pkill`) is not a hit. Prose is not a hit, so lesson 13's own sentence stays clean.

An empty allowlist lives in the checker. Add a path there only when a hit is not a trivial fix, with the reason on that line.

## Proof

`tests/unit/ci/lesson13-pid-kills.test.ts` flags a known-bad sample (name-kill by `pkill` / `killall`, including a quoted `exec` / `spawn`) and reports no hits on the current tree.

Wired into `.github/workflows/ci.yml` (`checks`) and `tools/ci/phases.mjs` so local preflight stays in step with that job.

## Out of scope

No edits under `src/server/broker`, Wire statement code, `src/server/auth`, or `src/app/api/auth`.
