# Port Avalon verification map

This directory is the maintained source for verifying player-visible behavior of Port Avalon web V1. Read this index, then use the matching feature file. The skill body in `../SKILL.md` is the launch, doctor, and cleanup contract.

## Baseline preconditions

- Launch with `npx tsx tools/verify/port-avalon.ts launch` so the app is a production build on `http://127.0.0.1:<port>`.
- The port is never 3199 or 3102. Auth data is the run's own `QUAY_AUTH_DATA_DIR`, not `.data/auth`.
- `npx tsx tools/verify/port-avalon.ts doctor` reports that pid, port, world `world_port_avalon`, and a market tick.
- Drive only that instance. A second launch uses another port and another auth directory.
- Desktop proof is 1280×800. Phone proof is 390×844.

## Driving conventions

- `npx tsx tools/verify/port-avalon.ts drive` plays every feature below on both viewports. Add `--viewport desktop` or `--viewport phone` to play one size.
- The script signs up fresh handles (`Vad…` / `Vbd…` on desktop, `Vap…` / `Vbp…` on phone) with password `verify-player`.
- Prefer the test ids named in each feature file. They are the same ids the app already exposes to `tests/e2e`.
- A check that cannot run records a failure and the unmet precondition. It is not reported as passed through a different path.
- Proof is the screenshot plus the check line in `proof/verify-port-avalon/<timestamp>/report.json`.

## Proof and skip reporting

- Capture the action and the resulting state. A filled ack is not persistence; the reload is.
- The visible Broker header and Open orders list are the player proof. `GET /api/broker/me` in that same browser context is the saved ledger, read only to confirm the screen.
- Cleanup does not delete `proof/`.

## Features

- [Sign up](./signup.md) — two fresh accounts from the home Sign in button.
- [Account isolation](./account-isolation.md) — the second account cannot see the first account's holding or order.
- [Broker orders](./broker-orders.md) — market buy, resting limit, and the same book after reload.
- [Settings](./settings.md) — the account chip opens Settings on the signed-in account.
- [City](./city.md) — shelf or phone grid opens the Financial Mile district view.
