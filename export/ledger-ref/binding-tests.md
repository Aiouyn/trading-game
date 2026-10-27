# Binding ledger acceptance tests (reference, non-normative copy)

Source: PR #1 @ `f1269af`. The V3 text is quoted verbatim from `export/vision-review/complete/03-LEDGER-AND-ACCOUNTING.md` and the card text verbatim from `export/build-plan/cards/03/`.

**Section note.** These tests live in 03 **§10 Acceptance tests** (heading at `03:1660`). §8 is *Edge cases* (`03:1612`). ledger-core v0.2–v0.7 says "03 §8 test N" in places; read that as §10 item N (errata E-1).

## 03#2

**V3** `03-LEDGER-AND-ACCOUNTING.md:1663`

> 2. A `MINT` of $5,000 to a new character increases `M0_sys[FDL]`, `M0[FDL]`, `M2[FDL]` and `PEM[FDL]` by exactly 5,000,000,000 micro and `sys:3990` by the same; the three entities touched (character, central bank, sys) each balance (I2).

**Card** `cards/03/T03-11.md:88`

> - `03#2 MINT of $5,000 raises M0_sys, M0, M2, PEM by exactly 5,000,000,000 micro and net issuance by the same`: `ctx.ledger.mint(chr_P, 5_000_000_000n, 'FDL', 'ACCT_START_CASH')` from a test module numbered 14; after step: Δ computeM0sys = Δ computeM0 = Δ computeM2 = Δ computePEM = 5,000,000,000; Δ netIssuance = 5,000,000,000; chr_P, cbk_FDL and sys each have Σ non-memo balances 0 (I2).

## 03#3

**V3** `03-LEDGER-AND-ACCOUNTING.md:1664`

> 3. An `ELASTIC_IN` household purchase of $100 from a player business produces four postings, keeps every entity balanced, raises `M0_sys` by $100 and lowers `hh:1009` by $100.

**Card** `cards/03/T03-07.md:103`

> - `03#3 ELASTIC_IN household purchase of $100 produces four postings`: `tplElasticIn(env, 'hh_C1', 'biz_B', 100_000_000n, 'FDL', 'BIZ_SALES_HH')` with biz receiving into 1001: exactly 4 postings: `Dr biz_B:1001 / Cr cbk_FDL:2001:biz_B`, `Dr cbk_FDL:1910 / Cr sys_SYSTEM:2900`, `Dr sys_SYSTEM:2909:hh_C1 / Cr hh_C1:1009`, `Dr hh_C1:5200 / Cr biz_B:4000`, each 100,000,000 micro; balanced per entity; M0_sys (= cbk 1910 balance) +100,000,000; `hh_C1:1009` −100,000,000.

## 03#4

**V3** `03-LEDGER-AND-ACCOUNTING.md:1665`

> 4. A `PAY` of $50 from a player to an NPC company (both on settlement cash) changes no aggregate except PEM (−$50) and leaves `M0` unchanged.

**Card** `cards/03/T03-11.md:89`

> - `03#4 PAY $50 from a player to an NPC company changes only PEM`: both on 1001; ΔPEM = −50,000,000; ΔM0 = ΔM0_sys = ΔM2 = 0.

## 03#5

**V3** `03-LEDGER-AND-ACCOUNTING.md:1666`

> 5. A bank loan of $1M (`BNK_LOAN_DRAWDOWN`) to a player raises M2 by $1M, leaves M0 and M0_sys unchanged, and leaves the player's and the bank's NW unchanged.

**Card** `cards/03/T03-11.md:90`

> - `03#5 bank loan of $1M raises M2 and leaves M0, M0_sys and both NWs unchanged`: `lend(bnk_N, chr_P, 1_000_000_000_000n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'loan_1')` with chr_P receiving into a deposit at bnk_N: ΔM2 = +1e12, ΔM0 = ΔM0_sys = 0; book NW of chr_P and bnk_N unchanged.

## 03#6

**V3** `03-LEDGER-AND-ACCOUNTING.md:1667`

> 6. Repayment of that loan (`BNK_LOAN_REPAY`) restores M2; interest paid from the borrower's deposit at the lending bank lowers M2 and appears in the "bank own-account flows" line; I4 holds.

**Card** `cards/03/T03-11.md:91`

> - `03#6 repayment restores M2; interest paid from the deposit at the lending bank lowers M2 and shows as own-account flow`: repay 1e12 → ΔM2 = −1e12; then `pay(chr_P, bnk_N, 5_000_000_000n, 'FDL', 'BNK_LOAN_INTEREST')` paid from the deposit → ΔM2 = −5e9 and `ownAccountFlowsToday` = −5e9; INV-LED-003/004 pass on every tick.

## 03#7

**V3** `03-LEDGER-AND-ACCOUNTING.md:1668`

> 7. A central-bank QE purchase of $10M of bonds from a player fund raises `M0_cb` by $10M, leaves `M0_sys` unchanged, and the Stabilizer's inputs are unaffected by the class itself.

**Card** `cards/03/T03-11.md:92`

> - `03#7 QE purchase of $10M of bonds from a player fund raises M0_cb by $10M`: `cbCredit(cbk_FDL, fnd_F, 10_000_000_000_000n, 'FDL', 'CBK_ASSET_PURCHASE', { qty, assetId: 'ast_BOND_X', assetAcct: 1520 })` with fnd_F holding the bonds at book 1e13: ΔM0_cb = +1e13, ΔM0_sys = 0, ΔPEM = +1e13, fnd_F book NW unchanged (cash for bonds at book: the Stabilizer input, which is wealth, is unaffected by the class itself).

## 03#8

**V3** `03-LEDGER-AND-ACCOUNTING.md:1669`

> 8. Cross-currency payment via `FX` keeps each entity balanced per currency through 3800; the translated sum of 3800 at the trade rate is 0; after a 10% move of the FX mark the entity's FX result equals 10% of the foreign leg.

**Card** `cards/03/T03-07.md:104`

> - `03#8 FX keeps each entity balanced per currency through 3800`: A pays 1,000 EUN (1,000,000,000 micro) to B for 1,100 FDL at rate 1.1: per-entity per-ccy nets are 0; translated sum of A's 3800 at the trade rate: 3800:EUN = +1,000,000,000 EUN (Dr) → 1,100,000,000 FDL; 3800:FDL = −1,100,000,000 → sum 0. After the EUN mark moves +10% (1.21 FDL per EUN): translated Σ 3800 of A = 1,000,000,000 × 1.21 − 1,100,000,000 = +110,000,000 (debit); A's FX result = −(translated Σ 3800) = −110,000,000 FDL (A is short EUN), B's = +110,000,000; |result| = 10% of the foreign leg (1,100,000,000 FDL).

## 03#9

**V3** `03-LEDGER-AND-ACCOUNTING.md:1670`

> 9. The payment rail for deposit-to-deposit across two banks moves reserves between the banks and keeps I5 and I6 true.

**Card** `cards/03/T03-06.md:88`

> - `03#9 deposit-to-deposit across two banks moves reserves and keeps I5 and I6`: A holds 1010 at X = $100, B receives into Y; pay $40: postings exactly the 4 of step 7 row 4; recompute I5 (Σ cbk 2001+2002+2003 vs Σ holders 1001+1002+1003, per ccy) and I6 (Σ bank 2100 per bank vs Σ holders' 1010 at that bank) on fixture balances after applying: both hold; reserves X −40, Y +40.

## 03#11

**V3** `03-LEDGER-AND-ACCOUNTING.md:1672`

> 11. A dividend of $1,000,000.000001 to 3 equal holders is allocated so the parts sum exactly to the total and the extra micro-unit goes to the lowest holder id.

**Card** `cards/03/T03-07.md:105`

> - `03#11 dividend of $1,000,000.000001 to 3 equal holders sums exactly`: total 1,000,000,000,001 micro, holders chr_a, chr_b, chr_c with 1 share each: parts [333,333,333,334, 333,333,333,334, 333,333,333,333] (remainder 2 because 1,000,000,000,001 mod 3 = 2; the extra units go to the lowest ids `chr_a`, `chr_b` per allocate's tie rule); Σ parts = total. (03 §10 #11 says "the extra micro-unit"; the arithmetic gives two extra units, both to the lowest ids, which is the allocate rule the test checks.)

**Corrected 03#11 (ledger-core §6.1, PD-4, owner sign-off pending).** The total is 1,000,000,000,001 micro, and 1,000,000,000,001 mod 3 = **2**.
Largest remainder with ties by id byte order gives `chr_a` 333,333,333,334 / `chr_b` 333,333,333,334 / `chr_c` 333,333,333,333, summing to 1,000,000,000,001.
Replacement V3 wording: *"…allocated so the parts sum exactly to the total and the 2 extra micro-units go one each to the two lowest holder ids."*
The card text above already expects this; only the V3 line is wrong. RECONCILE-TODO `:36` can then be closed.

## 03#32

**V3** `03-LEDGER-AND-ACCOUNTING.md:1693`

> 32. A rewarded-ad credit cannot pay an op cost (`REJECT_RESTRICTED_FUNDS`) but can buy a T1 business.

**Card** `cards/03/T03-12.md:65`

> - `03#32 a rewarded-ad credit cannot pay an op cost but can buy a T1 business`: chr with $0 unrestricted; module 21 mints $250 (`250_000_000n`) `ACCT_REWARDED_AD` → after step the balance sits in `1001:RESTRICTED:<t+51840>:AD_GRANT`; `holds.placeCashFor(chr, 'FDL', 100_000_000n, t+1, ref, 'OPS_COST_NPC')` returns `{ code: 'LED_RESTRICTED_FUNDS' }`; `placeCashFor(..., 200_000_000n, ..., 'BIZ_PURCHASE_NEW')` returns a hold id; module 9 `elasticOut(chr, 'frm_FDL', 200_000_000n, 'FDL', 'BIZ_PURCHASE_NEW', { holdId, valueLegA: 1580 })` commits and the restricted lot balance becomes 50,000,000.

## 03#38

**V3** `03-LEDGER-AND-ACCOUNTING.md:1699`

> 38. Corrupting one posting amount in a test tick aborts the tick with I2 or I3 and nothing of that tick is visible after safe mode.

**Card** `cards/03/T03-10.md:84`

> - `03#38 corrupting one posting amount aborts the tick with I2 or I3 and nothing of that tick is visible after safe mode`: TestWorld with the ledger provider and a test-only ModuleDef `{ id: '21', module: '21' }` named `zz_corrupt` (module 21 is not otherwise loaded in 03 tests) whose P12 phase calls `ctx.ledger.pay(chr_A, chr_B, 10_000_000n, 'FDL', 'ADM_CORRECTION_TRANSFER')` (owner 21) and then sets the queued entry's last posting amount to 9_999_999n through `runtimeOf(ctx).queue` (test-only mutation). `step()` returns `committed: true, safeMode: true`, `failedInvariants` contains `INV-LED-001`; balances of A and B and every account equal their values before the tick; no `ledger.entry.committed` event for that entry exists.

## 03#39

**V3** `03-LEDGER-AND-ACCOUNTING.md:1700`

> 39. The money report's daily totals by class equal the ledger's sums (I18) for every day of a 2-chapter run.

**Card** `cards/03/T03-11.md:93`

> - `03#39 money report daily totals by class equal the ledger's sums for every day of a 2-chapter run`: a scripted driver module posts random valid FAUCET/SINK/TRANSFER/CREDIT/REVALUE entries each tick (seeded); after each day close assert INV-LED-003's I18 sub-check passed and the FlowDay totals equal sums recomputed from `ledgerTestHooks.postings`. Fast profile: 14 game days in CI; full profile (2 chapters = 2,688 game days) when `process.env.TYCOON_LONG === '1'` (nightly, same code).
