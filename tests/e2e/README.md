# tests/e2e

Playwright specs against the real multiplayer stack. `playwright.config.ts` starts:

- a **fresh world server** on port 8797 (`test-results/world-e2e`, 1-second ticks, 3 days of warmup history, admin token `e2e-admin` so specs can grant money), and
- a **production build** of the web app on port 3200, built with `NEXT_PUBLIC_WORLD_URL` pointing at that world.

Two projects: `desktop` (1440×900) and `phone` (390×844, touch). Run with `npm run e2e`.

`E2E_BUILD_CMD` replaces the production build step (default `npm run build`). Where Turbopack cannot run, for example on a `node_modules` junction, use `E2E_BUILD_CMD="npx next build --webpack" npm run e2e`.

The e2e world lifts its per-IP account limit (`REGISTER_LIMIT=500`; the server default is 20 an hour), because every test registers its own guest.

- `core.spec.ts`: cold open, the core loop (join, 20% first-trade cap, fill, reload keeps everything), buying a business.
- `screens.spec.ts`: every screen opens without console errors or horizontal overflow (after a grant unlocks the Lab and Security), chat, and the late-game flow (option chain, AI research).
- `phone.spec.ts` (phone project only): the home screen and the R0 hardware, full-screen apps with Back and a deep link's chevron, the Recent sheet (hold, tap, swipe, Home, Escape), a Broker ticket kept through a Recent close, the OS-update ceremony (skip, Escape, Keep going), and the `?e2e` hooks (grant, idle, shock).
- Proof screenshots go to `test-results/proof/<project>-<name>.png`.
- Selectors are `data-testid` or roles, never CSS classes. Shared helpers live in `helpers.ts`.
