# UNIT-DELTA: more negation markers, and split composer error testids

**Branch:** `eng/alpha-telemetry`  
**Base:** `a014879df1421c54d36e51ef6f326ad85ad44183` (already carries d00fd912).  
**Worktree:** `/workspace/avalon/alpha-telemetry`  
**When written:** 2026-11-11 22:12:01 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper bounded PASS on d00fd912 closed B1. Two cheap qualifications, folded here as one small commit. Do not reopen `eng/statement-resolve`. Charge path is unchanged. ZWSP-vs-\\b on short markers is not in this delta.

This delta does not replace UNIT.md (V1 telemetry) or the earlier negation UNIT-DELTA.

## 1 — Additional negation markers are OPINION

`classifyStatementClaim("nothing will rise")` currently returns UP because `rise` is in the closed list and the V1 marker list omitted these compounds. Same fail-closed rule as d00fd912: after NFKC and case-fold, a listed negation marker makes the claim uncheckable (null → OPINION). Do **not** flip direction.

Add to the existing marker list (word / contraction, EN and FR):

- EN: `nothing`, `none`, `nobody`, `neither`, `nor`
- FR: `rien`, `aucun`, `personne`

Keep the markers already in d00fd912. Unit cases must include “nothing will rise” and at least one of each new EN/FR marker.

## 2 — Split the shared composer error testid

`data-testid=wire-composer-error` is used both by the load-failure boundary (`RetryableComposer`) and by the Composer form’s post-error `<p>`. Keep `wire-composer-error` (and `wire-composer-retry`) for the **load** failure only. Give the post error its own testid: `wire-composer-post-error`. Update unit and e2e callers (M1-10).

## Not in this delta

ZWSP / format-char false markers. Telemetry product work. 16:557, 18:204, POLICY/RECOVERY, 07/FX, meme-failure farm.
