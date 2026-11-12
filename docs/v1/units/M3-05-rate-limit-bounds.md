# Unit: bound the mutation limiter and trust the rightmost forwarded hop

**Branch:** `eng/infra-rate-limits-backup`  
**Follows:** the restore-lock commit on this branch.  
**Board:** M3-05. Gatekeeper: junk cookies grew the limiter without bound, and the first `X-Forwarded-For` hop can be spoofed.

## Goal

Unauthenticated and invalid-session mutations are limited by client IP, not by a hash of the cookie. The limiter's own map drops expired windows and never grows past a cap. With `QUAY_TRUST_PROXY=1`, the client address is the rightmost forwarded hop (the one our proxy appended), or the hop `QUAY_TRUSTED_PROXY_HOPS` steps in from the right.

This stays inside `src/server/mutationLimit.ts`. It does not change `AttemptThrottle` or telemetry. `forwardedClientFromRight` is the parsing helper to share later with telemetry's `trustedClientIp`, which still reads the leftmost hop on this branch.

## Files

- `src/server/mutationLimit.ts`
- `tests/unit/server/m3-05-mutation-limit.test.ts`

## Defaults

| Env | Default | Meaning |
|---|---|---|
| `QUAY_MUTATION_MAX_KEYS` | 4096 | Most buckets kept after expired ones are dropped. |
| `QUAY_TRUSTED_PROXY_HOPS` | 1 | How many hops in from the right to trust. 1 is the rightmost. |

`QUAY_TRUST_PROXY` is unchanged: without it, forwarded headers are ignored and every invalid cookie shares one `anon` bucket.

## Acceptance

1. This note is committed before the product edits.
2. Thousands of distinct invalid cookies from one client IP share that IP's cap and do not each open a bucket.
3. After the cap is reached, further new keys do not push the map past `QUAY_MUTATION_MAX_KEYS`. Expired windows are removed on the next check.
4. `X-Forwarded-For: spoof, real` with hops 1 uses `real`. A different left hop and the same rightmost hop stay on one cap. A different rightmost hop is a different client.
5. Signed-in players still use their account id. A 429 still happens before any order, launch, trade, or Wire post is written.

## How to verify

1. `QUAY_TRUST_PROXY=1` and `QUAY_MUTATION_IP_LIMIT=2`.
2. POST a mutating route three times with different `quay_sid` cookies and `X-Forwarded-For: 1.1.1.1, 203.0.113.8`. The third is 429.
3. Repeat with `X-Forwarded-For: 9.9.9.9, 203.0.113.8` while the cap is spent. Still 429. Change only the rightmost hop and the new client has its own budget.
