# Card 33 — Portfolio names the $20k goal and a first-trade path

**When:** 12 Nov 2026, 08:14 Europe/Paris (CET)
**Branch:** `ui/portfolio-goal-guide`
**Base:** `origin/main` `1ba997da8b7ad0b4a921cce42c5d6a0923778487` (PR120, card 29)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (Portfolio Overview copy + navigation). Not opening a PR. No push this pass.

## Player outcome

A signed-in player opening Portfolio sees a visible goal — grow $10,000 to $20,000 (Hustler) — and a short first-trade path: read a Wire story, review a quantity in Broker, then place the order. The buttons only open Wire or Broker. Guests still see that the portfolio is an example, plus an invitation to sign in for the $10k start and $20k goal.

## Grounding

- V1-BOARD M2-01 (30s clarity + 2-min first trade) and M2-02 (start cash $10k + visible NW target).
- 18-ONBOARDING §3.3 step 7 and the honesty note already on the Broker ticket: “Prices can fall. That’s the game.” The guide does not pre-fill or place an order.
- On this tip, Broker fills are still a demo and are not saved (`accountDemoBoundary.ts`, M1-06 not wired). The guide must not say the fill is saved to the account.
- Saved net worth is shown with `MoneyText` from the `me` channel as sent. No client cash maths, no size chips, no invented remainder.
- Card 25 already shows the $20k bar on phone Home. This card does not edit `PhoneHome.tsx` (or `nav.css`, `Recent.tsx`, `Shelf.tsx`, `launcher.ts`) so it will not conflict with cards 30 and 31.
- `docs/v1/REVIEW-LESSONS.md` entry 19: while `/api/auth/me` is held, the signed-in goal/guide must not flash in. The unknown-session path shows neither the signed-in guide nor the guest invitation.

## Scope

- Portfolio Overview only (new goal/guide module + a guest line). Hide/show of the guide may be remembered on this device per account (localStorage).
- Buttons call the existing shell `open("wire")` / `open("broker")`. No ticket pre-fill, no `placeOrder`, no change to empty-cash Businesses copy (card 26).
- If the `me` body later has a fill or a position, the guide may acknowledge a first fill from those server fields only. It must not invent one.

## Acceptance / proof

- Fail-first unit: a signed-in Overview still has no `pf-goal` / first-trade guide; after the fix the goal line and Open Wire / Open Broker are present. While `/api/auth/me` is held, those are absent and the guest invitation is absent. A guest sees the invitation, not the signed-in guide.
- Official-flag e2e on fresh `.data`, production play at 1280 and 390 with screenshots under `/workspace/avalon/evidence/portfolio-goal-guide/` (play scripts live there, not in the worktree).
- Full checks on the exact final head. No push.
