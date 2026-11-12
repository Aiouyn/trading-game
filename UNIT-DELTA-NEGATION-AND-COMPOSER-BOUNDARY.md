# UNIT-DELTA: negated claims are OPINION, and a Composer chunk error is retried locally

**Branch:** `eng/statement-resolve`  
**Base:** `76dfb1a3c6e8ded5403806168749e20d70dcd6c1`  
**Worktree:** `/workspace/avalon/statement-resolve`  
**When written:** 2026-11-11 21:55:16 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper review of 76dfb1a3 (`/workspace/avalon/evidence/launchpad/gatekeeper/76dfb1a3/`). B1 (negated claims misgraded) is the blocker. The lazy-Composer error-boundary qualification is in the same batch. Do not fix this on `eng/calibration-test-speed` or `eng/alpha-telemetry`. Charge path is unchanged.

This delta does not replace UNIT.md.

## B1 — negated claims are OPINION (blocker)

`classifyStatementClaim("HALC will not rise")` currently returns UP because `rise` is in the closed list and the V1 tokenizer ignores negation. A negated claim is not a checkable UP/DOWN fact.

**Contract.** After NFKC and case-fold, if the text contains a negation marker, the claim is **not checkable** → `classifyStatementClaim` returns `null` and the post is **OPINION** (same as no lexicon hit). Do **not** flip the direction.

Markers (word / contraction, EN and FR):

- EN: `not`, `no`, `won't` / `wont`, `will not`, `never`, and `n't` / `n’t` (as in `don't`, `isn't`, `can't`)
- FR: `ne`, `pas`, `jamais` (covers `ne … pas`)

A sentence with both a direction word and one of these markers is OPINION. Affirmative lexicon hits without a marker are unchanged (`HALC will rise` stays UP).

## Qual — Composer error boundary

`Feed` lazy-loads `Composer` inside a bare `Suspense`. A failed composer chunk can take down `/wire` for a signed-in player. `RetryableModule` (UI builder, `bfe320dd`) is **not** in this base; add a **minimal local** boundary around the composer: on load/render failure, show a short message and a Retry control (`data-testid=wire-composer-error`) that remounts the lazy import. Guests still do not request the chunk. Do not change first-load budget expectations.

## Acceptance

1. Unit cases: `HALC will not rise`, `won't go up`, `will never fall`, `no gain`, `n't` contractions, FR `ne va pas monter` / `jamais de hausse` / `pas de baisse` are all `null` / OPINION; `HALC will rise` and `ça va monter` stay UP; `HALC will fall` stays DOWN. A post of a negated body is OPINION immediately, even with marks.
2. Composer boundary: a failed load shows Retry, not an uncaught render crash; Retry remounts. Existing composer e2e paths still work.
3. Repo checks on the exact head; targeted classify + boundary tests. Affected e2e once on a clean temp tree, fresh `.data` (M2-01, M1-09, WIR-9, WIR-A, M1-10) because the UI path changed. Delete the temp tree. Preview :3199 stays 200. Pre-push stray-init; normal push, no force, no PR. Evidence-only delta handoff.

## Not in this delta

GET catch-up / `withLock`, fire-and-forget step, 05/13, Voices, 16:557, 18:204, quarantined day-cap (stays on `eng/calibration-test-speed`). POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.
