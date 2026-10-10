# Tape e2e conventions

**Owner:** Tape. **Status:** v1, 2026-10-09. Applies to every Playwright spec in `tests/e2e/` and every harness script in `scripts/balance/`.
Sources: `playwright.config.ts`, `tests/e2e/README.md`, `tests/e2e/core-loop.spec.ts`, Forge's onboarding build on the box (`/workspace/tg`: `src/components/Game.tsx`, `src/game/store.ts`, `src/game/onboarding.ts`, `src/components/Onboarding.tsx`) and Quant's `shockPrice` in `src/engine/sim.ts`.

## 1. URLs

| Spec type | URL | Why |
|---|---|---|
| Anything that isn't about onboarding | `/?seed=<id>&fresh&intro=off` | A fresh game now opens on the cold open and pauses the clock. `intro=off` runs `introOff()`: cold open, first news, simple ticket and stop explainer are marked done. **Rank-ups stay live.** |
| Onboarding specs (M05) | `/?seed=<id>&fresh` | Real cold open. Never add `intro=off` here. |
| Specs that need a hook | add `&e2e` | Exposes `window.__tg.e2e`. See §3. |
| Reload or persistence checks | `/` (no `fresh`) | `fresh` would throw the save away. |

- **Always** `seed` plus `fresh` for a new game. One seed per spec, named after the spec (`tape-cap`, `tape-ob-stop`). Never share a seed between specs that make different assertions.
- Click fallback for `intro=off`: `onboarding-skip` ("I've played before"). Use it only when a spec has to start from a real cold open and then leave it.

## 2. Waiting for the game

- Wait for `html[data-game="ready"]` (`document.documentElement.dataset.game`, set by `Game.tsx` only once `status === 'ready'`), or for `getByTestId('net-worth')` to be visible. Both appear after "Opening the market" is gone.
- **Never** wait on `html` or `body` visibility. They're visible during the loading screen, so the spec races the boot.
- After ready: `await page.evaluate(() => window.__tg!.pause())`, then move time only with `__tg.advance(n)` (ticks). No `waitForTimeout` to move the market. The only allowed timeouts: the IndexedDB autosave landing (≤ 1500 ms) and animation beats a spec is explicitly measuring (rank-up skip at 1 s).
- Exception: an onboarding spec on the cold open must **not** pause before pressing `onboarding-start`, because the clock is already paused by `coldOpen === 'pending'`.

## 3. Hooks (`?e2e`)

| Hook | What it does | Source |
|---|---|---|
| `__tg.advance(n)` / `__tg.pause()` / `__tg.state()` | tick, pause, read the store. Always present once ready, no flag needed | `Game.tsx` |
| `__tg.e2e.grantCash, setCash(n)` | adds `n` to the player's cash. Net worth rises at once; peak equity at the next tick's mark | `store.e2eGrantCash` |
| `__tg.e2e.shock(assetId, pct)` | calls Quant's **test-only** `shockPrice(state, assetId, pct)`: moves `lnP` only (value is untouched, so the pull fades it), floored at the asset floor, throws on unknown id or `pct ≤ −1` | `sim.ts` |
| `__tg.e2e.idle()` | sets the rank-up idle clock to "10 s ago". Does not change any rule: a pending market order or an open trade sheet still blocks the ceremony | `Onboarding.tsx` |

- **Any hook that writes (`grantCash`, `shock`) sets `e2eTainted` and the session stops saving.** A spec that uses a hook must never then assert anything about reload or persistence. Persistence specs use no hooks at all.
- Without `?e2e`, `window.__tg.e2e` is `undefined`. Never feature-detect and silently skip: if a hook spec can't find `__tg.e2e`, it fails.
- `shockPrice` is not an event and not gameplay. Never call it from harness strategies, ghosts or rival code (Quant's ghosts and world-events specs say the same).

## 4. Projects and proof

- Two projects from `playwright.config.ts`: `desktop` 1440×900 and `phone` 390×844 (`isMobile`, `hasTouch`). Every spec runs on both unless it is marked `test.skip(project === 'phone', 'keyboard only')` with a reason (M10 is the only planned case).
- Phone differences to handle in the spec, not in the app: the ticket opens via `open-trade`; the trade sheet stays open after a fill and closes with `Escape`.
- Proof screenshots: `test-results/proof/<project>-<spec>-<step>.png`. These are what Tape attaches to a PASS. Full page only when the asserted element is below the fold.
- Selectors: `data-testid` or role. Never CSS classes, never text that comes from `messages/en.json` (copy changes must not break tests). Exception: an assertion *about* copy (the honest note, no advice wording) reads the key's text from `messages/en.json` in the spec.
- Console: every spec collects `console.error` and `pageerror` and asserts the list is empty at the end.
- Money parsing: the shared `money()` helper (handles U+2212 minus, `$`, commas).

## 5. Determinism

- Same seed, same steps → same numbers on both projects. Assert money to the cent where the engine owns the number; to ±$1 only where a value passes through a formatted display.
- The harness runs headless on `src/engine` only: no React, no browser, no hooks. Harness strategies trade through `placeOrder` like the player.
- Seed counts: release gate 20 and 60 seeds. Hunts in `tape-ecology-hunts.md` that need rare events use 200 seeds and say so.

## 6. Privacy (Mathis rule, 2026-10-09)

Nothing may automatically leak a player's strategy, style or holdings. Reveals are opt-in, earned through espionage, or a legal filing.

- Specs never make the app write a run file, replay or share blob except through an explicit **Export** click in that spec.
- Benchmark ghost, trade journal, daily close and luck-vs-skill are player-private screens. Specs assert they render only the player's own book.
- Exploit and mirror bots live in `scripts/balance/` or `tests/e2e/` only. They are test code, not game UI, and must never be described as a public view of anyone's book.
- Shared **no-leak helper** `assertNoLeak(page)` used at the end of every session-length spec:
  1. IndexedDB: list databases with `indexedDB.databases()`. Allowed: `trading-game` with store `saves` only. Fail on any other database or object store, or on any value carrying a run-file marker (Quant's format header: engine version + config hash + ordered intents) outside an Export.
  2. `localStorage`: only the allowlisted keys `tg-prefs` (shell layout, palette, language, cosmetic) and `tg-token` (the session); any other key fails. `sessionStorage`: only the allowlisted key `tg-replay-intro` (the "Replay intro" flag, not a trade replay).
  3. No network request to any origin other than the app's own during the session (`page.on('request')`).
  4. Portfolio, Wire and Rivals render no other agent's positions: no `position-*` row whose owner isn't the player, and no Wire item that names a rival's holding unless it is a legal filing item.
