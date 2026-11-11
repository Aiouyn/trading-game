# UNIT-DELTA: mark t0 history as past and drop unapplied causes

**Branch:** `eng/wire-first-story`  
**Base:** `35803f3f81eb70329cc3dbb0e0c08b20e7d227ff`  
**Worktree:** `/workspace/avalon/wire-first-story`  
**When written:** 2026-11-11 20:49:15 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper qualifications on 35803f3f, forwarded through the parent. Fix on this tip. Do not land this delta on `eng/player-statements`.

This delta does not replace UNIT.md. It tightens how t0 history rows (`w-h-*`) and the first-trade guide read.

## Qualifications

History rows are display-only: no `applyShock` / `openRumor`. They must not read as a live move this clock just applied.

- **(a)** Mark them as past: an **Earlier** label (EN/FR) on the row and in the detail. Do not add `effects` or `phase`.
- **(b)** Do not attach the live catalog `causeKey` (e.g. `wire.cause.avb-earnings` / "The stock rises.") to a history row this clock never applied. Use a history-only cause that states the story already happened and this session did not apply a price move. Live catalog stories after START_TICK are unchanged.
- **(c)** GoalGuide step 1 must not promise "why its price moved" when the story the player is sent to may be history that didn't move a mark. Reword EN and FR. Update the unit test that snapshots that sentence.

**Backlog, not this unit:** 18:204 price-move scoring and lookback for existing worlds.

## Acceptance

1. Fresh clock at START_TICK: `w-h-*` rows are labeled Earlier; their detail does not show a live "stock rises / lifts the stock" cause; quotes still match an unshocked walk.
2. Guide step 1 copy no longer claims every story explains a price move.
3. Repo checks on the exact head; affected e2e once on a clean temp tree, fresh `.data` (M2-01, M1-09, WIR-9, WIR-A). Delete the temp tree. Preview :3199 stays 200. Pre-push stray-init check; normal push, no force, no PR. Evidence-only delta handoff.

## Not in this unit

15:828 analyst-note outlet compliance and unknown-channel hardening (those stay on `eng/analyst-notes` after this tip is merged in). Player-statement findings. POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.
