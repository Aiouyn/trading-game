# Unit: spend guard (M3-06)

**Branch:** `eng/infra-spend-guard`  
**Base:** `81b5b144` (`eng/broker-idempotency`). `main` (`24f67e0a`) does not contain that commit, so the branch stays there. If `main` moves later, bring it in with a merge, never a rebase.  
**When written:** 2026-11-11 — before product-code edits.  
**Board:** M3-06 Spend guard. M0-06 host sketch is Vercel Pro + Supabase Pro (~$45/mo). Monetization is out. Tick-host cost is TBD. No spend and no provision in this unit.

## Goal

The private alpha must not start, or enable, a paid provider unless the owner sets an explicit opt-in. Paid providers are paid hosting, a hosted database, a remote analytics sink, a remote log sink, and an external tick host. The local file stores, the in-process 5s quote clock, and the existing local telemetry jsonl are not paid providers.

`QUAY_SPEND_OPT_IN=1` is the owner's yes for the process to accept that configuration. It does not provision a project, open a connection, or deploy. Dashboard spend alerts stay the owner's own clicks.

## Files

- `src/server/spend/guard.ts` — pure config gate (refusal, opt-in, kill switch, boot validation).
- `src/instrumentation.ts` — calls the gate once at server boot.
- `src/proxy.ts` — when the kill switch is on, mutating `/api/*` requests get 503. GET stays up.
- `src/server/market/clock.ts` — kill switch skips the quote interval. No other clock change.
- `src/app/api/health/route.ts` — `GET /api/health`.
- `tools/ops/ready.ts` — `npm run ready` (env, local file-store probe, optional health URL). Not the CI `preflight`.
- `.env.example` — every app env var, no secrets. `.gitignore` keeps ignoring `.env*` except this file.
- `docs/v1/ops/spend-guard.md` — cost drivers, caps, and the Vercel and Supabase settings the owner turns on.
- `tests/unit/spend/spend-guard.test.ts` — refusal, opt-in, bad flag, kill switch.
- `tests/e2e/ops/health.spec.ts` — health on the default (no opt-in, kill switch off) server.

## Out of this unit

Do not edit `src/server/broker/*`, Wire statement code, `src/server/auth/*`, `src/app/api/auth/*`, or `src/server/telemetry/*`. Alpha-telemetry already owns logging and analytics volume on this base. No monetization, no SDK, no deploy.

Hosting prerequisite, not a defect: `assertLocalSingleProcessAuth` returns 503 when `VERCEL` is set, even after spend opt-in. Sessions are file-backed, the plan is a persistent single-process host, and no host is chosen or approved yet. A serverless host would first need a hosted session store, owned by the auth lane. See `docs/v1/ops/spend-guard.md`.

## Acceptance

1. This unit doc exists before the product edits.
2. A paid-provider env var without `QUAY_SPEND_OPT_IN=1` throws a message that names the flag and the variable, and does not echo the value. The same env with the flag set exactly to `1` allows that provider. The default env (local file store, in-process clock) starts.
3. A flag value other than unset or `1` fails boot validation. `QUAY_KILL_SWITCH=1` pauses tick autostart and marks mutations read-only.
4. `docs/v1/ops/spend-guard.md` lists each cost driver and the owner-side Vercel and Supabase controls, with the thresholds below.
5. Exact-head checks: lint, typecheck, no-flag build, check-hooks, route-budget `/broker` (stay ≤ 205 KB), ledger map-no-dup, `npm test`. Then the health e2e once, fresh `.data`, free port, not 3199 or 3102.
6. Push `eng/infra-spend-guard`. No force-push, no PR, no merge, no deploy, no spend.

## How to verify

1. `npx vitest run tests/unit/spend/spend-guard.test.ts` — refusal, opt-in, bad flag, kill switch.
2. Boot with `DATABASE_URL=https://example.supabase.co` and no opt-in: `register()` throws before serving. Same URL plus `QUAY_SPEND_OPT_IN=1`: the gate allows it and still opens no connection.
3. `GET /api/health` on a normal server returns `ok: true`, `spendOptIn: false`, `paidProviders: []`, `killSwitch: false`.
4. `QUAY_KILL_SWITCH=1`: health reports `readOnly: true` and `tickAutostart: false`. `POST /api/auth/login` is 503. GET still returns.
5. `npm run ready` with a clean env exits 0. Point `READY_URL` at the server and it checks `/api/health`.
6. Owner, in the dashboards (this repo cannot do it): Vercel Spend Management on-demand budget **$10**, pause production at 100%; Supabase Spend Cap **on**. Details in `docs/v1/ops/spend-guard.md`.
