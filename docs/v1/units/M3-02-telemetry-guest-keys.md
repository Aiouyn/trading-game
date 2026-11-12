# Unit: telemetry guest keys, trusted hop, bounded throttle

**Branch:** `eng/infra-telemetry-guest-keys`  
**Base:** `0a8c192c` (`eng/infra-telemetry-finish`)  
**Board:** M3-02 (error logs) and the private-alpha rate limit

## Goal

Three bounds on shared in-memory counters:

1. Guests without `QUAY_TRUST_PROXY=1` all share the telemetry client key `anon-missing`, so 8 feedback posts 429 every guest. Key a guest by a **live** session (`peekSession`) when one resolves, otherwise by a guest cookie (`quay_tel`) or a trusted IP. A forged `quay_sid` is not a session key. One guest at the per-client cap must not 429 a second guest. The per-kind global cap stays. A missing or invalid `quay_tel` is not minted on a 429.
2. A per-connection backstop, keyed by `socket.remoteAddress` (or `connection.remoteAddress`), applies even with `QUAY_TRUST_PROXY` off, so one guest rotating `quay_tel` cannot spend the global cap. Next 16's route `Request` does not carry the Node socket (`NextRequestAdapter` leaves `ip` unset, and `x-forwarded-for` is only defaulted with `??=`, so a client can spoof it). The backstop uses the socket property when it is present. It does not trust `X-Forwarded-For` for this bucket.
3. With `QUAY_TRUST_PROXY=1`, the trusted client IP is `forwardedClientFromRight`: count `QUAY_TRUSTED_PROXY_HOPS` in from the right (default 1, the hop our proxy appended). A spoofed left hop does not pick the bucket. A chain shorter than the hop count still uses the rightmost value. Hops longer than 64 characters are dropped. **`forwardedClientFromRight` is copied from `mutationLimit.ts` on `eng/infra-rate-limits-backup` and should be unified into one helper after both branches land.**
4. `AttemptThrottle` drops expired buckets and zero/low-count entries before it grows, and never evicts a key that is at or over its limit inside its window. If every slot is a live lockout, a new key fails closed. The map stays under 5,000 entries. `check` / `hit` / `clear` stay the same for callers under the cap. Expired buckets still reset.

## Files

- `src/server/telemetry/ratelimit.ts` — guest key, rightmost trusted hop
- `src/server/telemetry/http.ts` — set `quay_tel` when the request has none
- `src/server/auth/throttle.ts` — TTL eviction and max entries
- `tests/unit/telemetry/telemetry-guest-key.test.ts`
- `tests/unit/auth/throttle-bound.test.ts`

`src/server/auth/service.ts`, the rest of `src/server/auth/*`, `src/app/api/auth/*`, `src/server/broker/*`, and Wire statement code stay untouched.

## Acceptance

1. This note is its own commit, before the product edit.
2. Two guests with different `quay_tel` cookies: the one at the feedback cap receives 429; the other still receives 200. The global cap still applies. A 429 for a missing or invalid `quay_tel` does not `Set-Cookie`. A forged `quay_sid` does not get its own key; a live session does.
3. One socket rotating `quay_tel` hits the connection backstop; a second socket still receives 200.
4. With `QUAY_TRUST_PROXY=1`, rate-limit identity follows `QUAY_TRUSTED_PROXY_HOPS` from the right (default 1). A different left hop with the same selected hop shares the bucket. A different selected hop does not. A short chain does not fall through to the left spoof.
5. A lockout survives a 5,000-key flood. When the map is full of live lockouts, a new key is denied and no lockout is dropped. After the window, an expired key is allowed again and does not keep the map full.
6. Exact-head checks: lint, typecheck, no-flag build, check-hooks, route-budget (`/broker` ≤ 205 KB), ledger map-no-dup, `npm test`. Telemetry feedback and consent e2e, plus an auth e2e, on a fresh `.data` directory and a free port (not 3199 or 3102).

## How to verify

```bash
npx vitest run tests/unit/telemetry/telemetry-guest-key.test.ts tests/unit/auth/throttle-bound.test.ts
npm run lint && npm run typecheck && npm run build
node tools/check-hooks.mjs .next/static .next/server
node tools/ci/route-budget.mjs /broker
npx vitest run test/map-no-dup.test.ts   # packages/engine/ledger
npm test
# fresh .data, free port:
# playwright tests/e2e/17b/telemetry-consent.spec.ts tests/e2e/17b/telemetry-feedback.spec.ts tests/e2e/17b/M1-04-catalog.spec.ts
```
