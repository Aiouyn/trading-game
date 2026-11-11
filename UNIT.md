# Card 12: Next up on the signed-in net worth board

Written 12 Nov 2026, 00:32 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

Audit of the signed-in Leaderboard for a brand-new player's first 10 minutes, on phone 390 and desktop 1280: can they find their own rank and see what they need to do to climb, within 30 seconds?

They can already find the rank. A live signed-in board at 390 and 1280 shows "Your rank: R of N" in the header, a You chip on the marked row, and Find my row (44 px on the phone). The row is in view on a short board. That is enough for the first half of the question.

They cannot see, in those 30 seconds, what climbing means on this board. In the behind case (a new account after one fill, rank 3 of 3 at $9,992.15, two players at $10,000.00 above), the header stops at the rank and the footer only defines net worth. Nothing names the next player or the gap. The player has to scan the table and subtract. In the tied-for-first case, two accounts share $10,000.00 and the board does not say they are tied or that a higher net worth would break it. 17 §7.23 BRD-02 (export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:1098) asks for the player's row pinned with an accent hairline and the rival highlighted "Next up". 18 §3.3 step 9 (18-ONBOARDING-ACADEMY.md:178) uses the copy "Next up · $1,240 ahead", and 18 §3.3.5 (line 217) picks the closest player above. V1-BOARD.md:53–55 and :82 keep the 30-second path and M2-03 as the shared-world net-worth board only; leagues, public profiles, and the grow-$10k goal stay out.

This is the single biggest friction on the signed-in board. The board is not "genuinely fine" for the climb half of the question, so we do not move to a different first-10-minutes area.

Do not add league groups, a profile tap, goal/guide copy, or advice ("should", "consider buying"). Do not change the guest landing, the Portfolio empty state, the Wire-to-Broker hand-off, Builder Wire-story work, the engine, or the Broker ticket's order-type or time-in-force controls (Stop, Stop limit, GTC) or their tests. Compute Next up only from the public rows already on the board (rank, handle, net worth). Do not add engine fields.

## Exact base, branch, and identity

- Branch `ui/boards-next-up`, worktree `/workspace/avalon/ui-boards-next-up`.
- Base `abf14e57f719689e1a94a65223c6f24ab71a6ae0`. The change is the Boards app only, not shell chrome, so this is the required base (not `ui/pwa-safe-area` @814816a9).
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Remove every `GIT_*` variable from manual npm-test and Git subprocesses. Before every commit inspect `log -3` and all new commits, and check for stray init or tracked.txt fixture changes. Never skip hooks.
- Local checkout only. No cloud, push, PR, deploy, or external handoff. Scratch integration merges are evidence only.

## Grounding and sketch

`LeaderboardView` already carries `rows` and `self`. The closest player above is the row in `rows` with the smallest net worth that is still strictly greater than `self.nw` (equivalently, the last better-ranked row in the best-first list). The gap is that net worth minus `self.nw`, in cents, formatted with the existing money text. If several players share that net worth, name the one immediately above the viewer in list order (the neighbour they would catch first). If `self` is unvalued, or that neighbour is not in the sent top rows, show no invented Next up.

Two local shapes were compared:

1. Chosen: a header line and a "Next up" mark on that neighbour's row, copy in the 18 §3.3.5 shape ("Next up · {handle} · {gap} ahead"). When the viewer uniquely leads the board, say they are at the top. When they share the best net worth, say they are tied, with the shared amount. Keep Find my row, the You chip, and the existing how-ranked footer. A light accent hairline on the self row, as BRD-02 pairs with Next up, so the two rows stay distinct.
2. Rejected: a goal or "go trade" prompt (Builder's lane, and copy-banned advice). Rejected: opening a public profile (not in V1 M2-03). Rejected: a new API field (the figures are already on the board).

## Acceptance and proof plan

- While signed in and the board is live, if a closer-above row exists in the sent list, the header names that handle and the exact net-worth gap, and that row is visually marked "Next up". The gap is subtracted from the two public board amounts; it is not a made-up P/L or forecast.
- If the viewer uniquely has the highest net worth: a short "at the top" line, no Next up row. If they share that highest net worth: a short tied line, no Next up row. If `self` is missing or the neighbour is not in the top rows: no invented neighbour or gap.
- Rank, You, Find my row, valuation line, and the how-ranked footer stay. No advice, no goal/guide, no profile navigation, no engine or contract changes.
- At 390 the new line and the Next up mark wrap without horizontal overflow; Find my row stays a 44 px coarse target. Desktop 1280 keeps the window readable at the existing 420 px minimum used by M2-03.
- Fail-first unit tests of a pure helper for behind / unique lead / tie-for-first / self unvalued / neighbour not in the top rows. A fail-first e2e (live or routed fixture) of the behind case on phone 390 and desktop, plus the unique-lead and tie cases. Do not weaken existing M2-03 tests or broadly regenerate golden images.
- Evidence shots: phone 390 and desktop 1280, signed-in behind and tied-or-lead, before and after, under `/workspace/avalon/evidence/ui-boards-next-up/`.
- Freeze final HEAD before final proof. Run lint, typecheck, ordinary production build, check-hooks, ledger map-no-dup, and npm test with all `GIT_*` unset. Unchanged `/broker` route-budget ≤ 220,160 bytes; report the number.
- Clean e2e once in a scratch worktree with fresh `.data`, affected cohort: the new board tests plus `tests/e2e/17b/M2-03-leaderboard.spec.ts`. Existing Chromium only; no apt or `--with-deps`. Ports 3300–3399 only, never 3199. Delete the scratch worktree afterwards. Prefer hardlink or symlink for `node_modules` if inodes are tight, and record that.
- Report SHA, exact base, UNIT-first, checks, bytes, screenshots, and qualifications (local Node 24 vs CI 22). Do not push.
