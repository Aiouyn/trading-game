# Card 9 — phone: a logged-out stranger learns what Quay is and what to do (ui/guest-first-screen)

## Fresh-player audit (8-card stack 5f0cfc83, logged-out and brand-new accounts, phone 390x844 + desktop 1440x900; evidence `ui-card9/audit/`)
- **Phone, logged out, first screen (biggest friction).** The top card reads `NET WORTH · R2 · Owner · [Sign in] · $412,860.15 · +$3,204.10 +0.78% · Next: Mogul $412k / $5M`, then 30 app tiles. Nothing says what Quay is, that this money is an example and not the visitor's, or that a new player starts with $10,000 of game money and a $20,000 goal. The only action is "Sign in", which a stranger without an account reads as "not for me" — yet it opens Account on *Create account* (Card 2). Same in FR (the home has no FR copy at all). A stranger cannot answer "what is this and what do I do" in 30 seconds.
- **Desktop, logged out, first screen.** Broker, Wire and Portfolio windows already label the data ("Demo history (sample data, not your account)", "Example stories · no price effect", "Example portfolio · not your account") and Portfolio says "Sign in to start with $10,000 in game money and a goal of $20,000." Understandable; not this card.
- **Portfolio before any trade (signed in, phone + desktop).** Goal card + "Your first trade" steps with Open Wire / Open Broker, net worth $10,000, R0. Clear; it is Builder's goal/guide lane anyway. (Guest phone Portfolio: the "Example portfolio · not your account" line sits on the frame's top border — cosmetic, Portfolio-owned, noted only.)
- **Wire -> Broker hand-off.** A brand-new account's Wire is empty ("Nothing in this filter yet… You can explore Broker while you wait"), so there is no story to follow; the first story is Builder's eng/wire-first-story lane. The guest example story already has "Open in Broker" (WIR-9-04). Not this card.
Pick: the phone logged-out first screen.

## Base
Stacked on bfe320dd (ui/broker-entry-split, Card 5, pushed and qualified), not 110583b0, for budget only. The change itself is the phone Home widget (`src/components/shell/PhoneHome.tsx`, shell strings, nav.css); none of cards 1-8 touches these files (checked `git diff 110583b0...<card>`) and nothing here depends on the Broker. But the shell is part of /broker first-load: on 110583b0 the e2e build's S1-20 already measures 214.9 KB of 215, and this card's ~0.2 KB pushed it to 220289 B > 220160 B (first attempt a77a1c70/e4702ec8/7ce74fba on 110583b0, evidence `ui-card9/cohort1.log`, base probe `ui-card9/base-probe.log`). Card 5 moved Settings/News out of /broker first-load, so on bfe320dd the same change fits with ~10 KB to spare. Merge order: after Card 5.

## Behaviour (phone/narrow Home, signed out only)
- The widget label says **Example account** (FR *Compte d'exemple*) instead of "Net worth" while it shows the canned $412k Owner fixture; the rank chip, numbers, sparkline and rank bar stay (they are the example).
- A short pitch right under it (`guest-pitch`): EN "Quay is a trading game. Start with $10,000 in game money and try to grow it to $20,000. No real money." FR equivalent with FR number format.
- The CTA (`sign-in-entry`, same place, full width, >=44px) says **Create account or sign in** (FR *Créer un compte ou se connecter*) and still opens Settings -> Account (register by default, sign-in one tab away). Primary style: it is the one thing to do.
- Locale follows `prefs.locale` like the clock. Signed-in Home, desktop and every other screen unchanged. No new route, request, or state.

## Acceptance and evidence
- Unit (red before): signed out shows the example label, the pitch (EN and FR) and the CTA text; signed in shows none of them.
- E2E phone, fresh .data: EN 390 and FR 320 at 200% text: label, pitch, CTA visible in the first viewport without scrolling, CTA >=44px, no horizontal overflow, axe clean; CTA opens Account on Create account; after registering the Home shows the signed-in starter card (no pitch). Desktop guest first screen unchanged.
- Intended golden updates: phone guest Home baselines that show the widget (listed in an addendum with the reason), nothing else.
- Exact-HEAD: lint, typecheck, build, check-hooks, route-budget /broker (own + 9-card merged stack <= 215 KB), map-no-dup, npm test (GIT_* unset), clean fresh-.data e2e (shell phone/home cohort + account-first-step), phone + desktop screenshots, scratch deleted, no push.

## Addendum: implementation findings
- Base moved from 110583b0 to bfe320dd before any push (see Base): first attempt measured S1-20 /broker 220289 B > 220160 B; on bfe320dd S1-20 reads 205.5 KB.
- A long guest label (FR "Compte d’exemple" at 200%, 320 px) pushed the rank chip past the card's right edge; `.widget-top` now wraps (gap 4/8 px), and the e2e asserts nothing in the card leaves the card. No change at scale 1.
- Golden updates: none. Every compared baseline (`toHaveScreenshot`/winShot) in tests/e2e/shell, settings, PF-A, M1-08, broker-entry-split, lazy-module-retry passes with CI=1 `--update-snapshots=none`: the studio home baselines use signed-in or `guest=0` fixtures. The write-only review PNGs under `tests/e2e/{shell,settings}/__screenshots__` are rewritten by every run and were already stale at the base (e.g. T4 home shows Day 38 and no Launchpad); left as they are.
- Pre-existing, not this card: T2-06 "phone tile glyphs are never brass" expects 32 DS tiles and gets 33 on the base too (probe `ui-card9/base-T2-06`).
- Desktop guest first screen unchanged by design (its windows already label the example data and the strip keeps "Sign in").

# Card 20: friendlier starting rank label (R0), and stop advertising the example as Owner

Written 12 Nov 2026, 01:44 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

Card 9 (`ui/guest-first-screen` @ `06a8aa5b`) already relabels the phone guest Home net-worth line to "Example account", adds a pitch ("Start with $10,000… grow it to $20,000"), and a "Create account or sign in" CTA. Those strings stay. The leftover friction is the rank chrome around that example.

Logged out, the demo channel is R2 (mock default). The phone widget still puts a chip `R2 · Owner` next to "Example account" and a rank bar `Next: Mogul · $412k / $5M`. The desktop status strip shows `Quay 2 · Owner` and a `R2 · Owner` chip. After sign-up the player is R0, and the display name is **Broke** (Portfolio `pf-rank-chip`, shell `RANK_NAMES`). Playtest e30f6822 read the guest top bar as `$412k · R2 Owner` and new players as `R0 · Broke`. That contrast — a rich example rank, then being called broke — is the first-ten-minutes problem this card fixes.

## Spec (rank names, cited)

The ladder is owned by 14; 00 and 17 only name it:

- `export/vision-review/complete/14-PLAYER-PROGRESSION-LIFESTYLE.md:464` — table §3.2.2: `| R0 | Broke | start | … |`; R1 Hustler at $20,000; R2 Owner at $250,000; then Mogul, Tycoon, Titan, Dynasty.
- `export/vision-review/complete/00-INDEX-AND-CONVENTIONS.md:137` — "Rank | R0 Broke … R6 Dynasty, from net worth".
- `export/vision-review/complete/00-INDEX-AND-CONVENTIONS.md:216` — "Ranks `R0 Broke, R1 Hustler, R2 Owner, R3 Mogul, R4 Tycoon, R5 Titan, R6 Dynasty` (14 owns thresholds)."
- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:8` — "Rank names follow 00 §5.8 (R0 Broke, …)". 17:240 sketches the guest strip as "Quay 2 · Owner"; 17:257 sketches the phone widget rank chip and "Next: Mogul".

The rank **id** stays R0 and the thresholds do not move (no economy change). Only the **label** the player reads for R0 changes. "Broke" is the spec's table name, but it is a poor welcome when V1 start cash is $10,000 (already in card 9's pitch and `S.starterPlaceholder`). The display name **Starter** stays honest: this is the starting rank, the same word as the starter account, still R0, still the first rung toward Hustler at $20,000. R1–R6 names stay as the spec wrote them.

## Chosen shape

1. `RANK_NAMES.R0` becomes `"Starter"` (one map, still English-only like today's names). Portfolio, settings shell names, and any signed-in rank chip that use the map follow. Do not invent a second economy or a new rank.
2. Guest (signed-out) chrome must not present the example book as the player's rank: drop the `R2 · Owner` chip on phone Home and the desktop strip, drop the guest `Next: Mogul` bar, and stop the desktop release line saying `Quay 2 · Owner` (keep the Quay wordmark; signed-in still shows `Quay · {handle}`). Do not change `GUEST_HOME` (Example account / pitch / CTA).
3. Optional, only if it stays a short honest label: a guest chip or line "You start at R0 · Starter" that does not use the example's R2. If it crowds the card-9 CTA, omit it and let the pitch plus the Starter label after sign-up carry it.

Rejected: renaming R0 in engine/thresholds; hiding the example $412k figure (card 9 already marks it as an example); restyling Boards, Wire, or the goal/guide (Builder's).

## Exact base, branch, and identity

- Branch `ui/starting-rank-label`, worktree `/workspace/avalon/ui-starting-rank-label`.
- Base `06a8aa5bd66deba041176eba1b04e73449821057` (`ui/guest-first-screen`), because this touches the same guest Home / top-bar chrome as card 9. The live `ui-guest-first-screen` worktree is not used.
- Forge (trading-game bot) `<forge@trading-game.local>`. Unset every `GIT_*` for npm test and Git. No push, PR, merge, or hook bypass. Ports 3300–3399, never 3199. Stay off the ticket's order-type/TIF controls, the engine, card 10 safe-area, clock loading, and outage presentation.

## Acceptance and proof

- A new player's visible R0 label is `R0 · Starter`, not `Broke`. Rank id and thresholds unchanged.
- A logged-out guest at 390 and 1280 does not see `R2 · Owner` or `Next: Mogul` in the Home widget or status strip. Card 9 copy is still present and unchanged.
- Fail-first: unit tests that the current base still says `Broke` and still shows the guest `R2 · Owner` chip / Next Mogul line; then the same tests pass. Do not weaken card 9's Example account / pitch / CTA assertions except to drop the leftover Owner expectation.
- Evidence: phone 390 and desktop 1280, guest Home, before and after, under `/workspace/avalon/evidence/ui-starting-rank-label/`.
- Checks with all `GIT_*` unset: lint, typecheck, build, check-hooks, ledger-no-dup, npm test, `/broker` route-budget ≤ 220,160 B (report the bytes). Clean e2e once in a scratch worktree with fresh `.data` (affected: guest-first-screen + phone home + any rank-chip tests). No `--with-deps`. Delete the scratch afterwards. Report SHA, base, UNIT-first, numbers, evidence, caveats (Node 24 vs CI 22). Do not push.
