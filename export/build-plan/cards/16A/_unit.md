# Unit 16A - Aggregate economy, causal news framework, world scheduler (stage S1)

Purpose: 19 §12.2 row 16.A (depends on 04). Layer 1 (households `hh` per city, firm sector `frm` per bloc) and layer 5 (causal news, information tiers, rumors, tips), plus the world scheduler and the consequence engine every later 16 layer uses. Files under `packages/engine/world`. 16 never sets prices and never tunes price math; every coefficient of §3.2, §3.6 and the C01-C20 magnitudes is a param tagged **Quant**.

## Tasks (one PR each)
T16A-01 Schema, events, streams, codes, ports
T16A-02 World scheduler, P3 budget, determinism (16#1, 2)
T16A-03 Firm sector (Quant)
T16A-04 Household sector (16#3, 4) (Quant)
T16A-05 Outputs, money closure, ordinary activity (16#5)
T16A-06 Consequence scheduler and causal links (16#42, 43)
T16A-07 World events adapter over 04's crisis scheduler (16#38-41)
T16A-08 Causal news pipeline, N1/N2 (16#27-30)
T16A-09 Information tiers (16#31, 32)
T16A-10 Rumors, tips, whispers (16#33-37)
T16A-11 Assembly, intents, views

## DAG
01 → 02 → 03 → 04 → 05 ; 02 → 06 → 07 → 08 → 09, 10 ; all → 11.

## Not here
16B: named actors, decision models, dynasties, strikes (§3.3, §3.4, §3.7.5, §3.13). 16C: politics, history and archive, eras, secrets and facts, briefs (§3.5, §3.9-§3.12). 16A leaves INERT ACs and null ports for each.

## CATALOG_GAPS_16A
`HH_WAGES`, `HH_CONSUMPTION_NPC`, `FRM_DIVIDENDS`, `ROW_NPC_INCOME` (intra-elastic, not posted). Resolved by E-27/E-29: `INFO_*` SINK BURN on 5080, `INFO_TERMINAL_FEE` aliased to `ACCT_TERMINAL_SUBSCRIPTION`, values PROVISIONAL per E-28 (gate cleared), aliases `HH_CONSUMPTION_PLAYER`→`BIZ_SALES_HH`, `FRM_B2B_PLAYER`→`BIZ_SALES_FRM`.

## Open questions (conservative choice)
1. **Catalog.** 03 models `hh`/`frm`/`row` as the ELASTIC perimeter; 16 §3.2.5 names TRANSFER codes for flows inside it and a `ROW_NPC_INCOME` "FAUCET into the NPC sector only". Choice: intra-elastic flows are sector state and do not post; `INFO_*` fees are rejected `WORLD_CODE_UNBOUND` until rows exist. Proposal for Producer/Quant: `INFO_*` as SINK BURN (no NPC counterparty), amounts Quant sign-off.
2. **News invariants (resolved, E-27).** N1/N2 are INV-WLD-001/002 in 20 §3.1, owned by T16A-08; coverage tool maps `WLD` → 16.
3. **Shock ownership.** 16 §3.7.1-3 and 04 §3.16 both describe crisis draws; 16 §3.7.3 and 24 make 04 the owner of tiers, rates and Crisis Week. Choice: 16A never draws crises; it consumes 04's world events (T16A-07). The 16 §3.7.6 non-macro categories (weather, accident, health, labour) have no drawer unless 04's ripple/storm catalog covers them; Producer to rule.
   **E-27:** non-macro crises (weather, accident, health, labour) become a world-event catalog in **16B**, owned by Systems, rates from Quant. T16A-07 is unchanged.
4. **Tone, planted tips, rumor sources and activity routing** need 16B actors: NEUTRAL tone, stale-only tips, authored sources with `actorId: null`, and `world.activity` with `actorId: null` until 16B.
5. **Briefs (§3.12)** rank by §3.9.3 relevance (archive, 16C); left to 16C.
6. **Rank for Research Desk** reads 14A rank (R3+); never demoted (E-21), so a subscription is not cancelled by a later rank change.

## Quant rulings applied (E-28, recorded as E-29)
Investment rate term 5; feedback to 04 is C + I only; ×30 housing factor intended, C01/C02 housing record-only; activity λ clamp [1, 9]; news threshold 0.05 with fractional-GD novelty; C01–C20 magnitudes; info prices per GD while active; rumor impulse 0.5·(2·cred − 1); `major_exo_rate` retired (04 owns MAJOR draws); P3 budget 200 ms. All values PROVISIONAL.
