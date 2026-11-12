# Unit: telemetry guest keys, trusted hop, bounded throttle

**Branch:** `eng/infra-telemetry-guest-keys`  
**Base:** `0a8c192c` (`eng/infra-telemetry-finish`)  
**Board:** M3-02 (error logs) and the private-alpha rate limit

## Goal

Three bounds on shared in-memory counters:

1. Guests without `QUAY_TRUST_PROXY=1` all share the telemetry client key `anon-missing`, so 8 feedback posts 429 every guest. Key a guest by session when one exists, otherwise by a guest cookie (`quay_tel`) minted on the telemetry response. One guest at the per-client cap must not 429 a second guest. The per-kind global cap stays.
2. With `QUAY_TRUST_PROXY=1`, the trusted client IP is the rightmost `X-Forwarded-For` hop (the one our proxy appended). A spoofed left hop does not pick the bucket.
3. `AttemptThrottle` drops expired buckets and refuses to grow past a max under 5,000 entries, for every caller (login, telemetry, mutation limits). `check` / `hit` / `clear` stay the same for existing callers. Expired buckets reset. The map stays under 5,000 keys.

## Files

- `src/server/telemetry/ratelimit.ts` — guest key, rightmost trusted hop
- `src/server/telemetry/http.ts` — set `quay_tel` when the request has none
- `src/server/auth/throttle.ts` — TTL eviction and max entries
- `tests/unit/telemetry/telemetry-guest-key.test.ts`
- `tests/unit/auth/throttle-bound.test.ts`

`src/server/auth/service.ts`, the rest of `src/server/auth/*`, `src/app/api/auth/*`, `src/server/broker/*`, and Wire statement code stay untouched.

## Acceptance

1. This note is its own commit, before the product edit.
2. Two guests with different `quay_tel` cookies: the one at the feedback cap receives 429; the other still receives 200. The global cap still applies.
3. With `QUAY_TRUST_PROXY=1`, rate-limit identity follows the rightmost `X-Forwarded-For` hop. A different left hop with the same right hop shares the bucket. A different right hop does not.
4. After 5,000 distinct `AttemptThrottle` keys, `size` is under 5,000. A key that was blocked is allowed again after its window, and expired keys do not keep the map full.
5. Exact-head checks: lint, typecheck, no-flag build, check-hooks, route-budget (`/broker` ≤ 205 KB), ledger map-no-dup, `npm test`. Telemetry feedback and consent e2e once on a fresh `.data` directory and a free port (not 3199 or 3102).

## How to verify

```bash
npx vitest run tests/unit/telemetry/telemetry-guest-key.test.ts tests/unit/auth/throttle-bound.test.ts
npm run lint && npm run typecheck && npm run build
node tools/check-hooks.mjs .next/static .next/server
node tools/ci/route-budget.mjs /broker
npx vitest run test/map-no-dup.test.ts   # packages/engine/ledger
npm test
# fresh .data, free port:
# playwright tests/e2e/17b/telemetry-consent.spec.ts tests/e2e/17b/telemetry-feedback.spec.ts
```
