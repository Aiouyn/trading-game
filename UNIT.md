# Card 31 — Unbuilt apps are not offered in Home, shelf, or launcher

**When:** 12 Nov 2026, 07:34 Europe/Paris (CET)
**Branch:** `ui/hide-unbuilt-chrome`
**Base:** `origin/main` `a62983dda0e0ffea436a98648d0cf474fb38a13e` (PR116, card 25)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (shell chrome). Not opening a PR. No push this pass.

## Player outcome

A new player looking at phone Home, the desktop shelf, or the launcher only sees apps that actually open. Markets, City, Boards, and the rest of the unbuilt catalog no longer sit in the first session as “Coming later” traps.

## Grounding

- `docs/v1/V1-BOARD.md` M0-05 / M1-11: out-of-scope systems stay in the tree, default off; flags off means that UI is unreachable from ordinary chrome.
- `17-UX` SH-03: the phone grid opens apps. Offering unbuilt tiles as if they were playable is not a first-10-minutes clarity.
- Built is already derived from `APP_MODULES` (`isBuiltApp`). On this tip that is settings, broker, portfolio, and wire only.
- `docs/v1/REVIEW-LESSONS.md` entry 19: while `/api/auth/me` is held, unbuilt tiles must not flash in and then disappear. The filter is by built-ness, not session, so the unknown-session path is the same.
- Deep links such as `/markets` or Settings › About integrity may still render `ComingLater`. This card stops *offering* those apps in the grid, shelf, and launcher. It does not invent a Boards or Markets body.

## Scope

- Phone app grid: list only built apps (empty groups stay omitted).
- Desktop shelf: same.
- Launcher app search (and Recents shown there): only built apps.
- Do not change `evaluate()` visibility, keyboard-only deep behaviour, or the ComingLater placeholder. Do not touch orders, money, or submit code.
- The phone dock’s Messages slot is card 30; this card still hides Messages from the *grid* / shelf / launcher even if the dock on this base still has it.

## Acceptance / proof

- Fail-first unit: phone grid still has `icon-markets`; shelf still has `tile-markets`; `search("markets", vis, [])` still returns the Markets app. After the fix, none of those offer Markets (or other unbuilt ids). Built apps (Broker, Portfolio, Wire, Settings) remain offered. Empty groups are not rendered.
- Auth / first paint: hold `/api/auth/me` — no `icon-markets` / `tile-markets` on first paint.
- Official-flag e2e on fresh `.data` plus production play at 1280 and 390, screenshots under `/workspace/avalon/evidence/hide-unbuilt-chrome/` (play scripts live there, not in the worktree).
- Full checks on the exact final head. No push.
