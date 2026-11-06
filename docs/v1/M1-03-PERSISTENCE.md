# M1-03 — Server persistence (private player ledger)

## What this card proves
- `PlayerPrivateRecord` (`cashCents`, `positions`, `openOrderIds`) is stored in the existing auth `FileAuthStore` (`store.json` players[]).
- Survives process restart (new `AuthService` on same file).
- Account isolation holds after restart.
- Concurrent commits from two sessions do not clobber each other (service lock).
- Client Account / signed-in hero read **server** cash, not a hardcoded placeholder.
- World attach reports `persistence: "player_private"`.

## What this card does **not** prove
- Live catalog / shared ticks (M1-04 / M1-05).
- Broker fill path writing the ledger (M1-06) — `commitOwnPrivateState` is the seam that path will call.
- MockFeed demo trades are **not** durable; disclaimer says private ledger is saved, market demo still resets.

## Sequencing
Order API (M1-06) commits through `AuthService.commitOwnPrivateState` after atomic cash/holding checks. No separate blob store.
