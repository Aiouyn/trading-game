# Unit: a readable Wire story at the first served tick

**Branch:** `eng/wire-first-story`  
**Base (written against):** `cb2c813e8e511fcbd37f73463b2d7b638eb61bae` (`eng/claims-statements`)  
**Restacked onto:** `d23c141c40d907f4e30324adbc4939c5d23314ac` (`eng/claims-statements`, 2026-11-11 19:45 Europe/Paris) — fail-closed present-but-invalid rumors.  
**Worktree:** `/workspace/avalon/wire-first-story`  
**When written:** 2026-11-11 19:34:44 Europe/Paris — before product-code edits.  
**Owner:** continue-nonstop after cb2c813e was sent to Gatekeeper. Fix the 30-second Wire empty gap so a new player can read a story at t0. If Gatekeeper findings on the claims branches arrive through the parent, fix those first (cb2c813e on `eng/claims-statements`; 90e8cae7 on `eng/claims-authors`; b8257aaf on `eng/claims-resolve`).

A 90e8cae7 REVIEW.md appeared on disk during setup (bounded PASS, qualified; no blocker). It did not arrive through the parent, so it is not treated as a find-and-fix interrupt. Its missing-secret qualification is already fail-closed on this base (cb2c813e). Its digest4000 note is a constraint for this unit: do not silently drift the 4000-tick quote digest versus cb2c813e.

## Player outcome

On a fresh world, a signed-in player who follows the first-trade guide and taps **Open Wire** at the first served tick (START_TICK, 27700) — or in the ~30 s before the first live catalog slot — sees at least one real catalog Wire story immediately: a headline, a named tradable asset, and the cause copy. They do not wait for tick 27706. Desktop and phone.

The guide itself does not change. `GoalGuide` step 1 only calls `show(store, "wire")` and does not set a filter or wait for a story; "done" is still a server fill. This unit makes that step *work* at t0 by giving the Wire something to read.

## Why it is empty today

Gatekeeper's check of `ui/wire-first-step` `1ef58ad0` (evidence `/workspace/avalon/evidence/launchpad/gatekeeper/1ef58ad0/REVIEW.md`) measured this on a fresh `.data`: `/api/wire` has **0 items** at landing; the first story is `w-27706` (NEWS, Orca Biologics) at **30.2 s**. Root cause is the live catalog schedule, not a wrong filter.

`storyAt` in `src/market/wireStories.ts` returns a story only when `d = tick - START_TICK` is **> 0** and a multiple of `STORY_EVERY` (6). The clock starts at START_TICK and serves that tick immediately; `publishStory` runs on `step()`, so the first live slot is START_TICK + 6 = 27706 (six 5-second ticks, ~30 s). The first-trade guide still asks the player to "Read a Wire story" during that gap (M2-01 / `goalStrings.ts`). The UI card added a waiting one-liner; it did not put a story on the server.

## Spec cites (`export/vision-review/complete` and V1)

- **docs/v1/V1-BOARD.md:53–56** — M2-01 is "30s clarity + 2-min first trade." An empty Wire for the whole first 30 seconds fails that bar.
- **18:199–209 (§3.3.3)** — the first headline is a real engine Wire item from the **last 720 ticks** (1 game day) whose targets are open LIC1 assets; pick by score, else a fallback headline. This unit does not build the full ONB-05 first-news card. It makes the prerequisite true: at t0 the Wire already has a real catalog item from that lookback, so a later onboarding card has something to select.
- **18-AT-06 (18:620)** — "The first-news headline is a real engine Wire item from the last 720 ticks whose asset is tradable under LIC1 with an open session."
- **18:174** — first_news step expands the selected headline; the V1 guide's "Open Wire / read a story" is the present stand-in.
- **04 / vision 04-experience "2:30 — First news, first trade"** — a real engine headline from the world (not scripted fake news), e.g. from the last game hour. This unit uses the existing company/crisis catalog, not a new fixture.
- **17:908 WIR-01** — empty-filter copy stays as-is. After this unit, fresh All should not be empty, so that state is for later empty category filters (already covered by the UI card when it is merged), not for t0 All.

## Design (chosen)

**Seed one or two existing catalog stories onto the Wire at clock construct, with ticks at or before the first served tick, and do not apply their shocks to the live quote stream.**

Details:

1. Keep `storyAt(seed, tick)` as the **live publisher**: still null at START_TICK and until 27706, then the same slot 0, 1, 2… stories at the same ticks as today. Do **not** shift the live grid (that would move every later shock and rewrite M1-05 / M1-09 / digest4000).
2. Add a pure helper (same catalog, same FNV slot formula, Euclidean modulo so negative slots are well-defined) that can name the catalog story on any grid tick, including `tick <= START_TICK`. Grid: `(tick - START_TICK) % STORY_EVERY === 0`. The two most recent such ticks at or before START_TICK are **27700** and **27694**.
3. At `LiveMarket` construct, after storm/rumor restore, if the clock is on a fresh first-served-tick world (`feed.tick === START_TICK`) and those history items are not already present, append them to `this.stories`. Reads do not seed twice and do not step the clock. Idempotent by id.
4. Ids are `w-h-${tick}` so they cannot collide with live `w-${tick}` catalog rows, farm `w-r-*`, or denial `w-d-*`. M1-09's live catalog count (`/^w-\d+$/`) stays the live schedule.
5. **No `applyShock`, no `openRumor`, no rumor-book writes.** History items are already-happened headlines from the lookback. Omit the `effects` / priced-in from-to (opening marks did not take these moves; inventing a from/to would lie, and applying the bp would change the golden and digest4000). Headline, entities (named asset), `causeKey`, and phase stay. Prefer realized company NEWS when picking among the last-day grid; if fewer than two such exist in the 720-tick lookback, fill with the most recent other catalog defs (still no shocks).
6. Items stay on the Wire and evict through `retainStories` / `STORY_KEEP` like any other row. They are not a second live publish: `publishStory` still only fires `storyAt` on step.
7. Deterministic: same seed ⇒ same history defs and ticks. Guest fixtures are unchanged (signed-in feed uses the server Wire).
8. Mid-run restart at a later tick is out of scope for new seeding (catalog NEWS still start a new epoch, as today). A cold start at START_TICK always seeds.

Rejected alternatives:

- Publishing live slot 0 at START_TICK, or allowing `storyAt` at `d === 0`, would apply the first catalog shock six ticks early and shift or duplicate the schedule. That would change M1-05 golden, M1-09 ticks, and digest4000. Not justified when history-without-shock meets the clarity bar.
- Inventing a new non-catalog "welcome" headline. 18-AT-06 / 04 want a real engine item.
- Gating or rewording the guide until 27706. That is the UI-backlog option in the 1ef58ad0 review; it does not give the player a story to read.

## What must not change

- Live `storyAt` schedule and defs after START_TICK (first live story still 27706, same def, same shock at that tick).
- M1-05 golden / legacy tape for unmoved assets; ERP notes at ticks 3 and 20; quotes at t0 through the first live story tick versus a reference ShockFeed that applies only live `storyAt` effects.
- digest4000 versus cb2c813e under the same fixture (no new mark moves in the 4000-tick window from this unit).
- M1-09 price replay: the server remains the seeded walk plus exactly the **live** logged effects. If a Wire-list assertion assumes the feed contains only post-start `w-${tick}` rows, update it and document that the live schedule is unchanged and the new rows are pre-start history with no shock.
- HMAC seals, 15-tick handoff, fail-closed missing secret, company denials, farm 8/day.

## Acceptance

1. `new LiveMarket()` at START_TICK: `wire().items` has 1–2 history rows, each a catalog def, tick ≤ START_TICK, id `w-h-${tick}`, a named asset entity, a defined headline and cause, no `effects`, no `isTrue`. Quotes equal a no-history reference (same as today's t0). A second `wire()` / `snapshot()` does not add rows or move marks.
2. Same seed ⇒ same history. A different seed can differ. `storyAt(seed, START_TICK)` is still null; `storyAt(seed, START_TICK + 6)` is unchanged.
3. After stepping to 27706, the live `w-27706` row still publishes with its catalog effects applied once; marks match the reference walk; history rows are still present (unless evicted, which they will not be in this window).
4. jump ≡ step over a short window that includes t0 and the first live story; boot hydration at START_TICK rematerializes the same history ids (canonical items), no second copy, no shock on hydrate. Do not claim continuation-hash identity after further steps.
5. Guide path, desktop and phone, fresh `.data`: register → first-trade guide → Open Wire → at least one story row is visible without waiting for tick 27706. The empty-All waiting state is not the t0 path.
6. Repo checks (lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test) and one affected e2e batch on a clean temp tree, fresh `.data`, including M2-01 first-trade plus the Wire specs (M1-09, WIR-9, WIR-A). Delete the temp tree after.

## Not in this unit

- Full 18 §3.3 first-session machine, ONB-05 first-news card, Retail grant, 20% cap (already elsewhere).
- Persisting catalog NEWS across a mid-run restart (still a new epoch).
- Applying historical shocks into opening marks; shifting the live `STORY_EVERY` grid.
- UI polish of the guide or empty-filter copy (UI builder). No `channels.ts` / `schema.ts` edits unless a parse rejects a legal history tick (it should not: `tick <= snapshot.tick` already holds).
- POLICY/RECOVERY, 07/FX, meme-failure farm. No 16:564 due-time claim. No overall GO.

## Checklist

- [x] Ground (1ef58ad0 review, `storyAt`, clock publish, GoalGuide, M1-05 / M1-09 / digest4000 constraint)
- [x] Sketch (history seed, no shock, vs shifting the live grid)
- [x] Agree (autonomous: history seed is the smaller change that keeps goldens)
- [ ] Implement
- [ ] Prove
- [ ] Commit, e2e, push, GK-HANDOFF
