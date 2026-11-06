# M1-01 auth (local single-process)

**Status:** engineering notes for the Account session card. Not a production platform.

## What this is
- Real password accounts (scrypt) + HttpOnly `quay_sid` sessions.
- Visible UI: Settings → Account (`/settings/SET-01`).
- File store under `.data/auth/` (gitignored) for local `next dev` / single `next start`.

## What this is not
- **Not** Better Auth / T19C-02.
- **Not** multi-process / multi-instance safe (no shared DB). Concurrent Node workers would last-write-wins on the JSON file.
- **Not** deployable on Vercel yet. `VERCEL` env → auth routes return `UNSUPPORTED_DEPLOY` (503).
- Setting `QUAY_AUTH_MULTI_PROCESS=1` also fails closed (503).
- Mock Broker/Portfolio trading is **not** a server save; Account may show starter cash placeholder only.

## Operator knobs
| Env | Meaning |
|---|---|
| `QUAY_AUTH_DATA_DIR` | Directory for `store.json` (default `.data/auth`) |
| `QUAY_AUTH_STORE=memory` | In-memory only (tests) |
| `QUAY_PUBLIC_HOST` | Pin CSRF Origin/Referer host (e.g. `localhost:3000`) |
| `QUAY_TRUST_PROXY=1` + `QUAY_TRUSTED_HOSTS` | Only then extra hosts allowed; **never** auto-trust raw `X-Forwarded-Host` |

## Rate limits
In-process login/register attempt throttle (10 / 15 min per handle). Full edge rate limits remain **M3-05 before private alpha**.
