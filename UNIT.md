# Unit: internal session lookup reasons

**Branch:** `cursor/auth-inspect-session-8b52`  
**Cut from:** `81b5b144` (`eng/broker-idempotency`) — `peekSession` is not on `main`  
**PR target:** `main` (do not merge)  
**When written:** 2026-11-11 — before product-code edits.

## Why this unit

`resolveSession` and `peekSession` both collapse every failure to `null`. Callers cannot tell a missing cookie from a revoked or expired row, and the two methods duplicate the validity rules. HTTP routes must keep returning a generic unauthorized response: the reason is an internal result, not an `AuthError` code.

## Smallest observable outcome

`AuthService.inspectSession` is the only validity path.

- `inspectSession(token, { refresh: true })` matches today's `resolveSession`, including the sliding `lastSeenAtMs` / `expiresAtMs` write and the expiry revocation write.
- `inspectSession(token)` and `inspectSession(token, { refresh: false })` match today's `peekSession`: same acceptance rules, no in-memory mutation and no `persist`.
- `resolveSession` and `peekSession` keep their signatures and observable results, implemented as wrappers. No route file changes.

### How each rejection is detected

The store keeps every session row, including revoked ones (`tokenHash` + `revokedAtMs`). `tokenIndex` only maps hashes whose `revokedAtMs` is null. A hash miss in that index is therefore not "unknown": the row may still be there. Nothing in the row records *why* it was revoked (logout vs a previous expiry stamp), so a later lookup of a row that expiry handling already revoked is `REVOKED_SESSION`. That is the stored fact. This unit does not add a second flag.

Check order, first match:

| Code | Detection |
|---|---|
| `MISSING_TOKEN` | `null`, `undefined`, or `""`. Same branch as today's `if (!rawToken)`. |
| `MALFORMED_TOKEN` | Any other string that is not a minted token: 32 bytes, base64url, no padding (43 chars), and `Buffer.from(raw, "base64url").toString("base64url") === raw`. Minted by `mintSessionToken` in `src/server/auth/crypto.ts`. Not a hash lookup. |
| `UNKNOWN_SESSION` | Minted shape, and no session row has that `tokenHash`. |
| `REVOKED_SESSION` | A row has that `tokenHash` and `revokedAtMs !== null`. |
| `EXPIRED_SESSION` | The row is not revoked, and `now` is past `createdAtMs + SESSION_MAX_MS`, `lastSeenAtMs + SESSION_IDLE_MS`, or `expiresAtMs` (strict `>`, same as today). `refresh: true` then revokes and persists, and this call still returns `EXPIRED_SESSION`. |
| `UNKNOWN_ACCOUNT` | The row is live and inside all three deadlines, and `accounts` has no `session.accountId`. `refresh: true` still applies today's slide-and-persist *before* that account check. |

Success is `{ ok: true, view, refreshed }`. `refreshed` is true only when this call applied the sliding write. It is false on the peek path. Failure has no `refreshed` field.

`SessionRejectionCode` is not added to `AuthErrorCode`. `authErrorResponse` cannot emit it. Routes keep calling `resolveSession` / `peekSession` and still answer `{ error: { code: "UNAUTHORIZED", message: "Not signed in." } }`.

## Acceptance

1. This file is written before product-code edits.
2. `inspectSession` exists on `AuthService`. `SessionRejectionCode` and `SessionLookupResult` live in `src/server/auth/types.ts` and are exported from `src/server/auth/index.ts`.
3. One unit test per rejection code, plus refresh vs no-refresh write behavior (store `save` count and session fields), plus parity: `resolveSession` equals the view-or-null of `inspectSession(..., { refresh: true })` including side effects on a cloned store; `peekSession` equals `inspectSession` without refresh and neither writes. Existing auth tests stay unchanged and pass.
4. A route-level test shows `/api/auth/me` and `/api/leaderboard` never write a `SessionRejectionCode` into the response.
5. `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `node tools/check-hooks.mjs .next/static .next/server`, `node tools/ci/route-budget.mjs /broker`, and `npx vitest run test/map-no-dup.test.ts` in `packages/engine/ledger` pass.
6. No route edits, no refactors beyond this path, no deploy, no merge.
