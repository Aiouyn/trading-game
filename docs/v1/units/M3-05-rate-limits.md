# Unit: rate limits on mutating routes that lack them

**Branch:** `eng/infra-rate-limits-backup`  
**Base:** `81b5b144` (`eng/broker-idempotency`). `main` does not contain that commit.  
**Board:** M3-05. Private alpha must reject a flood before it reaches an order, a launch, or a Wire post.

## Goal

Mutating HTTP routes that have no limiter today return **429** with `Retry-After` and do not apply the mutation. Login, register, and telemetry already limit themselves; those files stay untouched. This unit reuses `AttemptThrottle` (`src/server/auth/throttle.ts`) and telemetry's trusted-client-IP rule. It does not add a limiter library or a shared-store backend.

In-memory buckets do **not** hold across serverless instances. This app already refuses `VERCEL` and `QUAY_AUTH_MULTI_PROCESS=1` with `UNSUPPORTED_DEPLOY` (503) before a mutation runs, so a distributed limiter is not wired here.

## Files

- `src/server/mutationLimit.ts` — per-player and per-trusted-IP buckets. Import only; do not edit `src/server/auth/*`, `src/server/telemetry/*`, `src/server/broker/*`, or `src/app/api/auth/*`.
- `src/app/api/broker/orders/route.ts` and `orders/cancel/route.ts`
- `src/app/api/launchpad/launch/route.ts` and `trade/route.ts`
- `src/app/api/wire/route.ts` (the POST door only; not the Wire statement implementation)
- `tests/unit/server/m3-05-mutation-limit.test.ts`

Not in this unit: `POST /api/broker/preview` (saves nothing), quote and ledger GETs, login/register (already throttled), telemetry (already throttled), logout (lives in the locked auth routes; one revoke, no new account).

## Defaults

| Env | Default | Meaning |
|---|---|---|
| `QUAY_MUTATION_SESSION_LIMIT` | 120 | Mutations per signed-in player per window. Above the idempotency suite's 55 back-to-back order posts. |
| `QUAY_MUTATION_IP_LIMIT` | 240 | Mutations per trusted client IP per window. |
| `QUAY_MUTATION_WINDOW_MS` | 60000 | Fixed window for both buckets. |

Per-IP applies only when `QUAY_TRUST_PROXY=1`, and then only from `X-Forwarded-For`, same as telemetry. Set that flag only behind a proxy that overwrites the header. A missing or invalid env value keeps the default.

The check runs **before** place, cancel, launch, trade, or `postWireStatement`. A 429 does not refresh the session and does not write cash, holdings, or orders. Under the cap, the broker's idempotent replay is unchanged.

## Acceptance

1. This note exists before the product edits in the same unit.
2. The third mutation in a window of 2 on one player is HTTP 429, body `error.code = RATE_LIMITED`, header `Retry-After` (seconds). Cash and the open order match the last allowed write.
3. While that 429 is in force, replaying an idempotency key does not fill again. After the window, the same key still returns the original intent and the same cash.
4. With `QUAY_TRUST_PROXY=1`, a second player on the same client IP is limited even when their own player budget remains. Without the flag, `X-Forwarded-For` does not create a new budget.
5. Launch, trade, and Wire POST use the same gate: a limited call does not charge the launch fee or the Wire fee.
6. Exact-head checks and one broker e2e pass are recorded in the handoff, not in this file.

## How to verify by hand

1. Start one local server: `npm run dev` (do not set `VERCEL`).
2. Sign in. From the browser origin, `POST /api/broker/orders` with a valid body until `QUAY_MUTATION_SESSION_LIMIT` (or the default 120).
3. The next POST returns 429, `Retry-After`, and `{"error":{"code":"RATE_LIMITED",...}}`. `GET /api/broker/me` still shows the cash and orders from the last 200.
4. Repeat the same `idempotencyKey` during the 429. Cash does not move. After the window, that key returns the original intent, still with the same cash.
5. Optional IP check: `QUAY_TRUST_PROXY=1` and a shared `X-Forwarded-For`. A second account on that IP gets 429 once `QUAY_MUTATION_IP_LIMIT` is spent.
