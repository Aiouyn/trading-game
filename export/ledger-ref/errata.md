# ledger-core v0.7 errata (non-normative clarification)

The spec `ledger-core.md` is **frozen at v0.7 + §11**. This file adds no rules: it restates what the frozen text already says, in the places an implementer will look for it, and points out citation slips. Where this file and the spec disagree, the spec wins until the owner rules.

## E-1 Section number of the V3 acceptance tests
- The spec says "V3 03 §8 test 11" (§6.1, PD-4) and "03 §8 item 11".
- In V3 03, §8 is *Edge cases* (`03:1612`). The numbered acceptance tests are **§10 Acceptance tests** (`03:1660`); test 11 is `03:1672`.
- Read every "03 §8 test N" as "03 §10 item N". The "edge 4", "edge 16" and "edge 17" references (`03:1617`, `:1630`) are correctly §8.

## E-2 Missing §4 L-rows for INV-LED-016..022
§4 (lines 277-298) has rows for INV-LED-016..021 (as L17, L18, L19, L20, L21, L22) but **no row for INV-LED-022**.
- **L22 is already taken** by INV-LED-021, so the missing row is numbered **L23**, not L22.
- The rows also appear out of order in §4. The table below is the full, ordered set for 016–022. The texts are copied from the spec; only L23 is new as a row. Its text is §6.11 verbatim, with the PD-15 hold condition of §11 noted.

| L | Binding id | Rule (verbatim from spec) | When | Spec location |
|---|---|---|---|---|
| L17 | **INV-LED-016** (Δ6) | Per ccy per tick: every `TreasuryBalance` = m(e) from its BMAs, and Δ Σ_{S} m = F_s − K_s − X_in + X_out + C_s + Σ controlIn − Σ controlOut, exact | TICK, FATAL | §4 |
| L18 | **INV-LED-017** (Δ7) | `FlowDayArchive[day]` = Σ of that day's TickFlows (per class, per code, m0sysDelta, cbCredit, sysSide); the hash chain is unbroken | DAY_CLOSE, FATAL | §4 |
| L19 | **INV-LED-018** (Δ8, Δ11) | The hook cursor (in world state) advances by exactly 1 tick per committed tick per ccy; zero calls during replay; no hook state outside the world instance | TICK, FATAL | §4 |
| L20 | **INV-LED-019** (Δ6-B condition) | Per ccy per tick, exact bigint: ΔM0_player = (F_p − K_p) + (X_in − X_out) + C_p − (Σ controlIn − Σ controlOut), with the cross-checks stated in §4 | TICK, FATAL | §4, §6.8 |
| L21 | **INV-LED-020** (Δ10) | S_{t+1} computed at P13 of t from committed state only; one CONTROL_RECLASS entry per changed entity per ccy with m(e) ≠ 0n; none touch a BMA | TICK, FATAL | §4 |
| L22 | **INV-LED-021** (Δ13) | Per ccy per tick and per archived day, holder classes sum exactly to the totals for every bucket; intra and reclass net to 0n; Σ m0Delta = m0PlayerDelta; Σ netFlow = N | TICK and DAY_CLOSE, FATAL | §4 |
| **L23** | **INV-LED-022** (Δ14) | **No escrowed money is spendable:** (a) Σ `crt:1001:ESCROW:*` = Σ `crt:2160:*` = Σ victims' `1070:<escrowId>` = Σ `amount` of escrows that are `HELD`, per currency, exact. (b) Only `escrowPlace` and `escrowSettle` post to an `ESCROW` sub. (c) `available()`, `placeCash`, the rail and collection/garnishment never see ESCROW subs or the 1070 claim. (d) No `HELD` escrow has `tick > expiresTick` while `caseId === null` after P13. (e) The attacker's balance never includes escrowed amounts. *Per §11 PD-15, `caseId` in (d) is set by a case against the attacker or any account in the attacker's link group, filed before expiry.* | TICK, FATAL | §6.11 (statement), §11 PD-15 |

For INV-LED-016 and -019 the §4 cells are abbreviated here where they are long; the spec text is authoritative.

## E-3 cbCredit vs cbCreditUnwind: allowed V3 codes
Templates: `CB_CREDIT` = G7 `cbCredit` (CREDIT_CREATE) and `CB_CREDIT_UNWIND` = G7 `cbCreditUnwind` (CREDIT_DESTROY). Class sets come from T03-02 `:47-48` (03 §3.3.3, last paragraph). All codes are owned by 04.

| `cbCredit` (CB_CREDIT, CREDIT_CREATE) | V3 | Card | ↔ `cbCreditUnwind` (CB_CREDIT_UNWIND, CREDIT_DESTROY) | V3 | Card |
|---|---|---|---|---|---|
| `CBK_STANDING_FACILITY`: overnight facility to banks, incl. the automatic day-close conversion of negative reserves (§3.3.4) | `03:869` | T03-05 `:138` | `CBK_STANDING_FACILITY_REPAY` | `03:887` | T03-05 `:155` |
| `CBK_OPEN_MARKET_LEND`: central-bank repo / OMO | `03:870` | `:139` | `CBK_OPEN_MARKET_UNWIND` | `03:888` | `:156` |
| `CBK_ASSET_PURCHASE`: QE (carries an asset leg, qty) | `03:871` | `:140` | `CBK_ASSET_SALE`: QT sales and run-off | `03:889` | `:157` |
| `CBK_EMERGENCY_LIQUIDITY`: lender of last resort | `03:872` | `:141` | `CBK_EMERGENCY_LIQUIDITY_REPAY` | `03:890` | `:158` |
| `CBK_FX_INTERVENTION_BUY`: creates domestic base money (second currency leg via 3800) | `03:873` | `:142` | `CBK_FX_INTERVENTION_SELL` | `03:891` | `:159` |

These are the **only** codes on those two templates: 5 and 5. The other 7 CREDIT_CREATE and 8 CREDIT_DESTROY codes use `LEND`/`REPAY` (commercial banks).

Notes for implementers (T03-05 `:88`, item 2):
- **Intraday credit has no code.** A bank's 1002 may go negative intraday down to its intraday credit limit (03 §3.3.4). No posting is made until day close, when the negative balance converts to `CBK_STANDING_FACILITY` (CREDIT_CREATE).
- **Non-bank counterparty.** `CB_CREDIT` codes whose counterparty is not a bank (QE from a fund, 03 edge 16) use settlement cash 1001/2001 instead of reserves 1002/2002.
- **Two paths for QE and FX intervention.** They may instead trade through 05 as `MKT_TRADE` (TRANSFER). In that case 04 posts no CBK credit code, and the flow is a MOVE in ledger-core terms, not ISSUE_CB.
- **Interest is not CREDIT.** `CBK_FACILITY_INTEREST` (`03:851`) and `CBK_INTEREST_ON_RESERVES` (`03:850`) are TRANSFER (PAY); `CBK_PROFIT_REMITTANCE` (`03:852`) is TRANSFER. Per 24 §8, `CBK_IOR_P` and `CBK_DEPOSIT_INTEREST_P` are FAUCET (MINT) and the `_W` variants are TRANSFER.
- **How ledger-core counts them.** All ten codes are ISSUE_CB postings: they go into `TickFlows.cbCredit` and C_p/C_s (§2.5, §6.8), never into M0_sys. Per PD-9, `cbk` is system side but remains the issuer, so these postings are never MOVEs.

## E-4 PD-12 alias direction
- §6.11's code table lists `OPS_RANSOM` / `OPS_LOOT_CASH`. Per §11 PD-12, read these as `CONFLICT_RANSOM` / `CONFLICT_CASH_LOOT`.
- This inverts 24 §8's usual direction (the 03 code is canonical), so the 03 catalog row must be renamed and an alias added. Without that, `buildCatalog` reports `ALIAS_SHADOWS_CODE` (T03-05 `:76`). See `catalog.md`.

## E-5 Template set gap for Δ14
- `escrowPlace` (template `ESCROW_PLACE`) and `escrowSettle` (`ESCROW_SETTLE`) are new templates, and `CONTROL_RECLASS` (Δ9) is too. None of them is in `CLASS_TEMPLATES` (T03-02 `:47-48`).
- Implementers must add `ESCROW_PLACE` and `ESCROW_SETTLE` to TRANSFER and `CONTROL_RECLASS` to REVALUE. Otherwise INV-LED-002 rejects the entries.
- The catalog rows for `CONFLICT_*`, `ESCROW_CONFLICT_*` and `LED_CONTROL_*` / `LED_HOLDER_RECLASS` must list these templates.
- This follows from the frozen text and adds no new rule.

## E-6 T03-05 placeholder
`cards/03/T03-05.md:120` contains the unrendered `@@REG248@@`. See `catalog.md`.

## E-7 (renumbered from a duplicate E-6; 2026-10-20 23:55 CEST): §4 L4 / INV-LED-004 M2 wording
"ΔM2 − ΔM0 = ΣCREDIT_CREATE − ΣCREDIT_DESTROY" (copied from 20) fails binding 03#6 (interest −5e9: LHS −5e9, RHS 0) and 03#7 (QE +1e13: LHS 0, RHS +1e13). Read L4 as 03 §3.5.3 I4: ΔM0_cb = Σ CBK CREATE − DESTROY + cbk own-account; ΔM2 = Σ bank (BNK/REPO_BANK/PB) CREATE − DESTROY + ΔM0 held by non-banks + bank own-account flows (T03-11 step 7). Worked table: pr3-review.md.

## E-8: I17 net issuance must include sys:2909
ELASTIC_IN/OUT (03:450) books issuance against sys:2909:X, not 5900/4900, so I17 is `sys 3990+5900+4900 + Σ_X sys:2909:X = −sys:2900 = cbk:1910` per ccy, with `sys:2909:X = −X:1009` per sector. 1009/2909 may be touched only by ELASTIC_IN/OUT.

## Note on A-5 / F3 (2026-10-20 23:58 CEST, per Producer)
A-5/F3 uses the T03-05 step 8 rule exactly as the card states it. A supporting reason passes when its class's template set contains the entry's template, or when it is a TRANSFER `TAX_*` code inside a TRANSFER or SINK entry. There is no extra per-leg `legTemplate` check. The third branch of F3 in pr3-review.md is withdrawn.

## E-9 (2026-10-21 00:20 CEST): trade fees and taxes are TRANSFER into system treasuries (Producer ruling on PR #3)
**Ruling.** Trade fees and taxes keep their V3 class, TRANSFER (e.g. `MKT_EXCHANGE_FEE`, `TAX_SECURITIES_TX`). They post into system treasuries, and under Δ6-B (PD-8) `sysSide` shows them as **X_out**. F3 "branch 3" (per-leg `legTemplate`) is dropped, as already noted above. Spec tests 1 and 8 and the PR's 03#39 scenario change accordingly.

**Consistency check against Δ6-B: consistent.** X_out = MOVE from a holder ∉ S to a holder ∈ S (§6.8 `:448`). N = (F_p − K_p) + (X_in − X_out) + C_p (`:529`), so N drops by exactly X_out. The §6.8 worked example already books `TAX_SECURITIES_TX` and `MKT_EXCHANGE_FEE` as X_out (`:483-484`). INV-LED-019/016 then hold:
- ΔM0_player = −3,500,000;
- ΔΣ_S m = +3,500,000;
- ΔM0 = ΔM0_sys = 0.

**Test 8 as amended** (replaces §7 test 8 bullets; buyer P ∉ S, 1,000 FDL trade via `swapAsset` + `composeEntries`):
- Fee 2 FDL `MKT_EXCHANGE_FEE` to `exc_FDL`. Tax 1.5 FDL `TAX_SECURITIES_TX` to `gov_FDL`. Both are PAY legs.
- `byCode.MKT_EXCHANGE_FEE === 2_000_000n` and `byCode.TAX_SECURITIES_TX === 1_500_000n` (per-leg counting, PD-5).
- `byClass.SINK === 0n`, `byClass.FAUCET === 0n` and `m0sysDelta === 0n`.
- `byClass.TRANSFER === 1_003_500_000n`: trade 1e9 + fee + tax, each leg once, with no headline (PD-5). The amended text only says "SINK = 0", so add this line.
- `sysSide` X_out: `sink.MKT_EXCHANGE_FEE === 2_000_000n`, `sink.TAX_SECURITIES_TX === 1_500_000n`, X_out total `3_500_000n`.
- `netFlow` (N) is lower by 3_500_000n than the same trade without fee and tax; `byHolder.human.X_out === 3_500_000n`.
- `TreasuryBalance(gov_FDL)` rises by 1_500_000n and `exc_FDL` by 2_000_000n (INV-LED-016).

**Flags (things that are not automatic):**
1. **Fixture names.** "Fixture SINK codes become TRANSFER" cannot keep the names `SINK_TEST_FEE`/`SINK_TEST_TAX`: Δ1 (spec test 3) rejects a `SINK_` prefix on a TRANSFER code (`PREFIX_CLASS_MISMATCH`). Use the real V3 codes above, or rename to `TEST_FEE`/`TEST_TAX`.
2. **The fee counts as X_out only if the exchange is in S.** `exc` is in S only when its ultimate controller is not in PLAYER (§2.3 `:154`, PD-9). The fixture must use an NPC-controlled `exc_FDL`. If a player controls the venue, the fee is an intra/same-side MOVE: X_out = 1,500,000 (tax only), and N falls by 1.5 FDL, not 3.5.
3. **Legs must be PAY, not BURN.** With branch 3 gone, a SINK leg composed into a SWAP_ASSET entry fails INV-LED-002 (T03-05 step 8). The card rule admits TRANSFER supporting legs in a TRANSFER entry, and `TAX_*` explicitly.
4. **Test 1 driver.** The fast-check generator must stop composing BURN/SINK legs into TRANSFER entries, or every such run fails INV-LED-002. Sub-check (c) is unchanged. Fee/tax ticks now give `byClass.SINK === 0n` and contribute to `sysSide` only.
5. **03#39 is V3 binding text and stays verbatim.** Only the PR's scenario data changes. I18 is unaffected: fees and taxes are TRANSFER, which is in `flowsToday` by class with no M0_sys effect.
6. **Supersedes v0.4 wording.** Quant's v0.4 premise "trade fees and taxes are SINK legs" (changelog v0.4) is superseded. Consumers that read `byClass.SINK` for fee/tax pressure must read `sysSide.sink` / X_out instead. Producer should tell Quant.
7. **ledger-core v0.7 is frozen.** §7 test 8's literal text still says `SINK_TEST_*` and `m0sysDelta === −3_500_000n`. This erratum governs until v0.8.

## E-10: derived catalog rows (8): best-supported values
Written into catalog.csv v2; the `derived` column cites the sources. **C** = confirmed by V3 text; **P** = provisional.

| code | class / template | owner · requestableBy | legA / legB | sector · restrictedOk · cf | status |
|---|---|---|---|---|---|
| ACCT_BACKGROUND_DISCOUNT | FAUCET / MINT (C: 24:780; 14:448, 14:935) | 14 · 18 (P: 18 posts it via alias `ONBOARD_BG_REBATE`) | 4110 / – (P, sibling ACCT_START_CASH) | – · N · OP (P) | class C, rest P |
| BIZ_MARKETING_B2B | TRANSFER / PAY (C: 24:788) | 09 · – | 5050 / 4000 (P: BIZ_MARKETING payer leg + agency revenue) | – · N · OP; taxTag BIZ (P) | class C, rest P |
| CBK_IOR_P | FAUCET / MINT (C: 24:796; 04:700, 04:1070; T03-05:121) | 04 · – | 4020 / – (P: payee leg of CBK_INTEREST_ON_RESERVES, T03-04:178) | – · N · OP; tax INT | class C, legs P |
| CBK_IOR_W | TRANSFER / PAY (C: same) | 04 · – | 5090 / 4020 (P) | – · N · OP | class C, legs P |
| CBK_DEPOSIT_INTEREST_P | FAUCET / MINT (C: 04:1074; T03-05:121) | 04 · – | 4020 / – (P) | – · N · OP | class C, legs P. A negative rate is a separate SINK code 04 registers (04:1210) |
| CBK_DEPOSIT_INTEREST_W | TRANSFER / PAY (C) | 04 · – | 5090 / 4020 (P) | – · N · OP | class C, legs P |
| CONFLICT_RANSOM | TRANSFER / **ESCROW_PLACE** (C: 03:816 as OPS_RANSOM; 12:441-442; PD-12; Δ14) | 12 · – | 1070 / 2160 (P: victim claim / court escrow liability, 03:292,359) | – · N · OP · illicit Y (C: 03 §3.12.14) | class C, legs P |
| CONFLICT_CASH_LOOT | TRANSFER / **ESCROW_PLACE** (C: 03:815; 12:441-442) | 12 · – | 1070 / 2160 (P) | – · N · OP · illicit Y | class C, legs P |

Notes:
- **OPS_* P&L legs move to release.** The OPS_* P&L legs (ransom 5230/4190, loot 5140/4190; T03-04:143-144) now belong to `ESCROW_CONFLICT_RELEASE`: victim Dr 5230|5140 / Cr 1070, attacker cash / Cr 4190. That is when the loss and gain are realised (Δ14: the audit tag is applied on release).
- **Clawback** reverses 1070 against the victim's cash, with no P&L.
- **Escrow codes are absent from the catalog.** `ESCROW_CONFLICT_RELEASE/CLAWBACK` (owner 03, requestableBy 13 + 03's scheduler) are not in catalog.csv yet. They arrive with the 016–022 PR.
- **Restricted cash.** 21 lists no restricted-cash use for these 8 codes, and 03 §3.5.6 makes every unlisted code a forbidden purpose. So `restrictedOk = N` is confirmed for all 8.

## E-11: value-leg authority for SWAP_ASSET, ACCRUE, ACCRUE_PAIR, RECLASS
**V3 today.** Card legs are **defaults, overridable**:
- T03-07 step 2e: `legA/legB` come from `o.valueLegA/B`, else the catalog default; `@ASSET`/`@` without an override → `INV-LED-007 leg_missing`.
- T03-03:41 and T03-04:42: "Value legs per row are defaults; callers override with `PostOpts.valueLegA/valueLegB`".
- G7 (GLOBAL-CONTEXT:224, :228): `accrue(..., drAcct, crAcct)` and `reclass(..., fromAcct, toAcct)` take the legs as **required parameters**.
- T03-14:40 and T03-15:60,117 depend on overrides. `settleAccrual` posts PAY with A and B swapped, and ACCRUE_PAIR takes receivable/payable overrides.

So "catalog authoritative, never overridable" would break T03-14/15. Unlimited overrides, however, let any module book a code into arbitrary accounts, e.g. hiding a loss in equity. That is invisible to INV-LED-001..008 because the entry still balances.

**Recommended rule** (Systems ruling; a stricter refinement of T03-07 2e, so it needs Producer sign-off). Add a derived catalog column `legPolicy` per code and leg: `FIXED` | `REQUIRED` | `CLASS`.
1. **FIXED** (the catalog leg is a concrete account and the code is not listed under rule 3):
   - An override, or a `drAcct`/`crAcct`/`fromAcct`/`toAcct` argument, must equal the catalog leg. Otherwise the entry is invalid with `INV-LED-007 leg_mismatch observed=<given> expected=<catalog>`.
   - For ACCRUE/RECLASS the positional args are checked against the row in the same way.
2. **REQUIRED** (catalog leg `@ASSET` or `@`):
   - The caller must supply the leg, else `leg_missing` (as now).
   - `@ASSET` must be an asset-bearing account of the right side: holder 15xx–18xx, or issuer 2300/2310/2600/3100/3150. It must carry the `assetId` sub.
   - `@` must be a non-money account of the same entity: not a BMA, not 1009, not cbk 1910/2001-2003, not sys.
   - Applies to 17 SWAP_ASSET rows with `@ASSET/@ASSET`, MKT_TRADE, LED_MTM_DAILY, LED_RECLASS, LED_PERIOD_CLOSE and the like.
3. **CLASS** (the override set is declared by a card):
   - ACCRUE_PAIR: legA ∈ {1110, 1100}, legB ∈ {2520, 2540, 2510} (T03-07:92, T03-15:60).
   - Accrual settlement codes used by T03-15 `settleAccrual` may swap A and B.
   - Codes named by T03-14 (e.g. OCI to 3400) list their allowed set in the row.
   - Anything outside the set → `leg_mismatch`.
4. **Special codes.** `-`/`-` RECLASS codes (EQ_SPLIT, LED_DISSOLUTION) are QTY_ONLY. They take no value leg, and an override is rejected.
5. **INV-LED-006 still applies on top:** REVALUE (ACCRUE/RECLASS) never touches money accounts, except the LED_RECLASS restricted release.

Tests:
- `swapAsset(..., 'BNK_SECURITY_...', {valueLegA: 5000})` on a FIXED row → `leg_mismatch`.
- `accrue(e, x, 'FDL', 'LED_ACCRUAL', 1110, 4020)` passes; with `crAcct 3200` it fails.
- `swapAsset(..., 'MKT_TRADE')` with no `@ASSET` override → `leg_missing`; with `1001` → `leg_mismatch` (money account).
- `accruePair` with `valueLegB 2510` passes; with `2100` it fails.

## E-12: keeping CONFLICT_* off PAY (defence in depth)
An allow-list alone is not enough. It stops only a direct `pay(..., 'CONFLICT_RANSOM')`. It does not stop:
- (i) the same victim → attacker cash move posted under a different TRANSFER code (e.g. `SOC_P2P` or a B2B code), which needs the owner and requester checks plus 12's op gating;
- (ii) a supporting leg using CONFLICT_* inside a composed TRANSFER entry, which the T03-05 step 8 card rule *allows*, because TRANSFER's template set contains PAY;
- (iii) a later catalog extension re-adding PAY.

Four layers:
1. **Template allow-list.** `CONFLICT_*.allowedTemplates = ['ESCROW_PLACE']` (catalog v2). Also exclude CONFLICT_* from the step 8 supporting-leg rule: an `ESCROW_ONLY_CODES` set may never appear as a supporting reason. `registerReasonCodes` rejects any extension that adds a template to an escrow-only code.
2. **Owner and requester.** CONFLICT_* `requestableBy = '-'`, so only module 12 may request it. `ESCROW_CONFLICT_RELEASE/CLAWBACK` are requestable only by 13 and 03's scheduler. A request from any other module is an invalid entry (INV-LED-002 owner check, as for MINT/ACCT_START_CASH).
3. **INV-LED-022 (b), widened** (TICK, FATAL). Only ESCROW_PLACE/ESCROW_SETTLE entries may post to `crt:1001:ESCROW:*`, `crt:2160:<escrowId>` or `<victim>:1070:<escrowId>`. Every CONFLICT_* posting must carry a live `escrowId` that has a `led.escrow` row with a matching victim and amount. Separately, holds and the rail exclude these accounts (INV-LED-022 (c)).
4. **Audit linkage.** Every CONFLICT_* entry references a SEALED `ops.loot_posted` / C03 op id (12 `:592`). A CONFLICT_* entry without an op ref fails INV-LED-002.

Tests (spec §7 follow-up suite):
- (a) `pay(victim, attacker, x, 'FDL', 'CONFLICT_RANSOM')` → invalid (template).
- (b) module 09 calling `escrowPlace(..., 'CONFLICT_RANSOM')` → invalid (owner).
- (c) a composed SWAP_ASSET entry with a CONFLICT_CASH_LOOT supporting PAY leg → invalid (escrow-only).
- (d) a hand-built posting `Dr crt:1001:ESCROW:e1` under `SOC_P2P` → INV-LED-022 FATAL, and the tick aborts with nothing applied.
- (e) `registerReasonCodes(12, 'TRANSFER', [{code:'CONFLICT_RANSOM', allowedTemplates:['PAY']}])` → `NAME_TAKEN`; an attempt to extend the templates → rejected.
- (f) the happy path `escrowPlace` by 12 with an op ref passes, and release at `expiresTick` is posted by the scheduler.

## E-11 status (2026-10-21 00:30 CEST)
Producer signed off E-11. Per-code policies are in `legpolicy.csv`, generated by `gen_legpolicy.py` from catalog.csv v2 and card call sites in `cards/T03-03,07,14,15.md`. The run summary is in `gen_legpolicy.out`. There are 4 policies:
- `FIXED`: the leg must equal the catalog account.
- `REQUIRED`: the caller supplies the leg, within the stated set.
- `CLASS`: the leg must be in the card-declared set.
- `NONE`: no value leg; any override is rejected.

For ACCRUE/ACCRUE_PAIR the check applies to the (dr, cr) the caller passes, before the negative-amount swap (T03-07:76).

## E-13 (2026-10-21 00:30 CEST): dynasty holding companies are npcRival (PD-14, confirmed by Quant); rival sub-tags
**Ruling.** PD-14 (ledger-core §11 `:778`) is confirmed. This closes v0.7 open question 4 (`:710`). `npcRival` (Δ13, `:540`) now covers:
- **rival.fund:** NPC rival funds (`fnd` whose controller holds the 16 `FUND_PRINCIPAL` role; 16:335 "+30 funds, the NPC rival funds of L13") and every entity they ultimately control.
- **rival.dynasty:** dynasty holding companies, i.e. the `cmp`s in `Dynasty.holdingCmpIds` (16:113, "private holding companies (09), possibly layered through shells"; 16 §3.4.1 :403, "Each dynasty owns 1–3 private holding companies…, with 1–3 nominee shell layers"), the 16 cast row `DYNASTY_MEMBER … holding cmps` (16:341), and every entity they ultimately control. That includes nominee shells and any listed or private company where the holding has *control* per T03-16.

A dynasty's mere stake of 5–40% (16:403) does not move the investee: it stays `npcFirm` unless T03-16 control is reached.

**Sub-tag (cheap, no new scan).**
```ts
export type RivalTag = 'rival.fund' | 'rival.dynasty';
// TickFlows (per ccy) and FlowDayArchive (per ccy per day, archive option B), next to byHolder:
byRivalTag: SortedMap<RivalTag, HolderTerms>;   // both keys always present (0n if none)
// HolderTerms gains two optional-zero fields, used only inside byRivalTag:
//   subIntraIn, subIntraOut: Money      MOVE between a rival.fund holder and a rival.dynasty holder (same class, so not intra at class level)
//   subReclassIn, subReclassOut: Money  LED_HOLDER_RECLASS between the two tags (entity stays npcRival)
```
- **Same P13 determination as the class (Δ10, ledger-core `:543-548`).** At P13 of tick t, from committed state, in sorted entity-id order, take each npcRival entity's **ultimate controller root** (T03-16 chain; ties → lowest controller id).
  - If the root is a dynasty holding `cmp` (or a `DYNASTY_MEMBER` actor), the tag is `rival.dynasty`.
  - If the root is a `fnd` under a `FUND_PRINCIPAL`, the tag is `rival.fund`.
  - When both sit on one chain, **the root decides**. A dynasty holding that controls a rival fund makes the fund `rival.dynasty`, and vice versa.
  - The tag is in force for flows from t+1, cached per entity with the class. On the posting path it costs one extra cached lookup per BMA posting of an npcRival holder.
  - The registry inputs are 16's committed `Dynasty.holdingCmpIds` and the actor-role registry, read at P13, like the `FUND_PRINCIPAL` role today.
- **Tag change inside npcRival** (succession sale, fund bought by a dynasty) emits `LED_HOLDER_RECLASS` (MEMO, no M0 effect) with `subReclassOut` on the old tag and `subReclassIn` on the new, at m(e) at the end of tick t. It is net 0 at class level.
- **Class change into or out of npcRival** uses the existing class reclass terms, booked to the entity's (new or old) tag.

**INV-LED-023 (proposed L24; TICK and archived day, FATAL), exact bigint, per ccy:**
- (a) For every bucket b ∈ {F_p, K_p, X_in, X_out, C_p, controlIn, controlOut, intraIn, intraOut, reclassIn, reclassOut, netFlow, m0Delta}: `byRivalTag['rival.fund'].b + byRivalTag['rival.dynasty'].b === byHolder.npcRival.b`.
- (b) `Σ_tag (subIntraIn − subIntraOut) === 0n` and `Σ_tag (subReclassIn − subReclassOut) === 0n`.
- (c) Per tag, the balance identity closes: `m0Delta = (F_p − K_p) + (X_in − X_out) + C_p + (intraIn − intraOut) + (subIntraIn − subIntraOut) + (reclassIn − reclassOut) + (subReclassIn − subReclassOut) − (controlIn − controlOut)`, matching the class identity of INV-LED-021.
- (d) FlowDayArchive: each tag's day row equals the Σ of its TickFlows rows (as INV-LED-017).

**Tests (follow-up suite, with spec tests 9–25):**
1. Two holders: a rival fund R (FUND_PRINCIPAL) and a dynasty holding H.
   - Mint 7 to R gives F_p: rival.fund 7, rival.dynasty 0, npcRival 7.
   - H pays gov 3 gives X_out rival.dynasty 3.
   - R pays H 2 gives subIntraOut(fund) 2 and subIntraIn(dynasty) 2, class intra 0, N unchanged.
   - (a)–(c) hold exactly.
2. H buys control of R at tick t. R's tick-t flows stay rival.fund. A `LED_HOLDER_RECLASS` with subReclass fund→dynasty is posted at m(R). From t+1, R is rival.dynasty, and the npcRival totals don't move.
3. A dynasty 20% stake in an NPC listed company: the company stays npcFirm.
4. A shell layer under H is tagged rival.dynasty, determined in sorted id order. The same result comes regardless of insertion order (G8).
5. Archive: the day rows of both tags sum to the npcRival day row, and each equals the Σ of its ticks.

**Notes.**
- ledger-core v0.7 is frozen; this erratum governs until v0.8.
- Sub-tags are a reporting split only. Controllers keep using N and the class terms (Δ12). Quant may read `byRivalTag` for diagnostics.
- If 16 later adds other NPC rival kinds, add a tag. INV-LED-023 then becomes Σ over all tags.


## E-14 (2026-10-21): entity-to-entity settlement codes for accrual kinds (Producer-requested; owner modules 09/10/14)

All rows: class TRANSFER, template PAY, restrictedOk N, requestableBy engine/owner module. Each code is used for immediate payment (catalog legs) or for `settleAccrual` (swapped pair from T03-15:77, Dr payable / Cr receivable). legPolicy is CLASS = {catalog leg} plus {swapped leg}.

| code | owner | kind | legA / legB | settlement pair (b payable / a receivable) |
|---|---|---|---|---|
| `BIZ_WAGES_B2E` | 09 | WAGES | 5010 / 4190 | 2510 / 1100 |
| `BIZ_UPKEEP_B2B` | 09 | UPKEEP | 5040 / 4000 | 2520 / 1100 |
| `PROP_UPKEEP_B2B` | 10 | UPKEEP | 5040 / 4000 | 2520 / 1100 |
| `LIFE_UPKEEP_B2B` | 14 | UPKEEP | 5200 / 4000 | 2520 / 1100 |
| `BIZ_SUBSCRIPTION_B2B` | 09 | SUBSCRIPTION | 5080 / 4040 | 2520 / 1100 |
| `LIFE_SUBSCRIPTION_B2B` | 14 | SUBSCRIPTION | 5080 / 4040 | 2520 / 1100 |
| `BIZ_SERVICE_FEE_B2B` | 09 | FEE | 5080 / 4040 | 2520 / 1100 |
| `PROP_RENT_CORE` (existing) | 10 | RENT | 5020 / 4010 | 2540 / 1100 (legPolicy FIXED becomes CLASS) |

**SETTLEMENT_CODES table** (`registerAccrual` rejects anything else with `LED_NO_SETTLEMENT_CODE`): RENT: PROP_RENT_CORE. WAGES: BIZ_WAGES_B2E. UPKEEP: BIZ_UPKEEP_B2B, PROP_UPKEEP_B2B, LIFE_UPKEEP_B2B (the accrual's owner module picks one). SUBSCRIPTION: BIZ_SUBSCRIPTION_B2B, LIFE_SUBSCRIPTION_B2B. FEE: BIZ_SERVICE_FEE_B2B. INTEREST keeps BNK_LOAN_INTEREST, CMP_INTERCOMPANY_INTEREST and SOC_LOAN_P2P_INTEREST. A settlement code must match the accrual's kind and owner module; anything else rejects.

**Elastic codes stay non-settling.** BIZ_WAGES, BIZ_UPKEEP, PROP_UPKEEP, LIFE_UPKEEP and ACCT_TERMINAL_SUBSCRIPTION pay households or NPC vendors through elastic or burn templates and settle immediately, with no accrual.

**Invariants.** INV-LED-024 (L25): per accrualId, receivable + payable = 0 at all times; settled amount ≤ accrued; settlement code is in SETTLEMENT_CODES[kind]. All rows are TRANSFER, so FAUCET, SINK and M0_sys don't change. N moves only through X_in/X_out when one side is sysSide (INV-LED-019 unchanged).

**Exploit analysis.**
- Wash wages or fees to a linked alt: TRANSFER creates no money. The 15 §3.12 link-group rules apply as for any PAY. A payment that dodges the Fresh Start garnish routes through the same garnish hook as PAY.
- Inflated accrual to drain a counterparty: the accrual is created only by the owner module's contract, never by player input; settlement is clamped by min().
- Code shopping (settling WAGES under a FEE code to change taxTag): rejected by the kind check.

**Tests.** (1) WAGES accrual settled by BIZ_WAGES_B2E clears 2510/1100 and passes legPolicy. (2) Settling WAGES with BIZ_SERVICE_FEE_B2B rejects. (3) Settling with elastic BIZ_WAGES rejects. (4) Registering an accrual kind with no code rejects LED_NO_SETTLEMENT_CODE. (5) Over-settlement is clamped, and INV-LED-024 holds. (6) Immediate PAY under each code uses its catalog legs; a swapped leg without an accrual rejects.

The catalog is now v3 (399 rows); v2 is kept as catalog.v2.csv. legpolicy.csv has 399 rows; v1 is kept. gen_legpolicy.py does not yet emit E-14 rows (they were appended by hand), so fold them in before the next regeneration.

## E-15 (2026-10-21): counterparty-kind policy for codes, and registered-entity invariant (Producer-requested after QA probe N1)

### 15.1 Rule: a code must match its counterparty kinds (needed)
Why we need it: X_in/X_out, sysSide and byCode feed Quant's pressure readings and the tax and audit views. With no kind check, a payment to `gov_` filed as `MKT_TRADE` hides a tax inside trade volume (N1) and moves it to a different taxTag. The balance identities still close, so no current invariant catches this.

New `cpPolicy` per code (generated, like legPolicy): the allowed entity kinds for the payer and the payee. Entity kind is the id prefix (`chr`, `frm`, `fnd`, `bnk`, `cbk`, `gov`, `exc`, `ccp`, `reg`, `crt`, `npc`/rival, `sys`). Defaults by family:
- Codes `TAX_*`, `FINE_*`, court and regulator levies: payee ∈ {gov, reg, crt}.
- Codes `MAC_*` (gov transfers), gov wages and contracts (PD-13): payer = gov.
- Codes `CBK_*`: one side = cbk.
- Codes `MKT_TRADE` and other SWAP_ASSET trade codes: both sides ∈ {chr, frm, fnd, bnk, npc}. Never gov, cbk, reg, crt or sys.
- Exchange and clearing fees (`MKT_*_FEE`, `CCP_FEE`): payee ∈ {exc, ccp}.
- Every other PAY/TRANSFER code: payee and payer ∉ {gov, cbk, reg, crt, sys} unless the owner module lists them.
A violation rejects with INV-LED-025 (L26), `cp_kind_mismatch`, in the template prologue, after legPolicy. Exemption: system-side treasury moves already have their own codes (e.g. `CBK_PROFIT_REMITTANCE`).
Not covered (no rule needed): choosing between two codes that both fit, e.g. two fee codes to `exc`. That's a module's choice, and the class and identity results are the same.

### 15.2 INV-LED-026 (L27): every posting's entity is registered
Every leg's entity id must exist in the world's entity registry at the posting tick, with status ≠ DISSOLVED (exception: the LED_DISSOLUTION entry itself). Checked at posting and re-checked at P13 commit. Reject: `unknown_entity`. Closes ghost-account minting and posting to typo'd ids.

### 15.3 Record: INV-LED-004 exemption is amount-based (per Producer)
The exemption covers only the M2 equal to the non-bank cash that the group's rail postings move to or from bnk, cbk or gov entities. Any other M2 change still fails INV-LED-004.

### Tests
1. QA N1: a tax-shaped payment to `gov_FDL` filed as `MKT_TRADE` rejects with `cp_kind_mismatch`; filed as `TAX_SECURITIES_TX` it passes.
2. `MKT_EXCHANGE_FEE` to a `chr`-controlled exchange passes (the kind is still `exc`).
3. `MAC_GOV_TRANSFER_CORE` paid from a `frm` rejects.
4. A posting to an unregistered id rejects with `unknown_entity`; a posting to a DISSOLVED entity rejects; LED_DISSOLUTION passes.
5. INV-LED-004: a rail posting to bnk passes exactly; adding 1 micro of other M2 fails.

## E-16 (2026-10-21): ccp is an exempt counterparty kind for the INV-LED-004 amount rule

Ruling: confirmed. Add `ccp` to the exempt kinds {bnk, cbk, gov}. The clearing house is in S (Δ-6B; it is never player-controlled), and it holds cash as 1002 reserves outside M2, exactly like gov and cbk. Moving the fee elsewhere would misstate where the cash sits, so CCP_FEE keeps posting into ccp 1002.
The amount rule is unchanged: only the M2 equal to the non-bank cash a group's rail postings move to or from bnk, cbk, gov or ccp is exempt.
`exc` is NOT exempt. Exchanges can be player-controlled (test 10); their fee cash stays inside M2, so nothing needs exempting.
Effect of a CCP_FEE f paid by a player:
- class TRANSFER; byClass.SINK and M0_sys unchanged (m0sysDelta 0); total M0 unchanged;
- X_out += f; N falls by f; M0_player falls by f; TreasuryBalance(ccp) rises by f;
- M2 falls by exactly f, exempt; any other M2 change in the group still fails INV-LED-004.
The reverse direction (ccp refunds or pays out a default fund) is also exempt: X_in += f and M2 rises by f.
Tests: (1) spec test 21 §6.8: CCP fee posts; M2 −f exempt; X_out = f. (2) CCP_FEE plus 1 micro of stray M2 fails INV-LED-004. (3) Fee to a chr-controlled exc: M2 unchanged and no exemption used. (4) A ccp refund to a player: X_in = f, M2 +f exempt.

## E-17 (2026-10-21): inter-bank reserve settlement (QA probe I1, Engine Dev request)

Ruling: yes, the rule is needed. When a deposit moves from bank A to bank B and only the 2100 deposit legs move, B has created a deposit with no reserves behind it. That is bank-money creation without a LEND (CREDIT_CREATE) entry: every existing check still closes, while A keeps reserves for a liability it no longer has. The cash rail must carry reserves along with the deposit.

**INV-LED-027 (L28), reserve-follows-deposit.** For every posting group g (one entry and its supporting legs) whose class is TRANSFER, FAUCET or SINK, and for every bank b and currency:
  Δ1002(b) in g = Δ2100(b) in g, counting only deposits held by non-bank entities, with both sides signed as balances,
and Σ_b Δ1002(b) in g = Δ2002(cbk) mirror in g, with no reserves created or lost.
Exempt groups, where a bank's deposits move against its own balance sheet rather than its reserves: CREDIT_CREATE and CREDIT_DESTROY (LEND, REPAY, bank-credit), and bank-income or expense codes where b itself is payer or payee (fees, interest, wages). There the counter-leg is b's 4xxx/5xxx or loan book; INV-LED-004 already covers M2 for these. cbCredit and other cbk operations stay governed by E-3 and INV-LED-010 I5.
Same-bank moves (A and B at one bank): Δ2100(b) = 0 and Δ1002(b) = 0, so the rule passes trivially.
**When it's checked:** per group at tick, in the P13 commit. It is structural, like INV-LED-004, and a mismatch rejects the whole group. The day-close check (DC-010, I5/I6) re-sums per bank: Σ 1002 over banks = cbk 2002 total, and each bank's 2100 = Σ its holders' 1010.
**Tests.**
1. chr_A at bnk_1 pays chr_B at bnk_2 7 FDL: 2100 −7/+7, 1002 −7/+7, 2002 mirror; passes.
2. The same payment with the 1002 legs dropped (probe I1): fails INV-LED-027 at tick.
3. 1002 moved for the wrong amount (−7 / +6): fails.
4. A same-bank payment: no 1002 legs, passes; adding a stray 1002 leg fails.
5. A LEND from bnk_2 to chr_B (+2100, no reserve move): exempt, passes.
6. A bnk_1 fee charged to chr_A (2100 −f, 4xxx +f): exempt, passes.
7. Day close: Σ 1002 = cbk 2002 for every currency; seeding a 1-micro mismatch fails DC.

**E-17 corrections (2026-10-21, confirming Engine Dev's PR #6 readings):** (1) the reserve mirror is cbk 2002 (03:351); 2003 is the treasury. (2) A bank's 2100 equals its holders' 1010 deposits, not 1001. (3) In debit-positive raw balances the rule reads Δ1002(b) + Δ2100(b) = 0; 'equal' above meant equal as balances. (4) ccp 1002 counts in Σ1002 = cbk 2002 (2002 is owed to bnk and ccp) but not in the per-bank check, since a ccp has no 2100. (5) A mismatch takes the fatal path, like INV-LED-004.

## E-18 (2026-10-21): PR #6 rulings on INV-LED-027 scope, cbk legs, reserve seeding, ids, TAX self-pay

1. **The bank-own exemption goes by code list, not leg shape** (Producer, agreed). A bank's own 4xxx/5xxx leg under a non-bank code (e.g. MKT_TRADE with 4190/5280) gets no INV-027 exemption. The exempt list (confirmed): BNK_* interest, fee and insurance codes; BNK_OPEX_ELASTIC; BIZ_WAGES and BIZ_WAGES_B2E. Each applies only when the group's bank b is itself payer or payee. A listed code between two non-banks gets no exemption.
2. **Groups where cbk books its own leg** (FX_SPOT, E-3, I5): exempt from the per-bank equality Δ1002(b) + Δ2100(b) = 0 only. They must still satisfy Σ Δ1002 = Δ cbk 2002 in the group, so reserves can't appear without the mirror.
3. **Reserve seeding goes through cbCredit**: intended. Reserves are base money owed by cbk (2002), and only cbk operations may create them. A direct mint into 1002 skips the mirror and must fail. Test 21 seeding through cbCredit is correct.
4. **Entity ids** (Producer): `^(?:[a-z]{3}|hh|prop)_[A-Za-z0-9_]+$`. hh and prop keep their names. This supersedes the earlier `[a-z]{3}`-only regex.
5. **TAX_* where payer equals payee**: rejected through cpPolicy with reject code `cp_self_pay` (INV-LED-025; a more specific code than `cp_kind_mismatch`, so tests can tell the two apart) (Producer, agreed).
6. **An INV-027 mismatch is fatal** (aborts the tick, the same path as INV-004), not a group reject. Postings are engine-composed and never player-supplied legs, so a mismatch is a ledger bug, and continuing would commit an unbacked deposit.
Tests: an MKT_TRADE bank-own leg with a deposit move but no reserve move is fatal; BNK_LOAN_FEE charged by b passes; BIZ_WAGES_B2E chr→chr across banks with no 1002 move is fatal; FX_SPOT with cbk passes, but the same with a 1-micro 2002 mismatch is fatal; a mint into bnk 1002 is fatal; cbCredit seeding passes; the ids `hh_X` and `prop_1` pass while `Hh_X` and `xy_1` reject; TAX_* gov→gov is rejected.

**E-18 addendum (2026-10-21):** BNK_FX_MARGIN, BNK_ENFORCEMENT_FEE and BNK_ELASTIC_FEES join the INV-027 bank-own exempt list. Each one is bank income (5080/4040), and the same condition applies: the group's bank must be the payee.

## E-19 (2026-10-21): narrow the cbk-own exemption from E-18 (2) (QA probe f2)

Not intended. E-18 (2) skipped the per-bank check for the whole group, so an unbacked inter-bank deposit move could ride along with an FX_SPOT. Replacement rule: no bank is skipped. The cbk's own legs are netted out instead:
  for every bank b in a group with a cbk-own leg: Δ1002(b) − Δ1002_cbk(b) + Δ2100(b) = 0 (debit-positive),
where Δ1002_cbk(b) is the 1002 movement of b in postings whose other side is cbk (the reserve leg of cbk's own trade). Σ Δ1002 = Δ cbk 2002 still holds for the group. Banks not touched by a cbk leg get the plain E-17 rule. The cbk legs are identified from the postings (cbk entity on the counter side of a 1002/2002 pair), never from entry.meta. A mismatch is fatal (E-18 (6)).
Why not "at most one bank": a legitimate cbk operation may touch several banks (e.g. an FX auction), and netting is exact for any number.
Tests: (1) a clean FX_SPOT with bnk_1 passes. (2) Probe f2, FX_SPOT plus an unbacked bnk_1→bnk_2 deposit move, is fatal. (3) The same move riding on bnk_1, the cbk counterparty bank, is still fatal. (4) An FX_SPOT with two banks, each with its own cbk leg, passes. (5) A forged meta naming cbk with no cbk posting gets no netting and is fatal.

## E-20 — Entity id length cap (amends E-18 (4))
Entity ids MUST match `^(?:[a-z]{3}|hh|prop)_[A-Za-z0-9_]+$` AND have length ≤ 64 chars (ASCII, so bytes = chars). Violations reject with `unknown_entity` at registration and at posting (INV-LED-026).
Tests: (1) 64-char id registers OK; (2) 65-char id rejects at registration; (3) posting referencing a 65-char id rejects unknown_entity.

## E-21 (2026-10-21): unit 14A rulings (Producer): code ownership, restricted license fee, new 14 fee codes, garnish rate, INV-CHR family
1. **ACCT_LICENSE_FEE restrictedOk = N** (was Y). 14 §4 owns the rule: license fees are never paid from restricted cash. The rail no longer draws restricted lots for this code, and a hold that only restricted cash could cover fails with `LED_RESTRICTED_FUNDS`. INV-CHR-006 is kept as a second guard. catalog.md's restrictedOk = Y list drops to 34 codes.
2. **comeback_garnish_rate default 0.30** (was 0.25). Changed in 23 (registry row), 03 §3.14.5, 03 AT 31, 24 D048 and _notes/03, plus card T03-26 (title, step 7 and the worked examples: a $400 dividend garnishes $120, an $80 gain garnishes $24). This matches 14 §3.13.2 and the owner decision. The range stays 0.05–0.75.
3. **Code ownership follows 14 §3.17.** ACCT_LICENSE_FEE owner 13 → 14, ACCT_ONBOARD_GRANT owner 18 → 14. 18 still triggers the grant (message `acct.onboard.lic1`), and 14 posts it. ACCT_CHARTER_FEE stays owner 13 (not in 14 §3.17; 13 posts it).
4. **New codes** (catalog v4, 401 rows; legpolicy 401 rows):
   - ACCT_HANDLE_FEE: SINK, BURN, legA 5250 FIXED, family S6, restrictedOk N, owner 14. The $1,000 real × MSI handle change (14 §3.1.3).
   - ACCT_HOME_CITY_FEE: SINK, BURN, legA 5250 FIXED, family S6, restrictedOk N, owner 14. The $25,000 real × MSI home city change (14 §3.1.5).
   - Both also count as forbidden-purpose fees under INV-CHR-006.
5. **Missing 14A param keys** get registry rows, with values that Quant supplies (the spec numbers are the defaults until then): rank_r1..r5_threshold_real, license_fee_lic2..4_real, license_lic1_fee_real, license_renewal_share, protection_real_hours, rookie_zone_real_days, rookie_zone_nw_real.
6. **PENDING Quant:** the Fresh Start amount (fresh_start_cash_real, top-up semantics) and whether start cash is MSI-scaled (T14A-09, T14A-03).
7. **Linked Fresh Start cooldown is inert until 15 exists.** Without 15's `linkedCharactersOf`, the cluster is the character alone (AC-14A-09-INERT). 14A needs no code change when 15 lands.
8. **INV-CHR-001..010 added to 20 §3.1** (owner 14, TICK, FATAL) and to the 20 registration acceptance list (INV-PRG-001..002, INV-CHR-001..010, …).
Backups: catalog.v3.csv, legpolicy.v2.csv, catalog.md.pre-E21.bak, errata.pre-E21.bak (here); the spec and card originals are in /workspace/specs/backups/E-21/.
Tests:
(1) An ACCT_LICENSE_FEE burn from a character with only restricted cash fails LED_RESTRICTED_FUNDS. With $15k unrestricted and $10k restricted it passes, and the lot is unchanged.
(2) ACCT_HANDLE_FEE and ACCT_HOME_CITY_FEE validate as BURN 5250. A PAY using either code is rejected (template), and drawing a restricted lot with either fails INV-CHR-006.
(3) The catalog owner of ACCT_LICENSE_FEE and ACCT_ONBOARD_GRANT is 14. A posting of either from module 18 fails the owner-module check.
(4) After a personal insolvency, with comeback_garnish_rate at its default, a $400 dividend garnishes $120 (120_000_000n).
(5) AC-14A-09-INERT: with no 15 links, two would-be alts each get a Fresh Start grant 10 real days apart, and INV-CHR-005 passes. With the linkedPair fixture, the second gets FLOOR_ONLY.
(6) Every INV-CHR-001..010 has a negative test (14A cards).

### E-21 addendum (Quant, 2026-10-21): rulings on items 5 and 6 (start cash, Fresh Start, 14A param values)
Money is FDL micro (`MONEY_SCALE = 1_000_000n`). "Real" means MSI 1.0 (14:26). Nominal = `realToNominal(real, msiPpm)` (T14A-02). 1 GD = 1 real hour; a game year (GY) is 364 GD (262,080 ticks).

**(a) Start cash and Fresh Start: MSI-scaled. Item 6 is closed.**
1. **What MSI is** (03 §3.8, 03:1088-1102):
   - `MSI = clamp(ema(PEM/design_money)/ema_base, ±0.5% per GD)`, where `design_money = 0.20 · Σ W_target(age_i)`.
   - The ema half-life is 28 GD. MSI is fixed at 1.000 for the first 168 GD, then moves at most 0.5% per GD, so it can reach 2.671 at GD 365.
   - MSI measures player money relative to the designed path. Every 14 threshold and fee is real × MSI (14:26, §3.3.1).
2. **Ruling.**
   - `ACCT_START_CASH = realToNominal(5_000_000_000n, msiPpm)`.
   - Fresh Start: `ACCT_FRESH_START = max(0, realToNominal(5_000_000_000n, msiPpm) − liquid money)`, as restricted cash. This is a top-up, following 03 §3.14.5 and catalog row 6. 14 §3.13.2's "grant $5,000 × MSI" is read as the cap.
   - 00 §5.9's "$5,000" is a real-dollar amount under 14:26. The two sources agree once 00 is read that way. Add "(real, × MSI)" to 00 §5.9 at v0.8.
3. **Reasons.**
   - Rank thresholds are compared in real terms (14 §3.2.1, ÷MSI), and fees are charged real × MSI. A flat nominal $5k gives a GD-365 joiner only $5,000/MSI real against the same real ladder.
   - A real-constant faucet per character matches `design_money`, which counts every character's W_target.
4. **Evidence.**
   - Sources:
     - p10 engine plus world bots (`scripts/balance/wealth.ts bot`): 15 runs, 5 styles × seeds wealth-1..3, 240 GD.
     - MSI paths: 0, the 0.29%/GD measured by p10 `economy.ts` (supply 1.295B at GD 28 → 2.294B at GD 224, sinkMult stuck at 1), and the 0.5%/GD cap.
   - Method: time to R1 is the first 8-GD checkpoint where the bot's NW, scaled linearly by start cash, is at least 20,000 × MSI(J+t).

| MSI drift after GD 168 | join GD J | MSI(J) | flat $5k, real value | ×MSI, nominal | median GD to R1, flat | median GD to R1, ×MSI | real faucet per joiner, flat / ×MSI |
|---|---|---|---|---|---|---|---|
| 0 | 0 / 180 / 365 | 1.000 | $5,000 | $5,000 | 40 | 40 | $5,000 / $5,000 |
| 0.29%/GD | 180 | 1.035 | $4,829 | $5,177 | 56 | 56 | $4,829 / $5,000 |
| 0.29%/GD | 365 | 1.769 | $2,826 | $8,846 | 80 | 56 | $2,826 / $5,000 |
| 0.5%/GD (cap) | 180 | 1.062 | $4,710 | $5,308 | 56 | 56 | $4,710 / $5,000 |
| 0.5%/GD (cap) | 365 | 2.671 | $1,872 | $13,356 | 88 | 56 | $1,872 / $5,000 |

   - **Rent at $5.40/GD real** ($1,966/GY, 39% of start cash per GY): ×MSI start cash always covers 926 GD of rent. Flat start cash covers 524 GD at MSI 1.769 and 347 GD at MSI 2.671.
   - **Market prices:** GX median across 6 seeds (gameConfig) is 1000 / 1028 / 1154 / 1418 at GD 0 / 180 / 365 / 545. The p10 engine does not index asset prices to MSI, so ×MSI start cash buys 7.67 GX units at GD 365 against 5.00 at GD 0. That would be a late-joiner bonus in the sim, but not in the live game, where MSI > 1 means more money chasing the same assets.
   - **Faucet:** ×MSI keeps the real faucet constant at 5_000_000_000n per character, i.e. 5,000,000,000 × MSI nominal micro. Flat shrinks it to 2,826 real at MSI 1.769, which pushes late cohorts below the designed path.
5. **Tests.**
   - At MSI 1.0, `ACCT_START_CASH = 5_000_000_000n`.
   - At msiPpm 1_769_000n it is 8_845_000_000n.
   - A Fresh Start with $1,200 liquid at MSI 1.25 mints 5_050_000_000n (6_250_000_000n − 1_200_000_000n).
   - A Fresh Start with liquid money at or above the cap mints 0 and posts nothing.

**(b) Item 5 values: the spec numbers are confirmed as defaults.**
Measured wealth distribution, NW in nominal $ at MSI 1, across the 15 bot runs:

| GD | p10 | p25 | p50 | p75 | p90 |
|---|---|---|---|---|---|
| 8 | 6,739 | 6,781 | 7,067 | 7,311 | 7,585 |
| 24 | 4,964 | 6,109 | 8,446 | 14,774 | 17,221 |
| 40 | 6,673 | 8,797 | 20,583 | 21,568 | 26,299 |
| 56 | 11,282 | 12,825 | 28,610 | 32,073 | 47,672 |
| 80 | 16,318 | 17,143 | 64,942 | 81,069 | 139,178 |
| 112 | 21,759 | 22,420 | 193,332 | 258,184 | 397,859 |
| 168 | 28,479 | 29,333 | 565,043 | 718,244 | 1,691,936 |
| 240 | 48,740 | 52,724 | 1,757,544 | 2,869,621 | 6,851,497 |

First GD each rank was reached, by style (3 seeds each):

| Style | R1 | R2 | R3 |
|---|---|---|---|
| excellent | 26–28 | 81–97 | 209–223 |
| average | 35–37 | 109–113 | — |
| managed | 39–40 | 124–126 | — |
| casual | 103–105 | — | — |
| neglected | 101–103 | — | — |

**Rank thresholds** (registry keys `rank_r1..r5_threshold_real`). These are economically consistent. (The PENDING Avalon Designer mark was closed by the E-21 rank note below; R4 and R5 are PROVISIONAL until Quant's sim.)

| Key | Value (micro) | Reasoning |
|---|---|---|
| r1 | 20_000_000_000n ($20k) | 4× start cash. Active styles reach it in 26–40 GD; the target (14 §3.2.7) is real day 1–2 = 24–48 GD. Passive styles take 101–105 GD, so the target holds for engaged players only. |
| r2 | 250_000_000_000n ($250k) | Median active player at 109–126 GD against a target of ~day 5 = 120 GD; the top style at 81–97 GD against ~day 2 = 48 GD (slower than target). |
| r3 | 5_000_000_000_000n ($5M) | Top style at 209–223 GD against ~day 7 = 168 GD (about 30% slow). The median is 1.76M at GD 240 and grew 3.1× over GD 168→240, which fits the ~day 12 = 288 GD target. |
| r4 | 100_000_000_000_000n ($100M) | Beyond the 240-GD sim horizon; not verified. |
| r5 | 2_000_000_000_000_000n ($2B) | Beyond the 240-GD sim horizon; not verified. |

Flag for Designer: p10 code (`src/content/lifestyle.ts:19-26`) differs from 14 §3.2.2. It names R3 "Operator" and R4 "Mogul", and sets an R6 threshold of $50B against the spec floor `rank_r6_floor_real` of $20B.

**License fees** (`license_lic1_fee_real`, `license_fee_lic2..4_real`, `license_renewal_share`):
- **LIC1:** 250_000_000n, paid by the $250 ACCT_ONBOARD_GRANT, so the net faucet is 0.
- **LIC2:** 15_000_000_000n ($15k), 6% of the R2 threshold. That is 7.8% of median NW at GD 112 ($193k) and 0.85% at GD 240. One-time sink per Pro player: $15k real.
- **LIC3:** 250_000_000_000n ($250k), 5% of R3.
- **LIC4:** 5_000_000_000_000n ($5M), 5% of R4. Every fee sits at 5–6% of its rank gate, a constant "admission" share.
- **Renewal share:** `license_renewal_share = 100_000` ppm (10%). Renewals per GY: LIC2 $1,500, LIC3 $25,000, LIC4 $500,000. A median active player at GD 240 holding LIC2 renews $1.5k/GY, 0.09% of NW (1.76M). Renewals are a retention fee, not a meaningful sink; the purchase fees are the real license sink. Keep 10%: raising it to 25% still gives only 0.2% of NW/GY, and lapsing on a busy mid-game player costs more goodwill than it drains.

**Identity fees** (the keys exist in 23 at lines 862 and 522):
- **`handle_change_fee_real` = 1_000_000_000n ($1,000).** 14% of p50 NW at GD 8, 0.06% at GD 240; at most once per chapter (1,344 GD). It is an anti-churn price, and the sink is negligible (≤ $1k real per player per chapter). Keep.
- **`home_city_change_fee_real` = 25_000_000_000n ($25k).** 1.2× median NW at GD 40, 4.4% at GD 168, 1.4% at GD 240. It blocks hopping for city boards before R1 and is affordable mid-game, at most once per chapter. Keep.

Not changed by this addendum: `protection_real_hours` = 72 (00 §5.9), `rookie_zone_*` (spec defaults stand), `fresh_start_cash_real` = 5,000 (now with top-up semantics).

**Caveats.**
- The bots are p10 world bots with businesses and no MSI model: MSI paths are applied analytically, and NW is assumed to scale linearly with start cash.
- Checkpoints are every 8 GD.
- The horizon is 240 GD, so R4/R5 are untested.

**Tests.**
- `RANK_THRESHOLD_REAL` equals the r1..r5 values above.
- `feeNominal(LIC2)` at MSI 1.25 = 18_750_000_000n, and its renewal = 1_875_000_000n (matches T14A-02:83).
- Handle fee at MSI 1.25 = 1_250_000_000n (T14A-04:74).
- Home-city fee at MSI 1.25 = 31_250_000_000n.


### E-21 rank note (Avalon Designer, 2026-10-21): ruling on rank pacing (rank_r1..r5_threshold_real), closing the "PENDING Avalon Designer" item
**Ruling: keep the thresholds and re-anchor the top-player targets.** No threshold moves.
| Key | Value (real, × MSI) | Median target | Top-player target |
|---|---|---|---|
| r1 | 20_000_000_000n ($20k) | real day 1–2 (24–48 GD) | first session |
| r2 | 250_000_000_000n ($250k) | ~day 5 (120 GD) | **~day 4 (96 GD)**, was ~day 2 |
| r3 | 5_000_000_000_000n ($5M) | ~day 12 (288 GD) | **~day 9 (216 GD)**, was day 7 |
| r4 | 100_000_000_000_000n ($100M) | ~day 40 (960 GD), PROVISIONAL | ~day 14 (336 GD), PROVISIONAL |
| r5 | 2_000_000_000_000_000n ($2B) | after day 56 (1,344 GD), PROVISIONAL | ~day 28 (672 GD), PROVISIONAL |
Reasons:
- $5M is the R3 identity: a three-screen desk, Derivatives and charters. Lowering it inflates every rank above it, and it would sit off the clean ×20 ladder ($250k → $5M → $100M → $2B).
- The 30% miss is only on the top-player marker, measured with the "excellent" bot (209–223 GD). The median target (288 GD) looks on track: median NW is $1.76M at GD 240 and grew 3.1× over GD 168–240.
- A faster rank-up is a worse moment, not a better one. Landing R3 at about real day 9 keeps the top player's first chapter-week busy with R2 tools.
Ranks are never demoted (14 §3.2.4). A Fresh Start keeps the rank, and MSI moves do not lower a reached rank.
Edits: 14 §3.2.7, top-player R2 ~day 2 → ~day 4 and R3 day 7 → day 9. 20 balance bands to match. p10 `lifestyle.ts` takes V3 names (R3 Mogul, R4 Tycoon) and the V3 R6 gate (separate unit).
Gates (Quant):
- Extend the bot sim to 1,400 GD and verify R4/R5.
- R3 median must land in 240–336 GD and top style in 192–240 GD.
- If the R3 median exceeds 336 GD, revisit sink/income tuning before touching the threshold.
- If R4 misses its band by more than 25%, return to Designer.
Tests: RANK_THRESHOLD_REAL equals the table. Rank after a Fresh Start and after an MSI rise is ≥ the prior rank (INV-PRG).

### E-42 (2026-10-21): 1,400-GD rank-pacing gate for the E-21 rank note (Quant)
**Setup.**
- p10/integration world bots: `scripts/balance/wealth.ts bot` via the copy `wealth-ckpt.ts` (it adds a progress line every 56 GD and changes no logic).
- 5 styles × 3 seeds (wealth-1..3), 1,400 GD at the full 720 ticks per GD, so there is no tick-rate caveat.
- "Never" means not reached by GD 1,400. Medians count never-reached runs as +∞.
- Engaged styles are excellent, average and managed. Passive styles are casual and neglected.
- Checkpoints and outputs: `/workspace/tg-p10/.w14/`.

| Style | R1 p10/p50/p90 | R2 | R3 | R4 | R5 | NW at GD 1,400 (p50) |
|---|---|---|---|---|---|---|
| excellent | 26/27/28 | 82/88/95 | 211/218/222 | 419/425/431 | 969/1,064/1,110 | $15.37B |
| average | 35/36/37 | 109/111/113 | 305/335/349 | 600/631/649 | never 3/3 | $1.71B |
| managed | 39/39/40 | 124/124/126 | 277/279/314 | 592/593/633 | 1,282/1,301/1,329 | $2.40B |
| casual | 103/103/105 | 415/418/418 | never 3/3 | never | never | $1.24M |
| neglected | 101/102/103 | 485/486/486 | never 3/3 | never | never | $0.93M |
| ALL (15) | 27/39/103 | 92/124/486 | 220/335/∞ (6/15 never) | 428/643/∞ (6/15 never) | 1,087/∞/∞ (9/15 never) | $1.71B |

R6 was reached by 0/15 runs, under both definitions:
- p10 `lifestyle.ts` puts R6 at $50B; the highest end NW was $25.42B (excellent-2).
- Under the spec gate (`rank_r6_floor_real` $20B, top 50 and a House), excellent-2 clears only condition (a). The bot never founds a House.
- This is the lifestyle.ts $50B vs spec $20B mismatch already flagged in the E-21 addendum.

**Gates (E-21 rank note).**
- **R3 median in [240, 336] GD: PASS, on the edge.**
  - All 15 runs: 335 GD (1 GD inside the band).
  - Engaged styles only: 279 GD.
- **Top style R3 in [192, 240]: PASS** (211–222).
- **R4, PROVISIONAL band: return to Designer, because it misses by more than 25%.**
  - Engaged median 592 GD against a target of 960: 38% early.
  - Top style 425 GD against a target of 336: 26% late.
- **R5, PROVISIONAL:**
  - Engaged median 1,301 GD against "after 1,344": on target.
  - Top style 1,064 GD (945–1,121) against 672: 58% late.
  - Average style never reaches R5 (NW $1.06–1.95B at GD 1,400).
- **Passive styles** reach R1 at about 102 GD and R2 at 414–486 GD, and stall below $1.3M. 40% of players (the passive styles) never pass R2, so the all-run medians beyond R3 are set by engaged players alone.

**Things that look off.**
1. **Top-player compounding doesn't flatten.** Excellent NW growth runs 1.23–1.29%/GD (GD 240–480), 0.48–0.51 (GD 480–960) and 0.46–0.61 (GD 960–1,400). The rate holds at about 0.5%/GD instead of decaying, reaching $10.6–25.4B by GD 1,400, and it would pass $50B around GD 1,600–1,700. Average and managed growth decays (0.55–0.64 → 0.23–0.28%/GD). This is a wealth explosion at the top, not across the population. Recommend a diminishing-returns check at scale (business count is 55 at the top vs 40–44 mid) before tuning the R5/R6 bands.
2. **The stabilizer never engages.** sinkMult = 1.000 at every checkpoint of all 15 runs. The p10 controller targets 1%/GD supply growth over 7 GD (boards.ts), and the world never exceeds it.
3. **MSI is not modelled.** p10 has no 03 §3.8 MSI, so thresholds here are nominal. Sensitivity under the 0.29%/GD money drift (E-21 addendum), applied from GD 168:
   - Real thresholds rise as MSI(t) = 1.0029^(t−168).
   - A rank reached at GD t with NW growth g is delayed by about ln MSI(t) / (g − 0.0029).
   - Managed R4 (GD 593, MSI 3.42, g ≈ 0.58%/GD) moves to about GD 1,017.
   - Managed R5 is never reached, because late g (0.27%) is below the drift.
   - R3 moves by about +45 GD for the median, so the gate would fail.
   - So if MSI really tracks a 0.29%/GD drift, the late ranks are badly distorted. The 03 design_money path (which grows with population age) must absorb most of the drift for these bands to hold. Re-run this gate once 03 MSI exists.
4. **License costs:** E-28 sets LIC1 renewal to 0. The bot doesn't buy licenses, so license sinks are not in these numbers.

**Recommendation.**
- Keep r1–r3. They pass.
- Send r4/r5 back to Designer with these numbers: the R4 median is early and the top R4/R5 are late. That points to tuning top-end diminishing returns, not to moving the thresholds.
- Re-gate with MSI and license sinks modelled.

Update (Designer, after E-42): thresholds unchanged. R4 targets are now median ~day 25 (600 GD, band 540-720) and top ~day 18 (430 GD). R5 targets are median after day 56 and top ~day 44 (1,050 GD). R6 gate: the top bot style reaches $20B by ~GD 2,000. Top-end diminishing returns: growth from $100M to $2B stays at ~0.48%/GD, and above $2B world friction (Systems) tapers it to ~0.24%/GD (Quant, agreed after E-42). E-31(b): the collection floor rises to $7,300.

## E-22 — Module 14B codes and invariants (Producer ruling, 2026-10-21)
1. catalog.csv and legpolicy.csv gain 14 rows (owner 14, 401 → 415): LIFE_EDITION_SALE (TRANSFER SWAP_ASSET @ASSET), LIFE_STORAGE 5200/4000, LIFE_RESTORATION 5040/4000, LIFE_SECURITY 5230/4000, LIFE_RENT, LIFE_BERTH_RENT and LIFE_HANGAR_RENT 5020/4000, LIFE_EXPERIENCE 5200/4000 (all SINK ELASTIC_OUT frm S3, restrictedOk Y), LIFE_SLOT_RENT_P2P (TRANSFER PAY 5020/4010 CLASS), LIFE_HOSTING_REFUND (FAUCET ELASTIC_IN 5240/4000 frm), ACCT_HOUSE_FEE (BURN 5250 S6), ACCT_STARTER_GIFT (MINT 4110 EXEMPT F6), ACCT_INHERITANCE_TAX (BURN 5260 TAX S5), ACCT_DELETION_ESCHEAT (BURN 5190 S6). Every fee or tax amount is marked "Quant sign-off". Backups: catalog.v4.csv, legpolicy.v3.csv.
2. 20 §3.1 gains INV-CHR-011..020; the registration list reads INV-CHR-001..020. 14B card headers carry them in `invariants:`.
3. T14B-04, -07 and -08 gain AC-*-INERT and the fixture fixtures/linkPorts.ts; linked checks are inert until module 15 exists.
4. T14B-06 states round-half-even (AC-14B-06-ROUND); test 14#17 adds ties 17.5 → 18, 18.5 → 18.
Tests: every 14 §3.17 name resolves to a catalog row or alias (CATALOG_GAPS_14B = []); legpolicy row exists for each new code; each INV-CHR-011..020 id resolves in 20 §3.1; tie cases in 14#17.

### E-22 addendum — static invariant owners (Producer ruling, 2026-10-21)
- INV-STR-002, -003, -004 belong to stage S9 (STAGES-AND-GATES). They go to T19D-07 (infrastructure and deploy pipeline) as AC-19D-07-STR, using a commerce-isolation check that reuses T19A-04's module-graph resolver.
- INV-STR-010 (20 §3.1) is an AST lint rule forbidding RNG in `rewards/**`. It goes to 19A's lint card T19A-03 as AC-19A-03-STR010, in the shared lint preset because it also covers `apps/web`.
- Coverage tool: INV_OWNER gains `'CHR': ['14']`. Upstream change needed in tools/coverage.py.
- 19B is unchanged.

### E-22 addendum 2 — Quant rulings applied (2026-10-21)
(a) E-21 addendum applied to the 14A cards:
- T14A-03: start cash = realToNominal(5_000_000_000n, msiPpm). The PENDING mark is removed.
- T14A-09: Fresh Start = max(0, $5k × MSI − liquid), as restricted cash. The PENDING mark is removed. New AC-14A-09-Q1 (MSI 1.25, $1,200 liquid → 5_050_000_000n; liquid ≥ cap → 0, no posting).
- T14A-05: rank thresholds r1..r5 filled in (20e9 / 250e9 / 5e12 / 100e12 / 2e15 micro). R6 stays rank_r6_floor_real = $20B.
- T14A-06: licence vectors (LIC2 at MSI 1.25 = 18_750_000_000n, renewal 1_875_000_000n).
- T14A-04: AC-14A-04-Q (handle 1_250_000_000n and home city 31_250_000_000n at MSI 1.25).
(b) ACCT_STARTER_GIFT is a non-cash item. Template ACCRUE (not MINT): debit 1860:lid_kessler_field, credit 4110, 840_000_000 micro. INV-LED-003 holds. The 14 §3.17 FAUCET note and 14 §3.6 text are updated; T14B-03 step 4 is updated.
(c) Row changes to E-22:
1. LIFE_RESTORATION legA 5040 → 5200.
2. LIFE_RENT, LIFE_BERTH_RENT, LIFE_HANGAR_RENT legB 4000 → 4010.
3. LIFE_HOSTING_REFUND legA 4000 (frm), legB 5240 (character). It stays a FAUCET.
4. ACCT_DELETION_ESCHEAT stays a BURN, 5190 → 3900. It counts in K_p.
Backups: /workspace/specs/backups/E-22-add2/.
Tests: each changed row's legs match legpolicy; the starter-gift posting moves no cash account; the vectors above.

## E-23 — Garnishment overlap, rank mark, starter-gift scaling (Producer, 2026-10-21)
(a) Garnishment: when a 13A garnishment plan and a 03 persistent claim (T03-26) overlap, the combined daily take is ≤ max(garnishment_rate, comeback_garnish_rate) × garnishable income, and 13A plans are paid first. New ACs: AC-13A-04-OVERLAP and AC-14A-09-GARNISH. T03-26 is not edited (it is out of scope for this pass; T13A-04 is the collector that enforces the cap). Test: $1,000 income at 0.30/0.30 gives $300 total, all to the 13A plan.
(b) The "PENDING Avalon Designer" mark on rank_r1..r5 is cleared (E-21 rank note). r1–r3 are final; r4 and r5 are PROVISIONAL until Quant's 1,400-GD sim. T14A-05 gains AC-14A-05-R1, -NODEMOTE-FS and -NODEMOTE-MSI.
(c) ACCT_STARTER_GIFT = realToNominal(840_000_000n, msiPpm), posted by ACCRUE 1860:lid_kessler_field / 4110. This supersedes the flat amount in E-22 addendum 2 (b). Quant may object. Vectors: MSI 1.0 → 840_000_000n; msiPpm 1_250_000 → 1_050_000_000n; msiPpm 1_769_000 → 1_485_960_000n. Updated: T14B-03, the catalog note, and 14 §3.6/§3.17.

## E-23 addendum — Starter gift valuation (Quant sign-off)
Quant: no objection to ×MSI. Value = realToNominal(840_000_000n, msiPpm at grant tick), rounded to micro, fixed at grant; the 1860 item is NEVER revalued with later MSI changes. "Quant may object" mark is cleared.
Test: grant at MSI 1.25 → 1_050_000_000n; MSI later 1.5 → 1860 balance still 1_050_000_000n, no REVALUE posting.

## E-24 — 13B rulings (Producer and Quant, 2026-10-21)
1. **Investigation progress (Quant)** replaces the T13B-03 placeholder and clears its PENDING mark.
   - Formula: `P_ppm(S) = min(CAP, GAIN × isqrt(S·10^12 / B) / 10^6)`, with `B = INV_SQRT_BASE × MSI` at the posting tick, and bigint floor isqrt.
   - A spend s adds `P(S+s) − P(S)`. A spend below `INV_SPEND_MIN × MSI` is rejected.
   - Keys (registry gaps for 23):
     - `INV_SQRT_BASE` = $50,000 real × MSI
     - `INV_SQRT_GAIN_PPM` = 250,000 and `INV_SQRT_CAP_PPM` = 1,000,000, both first-cut and not sim-proven
     - `INV_SPEND_MIN` = 1% of base
   - Postings follow 13 §3.3: NPC firms are SINK, player firms are TRANSFER (V3 classing overrides the default treasury TRANSFER).
   - Tests: AC-13B-03-SQRT-1..5 (B → GAIN, 4B → 2·GAIN, batching invariance, cap, minimum rejection, MSI scaling).
2. **Appeal deadline:** `decisionTick = filedTick + 17,280`. If undecided, the appeal LAPSES: the verdict stands and the escrow goes to the victim in that tick (AC-13B-06-DEADLINE).
3. **Held characters** may post bond, settle and appeal (AC-13B-05-HELD, AC-13B-06-HELD, AC-13A-06-HELD-LAW).
4. **Reversal** (Designer cleared in E-33):
   - The fine is refunded, Held time already served stands, and the chapter counters go back down (AC-13A-03-REVERSE).
   - 13B emits `law.conviction_reversed` (AC-13B-06-REVERSE).
   - 14B removes the linked Notoriety and Reputation changes through compensating rows (AC-14B-07-REVERSE) and the public-record line (AC-14B-11-REVERSE).
Backups: /workspace/specs/backups/E-24/.

## E-25 — 15A catalog, escrow API, reversal event, P2P window, investigation keys (Producer and Quant, 2026-10-21)
1. Per E-9, `CTR_P2P_TAX` is a TRANSFER leg to the tax authority (alias `TAX_P2P_TRANSFER`), not a SINK. Fixed in 15 §3.15 and §3.6.8.
   New catalog and legpolicy rows, owner 15 (415 → 418); amounts are marked "Quant sign-off":
   - `CTR_OPTION_SETTLE`: TRANSFER SWAP_ASSET @ASSET
   - `CTR_COLLATERAL_SEIZE`: TRANSFER MOVE_QTY @ASSET
   - `FILING_REGISTRAR_FEE`: SINK BURN 5250 S6
   `CATALOG_GAPS_15A` is now [].
2. Escrow stays on 03 holds behind the stable 15 §3.6.4 API (`hold`, `release`, `returnToOwner`), which 07 can re-implement later (T15A-04 step 0, AC-15A-04-API).
3. 13 §10 gains `law.conviction_reversed`.
4. The P2P cap uses a rolling 17,280-tick window per payer: 24 hourly buckets with a running sum, O(1) amortised. AC-15A-05-ROLL includes a calendar-boundary burst test.
5. The investigation keys are confirmed PROVISIONAL by Quant, pending the sim gate (conviction rate on attributed ops 40–65%, detected-never-attributed 30–50%).
   23 §4.12 rows added:
   - `INV_SQRT_BASE` 50_000_000_000 micro × MSI
   - `INV_SQRT_GAIN_PPM` 250_000
   - `INV_SQRT_CAP_PPM` 1_000_000
   - `INV_SPEND_MIN` 500_000_000 micro × MSI
   T13B-03 points = P_ppm/10,000. Vectors (AC-13B-03-SQRT-6): 2.56B → 40, 4.84B → 55, 7.84B → 70, 16B → 100 (cap).
Backups: /workspace/specs/backups/E-25/.

## E-26 — City id scheme, 10A catalog, Isla Serena, renderer seam (Producer and City Dev, 2026-10-21)

### E-26.seam (City Dev correction)
- T10A-09's renderer seam is the V3 port in `src/city` on PR #4 (head `2436983`), not the prototype `render.js`. Server output is `CityManifest` / `CitySnapshot` / `CityDelta` (`src/city/data/types.ts` l.123/107/113), `CTY1` v1 binary chunks (`src/city/worker/format.ts`; i32 cm, 28 B/part, `CHUNK_SIZE_CM 12_800`), at `manifestUrl` / `hashedUrl` (`src/city/data/urls.ts`). The requirement to add types to the prototype is dropped. New ACs: AC-10A-09-SEAM (rewritten), -CHUNK, -DELTA.
- Legacy-id uses for Producer follow-up (PR #4 `2436983` and main `acb58bc`):
  - `src/apps/city/createShellCityRenderer.ts` l.2 (comment), l.6 `export const CITY_ID = "city_port_avalon"` — main and PR #4.
  - `tests/unit/shell/cityId.test.ts` l.10, 17, 32 — main and PR #4.
  - `tests/unit/shell/cityWindow.test.ts` main l.62, 65; PR #4 l.34, 43.
  - PR #4 only: `src/city/data/names.ts` l.4–11 (`district.dist_port_avalon_*`, 8 districts); `src/city/data/types.ts` l.56 comment `dist_<city>_<district>`; `tests/e2e/city/fixtures/generate-city.ts` l.25 `CITY_ID = 'city_port_avalon'`, l.62 `dist_port_avalon_${slug}`; `tests/e2e/city/harness/vite.config.ts` l.41 (comment).
  - Not ids (leave): `'city_crown'` title value in `src/city/data/types.ts` l.44, `store.ts` l.42, `generate-city.ts` l.227–228.

### E-26.ids (Producer)
- One regex-compliant scheme: `cty_`, `dst_`, `pcl_`, `bld_`, `unt_`, `lse_`, `prop_`, `lon_`. Entity ids only; parameter and other names (`city_envelope_km`, `city_publish_max_lag_ticks`, `city_open_na_step`, `city_activity`, generator `city_new`, `loan_default_dpd`, `loan_to_value`, `bnk.loan_meta`, title value `city_crown`) unchanged.
- Changed files (backups in `/workspace/spec/backups/E26/ids/`):
  - `vision-review/complete/10-REAL-ESTATE-AND-CITIES.md`: §2 id comments `'cty_' + slug` / `cty_port_avalon`, `'dst_' + …`, `'unt_' + ulid`, 07 loan id `'lon_' + ulid`; city ids in tables.
  - `vision-review/complete/22-CONTENT-CATALOGS.md`: 16 city ids `city_<slug>` → `cty_<slug>` (incl. `cty_port_avalon`), every `dist_<city>_<district>` → `dst_…`, the `distId` grammar line.
  - `build-plan/cards/03/T03-11.md`: test ref `'loan_1'` → `'lon_1'`.
  - `build-plan/cards/10A/T10A-01.md`, `T10A-02.md`, `T10A-09.md`, `_unit.md`: scheme recorded as accepted; lint AC covers all four legacy prefixes.
- Still open: 10 §3 / 22 unique-plot ids `uq_<slug>` (e.g. `uq_serena_cay_03`) also fail the regex. Proposal `unq_`; Producer to rule. No change made.
- Shipped client: `src/apps/city/createShellCityRenderer.ts` l.6 `CITY_ID = "city_port_avalon"` (main and PR #4); Front Dev switches it (see E-26.seam list).

### E-26.catalog (CATALOG_GAPS_10A)
- 10A reason codes bound via `aliases.csv`: `RE_RENT_IN`→`PROP_RENT_ELASTIC|PROP_RENT_CORE`; `RE_PROPERTY_TAX`→`TAX_PROPERTY`; `RE_STAMP_DUTY`→`TAX_STAMP_DUTY`; `RE_MAINTENANCE`→`PROP_UPKEEP|PROP_UPKEEP_B2B`; `RE_MGMT_FEE`→`PROP_MANAGEMENT_FEE_NPC|PROP_MANAGEMENT_FEE_B2B`.
- New rows (catalog + legpolicy, amounts 'Quant sign-off'): `PROP_VACANT_UTILITIES` SINK ELASTIC_OUT 5040→4000 frm (`RE_VACANT_COST`); `CITY_COSMETIC` SINK BURN 5250 (`RE_COSMETIC`).
- Conflict noted: spec 10 §3.7.2/§3.17 calls property tax and stamp duty SINK; 03 posts them as TRANSFER to the tax authority. Following E-9 precedent, 03 wins; spec 10 wording to be fixed in a later errata.
- `CATALOG_GAPS_10A = []`. 10B codes (`RE_TXN_COST`, `RE_LAND_SALE`, `RE_PERMIT_FEE`, `RE_CONSTRUCTION_PAY`, `RE_UNIQUE_SALE`, `RE_MORTGAGE_FEE`, `RE_MORTGAGE_INTEREST`, `RE_PREPAY_FEE`) are deferred to 10B.

### E-26.serena
- Isla Serena follows the spec, not the prototype's single R4 city unlock: view R0; free-zone domicile and non-island assets R4 (10 §3.2.5, 14 §3.2.6); islands R6. Other-bloc cities R2. AC-10A-02-SERENA added.
- Flag: the ruling said "R0, R2, R6", but R4 for non-island assets is spec text (10 §3.2.5, 14 §3.2.6), not just prototype. Kept R4 for that tier; Producer to confirm.

## E-27 — Producer rulings on E-26 follow-ups and 16A (2026-10-21)
1. **Isla Serena R4 tier kept** per spec (10 §3.2.5, 14 §3.2.6): view R0, domicile and non-island assets R4, islands R6. Noted in AC-10A-02-SERENA and 10A `_unit.md`.
2. **Unique-plot ids `uq_` → `unq_`** in 10 (§2 id comment, `unq_serena_cay_03`) and 22 (`unq_vetro_*`, `unq_hwatch_*`, `unq_mw_*` and the §2317 line). No card used `uq_`. `uq_` added to the rejected prefixes of AC-10A-01-2 (`no-noncompliant-entity-prefix`).
3. **Spec 10 wording**: property tax (§3.7.2 table) and stamp duty (§3.17 and acceptance test 12) are a TRANSFER to the bloc `gov`, posted as 03 `TAX_PROPERTY` / `TAX_STAMP_DUTY` (per E-9). Transaction cost stays SINK.
4. **`INFO_TERMINAL_FEE`, `INFO_ANALYST_FEE`, `INFO_RESEARCH_DESK_FEE`, `INFO_RESEARCH_QUERY`**: SINK BURN, 5250, catalog + legpolicy rows, PROVISIONAL pending Quant (amounts Quant sign-off). Aliases `HH_CONSUMPTION_PLAYER`→`BIZ_SALES_HH`, `FRM_B2B_PLAYER`→`BIZ_SALES_FRM`. T16A-09 carries a build gate: no build until Quant confirms `INFO_*`. `CATALOG_GAPS_16A` keeps only the four intra-elastic names.
5. **INV-WLD-001 / INV-WLD-002** (news N1 / N2) added to 20 §3.1 and to T16A-08's `invariants:`. Coverage tool: `WLD: ['16']` added to `/tmp/avtools/coverage.py`; goes upstream together with `CHR: ['14']`.
6. **Non-macro crises** (weather, accident, health, labour) become a world-event catalog in 16B, owned by Systems, rates from Quant. Noted in 16A `_unit.md`; T16A-07 unchanged.
Backups: `/workspace/spec/backups/E27/`.

## E-28 — 16A Quant rulings: INFO_* and alias check, §3.2 loop, news, consequences, info prices, rumors, shock keys, P3, 10 rows, 14A registry rows (Quant, 2026-10-21)
Sources: 16 §3.2, §3.6, §3.7, §3.8, §3.14, §8.1; 04 §3.16; 03 §3.2 chart (`:416`), `:559`, `:1017`; 10 §3.7.2 (`:718`), §3.25; 13 `:483`; 14 §3.2.2, §3.3; 23 rows cited by line; p10 `src/engine/catalysts.ts:17-46`. Checks: `/tmp/q16.py` (closed-form and small sims, reproducible). **Every value below is PROVISIONAL (not checked by a full engine sim) unless marked CONFIRMED-BY-TEXT.** Money is real $ × MSI, bigint micro.

### 0. Ledger (top priority)
**0a. `INFO_*` class — CONFIRMED SINK BURN; account changed 5250 → 5080.**
- Counterparty: 16 §3.6.6 tiers are sold by 16 itself (Terminal, NPC analysts from 22, Research Desk). No spec lets a player run one of these tiers: player outlets (15 §3.10.5, 09 `:869`) publish OUTLET items, they do not sell Terminal/analyst/Desk access. 03 already books the same flow as `ACCT_TERMINAL_SUBSCRIPTION` SINK BURN to "NPC information vendors" (03 `:559`, catalog row 41). E-9 does not apply: no treasury entity receives the cash, so there is no X_out leg and no TreasuryBalance to audit. In TickFlows they show in `byClass.SINK` and in K_p (INV-LED-019), which is what sinkMult reads. If a player-run data service is ever added, it gets its own TRANSFER P2P code; these four stay BURN.
- Account: E-27 used 5250 (Licences, charters, registrations). A subscription is not a licence. Use 5080 (Fees, commissions and levies paid), the account of `ACCT_TERMINAL_SUBSCRIPTION` and family S6 (03 `:1017`). Change for all four rows: catalog.csv `legA` 5250→5080; legpolicy.csv `legA_default`/`legA_allowed` 5250→5080. Not applied here (errata only); Systems to edit.
- Duplicate: `INFO_TERMINAL_FEE` and `ACCT_TERMINAL_SUBSCRIPTION` are the same flow. Recommend `INFO_TERMINAL_FEE` becomes an alias of `ACCT_TERMINAL_SUBSCRIPTION` (03 canonical, the usual 24 §8 direction), or the 03 row is narrowed to "data tiers other than 16". Either way, one code per flow, or `byCode` splits one sink across two codes. Producer call.
- Row fix: catalog.csv row 424 (`INFO_RESEARCH_DESK_FEE`) is missing its last `derived` field (18 fields, not 19).

**0b. Aliases — CONFIRMED, with one guard.** `HH_CONSUMPTION_PLAYER`→`BIZ_SALES_HH` (FAUCET, ELASTIC_IN, 5200→4000, hh) and `FRM_B2B_PLAYER`→`BIZ_SALES_FRM` (FAUCET, ELASTIC_IN, 5000→4000, frm). Class: 16 §3.2.5 calls these flows FAUCET at the player boundary, and the targets are FAUCET. Exact match. Legs: payer is the elastic sector (hh household consumption 5200, frm COGS 5000), payee is player revenue 4000. Matches 03 `:523-524`. Double count: TickFlows counts once per posted leg under the canonical code. A double count happens only if both 09 and 16A post the same purchase. 16A must not post: it only calls `demandPool`/`b2bPool`, and 09 posts the sale. Guard: add an AC to T16A-05 that 16A emits zero postings under `BIZ_SALES_HH`/`BIZ_SALES_FRM` or their aliases. 16#5 already says no other 16A flow posts. VAT inside `BIZ_SALES_HH` goes to gov as a separate TRANSFER (E-9), not a second FAUCET.

### 1. §3.2 coefficients
Closed-form loop gain per day: G = mpc·(1−τ)·(W/Q + 0.3·div/Q) + I/Q, where W/Q = 0.55·af, div/Q = 0.5·(0.70 − W/Q). Multiplier = 1/(1−G).
| af | τ_hh | mpc | I/Q | G | multiplier |
|---|---|---|---|---|---|
| 1.00 | 0.20 | 0.70 | 0.08 | 0.401 | 1.67 |
| 1.00 | 0.20 | 0.85 | 0.18 | 0.569 | 2.32 |
| 1.00 | 0.20 | 0.95 | 0.28 | 0.715 | 3.51 |
| 1.00 | 0.00 | 0.95 | 0.28 | 0.824 | 5.68 (worst corner) |
| 0.85 | 0.30 | 0.70 | 0.08 | 0.326 | 1.48 (lowest) |
- Stable and finite at every band edge **if 04's closure feeds back final demand only (C + I)**. If the 0.30 intermediate (B2B) is also fed back as demand, G = 1.015–1.124 at 7 of 54 corners (e.g. mpc 0.95, I 0.18, τ 0), which diverges. Rule for 04/16: intermediate is inside Q and never reported as demand.
- intermediate 0.30: CONFIRMED. Profit share = 1 − 0.55 − 0.30 = 15%, or 23.25% at the 0.85 floor.
- investment 0.18, clamp [0.08, 0.28]: CONFIRMED. Raw maximum = 0.18·1.5·(1+2·0.03) = 0.286, so the top clamp binds only at S = 100 with a −3 pp rate gap.
- Sentiment term 0.5: CONFIRMED.
- Rate term: **change 2 → 5**. With 2, a +2 pp gap cuts investment 4%. mpc loses 2.5·0.02 = 0.05 on 0.85, a 5.9% cut in consumption. Investment should be at least as rate-sensitive as consumption. With 5, +2 pp gives −10%.
- 0.6 to construction, 50% dividend payout, 30% household pass-through: CONFIRMED. The pass-through gives hh dividend income of 0.0225·Q, or 0.0349·Q at the floor.
- mpc formula and [0.70, 0.95]: CONFIRMED. The centre 0.85 sits mid-band. S ±50 gives ±0.05 and c ±1 gives ±0.03. The band binds only at a rate gap above 4 pp.
- Wealth effect 4%/GY: CONFIRMED. Steady-state deposits D* = (1−mpc)·Yd·364/0.04 ≈ 3.75 years of income at mpc 0.85. Convergence half-life ln2/0.04 = 17 GY, which is more than 1 chapter (1,344 GD), so within a chapter deposits trend and do not settle. Acceptable.
- Automation floor 0.85: CONFIRMED (AUTOMATION level 15 cap).
- Keys (new 23 rows, all ×MSI n/a): `agg_intermediate_share` 0.30; `agg_invest_base` 0.18; `agg_invest_sent_coef` 0.5; `agg_invest_rate_coef` 5; `agg_invest_clamp_lo` 0.08; `agg_invest_clamp_hi` 0.28; `agg_invest_construction_share` 0.6; `agg_dividend_payout` 0.5; `agg_hh_div_passthrough` 0.3; `agg_mpc_base` 0.85; `agg_mpc_sent_coef` 0.05; `agg_mpc_rate_coef` 2.5; `agg_mpc_credit_coef` 0.03; `agg_mpc_min` 0.70; `agg_mpc_max` 0.95; `agg_wealth_effect_gy` 0.04; `agg_automation_floor` 0.85. Source 16 §3.2.

### 2. Housing ×30 — CONFIRMED intended (day→30-day rate); one double count found
- The ratio employed/employed_prev is day over day, and the ×30 turns it into a 30-GD rate to match the 30-GD EMA.
- C01 case (−1% employment over 7 GD, 16#43): raw term 0.5·(0.01/7)·30 = 2.14%/day, EMA peak −0.80%. Without ×30 the peak is −0.027%, which is invisible.
- Trend case (−0.1% over 30 GD): peak −0.043%.
- C01 already lists "housing demand −(0.5× that)" as its own effect. That −0.5% would come on top of the −0.80% that the employment channel already produces. **Make C01's (and C02's) housing effect `recordOnly`.**
- Keys: `housing_emp_elasticity` 0.5; `housing_emp_window_gd` 30; `housing_ema_gd` 30.

### 3. Ordinary activity — λ needs a clamp
λ = 2 + 100·(g + 0.02) gives:
| g | λ | P(count > 12) |
|---|---|---|
| −0.06 | −2 (invalid) | — |
| −0.04 | 0 | — |
| −0.02 | 2 | 0 |
| 0 | 4 | 0.03% |
| +0.02 | 6 | 0.9% |
| +0.04 | 8 | 6.4% |
| +0.06 | 10 | 20.8% |
At g = −0.04, P(count = 0) = 1: no activity in a mild recession.
- **Set λ = clamp(2 + 100·(g+0.02), 1, 9).** The count clamp [0, 12] stays as a safety bound; at λ = 9 it binds about 8% of days.
- Keys: `activity_lambda_base` 2; `activity_lambda_slope` 100 (per unit g); `activity_lambda_min` 1; `activity_lambda_max` 9; `activity_count_max` 12.

### 4. Newsworthiness — threshold 0.15 → 0.05
Maximum nw with magnitude = 1, novelty = 1, no telegraph, fit = 1: EARNINGS single company 0.5·0.3 = 0.15; PRODUCT single company 0.09; CITY at city reach 0.10; PLAYER_PUBLIC at city reach 0.12 (0.24 with the full PP multiplier).
- At 0.15, company PRODUCT and CITY items can never qualify on merit (only through the per-city floor), and EARNINGS needs magnitude 1.0 (|surprise| ≥ 2σ).
- At 0.05: EARNINGS qualifies at magnitude ≥ 0.33 (|surprise| ≥ 0.67σ, about 50% of reports), PRODUCT at ≥ 0.56, CITY at ≥ 0.5. The 0.05 sits at the 23 range minimum.
- Base table, reach multipliers (1 / 0.7 / 0.5 / 0.4 / 0.3, PP cap ×2 reached at PP = 9,999), and 40/GD: CONFIRMED. 40/GD = 40 per real hour against a quota of 0.056 per tick.
- Novelty 1 − 0.5^d: CONFIRMED, with d in **fractional** GD (ticks/720). With whole days, d = 0 kills every same-day follow-up.

### 5. Consequences C01–C20 (magnitudes; all PROVISIONAL)
- **C01/C02:** employment ±jobs/LF; housing recordOnly (§2); supplier orders ±(closed site's B2B spend share); rent index ±0.3× employment change.
- **C03:** +0.2 credit tightening as written.
- **C04:** spread +50 bp as written.
- **C05:** layoffs U(0, 8%).
- **C06:** wage cost +x, where x is the settlement % (0.5–1.5·π per §3.7.5); price pass-through 0.5x.
- **C07:** mortgage rate = 1.0× surprise; turnover −10% per +1 pp surprise.
- **C08:** input cost = spike × sector input weight (22); CPI pass-through 0.1× spike × CPI weight.
- **C09:** reconstruction = 0.5× insured loss spread over the lag; population U(0, 2%).
- **C11:** premium ±(policy distance × 50 bp).
- **C12:** construction starts +5% per 0.1 density step.
- **C13:** displacement 0.5% of exposed jobs per breakthrough level.
- **C15:** as C02.
- **C16:** yields +25 bp per notch; bank mark = 1.0× through 07.
- **C17:** compute price +x = outage share of capacity × 2.
- **C18:** delay +1–3 GD; inventory premium 2%.
- **C19:** −10% ENTERTAINMENT/TRANSPORT, +5% HEALTH/TECH, labour −2% as written.
- **C10, C14, C20:** probabilities as written.
- Cascade cutoff 2% and cap 12 per event: CONFIRMED. The C01 chain 1 → 0.3 → 0.09 → 0.027 stays above 2% to depth 4; depth 4 stops it, so the cap is not the binding guard.

### 6. Information prices — units: all per **game day** while active (16 §3.6.6, `:741-744`), real $ × MSI; query per query
Annual = 364 GD. The cap is 0.05%/GD of NW (18.2%/GY) on Terminal + Desk combined; analysts are outside the cap.
| median (GD) | NW | Terminal/GD (capped) | Terminal %NW/GY | T1 analyst %NW/GY | query %NW |
|---|---|---|---|---|---|
| 8 | $7,067 | $3.53 (cap) | 18.2 | 515 | 354 |
| 40 | $20,583 | $10.29 (cap) | 18.2 | 177 | 121 |
| 112 | $193k | $20 | 3.77 | 18.9 | 13.0 |
| 168 | $565k | $20 | 1.29 | 6.4 | 4.4 |
| 240 | $1.76M | $20 | 0.41 | 2.1 | 1.4 |
| R3 | $5M | $20 | 0.15 | 0.7 | 0.5 |
| R4 | $100M | $200 | 0.073 | ~0 | 0.03 |
| R5 | $2B | $4,000 | 0.073 | ~0 | ~0 |
- The cap binds for the Terminal below NW $40k ($20/0.0005).
- Research Desk at R3 entry: $1,550/GD = 11.4%/GY, about 5% of the measured daily NW gain at that wealth (median growth ≈ 1.6%/GD between GD 168 and 240, from $565k to $1.76M). Affordable but felt. At R4 it is 0.98%/GY.
- **Verdict: CONFIRMED as written:** $20 floor, 2e-6, $100/$600/$2,500, $1,500 + 1e-5, $25k query, 0.05%/GD cap. Analysts stay outside the cap: T1 at R0–R1 costs more than 100% of NW per GY, so it is a self-limiting choice and not a trap (opt-in, fired anytime).
- σ 0.6/0.4/0.25: CONFIRMED for the T2/T3 forecast path. Text bug: 16 §3.6.6 gives T1 no forecasts, yet lists σ for T1. Either T1 forecasts at 0.6, or drop the 0.6. Producer call.
- Keys: `info_terminal_floor_real` $20 (×MSI); `info_terminal_nw_rate_gd` 2e-6; `info_analyst_fee_t1_real` $100, `_t2_real` $600, `_t3_real` $2,500 (×MSI); `info_desk_fixed_real` $1,500 (×MSI); `info_desk_nw_rate_gd` 1e-5; `info_desk_query_real` $25,000 (×MSI); `info_analyst_sigma_t1/t2/t3` 0.6/0.4/0.25.

### 7. Rumors — formula change
Engine scale (p10 `catalysts.ts:17-46`): typical move = 0.055·(vol/0.3)·√(2/π) = 4.39% at vol 0.30; daily σ = 0.30/√252 = 1.89%. The engine prints 0.5·(2p−1)·typical move, so +0.88% at p = 0.70 and +0.22% at p = 0.55.
- Spec: 0.25·cred·expected move. Credibility = (hits + 5)/(n + 10). At n = 0, cred = 0.5, so the impulse is 0.55% (0.29 daily σ) from a coin-flip source. At p = 0.40 with n = 100 it still pushes +0.45% in the rumor's direction, though that source is wrong 60% of the time. A fade-every-rumor bot profits from this, which breaks the 20 rumor-trader gate.
- **Set rumorImpulse = 0.5·(2·cred − 1)·expected move**, the same form as the engine.
| source p | resolved n | cred | impulse |
|---|---|---|---|
| any | 0 | 0.500 | 0 |
| 0.70 | 10 | 0.600 | +0.44% |
| 0.70 | 30 | 0.650 | +0.66% |
| 0.70 | 100 | 0.682 | +0.80% (0.42σ) |
| 0.40 | 100 | 0.409 | −0.40% (contrarian) |
- Prior weight 10: CONFIRMED. At 8 rumors/GD over 20 sources (0.4 per source per GD), about 30 resolved takes 75 GD, so credibility separates within the first ~3 real days.
- Half-life 1 GD: CONFIRMED. It is shorter than the 1–5 GD horizon, so the impulse is mostly gone before resolution, as intended.
- Keys: `rumor_impulse_coef` 0.5; `rumor_cred_prior_mean` 0.5; `rumor_cred_prior_weight` 10.

### 8. Shock keys — present in 23; owner 04
CONFIRMED-BY-TEXT: `macro_ripple_rate` (23 `:197`, 1/7 per GD), `macro_storm_rate` (`:205`, 1/91), `macro_major_min_gap_days` (`:183`, 504) all exist, with owner 04 §3.16 (04 `:1002`, 24 R29). The 16 and 04 values agree. Unit checks: 1/7·24 = 3.43 ripples per real day; 91/24 = 3.8 real days per storm. The card warning comes from naming: T16A-07 lists `major_exo_rate` but not these. Fix T16A-07 `params:` to read the three 04 keys.
- Real overlap is MAJOR. 16 `major_exo_rate` = 0.20/chapter = 1.49e-4/GD, while 04 `macro_major_base_rate` = 3.6e-4·V/GD = 0.48/chapter at V = 1, so P(≥1) = 38% from 04 alone before endogenous crises. Using both double-counts. **Owner: 04.** Retire `major_exo_rate` (23 `:953`) to a derived report-only figure, and remove it from T16A-07 (16A never draws). Endogenous majors already count toward 04's constraint 5. 20 verifies 35% ± 5% total.
- Values: ripple 1/7, storm 1/91, gap 504: CONFIRMED.

### 9. P3 budget — 200 ms binding
CONFIRMED-BY-TEXT: 23 `:1106` (`phase_budget_ms_P3` = 200, owner 19 §3.3.3), 16 §3.1.2, 16 acceptance #2 (`:864`), 23 `:1252` (24 R27/R29). The 300 ms in 16 §8.1 (`:816`) is stale. Text fix: "if P3 exceeds `PARAM.phase_budget_ms_P3`".

### 10. Spec 10 rows
- **`PROP_VACANT_UTILITIES`** (alias `RE_VACANT_COST`). SINK ELASTIC_OUT to frm: CONFIRMED. The utility provider is the NPC firm sector, so this is not a burn. Account **5040 → 5030 (Energy)**: utilities are an energy cost; 5040 is upkeep, already used by `PROP_UPKEEP`. Both are property opex (03 `:1400`), so NOI is unchanged. Amount 0.02 × marketRent_unit **per-GD rent** per vacant unit per GD: CONFIRMED. A $50/GD unit costs $1/GD when vacant, small next to the $50 of rent lost. If marketRent is read per GY, the charge would be 364× too high. Key: `re_vacant_utilities_share` 0.02.
- **`CITY_COSMETIC`.** BURN: CONFIRMED. The vendors are system kits, and 10 §3.25 names no treasury payee. If naming-right auction proceeds are meant to go to the city gov, that part becomes a TRANSFER under E-9; Producer call. Account **5250 → 5200 (Lifestyle consumption) when the payer is chr, 5050 (Marketing) when the payer is a company**: kits, plaques and sponsorships are status or brand spend, not licences. legpolicy: BY_PAYER, allowed 5200|5050. Amounts: the 10 §3.25 table as written, real × MSI (kits $500–$250k; company kit $50k–$25M; crown $1M–$50M; naming reserve $5M; sponsorship $250k–$20M per chapter; plaque $2,500; portrait $10,000). Against measured NW, a plaque costs 12% of NW at GD 40 and 0.14% at GD 240, which is fine for an opt-in purchase.

### 11. 23 registry rows for T14A-05/-06/-08 (from E-21, 14 §3.2.2, §3.3, 13 `:483`)
| key | unit | default | ×MSI | source |
|---|---|---|---|---|
| `rank_r1_threshold_real` | real $ NW | $20,000 | no (compared to NW/MSI) | 14 §3.2.2; E-21 |
| `rank_r2_threshold_real` | real $ NW | $250,000 | no | 14 §3.2.2; E-21 |
| `rank_r3_threshold_real` | real $ NW | $5,000,000 | no | 14 §3.2.2; E-21 |
| `rank_r4_threshold_real` | real $ NW | $100,000,000 | no | 14 §3.2.2; E-21 |
| `rank_r5_threshold_real` | real $ NW | $2,000,000,000 | no | 14 §3.2.2; E-21 |
| `license_fee_lic1_real` | real $ | $250 | yes | 14 §3.3 `:491` (paid by `ACCT_ONBOARD_GRANT`) |
| `license_fee_lic2_real` | real $ | $15,000 | yes | 14 §3.3; E-21 |
| `license_fee_lic3_real` | real $ | $250,000 | yes | 14 §3.3 `:493` |
| `license_fee_lic4_real` | real $ | $5,000,000 | yes | 14 §3.3 `:494` |
| `license_renewal_share` | ppm of fee per GY | 100,000 (10%) for LIC2–LIC4; LIC1 renewal 0 | n/a (share) | 14 §3.3 `:491-494`; E-21 |
| `protection_real_hours` | real hours | 72 (= 51,840 ticks) | n/a | 13 `:483`; 14 `:119`, test 1 |
| `rookie_zone_real_days` | real days | 7 (= 120,960 ticks) | n/a | 13 `:483`; T14A-08 |
| `rookie_zone_nw_real` | real $ NW | $1,000,000 | no (compared to NW/MSI) | 13 `:483` |
- Name fix: T14A-06 lists `license_lic1_fee_real`; use `license_fee_lic1_real` to match its siblings.
- Note: 14's renewal column is 0 for LIC1, so the 10% applies to LIC2–LIC4 only; this corrects E-21's blanket "renewal 10%".
- "Day 7" read as real days: CONFIRMED by numbers. 7 game days (7 real hours) would end inside the 72 h protection and do nothing. At 7 real days (168 GD) the measured median NW is $565k, under the $1M gate, so the two exits fire at about the same time for a median player.
- Already in 23 (no row needed): `rank_r6_*` (`:880-882`), `handle_change_fee_real` (`:866`), `home_city_change_fee_real` (`:868`), `exam_*` (`:858-859`), `license_grace_game_days` (`:874`).

Backup: `errata.pre-E28.bak`.

## E-29 — Application of E-28 (Quant) plus Producer additions (2026-10-21)
Backups: `/workspace/spec/backups/E28/`. Spec files only.
**Ledger**
- `INFO_ANALYST_FEE`, `INFO_RESEARCH_DESK_FEE`, `INFO_RESEARCH_QUERY`: SINK BURN confirmed, account 5250 → 5080 (catalog legA; legpolicy legA_default/allowed). PROVISIONAL mark cleared; values PROVISIONAL per E-28. Row-424 field-count defect fixed (catalog rewritten with 19 fields on every row).
- Producer (a): `INFO_TERMINAL_FEE` rows removed; it is an alias of `ACCT_TERMINAL_SUBSCRIPTION` in `aliases.csv`.
- `PROP_VACANT_UTILITIES`: 5040 → 5030; amount 0.02 × per-GD marketRent per vacant unit per GD.
- `CITY_COSMETIC`: 5250 → 5200 (chr) / 5050 (company); legpolicy legA CLASS 5200|5050.
- Producer (c): landmark naming-right proceeds are a TRANSFER to the city gov (E-9): new `CITY_NAMING_RIGHT` TRANSFER PAY, legA CLASS 5200|5050, legB 4190. 10 §3.25 text, T10A-01, T10A-10 (AC-10A-10-NAMING) updated.
- Aliases `HH_CONSUMPTION_PLAYER`/`FRM_B2B_PLAYER` confirmed; AC-16A-05-NODOUBLE added (16A posts nothing under `BIZ_SALES_HH`/`BIZ_SALES_FRM`).
**Spec 16 and 16A cards**
- §3.2.2 investment rate term 2 → 5; feedback to 04 is C + I only (T16A-03 step, AC-16A-03-STAB/-RATE; AC-16A-04-STAB).
- ×30 housing factor intended; C01 (and so C02) housing effect record-only (§3.8.2; T16A-06 AC-16A-06-C01HOUSING).
- §3.2.6 activity λ = clamp(2 + 100·(g+0.02), 1, 9), count cap 12 (T16A-05).
- §3.6.2 news threshold 0.15 → 0.05 (23 row too), novelty in fractional GD (T16A-08 AC-16A-08-NW).
- C01–C20 magnitudes per E-28 §5 in T16A-06.
- Info prices billed per GD while active, query $25k each (T16A-09 AC-16A-09-GD). Gate removed.
- Producer (b): analyst σ 0.6 stays as T1's forecast σ (16 §3.6.6 text, T16A-09 AC-16A-09-T1).
- §3.6.7 rumor impulse = 0.5·(2·cred − 1)·expected move (T16A-10 AC-16A-10-IMPULSE, AC-16A-10-FADE).
- Producer (d): `major_exo_rate` retired (23 row marked RETIRED; §3.7.1 text; 04 `macro_major_base_rate` covers MAJORs). T16A-07 params now the three 04 keys.
- Producer (e): 16 §8.1 300 ms → `PARAM.phase_budget_ms_P3` (200 ms).
**23 registry and 14A**
- 13 rows of E-28 §11 added to 23 §4.13 (count 42 → 55). `license_lic1_fee_real` renamed `license_fee_lic1_real` (T14A-06). LIC1 renewal 0 noted in T14A-06; rookie zone exit (120,960 ticks or $1M NW, first wins) as AC-14A-08-ROOKIE.
**Not applied (no instruction):** the other new keys E-28 lists (`agg_*`, `housing_*`, `activity_*`, `info_*`, `rumor_*`, `re_vacant_utilities_share`) are not yet 23 rows.
- Tool (patched copy only, upstream with CHR/WLD): `/tmp/avtools/assemble.py` PKEY regex now accepts the `P<n>` suffix (`phase_budget_ms_P3`), clearing the false "phase_budget_ms_" warnings.

## E-30 — Producer rulings on 16B follow-ups (2026-10-21)
Backups: `/workspace/spec/backups/E30/`. Spec files only.
1. **19 §12.2**: row 16.B now holds politics and lobbying, strikes and the non-macro world-event catalog; 16.C holds history and archive, eras and technology, secrets and facts, opportunity briefs.
2. **Codes**: aliases `LOBBY_SPEND`→`WLD_LOBBYING_SPEND`, `POL_CONTRIBUTION`→`WLD_CAMPAIGN_DONATION`. New rows `ISSUE_CAMPAIGN`, `PETITION_COMMIT` (SINK ELASTIC_OUT, 5240→4000 frm, the `WLD_LOBBYING_SPEND` pattern; amounts 'Quant'). `soc.pol.campaign` and `soc.pol.petition.*` stay rejected `WORLD_AMOUNT_UNSET` until Quant sets amounts (AC-16B-09-GATE). `CATALOG_GAPS_16B` empty.
3. **04 owns overlapping crisis items.** T16B-10 removes nine items to 04: regional drought, crop disease, chip-fab outage, shipping-lane disruption (COMMODITY_SUPPLY ripple); mid-size bank run (CREDIT_WOBBLE / LIQUIDITY_HICCUP storm); product recall, celebrity scandal, small cyber incident, data-center outage (SECTOR_SHOCK ripple). Kept: local storm, coastal hurricane, factory fire, local power cut, road closure, port delay, local outbreak, regional strike. Mapping by primary effect channel; Systems to confirm.
4. **Ids**: `dyn_`, `pty_`, `cau_`, `bil_`, `ele_`, `lob_` added to the E-26 id table (T10A-01, 10A `_unit.md`, T16B-01) and to the allowed list of `no-noncompliant-entity-prefix` (AC-10A-01-2).
5. **23 registry**: 39 E-28 keys added to §4.15 (16; 49 → 88 keys): 17 `agg_*`, 3 `housing_*`, 5 `activity_*`, 11 `info_*`, 3 `rumor_*`; plus `re_vacant_utilities_share` in §4.9 (10; 69 → 70). All tagged "Quant, E-28, PROVISIONAL".
6. **Checker**: 10A, 16A, 16B, 16C all pass (no warnings). Module 16 coverage 58/58 tests, 29/29 sections, 2/2 invariants after 16C. 16#15 moved from T16B-06 to T16C-04 (single owner; AC-16B-06-ATLAS added).
7. **16C cards** written (`cards/16C/`, T16C-01..07). `CATALOG_GAPS_16C`: `FACT_SALE_NPC` (no row), `SECRET_PATH_FEE` (proposed alias `WLD_ARCHIVE_PURCHASE`); intents that would post them are rejected until ruled.

## E-31 (2026-10-21): 13A registry keys missing from 23 (Quant; Systems request; first filed as a duplicate "E-24", renumbered)
Adds rows to 23 next to the existing 13 block (23:819-839). Naming follows 23: snake_case; `_real` = real $ (stored as FDL micro at MSI 1, charged `realToNominal(·, msiPpm)`); fractions shown as registry decimal plus ppm for code; durations in ticks at 720 ticks per game day (1 GD = 1 real hour; 1 game hour = 30 ticks). Already present and NOT re-added: `fine_sink_share` 0.85, `fine_vcf_share` 0.10, `fine_whistle_share` 0.05 (23:828-830), `garnishment_rate` 0.30 (23:831), `held_grace_ticks` 720 (23:832), `vcf_advance_pct` 0.50 (23:838).

| Key | Type / unit | Value | ×MSI | Source |
|---|---|---|---|---|
| `sanction_s1_pct` … `sanction_s6_pct` | fraction of max(NW_offense, NW_verdict); ppm | 0.001 / 0.005 / 0.02 / 0.05 / 0.08 / 0.15 (1_000 / 5_000 / 20_000 / 50_000 / 80_000 / 150_000) | no | 13 §3.2 table (13:216-223) |
| `sanction_s1_floor_real` … `s6_floor_real` | real $, micro | 1_000_000_000n / 5_000_000_000n / 20_000_000_000n / 50_000_000_000n / 100_000_000_000n / 250_000_000_000n | yes | 13:216-223 |
| `sanction_s1_cap_real` … `s5_cap_real` | real $, micro | 5_000_000_000_000n / 50_000_000_000_000n / 500_000_000_000_000n / 2_000_000_000_000_000n / 5_000_000_000_000_000n; S6 none (null) | yes | 13:216-223 |
| `sanction_repeat_mult` | multiplier per prior same-chapter conviction; ppm | 1.5 (1_500_000) | no | 13:225 |
| `sanction_repeat_mult_cap` | multiplier; ppm | 2.5 (2_500_000) | no | 13:225 |
| `sanction_plea_discount` | fraction off the fine; ppm | 0.30 (300_000) | no | 13:225, §3.7 |
| `fine_verdict_cap_pct` | fraction of NW at verdict; ppm | 0.35 (350_000) | no | 13:226, AT 3 (13:532) |
| `fine_chapter_cap_pct` | fraction of chapter peak NW; ppm | 0.60 (600_000) | no | 13:226 |
| `statutory_award_floor_mult` | multiplier on the tier floor, paid as restitution when attribution holds but quantum is missing | 2 | (floor is ×MSI) | 13 §3.5 |
| `held_s5_ticks` | ticks | 4_320 (6 real h = 6 GD) | no | 13 §3.10 (13:285) |
| `held_s6_ticks` | ticks | 8_640 (12 real h) | no | 13:285 |
| `held_repeat_add_ticks` | ticks | 4_320 (+6 real h) | no | 13:285 |
| `held_max_verdict_ticks` | ticks | 17_280 (24 real h) | no | 13:285, AT 11 (13:540) |
| `held_max_chapter_ticks` | ticks | 34_560 (48 real h) | no | 13:285 |
| `held_business_output_pct` | fraction of normal business output while Held; ppm | 0.70 (700_000) | no | 13:285 ("businesses run at 70%") |
| `collection_business_discount_pct` | fraction below fair value when collection sells businesses; ppm | 0.15 (150_000) | no | 13 §3.12 (13:295) |
| `divestiture_discount_pct` | fraction below fair value on forced divestiture; ppm | 0.15 (150_000) | no | 13:278, 13:466 |
| `protected_floor_cash_real` | real $, micro | 5_000_000_000n | yes | 13 §3.12 (13:297), 13:18, 03 §3.14.5 rule 2 (03:1490); replaces T03-26 `PROTECTED_FLOOR_REAL` and T13A-01 `FLOOR_REAL` constants |
| `protected_floor_t1_businesses` | count | 1 | no | 13:297 |

**Fine split, ledger destinations** (consistent with E-9: V3 classes are kept; TRANSFERs into system-side funds count as X_out, BURN counts in K_p and lowers M0):
- 85% `LAW_FINE_SINK`: SINK, BURN, Dr offender 5210 Fines and penalties / Cr sys 4900. V3 says "destroyed" (13:231), so it is a burn, not a treasury transfer.
- 10% `LAW_FINE_VICTIM_FUND`: TRANSFER, PAY, offender 5210 → the VCF entity books 2590 (held for victims). X_out only while the VCF is system-controlled (E-9 flag 2), and `LAW_VICTIM_FUND_PAYOUT` (2590 → victim 4120) is then X_in.
- 5% `LAW_FINE_WHISTLE_POOL`: TRANSFER, PAY, 5210 → pool 2590, same as VCF.
- Rounding: compute the 85% and 10% parts with half-even rounding and give the whistle pool the remainder, so the three legs sum exactly to the fine (13 AT 4 "within rounding"; INV-LED-007 integer micro).

**Flags.**
1. **Hours are real hours.** 6 h = 6 × 720 = 4,320 ticks, not 6 game hours (180 ticks). T13A-01's `HELD_TICKS` (6*720 … 48*720) is correct. The grace is 720 ticks = 1 GD = 1 real hour ✓. A Held character spends at most 48 real h out of a 56-real-day chapter (3.6%).
2. **The cap and floor ordering is ambiguous in 13:225-226.** A tier $ floor can exceed the % caps for small players. Example: an S3 conviction at NW $6,000 gives clamp(2% × 6k, $20k, $500M) = $20,000, but the verdict cap is 35% × 6k = $2,100. Ruling proposal: fine = min(clamp(pct·NW, floor, tierCap) × modifiers, 35%·NW_verdict, 60%·peakNW_chapter − fines already this chapter). The % caps beat the tier floor. "Never below the $5k floor" (13:226) is the protected collection floor (13:297), not a fine minimum. Collection then stops at `protected_floor_cash_real` plus one T1 business; the rest becomes the 30% garnishment plan.
3. **Rent runway at the floor.** $5,000 real against market rent $5.40/GD real (E-21 addendum) is 926 GD = 38.6 real days, which is 0.69 of a chapter (1,344 GD). With the 60% chapter cap, a player can lose 60% of peak NW in a chapter, but collection never goes below the floor. So the floor alone does not cover one chapter of rent with zero income. The kept T1 business is what closes the gap: at the ~6-GD B1 payback (01:112), its income after the 30% garnishment covers $5.40/GD. Recommend a 13A acceptance check: a floored player with one T1 business and a garnishment plan has net cash flow ≥ rent at reference crowding. If the T1 business is lost (sold, or destroyed by an op), the runway is 926 GD; flag to Designer whether to raise the floor to $7,300 real (= 1 chapter of rent, 1,344 × 5.40) or keep it.
4. **The divestiture "haircut SINK" (13:278) has no SINK code.** Catalog `LAW_FORCED_DIVESTITURE` is TRANSFER SWAP_ASSET at @ASSET. If the buyer is an NPC (elastic) sector, cash flowing to the player is ELASTIC_IN (a FAUCET of 0.85 × FV), and the 15% "sink" is only foregone value, not money destroyed. Either rename 13:278 to "discount (value loss, no M0 effect)" or add a SINK leg. Recommend the wording fix, because a value discount is not a money sink. The same applies to the collection −15% sale.
5. **MSI is applied only to $ amounts** (floors, caps, protected floor). Percentages, multipliers and tick durations are never × MSI. The chapter cap reads peak NW in nominal terms at the same MSI basis as the verdict; use rank-basis real NW (÷MSI) for both, so a rising MSI cannot loosen the cap.
Tests: (1) TIERS from registry equal 13 §3.2 row by row; S6 cap null. (2) Held S5 = 4,320 ticks; S5 repeat = 8,640; a third verdict in a chapter stops at a cumulative 34,560. (3) An S3 at NW $6k fines $2,100, not $20k. (4) A $1,000,003-micro fine splits 850,003 / 100,000 / 50,000 (half-even on 85% and 10%, remainder to whistle) and sums exactly. (5) Collection on a $9k-liquid character with a $20k judgment takes $4,000, keeps $5,000 plus one T1 business, and opens a garnishment for $16,000. (6) At MSI 1.25 the protected floor = 6_250_000_000n.

## E-32 — 16B Quant rulings: actor model, mood/votes/elections, dynasties, aging, strikes, non-macro catalog, E-28 open points (Quant, 2026-10-21)
Sources:
- 16 §3.3.3–§3.3.5 (`:353-378`), §3.4.5–§3.4.7 (`:417-427`), §3.5.3/§3.5.6/§3.5.9 (`:438-490`), §3.7.5–§3.7.6, roster (`:331-348`).
- 04 §3.16.1–§3.16.4 and 23 regime rows (expansion 819 GD, recession 273 GD).
- 10 `:665`, `:718`, §3.25.
- p10 `src/engine/config.ts:55-56, :345`.
- E-30 item 3 (overlap ruling).

Checks: `/tmp/q16b.py` and `/tmp/q16c.py`. These are toy sims with a stylised macro path and party geometry, not engine runs, so **every value below is PROVISIONAL** unless it is marked CONFIRMED-BY-TEXT. "Designer to confirm" marks game-feel items.

### 1. Actor decision model (T16B-03/04)
**Choice rule.** argmax(U + τ·Gumbel) is exactly a multinomial logit (softmax with temperature τ). The sim matches the closed form to 3 decimals; at gap 0.1 and τ 0.125, P(best of 5) is 0.561 both ways. Use the softmax form in tests: P(a) = e^{U_a/τ} / Σ e^{U/τ}.

**P(choose best of 5), candidates spaced by gap:**

| gap | patience 1 (τ 0.05) | patience 0.5 (τ 0.125) | patience 0 (τ 0.20) |
|---|---|---|---|
| 0.05 | 0.64 | 0.38 | 0.31 |
| 0.10 | 0.87 | 0.56 | 0.43 |
| 0.20 | 0.98 | 0.80 | 0.63 |
| 0.30 | 1.00 | 0.91 | 0.78 |

- Not deterministic: below a gap of 0.1, even patient actors pick another option at least 13% of the time.
- Not noise: at a gap of 0.3, every actor type picks the best option at least 78% of the time. Normalised entropy runs from 0.01 to 0.99 across the grid.
- **τ = 0.05 + 0.15·(1 − patience): CONFIRMED.**
- **κ = 1.0: CONFIRMED.** Risk is normalised to [0, 1] and scaled by (1 − riskTolerance), so the term has the same scale as one goal term.

**Trust weight 0.3: CONFIRMED.** It is bounded at ±0.30 per counterparty. That matches one goal of weight 0.35 moving across most of its range: strong, but it does not decide alone.

**Memory weight 0.3: CHANGE (add a cap).** As written the sum is unbounded: three bad memories at salience 0.8 give −0.72, which blocks all dealing with that counterparty. **Cap the memory term at −0.3 per counterparty** (symmetric with trust).

**Other values:**
- Memory half-life 90·(0.5 + patience) GD: CONFIRMED-BY-TEXT (16 acceptance #9).
- Margin 0.05 over NO_OP: CONFIRMED. It is the size of the noise at mid patience.

Keys: `actor_risk_kappa` 1.0; `actor_trust_weight` 0.3; `actor_memory_weight` 0.3; `actor_memory_term_cap` 0.3; `actor_tau_base` 0.05; `actor_tau_impatience` 0.15.

### 2. Mood, floor votes, elections (T16B-08/09)
**Mood: CHANGE the macro coefficients ×5 → 4.0 / 6.0 / 7.5.** The sim runs regime-switching macro, a recession at g − g* = −3% and u − u* = +2%, with E-28's mpc and sentiment channel. Over a term, with the spec coefficients 0.8 / 1.2 / 1.5:
- approval p5/p50/p95 = 0.43 / 0.51 / 0.52;
- the coalition-collapse trigger (< 0.25 for 28 GD) fires in 0% of terms;
- a recession costs about 6 points.

With the change:
- 1 pp of unemployment costs 7.5 approval points (spec: 1.5);
- approval p5/p50/p95 = 0.21 / 0.53 / 0.61;
- the collapse trigger fires in about 55% of terms, which needs Designer review (see below).

Keep the sentiment term at 0.05, the 0.02/GD smoothing (time constant 50 GD) and the 0.98 scandal decay (half-life 34 GD).

**Elections: CHANGE β_inc 1.0 → 3.0 and add voter-median noise.** In the sim, the government is the two parties nearest the median at the last election, and P(incumbents keep a majority) is:

| setup | P(keep) | government share swing sd |
|---|---|---|
| spec (mood ×1, β_inc 1, static median) | 0.97 | 0.050 |
| mood ×5, β_inc 1 | 0.91 | — |
| mood ×5, β_inc 3 | 0.75 | 0.180 |
| plus median noise N(0, 0.05) per quarter | 0.73 | 0.194 |

- Cause: the issue term (β_iss 2 × distance about 0.5–1.5) dominates. voterMedian moves only through 0.97 decay and campaigns, so the party nearest the median wins every time.
- Change: β_inc 1.0 → 3.0, plus voterMedian noise N(0, 0.05) per axis per quarter (new key `pol_median_drift_sd` 0.05).
- β_iss 2.0, β_camp 0.3 and ε 0.15: CONFIRMED.
- Toy retention is 0.73. The real-world benchmark is roughly 0.5–0.65, and my geometry favours incumbents, so the engine figure should be lower. **How often governments fall is Designer to confirm** (election drama).

**Floor vote: CONFIRMED** (weights 2/2/1/1/1, noise sd 0.5).
- A government caucus on a government bill with fit +0.5 votes yes at σ(3) = 0.95.
- An opposing caucus at fit −0.5 votes yes at σ(−2) = 0.12.
- The bound in §3.5.7 holds: at 2·ideoFit + constFit ≤ −2 with L = +0.75, p_yes ≤ σ(−1.25 + noise), below 0.25 at the mean.

**Collapse threshold `coalition_collapse_approval` 0.25: keep**, but with the new mood it triggers in about half of terms. **Designer to confirm** whether 0.20 is wanted. 0.20 would cut the trigger roughly in half; that figure is a PROVISIONAL estimate, not run.

### 3. Dynasties, aging, strikes (T16B-06/07/10)
**Disputes: CONFIRMED.** No band exists in the spec, so these are reported for the Designer.

| dynasty state | per quarter | per GY |
|---|---|---|
| calm (SU 0, perf 0, debt 0.2, 1 faction) | 0.057 | 0.21 |
| 2 factions | 0.091 | 0.32 |
| mid-stress | 0.343 | 0.81 |
| crisis | 0.794 | 1.00 |

World-wide, 12 dynasties mostly calm give about 2.5–4 disputes per GY, or about 9–15 per chapter (1,344 GD = 3.69 GY).

**Aging: CONFIRMED** (actor_aging_rate 0.25, Gompertz 0.0003·e^{0.09(a−30)}).
- Hazard per GY: age 60 0.0011, age 70 0.0027, age 80 0.0068, age 90 0.0166.
- Per chapter: age 80 2.5%, age 90 6.0%.
- 600 actors aged U(25, 75): about 1.0 exits per GY, 3.8 per chapter [SUPERSEDED by E-34: 10.3 non-head exits per chapter long-run].
- Heads (12, aged U(55, 80), plus retirement at 0.05/GY at age ≥ 70): 0.13 head exits per GY, **0.47 successions per chapter**.
- Succession drama about once per two chapters is Designer to confirm. Raising head retirement to 0.25 × 0.4 would roughly double it (PROVISIONAL estimate, not run).

**Strikes: CHANGE the intercept −4 → −6.5, and add a cooldown.** The probability is per strategic epoch (7 GD); there are 8 union leaders and 52 epochs per GY.

| inputs | spec −4 | −6.5 |
|---|---|---|
| baseline (gap 0, profit growth 0.05, u 0.05, aggression 0.5) | 0.030/epoch, **12.5 strikes/GY** | 0.0025, **1.1/GY** (about 4 per chapter) |
| gap 0.5 | 51/GY | 4.7/GY |
| gap 1, aggression 0.8 | 190/GY (every leader almost every other week) | 27/GY (a strike wave under an inflation surprise) |

- Spec value: as written it is a permanent strike wave.
- Cooldown: a leader cannot ballot again within 91 GD of a settlement (new key `strike_cooldown_gd` 91).
- Other terms (3/2/−1.5/1.0, ballot 3–7 GD, U(3, 21) GD, capacity −30–60%, settlement 0.5–1.5·π): CONFIRMED.

Keys: `strike_logit_intercept` −6.5; `strike_cooldown_gd` 91; `dispute_logit_intercept` −3.

### 4. Non-macro catalog (T16B-10), kept items per E-30 item 3
Rates are per GD world-wide, drawn on `rng('world.shock', day)` sub-stream `nonmacro`.

| def | cat / tier | rate /GD | warning | effect (owner hook) |
|---|---|---|---|---|
| local storm | WEATHER / RIPPLE | 1/14 | forecast 0–1 GD | 10 cityDamage 0.05–0.15 in 1 district; 09 capacity −10–30% in district for 1–3 GD |
| local power cut | ACCIDENT / RIPPLE | 1/21 | none | 09 capacity −50–100% in district for 0.25–1 GD |
| factory fire | ACCIDENT / RIPPLE | 1/28 | none | 1 firm capacity −20–60% for 7–60 GD; 08 catLoss; C01 if the site closes |
| road closure | ACCIDENT / RIPPLE | 1/21 | 0–1 GD | 09 delivery +0.5–2 GD in district for 1–7 GD |
| port delay | ACCIDENT / RIPPLE | 1/28 | none | 09 delivery +1–3 GD at port city for 3–14 GD (C18) |
| local outbreak | HEALTH / RIPPLE | 1/56 | 1–3 GD | city ENTERTAINMENT/TRANSPORT demand −5–15%, HEALTH +5% for 14–42 GD; labour −0.5–1% |
| coastal hurricane | WEATHER / STORM | 1/364 | 2–5 GD | 10 cityDamage 0.2–0.5; 08 catLoss; 09 capacity −20–50% city-wide for 7–28 GD; C09 |
| regional epidemic | HEALTH / STORM | 1/546 | 3–7 GD | C19 at ⅓ size, bloc-wide, 28–91 GD; labour −1% |
| regional strike | LABOR | **not drawn** | ballot 3–7 GD | comes only from §3.7.5 (UNION_LEADER). Drawing it in the catalog too would double-count. |

Totals:
- RIPPLE 0.256/GD = 93 per GY, about 6.1 per real day world-wide (04's own ripples: 3.4/real day). With 15 cities, that is about 6.2 per city per GY.
- STORM 1.67 per GY (04's storms: 4 per GY).
- Strikes about 1.1 per GY (§3).

Constraints:
- At most 1 non-macro STORM active.
- No non-macro STORM within 7 GD of a 04 storm, the same spacing rule 04 uses for its own storms.
- First-24 h and final-48 h exclusions as AC-16B-10-2.

**Ripple pace is Designer to confirm:** halve all ripple rates if cities feel noisy.

**No double counting:**
- None of the kept defs calls 06 commodity supply or 05 vol hooks. Their effects are capacity, delivery, demand share and damage only.
- Drought, crop disease, chip-fab outage, shipping lane, bank run, recall, scandal, cyber and data-center outage stay 04 kinds (E-30).
- Test AC-16B-10-4 should also assert that no kept def calls `06.supplyShock`, `05.volRegime` or `04.demandShock`.

**Price impact vs engine:**
- Engine stock (p10 `config.ts:55-56`, 252 days/yr): vol 0.30 means variance 0.09/yr and daily σ 1.89%. Jumps run 3/yr with mean size 4% up and 6% down, so jump variance is 0.0156/yr.
- Estimated price moves via fundamentals: factory fire −2% on 1 firm (30% of fires hit a listed firm); city ripples 0.1–0.5% on about 16 listed firms per city; hurricane −2% on 16 firms; epidemic −1% on 48 firms.
- Added variance is about 7.3e-5 per listed company per GY (sd 0.86%/GY), **0.08% of engine variance**, under 0.5% of jump variance even if 1 GY maps to 1 engine year (252 vs 364 days).
- These events are narrative and fundamentals, not a vol source. The engine's jump rates stay unchanged.

Keys: `world_event_rate_<defId>` family (values above), `world_event_storm_gap_gd` 7.

### 5. E-28 open points
**(a) Cosmetic money to the city government:** besides naming rights, **public-space sponsorship (park, plaza)** should also be a TRANSFER to the city gov. 10 §3.25 says these spaces are city-owned and sold per chapter ($250k–$20M), the same case as naming rights under E-9. Proposed: new `CITY_SPONSORSHIP` TRANSFER PAY, legA CLASS 5200|5050, legB 4190. Producer call.
- Facade kits, company kits, crowns, founding plaque and skyline portrait stay BURN `RE_COSMETIC`: they are system goods with no city payee.

**(b) Rent unit: CONFIRMED-BY-TEXT per GD.** 10 `:665` defines `marketRent_unit_perGD = R_{d,u} · area · amenityMult · conditionMult`, with R in money per m² per GD (`:85`). The vacant-utilities charge 0.02 × marketRent per vacant unit per GD (`:718`) is therefore 2% of one day's rent per vacant day, as E-29 recorded.

### 6. Also seen (E-30 item 2, amounts gated on Quant)
`ISSUE_CAMPAIGN`: minimum $1M real per buy, as in §3.5.8.
- Effect: Δsupport = 0.05·ln(1 + spend/$10M), so $10M buys 0.035. Hitting the 0.15 quarterly cap alone takes $10M·(e³ − 1) ≈ $191M, which is 3.8% of R3 and 0.19% of R4 net worth.
- Sizing check: proposed CONFIRMED (PROVISIONAL).

`PETITION_COMMIT`: $50M within 28 GD, as in §3.5.4. That is 2.5% of the R5 threshold and 50% of R4: reachable only by R4+ coalitions, as intended. Proposed CONFIRMED (PROVISIONAL).

Both are real × MSI. If Producer accepts, the gate AC-16B-09-GATE can clear.

Backup: `errata.pre-E30.bak` (taken before this entry; renumbered E-31 → E-32 after a concurrent E-31 landed).

## E-33 — Application of E-32 (Quant) plus Producer and Designer rulings (Systems, 2026-10-21)
Backups: `/workspace/spec/backups/E33/`.

1. **E-32 applied to 16B (all PROVISIONAL).** T16B-03: softmax choice, κ 1.0, trust 0.3, τ = 0.05 + 0.15·(1−patience); memory term capped at −0.3 per counterparty (AC-16B-03-SOFTMAX, AC-16B-03-MEMCAP). T16B-08: mood coefficients 4.0 / 6.0 / 7.5 (AC-16B-08-MOOD); collapse threshold stays 0.25, Designer to confirm 0.20. T16B-09: β_inc 3.0, voterMedian drift `pol_median_drift_sd` 0.05 per axis per quarter (AC-16B-09-DRIFT). T16B-10: strike intercept −6.5, 91-GD cooldown after settlement (AC-16B-10-STRIKE); non-macro rates (93 ripple, 1.67 storm per GY; AC-16B-10-RATES); AC-16B-10-4 extended: no direct commodity, volatility or demand-shock hook. 23: 11 new rows (actor_*, pol_median_drift_sd, strike_logit_intercept, strike_cooldown_gd, dispute_logit_intercept, world_event_storm_gap_gd). The `world_event_rate_<defId>` family is encoded in T16B-10 only, not as 23 rows.
2. **CITY_SPONSORSHIP approved (Producer).** TRANSFER PAY, legA CLASS 5200|5050, legB 4190, amounts [Quant sign-off]; rows added to catalog and legpolicy. CITY_COSMETIC note no longer lists sponsorships. 10 §3.25 wording updated. Facades, kits, crowns, plaques and portraits stay BURN.
3. **Gate amounts confirmed (Producer).** `ISSUE_CAMPAIGN` min $1M real × MSI; `PETITION_COMMIT` $50M real × MSI within 28 GD. AC-16B-09-GATE replaced by AC-16B-09-AMOUNTS.
4. **Designer cleared E-24.** All "Designer review pending" marks removed (T13A-03, T13B-06, T14B-07, T14B-11, E-24 item 4).
   (a) A reversal posts one causal Wire/Messages item "Conviction overturned on appeal" linked to `law.conviction_reversed`; the case close card shows the fine refund (AC-13B-06-WIRE, AC-16A-08-REVERSAL).
   (b) A cleared record leaves no trace in profile, boards or rival views (no "formerly convicted" tag, caseId absent from every public payload); Notoriety-tier cosmetics already unlocked stay; only record and score are cleared (AC-14B-07-NOTRACE, AC-14B-11-NOTRACE).
5. **FACT_SALE_NPC and prefix rulings (Producer).** Backups: `/workspace/spec/backups/E33b/`.
   (a) `FACT_SALE_NPC` is a TRANSFER PAY from the NPC firm sector (legA 5000, sector frm) to player revenue (legB 4000), not a FAUCET: NPC money is closed (T16A-05). Catalog and legpolicy rows added, amounts [Quant]. 16 §3.14 table updated. AC-16C-05-CLOSED added with a closed-money test.
   (b) `SECRET_PATH_FEE` is an alias of `WLD_ARCHIVE_PURCHASE` (aliases.csv; 16 §3.14). `CATALOG_GAPS_16C` is empty; T16C-04 no longer rejects paid paths.
   (c) `hst_`, `fct_`, `sec_`, `brf_`, `brk_` added to the E-26 id table and the `no-noncompliant-entity-prefix` allowed list (T10A-01, 10A `_unit.md`, T16C-01, 16C `_unit.md`).

Open: no card owns the close-card or rival-view UI; the ACs pin payloads only (view owner, likely 17/18, to cite them).

## E-34 — 16B feel targets retuned (Designer targets, Producer adopted; Quant, 2026-10-21)
Supersedes the matching E-32 items. The sims are toys (`/tmp/q16d.py`, `/tmp/q16f.py`, `/tmp/q16g.py`, `/tmp/q16e.py`): stylised regime macro (expansion 819 GD, recession 273 GD), not the engine. All values are PROVISIONAL until 20 runs the ACs below on the engine.

**1. Government collapse, target 15–25% of terms (aim 20%).**
- Values:
  - Mood coefficients stay at E-32's ×5: 4.0 / 6.0 / 7.5.
  - `coalition_collapse_approval` 0.25 → **0.20**. A partner leaves with probability 0.5 per game quarter while the trigger holds (spec).
  - New `coalition_collapse_max_per_chapter` = 1 per bloc.
- Collapse share of terms, 400 terms per cell, 95% CI ±1.96·√(p(1−p)/400):

  | threshold | mood ×3 | mood ×4 | mood ×5 |
  |---|---|---|---|
  | 0.25 | 0 | 0.138 | 0.435 |
  | 0.22 | 0 | 0.035 | 0.290 |
  | **0.20** | 0 | 0.018 | **0.193 ± 0.039** |
  | 0.18 | 0 | 0 | 0.098 |
- Incumbent hold: mood is unchanged from E-32, so the toy incumbent hold stays at about 0.73. That holds only in the toy: there, a collapse does not feed into the election. In the engine, a re-formed or snap government will lower the hold somewhat. AC-16B-09-HOLD watches it.
- ACs:
  - **AC-16B-08-COLLAPSE:** over ≥ 400 seeded terms (seeds 1..400, `rng('world.politics')`), the share of terms with ≥ 1 collapse is in [0.15, 0.25]. Expected 0.19 ± 0.04 (95%).
  - **AC-16B-08-COLLAPSE-CAP:** no bloc has 2 collapses in one chapter (all seeds).
  - **AC-16B-09-HOLD:** incumbent hold over ≥ 400 elections is in [0.55, 0.80]. Toy value 0.73 ± 0.04. This band is Designer to confirm.

**2. Dynasty successions, target 0.7–1.3 per chapter world-wide (aim 1.0).**
- Finding: E-32 had 0.47. Raising the ≥70 retirement probability does not help: 0.25×0.2 through 0.25×0.6 gives 0.44–0.49. The bottleneck is aging. At 0.25 actor-years per GY, a new head aged 45–60 takes 40–100 GY to reach 70.
- Options, measured over 2,004 chapters, ±95%:

  | option | successions/chapter | all actor exits/chapter |
  |---|---|---|
  | retirement age 65, p 0.25×0.2 | 0.66 ± 0.04 | — |
  | retirement age 62, p 0.25×0.2 | 0.79 ± 0.04 | — |
  | **retirement age 60, p 0.25×0.3** | **1.04 ± 0.05** | about 11.3 (+0.5) |
  | `actor_aging_rate` 0.25 → 0.5 | 1.04 ± 0.05 | 21.6 ± 0.2 (from 10.8, doubles roster churn) |
- Values (heads-only option): heads retire from age **60** with probability **0.25 × 0.3 = 0.075 per GY**. `actor_aging_rate` stays 0.25, and the death hazard is unchanged. New keys: `dynasty_head_retire_age` 60, `dynasty_head_retire_p_actor_year` 0.3. The successor is the actual heir by rule; the sim assumed the heir is aged U(45, 60).
- Side effect: actor exits rise only by the extra head exits, from about 10.8 to about 11.3 per chapter (+0.5). The non-head hazard is untouched. Note: the 3.8 exits per chapter in E-32 came from a 37-GY run, before ages reached steady state; the long-run figure is 10.3 non-head exits per chapter.
- ACs:
  - **AC-16B-07-SUCC:** over ≥ 1,000 chapters, the world-wide succession count per chapter is in [0.7, 1.3]. Expected 1.04 ± 0.05.
  - **AC-16B-07-EXITS:** the non-head exit rate is within ±10% of 10.3 per chapter.

**3. Small world events, target about 46 per GY, same mix.**
- Values: all RIPPLE rates in E-32 §4 ×**0.5**. Per GD:

  | event | rate | per GY |
  |---|---|---|
  | local storm | 1/28 | 13.0 |
  | power cut | 1/42 | 8.7 |
  | factory fire | 1/56 | 6.5 |
  | road closure | 1/42 | 8.7 |
  | port delay | 1/56 | 6.5 |
  | local outbreak | 1/112 | 3.25 |
  | **total** | | **46.6** (about 3.1 per real day) |
- STORM-tier rates are unchanged: coastal hurricane 1/364 per GD, regional epidemic 1/546 per GD, 1.67 per GY.
- Measured (1,000 GY seeds): mean 46.95 per GY; per-GY 95% range [34, 60].
- ACs:
  - **AC-16B-10-RIPPLE:** over 1,000 seeded GY, the mean RIPPLE count per GY is in [45.7, 47.5] (46.6 ± 1.96·√46.6/√1000 = ±0.42, widened to ±0.9 for 3σ). Each category is within 3σ of rate × 364 × 1,000.
  - **AC-16B-10-MIX:** each category's share is within ±1 percentage point of 27.9 / 18.6 / 14.0 / 18.6 / 14.0 / 7.0%.
- Price impact from E-32 halves: about 0.05% of engine variance.


## E-35 — 16C Quant rulings: gate amounts, fact sales, discovery costs, history, tech, event rates, 04 coverage of moved items (Quant, 2026-10-21)
Sources:
- 16 §3.9.1 (`:635`), §3.10.1–§3.10.3 (`:645-661`), §3.11.2–§3.11.4 (`:668-690`), §3.5.4, §3.5.8.
- 23 rows `:946-982`.
- 04 `:50-56`, §3.16.3 (`:1005`), storm shocks (`:1031`).
- Errata: E-24 (`INV_SQRT_*`, `:521-551`), E-28 §6, E-32 §4, E-34.

All values are closed-form checks, so everything is PROVISIONAL.

### 1. Gate amounts — CONFIRMED; units and keys
No 16C card has fields for these. They live on T16B-09 (AC-16B-09-AMOUNTS) and 16#25, where units match: real $ × MSI at the posting tick.
| key | unit | default | micro (real, ×MSI at post) | source |
|---|---|---|---|---|
| `campaign_min_real` (new) | real $ per buy | $1,000,000 | 1_000_000_000_000 | 16 §3.5.8; E-32 §6 |
| `petition_threshold_real` (23 `:975`) | real $ committed | $50,000,000 | 50_000_000_000_000 | 16 §3.5.4 |
| `petition_window_game_days` (new) | GD | 28 | n/a | 16 §3.5.4 |

### 2. Fact sale price — CHANGE (faucet loop)
**Price as written.** $25k × (1 + 9·s) × audience, with s ∈ [0, 1] and audience ∈ [0.5, 2] (16 `:687`). That gives $12.5k to $500k per sale. The $1M/chapter cap binds after between 2 sales (maximum price) and 80 sales (minimum price); a base-case sale at s = 0.5, audience 1 is $137.5k, so the cap binds after about 8.

**Base-case sale as % of NW:**
| player | NW | sale % NW |
|---|---|---|
| day 8 | $7,067 | 1,946% |
| day 40 | $20,583 | 668% |
| day 112 | $193k | 71% |
| day 168 | $565k | 24% |
| day 240 | $1.76M | 7.8% |
| R3 entry | $5M | 2.75% |

**Arbitrage loop: yes.** [SUPERSEDED by E-35 amendment (a): TRANSFER from frm, indirect faucet] `FACT_SALE_NPC` is a FAUCET (new money), and the cheap sources are:
- ARCHIVE_STUDY: $5k at p 0.6, so $8.3k per fact.
- RESEARCH_MAP: $25k at p 0.8, so $31.25k per fact, plus the Desk fee of $1,550/GD at R3.
- CONVERSATION: free.

Against a $137.5k base sale, that is +$106k to +$129k per cycle, up to the $1M cap: 20% of NW per chapter at R3, and far more below R3.

**Set:**
- `fact_sale_base_real` $25k → **$5k** (23 range minimum). New range: $2.5k to $100k; base case $27.5k.
- `fact_sale_cap_real_per_chapter` $1M → **$100k** (23 range minimum).
- New gate `fact_sale_min_rank` = **R2**.

**Result:**
- The cap is 40% of NW per chapter at R2 entry ($250k), 5.7% at $1.76M and 2% at R3. A base-case sale is 11% of NW at R2 entry.
- The archive loop margin is about $19k per sale, but the cap bounds it at $100k per chapter.
- A sale makes the fact public, so each fact sells once world-wide. Add AC-16C-05-ONCE: a second `fact.sell` of a public fact is rejected.

Also, the R3 Desk at $1,550/GD costs $83k over a 54-GD chapter of use, so the Desk is not paid back by sales alone. This loop is not against E-28 prices once capped.

### 3. Discovery costs vs the investigation sqrt formula
E-24: P(S) = min(1, 0.25·√(S / $50k)), so spending S to reach evidence share p costs S = $50k·(p/0.25)².

**Expected cost per success:**
| path | cost per success | duration |
|---|---|---|
| FILINGS_CHAIN | $0 | instant |
| ARCHIVE_STUDY | $8.3k | 2 GD |
| RESEARCH_MAP | $31.25k per layer, $94k for 3 layers | 1 GD each |
| DUE_DILIGENCE | 12's dossier price / 0.7 | 12's duration |
| CONVERSATION | $0 at trust ≥ 40, p 0.3–0.8 | 1 GD |

**Investigation spend for comparison:** 40 points costs $128k, 55 points $242k, 70 points $392k.

**Undercut risk.** REPORT of a fact opens a 13 lead. If that lead counted as full evidence, an $8.3k archive fact would replace $128k+ of investigation spend.

**Rule:** a reported fact adds its path's expected cost to the investigation's cumulative S, on the same √ curve:
- archive +$8.3k → 0.25·√(0.167) = **10 points**;
- research map, 3 layers, +$94k → **34 points**;
- free paths add $0, so they only open the lead.

The two systems then price evidence identically and neither undercuts the other. Add AC-16C-04-EVID.

Path defaults: CONFIRMED as written.

### 4. History, tech, event rates
**History: CONFIRMED.**
- durationFactor = 1 + log10(1 + d)/2, capped at 2: 1 GD → 1.15, 30 GD → 1.75, cap reached at d = 99 GD.
- With nw ≤ about 1.8 (E-28 §4), threshold 0.4 records, for example, a world CENTRAL_BANK item at magnitude ≥ 0.23 with a 30-GD effect.
- Single-company EARNINGS (nw ≤ 0.15·mag) is never recorded, which is correct for an archive.
- Permanent at 0.6 means about 1.5× the record bar. CONFIRMED.

**Tech: CONFIRMED.** Cumulative baseline cost to reach level N = 1.6·(1.25^N − 1)/0.25 chapters.
| level | cumulative chapters | real time (56 real days per chapter) |
|---|---|---|
| L1 | 1.6 | |
| L2 | 3.6 | |
| L3 | 6.1 | |
| L4 | 9.2 | |
| L5 | 13.1 | about 2 real years at baseline |
| L8 | 31.7 | |

- Eras (8 domains, AI index ignored): era 1 at about 1.6 chapters, era 2 at about 4.3, era 3 at about 8, era 4 at about 15 [SUPERSEDED by E-36: measured 1.97 / 5.39 / 9.83 / 18.30 at current params].
- The 14-real-day pace limit (0.25 chapter) never binds at baseline.
- **Designer to confirm** the era pace.

**Breakthrough effects vs engine growth (p10 stock drift 2–5% per year; 23 `macro_ai_productivity_max` 0.005 per GY).**
- AUTOMATION L3, labour share −0.02: manufacturing profit share 0.15 → 0.17, about +13% fundamental for those firms. Spread over the about 2.5 chapters (9 GY) between levels, that is about +1.4% per GY, inside the engine's drift band. Other listed effects (−5% to −20% sector costs) are the same order.
- CONFIRMED as written; incremental levels beyond 5 at 0.5×.

**Kept-event rates: MISMATCH.**
- T16B-10 AC-16B-10-RATES still carries the E-32 rates (local storm 1/14 … outbreak 1/56, 93 per GY).
- E-34 halved them: local storm 1/28, power cut 1/42, factory fire 1/56, road closure 1/42, port delay 1/56, local outbreak 1/112, for 46.6 per GY.
- Unchanged: coastal hurricane 1/364, regional epidemic 1/546, and regional strike, which comes from the union model only (intercept −6.5, cooldown 91 GD, about 1.1 per GY).
- Systems to update the card.

### 5. 04 coverage of the 9 moved items (E-30 item 3)
04 ripples (`:1005`): Poisson 1/7 per GD, kind uniform over 5, so each kind is 1/35 per GD (10.4 per GY). Target per kind, sign 50/50, size U(3–8%), length 1–3 GD. 04 storms: 1/91 per GD, uniform over 8 kinds.

| moved item | 04 kind | covered? | needed |
|---|---|---|---|
| drought, crop disease | COMMODITY_SUPPLY | **partly** | Agricultural target, sign fixed to supply cut (price up), as a sub-def/skin |
| chip-fab outage | COMMODITY_SUPPLY (if chips are a 06 commodity) else SECTOR_SHOCK semis | **partly** | Skin, sign fixed negative for the sector |
| shipping-lane disruption | COMMODITY_SUPPLY | **partly** | The 04 ripple has no delivery effect; add a C18 trigger (09 delays +1–3 GD for 7–56 GD) on this skin |
| mid-size bank run | CREDIT_WOBBLE / LIQUIDITY_HICCUP | **no** | CREDIT_WOBBLE is bloc-wide PD ×1.4 and HICCUP is market depth; neither hits one bank's deposits. Add CREDIT_WOBBLE sub-def `BANK_RUN_LOCAL`: 07 `depositConfidenceShock −0.10 to −0.20` on the weakest NPC bank in a bloc, 0–2 GD, precursor 1–2 GD (storm rule) |
| product recall, celebrity scandal | SECTOR_SHOCK | **no (scope)** | SECTOR_SHOCK targets a sector. Add scope COMPANY: one listed firm, −2% to −8% revenue for 28–91 GD (recall) or a 14 Rep/CEO hook (scandal), sign negative |
| small cyber incident | SECTOR_SHOCK | **partly** | COMPANY scope, firm offline −20–50% capacity for 0.5–2 GD, outcome-only description |
| data-center outage | SECTOR_SHOCK | **partly** | Add a C17 trigger (compute price +x) |

- **Rates.** The skins draw inside the existing kind rates, by weight within kind, so **04's total stays 1/7 + 1/91 per GD = 0.154 per GD (56.1 per GY: 52.0 ripples, 4.0 storms). The change is 0.**
- Suggested weights within kind (PROVISIONAL): COMMODITY_SUPPLY with drought 0.25, crop disease 0.15, chip-fab 0.15, shipping 0.15, generic 0.30; SECTOR_SHOCK with recall 0.2, scandal 0.15, cyber 0.15, data-center 0.1, generic 0.4; CREDIT_WOBBLE with BANK_RUN_LOCAL 0.5.
- That gives, per GY: drought 2.6, crop disease 1.6, chip-fab 1.6, shipping 1.6, recall 2.1, scandal 1.6, cyber 1.6, data-center 1.0, and bank run 0.25 (4/8 × 0.5).
- If the Designer wants these on top of 04's rhythm instead, 04's ripple rate would rise by the added amount. Not recommended: 04 already runs at 3.4 ripples per real day.
- Owner: 04 (Systems to add the sub-defs to T04-18).


## E-36 — Era 4 timing and era foreshadowing (Quant, Designer feedback on E-35; 2026-10-21)
Sim: `/tmp/qera.py`. 5,000 seeds; 8 domains; per-domain R&D pace multiplier lognormal σ 0.15 per seed, robustness check at σ 0.3. Levels are integer: L(t) = floor(log(1 + t·m·(g−1)/base)/log g). eraScore = Σ levels; the AI-index term is set to 0, as in E-35. `era_min_chapters` 2 applied. PROVISIONAL (not an engine run).

**How era timing derives.** Domain d reaches level N at T_N = base·(g^N − 1)/((g − 1)·m_d) chapters. Era k starts when Σ_d L_d(t) ≥ thr_k, thr = [0, 8, 18, 30, 45]. With equal pace, that is about the time each domain reaches level thr_k/8, plus the floor effect: the score steps by whole levels, so domains must actually complete a level. This puts every era later than the E-35 average-level estimate.

**Correction to E-35 §4.** Measured with the current params (base 1.6, g 1.25), era arrival in chapters:
| era | median | p10 | p90 |
|---|---|---|---|
| 1 | 1.97 | 1.77 | 2.23 |
| 2 | 5.39 | 4.90 | 5.88 |
| 3 | 9.83 | 9.06 | 10.64 |
| 4 | 18.30 | 16.94 | 19.79 |

E-35's 1.6 / 4.3 / 8 / 15 were optimistic by about 20%. **SUPERSEDED** by these figures.

**Options, era-arrival median (p10–p90), chapters:**
| change | era 1 | era 2 | era 3 | era 4 |
|---|---|---|---|---|
| thr4 45→40 only | 1.98 | 5.38 | 9.81 | 15.06 (13.93–16.31) |
| thr4 45→36 only (one key) | 1.98 | 5.40 | 9.82 | **12.87 (11.90–13.88)** |
| base 1.6→1.3 only (one key) | 1.60 | 4.38 | 7.99 | 14.87 |
| **base 1.3 + thr4 40** | **1.61 (1.44–1.82)** | **4.37 (4.00–4.79)** | **7.98 (7.38–8.65)** | **12.24 (11.32–13.26)** |
| base 1.3 + thr4 39 | 1.60 | 4.39 | 7.98 | 11.77 (10.88–12.70) |
| σ 0.3 check, base 1.3 + thr4 40 | 1.83 | 4.18 | 7.91 | 12.16 (10.53–14.00) |

**Recommendation: two keys.** `tech_base_cost_chapters` 1.6 → **1.3** and `era_thresholds` [0, 8, 18, 30, 45] → **[0, 8, 18, 30, 40]**.
- Eras 1–3 land on the Designer-approved 1.6 / 4.3 / 8, within ±1% of target.
- Era 4 lands at 12.2, inside the 11–13 band.

**Single-key alternative.** `era_thresholds[4]` = 36 gives era 4 at 12.9 (11.9–13.9). Eras 1–3 then stay at their true current 2.0 / 5.4 / 9.8, which is +23% against the approved figures, outside ±10%.

**Side effects:**
- base 1.3 makes every breakthrough 19% sooner. Breakthrough effects per GY rise in proportion: AUTOMATION, from E-35's ~1.4% to ~1.7% per GY, still inside the engine's 2–5% drift.
- The 14-real-day pace limit (0.25 chapter) still never binds.
- With the AI-index term (up to +10), all eras come earlier; 20 must re-measure on the engine.

**ACs:**
- **AC-16C-03-ERA:** over ≥ 1,000 seeded worlds, the era-4 median chapter is in [11, 13], and the era 1–3 medians are within ±10% of 1.6 / 4.3 / 8.0. Expected 1.61 / 4.37 / 7.98 / 12.24.
- **AC-16C-03-ERA-P90:** the era-4 p90 is ≤ 14.

### Era foreshadowing on the Wire (target lead about 7 GD)
**Mechanism.** At each day close, 16C projects the eraScore 7 GD ahead from current progress and rnd: projected level = level + 1 if progress_d + 7·rnd_d/cost_d ≥ 1. The era date is the first allowed crossing day after `era_min_chapters` and the finish-window rule. When the projection first shows a crossing within [5, 9] GD, the precursor sequence is scheduled.
- Precursors are real causal events, linked by CausalLink to the gating breakthrough (N1/N2 hold).
- They are never certain: if rnd drops (players cut R&D), the era can slip. The precursors stay true statements about progress.

**Event types (new NewsKind rows in 22, all PUBLIC):**
| event | owner | timing (relative to era day T) | count | nw | publish |
|---|---|---|---|---|---|
| `tech.patent_filing` | 09 / 15 filings, gating domain's leading NPC firms | T − U(7, 9) GD | 2–3 | base 0.15 × mag (filing value / sector R&D, 0.7–1.0) × reach SECTOR 0.5 = 0.053–0.075 | candidate (≥ 0.05) |
| `tech.late_stage_trial` | 09/11, the §3.10.2 telegraph of the gating breakthrough | T − U(3, 7) GD | 1 | base 0.4 × mag (domain progress 0.6–1.0) × reach WORLD 1 = 0.24–0.40 | candidate; normally top-40 |
| `world.era.imminent` | 16C, analyst/Desk note "a new age within days" | T − U(1, 2) GD | 1 | base 0.5 × 1 × 1 = 0.5, telegraph bonus at the era item | **alwaysPublish** |
| the era item | ERA, existing | T | 1 | — | alwaysPublish (§3.6.2) |

**Lead time.** The first signal arrives U(7, 9) GD ahead (median 8). The first top-ranked item arrives at a median of 5 GD. Overall lead to the first Wire item: median 8 GD (p10 7.2, p90 8.8) when the projection is stable. If the era is delayed by the 2-chapter gap or a finish window, the sequence is re-anchored to the allowed day T.

**Item weights.** Precursors make up 4–5 items in total per era, about 0.01% of the 40/GD feed over the window. With the 1.5× telegraph bonus, the ERA item ranks top-5 that day.

**ACs:**
- **AC-16C-03-FORESHADOW:** in ≥ 95% of seeded era changes, ≥ 1 PUBLIC precursor linked to the gating breakthrough publishes 5–9 GD before the ERA item, and `world.era.imminent` publishes 1–2 GD before it.
- **AC-16C-03-NOFALSE:** a precursor whose era slips past T + 14 GD gets a follow-up item ("timeline pushed back"). No precursor ever states an era date.


## E-35 amendment (Quant, 2026-10-21): fact-sale ledger class; E-32 exits; collapse-cap unit
**(a) E-35 §2 restated (Producer ruling E-33: `FACT_SALE_NPC` is a TRANSFER).** The sale is a TRANSFER PAY from the buying outlet's NPC firm (`frm`, outside S) to the seller (human).
- **Direct M0 effect: none.** M0 and ΔM0_player are unchanged, because both holders are outside S. In the holder-class split (INV-LED-019 holder-class view), the human class gets +price and the npcFirm class −price.
- **Indirect faucet.** 16 §3.2.5 refills NPC cash that leaves to players through 04's nominal-GDP closure (`ROW_NPC_INCOME`, FAUCET into frm). Every dollar drained by fact sales is therefore replaced by a FAUCET into npcFirm on the following closure. The net effect on outside money is a FAUCET of the same size, with a lag of one day close.
- **What the ledger shows:**
  - human-class X_in from npcFirm via `FACT_SALE_NPC` = Σ sale prices;
  - npcFirm F_p rises by the same amount at the next closure.
  - sinkMult sees it through F_p (npcFirm), not as a human FAUCET.
- **Bound per R2+ character:** ≤ $100k real per chapter. For N such characters, the indirect faucet is ≤ $100k·N per chapter, which is $1.86k·N per GD over a 54-GD active chapter.
- **Reference sizes** (cap as % of NW per chapter): R2 entry ($250k) 40%; NW $1.76M 5.7%; R3 2%. The R2 gate keeps the R0–R1 percentiles (day 8 $7k, day 40 $20.6k) out of it.

**Per-cycle margins (values kept: base $5k, cap $100k per chapter, R2 gate, sell-once):**
| source | cost per fact | margin against a $27.5k base-case sale |
|---|---|---|
| ARCHIVE_STUDY | $8.3k (a SINK, burned) | +$19.2k transfer-in, against $8.3k sunk |
| RESEARCH_MAP | $31.25k (a SINK) | −$3.75k, not profitable |
| CONVERSATION | $0 | +$27.5k, limited by the trust ≥ 40 prerequisite and the cap |

- The best case is about 3.6 base-case sales per chapter, reaching $100k. Net human gain ≤ $100k − costs. Net world outside money ≤ +$100k (indirect faucet) − $30k (archive SINK) per capped character per chapter.
- Text in E-35 §2 that calls the sale a "FAUCET (new money)" is **SUPERSEDED** by this amendment.

**(b)** E-32 §3 "600 actors aged U(25, 75): about 1.0 exits per GY, 3.8 per chapter" is **SUPERSEDED** by E-34: the long-run figure is 10.3 non-head exits per chapter, about 11.3 including heads under the E-34 retirement rule.

**(c)** E-34 §1 `coalition_collapse_max_per_chapter` = 1 is **per bloc** (16 politics unit: one Legislature per bloc, §3.5.1). E-34 already states per bloc; this confirms the unit (the Designer brief said "per country"). AC-16B-08-COLLAPSE-CAP: no bloc has 2 collapses in one chapter.


## E-37 — 07B default-management timings at tick scale; ISA and LIC4 custody fees (Quant, 2026-10-21)
Sources:
- 07 §3.17.2–§3.17.8 (`:842-891`), `:855`, `:913`.
- Time scale: 16 §3.6.6 (1 tick = 5 real s); 10 `:7` (1 GD = 720 ticks = 1 real hour); 14 `:119`.
- p10 `src/engine/trading.ts:94-99, :127, :163-170`; `config.ts:313-327` (impactY 0.8, permanentImpactShare 0.5, maxAdvPerTick 3, impact half-life 360 ticks); ADV = 0.004 × market cap (`config.ts:54`).

Closed form only (no engine run), so everything is PROVISIONAL.

### (a) §3.17.7 timings in ticks (Producer ruling)
**Real-time mapping.**
| span | ticks | game time | real time |
|---|---|---|---|
| 1 tick | 1 | 2 game minutes | 5 s |
| d+30 | 30 | 1 game hour | 2.5 real minutes |
| auction window d+30…d+60 | 30 | | 2.5 min |
| d+90 replenishment and assessments | 90 | | 7.5 min |

The Producer brief's "about 2 real minutes" is 2.5 min.

**Engine impact** (temporary = 0.8·σ_d·√(N/ADV); permanent = 0.5 × that). Stock vol 0.30, so σ_d = 1.89% (252-day engine year). Book spread over 20 names.
| book | per-name size | temp | perm | close-out cost | ticks to sell at the 20% participation cap |
|---|---|---|---|---|---|
| mid-size $2B, names with ADV $400M | 0.25 ADV | 0.76% | 0.38% | ≈ $23M | 900 (1.25 GD) |
| large $20B, same names | 2.5 ADV | 2.39% | 1.20% | ≈ $0.72B | 9,000 (12.5 GD) |
| large $20B, small caps (ADV $40M) | 25 ADV | 7.56% | 3.78% | ≈ $2.3B | 90,000 |

Benchmarks:
- IM (99%, 720-tick MPOR) ≈ 2.33·σ_d = 4.4%. Auction reservation = value − 2 × IM ≈ value − 8.8%.
- At the 20% cap, the market can absorb only 0.2 × 30/720 = **0.83% of ADV in a 30-tick window**.
- The engine's 3 × ADV per-tick cap is not binding; the 07 §3.16.4 participation rule is.

**Feasibility by stage.**
1. **Porting, 30 ticks.** NPC backups decide in one tick, so this works. Player backups decide by intent, and 2.5 real minutes is too short for a human, so most player-backup ports would fail by default. **Minimum 120 ticks (10 real min) for player backups.** NPC acceptance stays immediate.
2. **Hedging from d+1 at 20% participation.** A 30-tick hedge window covers 0.83% of ADV, so the ≥ 80% VaR cut is reachable only through index futures, RFQ and liquid names. For a large book in cash names it takes 12.5 GD at the cap. Hedging is not cash liquidation: the auction moves the risk. Rule: hedge with the most liquid instrument per risk factor (index futures, ADV about 10× a single name). The VaR target is measured at auction start, and the auction does not wait for it.
3. **Auction, 30 ticks.**
   - **Price:** feasible. Members price lots against the engine's cost to work them out: 0.76–2.4% for liquid books, inside the 8.8% reservation margin. Even the illiquid large book (7.6% + 3.8%) clears near reservation.
   - **Latency:** NPC members bid in 1 tick. Player members must bid where they hold positions, and 2.5 min penalises them: they are juniorized as worst bidders by default.
   - **Minimum:** 120 ticks per round, 2 re-offers, so the auction stage runs d+120 … d+480.
   - **Bidders:** 14 NPC members (22). Require ≥ 3 sealed bids per lot, including ≥ 2 NPC; otherwise re-offer at half size.
4. **Losses, then waterfall.** Instant at close; no timing issue.
5. **Replenishment and assessments at d+90.** §3.17.5 gives new contributions 7 GD; d+90 is 7.5 real min. Members with cash can pay, but a member that must sell assets can raise only 0.83% of ADV per 30 ticks. **Minimum: due at d + 720 (1 GD = 1 real hour) for replenishment and assessments.** Members below contribution are risk-reducing-only until paid (as §3.17.5). The 30-GD cooling-off and 5-GD VMGH stay in GD.

**Proposed timings:** porting d+1…d+120; hedging from d+1; auction d+120…d+480 (3 × 120-tick rounds); close d+480; replenishment and assessments due d+720.

**ACs:**
- **AC-07B-10-PORT-WINDOW:** a player backup that accepts by intent at tick d+100 ports. An NPC backup decides at d+1.
- **AC-07B-10-AUCTION-WINDOW:** each auction round lasts 120 ticks. A player bid submitted 90 ticks into the round counts. ≥ 3 bids per lot, else re-offer at half size; after 2 re-offers, tear-up.
- **AC-07B-10-HEDGE:** hedging respects ≤ 20% participation per tick per asset (engine ADV/720 basis) and uses index futures first. VaR is measured at d+120, and the auction starts regardless.
- **AC-07B-11-REPLENISH:** replenishment and assessment calls fall due at d+720. A member that pays at d+700 is not in default. An unpaid call at d+720 is a member default under §3.17.6.
- **AC-07B-10-COST:** in a seeded fixture, the close-out cost of a $2B book (20 names, 0.25 ADV each) is within ±25% of $23M, and that of a $20B book within ±25% of $0.72B.

### (b) ISA segregation fee and LIC4 custody fee (both SINK BURN, × MSI, micro)
Spec text: ISA `0.02%`/yr of IM (07 `:855`); custody `0.02%`/yr for LIC4 accounts above $1B (07 `:913`). Both are a **rate per game year, in bps of a balance, accrued at each day close** as rate/364 per GD. Neither is flat.

**Keys:**
| key | unit | default | ×MSI | source |
|---|---|---|---|---|
| `ccp_isa_fee_ppm_gy` | ppm of IM per GY | 200 | n/a (rate; the posted amount is in micro × MSI) | 07 §3.17.3 |
| `custody_fee_ppm_gy` | ppm per GY | 200 | n/a | 07 `:913` |
| `custody_fee_threshold_real` | real $ | $1,000,000,000 (1_000_000_000_000_000 micro) | yes | 07 `:913` |

- **ISA formula.** Daily fee (micro) = floor(IM_micro × 200 / (1e6 × 364)), on end-of-day IM. Example: IM $50M gives $27.47/GD, $10k per GY.
- **Custody: charge on the excess above $1B only, not on the whole balance**, to avoid a cliff at the threshold (a $1.0B account would pay $200k/GY at $1B + $1 otherwise). Daily = floor(max(0, securities − threshold)_micro × 200 / (1e6 × 364)). Example: $2B of securities gives $549/GD, $200k per GY.

**Against licence fees and NW:**
| fee | per GY | vs R4 entry NW ($100M) | vs LIC4 renewal ($500k) |
|---|---|---|---|
| ISA on $50M IM | $10k | 0.01% | 2% |
| ISA on $500M IM | $100k | 0.1% | 20% |
| custody at $2B | $200k | 0.2% (of a $2B holder, 0.01%) | 40% |
| custody at $11B | $2M | — | 4× |

Both are small, so neither crowds out the LIC4 licence ($5M once).

**Protection value (is ISA worth buying?).** Assume an annual member-default probability of 0.5–2% (PROVISIONAL; no measured rate yet). An omnibus client whose block is refused is closed out at engine cost: 0.76–2.4% of position for liquid books, 7.6–11% for illiquid ones. Position ≈ 20 × IM at a 5% margin.
- Expected loss avoided ≈ p × cost × 20 IM = 0.005 × 0.0076 × 20 = **0.08% of IM per GY at the low end**, 2% of IM per GY at the high end.
- Against the 0.02% fee, ISA is worth **4× to 100×** its cost. It stays worth buying; it does not need to be cheaper.
- At these numbers every LIC4 client should choose ISA. If the Designer wants omnibus to remain a real choice, raise the fee to 0.10%/GY (still above break-even only at the low end). **Designer to confirm.** Default: keep 0.02% as written.

**Catalog (registry gap, 07B `_unit.md:36`).** Proposed rows:
- `CCP_ISA_FEE`: SINK BURN, legA 5080, owner 07, family S6.
- `CUSTODY_FEE_LIC4`: SINK BURN, legA 5080, owner 07, family S6.

Both are paid to TCH as a service fee. TCH is system-side (S) and its fee revenue is a TRANSFER (§3.17.2 "Fees are TCH revenue (TRANSFER)"). **So by E-9 these should be TRANSFER PAY to TCH (X_out), not SINK BURN**, unless the Producer keeps the card's SINK. Recommend TRANSFER PAY, legA 5080, legB 4000 TCH. Producer call.


## E-37 amendment (Quant, 2026-10-21): ISA fee tuned so omnibus remains a real choice (Designer)
Sim: `/tmp/qisa.py`, 200,000 synthetic LIC4 clients. PROVISIONAL (not an engine run).

**Client model:**
- IM ~ lognormal, median $20M, σ_log 1.2.
- Position = 20 × IM.
- Book liquidity: ADV per name ~ lognormal, median $400M, σ_log 1.0.
- Close-out cost if not ported: c = 1.5 × 0.8·σ_d·√(20·IM/ADV), with σ_d = 1.89%, capped at 50%. This is the E-37 engine impact form; median c = 2.27%.
- P(omnibus block refused by the backup | member default) q = 0.5. Unported omnibus clients are closed out (§3.17.7.1).
- Fellow-customer mutualisation loss L ~ U(0, 1%) of IM (omnibus collateral shortfall).
- Risk-premium multiplier (1 + ρ), ρ ~ lognormal, median 1, σ_log 0.7.
- Choice rule: ISA iff p·q·(c·20·IM + L·IM)·(1 + ρ) > fee·IM. Because c grows with √IM, large clients prefer ISA.

**Member default rate p (per member per GY), from 04 rather than from the engine.** p10 has no clearing-member default model.
- Derivation: P(MAJOR per chapter) 0.35 (04 §3.16.1). BANKING_PANIC and CREDIT_CRUNCH account for about 15% of majors by base weight. Then P(the resolved bank is one of the 14 TCH members, who are the strongest banks) ≈ 0.3–0.5. That gives about 0.016–0.03 member defaults per chapter, i.e. **≈ 0.04%/GY per member**.
- Add BANK_RUN_LOCAL (E-35: 0.25/GY on the weakest bank of a bloc; a run is not always a default) and player members, who are thinner-capitalised.
- Range **0.05%–0.5%/GY; central 0.2%/GY**. A world-level default model in 20 should replace this.

**Fee giving a 40% omnibus share, and the 33–50% band:**
| p (per GY) | fee for 33% omnibus | fee for 40% omnibus | fee for 50% omnibus |
|---|---|---|---|
| 0.05% | 167 ppm | 195 ppm | 241 ppm |
| 0.1% | 333 ppm | 390 ppm | 483 ppm |
| **0.2%** | **667 ppm** | **779 ppm** | **966 ppm** |
| 0.5% | 1,667 ppm | 1,948 ppm | 2,414 ppm |
| 1.0% | 3,334 ppm | 3,895 ppm | 4,829 ppm |

The required fee scales linearly with p.

**Setting: `ccp_isa_fee_ppm_gy` 200 → 800 (0.08%/GY)**, close to the Designer's "around 0.10%".
| p (per GY) | omnibus share at 800 ppm | omnibus share at 1,000 ppm |
|---|---|---|
| 0.05% | 0.92 | 0.95 |
| 0.1% | 0.72 | 0.80 |
| **0.2% (central)** | **0.41** | 0.52 |
| 0.3% | 0.24 | 0.33 |
| 0.5% | 0.09 | 0.15 |

- Inside the 33–50% band for p ≈ 0.17–0.24%/GY.
- The choice is sensitive to p: halving p sends 72% of clients to omnibus; 2.5× p leaves 9% on omnibus. 20 must measure p in the engine and re-solve: fee = 779 ppm × (p / 0.2%).
- By IM size at 800 ppm and p 0.2%, omnibus share is 0.88 below $5M, 0.44 for $5–50M, and 0.06 above $50M. Small clients stay omnibus; large books segregate.
- Example: IM $50M costs $40k/GY, which is 0.04% of R4 entry NW and 8% of the LIC4 renewal.

**Custody interaction: none, if one rule holds.** The LIC4 custody fee (200 ppm on securities above $1B outside funds) is charged the same way under ISA and omnibus, so it cancels from the choice. The exception: if IM posted to an ISA counted toward custody holdings, ISA would carry an extra 200 ppm. Rule: margin collateral at TCH (any MarginAccount) is excluded from the custody base.

**ACs:**
- **AC-07B-08-ISA-CHOICE:** in the client-choice sim at the default parameters (the client model above, p 0.2%/GY, fee 800 ppm, ≥ 100,000 clients, fixed seed), the omnibus share is in [0.33, 0.50]. Expected 0.41.
- **AC-07B-08-ISA-FEE:** daily ISA fee = floor(IM_micro × 800 / (1e6 × 364)), on end-of-day IM, × MSI implicit in IM. Example: IM $50M gives $109.89/GD.
- **AC-07B-14-CUSTODY-BASE:** collateral in any TCH MarginAccount is excluded from `custody_fee` holdings. Switching a client from omnibus to ISA does not change its custody fee.

Supersedes the E-37 (b) ISA rate of 200 ppm. The ledger class question (TRANSFER to TCH vs SINK) stays open for the Producer.


## E-38 — 07B Producer rulings: tick timings, CCP codes and intent, 07B id prefixes, 07A id kinds, 07#40 split, segregation choice (Systems, 2026-10-21)
Applies E-37 and its amendment (Quant) under Producer rulings. All Quant values PROVISIONAL [Quant] (closed form or toy sims, not engine runs). Backups: `/workspace/spec/backups/E37/`.

1. **Ticks are the unit (Producer).** 07 §3.17.7 offsets are ticks from declaration tick d (1 tick = 2 game minutes = 5 real s; 720 ticks = 1 GD). E-37 timings replace the d+30/d+60/d+90 reading: porting d+1…d+120 (NPC backups decide at d+1); hedging from d+1, index futures first, VaR measured at d+120; auction d+120…d+480 in three 120-tick rounds, ≥ 3 bids per lot incl. ≥ 2 NPC, else re-offer at half size, tear-up after 2 re-offers. Replenishment and assessments: the CALL is issued at d+720; members have 7 GD from the call to pay in full (07 §3.17.5 amended; Producer correction). Game-day spans stay in GD: 30-GD assessment cooling-off, 5-GD VMGH, 3-GD closure, 1-GD surplus return. Cards: T07B-10 (AC-07B-10-ORDER, -PORT-WINDOW, -AUCTION-WINDOW, -HEDGE, -COST), T07B-11 (AC-07B-11-REPLENISH-CALL, -DEADLINE, -MISSED).
   - Missed deadline: the only consequence 07 defines is §3.17.5 "members below their contribution cannot open new positions (risk-reducing only)". Whether a missed replenishment is also a §3.17.6 default ("a member call is unmet at its due tick") is OPEN (Producer). E-37's AC-07B-11-REPLENISH (unpaid at d+720 = default) is superseded.
2. **Codes (catalog.csv, legpolicy.csv).** `CCP_DEFICIT_ABSORB` TRANSFER PAY 5140→4190 (replaces the `CCP_WATERFALL_ALLOCATION` stand-ins in T07B-07 and T07B-12); `CCP_ISA_FEE` TRANSFER PAY 5080→4000 to ccp_TCH; `CCP_CUSTODY_FEE` TRANSFER PAY 5080→4000 to ccp_TCH (Quant proposed `CUSTODY_FEE_LIC4`; renamed to the 07 `CCP_` family); `CCP_BILATERAL_CLOSEOUT` TRANSFER PAY 5140→4190. Fees are final as TRANSFER to TCH per E-9 (Producer; was SINK). T07B-01 `CCP_CODE_CLASS` is the single place the class is fixed. Intent `bank.ccp.sponsor` added to 07 §4.
3. **Fee keys (23).** `ccp_isa_fee_ppm_gy` = 800 (E-37 amendment; Designer asked ≈ 1,000, Quant set 800 for a 41% omnibus share at p = 0.2%/GY); `custody_fee_ppm_gy` = 200 on the excess above `custody_fee_threshold_real` = $1B × MSI; both daily at rate/364. Rounding OPEN: Quant's formulas use floor, the ledger rule (`mulRate`, `toMoney`) is round-half-even; no floor policy exists. TCH margin collateral is excluded from the custody base. ACs: AC-07B-08-ISA-FEE, AC-07B-08-ISA-CHOICE, AC-07B-08-SEG-UI (Designer: side-by-side, no preselected default), AC-07B-14-CUSTODY, AC-07B-14-CUSTODY-BASE.
4. **Ids.** `mac_`, `mcl_`, `dfe_`, `lot_`, `csa_`, `esc_`, `clm_` and fixed `ccp_*` ids (`ccp_TCH`, `ccp_LD`, `ccp_OTC`, `ccp_CDS`, `ccp_REPO`, `ccp_CRY`, `ccp_ESC`, `ccp_TCH_RETAIL_IF`, `ccp_CRY_IF_<product>`) added to the E-26 id table and the `no-noncompliant-entity-prefix` allowed list (T10A-01, 10A `_unit.md`). T07A-01 id kinds renamed `loan`→`lon`, `sl`→`slo`, `liq`→`lqd`, `res`→`rsv` (`pay` stays).
5. **07#40 split (Quant).** Part a (T07B-03): σ_ewma ×2 gives IM ≥ 1.6× (1.74×). Part b (T07B-02, AC-07B-02-RESPONSE): true return σ doubles at t0, IM ≥ 1.6× within 240 ticks. Estimator: σ_ewma = max(slow EWMA 240, fast EWMA `margin_ewma_fast_halflife_ticks` = 60) [Quant] PROVISIONAL; closed form reaches 1.6× at tick ≈ 128 (slow alone 1.42×). Anti-procyclicality floor kept. Quant to run against the engine once T07B-02 code exists.

## E-39 — 10B Producer rulings: land-sale class, 10B id prefixes, five property codes, appeal intent, 10B streams (Systems, 2026-10-21)
Backups: `/workspace/spec/backups/E39/`.
1. **Land sale.** 10 §3.9.1 reworded: `RE_LAND_SALE` = `PROP_LAND_AUCTION`, a TRANSFER to the city land authority's treasury (owned by the bloc `gov`), per E-9. Supersedes "SINK from the player economy". T10B-01, T10B-07 updated.
2. **Ids.** `lst_`, `dev_`, `ofr_`, `prm_`, `psl_`, `lau_`, `mqt_`, `obj_` added to the E-26 id table and the `no-noncompliant-entity-prefix` allowed list (T10A-01, 10A `_unit.md`); "proposal" marks removed in cards/10B.
3. **Codes** (catalog.csv, legpolicy.csv; class and rate **[Quant] confirm**). E-9 test: TRANSFER when a world entity (a treasury) is paid; SINK when payment goes to the elastic NPC sector or to no one.
   - `PROP_TXN_COST_NPC` SINK ELASTIC_OUT 5080→4040 frm, 3% of price (alias `RE_TXN_COST`, aliases.csv). Elastic NPC brokerage, as `COLL_AUCTION_FEE`. Player brokerage stays TRANSFER on its own code.
   - `PROP_FORECLOSURE_COST_NPC` SINK ELASTIC_OUT 5070→4000 frm, 2% of proceeds.
   - `PROP_SITE_SECURITY_NPC` SINK ELASTIC_OUT 5040→4000 frm, 0.1% of hard cost per GD while paused.
   - `PROP_OBJECTION_FEE` TRANSFER PAY 5250→4190 to the city government, $5,000 (the planning office is the land authority, §3.21; spec named no payee).
   - `PROP_PLANNING_APPEAL_FEE` SINK BURN 5070, $25k + 0.2%: paid to 13's planning tribunal, which books court fees as SINK (`LAW_COURT_FEE`).
   Test 10#12 unblocked (runs on `PROP_TXN_COST_NPC`).
4. **Intent and streams.** `prop.dev.appeal` `{ permitId }` added to 10 §4. 02 §3.10.4 gains `re.list:<cityId>`, `re.buyer:<cityId>`, `re.permit:<permitId>`, `re.dev:<projectId>:<phase>` (all P); 10B cards switched from `re/<city>/…` to the 02 key format.
Flags: `PROP_PERMIT_FEE` (existing, SINK ELASTIC_OUT to frm) is a city planning fee, which under the same E-9 test could be a TRANSFER to the city like `PROP_OBJECTION_FEE` (not changed here).

### E-39 amendment (Producer, 2026-10-21): NPC-sector fees are TRANSFERs
Under E-9 an NPC sector is a world entity and NPC money is closed (T16A-05), so `PROP_TXN_COST_NPC`, `PROP_FORECLOSURE_COST_NPC` and `PROP_SITE_SECURITY_NPC` are **TRANSFER PAY** to their NPC sector (frm) accounts, not SINK (legs unchanged; catalog, legpolicy, 10 §3.9.4/§3.10.5/§3.11.11, 10 test 12, T10B-01/03/05/09, 10B `_unit.md`). Test 10#12 now asserts a TRANSFER and no SINK. `PROP_PLANNING_APPEAL_FEE` stays SINK BURN to match `LAW_COURT_FEE`. **Review flags:** `LAW_COURT_FEE` (SINK BURN) and `PROP_PERMIT_FEE` (SINK ELASTIC_OUT to frm) may also need reclassifying under this reading, as may every other ELASTIC_OUT SINK to an NPC sector in the catalog (e.g. `CMP_AUDIT_FEE_NPC`, `COLL_AUCTION_FEE`, `BIZ_*`); not changed here. `FACT_SALE_NPC` catalog description corrected: cap $100k real per character per chapter (E-35), was $1M.

## E-40 — 04 fixes from Engine Dev's T04-01 (PR #17, read-only) (Producer rulings, Systems, 2026-10-21)
Backups: `/workspace/spec/backups/E40/`. Source: PR #17 `eng/04-t01` `packages/engine/macro/{ids,schema}.ts`.
1. **Release id kind `mrl`.** T04-01 `releaseId` uses `ctx.newId('mrl')` (was `macro_rel`); `mrl_` added to the E-26 id table and the `no-noncompliant-entity-prefix` allowed list (T10A-01, 10A `_unit.md`). Flag: PR #17 also uses kinds `mtg` (meetings), `auc` (auctions), `crs` (crises), not on the E-26 list (not added; Producer to rule).
2. **Table names snake_case** per T02-09, matching PR #17's `mac.<snake>` names: `mac.publicView`→`mac.public_view`, `mac.poolOrder`→`mac.pool_order`, `mac.voteSnapshot`→`mac.vote_snapshot` (T04-06, -07, -09, -13, -14, -16). Flag: cards cite `mac.nowcast` (T04-16), `mac.ela` (T04-08) and `mac.swap` (T04-09), which PR #17's `macroTables` does not define.
3. **ruleTerms rounding.** AC-04-06-RULETERMS on T04-06 (the `macro.cb.decision` emitter): PUBLIC ruleTerms components rounded to 0.01 pp with roundHalfEven; storage keeps full precision.
4. **ContentView fields (T22A, no card exists).** Named in T04-01, T04-10 and T04-14 from 22: `blocs()` (22 §1.1), `releases(bloc)` (§1.4), `cities()` (§3.1), `blocEquityIndex(bloc).indexId` (§4.8), `primaryDealers(bloc)` (§5.2), `swfEntityId(bloc)` = `fnd_SWF_<B>` (§2.1), `fxAssetId(ccy)` = authored FDL pair (§4.5). Correction: the old example `ast_FX_EUN` does not exist; the asset is `ast_FX_EUNFDL`. **Unsourced:** `peNorm0` (neither 22 nor PR #17; PR has `BlocMacroState.peNorm` only) and the 12-entry sector list for `sectors()` (22 uses sector names in §4.1 but has no sector table). PR #17 defines no ContentView fields.
5. **07B Producer rulings (added to E-40).** (a) ISA and custody fees round half-even like the ledger, not floor: AC-07B-08-ISA-FEE, T07B-14 (AC-07B-14-CUSTODY). (b) A missed replenishment is not a default by itself; it escalates to a §3.17.6 member default only if still unpaid at the member's next margin call: AC-07B-11-REPLENISH-MISSED updated, AC-07B-11-REPLENISH-ESCALATE added. (c) Assessments are due 7 GD after the d+720 call: AC-07B-11-ASSESS-DEADLINE. 07 §3.17.5 updated.

## E-41 — Quant: 10B fee verdicts, 10#35 crunch tune, 04 sectorWeights, hidden-field ruling (2026-10-21)

Owner: Avalon Quant. Sources: 10 §3.8.2/§3.8.4/§3.9.2/:921/:1402; 04 :88, :139, :178, :197, :258, §3.3.6 :546, :1276; tg-p10/src/engine/universe.ts SECTORS/STOCKS. Sims: /tmp/qre.py, /tmp/sw.py (seed 23).

Producer ruling noted: E-37/E-37 amendment ISA and custody fees are TRANSFER → TCH (system-treasury side, per E-9), not SINK.

### A1. E-39 codes (10B)
| code | rate | class verdict |
|---|---|---|
| PROP_TXN_COST_NPC | 3% confirmed (10 :793) | TRANSFER → frm NPC sector |
| PROP_FORECLOSURE_COST_NPC | 2% of proceeds confirmed (10 :842) | TRANSFER → frm |
| PROP_SITE_SECURITY_NPC | 0.1%/GD → **0.03%/GD PROVISIONAL** | TRANSFER → frm |
| PROP_OBJECTION_FEE | $5,000 confirmed | TRANSFER → city gov |
| PROP_PLANNING_APPEAL_FEE | $25k + 0.2% confirmed | SINK BURN (as LAW_COURT_FEE) |
- Inconsistency: E-39 text says SINK ELASTIC_OUT for the three frm codes, but the cards T10B-01/-03/-05/-09 and _unit.md say TRANSFER. Here the cards are taken as correct, which matches E-33's FACT_SALE_NPC precedent. Existing frm codes like PROP_UPKEEP are still ELASTIC_OUT, so Producer must pick one class for frm counterparties. E-39's class column is superseded for these three codes only.
- Security fee units: the rate is per GD, and a pause is capped at 28 GD (10 :921). The maximum is 2.8% of hard cost per pause, so the 36.4%/yr reading doesn't apply. At 0.1%/GD it is still about 7× interest carry (5%/yr ≈ 0.0137%/GD). The proposed 0.03%/GD = 0.84% per full pause, about 2× carry. Designer to confirm: keep 0.1% if the pause is meant to be a penalty.

### A2. 10#35 crunch tune (PROVISIONAL, not engine-verified)
Spec as written: stress 0.85 → +3.85 pp cap. Mid RES 4.6% → 8.45%, so modelPI −45.6% before rent effects. Sim at the spec coefficients: median drawdown 47.9% (P10–P90 41–55%), which fails the band.
Proposed §3.8.2: capRate = clamp(y10_0 + **β_y**·(y10 − y10_0) + cap_premium + 0.004 + **k_s**·stress − **g_c**·g_rent_expected, 0.015, 0.12), with **β_y = 0.3, k_s = 0.005, g_c = 0.25** (was 1, 0.01, 0.5).
Path: y10 +300 bp and c_b → −1, both linear over 30 GD; F → 85; city rent −U(0, 8%) over 90 GD; π 2% ± 0.5%. Premium mix by tier is working/mid/prime/trophy at 0.3/0.4/0.2/0.1. PI is EWMA 0.1 of modelPI.
Result, median of 15 cities per seed over 400 seeds: drawdown **27.8%** median, P10 25.4%, P90 30.2%. 100% of seeds are inside 20–35%.
Other settings tested (15-city median):
- β_y 0.3 with k_s 0.01: 32.2%, 95.8% pass
- β_y 0.25 with k_s 0.005 and g_c 0.2: 26.0%
Buyer timing (§3.9.2) is unchanged. At ask/appraisal 0.95 with stress 0.85 and c_b −1, liquidityMult is 5.4 and meanGD is 10.8, doubled to an effective ~21.6 by the 50% financing failure. That makes n small, so modelPI dominates and the band holds. txnPI was not simulated (forced sales are excluded anyway).
Not done: the test forces y10 +300 bp, so the p10 Taylor-rule path wasn't used (a Taylor CB would cut, which lowers y10 and shrinks the drop). Engine Dev should run 10#35 on the real engine. Designer to confirm that ~28% feels right.

### B1. 04 sectorWeights (PROVISIONAL)
Sector order (universe.ts SECTORS, 12 sectors): tech, semis, energy, materials, industrials, financials, health, staples, discretionary, realestate, security, media.
Method: 0.5 × each bloc's listed market-cap mix (universe STOCKS, $B) + 0.5 × a GDP-like baseline [.08,.02,.07,.05,.14,.12,.12,.10,.14,.10,.03,.03]. The blend is used because an equity index overweights tech/semis relative to the NPC economy, the same gap as S&P tech share ~30% vs GDP ~10%. Rounded to 3 dp; the largest weight absorbs the rounding.
Region→bloc mapping (assumed; Systems/22 to confirm): avalon=FU, meridian=EC, kaiyo=PL, nordhaven=NA, sundara=SC.
- FU [0.162,0.080,0.061,0.028,0.096,0.121,0.090,0.085,0.117,0.078,0.035,0.047]
- EC [0.049,0.033,0.121,0.058,0.103,0.132,0.146,0.114,0.146,0.050,0.018,0.030]
- PL [0.105,0.219,0.057,0.028,0.082,0.098,0.077,0.055,0.183,0.056,0.020,0.020]
- NA [0.100,0.198,0.071,0.048,0.094,0.105,0.080,0.063,0.111,0.068,0.029,0.033]
- SC [0.131,0.047,0.066,0.252,0.070,0.081,0.078,0.097,0.070,0.066,0.022,0.020]
Each row sums to 1.000. The cap mixes they come from:
- FU: tech 24.6%, $5.93T
- PL: semis 41.9%, $0.93T
- EC: health 17.2% and energy 17.3%, $1.52T
- NA: semis 38%, $0.55T
- SC: materials 45.4%, $0.19T
Not checked against DEFAULT_INDICES constituents. SC has no listed industrials/discretionary and EC no listed realestate; their weights come from the baseline alone.

### B2. Hidden-field ruling
- **cycleLabel: public, as specified.** It is already a lagged estimate: the committee declares only after the true regime has lasted ≥ 21 GD (`macro_cycle_label_lag_days`) and published data confirm it (04 §3.3.6 :546). Bots can't front-run it, because by the time it's published the switch is ≥ 21 GD old. No change.
- **ruleTerms.outputGap: must not publish the true x.** 04 :197 lists outputGap as never public, and test 04#15 (:1276) would fail. Publish the CB's own estimate instead: x̂ = x + ε, ε AR(1) per GD with ρ = 0.98 and stationary σ = **0.005** (0.5 pp; real-world output-gap revisions run ~0.5–1 pp). With high persistence, averaging can't strip the noise (half-life ≈ 34 GD). Draw it on the stream `macro:<bloc>:gapest`; store x̂ as a new field `outputGapEstimate`. ruleTerms.outputGap = coef × x̂. PROVISIONAL.
- Flag: ruleTerms coefficients times published inputs can reveal hawkishness exactly. That is more than the vote-tally clue (:636, :664). Either publish only the rate rounded to 25 bp with terms rounded to 0.25 pp, or Systems accepts the leak. Designer to confirm.

## E-43 — Quant: 10#35 spread widening (per-seed crunch severity); Designer/Producer rulings on site security, rule rounding, ISA fee, E-31 (a)(b)(c); card ACs for Systems (2026-10-21)

### 1. 10#35 crunch: per-seed severity draw (PROVISIONAL until Engine Dev reruns on the engine)
Supersedes the E-41 A2 band. E-41 coefficients are kept (β_y 0.3, k_s 0.005, g_c 0.25). Problem: P10–P90 was 25.4–30.2%, so the bottom was predictable. The 15-city median averages out any per-city dispersion, so the widening has to be a per-seed common factor.
Mechanism: one draw per scenario from its own seeded stream, `m = μ_m · exp(σ_m·Z − σ_m²/2)` with Z ~ N(0,1). It scales the crunch terms only:
capRate = clamp(y10_0 + **m**·(β_y·(y10 − y10_0) + k_s·stress) + cap_premium + 0.004 − g_c·g_rent_expected, 0.015, 0.12).
Parameters: **σ_m = 0.70, μ_m = 1.05**. Read it as the crunch severity: how hard markets reprice the same rate move.
Sim: /tmp/q35w.py, 1,000 seeds × median of 15 cities, same path as E-41 A2. Drawdown P1 12.1%, **P10 16.9%, P50 25.1%, P90 40.4%**, P99 56.5%. With σ_m = 0 it reproduces E-41 (P50 28.0, P10 25.5, P90 30.1).
Nearby settings: σ 0.75 / μ 1.05 gives 16.3 / 24.6 / 41.1; σ 0.6 / μ 0.85 gives 16.6 / 23.6 / 35.4.
New 10#35 acceptance band (Producer): over ≥400 seeds, P10 15% ±3, P50 25% ±3, P90 40% ±4. This replaces "20–35% per seed".

### 2. Rulings recorded
- Site-security fee during a pause: **0.03%/GD** (Designer, final).
- Governor rule terms are published **rounded to 0.25 pp** (Designer). The internal values stay unrounded.
- ISA fee **800 ppm/yr** accepted (Designer). Re-solve once the engine measures member default rates (E-37 amendment).
- E-31(a): the % caps win. $5k (now $7,300, see (b)) is the **collection floor**, not a minimum fine.
- E-31(b): `protected_floor_cash_real` raised from $5,000 to **$7,300 × MSI**, about 1.0 chapter of rent at $5.40/GD (Designer).
- E-31(c): the divestiture −15% haircut is a value loss booked as a **TRANSFER to the buyer** (to the NPC sector if the buyer is an NPC). It is not a SINK.

### 3. Card ACs for Systems
- 10#35: implement the severity draw m (σ_m 0.70, μ_m 1.05, own seeded stream, one draw per scenario) with β_y 0.3, k_s 0.005, g_c 0.25. AC: over ≥400 seeds × median of 15 cities, P10 15±3%, P50 25±3%, P90 40±4%.
- outputGapEstimate emitter: true output gap + AR(1) noise with **σ 0.5 pp, ρ 0.98**, on its **own RNG stream**, so adding it changes no other stream's hashes. AC: the empirical σ and ρ of the noise are within ±10% over 10k ticks, and the baseline hashes outside this field are unchanged.
- Governor rule terms are published rounded to 0.25 pp. AC: every published term ≡ 0 mod 0.25 pp, and the internal values are unrounded.
- Site security during a pause is 0.03%/GD, booked as a TRANSFER per E-9/E-39.

## E-44 — 09B Producer rulings: listing sector, NPC-side codes, 09B id prefixes, 09#47–49 split (Systems, 2026-10-21)
(E-42 is Quant's rank gate at :481; E-43 is Quant's entry at :1546. First written as E-43, renumbered.) Backups: `/workspace/spec/backups/E41/` (folder named before the number was fixed).
1. **Listing sector:** the business with the largest EV share decides; exact ties go to the lower 09 §3.1.4 sector number. AC-09B-04-SECTOR-TIE.
2. **`CMP_UNDERWRITING_FEE` / `IPO_UNDERWRITING_FEE`** is a TRANSFER to the NPC underwriter sector: 09 §3.10.2, §3.17 and 23 `ipo_underwriting_fee` reworded (was SINK).
3. **Codes** (catalog, legpolicy, aliases for the 09 §3.17 names). All TRANSFER per E-9 with NPC money closed (T16A-05); each has a closed-money AC:
   - `EQ_DIVIDEND_NPC` (alias `DIVIDEND_NPC`, was SINK) PAY 2530→4030 to NPC holder sectors: AC-09B-05-DIVNPC.
   - `EQ_TENDER_OFFER_NPC` (alias `TENDER_OFFER_PAY_NPC`, was SINK) SWAP_ASSET: AC-09B-09-NPCTENDER.
   - `EQ_IPO_PROCEEDS_NPC` (alias `IPO_PROCEEDS_NPC`, was FAUCET) SWAP_ASSET: AC-09B-06-NPCPROCEEDS.
   - `CMP_WAIVER_FEE` (alias `WAIVER_FEE`, was SINK) PAY 5080→4040 to the NPC lender: AC-09B-05-WAIVERFEE.
   - `CMP_IPO_FAIL_FEE` (1% of target, **[Quant] confirm**) PAY 5070→4040 to the underwriter: AC-09B-06-FEES.
   - `CMP_GOLDEN_PARACHUTE_NPC` (≤ 1% EV, **[Quant] confirm**) PAY 5010→4190 to hh: AC-09B-10-PARACHUTE-NPC.
4. **Ids:** `pln_`, `rdp_`, `tof_`, `mrg_`, `vrd_`, `rst_`, `mot_`, `lbo_`, `ipo_` added to the E-26 table and lint allow-list (T10A-01, 10A `_unit.md`); proposal marks removed (T09B-01, 09B `_unit.md`).
5. **09#47–49:** 09B keeps its partial ACs (T09B-13); 09A cites the rest (09B `_unit.md`).
6. **`biz_ltv_cap`:** not present in 09 §3.12 (§3.12.2 already defers to 07's loan table); 23 already marks it retired. Nothing removed.

## E-45 — Producer rulings on Quant's E-41/E-43; holidays flag (D071); 13 floor and divestiture (Systems, 2026-10-21)
Backups: `/workspace/spec/backups/E45/`. Values PROVISIONAL [Quant] unless marked.
1. **NPC-sector SINK sweep: NOT applied (conflict).** E-39 amendment is done (three PROP_*_NPC codes are TRANSFER). The catalog holds 85 ELASTIC_OUT SINK rows whose payee is an NPC sector (hh/frm/row), from `BIZ_PURCHASE_NEW` and `PROP_UPKEEP` to `BNK_ELASTIC_LOAN_DISBURSE`, `MAC_GOV_SPENDING_ELASTIC` and `LP_SWEEP_TO_ROW`; 22 BURN rows have no payee and stay SINK. Reclassifying the 85 contradicts the frozen ledger model: 03 maps SINK ⇔ BURN/ELASTIC_OUT and FAUCET ⇔ MINT/ELASTIC_IN (T03-02 `:47`, validator and the `SINK_CODES.length === 86` test), elastic sectors are outside M by design, and T16A-05 §3.2.5 books player-boundary purchases from the same sectors as FAUCET (`BIZ_SALES_HH`). A one-sided change would make outflows TRANSFER while the mirror inflows stay FAUCET. Producer/03 owner to rule on the ELASTIC template model first (ledger-core v0.8). E-33, E-39 amendment, E-43 site security and E-44 rows already follow the TRANSFER reading and carry the same inconsistency.
2. **Region→bloc (Quant):** avalon→FDL, meridian→EUN, kaiyo→PYN, nordhaven→NKR, sundara→SRL. Checked against 22 §1.1 (`:63-67`): FDL holds Port Avalon, EUN Meridia, PYN Kaiyo City, NKR Nordhaven City, SRL Sundara Coast (financial centre; political capital Alta Verde), and 22's "04 alias" column maps FU/EC/PL/NA/SC to FDL/EUN/PYN/NKR/SRL. Spec 16 names no regions. Match; applied: E-41 B1 sectorWeights rekeyed to canonical codes, values unchanged (T04-01 step 7b), AC-04-01-SLUG (moved to T04-01b by E-54). The slug `meridian` differs from the city name "Meridia": slugs are ids, display names come from 22.
3. **10#35 (E-43 §1):** spec 10 §3.8.2 capRate uses Quant's formula verbatim with severity m (1 outside the scenario); T10B-10 10#35 band P10 15±3, P50 25±3, P90 40±4 over ≥ 400 seeds (replaces E-41's band and Designer's approximate band; no clash: Designer's 15/25/40 targets are what E-43 tuned to); AC-10B-10-SEVERITY; stream `re.crunch_severity:<scenarioId>` in 02 §3.10.4.
4. **outputGapEstimate (E-41 B2/E-43):** T04-01 field and step 7c (moved to T04-01b by E-54), stream `macro.gapest:<bloc>` (S root) in 02 §3.10.4; ACs AC-04-01-GAPEST-STATS (σ, ρ ±10% over 10k), -DET (other hashes unchanged), -LEAK; T04-06 `cbOutputGap` uses the estimate, AC-04-06-GAPEST.
5. **Governor ruleTerms (Producer):** internal 0.01 pp half-even, published 0.25 pp: AC-04-06-RULETERMS amended, AC-04-06-RULETERMS-PUBLIC added. Quant's hawkishness-leak flag is addressed by the 0.25-pp publication.
6. **Site security** 0.03%/GD [Designer target, Quant tune], TRANSFER to npcFirm: 10 §3.11.11, T10B-09 (AC-10B-09-SECURITY), catalog description.
7. **13 (E-31 a–c via E-43):** `protected_floor_cash_real` = $7,300 × MSI (new 23 key; 13 §3.12, T13A-02/-04); divestiture −15% haircut is a TRANSFER to the buyer (13 §3.10 table, AC-13A-04-DIVEST); % caps win over tier $ floors (13 §3.10, AC-13A-02-CAPWIN).
8. **Holidays (D071):** `holidays_enabled` = false (23); 02 §3.2 behaviour is "when flag on" (260 trading days at launch, 256 with the flag on); 02#4 is flag-on only; AC-02-05-NOHOL on T02-05.
9. **Correction to E-44 item 6:** 09 §3.12.2 did mention `PARAM.biz_ltv_cap` ("is retired"); removed here.

## E-47 — Top-end friction (Designer and Producer approved; Systems, 2026-10-21)

(First written as E-47; renumbered to E-47 after a collision with the unit-12 rulings entry, also E-47. E-42 to E-47 are taken.) Backups: `/workspace/spec/backups/E47/`.

**Principle.** The top end gets world friction, never a flat tax or wealth decay. No mechanism below posts a SINK or any other charge proportional to wealth. Each one raises the cost of trading, margin or approvals, or adds NPC competition. All coefficients are **[Quant]**.

**Ramp (one definition, T03-17).** `w(N) = σ(log2(N / topend_ramp_center) / topend_ramp_width)`. N is the friction net worth of the owner group (below), center $2,000,000,000 (R5), width 0.35 [Quant]. w is smooth and monotone, with no cliff:
- w($100M) = 0.000004
- w($0.99B) = 0.052224
- w($1B) = 0.054313
- w($2B) = 0.5
- w($3B) = 0.841752

A 1% step in N moves w by at most 0.0103.

**Aggregation (15 §3.12 anti-cheat).** N is the consolidated NW of the 03 owner group, plus every character linked by the 15 collusion graph (`linkedCharactersOf`), plus the shells they control (03 ownership graph). Splitting wealth across alts or shells never lowers w.

**Growth targets (20 band, T20B-11).** Effective whale growth is about 0.48%/GD from $100M to $2B, tapering to about 0.24%/GD above $2B. Bands are [Quant].

**Mechanisms**
1. **Participation cap (05, T05-11).** An owner group's daily traded quantity per instrument is capped at `mkt_topend_part_base / w(N)` × ADV, with base 0.20 [Quant]. The cap is 3.83 ADV at $0.99B, 3.68 at $1B, 0.40 at $2B and 0.2376 at $3B. The excess is refused with `MKT_TOPEND_PARTICIPATION`. The impact cost of size over ADV is the existing T05-04 curve δ(q) = s + Yσ_d√(q/D); no new impact math.
2. **Concentration add-on (07B, T07B-04).** The add-on is `IM · clr_topend_conc_k · w(N) · sqrt(max(0, share − clr_topend_conc_free))`. share is the position's fraction of open interest, or of float for equities. k 0.5 and free 0.02 [Quant]. It sits on top of the existing ADV concentration add-on.
3. **Regulator scrutiny (13, T13B-07).** `scrutiny = 100 · w(N) · min(1, volShare / reg_scrutiny_vol_ref)`, with ref 0.10 [Quant]. volShare is the group's share of market volume over 5 game days. Approval and review durations are multiplied by `1 + reg_scrutiny_delay_k · scrutiny/100`, with k 1.0 [Quant]. It is never a fine, freeze, seizure or verdict input.
4. **NPC rivals (09B, T09B-03).** Above `biz_rival_share_trigger` (0.35) market share, the NPC entry rate (09 §3.3.6) is multiplied by `1 + biz_rival_entry_k · w(N)`, and NPC prices fall by `biz_rival_price_cut · w(N)` (k 1.0, cut 0.05) [Quant].
5. **Large exposures (07A, T07A-03).** The existing 25% Tier 1 (15% SIB-to-SIB) per-group cap applies to the aggregated owner group above. The cap fraction stays [Quant].

**Not friction.** The 5/10/25% disclosure thresholds and the $250k deposit guarantee are normal rules at any size and do not change.

**UI.** Each friction shows a one-line cause, registered as `why.topend.*` in 22 §16.2 for Studio to style.

**Spec text edited:**
- 22 §16.2: five cause strings and one reject code.
- 23: ten keys (§4.2, §4.4, §4.6, §4.8, §4.12).

**Card ACs (all carry the E-47 tag)**
- T03-17: AC-03-17-TOPEND-RAMP, -NOCLIFF, -AGG
- T05-11: AC-05-11-TOPEND-PART, -IMPACT
- T07B-04: AC-07B-04-TOPEND-CONC
- T07A-03: AC-07A-03-TOPEND-LE
- T13B-07: AC-13B-07-SCRUTINY, -NOCONFISCATE
- T09B-03: AC-09B-03-RIVALS
- T20B-11: AC-20B-11-TOPEND-GROWTH

## E-46 — Producer rulings on unit 12 (Systems, 2026-10-21)
Backups: `/workspace/spec/backups/E46/`.
1. **G15–G22** confirmed as 12 §10 tests 15–22 (12 `_unit.md` open question 1; suite in T12-09).
2. **Ids:** `srf_`, `opn_`, `hsn_`, `lgc_`, `anm_`, `dcp_`, `itl_` added to the E-26 table and lint allow-list (T10A-01, 10A `_unit.md`); spec 12 `su_`/`op_`/`hs_` renamed to `srf_`/`opn_`/`hsn_`; T12-01 `ID12` approved.
3. **Fence:** `OPS_FENCE_SALE_NPC` FAUCET ELASTIC_IN (sector row) → TRANSFER SWAP_ASSET from the npcFirm sector (frm) at 40% of value; `CONFLICT_FENCE_HAIRCUT` dropped; 12 §3.8.1, §3.x E5 text and §10 test 20 fixed; T12-06 step 4 and AC-12-06-FENCE-CLOSED (closed money). 03 §3.4.1 and T03-02 row annotated. **Knock-on:** T03-02 still says FAUCET (37) and tests `FAUCET_CODES.length === 37`; with the fence moved it is 36. Not changed here (same 03 ELASTIC model question as E-45 item 1).
4. **`CONFLICT_COMPUTE_LEECH`** added: TRANSFER, PAY, legs @ASSET compute credit (PROVISIONAL). Aliases: `CONFLICT_NPC_THEFT`→`OPS_NPC_CREW_THEFT`, `CONFLICT_OP_COST_NPC`→`OPS_COST_NPC`, `CONFLICT_OP_COST_PLAYER`→`OPS_PI_FEE_B2B`, `CONFLICT_BRIBE`→`OPS_BRIBE_NPC` (player/core recipient: `OPS_BRIBE_CORE`), `CONFLICT_DEFENSE_SPEND`→`OPS_DEFENSE_NPC` (player firm: `OPS_DEFENSE_B2B`), `CONFLICT_FENCE_SALE`→`OPS_FENCE_SALE_NPC`. Note that `OPS_COST_NPC`, `OPS_DEFENSE_NPC` and `OPS_BRIBE_NPC` are still SINKs paid to NPC sectors (E-45 item 1).
5. **Oracles:** 12 defines the interface, T20B-10 implements and registers it; T12-11 AC-12-11-STUBS deletes the local stubs when T20B-10 lands.
6. **Tone lint:** Designer owns the term list (T12-12 step 2).

## E-56 — 17B broker contract: Systems answers to Studio Q3, Q4, Q5, Q7, Q9, Q11, Q12, Q13 (Systems, 2026-10-21)

Source: `/workspace/specs/17B-broker.md` table (answers written there). Q1, Q6, Q8 and Q10 are pending Quant; Q2 and Q14 are drafted for Engine Dev.
1. **Candles (Q3).** Tab to resolution: 1H tick (30 bars), 1D tick (720), 1W hour (168), 1Q hour (2,184), 1Y day (364), All day. All is paged by `from/to`, because the 5,000-bar cap (19 §3.10) is per call. Hour bars align to the game hour, `t mod 30 == 0` (02 §3.4).
2. **`me` body (Q4).**
   - Keys: balances, nw, nwi, restricted, `positions{assetId}`, `orders{orderId}`, `fills` ring of 50, margin, `holds{holdId}`, `intents` ring of 50 (19 `IntentResult`), alerts.
   - The server computes `avgPrice`. `ownerGroupId`, `actorId` and other hidden order fields are never sent.
   - Id-keyed delta paths are stable keys.
3. **News shape (Q5). CONFIRMED: Producer's version, with Quant's band values.** `news` carries the 15 §2.9 `WireItem` projection, with:
   - (a) A non-empty `causeEventIds` on every item (16 invariant N1; = WireItem `sourceEventIds`).
   - (b) On RUMOR items: `sourceId` and `sourceRecord {hits, resolved}`, both public (16 `RumorSource`).
   - (c) No credibility number ever reaches the client. 16 `credibility`, WireItem `credibility`, `RumorSource.hiddenAccuracy` and `isTrue` stay server-side. Only `credBand: 'LOW'|'MIXED'|'SOLID'` is sent.
   - (d) On STATEMENT items: `speakerId`, `statementType` (15 `PlayerStatement` verdict class), and `credBand` when the speaker has a record. Every speaker who has posted has a sourceRecord, possibly 0/0, which gives MIXED.

   **Band (Quant, corrected).**
   - `score = (hits + k·0.5)/(resolved + k)` with k = `PARAM.rumor_cred_prior_weight = 10` (23 registry; the prior mean is `rumor_cred_prior_mean` 0.5). It is the same estimator and the same param as 16 §3.6.7's NPC rumorImpulse credibility.
   - Compared on exact rationals (integer cross-multiplication).
   - LOW < 0.40, MIXED 0.40 ≤ score < 0.65, SOLID ≥ 0.65 (inclusive).
   - A new source (0/0) is MIXED. There is no minimum-resolved or null rule.
   - The band changes only on a resolution event (16 rumor resolution or `soc.statement.resolved`), and only the band is sent.

   ACs:
   - **AC-E56-CREDBAND-FIXTURES** (hits/resolved → band): 0/0 MIXED (0.500); 3/3 MIXED (0.615); 5/5 SOLID (0.667); 0/3 LOW (0.385); 7/10 MIXED (0.600); 8/10 SOLID (0.650, exactly on the inclusive edge).
   - **AC-E56-CREDBAND-EVENT:** the band is recomputed only on a resolution event; no other tick changes it.
   - **AC-E56-CRED-SHARED-PARAM:** the public credBand and 16's rumorImpulse credibility both read `rumor_cred_prior_weight` (and `rumor_cred_prior_mean`) through ParamsView, with no literal 10 or 6 in either code path. Under a live param override, both use the new value in the same tick, and for every source the shrunk estimate fed to rumorImpulse equals the score behind its band.
   - **AC-E56-CRED-BAND-PARAMS:** the cutoffs are read from `PARAM.rumor_cred_band_low` (0.40) and `PARAM.rumor_cred_band_solid` (0.65, inclusive) through ParamsView, with no literals in code. Under an override the fixtures re-band accordingly, and a change that would make low ≥ solid is rejected `PARAM_OUT_OF_RANGE`.
   - **AC-E56-NO-HIDDEN-CRED:** no `news`, `filings`, archive (`/api/v1/news`) or replay payload contains a field named `credibility`, `hiddenAccuracy` or `isTrue`, or any credibility number. This is enforced by the T19C-01 allowlist, with these names in `hiddenFieldNames()` for 15/16.
   - **AC-E56-CRED-ENGINE-ONLY** (Systems exploit flag): only outcomes resolved by the engine (16's resolver against engine facts, 15 §3.10.4, or 16 rumor resolution) count toward a sourceRecord. Never author, ally, vote or admin-free input.

   **Exploit flag (farming SOLID).** A statement whose claim is already settled by a public fact at its post tick (for example "X closed above $10 yesterday") would resolve TRUE trivially after 5 game days. At 3 statements per day for $500 each, that reaches SOLID in about a week. SOLID then multiplies reach (15 §3.10.4) and 05 sentiment impulses: a pump vector.

   **AC-E56-CRED-NO-FARM:** a claim counts toward `hits`/`resolved` only if its resolving fact was not yet determined (not committed or published) at the statement's post tick. A claim about an already-determined fact is reclassified OPINION at post time and never resolves. The test is a self-statement about yesterday's close: it does not change sourceRecord.

   17 §2.6 has a pointer note.
4. **Mixed feed (Q7).** All 15 `WireKind`s ride `news`. Filing bodies stay on `filings`. No new channel.
5. **NW history (Q9).** New route `GET /api/v1/me/nw-history`, from the 03 read model (day-close NW and NWI snapshots from 03 §3.8; hour points at `t mod 30 == 29`). Added to the 19 §3.10 route table.
6. **Order history (Q11).** New route `GET /api/v1/orders/me`, from the 05 read model of the PARTIES `mkt.order.*` events. Retention follows the engine-events row of 19 Rule 3.7.6. Added to the 19 §3.10 route table.
7. **Tier gating (Q13).**
   - Non-Terminal users get no op before `publishTick`.
   - Terminal users get headline-only fields at `tierEarlyTick`, and the body follows as `set` ops at `publishTick`. There is no extra req.
   - This is bound by 16#31. **Confirmed (Producer):** it matches 16 §3.6.6. The headline arrives at tierEarlyTick = publishTick − 1 and the body at publishTick, never ahead of the event commit tick.
8. **Follows and watchlists (Q12):** no change. Follows use 15 `soc.follow`; watchlists are `AccountUiPrefs` via `PUT /me/prefs`.

9. **Order preview (Q14, Engine Dev answer).** `intent.preview` for `mkt.order.*` returns `PreviewResult & { impactBp: number /*integer bp*/; impactMoney: Money; total: Money; firstTradeCapRemaining: Money | null; computedAtTick: Tick }`, an extension type that leaves 05 `PreviewResult` untouched.
   - It is a pure read on 05's fill and impact code path against committed state: no store writes, no RNG draw, no id allocation.
   - Money fields are bigint micro sent as decimal strings, rounded like the real fill (T02-04).
   - `firstTradeCapRemaining` is null when 18's cap doesn't apply.
   - It is advisory: the order re-validates at P1, so a stale preview never binds.

   ACs:
   - **AC-E56-PREVIEW-PURE:** for any draft, the world state hash and every RNG stream cursor are identical before and after N previews, and no id counter advances.
   - **AC-E56-PREVIEW-TOTAL:** with committed state unchanged (no other flow in the tick), the preview `total` equals the realized fill total (notional + fees, micro, same T02-04 rounding) of the same order submitted next tick.
   - **AC-E56-PREVIEW-STALE:** a preview with `computedAtTick` < the current tick never binds; the order is re-validated and may reject.

Backups are in `/workspace/spec/backups/E56/` and `/workspace/spec/backups/17B/`.
10. **Q1 and Q8 (Quant).**
    - Ticker: `state: TradingState`, a server-derived `halted`, and no `phase`. chg and chgPct are measured from `prevClose` (the previous official close).
    - New `stats` block on the `asset.detail` req (19 Rule 3.8.5), fields and rounding per the Quant rulings §Q8, with `asOfDay` = the last closed trading day. Only public 05 fields are sent.
    - **AC-E56-STATS-PUBLIC:** every `stats` field path is in the T19C-01 allowlist, and none is in `hiddenFieldNames()`.
11. **Q6 pricedInBand (Quant + Producer tier ruling).** `news` carries `pricedInBand` per recipient (19 Rule 3.8.3). 16 §3.6.6 Terminal and Research Desk are separate subscriptions, so the tiers are:
    - Terminal only: the D−1 trading-day-close series.
    - Terminal + Research Desk: the previous-closed-game-hour series.
    - No Terminal: no field.

    Each series has its own hysteresis and an absorbing Done; the % is never sent. 18 :608's harness now includes the band (18 edited). ACs:
    - **AC-17B-Q6-LAG-DAY**, **AC-17B-Q6-LAG-HOUR** and **AC-17B-Q6-TIER-SWITCH**, as in the Quant addendum.
    - **AC-17B-Q6-NO-REPLAY** (Systems): a tier change sends exactly one `set` with the current value of the newly entitled series. No past transitions of the hourly series are ever sent (no backfill on upgrade, and no hourly series on the `/api/v1/news` archive or in replays to Terminal-only users). After a downgrade the next push comes from the day series, even if that moves the band backward.
12. **Q10 nw-history extensions (Quant).**
    - The E-56 §5 route adds per-day `realNw`, `twrIdx` and `bench`, plus `stats{window}` (drawdown, max drawdown, Sharpe "whole NW", breakdown). New `me.nwStats` and `me.nwBreakdown` deltas.
    - Everything is stored server-side, and the client computes nothing (G1).
    - Formulas are as in the Quant rulings §Q10.
13. **Systems exploit checks (Q10, Q6).**
    - **(a) Alt and wash flows.** 15 §3.12.1 voids P2P between *linked* accounts. However, suspect-but-unlinked alts can pass value through registered 15 contracts or off-market trades, and those count as return, not F_d. That would inflate twrIdx and Sharpe, or offset a drawdown.

      **AC-E56-FLOW-LINKED:** every value transfer, contract payment or off-market fill whose counterparty is in the player's beneficial-owner group, or in a `LinkPair` with `linked` or `suspect` (15 §2.10), counts in F_d at its full value. A test with alt A paying B $X through a contract leaves B's `r_d` unchanged.
    - **(b) Break reset.** The < $100 × MSI break nulls windows that span it. A player could move NW out (F_d) to force a break and hide a drawdown.

      **AC-E56-BREAK-KEEP:** a break reached on a day when F_d < 0 does not reset the all-time max drawdown or the chapter max drawdown; the recorded maxima persist across the break and are shown.
    - **(c) Benchmark and flows.** Because bench_d adds the same F_d at the same close fix, flow timing gives no relative advantage.

      **AC-E56-BENCH-FLOW:** for any F_d sequence with zero market returns, `bench_d` equals `NW_d`.
    - **(d) Sharpe smoothing.** Appraisal-marked assets (property, businesses, collectibles) have low mark volatility, so a whole-NW Sharpe can be raised by holding them. This is display only and not used by boards (15 uses the TRADER Sharpe), so it is flagged, not fixed.
    - **(e) Priced-in leak.** It is resolved by the per-tier lag (§11). The mid-day tier switch is covered by AC-17B-Q6-NO-REPLAY. A Research Desk buy for one game day costs at least $1,500 real (16 §3.6.6), and only gives what the tier entitles.

Backups for §10–13 are in `/workspace/spec/backups/E56c/`.
14. **AC-E56-SHARPE-DISPLAY (Producer, closes §13(d)).** The whole-NW Sharpe of §12 is display-only, and the UI labels it "Sharpe (whole NW)". No board, ranking, league, reward, matchmaking or anti-cheat input reads it; only 15's trading Sharpe feeds those.

    Enforcement is an import and read check. The nw-history `stats.sharpe` field and the `me.nwStats` Sharpe path may be consumed only by the 17 portfolio view (PF-01). A CI test fails if any engine module (15, 14, 20, 21 included), projector job or other client view imports or reads that field: a grep or AST scan for the field name and its read-model accessor, with an allowlist of exactly that one view.

Producer accepted E-56; backups for §14 and the Q5/Q13 status changes are in `/workspace/spec/backups/E56d/`.
15. **`me` extensions (Studio via Producer; in scope for the 17B and 19C cards, not cut).** All of these are server-computed (G1); the client does no math.
    - **Position rows** (`/positions/{assetId}`):
      - `pnlPct`: decimal string in pp, 2 dp, half-even = 100 × (markValue − costBasis)/|costBasis|. costBasis = Σ lot `qty × costPrice` (06 §2 `Lot`, 03 marks). Null if costBasis = 0.
      - `weightPct`: share of gross assets, 1 dp, half-even, with the Q10 largest-remainder rule (§12). The set is all long holdings plus the non-position classes of grossAssets, summing to exactly 100.0. Short and written rows are liabilities in Q10, so they get null.
      - `assetClass`: 06 §2 `AssetClass` (06 :38, the instrument registry's enum; 05's narrower AssetClass at 05 :43 is a market-parameter grouping).
      - `marginState`: the status of the 07 `MarginAccount` holding the position, `'OK' | 'CALL' | 'LIQUIDATING' | 'DEFICIT' | 'CLOSED'` (07 §2 :262; there is no WARN state). Null for cash-account positions.
      - `liqPrice`: price string. It is the mark at which, all other positions and collateral held at current marks, the account first meets 07's liquidation trigger: RETAIL `equity < MM` (07 :811); PORTFOLIO/PB `equity < 0.6 × IM` (07 :812). It is null with no leverage or margin, or when no finite price triggers it (fully collateralized).
    - **`me.buyingPower`**: money string from 07's buying-power calc, the value 05 P1 checks (05 :230, "buying power and locate (07)"). It is the same value `intent.preview` uses as its starting point (`bpAfter` + the draft's cost for buys, E-56 §9).
    - **`me.license`**: `{ held: LicenseId[], highest: LicenseId }` with `LicenseId = 'LIC0'…'LIC4'` (14 §2 :159; gates by 13 per 05 :88 `licenseRequired`; shown in 17 LAW-07 :1071 and BRK-01 :827).

    ACs:
    - **AC-E56-POS-RECOMPUTE:** for random portfolios, every position-row field equals an independent recomputation from committed ledger lots, 03 marks and the 07 account state at the same tick, and the client renders the strings as-is (19#56 lint: no client arithmetic on these fields).
    - **AC-E56-LIQPRICE:** moving the asset's mark to `liqPrice` (others fixed) puts the account in 07's LIQUIDATING trigger at that tick, and a mark one price increment on the safe side does not. When liqPrice is null, no single-asset mark triggers liquidation.
    - **AC-E56-BP-PREVIEW:** at the same tick and state, `me.buyingPower` equals the buying power `intent.preview` starts from (for a buy draft, `bpAfter + total`).
    - **AC-E56-ME-OWN-ONLY:** `weightPct` and `liqPrice` read only the recipient's own ledger and accounts plus public marks and params. A test with two players holding the same asset shows that changing B's positions or margin never changes any field in A's `me` delta, and the T19C-01 allowlist has no other-player paths.

    **Exploit check:** no leak. Both fields use only own-account state and public marks. liqPrice exposes the player's own 07 trigger, which they could compute themselves, and other players' liquidation levels are never sent. Note: liqPrice is a single-asset approximation (others held at marks); the UI should label it "approx." (Designer).

    Params `rumor_cred_band_low` and `rumor_cred_band_solid` are registered in 23 §4.15 (16 count 88 → 90). Backups for §15 are in `/workspace/spec/backups/E56h/`.

## E-55 — Producer ruling on T02-04 money helpers, from Engine Dev PR #27 (Systems, 2026-10-21)

1. **toMoney property.** The result is the half-even rounding of the float product fl(x·1e6), as 02 §3.9.2's one IEEE multiply, and is within 1 micro of the exact decimal value x·1e6. It need not equal half-even of the exact product. They differ by 1 micro when the product's own rounding crosses a .5 (PR #27: x = 2.5e-6 gives 2n, while the exact value gives 3n; also x = −999,991,577.0973265). The T02-04 step 2 contract and its property test now say this. 02 §3.9.2 has a pointer note.
   **Amended (E55b).** The ≤ 1 micro bound applies only where |x·1e6| < 2^53. At or above 2^53, toMoney returns `BigInt(x·1e6)` exactly with no rounding step; the error is the float input's own precision, which 02 §3.9.2 note (b) allows ("above $9.007 billion the float itself cannot represent single micro-units, so the precision of a float-sourced amount is the float's precision … exact money arithmetic never goes through floats (§3.9.3)"). Caller rule: ledger amounts ≥ 2^53 micros never pass through float helpers; they use only `divRoundHalfEven`, `mulRate`, `mulRateE12`, `accrue`, `notional`, `fxConvert`, `allocate` and `proRata`. New AC-02-04-TOMONEY-2P53. The caller rule is a review check in Done-when, because the card has no custom lint mechanism, plus a grep test for `toMoney(fromMoney(`. Backups are in `/workspace/spec/backups/E55b/`.
2. **allocate returns a Map (G6).** The Map is built in ascending `cmpStr` id order, with exactly one scoped `// eslint-disable-next-line no-restricted-globals` (the G8 rule forbidding `Map`) at its construction site, as in PR #27. This is ratified. New AC-02-04-ALLOC-ORDER: ascending, deterministic iteration order, and exactly one disable in the file.
3. **Named faults.**
   - lotScale outside 1..2^31 throws `EngineFault('I0.lot_scale')` (AC-02-04-LOTSCALE).
   - Non-safe-integer `days` in accrue throws `EngineFault('I0.accrue_days')`, never BigInt's RangeError (AC-02-04-ACCRUE-DAYS). The name follows the card's `I0.<helper>_<what>` pattern (`I0.allocate_dup`, `I0.div_zero`).

Backups are in `/workspace/spec/backups/E55/`.

## E-54 — Producer card move: E-45 items from T04-01 to new card T04-01b (Systems, 2026-10-21)

1. **New card** `cards/04/T04-01b.md` (S1, depends on T04-01). It holds:
   - AC-04-01-SLUG and `blocOfRegionSlug`;
   - AC-04-01-GAPEST-STATS, -DET and -LEAK;
   - former T04-01 step 7c (the outputGapEstimate AR(1) update);
   - the `DailyHistoryRow.outputGapEstimate` field.
2. **New AC-04-01b-RULETERMS-KEYS.** The emitted `macro.cb.decision` ruleTerms object has exactly the keys {neutral, inflation, inflationGap, outputGap, finStress, fx, bias} (04 §2.1 :258; §5 :1123). E-45 item 5 changes only the rounding and the outputGap input, not the keys. The schema is strict, so an extra or a missing key is rejected.
3. **T04-01.** The items above are removed. Pointers to T04-01b are left at the DailyHistoryRow field, at step 7c and in the Test plan.
4. **Other updates.**
   - T04-06 now depends on T04-01b, because `cbOutputGap` reads `outputGapEstimate`; its comment points here.
   - E-45 items 2 and 4 are annotated "moved to T04-01b".
   - Packs are regenerated by `assemble.py --all`.
   - Backups are in `/workspace/spec/backups/E54/`.
5. **Follow-up (E54b).** T04-01 step 5 is fixed: ruleTerms are computed at 0.01 pp and published at 0.25 pp (E-45 item 5). BUILD-ORDER.md is regenerated with `order.py`; T04-01b comes after T04-01 and before T04-06.
6. **Open for Producer: does the public ruleTerms include `outputGap`?** AC-04-01b-RULETERMS-KEYS is kept at 7 keys, because:
   - E-41 B2 explicitly says to publish the estimate: "Publish the CB's own estimate instead … ruleTerms.outputGap = coef × x̂".
   - E-45 item 4 adopts E-41 B2 and AC-04-06-GAPEST.
   - 04 §2.1 :258 lists outputGap among the ruleTerms keys, and 04 §5 :1123 says ruleTerms are "published as rounded contributions".

   Merged PR #17 (7a1fab9) disagrees. Its `events.ts` publishes a strict 6-key ruleTerms without outputGap, and `schema.test.ts` asserts the cb.decision event "never publishes the output-gap term (E-41, 04#15)". Producer to rule: either amend the AC to 6 keys, or open a PR #17 follow-up that adds `outputGap` = coef × outputGapEstimate.
   **Ruling (Producer): keep the spec.** AC-04-01b-RULETERMS-KEYS stays at 7 keys. `outputGap` = coef × outputGapEstimate is published at 0.25 pp. Engine Dev implements it in T04-01b as a follow-up to #17; #17's 6-key schema in `events.ts` and its test in `schema.test.ts` flip. New AC-04-01b-NOTRUEGAP: the true x (or coef × x) is never in any player-reachable payload, event, view or log; the published value differs from coef × x whenever ε ≠ 0 (seeded test); `outputGapTerm` and true-gap fields are rejected. Backups are in `/workspace/spec/backups/E54c/`.

## E-53 — Producer ruling on T02-02 dmath part 1, ratifying PR #25 deviations (Systems, 2026-10-21)

**Ruling.** The ULP bounds, domains, fault codes and bit-identical determinism of 02 §3.8 and T02-02 are the contract. The card's literal algorithms are guidance. A deviation must use only the §3.8 primitives, be fixed (no data-dependent iteration counts) and pass the card's vector, worked-example, property and golden-hash ACs. 02 §3.8 carries a pointer note.

**Ratified deviations (Engine Dev PR #25, Aiouyn/trading-game):**
1. **pow extra precision.** ln x is computed as a double-double `lnDD` (the same §3.8 reduction and series carried hi+lo). It replaces the card's Newton tail `x·exp(−lh) − 1`, which inherits exp's rounding (measured 131 ULP against a bound of 4). The Dekker two-product and `exp(hi)·(1 + lo)` are unchanged.
2. **Integer powers |n| ≤ 64.** Exponentiation by squaring is carried in double-double. It is exact whenever xⁿ is representable and within 4 ULP otherwise. Plain-double squaring drifted up to 12 ULP (x^57).
3. **exp.** The card's degree-13 Taylor/Horner is kept, but `1 + r·P(r)` is added with an exact Fast2Sum. Without it exp(1) = 2.7182818284590455, 1 ULP off the worked example.
4. **hi/lo constants.** log2 and log10 are `lnDD × (hi, lo)` with hi = LOG2E or 1/LN10, and lo = 1/ln2 − hi or 1/ln10 − hi. lnDD's series uses 1/3 as 0.3333333333333333 plus its low part. The low parts are derived in ≥ 80-digit decimal arithmetic. Plain ln·const reached 4 ULP against a bound of 3.
5. **1/LN10 literal = 0.4342944819032518** (the nearest double). `1/Math.LN10` = 0.43429448190325176 is 1 ULP off and not allowed.

**Scoping and domain:**
6. **Property ln(exp(x)) within 4 ULP of x** is scoped to 1 ≤ |x| ≤ 700. For |x| < 1, exp(x) rounds at about 1e-16 absolute, far above ulp(x), so no implementation can meet it.
7. **ln(+∞)** throws `EngineFault('I0.overflow')`. The card and 02 §3.8 were silent. ln(NaN) throws `I0.nan`, and x ≤ 0 throws `I0.domain`, as before.

**Card edits (T02-02).**
- A contract paragraph is added.
- Steps 2, 4, 6 and 7 now describe the deviations, including `lnDD` as an internal helper.
- The fault test adds ln(+∞).
- A new deviation AC covers bit-exact integer powers, the hi/lo log constants with the `1/LN10` literal asserted, and exact exp(1). The vector files and golden hash cover every deviation path.
- The property is re-scoped.
- Backups are in `/workspace/spec/backups/E53/`.

## E-52 — Producer rulings on unit 15B (Systems, 2026-10-21)

1. **Ids.** `chn_`, `wir_`, `brd_`, `lgr_`, `chp_`, `chl_`, `riv_`, `itp_`, `ics_` added to the E-26 id table and the `no-noncompliant-entity-prefix` allowed list (T10A-01 cards and packs, 10A `_unit.md`). `ali_` is the existing 03 entity kind.
2. **Catalog (15 §3.15 codes, existing classes only, no existing class changed).** Aliased to existing rows: `ALI_CHARTER_FEE`→`SOC_ALLIANCE_FOUNDING_FEE` (SINK), `ALI_PAYOUT`→`SOC_ALLIANCE_PAYOUT` (TRANSFER), (`INTEGRITY_CLAWBACK`: see 2a). New rows (catalog.csv + legpolicy.csv): `ALI_CONTRIBUTION`, `ALI_MEMBER_TAX`, `ALI_MERGE` TRANSFER (player↔alliance treasury, E-9); `WIRE_POST_FEE` SINK (no recipient); `ALI_SOC_FEE` SINK under the current 03 NPC model, tagged revisit if the owner approves the NPC TRANSFER switch. NPC SINK sweep still held.
   2a. **`INTEGRITY_CLAWBACK` (Producer override, replaces the earlier `ADM_CLAWBACK` alias).** Class = original posting, reversed (15 §3.15), modelled on the existing 03 compensating-entry family as a class-selected alias (aliases.csv, same form as `BIZ_REVENUE_NPC`): FAUCET original → `ADM_CORRECTION_OUT` (SINK); SINK original → `ADM_CORRECTION_IN` (FAUCET); TRANSFER original → `ADM_CORRECTION_TRANSFER` (TRANSFER, legs swapped). No new class or row. Reason-coded, second admin approval (21) kept. Open item: CREDIT_CREATE / CREDIT_DESTROY / REVALUE originals have no correction code; kept as a rejection by Producer ruling (T15B-08 returns typed error `CLAWBACK_CLASS_UNSUPPORTED`, AC-15B-08-CLAWCLASS). Credit is unwound through the 10/11 default path. No correction codes are added (that would extend the approved ledger core).
3. **INV-SOC-004** row added to 20 §3.1.6 (TICK, FATAL, owner 15), worded from 20 §3.15. T15B-04 keeps its AC and now lists the invariant in front matter.
4. **15#50** numbers unchanged; no Quant retune.

## E-51 — Engine Dev PRs #20 (T02-05) and #21 (T04-02) (Systems, 2026-10-21)
Backups: `/workspace/spec/backups/E51/`.
1. Genesis Day (day-of-year 1 = Q1 day 1) is exempt from the "no holiday on a quarter's first or last day" rule, flag-on only (02 §3.2, test 4; T02-05, AC-02-05-GENESIS). GLOBAL-CONTEXT G6 `Boundary` extended with `WEEK_OPEN`, `MONTH_OPEN`, `QUARTER_OPEN`, `YEAR_OPEN`, `CHAPTER_OPEN`, `PHASE_CHANGE` (PR #20), with hook order.
2. T04-02 readings (Quant answers): (a) previous month confirmed, AC-04-02-REFPERIOD; (b) offset on N2Y/N5Y/N10Y only, AC-04-02-OFFSET; (c) zero-share stub equals T04-11 and is replaced by it, AC-04-02-ZEROSHARE, AC-04-11-MIXSTUB; (d) new key `macro_auction_announce_tick` = 420 (23, 04 §3.10.2, T04-11), consensus literal 420, AC-04-02-ANNOUNCE; (e) pre-genesis skipped, AC-04-02-PREGENESIS; (f) [from, to), AC-04-02-RANGE; (g) excluding auctions from `mac.schedule` is fine: 04#13 is about releases (`ReleaseKind`), T04-11/T04-12 read `auctionsInQuarter`, and 05 MKT-02 `mkt.calendar` names no 04 source; its "auction times" are 05 session auctions. AC-04-02-SCHEDULE.

## E-50 — Producer rulings on unit 11 (Systems, 2026-10-21)
Backups: `/workspace/spec/backups/E50/`. No existing class changed; 03 untouched.
1. Ids `lab_`, `cls_`, `dts_`, `res_`, `run_`, `mdl_`, `dep_`, `grf_`, `lic_`, `rpj_`, `evl_` added to the E-26 table and lint (T10A-01, 10A `_unit.md`); proposal marks removed (T11-01, 11 `_unit.md`); spec 11 dataset `dst_` → `dts_`. Note: `res_` was 07A's old reserve kind (renamed `rsv_` in E-38); code still using `res_` for reserves (E-38 repo hits) now collides with researchers.
2. Rows, current 03 model, each tagged 'revisit if owner approves NPC TRANSFER switch': `AI_HW_SALE` FAUCET ELASTIC_IN frm; `AI_HW_DEPRECIATION` REVALUE ACCRUE; `AI_ENERGY` SINK ELASTIC_OUT frm; `AI_COLO` SINK ELASTIC_OUT frm; `AI_PARTNERSHIP` SINK ELASTIC_OUT frm; `AI_RESEARCH` SINK ELASTIC_OUT frm (negative swap for the cancel refund); `AI_STARTER_COMPUTE` FAUCET MINT 1221/4110. Legs PROVISIONAL. Player-counterparty branches of sale/energy/colo use PAY TRANSFER. T11-01 rebound. These add 2 FAUCET and 4 SINK codes outside T03-02's 37/86 tables.
3. 04 owns `aiRaceIndex`, value [Quant]; T11-12 port marked.
4. AC-11-02-FRESHSTART: Fresh Start never re-issues the starter grant.

## E-49 — E-48 applied to the top-end friction ACs (Systems, 2026-10-21)
Backups: `/workspace/spec/backups/E49/`. All PROVISIONAL [Quant]. 03 and catalog classes untouched (SINK sweep on hold).
1. 23: the eight keys keep their E-47 values (E-48 confirms them all) and are marked PROVISIONAL [Quant] E-48.
2. Worked numbers recomputed: T09B-03, T13B-07 unchanged; T05-11 $3B cap 237,599 shares (second-alt refusal 62,401); T07B-04 $100M add-on corrected $0.63 → $0.69 (0.685711).
2a. **Rule (Systems):** quantity caps (share and contract counts) round DOWN with floor so a cap is never exceeded; money keeps round-half-even.
3. T20B-11: AC-20B-11-TOPEND-GROWTH metrics named (band 1 CAGR $100M→$2B 0.40–0.56; band 2 median daily growth at N ≥ $2B 0.19–0.30); new AC-20B-11-TOPEND-RUNS and -DRAG (D 0.55, retune order); OPEN note on managed/average growth below MSI drift.

## E-48 — Quant: top-end friction coefficients and AC-20B-11-TOPEND-GROWTH bands (PROVISIONAL until engine; 2026-10-21)
Refers to Systems' top-end friction entry, now headed E-47 at line 1598 (it was briefed as E-46).

**Ramp check.** `w = σ(log2(N/$2B)/0.35)` gives w($100M) 4.3e-6, w($0.99B) 0.0522, w($1B) 0.0543, w($2B) 0.5, w($3B) 0.8418. The maximum change per 1% step in N is 0.25·log2(1.01)/0.35 = 0.0103. All of Systems' figures are correct. A figure of "0.011" seen elsewhere is a rounding of 0.0103. Keep width 0.35 and center $2B.

**Method: reduced model, not the full sim.** Fifteen full 2,100-GD bot runs at 720 ticks/GD were too slow for a tuning loop. Script: /tmp/qtop.py.
- The base is each E-42 run's own unchecked daily log-growth path, taken from the `.w14/` checkpoints.
- Past GD 1,400, each run uses the mean of its last 50 checkpoint intervals.
- Friction is a composite multiplicative drag on growth: `g_eff = g_raw · (1 − D·w(N))`, applied daily along the path.
- With D = 0 the model reproduces E-42: excellent R4 419–451 and R5 978–1,124.
- The split of D across the five mechanisms below is an allocation. Each mechanism's real drag can only be measured on the engine.

**Solved composite: D = 0.55.** At w = 0.84 ($3B) friction removes 46% of raw growth, and at $1B only 3%. It is never a charge on wealth.
Allocation (sums to 0.55), with E-47 coefficients:
- **Rival response, 0.25** (business growth). Keep trigger 0.35, entry_k 1.0 and price_cut 0.05, so NPC prices fall 4.2% at $3B. This is the main brake, because the top style grows by business count (55 vs 40–44).
- **Participation cap, 0.20** (trading growth). Keep base 0.20, which caps trading at 0.24 ADV at $3B. Size above that cap pays the existing T05-04 impact cost or is refused.
- **Concentration add-on, 0.07.** Keep k 0.5 and free 0.02. It binds only on single positions above 2% of open interest or float.
- **Scrutiny delay, 0.03.** Keep k 1.0 and ref 0.10. It only slows approvals; it has a small growth effect and is mostly a cue that the player is big.
- **Large exposures: 0.** The 25% cap is unchanged; it is a solvency rule, not a growth brake.
If the engine measures less than 0.55 in total, raise rival price_cut first (up to 0.08), then lower the participation base (down to 0.15).

**Results at D = 0.55** (3 seeds per style; casual and neglected never reach $100M, so friction doesn't apply to them):

| Style | Growth $100M→$2B (CAGR %/GD), seeds | Above $2B (median daily %/GD), seeds | R4 GD | R5 GD | $20B by GD |
|---|---|---|---|---|---|
| excellent | 0.451 / 0.517 / 0.398 (unchecked 0.466 / 0.537 / 0.430) | 0.246 / 0.274 / 0.217 (unchecked 0.55 / 0.61 / 0.48) | 451 / 419 / 426 | 1,117 / 1,000 / 1,180 | 1,921 / 1,784 / 2,069 |
| managed | 0.384 / 0.397 / 0.397 | 0.12 | 613–663 | 1,372–1,420 | never |
| average | 0.29–0.35 | 0.12–0.15 | 594–653 | 1,464–1,687 | never |

Medians for excellent are 0.451 below $2B and 0.246 above. At GD 1,400 its NW is $4.7–7.0B (it was $10.6–25.4B unchecked).

**Rank pacing:**
- Top R4 419: target ~430, holds.
- Top R5 1,000: target ~1,050, holds. Friction adds about 20–55 GD to R5.
- Engaged R5 (managed) 1,372–1,420: target is after 1,344, holds.
- The top style reaches $20B at GD 1,784, with the median at 1,921: target ~2,000, holds.
- Side effect: managed and average players drop to about 0.12–0.15%/GD above $2B, which is below the 0.29%/GD MSI drift (see E-42 item 3). Re-check once MSI exists.

**Metrics and bands (AC-20B-11-TOPEND-GROWTH).** Band 1 is the CAGR from first reaching $100M to first reaching $2B. Band 2 is the median of daily growth while N ≥ $2B. These must be the metrics, because daily medians below $2B read low: excellent shows 0.33–0.47 without friction.
- Seed standard deviation is 0.060 for band 1 and 0.029 for band 2.
- Applying median ± max(2·sd, 0.03) gives 0.33–0.57 for band 1 and 0.19–0.30 for band 2.
- **Proposal:** band 1 keeps the placeholder 0.40–0.56. It already sits inside the measured spread, and friction moves it by only −0.02. Band 2 tightens to **0.19–0.30**.
- Re-derive both with at least 10 excellent seeds on the engine. Three seeds understate the spread.

**Card ACs for Engine Dev.**
- Five styles × at least 3 seeds (at least 10 for excellent) to GD 2,100. The two bands above must hold, plus: top R4 within 380–480, top R5 within 950–1,150, engaged median R5 after 1,344, top style reaches $20B within 1,800–2,200.
- Measure the realised composite drag (1 − g_eff/g_raw)/w at w ≥ 0.5 against the 0.55 target.

## E-57 — Quant: 10#35 crunch severity cap (E-43 retune; PROVISIONAL until engine; 2026-10-21)
Designer asked for the P99 drop to sit near 50%; E-43 had P99 at 56.5%. Fix: a **hard cap on the severity draw**, `m = min(μ_m·exp(σ_m·Z − σ_m²/2), m_max)`, with **m_max = 3.2** (σ_m 0.70 and μ_m 1.05 unchanged; cap applied after the draw). The cap binds in about 2.6% of scenarios (P(Z > 1.94)).

Sim: /tmp/q35w.py, 1,000 seeds × median of 15 cities.

| Run | P1 | P10 | P50 | P90 | P99 |
|---|---|---|---|---|---|
| Stream seed 35 | 12.1% | 16.9% | 25.1% | 40.4% | 50.1% |
| Stream seed 36 | 12.4% | 17.1% | 25.2% | 39.2% | 49.7% |

- All three bands hold: P10 15±3, P50 25±3, P90 40±4.
- Cap sweep, hard cap, P99: m_max 2.0 → 41.2% (and P90 falls to 38.6%); 2.6 → 46.0%; 3.0 → 48.8%; 3.3 → 50.6%; 3.6 → 52.3%.
- Soft cap `m_max·tanh(m/m_max)` was rejected. At m_max 3.0 it already pulls P50 down to 24.8% and P90 to 37.9% with P99 at 46.2%: it compresses the middle, not just the tail.
- AC addition to 10#35: P99 at most 50% + 3.
- E-48 top-end retune: Systems logs it. Quant values are in /workspace/specs/quant-E48-retune.md.

## E-58 — PR #30 (T22A-01 ContentView): statistics office id and CB FX side (Systems, Producer request, 2026-10-21)
Backups: `/workspace/spec/backups/E58/`.

### E-58.1 Statistics office id
- Ruling: `npc_STATS_<B>` with canonical bloc codes (`npc_STATS_FDL`, `npc_STATS_EUN`, `npc_STATS_PYN`, `npc_STATS_NKR`, `npc_STATS_SRL`). The PR #30 placeholder becomes the canonical id.
- Why: 22 §1.4 already names the office an "`npc` institution", and `npc` is a 03 §2.1 entity kind ("named NPC actor (person or institution)"). It follows the 22 §2.1 per-bloc institution pattern `npc_<CODE>_<B>` (`npc_DGF_<B>`, `npc_PGS_<B>`, `npc_AMC_<B>`). `gov_`/`reg_` don't fit: in 03 they are balance-sheet entities (treasury, regulator). Matches `^(?:[a-z]{3}|hh|prop)_`, 13 chars.
- Holder class npcFirm, `ownerId` `gov_<B>`. It never holds money: it only publishes releases (04 §3.15) and declares cycles (04 §3.3.6, §6.5). No reason code posts to it, and bribes have no mechanical effect (04 §7 row 10).
- No new E-26 prefix: `npc_` is a core 03 kind, so the T10A-01 allow-list and `no-noncompliant-entity-prefix` are unchanged.
- Edits: 22 §1.4 table header names the id. In T22A-01, the `ReleaseNames` comment, a step 4 bullet and AC-22A-01-RELEASES now pin `npc_STATS_<B>`. No 04 card names a statistics-office id, so no 04 edit.

### E-58.2 CB FX side (AC-22A-01-FXSIDE)
- Evidence: 22 §4.5 quotes `ast_FX_EUNFDL` as EUN/FDL (S0 1.1000, FDL per EUN), and `ast_FX_FDLNKR`/`FDLPYN`/`FDLSRL` as FDL/xxx (S0 10.5263/6.6667/5.0000, xxx per FDL). Base priority is EUN > FDL > NKR > PYN > SRL (06 §3.9.1). T04-14 l.39 uses the authored legs. With input p = FDL per unit of own currency, the EUN CB sells the base at p, and the NKR/PYN/SRL CBs buy FDL (the base) at 1/p (0.095 → 10.5263 = S0).
- Ruling: the **worked fixture is right**, and the card text ("EUN … limit price is inverted (1/p)") was wrong. PR #30's `cbSellOwnForFdl` (SELL EUNFDL at p; BUY FDLxxx at 1/p) is correct.
- Edit (Quant's card, minimal Systems correction): AC-22A-01-FXSIDE rewritten with one example per pair: SELL EUNFDL @1.1000; BUY FDLNKR @10.5263; BUY FDLPYN @6.67 (0.15, 2 dp); BUY FDLSRL @5.0000 (0.20).

## E-59 — Systems side of Quant's E-48 retune (PROVISIONAL [Quant], pending the drift-target ruling by Producer/Designer; 2026-10-21)
Source: `/workspace/specs/quant-E48-retune.md`. Backups: `/workspace/spec/backups/E59/`. Everything here is PROVISIONAL.
- **(a) Participation anchor (T05-11):** anchor = max(20-GD average position, 120-GD EMA); anchor rise ≤ drift + 0.25%/GD. New AC-05-11-TOPEND-RATCHET (≤ 1.92× after 120 GD; 1.0054^120 = 1.908).
- **(b) Rival gate (T09B-03):** cluster-aggregated sector share (same aggregation as the T03-17 ramp), peak high-water mark, release only after ≥ 5 pp below peak for 56 GD. New AC-09B-03-TOPEND-RIVAL-CHURN. Quant's entry_k 1.5 / price_cut 0.07 recorded, not applied to the existing AC.
- **(c) Flow-adjusted g_raw (T20B-11):** excludes F_d per E-56 Q10. New AC-20B-11-TOPEND-FLOW (transfer moved between days → cumulative drag within 1%).
- **Drag shape (T20B-11):** excess-only, g_eff = drift + (g_raw − drift)(1 − D·w) if g_raw > drift, D = 1.0 (Quant §2(b), §3).
- **AC-20B-11-TOPEND-REAL:** added as BLOCKED on the drift ruling (fails at drift 0.29 unless drift ≤ 0.21%/GD).
- **E-47 ramp refs:** T03-17 notes the shared `frictionNW` aggregation.
- **23 registry rows ([Quant] PROVISIONAL, E-59):** `msi_drift_per_gd` 0.0029, `mkt_topend_anchor_avg_gd` 20, `mkt_topend_anchor_ema_gd` 120, `mkt_topend_anchor_rise` 0.0025, `topend_excess_d` 1.0, `biz_rival_release_pp` 0.05, `biz_rival_release_gd` 56.
- **Left for later:** the E-48 AC-20B-11-TOPEND-DRAG target (D = 0.55) and the growth band 2 stay as they are until the drift ruling.
- **Resolved by E-60:** drift ruling final (0.0029, D = 1.0). RATCHET, RIVAL-CHURN and FLOW are final; entry_k 1.5 / price_cut 0.07 stay PROVISIONAL; TOPEND-REAL, E-48 TOPEND-DRAG (D = 0.55) and growth band 2 are superseded (marked in the cards). AC-17-NW-NOMINAL parked in _authoring/RECONCILE-TODO.md (no 17 cards yet).

## E-60 — E-48 retune final: top-end drag above drift (Quant; Systems co-owns; PROVISIONAL until 03 MSI lands; 2026-10-21)
Ruled by Producer and Designer: drift stays at `msi_drift_per_gd` = 0.0029 (0.29%/GD), no new sinks, D = 1.0. This entry supersedes AC-20B-11-TOPEND-REAL (the drift-cut AC in /workspace/specs/quant-E48-retune.md and in E-59), along with E-48's D = 0.55 and growth band 2.

**Curve.** `g_eff = drift + (g_raw − drift)·(1 − D·w(N))` when g_raw > drift; otherwise `g_eff = g_raw`.
- D = 1.0, and w is the fixed E-47 ramp (centre $2B, width 0.35, linked alts aggregated).
- g_raw is the flow-adjusted daily return, excluding F_d (E-56 Q10). The E-42 bots make no P2P transfers, so F_d = 0 in this verification.
- Real growth = nominal − drift.

**Verification.** /tmp/qtopb.py on the E-42 checkpoints: 3 seeds per style. The top-end rate is each run's mean over its last 50 checkpoint intervals (about 400 GD).

Nominal %/GD per seed (real in brackets):

| NW | excellent-1/2/3 | managed-1/2/3 | average-1/2/3 |
|---|---|---|---|
| $2B | 0.417 / 0.449 / 0.385 (+0.127 / +0.159 / +0.095) | 0.239 / 0.246 / 0.232 (−0.051 / −0.044 / −0.058) | 0.215 / 0.260 / 0.234 (−0.075 / −0.030 / −0.056) |
| $5B | 0.296 / 0.297 / 0.294 (+0.006 / +0.007 / +0.004) | same as $2B | same as $2B |
| $20B | 0.290 / 0.290 / 0.290 (+0.000) | same | same |

- Managed and average grow below drift, so the drag leaves them untouched and their rate is the same at every NW.
- Medians: excellent 0.417 / 0.296 / 0.290 at $2B / $5B / $20B (real +0.127 / +0.006 / +0.000); managed 0.239 (real −0.051); average 0.234 (real −0.056).
- Worst seed per style: excellent-3 at +0.004 real at $5B (+0.000 at $20B); managed-3 at −0.058; average-1 at −0.075.
- Pacing at D = 1.0 is unchanged from quant-E48-retune.md §3: top R4 419, top R5 1,000, $20B at GD 1,742 / 1,865 / 1,923, engaged R5 1,374–1,421.

**Extension to 20 synthetic seeds per style** (circular block bootstrap of the last 50 intervals inside a randomly chosen run; blocks of 10 and 25). This is indicative only, because it overstates the tail.

| Style | Median | Worst seed (nominal) | Worst real | Synthetic seeds with real < −0.08 |
|---|---|---|---|---|
| Excellent | 0.548 raw | — | +0.083 above $2B | — |
| Average | 0.231–0.237 | 0.181 | −0.109 | 3–6 of 20 |
| Managed | 0.220 | 0.118 | −0.172 | 8–9 of 20 |

- Every synthetic seed in every style has nominal growth > 0.
- **Cause of the managed tail:** each managed run has one or two checkpoint intervals at about −2.6% (lumpy spending, about once per 400 GD), and resampling draws that event 0–3 times. The real runs contain it exactly once.
- **Cause of the average tail:** average-1's lower base business yield (interval sd only 0.05–0.08, so no lumps).
- The extension is not used as a gate. It shows that per-seed ACs must be measured over a window of at least 400 GD.

**ACs (T20B-11; Systems co-owns).** Measured as the mean daily nominal rate over windows of at least 400 GD (style statistic = median across seeds) while N ≥ $2B, and at the $2B, $5B and $20B points.
- **AC-20B-11-TOPEND-EXCESS:** excellent style median real ≥ 0 at every point. PASS: +0.127 / +0.006 / +0.000. The drag must not act on books with g_raw ≤ drift (realised drag < 0.01%/GD).
- **AC-20B-11-TOPEND-MID**, in two forms:
  - (1) Style medians: managed and average real ≥ −0.06%/GD. PASS: −0.051 and −0.056.
  - (2) Every seed: real ≥ −0.08%/GD. PASS on the 3 real seeds, with the worst at −0.075 (average-1, margin 0.005).
- **AC-20B-11-TOPEND-NOMINAL:** every competent book (excellent, managed, average) has nominal growth > 0 per seed. PASS: the minimum is 0.215.
- **Systems' exploit ACs, accepted as written in E-59:**
  - AC-05-11-TOPEND-RATCHET: anchor = max(20-GD average, 120-GD EMA); anchor rise ≤ drift + 0.25%/GD; ≤ 1.92× after 120 GD.
  - AC-09B-03-TOPEND-RIVAL-CHURN: cluster-aggregated sector share; peak high-water mark released only after ≥ 5 pp below peak for 56 GD.
  - AC-20B-11-TOPEND-FLOW: g_raw excludes F_d; moving a transfer between days changes cumulative drag by less than 1%.
  - Mechanism coefficients: rival entry_k 1.5 and price_cut 0.07 stay PROVISIONAL, applied with the gate.
- **AC-17-NW-NOMINAL:** the headline NW on the close card and in the UI is nominal NW only. A real or MSI-deflated headline NW is never shown. Flag for Producer: the PF-01 real drawdown and the benchmark real toggle (quant-17B-rulings Q10) are separate derived statistics, not a headline NW. Producer to confirm they may stay.
- **Recheck:** rerun every AC on the engine with the measured 03 MSI drift once MSI lands. If measured drift exceeds 0.29%/GD, AC-20B-11-TOPEND-MID(2) fails first, starting with average-1.

## E-61 — Unit 12 tone lint wired to Designer's term list; spec-22 renames (Systems; Designer data, Producer-confirmed renames; 2026-10-21)
1. **T12-12 step 3 (new):** `toneLint` loads `specs/data/forbidden-real-world-terms.json` (Designer-owned per E-46; v1.0.0, 372 entries, 7 categories, 27-name allowlist). Trust & Safety's technique list is an optional second source: a missing file is skipped, but a malformed one fails, the same as a malformed primary list. Matching: `terms` case-insensitive, `case_sensitive_terms` exact case. Whole word, where a word character is a letter, digit or underscore. Symbol terms (€ £ ¥) need no boundary. Accents fold, EN and FR are both checked, and the allowlist overrides. `dollar`/`$` are allowed; euro, real ISO codes and € £ ¥ are banned. **p10 `bannedIn()` counts only letters as word characters; V3 must not copy it.**
2. **ACs (T12-12, `tonelint.test.ts`):** AC-12-12-TONE-UNDERSCORE (SEC_OFFENSE clean), -DIGIT (EUR30 clean), -ACRONYM ("the Fed" hit, "fed up" clean), -DOLLAR ($500 clean), -SYMBOL (€5 hit), -FR (Société Générale / Societe Generale, "élévation de privilèges" hit), -ALLOW (Meridia Bourse, Federal Dollar clean), -SOURCES, -CATALOG (spec-22 content has zero hits).
3. **Renames in 22 (resolves the JSON `open_spec_conflicts`):** §7.2 `brk_macro_PYN` "Mizuho Macro Data" → **"Meridian Macro Data"** (Producer confirmed it is Meridian, not Meridia). §4.13 STORM COMMODITY_SUPPLY 01 "OPEC-style output cut" → "Producer-cartel output cut". No other occurrences in specs or cards.
4. **Tooling:** `/tmp/avtools/tonelint.py` runs as part of `assemble.py --all`. It reports hits but does not fail the build; a malformed list raises. Its baseline over vision-review/complete is 43 hits; see the follow-ups in the report.

5. **Addendum (Designer rulings `specs/data/E-61-designer-rulings.md` on the 43 baseline hits; 2026-10-21):**
   - Renames: "Mirage USD"/MUSD → **Mirage Dollar/MDOL** (`ast_CR_MDOL`, pools `*_MDOL*`, `V_MDOL`, `mdol` arg) in 06, 22, 23, 24, `_notes/06` and cards T06C-01/T06C-06 (packs regenerated). 22 l.1324–1326 style-profile factor "SEC" (prose + column header) → **SECTOR**; 22 l.1082 `SEC_<sector>` → `SECTOR_<sector>` (⚠ 05 l.304 still defines the factor keys as `SEC_<sector>`; not changed, needs owner). 17 §7.20 heading drops "(SEC)". 23 l.718 (and `_notes/11`) halflife domain `EQ/COMM/SEC` → **`SECY`**: the domain is security data (11 §3.4.1 lists SEC_OFFENSE/SEC_DEFENSE at 56), not sector. 22 §7.2 `brk_macro_PYN` "Meridian Macro Data" (item 3) → **"Corvane Macro Data"** (per the instruction to Systems, replacing Designer's suggested Halvard, which collided with the painter Halvard Rønne; "Corvane" unique across specs, cards, data).
   - Lint: `allowlist.patterns` (regex, whole token, case-sensitive; `^SEC-\d{2}$`) and `scope_exclusions.rules` (file/section/line/category-scoped; sign-in, app stores, real-money, backend security) added to the JSON (v1.1.0) and to `/tmp/avtools/tonelint.py`; T12-12 step 3 + AC-12-12-TONE-PATTERN, -SCOPE.
   - Result: scan 43 → **0 hits**; AC-12-12-TONE-CATALOG (spec-22 zero) passes on the spec text.
   - **Sector factor key rename (Producer ruling 2026-10-21: pure key rename, no math change):** `SEC_<sector>` → `SECTOR_<sector>` in 05 l.304 (1) and card T05-01 (`FACTOR_IDS`/`factorIds` comments ×2, test fixture `SEC_TECH` → `SECTOR_TECH` ×1); 22 l.1082 already done above. `_notes/05` had none. Packs regenerated. Untouched by design: `SEC_OFFENSE`/`SEC_DEFENSE` (security data domains), `SEC_TX`/`SEC_BORROW`/`SEC_LOAN` (securities lending), `SEC_AAA…SEC_BELOW` and `SEC_COUPON`/`SEC_PRINCIPAL`/`SEC_SALE_PROCEEDS*`/`SEC_*_FEE` (securitisation), and the loading symbol `L_SEC` (22 l.523). Code (read-only repo, not changed): `avalon/engine-dev/packages/content/data/indices.json` ×12 `usedBy` strings cite "05 `SEC_<sector>`"; no code builds `SEC_` factor ids.
   - **Loading symbol rename (Producer, 2026-10-21):** `L_SEC` → `L_SECTOR` in 22 l.523 (×2), 05 l.312 (×1) and card T05-03 l.93 (×1). `L_GX`/`L_EQ` unchanged. Packs regenerated.

## E-62 — T04-06 end-to-end NOTRUEGAP mutation AC (Systems, Producer-approved; follow-up to PR #31; 2026-10-21)
- Adds **AC-04-06-E2E-NOTRUEGAP** to T04-06. Once the `macro.cb.decision` emitter exists, swapping the rule's outputGap term to coef × true gap (instead of coef × the noisy published estimate of T04-01b) must change the emitted `cb.decision` output, and the suite must catch it. Modelled on AC-04-01b-NOTRUEGAP; the test is gated on the emitter.
- T04-01b step 3: gap-estimate noise initial state (Quant ruling) ε0 = 0.005·Z0, where Z0 is the first draw of `macro.gapest:<bloc>` at genesis, then AR(1) with no burn-in. Adds **AC-04-01b-GAPEST-INIT**: ε0 = 0.005 × first stream draw, deterministic per seed, with a separate stream for each bloc.

## E-63 — PR #36 (T02-06 RNG streams) contract rulings and PR #33 (T02-03 dmath part 2) Quant rulings (Systems; Producer request; 2026-10-21)
### E-63.1 FX stream key (PR #36)
02's segment charset `[A-Za-z0-9_\-.]+` stays narrow (no `/`). The FX key becomes **`macro.fx:<base>:<quote>`** (e.g. `macro.fx:EUN:FDL`, segments in XXX/FDL display order): updated in the 02 §3.10.4 row, 04 §3.19 and the 04 §3.10 nowcast text, and T04-01 (`S.fx(base, quote)` plus its test). Check: `/` is not in any persisted or seeded data. No world has been persisted and no stream has ever been drawn, since RngManager is not merged. The only `/` keys are in merged code, `packages/engine/macro/streams.ts` l.27 and `schema.test.ts` l.232 (`macro.fx:${c}/FDL`), which PR #36's registry would already reject → **Engine Dev follow-up**. Content `instruments.json` `"pair": "EUN/FDL"` is a display pair, not a stream key, and is unaffected. ⚠ Wording: 04 §3.13.1 calls FDL "the base" of XXX/FDL. Here `<base>` means the first segment (XXX), as in Producer's example.
### E-63.2 Nowcast stream row and helper-only keys
New 02 §3.10.4 row `macro.nowcast:<chrId>:<releaseId>` (owner 04/T04-16; per (character, release) key; the first normal draw is the nowcast ε, stored in `mac.nowcast`). Root **S**, CONFIRMED by Quant: its draws are the nowcast error, so anyone holding them could recover the true release from the published nowcast (same reasoning as `macro.gapest`). Both segments are charset-checked. Ruling: keys come only from registered template helpers (no free-form concatenation); the CI scan enumerates the helpers and templates → **AC-02-06-REGISTRY-HELPERS**. PR #36's row-count test (79 live + sim.bot = 80) becomes 80 live + sim.bot = 81.
### E-63.3 RNG fault codes
There is no standalone fault catalog. Codes are `I0.<snake_case>` across 02/T02-02/T02-04/T02-16, so the RNG codes fit with the `rng_` prefix. New **02 §3.10.7** table lists the PR #36 codes with their triggers: rng_unregistered, rng_foreign, rng_no_tick, rng_entropy, rng_int, rng_student_t, rng_exponential, rng_poisson, rng_categorical. Beyond the six proposed codes, the PR also raises rng_poisson, rng_unregistered and rng_foreign, so all nine are listed. **AC-02-06-FAULTS** added. Proposal: promote §3.10.7 into an engine-wide fault catalog later.
### E-63.4 PR #33 (T02-03) Quant rulings (text per Quant, 2026-10-21)
- **AC-02-03-GREEK-LIMITS** (verbatim): limit greeks for T ≤ 0 or σ == 0, with no fault. This replaces the PR's `I0.domain` on degenerate greeks.
- erfc cutoff stays at Cody XBIG 26.543. The erf split stays at 0.5 provided **AC-02-03-ERF-SPLIT** holds, else 0.46875.
- **AC-02-03-NORMCDF-TAIL** (verbatim): ≤ 5e-13 relative on [−37.5, 0]; exactly 0 below −26.543√2.
- The formulas were not in PR #33 or the errata before Quant's text. PR #33 open question 1 raised the issue without proposing values.
- ⚠ **Conflicts flagged, not changed:** (a) T02-03 step 6's price edge applies to σ ≤ 0 and uses e^{-qT} with an unclamped T. GREEK-LIMITS faults on σ < 0 and clamps T < 0 to τ = 0, so the price for T < 0 differs. (b) E-53 / 02 §3.8 make "4 ULP over all" the contract for erf, erfc and normCdf. ERF-SPLIT allows 1e-15 relative (≈ 9 ULP near 0.5), NORMCDF-TAIL allows 5e-13 relative, and the 26.543 cutoff returns 0 where the true erfc is subnormal (up to ≈ 27.2). All three loosen the contract, so Producer/Quant should amend the 02 §3.8 table or scope these as additional tests.
### E-63.5 Amendment (Quant correction, 2026-10-21; supersedes the E-63.4 conflict flags)
- (a) T02-03 step 6: τ = max(T, 0) (T < 0 clamps); σ < 0 faults; at τ == 0 or σ == 0 the price is intrinsic on the forward: call max(F − Kd, 0), put max(Kd − F, 0). This is now consistent with GREEK-LIMITS.
- (b) AC-02-03-ERF-SPLIT's bound is restated to E-53's 4 ULP (was 1e-15 relative), "restated per Quant 2026-10-21". The 0.46875 fallback still applies if it fails.
- (c) 02 §3.8 now lists the only two named exceptions to the ULP table: normCdf for x < 0 at ≤ 5e-13 relative (the −x/√2 rounding is amplified about 850 ULP); erfc = 0 for x > 26.543 and normCdf = 0 for x < −26.543·√2 (subnormal true values). NORMCDF-TAIL is consistent with them.
- (d) The macro.nowcast root S is confirmed (E-63.2).
### E-63.6 Theta clarification (Quant, 2026-10-21)
- AC-02-03-GREEK-LIMITS: at σ == 0 and T > 0, call θ = (qF − rKd)·I and put θ = (rKd − qF)·J, with I = J = 0.5 at an exact tie. At T ≤ 0, θ = 0 for both.
- New **AC-02-03-THETA-PARITY**: for T > 0, callθ − putθ = qF − rKd (holds because I + J = 1); exempt at T ≤ 0.
- ⚠ **Units conflict, not applied:** Quant's "per year at 256 trading days" has no constant in 02 or 04. The spec's year convention is 06 `ACT_364` (year fraction = game days / 364; 04 Δ = 1/364; option T such as GXV's 30/364). The card says "per year in the same year unit as T (ACT_364)" pending Quant's confirmation. Using 256 would also make θ inconsistent with T and r.

- E-63.6 (resolution, 2026-10-21, per Quant): θ units CONFIRMED as ACT_364 (per year in T's unit, T = game days/364, consistent with r, q and 04's Δ = 1/364). The 256-trading-day year is withdrawn. No per-trading-day theta. A UI per-day figure, if shown, is θ/364 per game day, display-only, never stored by the engine.
### E-63.7 lgamma accuracy (Quant, 2026-10-21)
- New **AC-02-03-LGAMMA-ZEROS** in T02-03: ≤ 1e-14 absolute on [0.5, 3.0] (10,001-point grid, reference with at least 30 significant digits stored as fixtures); ≤ 1e-14 relative elsewhere for x > 0; lgamma(1) == lgamma(2) == 0 exactly. If Lanczos misses, a series in (x − 1) and (x − 2) is required near the zeros.
- 02 §3.8 names this as the **third** exception to E-53's table: absolute near the zeros at 1 and 2, where relative error is unbounded.
- ⚠ Conflict noted: the §3.8 row already said "1e-14 relative" for all x > 0, which no implementation can meet at the zeros. The row now points to exception 3. E-63.5's "only two" wording is updated.

## E-64 — PR #38 (17B SET-02/08): channel for owned cosmetic shells (Systems, Producer request, 2026-10-21)
Does not fit E-56 (engine broker channels); this is a 17/21 platform contract.
1. **Facts.** The "shells" in PR #38 are the interface material themes (17 §2.1 `ShellId`; 14 §3.x), not shell companies. In the PR, `[P]` means "proposed copy pending Studio", not a privacy tag. No money is involved.
2. **Ruling: not `rank`, and not engine `me` either.** Owned cosmetic shells are 21 account-level `Entitlement`s (Rule 3.11.5), created only by the commerce service (§3.13). They are carried by the existing platform channel **`acct:entitlements`** (and `GET /api/v1/me/entitlements`), which the gateway serves from the platform database. Reasons:
   - (a) L7 / Rule 3.13.3 / 19 E19 / 20 INV-STR-002: purchase state must never enter the engine, and buying a shell must leave replay hashes unchanged (21 AT 24). Both the engine-served `rank` and `me` channels would break that.
   - (b) Entitlements are per account; `rank` and `me` are per character.
   
   `rank` is not public (19 Rule 3.8.2: own character, PLAYER), so the leak premise does not apply. The ruling rests on (a) and (b). `rank.shellsEarned` stays as spec'd (14/17).
3. **Shape** (21 §3.13): `AcctEntitlements { items: EntitlementView[] }`, where `EntitlementView { itemId, slot: CosmeticSlot, source, labelPurchased: boolean, grantedAt: ISO-8601 UTC string }`.
   - Contents and order: active only, sorted by itemId with cmpStr, unique.
   - Never carried: accountId, entitlementId, purchaseId, price or spend.
   - The client derives owned shells as slot `SHELL_STYLE` → itemId, and the "Purchased" chip follows `labelPurchased`.
4. **Id fix.** 17 `ShellId` used `cosmetic_${string}`, while 21 item ids are `cos_<slug>` (e.g. `cos_shell_art_deco_office`). A cosmetic ShellId is now the 21 itemId: `cos_shell_${string}` (17 §2.1). `PUT /me/prefs` validates `shell ∈ shellsEarned ∪ owned SHELL_STYLE itemIds`.
5. **Rows added:** 17 §6 channel table and 19 Rule 3.8.2 each gain an `acct:entitlements` row.
6. **ACs:**
   - **AC-E64-ENTITLEMENTS-ISOLATION:** the `rank`, `me` and all engine channel schemas contain no owned/purchased cosmetic field (schema scan). The engine package never imports or receives entitlements. A replay with and without a shell purchase gives identical world hashes.
   - **AC-E64-NO-CROSS-ACCOUNT:** subscribing to `acct:entitlements` returns only the caller's account. Any other account id, or an unauthenticated socket, gets `CHANNEL_DENIED` with no payload. No public channel (board, league, profile, company) carries another player's entitlements, except the profile's equipped-shell "Purchased" label that 14/21 already allow.
   - **AC-E64-SHAPE:** the payload is strict (zod `.strict()`): items are sorted by itemId and unique, revoked items are absent, and none of the forbidden fields appear. A refund removes the item on the next delta.
7. **PR #38 follow-up (Front Dev):**
   - Remove `RankChannel.shellsOwned`.
   - Read owned shells from an `acct:entitlements` mock instead.
   - Rename the mock ids from `cosmetic_*` to `cos_shell_*`, and update `cosmeticName` and the `id.startsWith("cosmetic_")` check.

## E-65 — Tone-lint CLI fix (Systems, Producer report, 2026-10-21)
- **Cause of the "hang":** `/tmp/avtools/tonelint.py` never read stdin. Its `__main__` ignored argv and always rescanned all 25 spec docs with about 400 separate regexes per line (40–60 s), so its 0-hit result never covered UI strings. Fixed: path and glob inputs, a one-regex prefilter, and stdin is never read.
- **Contract:** exit 0 clean, 1 hits, 2 any error (missing or unreadable file, a glob with no match, a malformed list, a per-file (20 s) or total (300 s) timeout, no inputs). Every file scanned and the totals are printed.
- **UI scope:** `--ui ROOT` scans every `strings.ts` and `about-data.ts` under `ROOT/src/` (apps, shell, …), all locales, using string literals including template-literal text, reported as file:line. `--self-test` plants "Goldman Sachs" in a fixture.
- **New AC-12-12-TONE-UIFILES** (T12-12). Baseline: trading-game main has 1 file and 0 hits; PR #38 head has 3 files and 0 hits.

## E-66 — copylint: no hard-coded player-visible literals in .tsx (Systems, Producer request, 2026-10-21)
- New report-only tool `spec/export/build-plan/tools/copylint.py` (sha256 `87a6d0175de4644550f9f24e1402c0d7addb73828376077e71898e6a09728edf`), with `copylint-allow.json` holding the brand tokens and dev-route excludes. It uses the TypeScript compiler API through node and follows the tonelint contract (E-65). It is not in `assemble --all`.
- AC-12-12-COPY-NO-LITERALS added to T12-12 (until a 17 UI card exists).
- Baseline (trading-game main and the heads of #18 #22 #24 #28 #29 #34 #35 #38): 3 hits each, the clock literals `Day ${day} ·` (StatusStrip ×2) and `D${day} ·` (PhoneHome). These should move to strings.ts.

## E-67
**Source:** Avalon Quant (requested by Producer), 2026-10-21. Clarifies E-63.5 erfc/normCdf cutoff strictness.
- The cutoff is **strict**: erfc(y) = 0 only for y > 26.543. At y == 26.543 erfc is computed normally; true value 2.2558350220539375e-308.
- normCdf(x) = 0 only for x < −26.543·√2 (strict).
- The existing 02 §3.8 text "x > 26.543" stands. Code used `>=`; that is a bug (Engine Dev fix).
- **AC-02-03-ERFC-CUTOFF:** erfc(26.543) within 4 ULP of 2.2558350220539375e-308, and erfc(nextUp(26.543)) == 0.

## E-68 — AC-02-06-REGISTRY-HELPERS: literal keys are rejected (Systems, Producer request for PR #36, 2026-10-21)
**Ruling:** helper-only stands. Code under `src/` must build every `ctx.rng(...)` key with a registered template helper (e.g. `macro.fx:<base>:<quote>` via its fx helper). A string literal is rejected even if it matches a registered template, e.g. `ctx.rng('macro.fx:EUN:FDL')`. The CI scan cannot prove the literal stays in sync with the registry, and charset checks run inside the helpers. QA's "literal registered keys are allowed" reading is superseded.
- `ci:streams` exits 1 on such a literal. PR #36's fixture expecting exit 1 is correct.
- The error must name the helper to use, e.g. `use rngKeys.fx(base, quote)`.
- Exemption: the scanner's own fixtures and `*.test.ts` files may contain literals as test data. They are excluded from the scan by path, not by an inline suppression.
- **AC-02-06-REGISTRY-HELPERS (amended):** (a) a literal key matching a registered template in `src/` exits 1 with the helper hint; (b) the same key built via the helper exits 0; (c) an unregistered template exits 1; (d) literals in excluded test paths are not reported.

## E-69 — E-68 scope for PR #36 (Systems, confirms Producer recommendation with one amendment, 2026-10-21)
1. **Exclusions** come from an explicit allowlist of exact paths: the scanner's own fixtures dir, `core/__lint_fixtures__`, and the test-file globs `*.test.ts`, `*.test.tsx`, `*.test.mts`, `*.test.js` (amendment: the test globs follow the scanned extensions). No directory-name matching. `ledger/test` is allowlisted only if it holds test files alone; otherwise it is scanned. The allowlist lives in one file, and the scanner prints it on every run.
2. **Scan scope now:** `.ts`, `.tsx`, `.mts`, `.js` under `packages/engine/` and root `src/`.
3. **Out of scope for #36:** indirect keys (a const holding a literal, concatenation, `join`, `concat`, template strings with free parts). Follow-up **AC-02-06-REGISTRY-INDIRECT**: a type-level (branded RngKey only from helpers) or AST check rejects these. This does not block #36.
- **AC-02-06-REGISTRY-SCOPE:** (a) a literal key in a `.tsx`, `.mts` or `.js` file under the scanned roots exits 1; (b) the same literal in an allowlisted test file is not reported; (c) a non-test file placed in `ledger/test` is scanned; (d) the printed allowlist matches the allowlist file.

## E-70 — T02-09 / T02-11 contracts vs main (Systems, Producer request, 2026-10-21)
1. **Invariant port: option (b).** The T20A-01 types (`InvariantImpl`, `TruthStoreRead`, `TruthWrite`) are the contract. T02-09 builds just those types in `packages/engine/core/invariants/` (no T20A-01 runtime yet). In the same PR, INV-ENG-002 and INV-ENG-003 move to them and `invariant-port.ts` is deleted. No adapter and no two shapes side by side. **AC-02-09-PORT-MIGRATED:** the repo has no import of `invariant-port`, and INV-ENG-002/003 pass unchanged on the new types.
2. **Step 6 wrapper list: specified.** It is exactly `toMoney`, `toQty` and `toPrice`, exported from core for 03 to use. Each is pure, returns exactly what the base constructor returns (same rounding and faults), and calls `notifyMoney` once per call. Nothing else counts as a wrapper. **AC-02-09-WRAPPERS:** a property test shows each wrapper equals its base constructor, and a spy shows one `notifyMoney` call per call.
3. **zod 4: yes.** Core may depend on `zod` 4 (it's in the T13B-01 toolchain), with the major pinned (`^4`). It is used only for the `IntentHandler`/`ViewHandler` schema types and validation.
4. **Content: yes.** Engine core may import `@tycoon/content` (T13B-01 import rules). **Params: create the package; don't widen core.** Add a minimal `packages/params` (`@tycoon/params`) holding the `ParamsView` interface: `num`, `money(key, ccy)`, `bool`, `str`, `list`, `version`. Core re-exports the type, and core's current local ParamsView is deleted in the same PR. The registry contents (23) can follow later; for now a test registry is enough. **AC-02-11-PARAMS-PKG:** `ctx.params` is typed by `@tycoon/params`, and no ParamsView is declared in core.
- Producer decisions noted: T02-11 waits for #36 to merge (no stacking), and `core-port.ts` is deleted in the T02-11 PR.

## E-71 — E-70 follow-ups (Systems, Engine Dev questions, 2026-10-21)
1. If T02-09 lands before #36, T02-09 moves INV-ENG-003 over and deletes `invariant-port.ts`. When #36 merges main in, it moves INV-ENG-002 to the new types, with no port copy brought back. AC-02-09-PORT-MIGRATED is checked on main once both are merged; T02-09 checks it for 003 only. #36 gains the step "002 on the T20A-01 types".
2. `int` is kept, and leaving it out of E-70 was an oversight. The ParamsView is `num`, `int`, `money(key, ccy)`, `bool`, `str`, `list`, `version`. `int` faults if the value is not a safe integer.

## E-72 — scanner node_modules and loan id prefix (Systems, Producer request, 2026-10-21)
1. **Confirmed.** `node_modules/` is allowlisted as an exact path for each package (`packages/engine/{core,ledger,macro}/node_modules/` or the real paths), and a new package needs its own entry. No pattern or directory-name match. The root `node_modules/` gets an exact entry too if it sits under a scanned root. This adds to the E-69 list, and AC-02-06-REGISTRY-SCOPE (d) covers it.
2. **Rename.** `driver.ts:29` `ln_${tick}_${i}` becomes `lon_${tick}_${i}`, as E-26 sets `lon_` for loans (T07A-01: loan→lon). It goes in its own small PR after #36 merges, not in #36, and that PR regenerates the golden hashes and baselines in the same commit, with a note saying only the loan id prefix changed. **AC-ID-LON-PREFIX:** no `ln_` ids are emitted, `no-noncompliant-entity-prefix` passes on driver.ts, and baseline diffs are limited to that id change.

## E-73 — T02-09 implementation choices (Systems, Producer request, 2026-10-21)
1. **Confirmed.** INV-ENG-003 reads the fact `core.ids.worldSeedPublicSalt`. It holds only the public salt, never the world seed or anything derived from the seed root. If the fact is missing while the id log has rows, the check fails; with an empty log it passes. **AC-02-09-SALT-FACT:** both cases are tested, and a scan shows the seed root is not reachable from the fact.
2. **Confirmed.** `PartitionStore.violations()` is read-only, returns a new array in a deterministic order (partition, then key), and feeds `core.store.violations` to INV-ENG-001. **AC-02-09-VIOLATIONS:** two calls return equal arrays, and changing a returned array leaves the store unchanged.
3. **Confirmed.** A wrapper calls `notifyMoney` only after its base constructor succeeds, so a faulting call records nothing. This amends AC-02-09-WRAPPERS: the spy shows 1 call on success and 0 on a fault.
4. **Confirmed, with an amendment.** Uint8Array values are copied when written and copied again on every read, so no caller ever holds the stored buffer. **AC-02-09-BYTES-ISOLATION:** changing the input after a write, or a returned value after a read, does not change the next read.

## E-74 — worldSeedPublicSalt length (Systems, Producer request for #45, 2026-10-21)
**Ruling:** the salt must be exactly 32 bytes, so #45's check stays. Why: the id digest is `SHA-256('TYC/id' || salt || kind || tick || partitionId || seq)`, with no length prefix. A salt whose length varies would make that concatenation ambiguous, so a fixed length is what makes it parse one way only. 32 bytes is the width of SHA-256.
- The salt is set once at world creation from the world's public randomness, it never changes, and it is never derived from the seed root (E-73.1).
- Fixtures and tests with a 16-byte salt are updated to 32 bytes in #45. No live world exists, so no migration is needed. Changing the salt changes every id hash, so #45 regenerates the id baselines in the same commit.
- 02 §3.x (id derivation) and T10A-01 `IdGen` (its constructor) state `worldSeedPublicSalt: 32 bytes`, and the constructor faults `I0.id_salt_length` on any other length.
- **AC-02-09-SALT-LENGTH:** salts of 16, 31 and 33 bytes fail INV-ENG-003 and the IdGen constructor, a 32-byte salt passes, and the ids for a fixed salt match the golden vector.

## E-75 — E-60 per-seed AC restated on 20 real seeds (Quant), PENDING Designer
Supersedes E-60's TOPEND-MID (2) "every seed real ≥ −0.08" (3-seed pass, 0.005 margin; Producer did not accept). Model as E-60: drift 0.0029, D = 1.0, E-47 ramp, flow-adjusted g_raw; 20 real seeds per style, each measured on the last 400 GD of a 1,400-GD run (tg-p10/e60x, analyze.py).
| Style | Median real %/GD | P90-of-seeds real loss | Worst seed | Nominal min | $20B GD P10/P50/P90 (never) |
|---|---|---|---|---|---|
| Excellent | +0.138 @2B, +0.006 @5B, +0.000 @20B | none (P10 real +0.115) | +0.045 (s7) | 0.290 | 1751/1828/1888 (0) |
| Managed | −0.056 | 0.072 | −0.090 (s10) | 0.200 | 2257/2296/2364 (9/20 by GD 2400) |
| Average | −0.067 | 0.102 | −0.135 (s4) | 0.155 | 2350 (19/20 never) |
- Managed and average sit below drift at every NW, so the drag never touches them; no friction setting changes these numbers. Only drift or mid-book yields move them.
- **AC-20B-11-TOPEND-MID-P90 (PENDING Designer):** per style, P90 of seeds' real loss ≤ X over ≥ 400 GD at $2B–$20B, with honest X = 0.11%/GD (average 0.102; managed 0.072). Nominal > 0 every seed (min 0.155) stands.
- **Open, to Producer:** average's style median −0.067 now fails E-60's TOPEND-MID (1) ≤ 0.06 (it was −0.056 on 3 seeds). Managed passes at −0.056.
- Producer ruling recorded: PF-01 real drawdown and the benchmark real toggle (17B Q10) stay as analysis stats; only headline NW is nominal-only (AC-17-NW-NOMINAL).

## E-76 — Designer acceptance of E-75 (Quant log), FINAL (Producer confirmed 2026-10-21)
Designer accepts E-75 as a two-part AC on 20 seeds per style, measured in real %/GD over the last 400 GD:
- (a) **AC-20B-11-TOPEND-MID-P90:** P90 of seeds' real loss ≤ 0.11 for every style (measured: managed 0.072, average 0.102). ACCEPTED.
- (b) **AC-20B-11-TOPEND-MEDIAN:** excellent median real ≥ 0; managed and average median real loss ≤ 0.07 (measured −0.056 and −0.067). This loosens E-60 TOPEND-MID (1) from 0.06 to 0.07. CONFIRMED by Producer, so it is FINAL and supersedes E-60's 0.06.
- (c) Nominal > 0 for every seed (min 0.155) stands.
- Designer rationale: a soft real-value ceiling above $2B for mid books is intended, and R6 should need excellent play.
- Rerun rule: any change to msi_drift_per_gd or to mid-book yields re-runs this AC before merge.

## E-77 — E-67 constant amended to the 256-bit reference (Quant and Producer, 2026-10-21)
- AC-02-03-ERFC-CUTOFF now uses the 256-bit reference value for erfc(26.543) (…937e-308; the exact digits are taken from Engine Dev's reference fixture), not the libm value 2.2558350220539375e-308. They differ by at most 1 ULP. The 4 ULP bound and erfc(nextUp(26.543)) == 0 are unchanged. #33 is merged and already within the bound, so no code change is needed.

## E-78 — district waterfront rule and river flags (Systems, Designer request for T10A-13, 2026-10-21)
1. **Waterfront terrain for ports:** the T10A-13 test "every port: true district has a waterfront terrain role" accepts `waterfront`, `industrial_shore` and `island`. An industrial shore is a real quay frontage, and an island district is bounded by water. This settles Arsenal Yards, Harbor Freight, Delta Wharf, Harbor Works, Rig Yards and Ore Docks. Any other terrain role with port: true fails. **AC-10A-13-PORT-WATERFRONT.**
2. **22 §3.2 R flags added**, following riverside terrain: Kaiyo Delta Markets, Mirako Riverside Arcades, Vintra Old Mill, Cobreval Riverside Colonia. **AC-10A-13-RIVER-FLAG:** every district with riverside terrain carries R in 22 §3.2, and riverOrCanal is true for it in district-flags.json. Note: R feeds river flood perils (08), so these four districts gain river-flood exposure. Quant/08 is informed. The backup is in spec/backups/E78/.
