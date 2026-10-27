# PR #3 review (read-only): V3 ledger core, packages/engine/ledger @ d68461a
Reviewed 2026-10-20 23:55 CEST against V3 03, cards T03-02..12, ledger-core v0.7 (+§11 PD-1..15) and ledger-ref/ (catalog v2, binding-tests, errata). Nothing was posted to GitHub.

## Rulings (the 11 ambiguities A-1..A-11; A-12 is status, not a ruling)
| # | Ruling | Verdict | Fix |
|---|---|---|---|
| A-1 | INV-LED-004 follows card I4, not §4 L4 text | CONFIRM reading; OVERRIDE the M2 check | The M2 check `ΔcomputeM2 === Σ postingEffect.m2` is a tautology (both read the same 1001/2100 accounts). Implement T03-11 step 7 per entry, F1 below. Spec erratum E-7: L4 text is wrong, use 03 §3.5.3. |
| A-2 | Add Σ sys:2909 to netIssuance for I17 | CONFIRM + add check | Add the per-sector mirror `sys:2909:X + X:1009 === 0n` (F2). Erratum E-8: I17 / T03-11 `netIssuance` must include 2909. |
| A-3 | Leg = (reason, ccy, legId); payProRata one leg per holder | CONFIRM | Matches PD-5 "per posting leg" and T03-07 payProRata (one PAY cash leg per holder). |
| A-4 | Per-world `ReasonCatalog` | CONFIRM | Δ11/PD-7 forbid process-global registries. The frozen 03 data may stay a shared const; registrations are per world. |
| A-5 | Supporting legs only need to be registered | OVERRIDE | Use the card rule (T03-05 step 8, F3), and also check each composed leg against the template that built it (spec test 8 fee/tax SINK legs pass). |
| A-6 | Reserves 1002 ≥ 0 at t=719, no T03-15 | CONFIRM (interim) | Add `it.todo('T03-15 negative reserves convert to standing facility at close')`; no scenario with banks overdrawing reserves until T03-15 lands. |
| A-7 | INV-LED-012 = typeof bigint check | CONFIRM (interim) | Replace when the unit-02 provenance tag exists. |
| A-8 | INV-LED-009 = committed-state write counter + static check | CONFIRM (interim) | Replace with the 20A writeSet. |
| A-9 | I18 reads a per-day buffer, not the archive | CONFIRM | I18 is DAY_CLOSE only (T03-11); spec test 2 bans archive scans, not an O(day) buffer. |
| A-10 | TickFlows row for all 5 ccys every tick | CONFIRM | Agrees with the v0.7 §6.5 sizing (720 rows × 5 currencies). |
| A-11 | swapAsset issuance via `assetAcctFrom` (2600) | CONFIRM | It's a T03-07 option; 0n postings stay banned (INV-LED-007). |
| A-12 | "Producer confirmed approval" | NOTE | v0.7 §11 says dispatch waits for the owner. Get the owner's yes on the record before merging. |

Extra findings (not rulings):
- **X-1 toMoney diverges from V3 02 §3.9.2 (binding G3).** The PR rounds the shortest decimal string. V3 computes `x*1e6` (one IEEE multiply) and then rounds half-even. Counterexamples: `toMoney(1.0000005)` gives V3 1000001 (1000000.5000000001) vs PR 1000000, and `2.0000015` gives V3 2000002 vs PR 2000001. Fix F4.
- **X-2 restrictedOk** has 3 codes in the PR vs 35 in catalog v2 (card column R). Load the column (F5).
- **X-3 aliases**: the PR has only 2; catalog v2 `aliases.csv` has 28 (26 rows from 24 §8 + 2 from PD-12).
- **X-4** The LEND/REPAY M2 check takes the borrower from `postings[0]`, which depends on rail ordering. Pass the borrower in `entry.meta`.
- **E-4 (aliases):** OK for PD-12. OPS_* rows are dropped, CONFLICT_* are live (catalog-data.ts:394), and an alias used as a reason fails. The other 24 §8 aliases are missing (X-3).
- **E-5 (templates):** ESCROW_PLACE/ESCROW_SETTLE/CONTROL_RECLASS are absent, which is acceptable because 016..022 are out of scope. CONFLICT_* are on `['PAY']` for now. Blocker for the follow-up: CONFLICT_* must not be postable via PAY once the escrow lands (Δ14).
- **Determinism/bigint spot-check: clean.** `Map` appears only inside `det.ts` SortedMap (keys sorted by cmpStr); `Object.keys` appears only in canonEncode, followed by a sort. No Date, Math.random, timers, localeCompare or JSON.stringify. `Number()` is used only for tick/account-code integers (accounts.ts:32, world.ts:157/308, invariants.ts:287-298, templates.ts:111), and `Math.floor` only on integer ticks and codes. Every Money is bigint (types.ts; the only `number` field is `postingSeq`).

## Priority 1: the INV-LED-004 M2 formula vs 03#6 / 03#7
§4 L4 (= 20 INV-LED-004): ΔM2 − ΔM0 = ΣCREDIT_CREATE − ΣCREDIT_DESTROY.
V3 03 §3.5.3 (I4): ΔM2 = Σ bank CREATE − DESTROY + ΔM0 held by non-banks + bank own-account flows. ΔM0_cb = Σ CBK CREATE − DESTROY + cbk own-account.

| step | ΔM0 | ΔM2 | Σcreate−destroy (all) | L4: ΔM2−ΔM0 = ? | §3.5.3 |
|---|---|---|---|---|---|
| 03#5 LEND 1e12 into deposit | 0 | +1e12 | +1e12 | 1e12 = 1e12 ✓ | 1e12 + 0 + 0 ✓ |
| 03#6 REPAY 1e12 from deposit | 0 | −1e12 | −1e12 | ✓ | ✓ |
| 03#6 interest 5e9 deposit → bank income (TRANSFER) | 0 | −5e9 | 0 | −5e9 ≠ 0 ✗ | 0 + 0 + (−5e9 own-account) ✓ |
| 03#7 QE 1e13 into fund 1001 (cbCredit) | +1e13 | +1e13 | +1e13 | 0 ≠ 1e13 ✗ | ΔM0_cb = +1e13 ✓; ΔM2 = 0 + 1e13 (non-bank M0) ✓ |
| (control) cbCredit 1e13 to a bank's 1002 | +1e13 | 0 | +1e13 | −1e13 ≠ 1e13 ✗ | 0 + 0 ✓ |

The PR is right and the §4/20 text is wrong. The PR's tests pass these numbers (binding.test.ts:48-82). However, its M2 identity can't fail, so F1 is needed for the check to mean anything.

## Priority 2: the sys:2909 elastic bridge
ELASTIC_IN(X→E, a) (03:450, card 03#3) posts: (1) Dr E:1001 / Cr cbk:2001; (2) Dr cbk:1910 / Cr sys:2900; (3) Dr sys:2909:X / Cr X:1009; (4) Dr X:5200 / Cr E:4000. ELASTIC_OUT mirrors it.
- **Does it net to zero?** Every entry is balanced per entity: sys Dr2909/Cr2900, cbk Dr1910/Cr2001, X Dr5200/Cr1009, E Dr1001/Cr4000. sys:2909 itself does **not** net to zero over time. It holds cumulative elastic net issuance, and `sys:2909:X ≡ −X:1009` per sector at all times. It is balance-sheet, so period close doesn't zero it the way 5900/4900 → 3990 are zeroed. Hence I17 needs `3990+5900+4900+Σ2909 = −2900 = cbk1910` (A-2).
- **INV-LED-005:** ELASTIC legs are FAUCET/SINK, so touching sys:2909 is legal. Gap: L5 checks only sys and cbk:1910, so a TRANSFER touching X:1009 or sys:2909 would pass L5. Such a posting is virtual money that changes no M0, so it's an unattributed purchasing-power channel. F2 bans it.
- **M0_sys:** +a via posting (2), which is the flowLeg (flowIdx = issuance posting ✓, Δ5). Postings (3)/(4) are not BMA and carry no M0, M2 or PEM effect (1009 is excluded from M0/M2: accounts.ts:47).
- **sysSide (Δ6-B, follow-up):** only the holder cash posting (1) counts: F_p if E ∉ S, else F_s. Elastic sectors are never in S and never a holder class. For a bank payee the leg hits 1002 (reserves). The 016..022 PR must classify it by E, not by the 1001 code.

## Fixes ready to paste
F1 (invariants.ts INV_LED_004: add the non-tautological per-entry rules of T03-11 step 7, keep the Σ check):
```ts
// parties = payer/payee entity ids from entry.meta (not from postings[0], see X-4)
const m2 = e.postings.filter(p => p.ccy === ccy).reduce((s, p) => s + postingEffect(p).m2, 0n);
const cls = v.catalog.get(e.reason)!.cls;
const kinds = e.meta.parties.map(kindOfId);
const moneyIssuerOrBank = kinds.some(k => k === 'bnk' || k === 'cbk' || k === 'gov');
if (cls === 'REVALUE' && m2 !== 0n) fail('REVALUE moves M2');
if (cls === 'TRANSFER' && !moneyIssuerOrBank && m2 !== 0n) fail('non-bank TRANSFER moves M2');      // rails between 1001 and deposits conserve M2
if (cls === 'TRANSFER' && kinds.includes('bnk')) ownAccountToday[ccy] += m2;                          // = the "bank own-account flows" line
if (cls === 'FAUCET' && m2 < 0n || cls === 'SINK' && m2 > 0n) fail(`${cls} M2 sign`);
if (isBankCreditCode(e.reason) && kindOfId(e.meta.borrowerId) !== 'bnk' && m2 !== (cls === 'CREDIT_CREATE' ? e.amount : -e.amount)) fail('bank credit ≠ ±amount');
if (isCbkCreditCode(e.reason) && m2 !== nonBankCashDelta(e, ccy)) fail('CB credit M2 ≠ non-bank cash moved'); // 03#7: +1e13; to a bank: 0
```
(`isBankCreditCode` = BNK_*, REPO_BANK_*, PB_*. Tests to add: a REVALUE posting on 1001, a chr→chr pay with a forged extra 2100 leg, a SINK with positive M2, and a CB_CREDIT into bank reserves giving ΔM2 = 0.) The gov exemption covers gov↔player transfers, which move 1003 ↔ 1001 and so legitimately move M2.

F2 (INV_LED_005 + INV_LED_003):
```ts
// L5: virtual elastic money only via ELASTIC_IN/OUT
if (q && (q.code === 1009 || (q.entityId === SYS_ID && q.code === 2909)) && e.template !== 'ELASTIC_IN' && e.template !== 'ELASTIC_OUT')
  out.push(F('INV-LED-005', `${p.reason} touches ${k}`, '1009/2909 only in ELASTIC_IN/OUT'));
// I17 mirror, per sector X and ccy
if (bal(v.post, accountKey(SYS_ID, 2909, ccy, X)) + bal(v.post, accountKey(X, 1009, ccy)) !== 0n) out.push(F('INV-LED-003', `I17 2909 mirror ${X}`, '0n'));
```

F3 (INV_LED_002, supporting legs; T03-05 step 8):
```ts
for (const p of e.postings) if (p.reason !== e.reason) {
  const d = v.catalog.get(p.reason); if (!d) { fail('unknown'); continue; }
  const ok = CLASS_TEMPLATES[d.cls].includes(e.template)
    || (d.cls === 'TRANSFER' && p.reason.startsWith('TAX_') && ['TRANSFER','SINK'].includes(v.catalog.get(e.reason)!.cls))
    || (p.legTemplate !== undefined && d.allowedTemplates.includes(p.legTemplate)); // composeEntries stamps legTemplate (spec test 8)
  if (!ok) fail(`code=${p.reason} template=${p.legTemplate ?? e.template}`);
}
```
(The third branch goes beyond the card text and needs Producer sign-off. It's what makes spec test 8's SINK fee/tax legs inside a trade legal.)

F4 (money.ts toMoney = V3 02 §3.9.2 verbatim):
```ts
export function toMoney(x: number, _ccy: Ccy): Money {
  if (!Number.isFinite(x)) throw new Error(`toMoney: non-finite ${x}`);
  const v = x * 1_000_000;
  return Math.abs(v) < 9_007_199_254_740_992 ? BigInt(roundHalfEvenNum(v)) : BigInt(v);
}
// roundHalfEvenNum: f=Math.floor(v), r=v-f; r>0.5→f+1; r<0.5→f; r===0.5→(f%2===0?f:f+1)
```
Tests: `toMoney(1.0000005) === 1_000_001n`, `toMoney(0.0000025) === 2n`, `toMoney(2.0000015) === 2_000_002n`.

F5 (catalog): regenerate catalog-data.ts from ledger-ref/catalog.csv v2. Map legA/legB to valueLegA/B defaults (drops the DEFAULT_LEG fallbacks for 384 codes), sector to elasticSectors (enforce `sector ∈ elasticSectors` in tplElasticIn/Out), restrictedOk = 'Y' to RESTRICTED_OK_CODES (35), requestableBy to `mayRequest`, and illicit. Load ALIASES from ledger-ref/aliases.csv (28). The 8 rows flagged in `derived` stay TODO(systems).

## Producer summary (5 lines)
1. PR #3 is solid: bigint everywhere, a clean determinism kit and lint, and all binding tests in scope are present. 8 of 11 rulings are CONFIRMed as-is or as interim.
2. INV-LED-004: the PR's card reading is right, and the spec/20 text "ΔM2−ΔM0 = Σcredit" fails 03#6 (interest) and 03#7 (QE). However, the PR's M2 check is tautological, so F1 is needed (spec erratum E-7).
3. sys:2909 is a correct, balanced bridge that holds cumulative elastic issuance. I17 must include it (erratum E-8). Add the 2909/1009 mirror check and a ban on TRANSFER legs touching 1009/2909 (F2).
4. Overrides: A-5 (supporting-leg template rule, F3), toMoney ≠ V3 02 §3.9.2 (F4; 1.0000005 → PR 1000000 vs V3 1000001), and catalog v2 data to load (35 restrictedOk codes, not 3; 28 aliases, not 2).
5. Merge after F1–F5 and the owner's recorded approval (A-12). Escrow/CONTROL templates (E-5) are gated to the 016..022 follow-up.
