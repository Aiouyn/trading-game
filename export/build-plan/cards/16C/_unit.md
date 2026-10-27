# Unit 16C - World history and archive, eras and technology, secrets and facts, opportunity briefs (stage S6)

Purpose: 19 §12.2 row 16.C after E-30 (depends on 16.B, 13.B). Layers 7-9 of module 16 and the hooks that switch on the INERT ACs left by 16A/16B. Files under `packages/engine/world`. No price math; formulas copied, coefficients 'Quant'.

## Tasks (one PR each)
T16C-01 Schema, events, codes
T16C-02 History, chronicle, Since you left, archive (16#44-46)
T16C-03 Technology and eras (16#47-49)
T16C-04 Facts, secrets, discovery, counterplay (16#15, 53, 54)
T16C-05 Fact uses: share, sell, report, publish (16#50, 52)
T16C-06 Opportunity briefs (16#55)
T16C-07 Assembly, intents, views, INERT switch-on

## DAG
01 → 02 → 06 ; 01 → 03 ; 01 → 04 → 05 ; all → 07.

## CATALOG_GAPS_16C
Empty (E-33). `FACT_SALE_NPC` has catalog and legpolicy rows (TRANSFER frm 5000 → 4000, amounts Quant); `SECRET_PATH_FEE` is an alias of `WLD_ARCHIVE_PURCHASE`.

## Open questions (conservative choice)
1. **Codes (ruled, E-33).** See CATALOG_GAPS_16C.
2. **Ids (ruled, E-33).** `hst_`, `fct_`, `sec_`, `brf_`, `brk_` are in the E-26 id table and the lint allowed list.
3. **16#15** is now owned jointly: dynasty structures in T16B-06, paths in T16C-04 (cited by both).
4. **Upstream**: 09B, 11, 12, 13B, 15B, 21, 22A cards are needed for full live paths; ports default to null with INERT ACs.

## Quant
Fact sale price ($25k × (1 + 9·sensitivity) × audience) and cap; discovery-path defaults (costs, pSuccess, durations); history thresholds 0.4/0.6 and durationFactor; tech base cost 1.6 chapters and growth 1.25; breakthrough effect sizes (22 authors, Quant checks).
