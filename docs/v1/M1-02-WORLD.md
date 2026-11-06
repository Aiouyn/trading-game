# M1-02 — One authoritative world

**Status:** engineering notes for the shared-world attach card.

## What this is
- Server-owned world id: `PORT_AVALON_WORLD_ID` (`world_port_avalon`).
- Every account created by AuthService is stamped with that id (M1-01).
- `GET /api/world` and auth session bodies expose `{ worldId, marketSeed, persistence: "none" }`.
- Signed-in demo MockFeed uses `marketSeed` (shared), never a hash of `accountId`.

## What this is not
- **Not** catalog / live ticks / orders (M1-04+).
- **Not** durable trading persistence (M1-03). `persistence: "none"` is intentional.
- **Not** a standalone world registry — one Port Avalon constant + attach/read seam.
- Guest browsing still uses the educational Owner example mock + Overview example label.

## Private vs shared
| Shared (world) | Private (per account) |
|---|---|
| `worldId`, `marketSeed` | `accountId`, cash/positions/orders stubs, session |
