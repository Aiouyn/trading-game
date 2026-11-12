# Card 32 — After creating an account, a next step is visible

**When:** 12 Nov 2026, 08:14 Europe/Paris (CET)
**Branch:** `ui/signup-next-step`
**Base:** `origin/main` `1ba997da8b7ad0b4a921cce42c5d6a0923778487` (PR120, card 29)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (Account copy + one navigation button). Not opening a PR. No push this pass.

## Player outcome

A stranger looking at Settings › Account sees that they start with $10,000 of game money and a $20,000 (Hustler) goal, then can create an account. After they register or sign in, they are not left with only Sign out: they see the same goal and an Open Portfolio button. The save/demo explanation stays available, without a technical paragraph or a builder milestone id in the first 30 seconds.

## Grounding

- V1-BOARD M2-02: start cash $10k + a visible NW target ($20k Hustler, `RANK_THRESHOLDS[0]` / DESIGN “Reach $20k”).
- 18-ONBOARDING §3.5: after value is shown, guests are invited to keep progress. On this tip the Account screen is that invitation, and it currently ends on Sign out.
- This tip’s Account disclaimer is still honest that Broker trades and fills are a demo and are not saved (M1-06 is not wired; `accountDemoBoundary.ts`). Do not claim otherwise. Drop the “M1-06” jargon from the visible first-session copy.
- `docs/v1/REVIEW-LESSONS.md` entry 19: while `/api/auth/me` is held, `isSignedIn()` is false. First paint must not flash a signed-in next step, handle, or Open Portfolio.

## Scope

- Settings › Account only (`AccountSettings.tsx`, its strings and CSS).
- Before sign-in: the $10k start / $20k goal line. The long save/demo paragraph lives under a “Save and demo details” disclosure.
- After sign-in: the goal line, “Open Portfolio”, and the same disclosure. Sign out remains.
- Open Portfolio uses the existing shell `open("portfolio")`. It does not close Settings by itself, pre-fill a ticket, or submit an order.
- Do not edit `PhoneHome.tsx`, `nav.css`, `Recent.tsx`, `Shelf.tsx`, or `launcher.ts`.

## Acceptance / proof

- Fail-first unit: a signed-in Account still has no Open Portfolio and no $10k/$20k goal line; after the fix both are present, and while `/api/auth/me` is held there is no Open Portfolio and no account handle.
- Official-flag e2e on fresh `.data`, production play at 1280 and 390 with screenshots under `/workspace/avalon/evidence/signup-next-step/` (play scripts live there, not in the worktree).
- Full checks on the exact final head. No push.
