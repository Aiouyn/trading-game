# Unit: V1 flag shroud (M1-11)

**Branch:** `cursor/m1-11-flag-shroud-7ca2`
**Base:** `eng/broker-idempotency` (open PR #105 to `main`)
**When written:** 2026-11-11 — before product-code edits.
**Board:** M1-11 (approved V1 board, `docs/v1/V1-BOARD.md`): with flags off, out-of-scope UI is unreachable. Systems stay in the tree; they are not deleted.

## Why this unit

Default `me.flags` is `[]` (`defaultChannels`). The shell unlock table (`src/shell/unlock.ts`, 17 §3.2.4) still marks several out-of-scope apps `always` or teases them from rank / onboarding, so a player with nothing set can open them from the shelf, the phone grid, a layout, or a `/{app}` deep link. The bodies are mostly "Coming later". That is still a reachable surface.

The existing flag channel is the gate. This unit does not add a second flag system and does not change Broker order logic, Wire statements, auth, or telemetry.

## Outcome

With no flags set, each out-of-scope system below is:

- hidden in the shelf, the phone grid, the launcher, and any layout that contains it
- `404` at its page route, including a deeper path (`/bank/desk`)
- absent from API (no such route today; a new one must be classified or the route test fails; known prefixes `404` on GET and POST)
- not a lazy app body, so it is not in the `/broker` first-load graph

Turning that system's flag on (e2e build, `?flags=`, the same `QUAY_HOOKS` gate as every other mock flag) lifts the shroud. The 17 unlock rule still applies underneath. A production build ignores the query, same as the other mock flags, so a player cannot bypass the shroud by editing the URL.

Official shell specs keep the full registry by merging these flags in `boot()`. The M1-11 Playwright spec does not use `boot()`.

## Inventory

In scope, and not shrouded: Broker, Portfolio, Wire (player posts and analyst notes), Boards (net-worth leaderboard), City (read-only district), Launchpad ($1,000 game-money fee, owner-approved), Settings, onboarding / first trade (Portfolio goal), PWA (`/sw.js`, manifest), telemetry consent and feedback.

Left reachable on purpose (not in the out-of-scope list; several already have their own 17 flag or rank rule): Messages, Markets (About's integrity link `/markets/MKT-08`), Profile, Alliance (`character.day3` / `alliance.invited`), Contracts (`account.upgraded`), Auctions, Academy, Help, Replay, API (`api.eligible`). Pro-terminal *depth* in the mock book (`?tier=terminal`, 10 levels and priced-in) is compiled out of a no-flag production build (`QUAY_HOOKS`). Whale Watch has no player surface; only the reserved paths are guarded. `CityWindow` (3D) is not mounted; the district app does not import it.

| System | Flag (default off) | Nav / deep link | API today |
|---|---|---|---|
| Banks / credit | `v1.banks` | `/bank` `/funds` `/insurance` `/institutions` | none (prefixes `/api/bank` `/api/credit` `/api/funds` `/api/insurance` `/api/institutions` 404) |
| AI Lab | `v1.ailab` | `/ailab` | none (`/api/ailab` 404) |
| Political 16A/16B | `v1.politics` | `/civic` | none (`/api/civic` `/api/politics` 404) |
| Businesses | `v1.businesses` | `/businesses` `/company` | none (`/api/businesses` `/api/company` 404) |
| Building ownership | `v1.property` | `/property` `/estate` | none (`/api/property` `/api/estate` 404) |
| Pro terminal | `v1.terminal` | `/quantlab` `/research` `/risk` | none (`/api/quantlab` `/api/research` `/api/risk` 404) |
| Whale Watch | `v1.whale` | `/whale` `/whale-watch` (no app body) | none (`/api/whale` 404) |
| Adversarial | `v1.adversarial` | `/security` `/legal` | none (`/api/security` `/api/legal` 404) |
| Monetization | `v1.monetization` | `/atelier` | none (`/api/atelier` `/api/billing` 404) |

Layouts that include a shrouded pane (Research, Operator, Shadow, Institution) are not offered while that pane is shrouded. Trade and Review stay.

## Acceptance

1. UNIT.md is written first (this file), before product-code edits.
2. Default flags: every row above is hidden from nav, `404` at the page (and one subpath), and `404` on GET and POST of its API prefixes. In-scope routes and `GET /api/world` still answer.
3. A sample with the flag on still opens the system: Bank, AI Lab, Civic, and Whale's path stops 404ing. A different flag does not open Bank.
4. `tests/unit/shell/v1-shroud.test.ts` fails if a new `page.tsx` / `route.ts` or `src/apps/<id>` appears without being classified on the flag map or the in-scope list, or if a shrouded app is added to `APP_MODULES`.
5. `/broker` first-load stays ≤ 205 KB gz. No Broker order, Wire statement, auth, or telemetry edits.
