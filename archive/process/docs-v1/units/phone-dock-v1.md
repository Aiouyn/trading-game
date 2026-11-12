Moved from UNIT.md on 12 Nov 2026 (Europe/Paris) per Builder's rule.

# Card 30 — Phone dock is Broker, Portfolio, Wire

**When:** 12 Nov 2026, 07:34 Europe/Paris (CET)
**Branch:** `ui/phone-dock-v1`
**Base:** `origin/main` `a62983dda0e0ffea436a98648d0cf474fb38a13e` (PR116, card 25)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (shell chrome). Not opening a PR. No push this pass.

## Player outcome

On the phone, the bottom dock is the three V1 apps a new player can actually open: Broker, Portfolio, and Wire. Messages is no longer a fourth slot that always opens “Coming later.”

## Grounding

- `docs/v1/V1-BOARD.md` M2-04: “Mobile shell · Broker + Portfolio + Wire ~390px.”
- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:259` lists a four-slot dock including Messages, but Messages has no app body or inbox data on this tip (`APP_MODULES` is settings, broker, portfolio, wire only). V1 scope wins over the later Messages slot.
- Boards cannot take the fourth slot: it is not built on main.
- `docs/v1/REVIEW-LESSONS.md` entry 19: the dock is not signed-in-only. While `/api/auth/me` is held, the same three built apps show; Messages does not flash in.

## Scope

- `BOTTOM` is `broker`, `portfolio`, `wire`. CSS dock columns match the three slots.
- Messages stays in the registry and can still open Coming later from a deep link (`/messages`). This card only changes the dock.
- Grid contents, shelf, and launcher are card 31.
- No order, money, or submit code. No engine data.

## Acceptance / proof

- Fail-first unit: phone Home dock is still four slots including Messages before the fix; after the fix it is exactly Broker, Portfolio, Wire, and `icon-messages` is absent from the dock.
- Auth / first paint: hold `/api/auth/me` — dock is already the three built apps, no Messages flash.
- Official-flag e2e on fresh `.data`, production play at 390 and 1280 (desktop has no dock; 1280 confirms the shelf is untouched by this card). Screenshots in `/workspace/avalon/evidence/phone-dock-v1/` (play scripts live there, not in the worktree).
- Full checks on the exact final head. No push.
