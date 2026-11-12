# Card 36 — Guest Home names the example portfolio and points to an account

**When:** 12 Nov 2026, 09:52 Europe/Paris (CET)
**Branch:** `ui/guest-home-example`
**Base:** `origin/main` `95b9bd02d42865c7ffe0ed5c39979665ed0362f9` (PR125, card 31; cards 30 and 32 are also on this tip)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (Home / strip copy). Not opening a PR. No push this pass.

## Player outcome

A guest opening Home on this tip sees “Net worth” $412,860.15, rank R2 · Owner, and “Next: Mogul · $412k / $5M”, with a Sign in button but no line that this is an example and not their account. The same $412k sits in the desktop strip next to “Quay 2 · Owner”. A new player can read that number as their own money.

After this card: the hero stays “Net worth” plus the real demo figure (M2-01 30-second clarity). A short muted caption, “Example portfolio · not your account”, appears on phone Home, and a short “Example” tag appears on the desktop strip. Sign in remains the path into Account (create / sign in). Signed-in Home is unchanged: “Net worth”, the saved $10k, no example caption, no Demo balance / starter disclaimer.

## Grounding

Observed on this tip, official production build, fresh `.data`, 390 and 1280. Evidence: `/workspace/avalon/evidence/guest-home-example/play/before-guest-{phone-390,desktop-1280}-home.png`. Signed-in Home on the same tip already says Net worth $10,000 and Next: Hustler at $20k (cards 25 / 29).

- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:257` — phone Home widget is the NET WORTH label, today’s change, and the rank bar. Keep that first-read shape; only qualify the guest figure.
- `docs/v1/V1-BOARD.md` M2-01 (30s clarity) and M2-02 (start cash $10k + visible target). The $20k goal stays on the signed-in bar, not on the guest example.
- `export/vision-review/complete/18-ONBOARDING-ACADEMY.md:275` — guests are invited to create an account. This card uses the existing Sign in control; it does not invent a second CTA.
- Portfolio already uses “Example portfolio · not your account” (`src/apps/portfolio/strings.ts`). Same voice here; this card does not edit Portfolio files (card 33).
- `docs/v1/REVIEW-LESSONS.md` entry 19: while `/api/auth/me` is held, the guest example caption / strip tag must not flash (a signed-in $10k must not be labelled an example). The unknown-session path shows a muted skeleton in the caption slot and no strip tag.

No other first-10-minutes gap on this tip beat this one without leaving the lane: Positions empty still has no Broker pointer, but card 34 is editing those files; Wire All-empty is card 35 (PR127); Account after signup already has the next step (card 32).

## Overlap with `ui/clock-first-load`

That queued branch also edits `PhoneHome.tsx`, `StatusStrip.tsx`, and `src/shell/strings.ts`, and it is still on an older widget (signed-in “Demo balance”, starter disclaimer, first-trade guide). This card keeps the PhoneHome diff small: it does not change StatusBar, `useNw()`, the clock, the “Net worth” label, the hero amount, the today row, the rank bar, or the Sign in button. It only inserts the guest caption (or a muted skeleton while auth is unknown) in the widget, plus a one-line guest “Example” tag on the desktop strip. Copy lives in a new `homeExample.ts` so this card does not touch `strings.ts`. Merge-forward of clock-first-load will still conflict in the widget and in the strip’s net-worth cluster; those hunks are noted for the porter.

This card does not edit card 33 Portfolio files or card 34 Positions / Broker ticket files.

## Acceptance / proof

- Fail-first unit: on this base, a settled guest Phone Home has no example caption; after the fix the caption is present, Sign in still opens Account, and “Net worth” plus the demo amount remain visible. A signed-in Home has no caption. While `/api/auth/me` is held, the caption and strip tag are absent and the phone caption slot is a muted skeleton with no digits.
- Official-flag e2e on fresh `.data` (including a hold of `/api/auth/me`), plus production play at 1280 and 390 with screenshots under `/workspace/avalon/evidence/guest-home-example/` (play scripts live there, not in the worktree).
- Full checks on the exact final head (`/broker` < 215 KB gz). No push.
