# tests/e2e (owner: Tape)

Playwright specs. Two projects from `playwright.config.ts`: `desktop` (1440x900) and `phone` (390x844, touch).

- `npm run e2e` builds, starts on port 3100 (override with `E2E_PORT`) and runs every spec on both projects.
- Visual proof: specs save screenshots to `test-results/proof/<project>-<name>.png`. These are what Tape attaches to PASS reports.
- One spec file per screen or flow (`portfolio.spec.ts`, `trade.spec.ts`, ...). Keep selectors role- or test-id-based (`data-testid`), never CSS classes.
- A task is PASS only when `typecheck`, `lint`, `test`, `build` and `e2e` are all green and the proof screenshots look right at both sizes.