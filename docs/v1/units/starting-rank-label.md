Moved from UNIT.md on 12 Nov 2026 (Europe/Paris) per Builder's rule, on the merge of the forwarded card 9 branch (origin/main f8f51ad9, PR105) into this branch. Card 20's section is kept with its original text and date; card 9's section that sat above it in the stacked UNIT.md is in docs/v1/units/guest-first-screen.md.

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
