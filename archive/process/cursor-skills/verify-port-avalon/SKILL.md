---
name: verify-port-avalon
description: "Drive Port Avalon web V1 the way a player does and return pass or fail with screenshots. Use for a production Next.js build of this repo when proving signup, account isolation, Broker orders, reload persistence, Settings, or City at desktop 1280×800 and phone 390×844."
---

# Verify Port Avalon

Playwright drives the production app through the controls a player uses. The feature map under `features/` is the maintained list of what to prove. Read it before driving. This skill reuses `tests/e2e/shell/helpers.ts` (`boot`) and the Broker test ids already used by `tests/e2e/17b/M1-06-broker-orders.spec.ts`. It does not start the Playwright `webServer`, and it does not set `QUAY_HOOKS`, `QUAY_DS`, `NEXT_PUBLIC_QUAY_E2E`, or the other e2e build flags.

Two runs can sit side by side. Each `launch` picks its own free port and its own `QUAY_AUTH_DATA_DIR`. Never bind **3199** or **3102**. Never drive a server this run did not start. Never point `QUAY_AUTH_DATA_DIR` at the shared `.data/auth`.

## Launch

From the repo root, with dependencies installed (`npm ci`) and Chromium present (`npx playwright install chromium`):

```bash
npx tsx tools/verify/port-avalon.ts launch
```

That builds with `next build` after stripping e2e flags from the environment, then starts `next start -H 127.0.0.1 -p <port>`. The port is the first free port from 3310 upward that is not 3199 or 3102. Auth data goes to `.verify/port-avalon/auth-<timestamp>/`. The server log is `.verify/port-avalon/server-<timestamp>.log`. Pid, port, and URL are written to `.verify/port-avalon/state.json`.

Ready means all of these succeed: `GET /` is 200, `GET /api/world` reports `world.worldId` `world_port_avalon`, and `GET /api/market` returns a numeric `tick` (that read also starts the single-process quote clock). `launch` prints `ready http://127.0.0.1:<port> pid <pid>`.

If the process never becomes ready, `launch` kills that pid and deletes the state file. A later `launch` while a recorded server is still alive refuses to start a second one.

## Doctor

```bash
npx tsx tools/verify/port-avalon.ts doctor
```

Read-only. It passes only when the recorded pid is alive, its environment is still this run's `QUAY_AUTH_DATA_DIR` and `QUAY_PUBLIC_HOST` (`next start` retitles itself to `next-server`, so the command line is not the check), the pid or a child it spawned owns the listen socket, the port is not 3199 or 3102, and `/`, `/api/world`, and `/api/market` still match the launch checks. Run this first whenever a drive looks wrong. Do not drive a doctor failure.

## Drive

```bash
npx tsx tools/verify/port-avalon.ts drive
npx tsx tools/verify/port-avalon.ts drive --viewport desktop
npx tsx tools/verify/port-avalon.ts drive --viewport phone
```

`drive` plays one fresh pair of accounts on each requested viewport. Desktop is 1280×800. Phone is 390×844 with `isMobile` and `hasTouch`, matching the phone project in `playwright.config.ts` except the desktop size, which this skill keeps at 1280×800.

The pass, in order:

1. Sign up two accounts from **Sign in** (`sign-in-entry`) on the home screen. The form is Settings → Account (`account-handle-input`, `account-password-input`, `account-submit`). Password is `verify-player`. Handles look like `Vad…` and `Vbd…` (desktop) or `Vap…` and `Vbp…` (phone).
2. On the first account, open Broker from the shelf tile (`tile-broker`) or the phone dock (`icon-broker`), choose HALC when the asset select is showing, and place a market buy of 1. The ack title starts with `Bought 1 HALC at` and the header reads `You hold 1`.
3. Choose **New order**, switch to Limit, set the limit to `1.00`, quantity `1`, and place it. The ack is `Order placed. It's in Open orders.` and a `br-oo-row-*` row is visible. `GET /api/broker/me` on that same browser context shows HALC quantity `1` and that order `WORKING` at `1.00`.
4. On the second account, open Broker. There is no `br-you-hold`, Open orders says it is empty, the account chip is the second handle, and that context's ledger is still the $10,000 starter with no positions and no orders. The first account's chip is unchanged.
5. Reload the first account and open Broker on HALC again. `You hold 1` and the same order row are still there. Cash, quantity, and the working limit match the ledger from before the reload.
6. Open Settings from the account chip (`account-chip` on desktop, `account-chip-home` on the phone home screen). The signed-in handle and `world_port_avalon` are visible.
7. Open City from the shelf (`tile-city`) or the phone app grid (`icon-city`). The district view shows Financial Mile and the read-only note, not Coming later.

A production build shows the analytics prompt after the first pointer (`quay-consent`). The journey declines it (`quay-consent-decline`) so the corner card does not cover later clicks. Declining does not send analytics.

Exit 0 when every check passed. Exit 1 when any check failed. The printed lines and `summary.txt` name the check.

Do not place orders through `POST /api/broker/orders`. That door is what the ticket calls; the proof is the ticket. Do not use `?e2e`, fake timers, or `QUAY_HOOKS` query overrides. Signed out, Broker is a local demo and does not save. This journey signs in before it trades.

## Evidence

Each `drive` writes a new directory `proof/verify-port-avalon/<timestamp>/`:

- `report.json` with `ok`, the url, pid, port, and every check (`id`, `ok`, `detail`)
- `summary.txt` with the same lines printed to the terminal
- one PNG per step: `<viewport>-signup-a.png`, `signup-b`, `market-buy`, `limit-order`, `isolation`, `persist`, `settings`, `city`

Screenshots are taken after the step, including when the step fails. `proof/` is gitignored. Cleanup must leave this directory in place.

## Cleanup

```bash
npx tsx tools/verify/port-avalon.ts cleanup
```

Reads `.verify/port-avalon/state.json`. If that pid is alive and its environment is still this run's auth directory and public host, it signals that pid and the children of that pid, first `SIGTERM` and then `SIGKILL` if it is still alive. It then deletes the disposable auth directory and the `.verify/port-avalon` scratch directory. It does not delete `proof/`. If the pid was reused by something else, cleanup refuses to signal it.

## Helpers

The executable entry is one command, shown above. `run` is launch, doctor, drive, cleanup, then a check that `report.json`, `summary.txt`, and the screenshots are still on disk:

```bash
npx tsx tools/verify/port-avalon.ts run
npx tsx tools/verify/port-avalon.ts run --viewport desktop
```

Exit 0 only when the journey passed and the evidence survived cleanup. There is no other flag. Source:

- `tools/verify/port-avalon.ts` — launch, doctor, cleanup, run
- `tools/verify/player-journey.ts` — the player clicks
- `tools/verify/state.ts` — state file and evidence paths

## Feature map

- [Sign up](features/signup.md)
- [Account isolation](features/account-isolation.md)
- [Broker orders](features/broker-orders.md)
- [Settings](features/settings.md)
- [City](features/city.md)
