# UNIT-DELTA: analyst notes as NPC outlet NEWS, and fail-closed unknown channel

**Branch:** `eng/analyst-notes`  
**Base:** `4f1d3d1598f459b3a8157f3a4c3d619ac4ccdf60` (19dd1186 merged with eng/wire-first-story 6cf908be)  
**Worktree:** `/workspace/avalon/analyst-notes`  
**When written:** 2026-11-11 20:55:45 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper BLOCKED 19dd1186 on 15:828, forwarded through the parent. Do not wait for an owner decision. Fix on this branch after the history-clarity merge. Do not land this delta on `eng/player-statements`.

This delta does not replace UNIT.md. It brings T1 notes into compliance with 15:828 and hardens the unknown-channel path.

## 15:828 BLOCKED

**Finding.** 15:828: "NPCs do not post statements except as outlets." The T1 daily note is currently a **STATEMENT** attributed to a named person (actor + `wire.statement.analyst-note` with `{analyst}`). That is a named NPC posting a statement, which 15:828 forbids.

**Docs recovered.**

- **15:827:** "16's media outlets publish **NEWS** items under their mastheads with their credibility and editorial line." That is the kind NPC outlets use. **15:627** `OUTLET` is for *player-owned* media businesses (09), not for NPC houses.
- **15:315:** `authorId` is documented for STATEMENT/OUTLET only. NEWS items carry `outletId`. A personal byline on NEWS is not licensed here; 16:560 "with the author named" is the *player* Research Desk publish path, not T1 notes.
- **22:2703 / 22:2518:** the twelve sector analysts are EDITOR actors "without an outlet," each at a fictional research house (e.g. Priya Holloway at Keystone Research). 15:828 still requires an outlet masthead. This unit treats **the research house as the NPC outlet** (parent example), with a stable `outletId` derived from the house name. That is a documented gap-fill, not a new kind.
- Claim machinery (channel `analyst`, desk 05 `claimCredibility`, HMAC-sealed accuracy and truth, schedule, ids `w-a-${tick}`, no company denials, no `applyShock` at publish) is unchanged. Pending/just-resolved notes must still be retained on the Wire even after `STORY_KEEP` would drop a catalog NEWS row.

**Contract.**

- The Wire row is **NEWS**, `outletId` set, headline names the **house** (masthead), not a person. Entities: the tagged asset and the house as an outlet, not a named-analyst actor.
- No personal byline (no `authorId`, no analyst actor label). The house may still live in slots for the headline. Rematerialized pre-outlet claims are mapped to the house headline and drop `slots.analyst`.
- Cause copy talks about a research-house note, not "a named sector analyst posted a statement."
- `showsRecord` may show `sourceRecord` on this NEWS row when the claim carries one (same public hits/resolved).
- Existing FilterChips already file NEWS under News, not Statements.

**Harden unknown `channel` (still flagged).** `normalizeRumorSnapshot` today softens a present but unknown `channel` to `undefined`. A typo'd or future channel then boots as a desk-like row. **Fail closed:** if `channel` is present and is not exactly `"farm" | "desk" | "analyst"`, throw `CorruptRumorSnapshotError` (`RUMOR_SNAPSHOT_CORRUPT`), do not start the book, do not rewrite the file store. Absent `channel` remains valid (legacy inference from source id). Other optional-field softening is unchanged.

**Follow-up, unchanged (16:557 gap).** This slice stays the free public T1 *product* (one note per game day from public data). Paid T1 $100/day, one analyst per sector, hired/fired via 16:742 `soc.world.analyst.hire` / `.fire`, T2/T3, and a private subscriber feed are out. Record only.

## Acceptance

1. Seed 17 at 27760: one `w-a-27760` **NEWS** row, `outletId` of the house the seed draws, headline names the house, no named-person actor, no `effects` at publish, claim still channel `analyst`. t0–27720 have no `w-a-*`. Marks / M1-05 window unchanged. The row is still on the Wire at resolve (retention holds claim NEWS).
2. A rumors snap with `channel: "nope"` (or any non-allowlisted value) fails closed (`RUMOR_SNAPSHOT_CORRUPT`). A missing `channel` still loads.
3. Repo checks on the exact head; affected e2e once on a clean temp tree, fresh `.data` (M2-01, M1-09, WIR-9, WIR-A). Delete the temp tree. Preview :3199 stays 200. Pre-push stray-init check; normal push, no force, no PR. Evidence-only delta handoff.

## Not in this unit

Player-statement findings (B2/B3/quals) stay on `eng/player-statements` after this tip is merged in. 18:204 remains backlog on the history-clarity delta. POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.
