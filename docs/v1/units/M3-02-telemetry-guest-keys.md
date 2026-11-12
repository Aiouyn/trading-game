# Unit: telemetry guest keys, trusted hop, bounded throttle

**Branch:** `eng/infra-telemetry-guest-keys`  
**Base:** `0a8c192c` (`eng/infra-telemetry-finish`)  
**Board:** M3-02 (error logs) and the private-alpha rate limit

## Goal

Three bounds on shared in-memory counters:

1. Guests without `QUAY_TRUST_PROXY=1` all share the telemetry client key `anon-missing`, so 8 feedback posts 429 every guest. Key a guest by a **live** session (`peekSession`) when one resolves, otherwise by a guest cookie (`quay_tel`) or a trusted IP. A forged `quay_sid` is not a session key. One guest at the per-client cap must not 429 a second guest. The per-kind global cap stays. A missing or invalid `quay_tel` is not minted on a 429.
2. A per-connection backstop, keyed by `socket.remoteAddress` (or `connection.remoteAddress`), applies even with `QUAY_TRUST_PROXY` off, so one guest rotating `quay_tel` cannot spend the global cap. Next 16's route `Request` does not carry the Node socket (`NextRequestAdapter` leaves `ip` unset, and `x-forwarded-for` is only defaulted with `??=`, so a client can spoof it). The backstop uses the socket property when it is present. It does not trust `X-Forwarded-For` for this bucket.
3. With `QUAY_TRUST_PROXY=1`, the trusted client IP is `forwardedClientFromRight`: count `QUAY_TRUSTED_PROXY_HOPS` in from the right (default 1, the hop our proxy appended). A spoofed left hop does not pick the bucket. A chain shorter than the hop count still uses the rightmost value. Hops longer than 64 characters are dropped. **`forwardedClientFromRight` is copied from `mutationLimit.ts` on `eng/infra-rate-limits-backup` and should be unified into one helper after both branches land.**
4. `AttemptThrottle` drops expired buckets and zero/low-count entries before it grows, and never evicts a key that is at or over its limit inside its window. If every slot is a live lockout, a new key fails closed. A global failed-attempt cap (total `hit`s per window, all keys) refuses **only new keys** once it is spent, so the login map cannot fill with lockouts inside one 15-minute window. Expired buckets still reset. `check` / `hit` / `clear` stay the same for callers under both caps.

## Files

- `src/server/telemetry/ratelimit.ts` — guest key, rightmost trusted hop
- `src/server/telemetry/http.ts` — set `quay_tel` when the request has none
- `src/server/auth/throttle.ts` — TTL eviction and max entries
- `tests/unit/telemetry/telemetry-guest-key.test.ts`
- `tests/unit/auth/throttle-bound.test.ts`

`src/server/auth/service.ts` and `src/app/api/auth/*` stay untouched. The per-client IP cap and any “right password still logs in when new keys are refused” path need those files; the diffs are below and are not applied.

## Login throttle budget

Password checks are scrypt (`N=16384`, `r=8`, `p=1`, 64-byte key). On this 4-core host, one serial client does about 25 verifies/s. That is not the bound. With the libuv pool saturated (`UV_THREADPOOL_SIZE=8`, 8–16 in flight) the hash path peaks at about **132 verifies/s**.

**Stated bound: 200 failed verifies/second.** It sits above that measured ceiling, and `AttemptThrottle` enforces it, so a larger pool cannot mint more lockouts than the map is built for.

Login uses `new AttemptThrottle(10, 15 * 60 * 1000)` (10 failures, 15 minutes):

- Global failure cap `G = ceil(200/s × 900s) = 180,000` hits per window.
- A lockout costs 10 hits, so one window can create at most `floor(180,000 / 10) = 18,000` lockouts.
- Map cap `M = 18,000 + 1 = 18,001`. Lockouts alone cannot fill it. The next new key is refused because `G` is spent, not because a live lockout was evicted.
- Callers that pass `maxEntries` / `globalFailureCap` (tests) override this. The 3-argument constructor login already uses does not.

**Memory at that cap:** 18,000 buckets with 32-character keys use about **6.5 MB** of heap (~363 bytes each), measured with `process.memoryUsage().heapUsed` after the map is filled and before a second GC. Eight-character keys are about 3.6 MB (~199 bytes each).

A correct password on a handle that is still under this global bound is allowed: `check` returns null, and `login` verifies the password. Once the global cap is spent, or the map is actually full of lockouts, a **new** key is refused with the same 429 `check` already returns. Letting the right password through and answering 429 for the wrong one would tell the caller the password was correct. Matching the timing with scrypt and still returning 200 vs 429 leaks the same way. That path is not applied.

## Not applied — service.ts and the login route

Per-client login cap (trusted client IP only when `QUAY_TRUST_PROXY=1`, same right-to-left `X-Forwarded-For` rule as telemetry). `AttemptThrottle.check` / `hit` already take an optional client key. Login never passes one.

```ts
// src/app/api/auth/login/route.ts
import { trustedClientIp } from "@/server/telemetry/ratelimit";
const { view, rawToken } = await getAuthService().login({
  handle,
  password,
  trustedClientIp: trustedClientIp(request),
});

// src/server/auth/service.ts — login() only
async login(input: { handle: string; password: string; trustedClientIp?: string | null }) {
  const clientKey = input.trustedClientIp ? `ip:${input.trustedClientIp}` : null;
  const handleKey = input.handle.trim().toLowerCase();
  const retry = this.loginThrottle.check(handleKey || "unknown", clientKey);
  if (retry !== null) throw new AuthError("RATE_LIMITED", "Too many sign-in attempts. Try again later.", 429, retry);
  // on each existing failure path, pass the same clientKey:
  // this.loginThrottle.hit(handleKey || "unknown", clientKey);
  // do not clear the client bucket on success — only the handle:
  // this.loginThrottle.clear(handleKey);
}
```

Ten failures from one trusted IP share that client bucket (same limit and window as the handle). A success must not wipe it.

## Acceptance

1. This note is its own commit, before the product edit.
2. Two guests with different `quay_tel` cookies: the one at the feedback cap receives 429; the other still receives 200. The global cap still applies. A 429 for a missing or invalid `quay_tel` does not `Set-Cookie`. A forged `quay_sid` does not get its own key; a live session does.
3. One socket rotating `quay_tel` hits the connection backstop; a second socket still receives 200.
4. With `QUAY_TRUST_PROXY=1`, rate-limit identity follows `QUAY_TRUSTED_PROXY_HOPS` from the right (default 1). A different left hop with the same selected hop shares the bucket. A different selected hop does not. A short chain does not fall through to the left spoof.
5. A lockout survives a 5,000-key flood. Under the global failure bound, `check` on an unrelated handle is allowed and a correct `login` succeeds. At the hard cap of live lockouts, a new key is denied and no lockout is dropped. After the window, an expired key is allowed again. Heap for 18,000 login-shaped lockouts stays well under 32 MB.
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
