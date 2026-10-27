# 07-notes: Banking, credit and clearing

Module: `07-BANKING-CREDIT-CLEARING.md`. Every value below is `DEFAULT (Mathis may override)` unless it is a locked decision (L1–L15), the 00 time model, or a value owned by another module (marked "owner").

## 1. Parameters

| key | default | range | unit | what it affects |
|---|---|---|---|---|
| `apc_stress_weight` | 0.25 | 0–0.5 | weight | Anti-procyclicality weight of stressed σ in IM. Lower values make crashes more procyclical (§3.15.3) |
| `bank_cost_of_equity` | 0.12 | 0.06–0.20 | per year | Capital charge in loan pricing = RW × CET1 target × CoE (§3.3.1) |
| `bank_failure_cet1` | 0.02 | 0.01–0.04 | CET1 ratio | Failure trigger leading to resolution (§3.2.2, §3.10.1) |
| `bank_failure_charter_ban` | 1 chapter (8 real weeks) | 0–3 chapters | chapters | Re-charter ban for the owner after a player bank fails (§3.10.5) |
| `bank_fx_margin` | 0.0025 | 0–0.01 | fraction | Bank fee on FX conversions of deposits (§3.1.3) |
| `branch_cost_per_day` | $4,000 × bloc wage index | $1k–$20k | FDL eq. per branch per day | Bank opex (§3.2.4) |
| `ccp_<service>_*` | §3.17.2 table (LD SCAN 720 ticks 99%; OTC HVaR 3d 99.5%; CDS HVaR + JTD; REPO haircut 1d; CRY SCAN 60 ticks + insurance fund + ADL; fees $0.20/contract, 0.2 bp, 0.5 bp, 0.05 bp/day, 2 bp) | ±50% | various | TCH margin, MPOR, mutualization and fees |
| `ccp_sitg1_frac` | 0.10 | 0.05–0.25 | of DF | TCH skin-in-the-game layer 1. SITG2 is also 0.10 of DF (§3.17.8) |
| Default fund cover | Cover-2 (two largest member groups) | Cover-1 to Cover-3 | — | DF sizing (§3.17.5) |
| `cm_min_capital` | $250M, DF ≥ $10M per service | $50M–$1B | FDL eq. | Player clearing membership (§3.17.3) |
| `deposit_rate_floor` | 0 | −0.01–0 | per year | No negative retail rates. Negative rates pass through only to corporate deposits above $10M (§3.1.3) |
| `deposit_share_speed` | 0.02 | 0.005–0.10 | per day | Stickiness of NPC deposit market share (§3.1.4) |
| `dgf_cap` | $250k | $50k–$1M | FDL eq. per beneficial owner per bank | Deposit insurance coverage (§3.8) |
| `dgf_payout_ticks` | 720 | 360–2,160 | ticks | Insured payout delay after failure (§3.8) |
| DGF premium | 0.08% base × risk factor, clamp [0.05%, 0.40%] | — | per year on insured deposits | DGF funding (§3.8) |
| `liq_max_participation` | 0.20 | 0.05–0.50 | of expected tick volume | Liquidation engine slice size (§3.16.4) |
| Liquidation penalty | 1% of liquidated notional, a transfer to the insurance fund or member | 0.5–3% | — | §3.16.4 |
| `loan_default_dpd` | 3 | 1–10 | game days past due | Loan default and acceleration (§3.3.3) |
| `margin_ewma_halflife_ticks` | 240 | 60–2,160 | ticks | EWMA vol for margin (§3.15.3) |
| `max_dsr` | 0.50 | 0.30–0.70 | debt service / income | Unsecured credit limit; liquid-secured loans exempt (§3.4.3) |
| `max_pd_multiplier` | 5 | 2–10 | × | Cap on stacked 04 PD shocks (§3.22) |
| `onr_min_volume_frac` | 0.0001 | 0.00001–0.001 | of bloc deposits | Minimum volume for a valid ONR fixing (§3.7.4) |
| `pb_rehypo_cap` | 1.40 | 1.0–2.0 | × client debit balance | Prime-broker rehypothecation limit (§3.14) |
| `repo_call_due_ticks` | 30 | 10–120 | ticks | Repo margin call deadline before an event of default (§3.12.4) |
| `reserve_buffer_frac` | 0.005 | 0–0.02 | of eligible deposits | NPC banks' target reserve buffer above rr (§3.7.1–2) |
| `retail_ins_fund_cap` | 0.005 | 0.001–0.02 | of retail margin balances | Above this, the retail insurance fund is swept weekly to SINK (§3.16.5) |
| `run_c_crit` | 0.60 | 0.4–0.8 | confidence | Threshold below which withdrawals accelerate (x²) (§3.9.3) |
| `run_threshold` | 0.10 | 0.05–0.25 | outflow over 24 game hours | Declares `bank.run.started` (§3.9.3) |
| `run_w_max` | 0.08 | 0.02–0.20 | per game hour | Peak uninsured withdrawal rate (§3.9.3) |
| Confidence update | α down 0.30, α up 0.05, hourly | — | — | Asymmetric confidence (§3.9.1) |
| `short_disclosure_frac` | 0.01 | 0.005–0.05 | of free float | Legal filing of individual net shorts, 1-day lag (L11 exception) (§3.13.5) |
| `sl_htb_utilization` | 0.95 | 0.85–1.0 | utilization | Hard-to-borrow rejection (§3.13.2) |
| `sl_lender_share` | 0.70 | 0.5–0.9 | of fee | Lender's share of securities lending fees (§3.13.1) |
| `sl_npc_lendable_frac` | equities 0.40, govt 0.50, corporates 0.30, ETFs 0.30 | 0–0.8 | of NPC holdings | Borrowable supply (§3.13.1) |
| `sl_recall_grace_ticks` | 360 | 60–720 | ticks | Recall grace before buy-in (§3.13.4) |
| Securities lending fee | cubic in utilization | — | per year | §3.13.3 |
| `term_break_penalty` | all accrued interest | 0–all | — | Early term-deposit withdrawal (§3.1.3) |
| `rw_<class>` | §3.2.1 table (0% sovereign own bloc … 1,250% crypto) | — | risk weight | RWA and CET1 ratio |
| Capital requirement | 4.5% + 2.5% + CCyB (owner 04, 0–2.5%) + SIB 0/1/1.5/2%; leverage 3% (SIB 3.5%) | — | — | Bank status (§3.2.2) |
| Liquidity | LCR ≥ 100%, NSFR ≥ 100% (report only); large exposures 25% of Tier1 | — | — | §3.2.3 |
| Reserve requirement (owner 04) | FU 1, EC 1, PL 5, NA 1, SC 10% | — | of sight + savings | §3.2.3, penalty `CBK_RESERVE_PENALTY` |
| Loan pricing | funding + EL + capital charge + opex + margin + 3%·S² | — | per year | §3.3.1 |
| Lending standards S | target 0.30 + terms; speed 0.10 per day | [0,1] | — | Credit cycle (§3.5.3) |
| Charter scope capital | COMMUNITY $20M, COMMERCIAL $250M, UNIVERSAL $2.5B; proposed fees $1M/$10M/$50M (owner 13) | — | FDL eq. | §3.11.1 |
| ClearingDebt | ONR + 2%, repayment 30% of daily net income | — | — | §3.16.5 |
| Retail IM | rule-based; MM = 0.5 × IM | — | — | §3.15.2 |
| PB tiers | A/B/C | — | — | §3.14 |

## 2. Decisions

- Money location follows 03: settlement cash (account 1001) is the default; deposits (1010) are optional; banks hold reserves (1002). Loans create deposits (`CREDIT_CREATE`), and repayments destroy them (§1, §3.1.1).
- 03 owns the payment rail. 07 adds bank FX margins and deposit pricing on top of it (§3.1.2).
- `DEFAULT`: there are no negative retail rates. Negative CB rates pass through only to corporate deposits above $10M (§3.1.3).
- V3 question 2 is resolved: a player bank can fail permanently. Equity is lost, the charter is revoked, a 1-chapter ban follows, and the owner has limited liability (§3.10.5).
- V3 question 1 was already resolved by 14 (CH_BANK at R4). 07 adds the scope levels COMMUNITY, COMMERCIAL and UNIVERSAL (UNIVERSAL needs rank ≥ R5). 13 owns approval and fees, and the fees are proposed as DEFAULT (§3.11.1).
- Resolution tools are P&A, bail-in or liquidation, chosen by least cost. 13 picks by rule and 07 executes (§3.10.3).
- `DEFAULT`: no taxpayer loss absorption for TCH. 04 may lend liquidity, never capital (§3.17.8).
- Runs are caused, not rolled. Confidence C has asymmetric updates; the withdrawal hazard is x² below C_crit; the DGF covers $250k per beneficial owner per bank (§3.8, §3.9).
- The credit bureau score excludes Reputation, so lenders see credit facts only (§3.4.2).
- Lending standards S drive a causal credit cycle that feeds 04 (§3.5.3, §3.22).
- The interbank market matches hourly with PD tolerance and counterparty limits. ONR is fixed daily (§3.7).
- Hourly GC repo is a uniform-price auction. Specials are driven by securities-lending utilization. Collateral moves by title transfer with a re-use invariant (§3.12).
- Haircuts come from a single table shared by margin, repo and CB eligibility, with stress multipliers (§3.15.6).
- Margin: retail uses rule-based IM. Listed products use SCAN. OTC, CDS and PB use filtered-historical VaR/ES with anti-procyclicality weight 0.25 (`DEFAULT`) (§3.15).
- The liquidation engine respects a fair-value band and a 20% participation cap. 01's "liquidation penalty sink" becomes a transfer to insurance funds, with the excess swept to SINK (§3.16.4–5).
- ClearingDebt survives bankruptcy, per ROADMAP 2.6 (§3.16.5).
- TCH runs the LD, OTC, CDS, REPO and CRY services plus ESC escrow. It has a Cover-2 DF, SITG layers and a juniorized waterfall, with ADL only in CRY. Sponsored CCPs open at R6 (§3.17, §3.20).
- `DEFAULT`: fixed-rate loan prepayment pays a break cost equal to the PV difference to current OIS (§3.3.2).
- Individual shorts ≥ 1% of float are disclosed by legal filing, which is the L11 exception. Aggregates are public. The "top 200 holdings" report is left to 15 (§3.13.5).
- Reserve requirements, the deposit facility (`bank.cb.deposit`) and ELA (`bank.cb.elaRequest`) belong to 04. 07 adds a `solvencyTest` for ELA. `bank.cb.facility` is MLF only (§3.7.5).
- Reason codes follow 03's catalog. Requested additions: `CCP_LIQUIDATION_PENALTY`, `CCP_INS_FUND_SWEEP`, `BNK_FX_MARGIN`, `BNK_ENFORCEMENT_FEE`, `CLR_DEBT_REPAY` (§5).
- 04's shock hooks (`corporatePdMultiplier`, `depositConfidenceShock`, `repoHaircutShock`) are implemented with stacked PD shocks capped at 5×. Outputs go to 04 at day close, including `creditConditions = 1 − 2·S̄` (§3.22).

## 3. Interfaces assumed

- **00**: time model, P0–P14 pipeline (07 owns P7 clear and P8 finance), L1–L15.
- **02**: clock, RNG, intents in P1.
- **03**: accounts 1001/1002/1010, the payment rail, Postings in P13, the reason-code catalog, consolidation, SINK, restricted cash.
- **04**: policy rates and corridor, MLF and ELA, the deposit facility, `rr` per bloc, CCyB, the Fear Index F, bloc wage and GDP data. It calls the shock hooks and reads the §3.22 outputs.
- **05**: tick volume and ADV for liquidation slicing.
- **06**: instrument marks, `marginClass`, `collateralClass`, clearing service tags, corporate PD (§3.8), bonds, CDS credit events.
- **08**: ratings, securitization tranches, player funds as PB clients, insurance.
- **09**: company balance sheets, borrowing demand, debt-for-equity, bankruptcy filings.
- **10**: mortgages and house prices.
- **13**: regulator: charter approval and fees, stress tests, resolution choice, fit-and-proper, enforcement.
- **14**: rank gates (R4 CH_BANK, R5 UNIVERSAL, R6 sponsored CCPs), LIC levels.
- **15**: legal filings, P2P blocks for ClearingDebt.
- **16**: NPC depositors and agents, N_a scale.
- **17**: screens.
- **20/21**: harness bands; live-ops parameter changes.
- **22**: names and scenarios. **23**: the parameter registry.

## 4. Content needed for 22

- 26 NPC banks: per bloc 1 SIB, 2 commercial and 2 regional, plus 1 Isla Serena private bank. Each needs a name, home city, strategy archetype and starting balance-sheet size.
- Which 3 SIBs (FDL, EUN, PYN) are prime brokers, with their names.
- The 14 TCH members:
  - the 2 largest banks of each bloc
  - 2 NPC dealer firms
  - the crypto-native member owned by Vault Exchange
  - the Isla Serena private bank
- The NPC broker members (subsidiaries of the NPC banks) that handle client clearing.
- The Clearing House (TCH) branding and service names; the DGF name per bloc.
- Authored stress scenarios:
  - The regulator's adverse scenario (rates +3%, house prices −25%, unemployment +4 pp, equities and others as in §3.11.4).
  - The TCH default-fund scenarios (§3.17.5).
  - Run and repo-run test scenarios.
- Credit bureau naming. Loan product names (Lombard, mortgage, SME, LBO, personal line).
