# Unit: local origin

**Branch:** `eng/infra-local-origin`  
**Base:** `060061e5` (`eng/infra-spend-guard`, Gatekeeper-passed).  
**When written:** 2026-11-12 — before the product edits.  
**Board:** playtest sign-up blocked at `127.0.0.1` on a default local start.

## Goal

A loopback server accepts a same-origin auth mutation from both `127.0.0.1:PORT` and `localhost:PORT`. `QUAY_TRUSTED_HOSTS` is that allowlist on its own. `QUAY_TRUST_PROXY` only decides whether `X-Forwarded-Host` and `X-Forwarded-For` are believed, and only the exact value `1` counts. A process that binds or serves a non-loopback host without that flag refuses to start. When `VERCEL` is set or `QUAY_PUBLIC_HOST` is set, only the configured hosts pass, and a spoofed Host or Origin does not.

`next start` with no `-H` listens on `::` (every interface). That is not loopback. `npm run dev` and `npm start` bind `127.0.0.1`, which still accepts `localhost` on this host file.

## Files

- `src/server/auth/hosts.ts` — host parsing, loopback names, the origin allowlist.
- `src/server/auth/http.ts` — `assertSameOriginMutation` uses that allowlist.
- `src/server/auth/bind.ts` — exposed-host rule and the process's listen sockets.
- `src/instrumentation-node.ts` — runs the rule next to the spend-guard boot check, then exits.
- `tools/ops/boot-bind.ts` — listens, then runs the same Node boot hook.
- `docs/v1/ops/spend-guard.md` — one line under Hosting prerequisites.
- `tests/unit/auth/local-origin.test.ts` — origin matrix.
- `tests/unit/auth/trust-proxy-boot.test.ts` — refusal, exact `1`, loopback.

## Out of this unit

Do not edit `src/server/auth/service.ts`, `src/app/api/auth/*`, `src/server/broker/*`, or the Wire statement code. `X-Forwarded-For` stays in the telemetry limiter; the flag already gates it there.

## Acceptance

1. This unit doc is its own commit, before the product edits.
2. Local default (no host env, not `VERCEL`, including `NODE_ENV=production`): `127.0.0.1:PORT` and `localhost:PORT` pass; a foreign Origin is 403; `X-Forwarded-Host` does not add a host.
3. `QUAY_TRUSTED_HOSTS` allows those hosts with and without `QUAY_TRUST_PROXY`. An unlisted forwarded host is 403 either way. `QUAY_TRUST_PROXY` must be exactly `1` before a forwarded host is believed, and even then only if it is already configured.
4. `QUAY_PUBLIC_HOST` pins the configured host. The other loopback name is not added. A spoofed host is 403.
5. `VERCEL` set: localhost is 403, and a request whose URL host and Origin are an unconfigured name is 403.
6. Boot: a listen on `0.0.0.0` or `::`, or a non-loopback `QUAY_PUBLIC_HOST`, exits 1 with one line that names `QUAY_TRUST_PROXY` and does not echo the host. The same boot with the flag set to exactly `1` exits 0. `127.0.0.1`, `localhost`, and `::1` exit 0 with the flag unset. ` 1`, `1 `, and `true` do not count.
7. Exact-head checks: lint, typecheck, no-flag build, check-hooks, route-budget `/broker` (≤ 205 KB), ledger map-no-dup, `npm test`. Then a real `next start` on a free port (not 3199 or 3102) with a fresh `.data`: sign-up via `127.0.0.1` and via `localhost`, plus one auth e2e.
8. Push `eng/infra-local-origin`. No force-push, no PR, no merge, no deploy.

## How to verify

1. `npx vitest run tests/unit/auth/local-origin.test.ts tests/unit/auth/trust-proxy-boot.test.ts`
2. `npx tsx tools/ops/boot-bind.ts 0.0.0.0` exits 1. The same command with `QUAY_TRUST_PROXY=1` exits 0. `npx tsx tools/ops/boot-bind.ts 127.0.0.1` exits 0 with the flag unset.
3. `next start -H 127.0.0.1 -p <free>` with an empty data dir: `POST /api/auth/register` with `Origin: http://127.0.0.1:<port>` and with `Origin: http://localhost:<port>` both return 201. `Origin: https://evil.example` returns 403.
