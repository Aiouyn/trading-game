# tests/e2e

Playwright specs against the real multiplayer stack. `playwright.config.ts` starts:

- a **fresh world server** on port 8797 (`test-results/world-e2e`, 1-second ticks, 3 days of warmup history, admin token `e2e-admin` so specs can grant money), and
- a **production build** of the web app on port 3200, built with `NEXT_PUBLIC_WORLD_URL` pointing at that world.

Two projects: `desktop` (1440×900) and `phone` (390×844, touch). Run with `npm run e2e`.

- `core.spec.ts`: cold open, the core loop (join, 20% first-trade cap, fill, reload keeps everything), buying a business.
- `screens.spec.ts`: every screen opens without console errors or horizontal overflow (after a grant unlocks the Lab and Security), chat, and the late-game flow (option chain, AI research).
- Proof screenshots go to `test-results/proof/<project>-<name>.png`.
- Selectors are `data-testid` or roles, never CSS classes. Shared helpers live in `helpers.ts`.
