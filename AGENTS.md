<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Avalon agent workflow (V1)

Local shared-box work only. No cloud agents. Remote GitHub CI remains independently required after local preflight.

| Rule | Enforcement |
|------|-------------|
| One active coding unit (one branch/worktree/card) | Process: do not mix unrelated cards into the same PR |
| Prefer the cheap path; escalate only after it fails or the core is hard | Judgment (prominent) |
| One local preflight per changed working-tree snapshot | `npm run preflight` → content fingerprint (HEAD + `git diff HEAD` + untracked non-ignored bytes); mid-run change → stale |
| Local app-preflight mirrors `ci.yml` app jobs only (not engine/city/macro); e2e via `--browser` | `tests/unit/ci/preflight.test.ts` bidirectional parity vs `.github/workflows/ci.yml`; `NOT_COVERED` lists remote-required workflows |
| Omitted e2e ⇒ `scope=core_only` incomplete; never CI/GK certification | `phasesOk` + `scope` + `certified=false`; dry-run / fail-fast leftovers are `not_run` |
| Browser-prove real changed player paths before GK for UI/state transitions | Judgment + `--browser` / Playwright when the change needs it |
| Verify preview HTTP readiness before browser; use a stable already-built preview tied to this worktree/head and PID—do not mutate its build outputs during replay; if unreachable, one short timeout then fix first (no repeated long retries) | Judgment |
| GK handoff: exact SHA, base, diff/ACs, commands+output, screenshots, known gaps | Judgment |
| Reuse evidence only for an unchanged head fingerprint; otherwise targeted impact replay, not full suites by reflex | Preflight fingerprint + judgment |
| Red CI resolved before GK product review | Judgment |
| GK may independently re-run when trust/integration changed | Judgment (checks not prohibited) |
| No polling loops; events authoritative; verify once at handoff | Judgment |
| User owns milestone/blocker updates | Judgment |
| No cloud | Judgment / board |

Command: `npm run preflight` or `npm run preflight -- --browser`. Evidence: `.preflight/` (gitignored; phase logs are files, not live-streamed). Dry-run is a plan only. `certified` is always false — remote CI and Gatekeeper remain independently required.
