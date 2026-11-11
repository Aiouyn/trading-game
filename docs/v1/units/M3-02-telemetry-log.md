# Unit: crash-safe private-alpha telemetry log

**Branch:** `eng/infra-telemetry-finish`  
**Base:** `81b5b144` (`eng/broker-idempotency`; `main` does not contain it)  
**Board:** M3-02 (error logs visible in host logging)

## Goal

`promoteRotation` in `src/server/telemetry/log.ts` copies a log to `dest.tmp` and renames it onto the destination. A crash in that window can publish a partial temp file, replace a good rotation with it, or leave a torn append on the live jsonl. The write path must survive process death: fsync the temp file and the directory, and at startup repair a torn tail and leftover temp files. A line is acknowledged only after that durability step. A crash may drop an in-flight line. It must not drop an acknowledged one, and every retained file must stay valid JSONL.

## Files

- `src/server/telemetry/log.ts` — durable append, rotation, startup recovery
- `tests/unit/telemetry/telemetry-crash.test.ts` — recovery cases and a real SIGKILL crash test

No API routes. No consent or feedback UI. No broker, Wire statement, or auth edits.

## Acceptance

1. This note exists before the product edit.
2. Leftover `*.jsonl*.tmp` files are recovered at startup: a temp is never renamed over a destination that already exists; a torn tail is truncated to the last complete JSON line; a complete temp whose destination is missing is installed.
3. Append and rotation fsync the file, and rotation fsyncs the directory after the rename, before the write is acknowledged.
4. A child process writes log lines in a loop and is SIGKILLed at varied points across many iterations. After recovery the log parses, and every acknowledged id is still present (within the existing rotation retention).
5. Exact-head checks: lint, typecheck, no-flag build, check-hooks, route-budget (`/broker` ≤ 205 KB), ledger map-no-dup, `npm test`. Affected telemetry e2e once on a fresh `.data` directory and a free port (not 3199 or 3102).

## How to verify

```bash
npx vitest run tests/unit/telemetry/telemetry-crash.test.ts
npm run lint
npm run typecheck
npm run build
node tools/check-hooks.mjs .next/static .next/server
node tools/ci/route-budget.mjs /broker
npx vitest run test/map-no-dup.test.ts   # in packages/engine/ledger
npm test
# fresh .data, free port: playwright tests/e2e/17b/telemetry-consent.spec.ts tests/e2e/17b/telemetry-feedback.spec.ts
```
