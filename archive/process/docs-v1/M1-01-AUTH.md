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
| `QUAY_PUBLIC_HOST` | Pin CSRF Origin/Referer to this host only. Loopback aliases are not added. |
| `QUAY_TRUSTED_HOSTS` | Extra allowed hosts, comma-separated. Works without `QUAY_TRUST_PROXY`. |
| `QUAY_TRUST_PROXY` | Exactly `1` to believe `X-Forwarded-Host` and `X-Forwarded-For`. A non-loopback bind refuses to start without it. With no `-H`, `next start` prints `ready` and the network address before `exit(1)`. |

## Rate limits
In-process login/register attempt throttle (10 / 15 min per handle). Full edge rate limits remain **M3-05 before private alpha**.
