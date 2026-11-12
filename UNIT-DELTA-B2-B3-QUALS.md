# UNIT-DELTA: B2 quarantine, B3 CSRF fail-closed, and forwarded quals

**Branch:** `eng/player-statements`  
**Base:** `de5392dc2bafc72924f77d25df889a0566a7937a` (9202e885 merged with eng/analyst-notes 50293cba; no rebase of pushed history)  
**Worktree:** `/workspace/avalon/player-statements`  
**When written:** 2026-11-11 21:02:00 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper review of 9202e885 (`/workspace/avalon/evidence/launchpad/gatekeeper/9202e885/REVIEW.md`). B1 (V1-BOARD scope) is **withdrawn**. B2 and B3 still block. Qualifications below are in this delta. Proofs required in the delta handoff.

This delta does not replace UNIT.md. The happy-path **charge path is unchanged**: same `withLock`, same `$500` `cashCents` decrement, same 3/game-day cap, same `(accountId, key)` idempotency, same one persist, no `applyShock`. Existing money/race proofs can be reused.

## B2 — never skip a paid row (blocker)

`parsePlayerWirePosts` / `parseWirePostIntents` currently skip invalid rows. That can hide a paid post (cash taken, public GET empty, same-key replay **500** “Stored statement is missing.”) and, if the intent is also unreadable, **double-charge**.

Repro today: `repros/gk-player-statements-probe.test.ts` (“corrupt paid wirePosts row…”, “corrupt post AND intent can double-charge on retry”). This unit **extends** that probe (checked into `tests/unit/gk/`) so the new contract is the assertion, not the old defect.

**Contract.**

- Corrupt `wirePosts` rows are **quarantined**, not dropped (same idea as `players[]`). An `ACCEPTED` intent is never silently unpaired by a skip.
- Same-key replay must **never 500** and must **never double-charge**, even if the intent or the row is unreadable. Fail closed for that key’s post path (dedicated non-500 error, cash unchanged) rather than treat it as a new post.
- Login and the rest of the auth store still boot. Public GET lists only well-formed posts. Quarantined rows stay in the file store (hash/mtime preserved on a failed replay).

## B3 — CSRF fail-closed (blocker)

A POST with **no Origin and no Referer** must be **403**, and so must evil origins. Today `assertSameOriginMutation` fails open when both are missing (`proof/csrf-no-origin.json` was 201 + cash 950000). Tighten the guard used by `POST /api/wire` (the shared helper; same fail-closed rule).

## Qualifications

- **PII.** NFKC-fold (and strip format/ZWSP, fold `[at]` / `(at)` / fullwidth `@`, fullwidth digits, obvious `at` / spaced-`@` / fullwidth-hyphen phone forms) **before** the email/phone filter. Re-run the Gatekeeper matrix (`proof/pii-matrix.jsonl`); those bypasses must now reject (`TEXT_FILTER`). Stored body stays a React text node (HTML/bidi not interpreted); this unit does not invent a new sanitizer beyond the filter fold and existing C0/C1 strip.
- **Public author id.** Public `GET /api/wire` must not expose the `acc_…` account id (`slots.authorId`, `player:${accountId}`). Use a **public handle id** that is not the account id. Handle text may still appear (it is already public).
- **Distinct chip.** Player posts stay kind `STATEMENT` (15) but must be visually distinct from official statements: a separate Player / Joueur chip (or equivalent label) on the row and in the detail.
- **Rejected intents.** Do not persist `REJECTED` `wirePostIntents` (disk-growth / DoS). A later retry of a previously rejected body is a new decision, not a stored reject replay.
- **Byte cap.** Raw request body for `POST /api/wire` is capped (well above a 280-character statement + key, far below 200k). Oversize → 400, no parse-then-reject of a huge body, no charge.
- **Server-sourced counter.** Composer “n left today” is loaded from the server on mount (signed-in `GET /api/wire` carries `remainingToday`) so a refresh after two posts does not reset to 3.

## Proofs the delta handoff must include

- B2: extended probe — corrupt paid row is quarantined; public list may omit it; cash unchanged; same-key replay does not 500 and does not charge again; corrupt post **and** intent does not double-charge (fail closed).
- B3: POST with no Origin and no Referer is 403; evil Origin is 403; cash unchanged.
- Quals: PII matrix re-run (all former bypasses reject); public GET JSON has no account id; distinct player chip; rejected intents absent from the store file; oversize body rejected by the byte cap; composer counter after a reload is the server remaining, not a client default of 3.

## Acceptance

Repo checks on the exact head; affected e2e once on a clean temp tree, fresh `.data` (M2-01, M1-09, WIR-9, WIR-A, M1-10). Delete the temp tree. Preview :3199 stays 200. Pre-push stray-init check; normal push, no force, no PR. Evidence-only delta handoff with the proofs above.

## Not in this unit

16:557 paid hire path remains a follow-up (recorded on the analyst-notes delta). 18:204 remains backlog. Statement resolution stays on unpushed `eng/statement-resolve`. POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.
