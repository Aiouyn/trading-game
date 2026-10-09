# Company building

**Owner:** Quant (company economics, fundamentals into the market). **Screens:** Forge (Company app), Velvet (dashboards). **Hunts:** Tape. **Status:** SPEC v1.5, 2026-10-09, **FROZEN for Tape's run** (v1.5 = Ledger's decisions on v1.4 plus his rulings on Tape's v1.4 gaps G10–G14; see the v1.5 changelog just below, then the v1.4 one). v1.4 is kept at `quant-company-building.v1.4.md`, v1.3 at `quant-company-building.v1.3.md`. Ledger decided all 12 open questions (§12), replaced the blackout with an open trading window plus scheduled plans (§6.1), and answered Tape's Q2/Q5/Q7/Q12 (§12.1). Tape's questions are answered in §13; the body reflects all of these. No engine code exists yet. Numbers not covered by a decision are still **proposals** for Ledger and Tape to band.
**Path:** `/workspace/trading-game/specs/quant-company-building.md`. `/workspace/tg` has no `specs/` folder (only `docs/`), so this is the only copy.
**Read with:** ROADMAP "Mathis directive (2026-10-09)" and §2.1 (IPOs), `research-stonks9800.md`, `tape-stonks-exploits.md` (X1–X15), `quant-t1-business.md` (on hold, C4), `quant-market-ecology.md` (pools, `lnV`), 01 §3.1 / §4.1–4.6 / §8.4, 04 §3.2 (rank pace).

**Frozen (Ledger, v1.5).** After v1.5 this spec is frozen until Tape's run, unless the run fails. The only pre-agreed change is the `signal_fake_ev` contingency (backlog weight 0.5 → 0.25, rerun, report to Ledger; §6.2).

**v1.5 changelog (2026-10-09, Ledger's decisions 1–3 on v1.4 and his rulings on Tape's G10–G14).** Each line: what changed, the decision or Tape gap, the Tape check ids, where. Numbers are from `scripts/company/signal_cap_breakeven.py` (v1.5 output in `signal_cap_breakeven.v15.out.txt`; `--v14` reprints the v1.4 log byte for byte).
- **Faking comparator and contingency** (decision 1; **G14**; `signal_fake_ev`): the comparator is an **honest founder selling the same schedule** (impact, spread and the unsold stake cancel), 200 seeds, **after the cost of producing the fake**. If it fails: cut `backlogWeight` 0.5 → **0.25** (named contingency `backlogWeightFallback`, not the default), rerun, report to Ledger before adding anything new. Headcount stays **cost-only** (no signal weight). Script §L: 0.605% of shares outstanding under v1.4's ramp (Tape's ≈ 0.57%), 0.756% at an uncapped 2.5% lift (§6.2, §11 knobs).
- **Backlog smoothing α = 1** (decision 2b; **G13** lag leg; `cap_carry_edge`, `reanchor_public_edge`, `consensus_alpha1`): consensus backlog = the latest bias-corrected report; consensus moves fully at each signal and filing (§6.2, knobs).
- **Cap scope: unbacked parts only** (**G13**; `signal_cap_scope`, `forward_cap_honest_bind`): the 1.5% weekly cap and the 2.5% quarterly rule apply only to **unbacked** signal parts (hiring/headcount, utilization). **Backed backlog** (real NPC orders in the weekly band, checked against the next filing's `backlog` field) passes uncapped, like shipped revenue (§6.2).
- **Quarterly carry released at the next weekly signal** (decision 2a; `cap_carry_edge`, `signal_cap_scope`): ceiling at signal k = max(2.5%, U_{k−1}); new unbacked news beyond ±2.5% waits one signal, then releases at ≤ 1.5% per signal. The 2.5% no longer bounds the cumulative in-quarter move; it's a one-signal hold (§6.2).
- **Joint check** (decision 2; `signal_joint_v15`): `cap_carry_edge` (weekly-carry, lag-aware and hold-to-close bots), `reanchor_public_edge` and the filing surprise (ρ ≤ 0.15 median, ≤ 0.25 p90) run **together** in one 200-seed run (§6.2).
- **Leak numbers at $5B** (G13; script §K): lag-aware next-signal bot, J = 3.3% / 5%: v1.4 0.975% / 1.000% gross → v1.5 **0**. Hold-to-close bot: v1.4 0.799% / 2.499% → v1.5 **0**. Round trips $10k 0.703–0.812%, $250k 0.794–1.127%, $1M 0.909–1.522%. Both leaks close because a launch's backed backlog lands in full at the launch signal.
- **Decided, no longer judgment calls** (decision 3): all-or-none tender of locked shares; plan sells first inside the 2%/gd cap; cash in lieu for reverse-split fractions; a plan stays in force after its founder leaves the covered set; a plan's size is estimable from public trades, never known exactly (§6.1).
- **Minimum sell price cap** (**G12**; `plan_floor_cap`, `plan_price_skip_hold`, `plan_min_price_option`): `minSellPrice` ≤ **0.80 × the commit-day close**, else `{ code: 'planFloorTooHigh', maxFloor }` at commit. Shares left unsold by `price` skips stay **locked until the plan's end day + 63**, then released (§6.1, §11).
- **Legal end keeps the schedule** (**G10**; `plan_legal_schedule`, `claim_covered_creditor`, `plan_legal_escape`): seized locked shares are **not freed**; a clearing account sells them on the plan's remaining days, `qtyPerDay`, caps and floor, and the proceeds go to the creditor. A creditor in the founder's covered set can't garnish or seize locked shares: `{ code: 'claimCoveredCreditor' }` (§5.3, §6.1, §11).
- **Breach is a fail-safe** (**G11**; `breach_bars_plans`): the breach filing and `planBanned` stay in the engine with **no v1 path** to them; Tape's check is a unit test with an injected breach (§6.1).
- **Quant findings for Ledger (not rulings; the spec stays frozen):**
  1. **With backlog uncapped, no cap bounds an upward fake any more.** Headcount is cost-only, so the only capped parts can't lift `lnV`. Against the same-schedule twin a backlog fake gains L × (30–40%) of shares outstanding: 0.756% at L = 2.5%, 2.00% at 5%, 4.00% at 10%. That's linear in L with no ceiling, so `signal_fake_ev` rests entirely on the cost of producing the fake. Break-even: $0.38–$2.67 of production cost per $1 of fake backlog (EV/S 1–4, 23–40% sold; script §L). The 0.25 contingency halves those thresholds.
  2. The literal reading (cap all backlog not yet in a quarterly filing, plus α = 1 and next-signal release) would leave both leaks open (script §F–§H): carry after a launch is 1.80% / 3.50% (J = 3.3% / 5%), FAIL in every $5B bucket up to $1M. It would also lift the fake ceiling from 2.5% to 6.0–7.5% inside the window, so v1.3's model turns positive (+0.077% to +0.242% of shares outstanding). That's why §6.2 uses the backed-backlog reading.

**v1.4 changelog (2026-10-09, Ledger's rulings 1–8 on Tape's G1–G9).** Each line: what changed, Ledger's rule number, Tape's gap, where.
- **Sell-only plans** (rule 1; closes **G1-cash**, **G2-buy**, **G4**): `TradingPlan.side` is `'sell'` only; any other side is refused with the new code `{ code: 'planSellOnly' }`. Founders buy their own stock only inside the open window. Cash escrow, its 1.25× headroom knob and the buy-buffer `price` skip are deleted; escrow is **locked shares only**. `planUnfunded { shortfall }` now means not enough unencumbered shares at commit (shortfall in shares). Spendable cash is never touched by a plan. `planSkipped` reason `margin` is **dropped**: locked shares carry no collateral value and no margin call or liquidation can sell them, so no path reaches it (§6.1, §11).
- **Disclosure** (rule 2; closes **G3**'s disclosure conflict, matches **G7**): public = a plan exists + its start and end days. Every founder trade in their own stock (and derivatives on it), plan fill or in-window, is filed publicly **the next day** with side, size and day. The 1 gd pre-announcement of founder sales is **removed** (§5.1, §6.1). Plan total size, per-day size, day list and remaining quantity are never public (§11 `CompanyPublic`, `CompanyFounderView`).
- **Skip and end reasons** (rule 3; closes **G1-legal**, **G2**, **G3** cap leg, **G6**): `PlanSkipReason = 'volume' | 'price' | 'cap' | 'halt'`, never breaches. `PlanEndReason = 'completed' | 'terminated' | 'legal' | 'tender'`, never breaches. `terminated` = delisting, take-private or company default (releases the locked shares); `legal` = court order, clawback, garnishment or personal bankruptcy reaching locked shares (creditors outrank the plan); `tender` (rule 4). A tier drop mid-plan doesn't change the plan; later window rules follow the current tier (§6.1, §11).
- **Corporate actions** (rule 4; closes **G5**): locked shares, per-day quantity and remaining quantity scale with splits and reverse splits; dividends on locked shares are paid to the founder as normal cash; a tender of locked shares ends the plan with `tender` (§6.1).
- **Safe harbour boundary** (rule 5; closes **G8**): a contract qualifies only if signed **64 or more days before default** (day ≤ D − 64) (§5.3).
- **Insider timing** (rule 6; closes **G9**): a person is an insider for the clawback if they were one **at signing or at payment** (§5.3).
- **Weekly forward cap 1.0% → 1.5%** (rule 7; `cap_carry_edge`): knob and text updated; the faking break-even is rerun with `scripts/company/signal_cap_breakeven.py` (output logged next to it) and still loses at the 2.5% quarterly cap under v1.3's model; carry vs a small account's round trip at a $5B listing, with two findings for Ledger. *Superseded in v1.5: see the v1.5 changelog and §6.2 (G13, G14).*
- **Ban length** (rule 8): the `planBanned` length varying 126–188 gd with the breach day is **accepted** (low severity). In v1.4 no reachable event is a breach, so the ban is a fail-safe only (§6.1).
- **Judgment calls → decided** (flagged in v1.4, all approved by Ledger in v1.5, decision 3): the `price` skip uses a minimum sell price set at commit; all-or-none tender of a plan's locked shares; the plan's open-tick priority inside the 2%/gd cap; reverse-split fractions paid as cash; plans of a founder who leaves the covered set keep running; next-day filings let the public estimate (not know) a plan's size. The break-even accounting note is superseded by the same-schedule comparator (G14).

**The design in one paragraph.** The player founds a company in one sector and one city. They hire, run R&D, set prices, spend on marketing and build capacity. Their products win a logit share of **NPC sector demand**, and that demand follows the engine's own sector factors and regimes. A daily ledger rolls up into quarterly filings. Once the company is listed, its stock's value `lnV` moves **only** on public information: weekly operating signals and quarterly filings. The existing value pool trades the gap, exactly as it does for every other asset. Nothing the founder keeps private ever reaches `lnV`. Founding pays roughly in line with the rank income path (0.9–1.2× at R2–R4), so it is attractive but not dominant. T1 businesses become "stage 0" of this same model, which settles C4.

Units: **gd** = game day = 1 real hour. A quarter is **63 gd** (the engine's `earningsEveryDays`), a game year is 252 gd and a game week is 5 gd. $ are in-game dollars.

---

## 1. Operating economics

**Ledger cadence.**
- **Daily close (each gd):** sales, cash, inventory and accruals post to an event-sourced ledger. Every entry has a reason code and a counterparty, and Σ tagged flows = Δcash to the cent (M13).
- **Weekly signal (every 5 gd), listed companies only:** see §6.2.
- **Quarter close (gd 63k, at the day's close tick):** the quarter's numbers are computed, **frozen and hashed** (§6.1).
- **Filing day (close + 3 gd):** the frozen numbers are published.
- **Annual:** dividends policy, board mandate (later) and private-company annual accounts.

**Income statement (per gd, summed per quarter).**
```
Revenue      = Σ_products units_sold · price                (NPC customers only, §6.3)
COGS         = Σ units_sold · unit_cost,  unit_cost = mat_cost · input_index(t) · (1 − eff) + overtime
Gross profit = Revenue − COGS
Opex         = wages(R&D, Sales, G&A; Ops wages sit in COGS) + marketing + R&D materials + rent/plant + G&A other
EBITDA       = Gross profit − Opex
EBIT         = EBITDA − D&A          (plant straight-line over 504 gd)
EBT          = EBIT − interest
Tax          = 20% · max(0, EBT − loss carryforward)
Net income   = EBT − Tax
```
`input_index(t)` is a sector commodity proxy that comes from the engine. Industrial and materials sectors use `exp(lnP_OIL − lnP_OIL,0)`^0.5, food uses 1 + 0.3·(OIL move), and software uses 1. So commodity hedging matters where it should (01 §4.1).

**Working capital.** Receivables are 10 days of sales outstanding (DSO 10 gd), inventory 15 gd of COGS (DIO 15) and payables 12 gd of COGS (DPO 12). Cash flow statement: OCF = NI + D&A − ΔWC; FCF = OCF − capex. Revenue that never turns into cash shows up as rising receivables, and §6.4 catches it.

**Debt.**
- Instruments:
  - **Revolver** (Growth tier and up): limit 30 gd of revenue.
  - **Term loan** (Late tier and up): ≤ 3.0× annualized EBITDA, maturity 504 gd, amortizing 25% per game year.
  - **Personal guarantees (decided, §12 #8; relative discount Ledger + Velvet §15, v1.3):** optional. The guaranteed rate is **r_guaranteed = 0.75 · r_debt/gd**, 25% off the daily rate, which replaces the absolute −0.03%/gd. On default the guarantee is called and becomes personal debt. **UI note for Forge and Velvet:** the loan screen must show the personal-debt consequence ("if the company defaults, you personally owe up to $X") before the player signs, as a separate confirm step.
- **Rate on the game clock** (proposal: debt has to cost something on the same accelerated clock that yields run on): `r_debt/gd = 0.5 · y_ref(tier) + spread(rating)`. The spread runs from 0.02%/gd (A) to 0.15%/gd (CCC). Ratings are set by an NPC agency from leverage and interest cover. At a 4%-per-game-year bank rate, leverage would be a free money printer.
- **Covenants (term loan):** net debt / annualized EBITDA ≤ **3.5**, and EBITDA / interest ≥ **2.0**, both tested at each quarter close. A breach opens a **21 gd cure** window. While the breach is open, dividends and buybacks are blocked and the rate gets +0.05%/gd.
- **Default:** an uncured breach, a missed interest or amortization payment, or cash < 0 for 5 consecutive gd after all facilities are drawn. Default starts §5's bankruptcy rules.

**Reference Seed company** (proposal, base case at fair share; Tape bands the outcome):

| Line | Value |
|---|---|
| Setup | $150k capital, 1 product, 1 city, 10 heads (5 Ops, 2 Sales, 2 R&D, 1 G&A), ref price $50 |
| Revenue | 260 units/gd × $50 = $13.0k/gd |
| Gross profit | $6.5k (GM 50%) |
| EBITDA | ≈ $3.4k/gd |
| FCF | ≈ $2.6k/gd → **y ≈ 1.7%/gd** of capital |

---

## 2. Product competition inside a sector

**Markets.** A market is one (city, sector). At launch, players can found in 6 sectors that map onto the engine's stock sectors:

| Sector (engine id) | Archetype | Gross margin | Notes |
|---|---|---|---|
| software (`tech`) | high margin | 80% | network term (below) |
| pharma (`health`) | pipeline | 70% | trial gates, patents |
| food (`staples`) | volume | 35% | low cyclicality |
| consumer goods (`discretionary`) | brand | 45% | high cyclicality |
| industrial (`industrials`) | capex-heavy | 25% | OIL input index |
| security services (`security`) | headcount-driven | 40% | capacity = staff |

**Total demand** (units/gd) in market m of sector s:
```
D_m(t) = D0_m · exp(κ_D · (F_s(t) − F_s(0))) · R(regime_t)^cycleBeta_s
```
- `F_s` is the engine's sector factor level: the cumulative sector shock already driving that sector's stocks (`sectorRng`). So company sales and the sector's listed stocks move together for the same reason. κ_D = 0.5.
- Regime multipliers R: expansion 1.00, overheating 1.04, recovery 0.97, contraction 0.90. `cycleBeta_s` is the sector's engine value (staples 0.3, discretionary 1.5).
- `D0_m` is the calibration knob. It is sized so that the reference company in §7 earns `y_tier`.

**Share: logit with an outside option** (01 §4.1 plus a no-purchase choice, so total demand has a price elasticity):
```
u_j = a·ln(q_j / Q_f(t)) + b·ln(1 + M_j / M_ref) − c·ln(p_j / p_ref) + d·ln(dist_j) + brand_j (+ ν·ln(1 + users_j/U_ref) for software)
s_j = exp(u_j) / (exp(u_0) + Σ_k exp(u_k)),   units_j = min(D_m · s_j, capacity_j · 1.15)
```
- Defaults: a = 1.0, b = 0.35, c = 2.0, d = 0.5, u_0 = 0, ν = 0.2.
- `M` is marketing $/gd and `dist` is the distribution level (1–5, bought with Expansion).
- Own-price elasticity is `−c·(1 − s_j)`: about −1.5 at a 25% share. A player can solve for the best price (the AI hook in 01).
- Price is bounded at ±30% of `p_ref` (01 §4.1).

**NPC competitors.** Each market has 3–5 NPCs, with seeded quality, price and marketing (stream `co:npc:<market>`).
- **Reaction (once per week):** if a player's share is above 25%, the NPCs cut price by up to 8% and raise marketing by 20%.
- **Exit and entry:** NPCs exit after 2 quarters of negative margin. Entry probability per quarter is 0.25 · max(0, sector margin − 10%)/10%, capped at 0.6, so a fat-margin monopoly invites entrants.
- **Antitrust:** share above 60% for 2 quarters triggers a review event that forces a divestiture or a fine (01 §9).
- **Players against players:** online, other players' companies in the same market split the same D_m. In solo, it's NPCs only.

---

## 3. R&D into product quality

- **Projects:** Quality (raises q of one product), Cost (−unit cost), Next-gen (a new product generation; resets the diminishing-returns count k).
- **Duration:** `T = T0_s / min(1, n_RD / n_req)`.
  - T0_s: software 15 gd, food 10, consumer 15, security 10, industrial 25.
  - Pharma: 3 gates of 20 gd each.
  - n_req = 2 R&D heads per project. Spend S is drawn evenly over T.
- **Success:** `p = p_s · (1 − e^(−S/S_ref))`, with S_ref = 20 gd of the product's revenue (minimum $20k).
  - p_s: software 0.80, food 0.85, consumer 0.75, security 0.80, industrial 0.70.
  - Pharma: gate odds 0.65 / 0.55 / 0.80, so p ≈ 0.29 overall, offset by patents and 70% GM.
- **Gain on success:** `Δln q = 0.20 · (1 − e^(−S/S_ref)) · 0.8^k · (1 + 0.25·z)`, with z ~ U(−1, 1) and k = prior quality successes on this generation. Diminishing returns push the player toward Next-gen.
- **Shown before launch (X15):** p as a ±5-point band, and Δq as bear/base/bull (z = −1/0/+1). The realized result lands inside the band by construction, and the trade journal explains it (private).
- **Quality display scale (Ledger + Velvet §15, v1.3):** `qualityScore = clamp(round(80 + 30 · ln(q / Q_f(t))), 0, 100)`.
  - The frontier reads 80, and half the frontier reads 59 (80 − 30·ln 2 = 59.2).
  - One maximal R&D success (Δln q ≤ 0.25) adds at most 7.5 points. A product left standing loses 30·δ_s per gd (software 0.03 points per gd).
  - It's **display only**: the share model (§2) uses q. Shown in the founder view for own products, and in `CompanyPublic` only if another player's product quality is public (v1: it isn't; rivals see product names and prices only).
- **Lag:** quality changes the share model on the day the project completes. There's no instant effect from spend.
- **Obsolescence:** the frontier `Q_f(t)` rises at δ_s per gd: software 0.10%, consumer 0.05%, security 0.05%, industrial 0.03%, food 0.02%, pharma 0.02% (plus the patent cliff). A product that stands still loses share.
- **Imitation and patents:** NPC quality closes half of its gap to the market leader every 126 gd. A successful pharma or industrial project grants a **252 gd patent** that pauses imitation of that gain. The other sectors have no patents (trade secrets only).
- **Draws:** project outcomes come from stream `co:<companyId>:rd`, drawn at project **start**. In solo, save-scumming is possible, which is Risk R1: solo stays unranked. Online uses server entropy.

---

## 4. Hiring and capacity

| Role | Wage $/gd (Seed city, inflation-linked) | Ramp to full output | Drives |
|---|---|---|---|
| Ops | 120 | 5 gd | capacity: 60 units/gd/head × plant level multiplier (1.0, 1.25, 1.5…) |
| Sales & Marketing | 150 | 10 gd | +0.1·ln(1+heads) on `dist`, and runs the marketing spend |
| R&D | 200 | 21 gd | project speed (n_RD) |
| G&A (HQ, HR, Finance) | 140 | 5 gd | span of control: each G&A head supports 12 others; beyond that, every role's output ×(1 − 0.03 per missing G&A head) |

- **Hiring:** takes 3 gd to fill a seat. Severance is 21 gd of wages. Headcount caps by tier: Seed 25, Growth 250, Late 2,500, Listed unbounded.
- **Capacity:** `cap = Σ_ops heads · 60 · plant`. Utilization `U = units_sold / cap`.
- **Idle capacity:** wages and plant D&A are paid regardless. At U = 50%, the reference company's EBITDA is about 40% of base. That is the cost of overbuilding.
- **Overload:** demand above cap is served up to 115% of cap at 1.5× Ops wage per extra unit. Beyond that, sales are lost and brand_j −0.02 per stockout day (it decays back at 0.01/gd). Being under capacity costs both share and margin.
- **Plant:** levels cost `C0 · 0.10 · 1.18^n` (01 §4.2), take 10 gd to build and depreciate over 504 gd.

---

## 5. Tiers, IPO, ownership, bankruptcy

| Tier | Entry (filed numbers only) | Unlocks |
|---|---|---|
| Seed | founded at **R2 Owner**, ≥ $100k founder equity | 1 city, ≤ 2 products, ≤ 25 heads, NPC seed round |
| Growth | last 2 quarters revenue ≥ $1M and positive OCF last quarter | 3 cities in 1 region, revolver, Series round |
| Late | last 4 quarters revenue ≥ $15M, 2 profitable quarters | region-wide expansion, a 2nd sector, term loan |
| IPO-eligible | engine equity value ≥ $50M, ≥ 3 filed quarters, owner at R3+, no S4+ conviction in 8 weeks, covenants clean | listing |
| Listed | — | buybacks, secondary offerings (7 gd notice), takeovers (later) |

**Private rounds.** NPC investors only. They buy new shares at `0.70 × V_engine` (private discount). A round is at most 25% of post-money. The cap table before and after is shown to the cent (X12). There's no gifted cash, and a player's own accounts can't be the investor (§9 N9).

**Valuation function** (one function used everywhere: private marks, IPO price and `lnV`, §6.4):
```
V_engine = PE_s(macro) · E*_ann · (1 + γ·g) · (0.85 + 0.15·C) − net_debt      if E* > 0
         = 0.5 · EVS_s · Rev_u,ann · (1 + γ·g) − net_debt                       otherwise
floor:     max(V_engine, 0)
```
**Backlog term (Q20, v1.3):** wherever `V_engine` reads `Rev_u,ann` and `E*_ann`, it uses `Rev_u,ann + w_b·ΔB` and `E*_ann + m·w_b·ΔB`, where ΔB = filed backlog − the previous filed backlog ($ of NPC orders not yet shipped), w_b = 0.5, and m = TTM gross margin (§6.2). The NPC consensus uses the **same function** on its estimates, so filing and consensus never differ by construction, only by estimation error.

`PE_s(macro)` is 01 §3.1's sector P/E with its rate and risk-appetite terms, `EVS_s` the sector EV/sales, γ = 0.5, g = TTM growth of `Rev_u` clipped to [−50%, +100%] per game year, and C = guidance credibility (§6.4).

### 5.1 IPO

- **Price** (set by the engine, no book-building on price):
  - `P_IPO = (1 − d) · V_engine / shares_post`, with discount **d = 0.10**.
  - The sector multiple is the one inside `V_engine`. The price is set from the **latest filing before `requestIPO`** (Ledger 2026-10-09, Q16; eligibility must still hold at that filing), not the filing that first made the company eligible, and shown 1 gd ahead.
  - This replaces ROADMAP §2.1's 0.9–1.1× range plus auction (decided, §12 #3; see Changelog). The 1 gd book only **allocates**: pro-rata, ≤ 5% of float per buyer, accounts < 7 days old excluded, and accounts linked to the founder in the collusion graph excluded.
- **Float:** the player chooses 15%–49% (ROADMAP §2.1). It's primary shares only: cash goes to the company treasury, and the founder doesn't cash out at IPO (decided, §12 #9). The founder realises wealth only after the lockup, through normal sells that go through the shared impact tally and the 3× ADV per-tick cap like any order. The 5% underwriting fee is a sink.
- **Founder shares** are not float. The founder **can't subscribe** to the IPO from any account in their owner set.
- **Lockup:** founder shares are locked for **168 gd**. `placeOrder` refuses a sale with `{ code: 'lockup', untilDay }`. After that, sales are capped at ≤ 2% of shares outstanding per gd (window sells and plan fills combined) and each sale is **filed publicly the next day** with side, size and day (§6.1). There is **no pre-announcement** (Ledger v1.4, rule 2; this replaces ROADMAP §2.1's 1 gd notice, which Ledger edits). NPC seed and series holders follow the same lockup, then sell on a published schedule (≤ 1% per gd).
- **Listing as an asset:** at the listing tick, the engine appends an `AssetDef` and an `AssetState`.
  - **Price and value:** `lnP0 = ln P_IPO`, `lnV0 = ln(V_engine / shares_post)`. The 10% discount is a real gap, so the value pool closes most of it on day one; that's the IPO pop. It's a transfer from founder dilution to allocatees.
  - **Vol:** the sector peer's vol × (1 + 0.5 · max(0, 1 − floatCap / $500M)).
  - **Factor exposure:** the sector's market and sector weights. Idiosyncratic diffusion of `lnV` is set to 0.3× normal and Kou jumps are off, because company news arrives as signals and filings instead.
  - **ADV:** `advNotional = 0.8%` of float market cap per gd at listing, decaying to 0.4% (half-life 21 gd).
  - **Spread:** `spreadBps = clamp(25 + 2000/√(floatCap/$1M), 25, 200)`.
  - **Mechanics:** shorting opens 3 gd after listing. Halts, impact and the 3× ADV per-tick cap apply as for any asset.
- **Ownership into the portfolio:** at listing, the founder's private equity becomes `accounts[founder].positions[assetId] = { qty: founderShares, avgCost: book equity / share, lockedUntilDay }`. While private, the company counts toward net worth at 0.85 × `V_engine` × ownership (01 §4.6).
- **Rank and leaderboard mark** of a listed stake: `min(fair, 3-day VWAP) × (1 − exit cost)`. `fair = exp(lnV)`. Exit cost is the square-root impact of selling the whole stake at the 2%-per-gd cap, measured against the whole crowd (§9 N4).

### 5.2 Buybacks (Ledger Q5, 2026-10-09)
- A buyback is an **announced program**, not a plan. **Filing day (Ledger, v1.3, Q24): only on F + 1**, the day before the window opens. It carries a **fixed total size and a fixed daily schedule** (shares per day) on days inside that quarter's window, and it's **immutable after filing** (`{ code: 'buybackImmutable' }`). Execution is ≤ 1% of float per gd (ROADMAP §2.1). Tape's treasury leg of `window_two_way_edge` stays as the proof.
- It executes **only inside the open trading window** (§6.1), from F + 2 to F + 21. A program whose days fall outside the window is refused at filing (`{ code: 'closedWindow', untilDay }`), and nothing carries over when the window shuts.
- It is paid from **company cash only**. No buyback is allowed while a covenant is in breach, or if net debt / EBITDA after the buyback would exceed 2.5.
- The company treasury is an account: its orders go through `placeOrder`, the **shared impact tally** and the **3× ADV per-tick cap** like any order. Buybacks never cross with the founder or any account in the owner set (§9 N3).
- `TradingPlan`s (§6.1) can't be used for buybacks (plans are sell-only and belong to covered accounts, not the treasury).

### 5.3 Bankruptcy and limited liability
- **Limited liability:** in a company default, the **company's** debts are settled only from company assets. Recovery is 20–60%, set by the NPC liquidator at book value × the sector recovery rate. Equity goes to 0, the stock delists, and holders lose their positions. The player's **personal** debts (personal loans, margin, and any personal guarantee, which is called on default) are untouched by the wipe and still owed in full.
- **Clawback: payments, not people (Ledger Q12, 2026-10-09):**
  - Lookback: every covered payment made on a day d with `defaultDay − 63 ≤ d < defaultDay` (inclusive at 63).
  - **Covered payments:** every company payment to **any player account**, linked or not. There's no attempt to spot alts; the rule follows the money. That means:
    - dividends;
    - **repayments (principal and interest) of loans a player made to the company**. The founder's and other insiders' loans are always covered (Tape gap c); outside lenders get the Q28 safe harbour below;
    - salaries paid to a player account above the cap, which is **max($50/gd, 1% of TTM revenue / 252 per gd)**. Only the excess is clawed back;
    - related-party payments (§6.3) to any player-controlled entity: player companies, T1 businesses, funds;
    - loans **from** the company to a player account (the outstanding balance).
  - **Safe harbour (Ledger, v1.3, Q28; boundary v1.4 rule 5, G8):** these payments to a player who is **not an insider** (below) aren't clawed back, provided their terms were signed **64 or more days before default**, i.e. on a day ≤ defaultDay − 64. A contract signed on defaultDay − 63 (the first lookback day) or later doesn't qualify:
    - scheduled repayments (principal and interest on the original schedule) to outside lenders;
    - ordinary contractor payments at a market price (within the §6.3 ±10% band).
  - **Early, extra or non-ordinary payments** (prepayments, accelerated schedules, terms amended inside the lookback, above-band prices) **are clawed back**.
  - **Insider loan repayments are always clawed back**, whatever their terms or dates. Insiders are the founder, their owner set, their alliance members, and any account holding ≥ 10% of shares or a CEO role. **Timing (v1.4 rule 6, G9):** a counterparty is an insider for a given payment if they were one **on the contract's signing day or on that payment's day**; either is enough. Status at default doesn't matter.
  - **UI note for Velvet and Forge:** before a player lends to, or signs a contract with, a player company, the screen shows a lending-risk warning: "If this company defaults within 63 days, payments to you can be clawed back: always for insiders; for others, any early, extra or off-schedule payment." (v1.4, Ledger) This §5.3 text is the **Details** content under Velvet's single confirm box, not a separate confirm step.
  - **Tape checks (v1.4):**
    - `clawback_safe_harbour_64`: an outside lender's scheduled repayment and an outside contractor's market-price payment, with terms signed on D − 64 → not clawed back; signed on D − 63 → clawed back (D = default day).
    - `clawback_insider_either`: a lender who was an insider at signing but not at payment → clawed back; not at signing but an insider at payment → clawed back; an insider at neither → safe harbour applies; status at default changes nothing.
  - **Locked plan shares are not a shield, and not an exit (v1.4 rule 3, G1; v1.5 G10):** clawback recovery, court fines and restitution, garnishment and personal bankruptcy reach shares locked by a `TradingPlan` exactly as if they were unlocked, for the amount owed. The seized shares are **not freed**: they're sold on the plan's remaining schedule through a clearing account and the proceeds go to the creditor (§6.1 `'legal'`). Never a breach.
  - **Covered creditors can't seize locked shares (v1.5, G10):** a claim on locked shares by a creditor in the founder's covered set (§6.1: alts in the owner set, the company treasury, alliance members) is refused with `{ code: 'claimCoveredCreditor' }`. The claim stays valid against the founder's other assets; only the locked shares are out of its reach.
  - **Not covered:** market trades (buyback fills clear against the anonymous book), payments to NPCs, and wages to NPC staff.
  - **Recovery (Ledger 2026-10-09):** each payment is clawed back from the **first recipient**, the account the company paid, up to the creditors' shortfall, newest payment first. The first recipient owes the **full** clawed-back amount even if they've already passed the money on. The engine collects what that account still holds (cash down to the bible's floor of $5k plus one T1 business) and books the rest as personal debt to the clearing house on **that account**, persisting like 01 §9's fresh-start debt. It **never chases a third player** the money went to next.
  - Each clawback is a ledger entry with a reason code and the original payment id.
- **Dividends:**
  - **Allowed only if all of these hold:** retained earnings after the dividend > 0; cash after it ≥ 21 gd of opex + COGS; no covenant breach or open cure; the dividend ≤ TTM FCF.
  - Otherwise `declareDividend` is **rejected** (code `dividend_not_permitted`). It isn't just flagged.
  - A permitted dividend drawn in the same quarter as a net debt increase raises the public distress flag (X5).
- **Player salary cap:** max($50/gd, 1% of TTM revenue / 252 per gd) for any salary paid to a player account (founder or not). A salary set above the cap is rejected; the same cap defines the clawback excess. *Decided (Q27, Ledger 2026-10-09):* the cap is recomputed once per quarter at filing on filed TTM revenue; a salary above the new cap is auto-cut from F + 1 (`salaryCut` founder event), so drift never creates clawback.
- **Floor:** the bible's floor ($5k plus one T1 business) still holds for the player personally.

---

## 6. Filings, signals and the value pool

Tape's insider rules are 6.1–6.5. Ledger's rulings of 2026-10-09 (engine-enforced open trading window with scheduled plans, two named view types, "knowing early must not pay", the exact instrument list) are folded in.

### 6.1 Insider timing: fixed at close, filed later, an open window after filing (Ledger 2026-10-09)
- **Period close:** the close tick of gd 63k. The quarter's statements are computed from the ledger at that tick, frozen, and stored with `hash = sha256(JSON(statements))`. Nothing after the close tick can change them: post-close entries post to the next quarter, and restatements don't exist in v1.
- **Filing day F:** close + **3 gd**, at the day's open tick. The frozen statements are published, and the hash must match (unit test).
- **Accounts covered:**
  - the founder's own account;
  - every account in the founder's **owner set**: alts as detected by the collusion graph online, plus the company treasury;
  - the founder's alliance members (ROADMAP §2.1 rule 2).
  - In solo, that's the player and the company treasury.
- **When the window applies (Ledger + Velvet §15, v1.3):** it starts with the company's **first quarterly filing**.
  - **Seed and Growth** founders have no window, because they make no quarterly filings.
  - **Late-tier private** founders are covered from that **first quarterly filing** on. A company newly promoted to Late has **no window until then** (Ledger, v1.3, Q25; Tape logs that gap in `window_late_gap`). With no stock yet, the covered instruments are the **sector fund and its derivatives only**. §15 #3's "any index where the company is ≥ 5%" is consistent with this but empty for an unlisted company: index weights are float-cap weights (§6.5), and an unlisted company has no float, so its weight is 0. The ≥ 5% index clause applies from listing.
  - From listing, the full §6.5 list applies.
- **Window card copy (Velvet, Ledger + Velvet §15, v1.3):** the card names who it binds. It reads **"you, your alliance and accounts you control"** whenever the player is in an alliance, and "you and accounts you control" otherwise.
- **Open trading window:** covered accounts may trade the company's stock and every §6.5 instrument **only from F + 2 to F + 21 trading days**, inclusive. **Edges (Ledger Q2):** the window opens on the **first tick of F + 2** and closes **after the last tick of F + 21**. Every game day is a trading day (the engine has no non-trading days).
  - Days are counted from the period close c (gd 63k). The window is **closed on c+1 … c+4**, **open on c+5 … c+24**, and **closed on c+25 … c+63**, which runs up to and through the next period close.
  - So the window is open **20 of every 63 gd (31.7%)** and closed 43 of 63 (68.3%). It opens only once the quarter's numbers are public and closes long before the next quarter's numbers take shape.
  - Outside the window, `placeOrder` refuses a covered order with `{ code: 'closedWindow', untilDay }`, where `untilDay` = the next F + 2. The UI shows a locked ticket. The one exception is a scheduled plan (below).
  - This replaces ROADMAP §2.1's "2 gd before earnings to 1 gd after", and the v1.1 blackout, notice and reduce-only rules (Changelog).
- **Scheduled plans (the only way to trade while the window is closed). Sell-only (Ledger v1.4, rule 1):**
  - A `TradingPlan` (§11) **sells** a fixed quantity per day of one instrument on fixed days. There are **no buy, short or cover plans**: `commitPlan` refuses any side other than `'sell'` with `{ code: 'planSellOnly' }`, on every route (UI, JSON from e2e hooks, AI agents). Founders buy their own stock **only inside the open window**.
  - A plan sells **only the shares it locked at commit** (below), so it can never open or add to a short, and a plan on a derivative or the sector ETF can only sell units already held.
  - It must be committed **at least one full quarter (63 gd) before its first day**. `commitPlan` refuses a plan whose first day is < commitDay + 63 (`{ code: 'planTooSoon', earliestDay }`).
  - A committed plan **can't be edited or cancelled**. `editPlan` and `cancelPlan` don't exist after commit, and any attempt returns `{ code: 'planImmutable' }`.
  - **Minimum sell price (v1.4, Ledger, matches Velvet's app; cap v1.5, G12):** every sell plan carries `minSellPrice`, set at commit and immutable, and it must be **≤ 0.80 × the commit-day close** (the close of the day before the commit tick if the plan is committed intraday; `planFloorMaxRatio`). A higher floor is refused at commit with `{ code: 'planFloorTooHigh', maxFloor }`. On a plan day when the market (open-tick mid) is below it, the day doesn't sell (`price` skip, below; never a breach, no carry). Shares left unsold by `price` skips **stay locked until the plan's end day + 63** (`priceSkipHoldDays`) and are released at the first tick of end day + 64, so a high floor can't turn a plan into a free option on a rally.
  - Plan orders are placed by the engine at the open tick of each plan day, **before** any other order of that account in that instrument, so the plan has priority inside the founder's 2%/gd sell cap (decided, Ledger v1.5). They go through `placeOrder`, the **shared impact tally** and the **3× ADV per-tick cap** like any order, and respect the lockup (§5.1) and the stacking rule (below).
  - **Escrow = locked shares only (Ledger v1.4, rule 1; Q21 simplified):** at commit the plan locks its full quantity, Σ qtyPerDay over its days, of the instrument. There is **no cash escrow**: a plan never touches spendable cash. Locked shares can't be sold outside the plan, lent, transferred, pledged or used as collateral, and they're shown as **reserved** in the founder's portfolio. They still count toward net worth, peak and rank at the §5.1 mark.
    - `commitPlan` refuses `{ code: 'planUnfunded', shortfall }` when the account's **unencumbered** quantity is below the plan's total, with `shortfall` in shares. Unencumbered = held − locked by the account's other live plans − pledged as collateral − lent. Shares still under the IPO lockup count as held (the lockup only bars sell **days** inside it, `planInLockup`).
    - **Sellable quantity (Ledger v1.3, kept):** inside `placeOrder` **and** the fill loop, on every route (UI, e2e hooks, AI agents, buyback programs, contract settlement), sellable = qty − locked.
  - **Skips (Ledger v1.4, rule 3): never breaches.** A plan day never fails silently. It sells what fits; the rest of that day is a `planSkipped { companyId, day, reason }` event and never carries over. `PlanSkipReason` is closed:
    - `'volume'`: the shared 3× ADV per-tick cap clipped the day;
    - `'price'`: the open-tick mid was below the plan's `minSellPrice` (0 sold that day);
    - `'cap'`: the founder's 2%-of-shares-outstanding-per-gd sell cap after the lockup (§5.1) clipped the day (closes G3's cap leg);
    - `'halt'`: the instrument was halted for the whole plan day (0 sold); a partial-day halt sells in the open part and logs `'halt'` for the rest.
    - `'margin'` is **gone** (v1.4): locked shares have no collateral value, so a margin call or forced liquidation can never sell them and no path can reach it.
  - **Ends (Ledger v1.4, rules 3–4; v1.5 G10, G12): never breaches.** A plan ends with `planEnded { companyId, day, reason }`. On an end, the locked shares not sold or taken are **released** the same tick, with two exceptions: shares unsold because of `price` skips stay locked until end day + 63 (G12, above), and seized shares under `'legal'` keep their schedule (below). `PlanEndReason` is closed:
    - `'completed'`: the last plan day has run;
    - `'terminated'`: the instrument is delisted (including the EV < $10M review), the company is taken private, or the company defaults (§5.3); the locked shares are released (after a default they're worth 0);
    - `'legal'` (rewritten v1.5, G10): a court order, clawback (§5.3), garnishment or personal bankruptcy seizes the locked shares. Creditors outrank the founder, but **seized shares are not freed**. The plan stops being the founder's: its remaining schedule (same days, `qtyPerDay`, `minSellPrice`, the shared ADV cap and the 2%/gd cap) keeps running in a **clearing account**, and the proceeds go to the creditor up to the claim, with any surplus paid to the founder as cash. Clearing-account fills are filed the next day like plan fills.
      - Seized quantity = claim ÷ the seizure-day close, rounded up, capped at the remaining locked quantity. If it covers all of it, the founder gets `planEnded { reason: 'legal' }` (public) and the clearing account runs the rest of the schedule. If it covers only part, the plan doesn't end: the clearing account's shares sell first on each remaining day, then the founder's.
      - Seized shares still unsold after the last plan day (skips) are handed to the creditor at end day + 63, the same hold as `price` skips. A claim the schedule can't pay in full stays open against the founder's other assets.
      - A creditor in the founder's covered set can't seize locked shares (`claimCoveredCreditor`, §5.3). So neither the founder nor an alt, alliance member or the treasury can use a staged debt to get shares out of the lock or off the schedule.
    - `'tender'`: the locked shares are tendered into an all-holder tender (§9.2). **Decided (Ledger v1.5):** a plan's locked shares are tendered **all or none**, so a token tender can't be used to end a plan cheaply; accepted shares go to the acquirer at the tender price, and any pro-rata remainder is released.
  - **Tier change (v1.4 rule 3, G6):** a tier drop mid-plan (e.g. a Late private company leaving Late on its filed numbers) **doesn't change the plan**: it runs to its end on the same instrument and days. Window rules after the drop follow the **current** tier (a Seed or Growth company has no window). Late private → Listed is unchanged from v1.3 (the plan keeps running; the stock joins the covered list at the listing tick). **Decided (Ledger v1.5):** a founder who leaves the covered set mid-plan (CEO change §9.1, leaving an alliance, falling below insider status) keeps the plan running to its end too, by the same rule.
  - **Corporate actions on locked shares (v1.4 rule 4, G5):**
    - **Splits and reverse splits** (none for player companies in v1, X4; the rule is written now): locked quantity, `qtyPerDay` and remaining quantity are multiplied by the split ratio, and `minSellPrice` is divided by it, at the split tick. **Decided (Ledger v1.5):** after a reverse split each day's quantity rounds down to whole shares, and the fractional locked shares are paid to the founder as cash in lieu at the split price.
    - **Cash dividends** on locked shares are paid to the founder as **normal, unrestricted cash**; nothing is escrowed.
    - **Dilution** (rounds, secondary offerings) doesn't change the locked quantity.
    - **Tender:** end reason `'tender'` (above).
  - **Breach (v1.4; G11, v1.5): a fail-safe with no v1 path.** Every skip and end reason above is a non-breach, and the founder can't edit, cancel, unlock, pledge or sell around a plan, so **no event reachable in v1 is a breach**. The breach code stays in the engine as a fail-safe for a future plan type or an engine invariant failure: a **public breach filing** on the Wire (plan exists, day, "plan breach"; no size), raised insider-investigation odds (§6.2 backstop, probabilistic, never automatic), and `{ code: 'planBanned', untilDay }` for new `commitPlan` through the end of the **second full company quarter after the breach quarter** (example: breach on D700, ban lifts after D882). The ban's length varying between 126 and 188 gd with the breach day is **accepted** (Ledger v1.4, rule 8, low severity). Tape tests it only as a unit test with an injected breach (`breach_bars_plans`).
  - **Disclosure (Ledger v1.4, rule 2; G3, G7):**
    - At commit, the public filing says only **"a trading plan exists"** with its **start day and end day** (a legal filing, allowed under no-reveal §10a). `planSkipped` and `planEnded` are public with **day and reason only**.
    - Every **fill** by the founder in their own stock or a derivative on it, plan or in-window, is in the next-day insider filing (below), like any founder trade.
    - **Never public:** the plan's instrument (beyond what the filed trades show), total size, `qtyPerDay`, day list, `minSellPrice` and remaining quantity. **There is no pre-announcement of founder sales.**
    - **Decided (Ledger v1.5):** next-day filings of plan fills let other players **estimate** a plan's size (filed daily size × days between start and end), but not know it: the day list is private, skips change the count, and filings don't say whether a trade came from a plan. Exact total and remaining quantity stay private.
  - **Plan limits (Ledger 2026-10-09, confirmed v1.3):** at most 2 live plans per covered account per company. Skipped days don't carry over. Instruments are the stock and §6.5 instruments only. A plan with sell days inside the lockup is refused at commit (`{ code: 'planInLockup' }`). **Refusal codes (v1.5, final):** `planSellOnly`, `planFloorTooHigh` with `maxFloor` (v1.5, G12), `planLimit` for a third live plan, `planInLockup`, `planTooSoon` with `earliestDay`, `planUnfunded` with `shortfall` (shares), `planBanned` with `untilDay`, and `planImmutable` (§11).
- **Stacking rule (Forge):** for each covered account and instrument, the current signed position plus **all open orders on the same side** may never flip the position's sign or exceed any limit (cash, position, lockup cap, short-interest cap). It is checked **at placement and again at fill**. A fill that would break it is cut to what fits.
- **Warning:** 5 trading days before the window shuts, at the **open tick of F + 17** (F + 17 … F + 21 are the last 5 open days; this follows from Ledger's Q2 edges), the engine emits a founder-only event `{ kind: 'windowClosing', companyId, closesDay, reopensDay }`. It never appears in `CompanyPublic`.
- **When the window closes:** at the close tick of F + 21, every open covered order that isn't from a plan is cancelled, and the founder gets a Wire line ("Trading window closed: N orders cancelled; reopens day D"). **That line goes only to the founder; nothing is public (Ledger Q7).**
- **Enforcement is in the engine:** the window check, the stacking rule and the plan path sit inside `placeOrder` and the fill loop. **Every** route into them uses the same check, including e2e hooks, AI agents, buyback programs and contract settlement, and unit tests call each entry point.
- **Insider trade filings (Ledger Q18; timing and plan fills v1.4 rule 2):** the public insider filing covers **every trade by the founder in their own stock and in derivatives on that stock** (options, futures, perps), **plan fills and in-window trades alike**, with side, size and day, filed on the Wire at the open tick of the **next day** (trade on day d → filed on d + 1). Nothing is announced before a trade. Trades in the sector ETF, index ETFs and their derivatives are covered by the window (§6.5) but **never filed**, plan or not. Trades by other covered accounts (alts, treasury outside a buyback program, alliance members) aren't filed either; the window still binds them. In the market itself every fill is anonymous volume; the filing comes the next day.
- **Tape checks:**
  - `window_two_way_edge`: an informed founder bot trades inside the window (200 seeds). Gains made and losses avoided are measured separately against the same trades placed right after filing (F + 2), and each must be ≤ the round-trip cost.
  - `stacking_rule`: 0 placements or fills that flip sign or exceed a limit (position + same-side open orders).
  - `closed_window_fills`: no covered order placed outside a plan fills while the window is closed.
  - `plan_immutable`: an edit or cancel after commit is refused, and a plan committed < 63 gd ahead is refused.
  - `closed_window_bypass`: 0 across every entry point.
- **Tape checks, plans (v1.4; replace v1.3's `escrow_spendable`, `escrow_margin_untouchable` and `plan_skip_price`):**
  - `plan_sell_only`: `commitPlan` with side `buy`, `short`, `cover` or any non-`'sell'` value (UI, JSON hook, AI agent) → `{ code: 'planSellOnly' }`, nothing locked, state unchanged; 0 plan orders on a buy side across 200 seeds.
  - `plan_no_cash_escrow`: the account's cash and spendable cash are identical to the cent before and after `commitPlan` and on every plan day; no cash is ever reserved by a plan.
  - `plan_locked_shares`: after commit, locked = Σ qtyPerDay exactly; sellable = qty − locked at placement **and** fill on every entry point; a manual sell of qty − locked + 1 is refused or cut to qty − locked.
  - `plan_unfunded_shares`: unencumbered = need − 1 → `{ code: 'planUnfunded', shortfall: 1 }`; = need → accepted. Shares locked by another plan, pledged or lent don't count; shares under lockup do.
  - `plan_margin_untouchable`: locked shares add 0 to collateral value; 0 margin-call or forced-liquidation fills on locked shares across 200 seeds; 0 `planSkipped` events with reason `margin` (the reason doesn't exist).
  - `plan_skip_reasons_closed`: every skip across 200 seeds × all fixtures has reason ∈ {`volume`, `price`, `cap`, `halt`}; 0 silent skips; 0 carry to a later day.
  - `plan_skip_cap`: post-lockup plan day with qtyPerDay above 2% of shares outstanding → sells exactly the room left under the 2% cap (plan first at the open tick), the rest `planSkipped { reason: 'cap' }`, no breach.
  - `plan_skip_halt`: a halt covering the whole plan day → 0 sold, `reason: 'halt'`, no breach; a partial-day halt sells only in the open ticks and logs `'halt'` for the rest.
  - `plan_skip_price`: open-tick mid < `minSellPrice` → 0 sold, `reason: 'price'`, no breach; mid ≥ `minSellPrice` → sells normally; a plan committed without `minSellPrice` is refused.
  - `plan_floor_cap` (v1.5, G12): `minSellPrice` = 0.80 × commit-day close → accepted; one price tick above → `{ code: 'planFloorTooHigh', maxFloor }` with maxFloor = 0.80 × that close, nothing locked, state unchanged; on every entry point.
  - `plan_price_skip_hold` (v1.5, G12): quantity unsold because of `price` skips stays locked (unsellable, unpledgeable, not lendable) through end day + 63 and is released at the first tick of end day + 64; quantity unsold because of `volume`, `cap` or `halt` is released at the end tick. Tape's `plan_min_price_option` hunt (`highFloor`, `pumpToCross`, `tankToSkip`) runs against this rule.
  - `plan_end_terminated`: delisting, take-private and the company's own default each → `planEnded { reason: 'terminated' }` on that tick, all unsold locked shares released, no breach filing, no `planBanned`.
  - `plan_legal_schedule` (v1.5, G10; replaces `plan_end_legal`): clawback, court order, garnishment and personal bankruptcy each seize locked shares → seized shares never become freely sellable by the founder or the creditor; the clearing account sells them only on the remaining plan days at ≤ `qtyPerDay` under the same caps and floor; proceeds go to the creditor up to the claim, surplus to the founder; full seizure → `planEnded { reason: 'legal' }`, partial → the plan continues with clearing shares first; leftovers go to the creditor at end day + 63; no breach. Tape's `plan_legal_escape` hunt: founder + creditor P&L ≤ keeping the plan, 200 seeds.
  - `claim_covered_creditor` (v1.5, G10): a claim on locked shares by an alt in the owner set, the company treasury or an alliance member → `{ code: 'claimCoveredCreditor' }`, 0 shares move, plan unchanged; the same claim by an outside creditor goes ahead under `plan_legal_schedule`.
  - `plan_end_tender`: tendering a plan's locked shares into an all-holder tender tenders all of them (a partial tender of locked shares is refused) → `planEnded { reason: 'tender' }`; pro-rata remainder released; no breach.
  - `plan_tier_drop`: a Late private company that drops below Late mid-plan → the plan sells the same quantities on the same days to its end; the window after the drop follows the current tier.
  - `plan_split`: a 2-for-1 split mid-plan → locked, qtyPerDay and remaining ×2 and `minSellPrice` ÷2 at the split tick; a 1-for-3 reverse split → each ÷3 rounded down, fractional locked shares paid as cash at the split price, total value conserved to the cent.
  - `plan_dividend_free_cash`: a dividend on locked shares lands in the founder's spendable cash to the cent, unlocked.
  - `plan_no_breach_path`: 0 breach filings and 0 `planBanned` across 200 seeds × all fixtures, including every skip and end fixture above. `breach_bars_plans` stays as a unit test with an injected breach (public filing + `planBanned` through the end of the second full quarter after the breach quarter; the 126–188 gd variation is accepted).
  - `plan_public_disclosure`: public sees `{ fromDay, toDay }` at commit and `planSkipped` / `planEnded` with day + reason only; total size, qtyPerDay, day list, `minSellPrice` and remaining quantity appear nowhere public (CompanyPublic, Wire, `explainMove`).
  - `insider_filing_next_day`: every founder trade in their own stock or a derivative on it, plan fill or in-window, appears in `CompanyPublic.insiderTrades` with side, qty and trade day, filed on trade day + 1, and nowhere public before; sector-ETF and index trades never appear; no pre-announcement event exists.

### 6.2 Weekly operating signals ("knowing early must not pay")
- **Content:** every 5 gd, at the day's open tick, a **listed** company publishes a public signal. Signals start at listing; private companies publish none (v1.3). It holds what an analyst could observe or a company would announce. Components come in two kinds.
  - **Backed** (real NPC sales, so revenue and cash by construction, §6.3):
    - revenue shipped quarter-to-date, banded ±5%;
    - revenue run-rate band.
  - **Forward** (not yet revenue):
    - bookings backlog: units ordered but not yet shipped, banded ±10%;
    - headcount band (1–10, 11–50, 51–200, 201–1k, 1k–5k, 5k+), plus net hires as up, flat or down;
    - capacity utilization band (< 60, 60–85, 85–100, > 100%).
  - **Plain facts:** product launches and price changes (public in a real market) and debt drawn.
- **Noise:** each reported band center = true · exp(ε), with ε ~ N(0, σ_sig), **σ_sig = 0.04** for backlog and 0.02 for shipped revenue, from stream `co:<id>:sig`.
- **How the pools drift toward the frozen numbers:**
  - After each signal, the NPC consensus updates its estimates of the quarter's `Rev_u`, `OCF` and `backlog` from public signals only. Each report is bias-corrected (center × exp(−σ_sig²/2)), so the estimate is unbiased. **Backlog smoothing α = 1 (v1.5, Ledger decision 2b):** there's no smoothing; consensus backlog = the latest bias-corrected report, so consensus moves fully at each signal and at each filing. Shipped revenue enters at full weight. Backlog enters `V` through the same backlog term `w_b·ΔB` that the filing uses (§5, w_b = 0.5; the 0.25 contingency is below). **Headcount and net hires enter only as cost** (wage run-rate), never as revenue, and carry no signal weight (v1.5, unchanged). Margin is extrapolated from the last filing, and input costs come from the public commodity index.
  - `lnV` moves by `ln(V_consensus,new / V_consensus,old)` through the engine's news path. `lnV` takes the full step and the price prints `newsPrint` 0.5 at once. The value pool closes the rest at valueClose 0.9 per day.
  - Because shipped revenue is real and published weekly, consensus converges toward the frozen numbers through the quarter. The last signal comes out at the period close, so between close and filing nothing new is published and consensus stays still.
- **Cap scope: unbacked parts only (v1.5, Tape G13, Ledger):**
  - **Uncapped (backed):**
    - shipped revenue and the run-rate;
    - **backed backlog**: real NPC orders booked, reported in the weekly backlog band, and checked against the `backlog` field of the next filing (§6.4).
    - This is how Quant reads Ledger's "filed backlog passes through uncapped", and it's Tape's G13 lever "exempt filed-verifiable backlog (real NPC orders)". The literal alternative (cap every backlog change not yet in a quarterly filing) is modeled in script §F–§H and leaves both leaks open (changelog finding 2).
  - **Capped (unbacked):**
    - headcount and net hires: cost-only, so they can only lower `V`;
    - utilization: shown, but it doesn't enter `V` (listed so a future `V` term inherits the cap).
  - **Weekly cap:** the unbacked part of each weekly signal's `lnV` move is capped at **|ΔlnV| ≤ 1.5%** (v1.4 rule 7).
  - **Quarterly rule with next-signal release (v1.5, Ledger decision 2a):** at weekly signal k, let U_k be the uncapped cumulative unbacked move since the last filing and R_{k−1} what `lnV` already carries.
    - Ceiling hi_k = max(+2.5%, U_{k−1}). Floor lo_k = min(−2.5%, U_{k−1}).
    - Target T_k = clamp(U_k, lo_k, hi_k). Release Δ_k = clamp(T_k − R_{k−1}, −1.5%, +1.5%).
    - So new unbacked news beyond ±2.5% waits **one** signal; until v1.4 it waited for the close. From the next signal it releases at ≤ 1.5% per signal until R = U.
    - **How the 2.5% interacts now:** it no longer bounds the cumulative in-quarter move. It's a one-signal hold on new news beyond ±2.5%, and the weekly cap does the pacing.
    - Example (script §F): U = 2.0% at week 1 and 4.0% from week 3 → releases 1.5%, 0.5%, then 0.5% (1.5% held by the 2.5% ceiling), then 1.5% → cumulative 4.0% at week 4.
  - **The close signal is uncapped:** the last signal, at the period close, releases any unbacked remainder. So consensus at the close is exactly the uncapped estimate, and the window is closed for the founder at that point (c + 25 … c + 63 is closed).
  - **The re-anchor at filing:** `lnV` is reset to `V_engine` from the filed numbers, **including the filed backlog** (§6.4). Forward components that never became revenue, cash or real backlog (hiring with no sales behind it, cancelled backlog) come out of `lnV` at that filing.
- **Why the re-anchor is unpredictable (Tape `reanchor_public_edge`, Q20):**
  - Consensus at the close and the filing use one function, `V_engine`, on the same fields: shipped revenue, OCF and backlog. Consensus uses unbiased estimates of each field; the filing uses the true values.
  - So the re-anchor is ΔlnV = f(true) − f(estimate). Given public information its expected value is 0, apart from a curvature term of order σ_sig² · (∂lnV/∂ln B)² ≈ 0.04² × 0.04² ≈ 3·10⁻⁶. Backed backlog is never deferred, and any unbacked excess is out by the close signal, so the bot's input carries no information about the re-anchor.
  - **α = 1 removes the lag term v1.4 still had (script §I).** Under α = 0.5, a launch k signals before the close left a predictable re-anchor of J·0.5^k: J = 3.3% gives 1.650% / 0.825% / 0.413% for k = 1 / 2 / 3, and J = 5% gives 2.500% / 1.250% / 0.625%. Under v1.5 it's **0** for every k.
  - **Result by construction:** the bot's gross edge is ≈ 0, so its mean P&L ≈ −round-trip cost, which is ≤ the round-trip cost. **Pass** (checked in `signal_joint_v15`). The filing-day ΔlnV is spanned by s, which includes a backlog term (below), so `filing_lnv_corr` ≥ 0.8 isn't threatened by a missing term.
- **How often the cap binds on honest companies (Tape `forward_cap_honest_bind`):**
  - **Backlog:** 0 by construction, because backed backlog is uncapped (v1.5).
  - **Noise under α = 1 (script §I):** the weekly forward move has sd 0.187% (v1.4: 0.076%). The 1.5% cap is 8.0 sd away, so it never binds on noise.
  - **Unbacked parts:** the cap binds only on a hiring move > 1.5% in one week, and only downward, because headcount is cost-only. Tape measures the rate.
  - **ρ with the cap − ρ without = 0 by construction**, because the close signal is uncapped. **Pass** (≤ 0.02).
- **`cap_carry_edge` under v1.5 (G13; script §K, $5B float-cap listing):**
  - Round trips: $10k 0.703–0.812%, $250k 0.794–1.127%, $1M 0.909–1.522% (section E: spread 53.28 bps, fee 0.10% per side, impact `0.8·σ_d·√(N/ADV)`, ADV 0.4–0.8% of float cap, σ 16–35%, volScale 0.9–1.0).

    | bot (gross edge) | rules | J = 3.3% | J = 5% | verdict at $10k / $250k / $1M |
    |---|---|---|---|---|
    | lag-aware, trades the next signal | v1.4 | 0.975% | 1.000% | FAIL all / FAIL some / FAIL some (both J) |
    | lag-aware, trades the next signal | **v1.5** | **0** | **0** | PASS all |
    | hold-to-close | v1.4 (enters when the 2.5% cap binds) | 0.799% | 2.499% | 3.3%: FAIL some / FAIL some / PASS; 5%: FAIL all |
    | hold-to-close | **v1.5** | **0** | **0** | PASS all |
    | weekly-carry | **v1.5** | **0** | **0** | PASS all |

  - These match Tape's v1.4 predictions (≈ 0.98% lag-aware; 2.48% hold-to-close after a 5% launch). Under v1.5 a launch's backed backlog lands in full at the launch signal, so nothing public is deferred.
  - The consensus step after a 3.3% launch is 3.3% at once (v1.4: 1.65%, then the lag). With w_b at the 0.25 contingency the same launch is J = 1.65%, and the step is again uncapped.
  - Any remaining carry comes only from unbacked hiring moves, which are cost-only and downward. Tape measures them in the same run.
- **Why faking doesn't pay, and what now carries that claim (G14; script §A–§C kept for v1.4, §H and §L new):**
  - Fakes made before a close reverse at the filing on F, which comes before the window opens at F + 2. The founder sells inside the 20-day window, capped at 2% of shares outstanding per gd (§5.1).
  - **Comparator (v1.5, G14):** the faker is compared with an **honest founder who sells the same schedule**. Impact, spread and the unsold stake then cancel, so the fake's gain = Σ_d x_d · L_d (shares sold on day d × the lift that day), **before** the cost of producing the fake.
    - **v1.4 rules, reproducing Tape (§L):** on the 1.5% ramp to 2.5%, the gain is **0.605% of shares outstanding** (sold 25.21%; Tape's estimate ≈ 0.57%). With a full 2.5% lift on all 20 days it's 0.756% (sold 30.23%). At the maximum schedule (2%/gd × 20 = 40% sold) it's 0.900% / 1.000%.
    - **v1.5 rules (§L):** backed backlog is uncapped, so a backlog fake's lift L arrives in full at the first signal and **no cap bounds L**. The gain is 0.756% at L = 2.5% (sold 30.23%), **2.00% at L = 5%** and **4.00% at L = 10%** (sold 40%). It's linear in L.
    - Hiring can't fake a lift because headcount is cost-only.
    - **Break-even production cost per $1 of fake backlog:** EV/S 1: $0.38 (23% sold) / $0.67 (40%). EV/S 2: $0.77 / $1.33. EV/S 4: $1.53 / $2.67. These are scale-free in L. The 0.25 contingency halves the lift per $ of backlog, which halves these thresholds.
    - `planTimed`: a plan's fixed days sold on a lifted price gain L × the quantity sold, with no impact difference. Same pass rule.
  - **The old closed forms, kept for reference (they use the wrong comparator):**
    - v1.3 model at L = 2.5%: bound −0.0535% (break-even 2.685%, 2.822% with fee); 1.5% ramp −0.1535% (break-even 3.650%, 4.095% with fee).
    - With the worst signal alignment (a signal on F, script §H, o = 3): −0.1135% (break-even 2.994%, 3.296% with fee).
    - Sold-shares-only accounting: +0.2393% (bound), +0.1911% (ramp), +0.2104% (worst alignment).
    - All 60 sweep listings are negative at L = 2.5% in v1.3's model. But under v1.5, L isn't capped at 2.5%, so these no longer show that faking loses.
  - **Spec rule (Ledger v1.5, decision 1):** `signal_fake_ev` = the fake-and-sell founder bot (`backlogPush`, `hireBurst`, `planTimed`) vs the honest founder selling the **same schedule**, 200 seeds, mean P&L **after the measured cost of producing the fake**. Pass: faker ≤ honest. Tape also prints the break-even production cost (% of mcap) per sweep listing.
  - **Contingency (named, not the default):** if `signal_fake_ev` fails, set `backlogWeight` 0.5 → **0.25** (`backlogWeightFallback`), rerun `signal_fake_ev` and `signal_joint_v15`, and report to Ledger **before adding anything new**. Headcount stays cost-only either way.
- **Joint check (v1.5, Ledger decision 2; Tape `signal_joint_v15`):** α = 1, the cap scope and the next-signal release move three things together, so Tape checks them **in one run**: 200 seeds × 8 quarters, `fx_launch` with J ∈ {2%, 3.3%, 5%, 8%} at random weeks, float-cap buckets $50M / $500M / $5B, sizes $10k / $250k / $1M / $25M.
  - (a) `cap_carry_edge`: the weekly-carry, lag-aware next-signal and **hold-to-close** bots (the last enters at the first signal where the uncapped estimate is above what `lnV` carries and holds through the uncapped close signal, flat before F). Mean net P&L ≤ 0 for every bot in every bucket.
  - (b) `reanchor_public_edge`: a bot trading the sign of the cumulative forward part into the filing. Mean P&L ≤ RT cost.
  - (c) filing surprise: ρ = sd(s_filing)/sd(s_quarter) ≤ **0.15** median and ≤ **0.25** at p90 across seeds (`rho_residual`).
  - All three on the **same seeds and fixtures**. PASS only if all three pass. If (a) or (b) passes only by pushing ρ over its band (or the reverse), that's a FAIL to report to Ledger.
- **Unit checks (v1.5):**
  - `consensus_alpha1`: consensus backlog after each signal = the latest bias-corrected report exactly.
  - `signal_cap_scope`: a launch's backed backlog term lands in full at its signal. A hiring move > 1.5% is clipped to 1.5%. The §F example (U 2.0% → 4.0%) gives releases 1.5 / 0.5 / 0.5 / 1.5%.
  - `close_signal_uncapped`: unchanged.
- **Residual surprise on filing day (Tape gap b; EV-scaled, works when earnings ≤ 0):**
  - `s = [(Rev_actual − Rev_cons) · m + (OCF_actual − OCF_cons) + (B_actual − B_cons) · m · w_b] / D`, with all values for the quarter. `Rev_cons`, `OCF_cons` and `B_cons` (backlog) are consensus at the period close. The backlog term is new in v1.3 (Q20). **Denominator (Ledger, v1.3, Q22):** `D = max(EV_20, 0.25 · mcap_20)`, where EV_20 and mcap_20 are the 20-gd averages of EV (market cap + net debt) and market cap ending at the period close. This handles EV ≤ 0 (net cash ≥ market cap) and damps a dividend or debt draw at the close. **m = the company's TTM gross margin**, clipped to [0.10, 0.90]: the share of a revenue surprise that turns into incremental profit.
  - `s_quarter` is the same expression with the consensus replaced by the previous quarter's filed values (the quarter's fundamental move in the same units).
  - `ρ = sd(s_filing) / sd(s_quarter)` across filings (8 per seed × 200 seeds, Q9). **Target ρ ≤ 0.15**, with a hard ceiling of 0.25 (Ledger #10).
  - **α = 1 effect (v1.5, script §I):** with no smoothing, consensus backlog at the close is the last report, so its noise rises (re-anchor sd from backlog noise 0.076% → 0.132% of `lnV`; ρ contribution at σ_Q 0.10: 0.0076 → 0.0132). If v1.4's ρ were exactly 0.15 it becomes 0.1504 (0.25 → 0.2502). The lag error goes away: a launch k signals before the close left a predictable re-anchor of J·0.5^k under v1.4 (J = 3.3%: 1.65 / 0.83 / 0.41% for k = 1/2/3), and 0 under v1.5. Tape checks ρ inside `signal_joint_v15`.
  - **The 0.25 ceiling alone doesn't pass the alt test at small spreads.** An informed alt's edge is about `0.8 · ρ · σ_Q · newsPrint`, where σ_Q = sd(s_quarter) · D / market cap (the quarter's move as a price move, about 0.10). With newsPrint 0.5, that's 1.0% at ρ = 0.25 but 0.6% at ρ = 0.15.
  - A listing with a 30–60 bps spread plus fees and impact has a round-trip cost of about 0.6–1.0%. So 0.15 passes at every spread, while 0.25 only passes for small listings, where the spread is 200 bps.
  - The noise σ_sig and the signal coverage are the levers that hold ρ down. Costs the signals can't see (input index moves, one-offs) are the main source of the residual.
- **Pass condition (Tape check `alt_prefiling_edge`):**
  - Setup: 200 seeds, a scripted competent company, and an **informed** alt that knows the frozen sign of the surprise.
  - The alt buys (or shorts) at the period close at 1% of ADV and exits at filing + 21 gd. Compare with the same alt entering at the **first tick after the filing's newsPrint** on F (Ledger 2026-10-09, Q10). Otherwise both legs would capture the immediate print.
  - Pass: mean excess P&L ≤ mean round-trip cost (spread + fees + impact at that size).
  - A second check, `rho_residual`, confirms ρ ≤ 0.15 in the median, with ≤ 0.25 at p90 across seeds.
- **Backstop:**
  - Any account (linked or not) with a profit in the stock on a position opened while the window was closed (a plan or an undetected alt), where the position exceeds 0.5% of ADV and the abnormal return is z > 2, adds to the existing surveillance score.
  - The score raises the **odds** of an insider-trading investigation through Tape's regulator and court (03). The odds rise roughly linearly with z, capped at 60% per case. The outcome is never automatic or certain, and verdicts follow the court's evidence bar.

### 6.3 Round-tripping and related parties
- **Only NPC demand buys products.** No API sells units to a player, an alt, another player company, a T1 business or a player fund. The share model takes demand only from `D_m` (§2). Related-party *sales* are impossible by construction.
- **Related-party contracts** (leases, services, loans, IP licences) between the company and any entity in the owner set (the player, alts, the player's other companies, T1 businesses, funds they run):
  - They must price within ±10% of NPC-appraised fair value, or they're blocked with +30 surveillance (ROADMAP §2.1 rule 3).
  - Allowed ones are booked under `relatedParty` lines. **Income from them is excluded** from `Rev_u` and `E*`; **costs paid to them count**, which is the conservative side.
  - **Any player counterparty (Ledger 2026-10-09, Q11):** income from a contract with **any** player account or player-owned entity, linked or not (so an undetected alt's company too), is booked as `otherIncome`. It's excluded from `Rev_u`, `NI_adj` and the surprise s. `Rev_u` is NPC product sales only (§1).
  - When the player controls > 50% of two companies, the value function uses **consolidated** numbers with intercompany items eliminated. Each standalone filing still shows the related-party lines.

### 6.4 Exactly which filed fields feed `lnV`
`lnV` of a player company = `ln(V_engine / shares_out)` (§5) plus the sector and market factor shocks between information events. It is recomputed only at a signal (§6.2) or a filing, from these public fields and nothing else:

| Field | Definition | Feeds |
|---|---|---|
| `Rev_u` | revenue from unrelated (NPC) customers, quarter and TTM | growth g, EV/S path |
| `NI_adj` | net income excluding related-party income and one-off gains (asset sales, insurance) | E* |
| `OCF` | operating cash flow, quarter and TTM | E* (cash check) |
| `capex_maint` | plant D&A as the maintenance proxy | E* |
| `net_debt` | debt − cash | V |
| `backlog` | $ of NPC orders received but not shipped at the period close (v1.3, Q20); orders older than 63 gd are cancelled before the close | V (backlog term ΔB, §5), consensus |
| `guidance` | next-quarter `Rev_u` range the company chose to give (optional) | C, consensus |
| `C` | guidance credibility, EWMA (half-life 4 quarters) of hit (1) / miss (0); a miss is `Rev_u` outside the guided range; starts at 0.5 | multiplier 0.85 + 0.15·C, and value-pool reaction ×(2 − C) on a miss |

- **Cash check:** `E* = min(NI_adj, OCF − capex_maint)`, using TTM numbers, annualized. Revenue booked without cash (rising receivables, channel-stuffed inventory) raises `NI_adj` but not OCF, so it can't raise `E*`.
- **Excluded from `lnV`:** R&D split, pipeline, per-product margins, prices of planned products, marketing split, cash forecasts, project odds and anything else in the founder view. Test `no_hidden_strategy_leak`: two companies with byte-identical public fields and different private states produce bitwise identical `lnV` paths.
- **Ecology:** no new pool code. The value pool reads the gap `lnV − lnS` as it does for every asset. Trend and retail can overshoot, and the cause vector explains each day.

### 6.5 Exact covered-instrument list
While the window is closed (§6.1), every account covered by §6.1 is refused on (plans excepted):
1. the company's stock, every side: buy, sell, short and cover;
2. any option, future or perp whose underlying is the stock;
3. **that sector's ETF**: **every order** (buy, sell, short, cover), including reductions of existing exposure;
4. any option, future or perp on that sector ETF, treated exactly like item 3;
5. any **other index ETF** (and its derivatives) in which the company's weight is **≥ 5%**, treated like item 3.

- **Stays tradeable:** broad index ETFs where the company's weight is < 5%, and every other asset.
- **How weight is computed:** `w = shares_float · P_close / Σ_i shares_float,i · P_close,i` under the index's own method (cap-weighted on float; GX and sector indices are float-cap-weighted). `P_close` is the close at the tick the **window closes** (F + 21).
- **When it's checked:** weights are computed once when the window closes (close tick of F + 21) and frozen until it reopens. *Ledger 2026-10-09 (Q8):* for the lockup-hedge ban, the latest frozen snapshot applies continuously, inside windows too, for all 168 gd. Freezing means moving the price can't change the list. They are recomputed only if an index rebalances while the window is closed. The resulting list of covered instruments is stored in `state.companies[id].window.covered`.
- **Today:** the engine has no tradeable ETFs or derivatives yet, only the GX index level. Items 3–5 are written now and switch on when those instruments land.

---

## 7. Payback against the R-rank income path

**Benchmark.** The rank path is the per-gd net-worth growth a median engaged player needs to keep 04 §3.2's pace. 1 real day = 24 gd.

`g_R = ln(NW_next / NW_R) / T_R`:

| Rank | Window | T_R (gd) | g_R |
|---|---|---|---|
| R0 | $5k → $20k, ~1.5 real days | 36 | 3.85%/gd |
| R2 | $250k → $5M, day 5 → 12 | 168 | 1.78%/gd |
| R3 | $5M → $100M, day 12 → 40 | 672 | 0.45%/gd |
| R4 | $100M → $300M, day 40 → 56 | 384 | 0.29%/gd |
| R5 | ~5% per real day | ~1,000 | 0.21%/gd |

**Company return.** Let `y_tier` be steady FCF / invested capital at fair share, `L` the ramp lag (hiring + first R&D, gd) and `T_R` the time spent at the rank.
- Reinvested return over the window: `r_C ≈ y_tier · (1 − L / T_R)`.
- Simple payback: `P = L + 1 / y_tier`.
- Dominance ratio: `D_R = r_C / g_R`.
- **Target bands:** `D_R` ∈ [0.8, 1.3] for a competent founder at R2–R4. The top decile is ≤ 1.5×. A careless founder (bad price, no R&D) lands at ≤ 0.5×, and some lose money.

`y_tier` falls with scale. That comes from finite `D_m`, logit saturation, span of control and antitrust, not from a direct cap. `D0_m` is calibrated to hit these targets:

| Rank (typical company capital) | Tier | y_tier | L | r_C | g_R | **D_R** | Payback |
|---|---|---|---|---|---|---|---|
| R2 ($150k) | Seed | 1.90%/gd | 15 | 1.73% | 1.78% | **0.97** (about even) | 68 gd ≈ 2.8 real days |
| R3 ($3M) | Growth | 0.55% | 20 | 0.53% | 0.45% | **1.20** (beats) | 202 gd ≈ 8.4 days |
| R4 ($60M) | Late / listed | 0.30% | 30 | 0.28% | 0.29% | **0.97** (about even) | 363 gd ≈ 15 days |
| R5 ($1B) | Mega | 0.10% | 40 | 0.10% | 0.21% | **0.46** (trails) | 1,040 gd ≈ 43 days |

- **Reading the table:**
  - Founding is about even at R2, the best play at R3 (the "Operator" rank, by design), even at R4, and trails at R5. At R5 a company is a liquidity sink and prestige asset, and the IPO turns it into a liquid stock (STONKS's own insight: the market can't absorb big money).
  - Variance is higher than for trading: R&D failure, NPC reaction, regimes and covenant defaults.
- **Why the yields are tiered, not one smooth curve:** a smooth power law `y = y0 (1 + K/$100k)^−θ` can't match the path's uneven deceleration. The best fit gives D = 0.77 / 1.33 / 0.68, so tier-level yields are set directly.
- **Honesty note:** pure index trading in the engine compounds at about 0.03%/gd (8% per game year). That is far below every g_R; the bible's wealth curve assumes businesses and leverage. The benchmark is the rank path, not trading alone (decided, §12 #5).
- **Tape check `founding_dominance`:** scripted founders (competent, careless, top-decile) across 200 seeds, ratios inside the bands above. A second check, `founder_plus_trade_vs_trade`, requires the "found + trade" bot's NW at the next rank-up to beat a "business catalog + trade" bot in ≤ 0.65 of seeds.

---

## 8. T1 businesses (C4): merge into this model

**Status: recommended, awaiting Mathis (his Q2). C4 stays PENDING Mathis.** Ledger backs the merge (§12 #4).

**Recommendation: MERGE.** A T1 business becomes a **stage-0 company**: owner-operated, one product, one market, no hiring, no R&D, no filings and no listing. It runs the same daily ledger and the same logit share against NPC demand. That replaces `quant-t1-business.md`'s flat `baseDailyProfit`.

- **Why:**
  - One economic model means one set of tests and one exploit surface.
  - T1 cash already depends on sector demand and regimes, so it teaches the company game in miniature.
  - "Upgrade to a company" at R2 is a conversion, not a new system: the T1 business can be contributed as capital at appraised value (−15% haircut, 01 §4.6).
- **Proposed C4 resolution (pending Mathis), derived from §7:** at R0, g_R0 = 3.85%/gd. A T1 payback of **20 gd** gives D_R0 = 1/(20 · 0.0385) = **1.30**, the top of the band. That's fitting, since businesses are the main R0 engine and $5k of trading earns almost nothing.

  | Option | T1 payback | D_R0 | Verdict |
  |---|---|---|---|
  | Bible | ~6 gd | 4.3 | dominant: nobody trades |
  | Quant's earlier spec | 90–105 gd | 0.27 | dead: nobody buys |
  | Ledger | ~20 gd | 1.3 | **recommended** |

- **Migration:**
  - Quant rewrites `quant-t1-business.md`'s catalog as stage-0 configs (cost, D0_m, price) calibrated to 20 gd payback at fair share.
  - These carry over unchanged: the condition rule, the 85% sell-back, collect-once-a-day, and restricted-cash tagging (C5: 72 real hours online, 21 gd solo).
  - No saves contain T1 businesses yet, because C4 kept them unbuilt, so there's nothing to migrate. Tape's 63-gd band becomes "$5k start, businesses only → $13k–$22k after 63 gd".

---

## 9. Exploits: the rule that closes each one, as checks

Gates are Tape's names where they exist. "200 seeds" means scripted bots on a seeded world, with fees and fines included.

| # | Exploit | Rule here | Testable statement |
|---|---|---|---|
| X1 | Control a stock by trading > 5% of ADV | founder, alts and company treasury share one impact tally and the 3× ADV per-tick cap (§5.2) | `self_impact_clip_ratio` ≤ 1.5 counting founder + treasury as one owner set; `pump_dump_ev` ≤ 0 on a player listing |
| X2 | Price detached from fundamentals | `lnV` comes only from §6.4 fields; the value pool closes the gap | `loss_company_rally_share` ≤ 0.10; corr(Δ`lnV` at filing, `s_filing` · D / market cap) ≥ 0.8 (EV-scaled surprise, §6.2); `value_gap_p95` ≤ ln 2 on player listings |
| X3 | Money overflow | ledger in integer cents, < 2^53 ($90T), with checked arithmetic | `company_huge_money_invalid` = 0 at $1e12 capital |
| X4 | Split rally | no splits for player companies in v1; when added they're cosmetic | `split_cosmetic_value` and `split_cosmetic_flow` (unchanged) |
| X5 | Dividend pump | dividends only from retained earnings, solvent, ≤ TTM FCF, no covenant breach; otherwise rejected (§5.3); debt-funded → distress flag | `dividend_rule_reject` = 100% of illegal declarations; `dividend_pump_ev` ≤ 0 |
| X6 | Own company = guaranteed stock | §6 public-only `lnV`; marks at min(fair, VWAP3) minus exit cost | `founder_pump_ev` ≤ 0; `own_stock_up_share` ≤ 0.80; `own_stock_rank_pump` = 0 |
| X7 | Resignation pump | `changeCEO` (§9.1): a public filing with 10 gd notice; no management term in `lnV`; the departing CEO's owner set is frozen in the stock and §6.5 instruments from announcement to effect + 21 gd | `ceo_exit_freeze`; `resign_pump_ev` ≤ 0 |
| X8 | Short, dump, buy out | the tender floor is 1.2 × the 30-gd VWAP ending the day before the **pre-attack start** T0 (§9.2) | `short_dump_buyout_ev` ≤ 0; `tender_price_floor` with T0 exact |
| X9 | Snowball | y_tier falls with scale (§7), antitrust at 60% share, NPC entry ∝ margin | `founder_yield_by_size` strictly decreasing across Seed/Growth/Late/Mega; `founding_dominance` top decile ≤ 1.5× |
| X10 | Crime-protected pump | no crime services touch companies in v1; no op can alter a filing or a frozen hash | `filing_hash_mismatch` = 0; `crime_pump_ev_ratio` ∈ [0.8, 1.2] when M30 lands |
| X11 | Owning > 100% | the cap table is the only ownership source, shares are conserved | `ownership_conservation` = 0 violations over 10k random action sequences, including IPO, rounds, buybacks and lockup releases |
| X12 | Free investor money | rounds only from NPCs at 0.70 × `V_engine`, before/after shown | `investor_no_free_cash`: every equity inflow changes ownership by inflow / post-money |
| X13 | Failed AGM raises price | no AGM in v1, and `V_engine` has no governance term | `agm_sign_test` when governance lands |
| X14 | Riskless rent | company property is a cost (rent/plant), never income | n/a here; stays with the property system |
| X15 | Overtuned projects | §3: odds and band shown, draws fixed at project start | `project_ev_band`: realized inside the shown band ≥ 90%, mean ROI ≤ base + 10% |
| N1 | Round-tripping revenue (company ↔ own entities) | §6.3: only NPC demand buys; related-party income excluded, consolidation eliminates it | `related_party_revenue_in_Rev_u` = 0; `roundtrip_lnv_effect` = 0 |
| N2 | Pumping your own stock before a filing | §6.1 closed window in `placeOrder`; §6.2 signals price most of the quarter in | `alt_prefiling_edge` ≤ round-trip cost; `closed_window_bypass` = 0 across all entry points |
| N3 | Wash trades (founder ↔ alt ↔ treasury) | same owner set never matches itself in the batch auction; the crossed quantity is netted and flagged | `self_match_fills` = 0; surveillance +10 per attempt |
| N4 | Alt-lifted peak | stake marks use whole-crowd exit value (ROADMAP must-fix) | `alt_lifted_peak`: an alt buying after the founder raises the founder's mark by ≤ 0 |
| N5 | Bankruptcy cash-out | 63-gd clawback (safe harbour only for contracts signed ≥ 64 gd before default; insider at signing or payment); personal debts survive; locked plan shares are no shield (v1.4) and seized ones keep the plan schedule; covered creditors can't seize them (v1.5, G10) | `bankruptcy_extract_ev` ≤ 0: a bot that pays itself out then defaults ends no richer than one that doesn't; `clawback_safe_harbour_64`; `clawback_insider_either`; `plan_end_legal` |
| N6 | Guidance inflation | credibility C lowers the multiplier and amplifies misses | `guidance_inflate_ev` ≤ 0 over 8 quarters vs honest guidance |
| N7 | Accrual or inventory stuffing | `E* = min(NI_adj, OCF − capex)` | `revenue_without_cash_lnv_effect` = 0 |
| N8 | IPO pop farmed by alts | owner-set and young accounts excluded; ≤ 5% per buyer; d = 0.10 | `ipo_alt_allocation` = 0; pop to allocatees ≤ d in median |
| N9 | Self-funded private round at an inflated price | rounds only from NPCs at an engine price | `self_round_attempts_accepted` = 0 |
| N10 | Transfer pricing with own T1 businesses | §6.3 ±10% band, eliminated on consolidation | covered by N1 checks |
| N11 | Save-scumming R&D (solo) | draws fixed at project start; solo unranked (R1); online uses server entropy | `rd_reroll`: identical outcome after reload with identical inputs |
| N12 | Buyback timed on private knowledge | programs filed only on F + 1 with a fixed size and daily schedule, immutable, executed in the window; never plans | `closed_window_fills` = 0 for the treasury |
| N13 | Predatory pricing to clear NPCs, then gouge | NPCs re-enter at a rate ∝ margin; antitrust at 60% | `predatory_price_ev` ≤ 0 vs steady pricing over 4 quarters |
| N15 | Trading on the quarter while the numbers form | the window opens only after filing and closes 43 gd before the next close; plans are sell-only, lock their shares, are fixed 63 gd ahead and can't be cancelled; every founder own-stock trade is filed the next day (v1.4) | `window_two_way_edge` (gains and losses avoided each ≤ round-trip cost); `plan_immutable`; `plan_sell_only`; `plan_no_breach_path`; `insider_filing_next_day` |
| N16 | Stacked orders that flip a position or beat a limit | Forge's stacking rule, at placement and at fill | `stacking_rule` = 0 violations |
| N17 | Faked forward signals (hiring, backlog) to lift the stock before selling in the window | v1.5: caps (1.5%/week, 2.5% one-signal hold) on unbacked parts only, backed backlog uncapped; headcount cost-only, so it can't lift; the re-anchor at filing reverses cancelled backlog; the pass rests on `signal_fake_ev` vs the same-schedule seller after production cost, with the 0.25 backlog-weight contingency (§6.2) | `signal_fake_ev` ≤ honest; `signal_path_independence` |
| N14 | Lockup bypass through a derivative or sector ETF short | lockup positions can't be hedged; §6.5 instruments refused for locked holders | `lockup_hedge_accept` = 0 |


### 9.1 CEO change (X7)
- **Action:** `changeCEO(s, companyId, successor)`, with `successor = { kind: 'npc' } | { kind: 'player', playerId }`. Only the controlling holder (> 50% of votes, which in v1 means the founder) can call it.
- **Filing:** a public filing on the Wire on the announcement day A: "CEO change effective day A + 10". The change takes effect at the open tick of **A + 10**. It can't be withdrawn after filing.
- **Effect on operations:** none on demand, quality or `V_engine`, because there's no management term in v1. From A + 10 the successor holds the Company app's controls. An NPC successor runs a published **steady policy**: keeps prices and headcount, spends R&D at 10% of revenue, pays no new dividends, and starts no new debt. The ex-CEO keeps their shares and can't become CEO again for 252 gd.
- **Freeze:** from A to A + 10 + 21, the departing CEO's covered set (§6.1) can't trade the stock or any §6.5 instrument, even inside the open window: `{ code: 'ceoExitFreeze', untilDay }`. The freeze stacks with the window (both must allow a trade). Plans committed before A keep running (they were fixed ≥ 63 gd ahead).
- **Checks:** `ceo_exit_freeze` (every entry point, including e2e hooks), `resign_pump_ev` ≤ 0 over 200 seeds.

### 9.2 Pre-attack start for takeovers (X8)
- **T0 = the earliest of:**
  1. the first gd on which the acquirer or any account linked to it (owner set, §6.1) holds a **net short** in the target;
  2. the first gd on which that set **reduces** a position in the target by **more than 0.5% of the target's float** in one gd;
  3. **63 gd before** the tender announcement.
- **Tender floor:** ≥ 1.2 × the target's **30-gd VWAP ending on T0 − 1** (all-holder tender at one price, ROADMAP §2.1).
- **Check:** `tender_price_floor` with T0 computed exactly from the ledger for scripted attack paths. Takeovers themselves land later (DEFERRED).

---

## 10. Rules

**(a) No-reveal.**
- Strategy is never shown automatically. Other players see only what a real company files:
  - quarterly statements (listed);
  - the weekly signals (§6.2);
  - headcount band, debt and covenant status, guidance and credibility C;
  - insider trades (the founder's own-stock and derivative trades, plan fills included, filed the next day; v1.4), dividends and buybacks;
  - that a trading plan exists, with its start and end days, and any plan skip or end with its day and reason (v1.4). A plan's size, per-day size, day list, minimum sell price and remaining quantity are never shown.
- **Private-company disclosure (Ledger + Velvet §15, v1.3):**
  - **Seed and Growth** file a **yearly banded registry entry** (a Companies-House-style annual filing): name, sector, cities, product names and prices, tier, headcount band, revenue band and debt band.
  - **Late-tier private** companies file **full quarterly statements** on the §6.1 schedule (close + 3 gd), because the IPO needs 3 filed quarters (§5).
  - **Weekly signals (§6.2) start at listing.** Private companies publish none.
- **Every company's public view** shows "cash · total debt" with the date of the filing it comes from (`CompanyPublic.cashDebt`, §11).
- **Never visible** unless obtained through espionage (03 E-ops): R&D split, pipeline and odds, per-product margins, marketing split, planned prices, cash forecasts.
- `explainMove` keeps its no-leak rule: flow is shown by pool type, never by named account.

**(b) No pay-to-win.** Real money buys cosmetics only: company logo frames and the dashboard theme. Nothing paid touches demand, quality, odds, capital, filings or rank. Ad cash and fresh-start cash are restricted cash (C5) and can't fund founding, capital injections or rounds inside the window.

**(c) Simulation.** All companies, products, cities and investors are fictional, and no real tickers are used. The IPO, filing and investor screens show "Simulated market. Not financial advice." (M51). Copy says "the market reacted", never "you should buy".

---

## 11. Engine API sketch

Everything is pure, seeded and deterministic. Saves round-trip through JSON. When `config.companies` is absent, the engine is byte-identical to today.

```ts
// src/engine/company-public.ts  -- the ONLY company type shared screens may import
export interface CompanyPublic {
  id: string; name: string; sector: CompanySector; foundedDay: number; tier: CompanyTier;
  listed?: { assetId: string; ipoDay: number; ipoPrice: number; sharesOut: number; floatShares: number };
  cities: string[]; products: { name: string; segment: 'budget' | 'mid' | 'premium'; price: number }[];
  headcountBand: '1-10' | '11-50' | '51-200' | '201-1k' | '1k-5k' | '5k+';
  debt: { totalBand: string; rating: Rating; covenant: 'ok' | 'cure' | 'default' };
  cashDebt?: { cash: number; totalDebt: number; filedDay: number };   // v1.3: "cash · total debt" + filing date; from the latest filing (Late private and listed; Seed/Growth: annual registry bands)
  filings: FilingPublic[];          // listed and Late-tier private: quarterly; Seed/Growth: annual banded registry (v1.3)
  signals: WeeklySignal[];          // listed only (start at listing), last 13
  guidance?: { quarter: number; revLow: number; revHigh: number }; credibility: number;
  insiderTrades: { day: number; filedDay: number; side: 'buy' | 'sell'; qty: number; instrument: 'stock' | 'derivative' }[];   // founder's own stock + its derivatives only (§6.1 Q18); plan fills and in-window trades alike, filedDay = day + 1, no plan tag (v1.4)
  distressFlag: boolean; window?: { open: boolean; opensDay: number; closesDay: number; covered: string[] };   // public schedule + covered instrument ids (covered: decided, Q29); absent for Seed/Growth or before the first quarterly filing
  buybackPrograms: { size: number; fromDay: number; toDay: number }[];   // filed 1 gd ahead (§5.2)
  ceoChange?: { announcedDay: number; effectiveDay: number; successorKind: 'npc' | 'player' };   // §9.1
  plans: { fromDay: number; toDay: number; ended?: { day: number; reason: PlanEndReason } }[];   // v1.4: "a plan exists" + its dates (+ end day and reason); total, per-day size, day list, minSellPrice and remaining are never public
  planSkips: { day: number; reason: PlanSkipReason }[];   // v1.4: day + reason only, no size
}
export interface FilingPublic { quarter: number; periodCloseDay: number; filedDay: number; hash: string;
  income: { revUnrelated: number; relatedPartyIncome: number; cogs: number; opex: number; ebitda: number; netIncome: number; niAdj: number };
  balance: { cash: number; receivables: number; inventory: number; ppe: number; debt: number; equity: number; retainedEarnings: number };
  cashFlow: { ocf: number; capex: number; fcf: number; dividends: number; buybacks: number }; headcountBand: string }
export interface WeeklySignal { day: number; bookingsBand: [number, number]; runRateBand: [number, number];
  netHires: 'up' | 'flat' | 'down'; utilizationBand: string; launches: string[]; debtDrawn: number }

// src/engine/company.ts  -- founder view; imported only inside the Company app
export interface CompanyFounderView extends CompanyPublic {
  cash: number; ledgerToday: LedgerEntry[]; quarterToDate: FilingPublic['income'];
  staff: Record<Role, { heads: number; ramping: number; wagePerDay: number }>;
  plants: { city: string; level: number; capacity: number; utilization: number }[];
  productsPrivate: { id: string; quality: number; qualityScore: number /* display 0–100, §3 */; unitCost: number; margin: number; share: number; marketing: number; generation: number }[];
  projects: { id: string; kind: 'quality' | 'cost' | 'nextgen'; spend: number; daysLeft: number; pBand: [number, number]; dqBand: [number, number, number] }[];
  loans: Loan[]; capTable: { holder: string; shares: number; lockedUntilDay?: number }[]; relatedParty: Contract[];
  plansPrivate: { id: string; instrument: string; qtyPerDay: number; days: number[]; minSellPrice: number; lockedQty: number; remainingQty: number;
    skips: { day: number; reason: PlanSkipReason; qtySkipped: number }[]; ended?: { day: number; reason: PlanEndReason } }[];   // v1.4, founder only
}

// state (engine side; absent = no company system)
WorldState.companies?: Record<string, CompanyState>;   // full private state, incl. rng streams co:<id>:rd, co:<id>:sig
WorldState.markets?: Record<string, MarketState>;      // (city, sector): D0, NPC competitors, rng co:npc:<market>
WorldConfig.companies?: CompanyConfig;                 // knobs below

// founder-only events (Company app only; never in CompanyPublic)
export type CompanyFounderEvent =
  | { kind: 'windowClosing'; companyId: string; closesDay: number; reopensDay: number }   // open tick of F + 17 (5 open days left)
  | { kind: 'windowClosed'; companyId: string; cancelledOrders: number; reopensDay: number }   // decided (Q29), after the last tick of F + 21
  | { kind: 'salaryCut'; companyId: string; newCapPerDay: number; fromDay: number }   // decided (Q27)
  | { kind: 'covenantBreach'; companyId: string; cureUntilDay: number }
  | { kind: 'lockupEnds'; companyId: string; day: number };

// actions (pure; each returns { state, events, reject?: { code, untilDay? } })
foundCompany(s, playerId, { name, sector, city, capital })
companyAction(s, playerId, companyId, a: CompanyAction)
  // a: hire | fire | setPrice | setMarketing | startProject | buildPlant | expandCity | launchProduct
  //    | drawDebt | repayDebt | declareDividend | buybackProgram({ size, fromDay, toDay }) | setGuidance | raiseRound | requestIPO(floatPct)
publicCompanyView(s, companyId): CompanyPublic
founderCompanyView(s, playerId, companyId): CompanyFounderView     // throws unless founder
placeOrder(...)  // extended: rejects { code: 'closedWindow' | 'ceoExitFreeze' | 'stacking' | 'lockup' | 'self_match', untilDay }; sells beyond qty − locked are refused or cut
changeCEO(s, companyId, successor: { kind: 'npc' } | { kind: 'player'; playerId: string })   // public filing; effective A + 10 (§9.1)

export interface TradingPlan {   // v1.4: sell-only, escrow = locked shares only
  id: string; companyId: string; playerId: string;   // any covered account
  instrument: string;                                 // assetId of the stock or a §6.5 instrument; sells only units held and locked at commit
  side: 'sell';                                       // anything else (incl. JSON 'buy' | 'short' | 'cover') → planSellOnly
  qtyPerDay: number; days: number[];                  // fixed size, fixed game days; locks Σ qtyPerDay over days at commit
  minSellPrice: number;                                 // required, fixed at commit (Ledger v1.4, §6.1); ≤ 0.80 × commit-day close else planFloorTooHigh (v1.5, G12); split-adjusted
  committedDay: number;                               // min(days) ≥ committedDay + 63, else refused
}
commitPlan(s, plan): { state, reject?: PlanReject }   // no edit or cancel exists after commit
// final refusal codes (Ledger v1.3, v1.4, v1.5):
type PlanReject =
  | { code: 'planSellOnly' }                         // v1.4: side is not 'sell' (no buy, short or cover plans)
  | { code: 'planFloorTooHigh'; maxFloor: number }   // v1.5 (G12): minSellPrice > 0.80 × commit-day close; maxFloor = that bound
  | { code: 'planLimit' }                            // a third live plan for this account and company
  | { code: 'planInLockup' }                         // a plan with a sell day inside the lockup
  | { code: 'planTooSoon'; earliestDay: number }     // committed < 63 gd before its first day; earliestDay = commitDay + 63
  | { code: 'planImmutable' }                        // any edit or cancel attempt after commit (editPlan / cancelPlan)
  | { code: 'planUnfunded'; shortfall: number }      // v1.4: unencumbered shares < Σ qtyPerDay; shortfall in shares (no cash escrow exists)
  | { code: 'planBanned'; untilDay: number }         // breach ban (G11 fail-safe; no v1 path, unit-tested with an injected breach): through the end of the 2nd full company quarter after the breach quarter
  | { code: 'stacking' };                            // §6.1 stacking rule
type PlanSkipReason = 'volume' | 'price' | 'cap' | 'halt';               // v1.4: never breaches; 'margin' removed
type PlanEndReason = 'completed' | 'terminated' | 'legal' | 'tender';    // never breaches; unsold locked shares released at the end tick, except price-skipped shares (held to end day + 63, G12) and seized shares ('legal': sold on the remaining schedule via a clearing account for the creditor, G10)
// legal claims on locked shares (garnish / seize / court enforcement), v1.5 (G10):
type ClaimReject = { code: 'claimCoveredCreditor'; creditorId: string };   // creditor is in the founder's covered set (owner-set alt, treasury, alliance member)
// public events (day + reason only, no size):
//   planCommitted { companyId, fromDay, toDay }
//   planSkipped   { companyId, day, reason: PlanSkipReason }
//   planEnded     { companyId, day, reason: PlanEndReason }
//   insiderTrade  { companyId, day, filedDay: day + 1, side, qty, instrument }   // founder own stock + derivatives, plan or window
// founder-only: the same skip and end events with quantities (CompanyFounderView.plansPrivate)

// step hooks (inside step(), after the live/ecology close of each game day)
companyDay(s, day)        // demand, share, sales, costs, ledger; NPC reactions (weekly); projects
companySignal(s, day)     // every 5 gd at the open tick: publish WeeklySignal, consensus → lnV via news path
companyWindow(s, day)     // first tick F+2 open; F+17 emit windowClosing; after last tick F+21 close: cancel non-plan covered orders, founder-only Wire line, freeze ETF weights
runPlans(s, day)          // open tick of each plan day, before other orders: place plan sells through placeOrder; emit planSkipped / planEnded; insider filings for day − 1
closePeriod(s, day)       // gd 63k close: freeze + hash statements
fileQuarter(s, day)       // close + 3 gd at the open tick: publish, surprise → lnV, covenants, tier checks
listCompany(s, companyId) // appends AssetDef/AssetState; founder position with lockedUntilDay
```
- **Lint rule (Forge):** shared screens (Broker, Wire, rivals, "What the market sees") may import `CompanyPublic` only. An ESLint `no-restricted-imports` entry blocks `CompanyFounderView` outside `src/app/company/**`.
- **Speed budget:** `companyDay` < 50 µs per company per gd. It runs only at the day close, so the per-tick cost stays as it is (the speed gate is unchanged for worlds without companies).

**Test gates.**
- **Determinism:** same seed and actions → same world; JSON save/load mid-quarter continues exactly; `config.companies` absent → the fingerprint fixture is unchanged.
- **Accounting:** the balance sheet balances to the cent every gd; Σ daily revenue = filed revenue; Σ tagged flows = Δcash; frozen hash = filed hash.
- **Balance:** `founding_dominance` (§7 bands); `founder_yield_by_size`; Tape's 63-gd T1 band ($13k–$22k); `own_stock_up_share` ≤ 0.80; listed vol ratio in [0.85, 1.4] of sector peers.
- **Learnability:** in ≥ 90% of seeds, a bot that cuts price 10% gains share, and a bot that wins a quality project gains share within 21 gd (signs are learnable). The value-gap half-life on player listings is within ±50% of NPC stocks. `earnings_surprise_ic` > 0 on player listings, while `founder_beats_bh_share` ≤ 0.70.
- **Insider:** `alt_prefiling_edge`, `rho_residual` (EV-scaled s), `signal_fake_ev` (same-schedule comparator, after production cost; v1.5), `window_two_way_edge`, `stacking_rule` = 0, `closed_window_fills` = 0, `plan_immutable`, `closed_window_bypass` = 0 (every entry point), `ceo_exit_freeze`, `no_hidden_strategy_leak`, `reanchor_public_edge`, `forward_cap_honest_bind`, `cap_carry_edge` (three bots: weekly-carry, lag-aware, hold-to-close; v1.5), `signal_joint_v15` (v1.5), `signal_cap_scope` (v1.5), `consensus_alpha1` (v1.5), `plan_sell_only`, `plan_no_cash_escrow`, `plan_locked_shares`, `plan_unfunded_shares`, `plan_margin_untouchable`, `plan_skip_reasons_closed`, `plan_skip_cap`, `plan_skip_halt`, `plan_skip_price` (minimum sell price, v1.4), `plan_floor_cap` (v1.5), `plan_price_skip_hold` (v1.5), `plan_end_terminated`, `plan_legal_schedule` (v1.5, replaces `plan_end_legal`), `claim_covered_creditor` (v1.5), `plan_end_tender`, `plan_tier_drop`, `plan_split`, `plan_dividend_free_cash`, `plan_no_breach_path`, `breach_bars_plans` (unit, injected breach), `plan_public_disclosure`, `insider_filing_next_day`, `clawback_safe_harbour_64`, `clawback_insider_either`.
- **Exploits:** every check in §9.

**Knobs (proposed defaults).**

| Knob | Default |
|---|---|
| `quarterDays` | 63 |
| `filingLagDays` | 3 |
| `windowOpenAfterFiling`, `windowCloseAfterFiling`, `planLeadDays` | 2, 21, 63 |
| `signalEveryDays`, `signalNoise`, `forwardCap`, `backlogWeight`, `backlogEwma` | 5, 0.04 (backlog) / 0.02 (shipped), **unbacked parts only (v1.5, G13)**: 1.5%/week & 2.5% one-signal hold with next-signal release (v1.5), 0.5, **1** (v1.5, was 0.5: no smoothing) |
| `backlogWeightFallback` (named contingency, **not** the default) | 0.25: used only if `signal_fake_ev` fails; then rerun and report to Ledger (v1.5) |
| `headcountSignalWeight` | 0: headcount and net hires are cost-only (v1.5, unchanged) |
| `planFloorMaxRatio`, `priceSkipHoldDays` | 0.80 × commit-day close, 63 gd after the plan's end day (v1.5, G12) |
| `surpriseDenominator` | max(EV_20, 0.25 · mcap_20) |
| `share { a, b, c, d }` | 1.0, 0.35, 2.0, 0.5 |
| `demandCycleK` (κ_D) | 0.5 |
| `D0` per market | calibrated to y_tier = 1.9 / 0.55 / 0.30 / 0.10 %/gd |
| `frontierDrift` per sector | §3 |
| `ipoDiscount` | 0.10 |
| `lockupDays`, `founderSellCapPerDay` | 168, 2% |
| `clawbackLookbackDays` | 63 |
| `covenants` | 3.5× / 2.0× / 21 gd cure |

---

## 12. Decisions (Ledger 2026-10-09)

All 12 open questions from v1 are decided. The body above is updated to match.

1. **Founding rank: R2 Owner.** Yes.
2. **IPO eligibility:** the 5-sector holding rule is **dropped for operating companies**. Keep EV ≥ $50M, ≥ 3 filed quarters and R3+. The 5-sector rule stays for holdings of T-businesses only.
3. **IPO price:** the engine prices it at **0.9 × V_engine** (d = 0.10). The 1 gd book only allocates shares. See Changelog: this replaces ROADMAP §2.1's price range plus auction. Ledger edits ROADMAP, not Quant.
4. **T1 → stage-0 companies with a 20 gd payback:** **recommended, awaiting Mathis** (his Q2). **C4 stays pending Mathis.**
5. **Benchmark:** the rank income path. Yes.
6. **NPC listed stocks on the filing model:** not in v1.
7. **Competition:** shared `D_m` online; NPCs only in solo. Yes.
8. **Personal guarantees:** allowed and optional. r_guaranteed = 0.75 · r_debt/gd, a relative 25% discount (v1.3, replacing −0.03%/gd). Called into personal debt on default. UI note for Forge and Velvet: show the personal-debt consequence before signing (§1).
9. **No founder cash-out at IPO.** Founders realise wealth after the lockup through normal sells, which go through the shared impact tally (§5.1).
10. **Residual surprise ρ:** target ≤ 0.15, ceiling 0.25 (§6.2), now on the EV-scaled surprise s (§6.2, v1.2 addendum).
11. **Sector ETF:** every order on it is covered (§6.5 item 3). *The v1.1 founder notice and the reduce-only notice window were **replaced** by Ledger the same day with the open trading window, scheduled plans and the `windowClosing` warning (§6.1; Changelog).*
12. **Debt rates:** priced per game day relative to company yields (§1). Yes.

### 12.1 Ledger's answers to Tape (2026-10-09)
- **Q2, window edges:** the window opens on the **first tick of F + 2** and closes **after the last tick of F + 21**, inclusive (§6.1).
- **Q7, window-close line:** the Wire line goes **only to the founder**, with nothing public (no-reveal, §6.1). Quant flagged that v1.2's "plan filed on the Wire at commit (instrument, side, size band)" broke the same principle. Ledger (2026-10-09, accepted): the public filing carries only "a plan exists" plus its start and end days (§6.1, §11 `CompanyPublic.plans`).
- **Q5, buybacks:** announced programs, publicly filed 1 gd ahead with size and window. They execute only inside the open window, through the shared tally and the ADV cap, and are **not** plans (§5.2).
- **Q12, clawback:** goes after **payments, not people**. Every company payment to any player account in the 63 gd before default is clawed back from whoever got it, with no alt detection. That covers dividends, founder and other player loan repayments, salaries above the cap of max($50/gd, 1% TTM revenue / 252 per gd), and related-party payments (§5.3).

## 13. Answers to Tape (Q1–Q19)
One line each. **Every item is now decided by Ledger (2026-10-09).** The 13 items that v1.2 marked proposed were accepted, with changes to Q12's onward-transfer rule and Q18's filing scope (below).

- **Q1** (window rewrite): done in v1.2. `closedWindow`, `windowClosing`, `TradingPlan`/`commitPlan`, and `planLimit` / `planInLockup` / `planTooSoon` / `planImmutable` (§6.1, §6.5, §11). Ledger.
- **Q2** (tick edges): open from the first tick of F + 2, closed after the last tick of F + 21 (§6.1). Ledger.
- **Q3** (warning day): trading days = game days. `windowClosing` fires at the open tick of **F + 17**, leaving 5 open days, F + 17 … F + 21 (§6.1). This follows from Q2 plus Ledger's "5 trading days"; v1.2's "F + 16" was off by one.
- **Q4** (alliance members): yes, they're covered; the account list in §6.1 includes them, as in ROADMAP §2.1 rule 2. Ledger.
- **Q5** (buybacks): announced programs, filed 1 gd ahead, in-window only, not plans (§5.2). Ledger.
- **Q6** (plans): public only as "a plan exists" with its start and end days, plus skips and ends with day and reason. A day clipped by the ADV cap, the 2%/gd founder cap, a halt or the minimum sell price sells what fits, and the rest is `planSkipped` with no carry. At most 2 active plans per account per company, on the stock and §6.5 instruments only, **sell-only** from v1.4. Sell days inside the lockup are refused at commit (§6.1). Ledger. *v1.5 (G12): `minSellPrice` ≤ 0.80 × commit-day close (`planFloorTooHigh`); `price`-skipped shares stay locked to end day + 63.*
- **Q7** (window-close line): founder-only, nothing public (§6.1). Ledger. Plan disclosure reduced to existence plus dates (§6.1): Ledger.
- **Q8** (weight snapshot): the close tick of F + 21, frozen until F' + 2. The lockup-hedge ban uses the latest frozen snapshot continuously for all 168 gd (§6.5). Ledger.
- **Q9** (ρ sample, E* ≤ 0): 8 filings per seed × 200 seeds. ρ now uses the EV-scaled surprise s, which is defined for any earnings (§6.2). Ledger; the formula is per Tape gap (b).
- **Q10** (alt baseline): entry at the first tick **after** the filing's newsPrint on F (§6.2). Ledger (agrees with Tape).
- **Q11** (unlinked contract income): excluded. Any income from a player counterparty, linked or not, is `otherIncome`, outside `Rev_u`, `NI_adj` and s (§6.3). Ledger.
- **Q12** (clawback): covers payments, not people, inclusive at 63 gd. The first recipient owes the full amount even if they passed it on. What they still hold is collected down to the floor ($5k + one T1), and the rest becomes personal debt on that account. A third player is never chased (§5.3). Ledger.
- **Q13** (signal weights, cap): shipped revenue at full weight, backlog at 0.5, headcount as cost only. The forward part is capped at 1.5%/week (v1.4 rule 7; was 1.0%) and 2.5%/quarter of `lnV` and re-anchored at filing; `signal_fake_ev` has a target (§6.2). Ledger. *v1.5: the cap covers unbacked parts only (G13), backlog α = 1, quarterly excess released at the next weekly signal; `signal_fake_ev` uses the same-schedule comparator with the 0.25 backlog-weight contingency (G14).*
- **Q14** (CEO change): `changeCEO` is a public filing with 10 gd notice. The departing CEO's set is frozen from A to A + 31 on top of the window, while earlier plans keep running (§9.1). Ledger.
- **Q15** (pre-attack): T0 = the earliest of first net short, a one-day reduction > 0.5% of float, or announcement − 63 gd. The floor is 1.2 × the 30-gd VWAP ending T0 − 1 (§9.2). Ledger.
- **Q16** (stale IPO price): repriced at the latest filing before `requestIPO`, and eligibility must still hold then (§5.1). Ledger.
- **Q17** (post-lockup sells): both rules apply. Sales need the lockup over **and** the window open (or a plan), plus the 2%/gd cap. Each sale is filed publicly the next day; there is no pre-sale notice (v1.4 rule 2) (§5.1, §6.1). This follows from the window ruling covering the founder.
- **Q18** (trade filings): only the founder's own trades in their stock and in derivatives on it are filed publicly (side, size, day), on the next day, **plan fills included** (v1.4 rule 2). Sector-ETF and index trades are covered by the window but never filed (§6.1). Ledger.
- **Q19** (alliance in the IPO book): excluded, like the owner set (§5.1, §6.1 account list). Ledger.

### Q20–Q30 (Tape v1.2 review)
- **Q20** (re-anchor predictable): backlog is a filed field read by `V_engine` through the same backlog term the consensus uses. The cap covers only in-quarter weekly signals, with excess carried to the uncapped close signal (v1.3–v1.4; in v1.5 backed backlog is uncapped, α = 1, and unbacked excess is released at the next weekly signal, §6.2). So `reanchor_public_edge` passes by construction (gross ≈ 0) and `forward_cap_honest_bind` passes (~6% binding for a launch-heavy company; Δρ = 0) (§5, §6.2, §6.4). Ledger. New check `cap_carry_edge`: **proposed**.
- **Q21** (plan optionality): **simplified in v1.4 (Ledger rules 1–3).** Plans are sell-only and escrow only locked shares; `planUnfunded { shortfall }` counts unencumbered shares. Skips (`volume`, `price`, `cap`, `halt`) and ends (`completed`, `terminated`, `legal`, `tender`) are public with day and reason and are never breaches; the `margin` reason is gone. Sellable = qty − locked on every route; locked shares can't be pledged and are untouchable in margin calls. The breach consequence (public filing, investigation odds, `planBanned` through the 2nd full quarter after the breach quarter) stays as a fail-safe with no reachable v1.4 trigger (§6.1, §11). Ledger. *v1.5: `minSellPrice` capped at 0.80 × commit-day close with the end + 63 hold (G12); seized shares keep the schedule via a clearing account, covered creditors refused (G10); breach = fail-safe with no v1 path (G11).*
- **Q22** (EV denominator): `D = max(EV_20, 0.25 · mcap_20)`, using 20-gd averages ending at the close (§6.2). Ledger.
- **Q23** (no weight snapshot before the first F + 21): take a snapshot at the **listing tick**, valid until the first F + 21 close snapshot (§6.5). **Decided (Ledger 2026-10-09).**
- **Q24** (buyback timing): programs filed only on F + 1 with a fixed size and daily schedule, immutable after filing (`buybackImmutable`); the treasury check stays (§5.2). Ledger.
- **Q25** (Late promotion gap, unlisted index): no window until the first quarterly filing. Unlisted, the window covers the sector fund and its derivatives only; the ≥ 5% index clause is empty until listing (0 float weight), which is consistent with §15 #3 (§6.1). Ledger.
- **Q26** (warning day): `windowClosing` stays at the open tick of F + 17. Velvet updates its F + 16 copy (§6.1). Ledger.
- **Q27** (salary cap drift): the cap is recomputed **once per quarter at filing**, on filed TTM revenue. A salary above the new cap is auto-cut to it from F + 1, with a founder event `salaryCut`. The excess never accrues, so cap drift creates no clawback (§5.3). **Decided (Ledger 2026-10-09).**
- **Q28** (innocent lenders and contractors): safe harbour for scheduled, market-price payments to non-insiders with terms signed before the lookback. Early, extra or non-ordinary payments are clawed back, insider loan repayments always are, and a lending-risk warning is added for Velvet and Forge (§5.3). Ledger.
- **Q29** (Velvet: `window.covered` + `windowClosed`): add `covered: string[]` (instrument ids) to `CompanyPublic.window`. It's public data with no leak, so `public_view_schema` updates. Add a founder-only event `windowClosed { companyId, cancelledOrders, reopensDay }`; the public sees only `window.open` flip, which the public schedule already implies (§11). **Decided (Ledger 2026-10-09).**
- **Q30** (guarantee rate): r_guaranteed = 0.75 · r_debt/gd in §1 and §12 #8; −0.03%/gd survives only in changelog history (§1). Ledger.

## Changelog

- **v1.5 (2026-10-09), Ledger's decisions 1–3 on v1.4 and rulings on Tape's G10–G14:** same-schedule faking comparator with the 0.25 backlog-weight contingency, headcount cost-only; backlog α = 1; caps on unbacked parts only, backed backlog uncapped; unbacked quarterly excess released at the next weekly signal; joint `signal_joint_v15` check; the five v1.4 judgment calls decided; `minSellPrice` ≤ 0.80 × commit-day close (`planFloorTooHigh`) with a 63-gd hold on price-skipped shares; `legal` keeps the schedule through a clearing account, `claimCoveredCreditor`; breach as fail-safe. Spec frozen for Tape's run. Full mapping at the top of this file.
- **v1.4 (2026-10-09), Ledger's rulings 1–8 on Tape's G1–G9:** sell-only plans with locked-share escrow, next-day insider filings with no pre-announcement, closed skip and end reasons, corporate actions on locked shares, safe harbour at ≥ 64 gd, insider at signing or payment, weekly forward cap 1.5%, ban length accepted. Full mapping at the top of this file.
- **v1.3 (2026-10-09), Ledger's rulings on Velvet's §15 questions, the final plan codes and Tape's Q20–Q30:**
  1. Private filings: Seed and Growth file a yearly banded registry entry; Late-tier private companies file full quarterly statements (§10a, §11).
  2. Weekly signals start at listing (§6.2, §10a).
  3. The window starts with the first quarterly filing. Late-tier private founders are covered on the sector ETF and on ≥ 5%-weight indices; Seed and Growth have no window (§6.1).
  4. Plan limits confirmed: 2 live plans, no carry, shared ADV cap, no sell plan starting inside the lockup (§6.1).
  5. `CompanyPublic.cashDebt` shows "cash · total debt" with its filing date (§10a, §11).
  6. Personal guarantee: r_guaranteed = 0.75 · r_debt/gd, replacing −0.03%/gd (§1, §12 #8).
  7. Quality display scale: `qualityScore = clamp(round(80 + 30·ln(q/Q_f)), 0, 100)`, display only (§3, §11).
  8. Window card copy: "you, your alliance and accounts you control" when the player is in an alliance (§6.1).
  9. `commitPlan` refusal codes are final: `{ code:'planLimit' }`, `{ code:'planInLockup' }`, `{ code:'planTooSoon', earliestDay }`, `{ code:'planUnfunded', shortfall }`, `{ code:'planBanned', untilDay }` and `{ code:'planImmutable' }` (§6.1, §11). `planCommitted` is renamed `planImmutable`.
  10. **Tape Q20–Q30 (Ledger):**
      - backlog is filed and read by `V_engine`; the cap covers in-quarter weekly signals only, with an uncapped close signal; s gains a backlog term (Q20);
      - plan escrow with `planUnfunded { shortfall }`, sellable = qty − locked on every route, escrow untouchable by margin, skip reasons, the breach consequence with `planBanned { untilDay }`, and Tape checks `breach_bars_plans` and the escrow checks (Q21). *Superseded by v1.4: plans are sell-only, escrow is locked shares only, and the skip and end reasons are the v1.4 lists (§6.1).*
      - surprise denominator max(EV_20, 0.25·mcap_20) (Q22);
      - buybacks filed only on F + 1, fixed and immutable (Q24);
      - Late promotion has no window until the first filing; unlisted companies cover the sector fund only (Q25);
      - F + 17 confirmed (Q26);
      - clawback safe harbour, always-clawed insider loans, and a lending-risk UI note (Q28);
      - guarantee rate cleaned up (Q30).
      - §13 is extended to Q20–Q30. **Proposed:** Q23 listing-tick snapshot, Q27 quarterly salary-cap reset, Q29 `window.covered` + `windowClosed`, plus the `cap_carry_edge` check.
  - Also: `CompanyPublic.insiderTrades` now carries side, qty and day for founder stock and derivative trades (matches Q18), and `window` is optional.
- **v1.2 addendum 2 (Ledger 2026-10-09):** Ledger accepted all 13 items v1.2 had marked proposed (§13 Q4, Q6–Q16, Q18, Q19) and made two changes:
  - Clawback (§5.3, Q12): the first recipient owes the full amount even if they passed it on. What they hold is collected and the rest is booked as personal debt on that account; a third player is never chased.
  - Insider filing (§6.1, Q18): only the founder's trades in their own stock and its derivatives are filed (side, size, day). Sector-ETF and index trades are window-covered but never filed.
- **v1.2 addendum (2026-10-09), Ledger's answers and Tape's gaps:**
  - Window edges are tick-exact (Q2). `windowClosing` moves to F + 17.
  - The window-close Wire line is founder-only (Q7). Plan disclosure is cut to "a plan exists" plus dates; `CompanyPublic.plans` shrinks to `{ fromDay, toDay }`.
  - §5.2: buybacks are announced programs, in-window only, not plans (Q5).
  - §5.3: the clawback covers payments, not people. It names player loan repayments (Tape gap c) and a salary cap of max($50/gd, 1% TTM rev / 252), and claws back from the recipient (Q12).
  - §6.2: signals split into backed and forward parts. The forward part is capped per weekly signal (v1.4: 1.5%/week) and at 2.5%/quarter and re-anchored at filing, with the faking-cost arithmetic (gap a, break-even L = 2.69% in the worst case; rerun in v1.4: 2.685%).
  - ρ uses the EV-scaled surprise s with m = TTM gross margin (gap b); X2, §11 and §12 #10 are updated to match.
  - New §9.1 `changeCEO` (gap d) with the `ceoExitFreeze` reject code, and new §9.2 pre-attack T0 (gap e). New exploit row N17 (faked forward signals).
  - §5.1 IPO repriced at the latest filing (Q16), and §6.3 player-counterparty income goes to `otherIncome` (Q11).
  - New §12.1 (Ledger answers) and §13 (Answers to Tape Q1–Q19).
- **v1.2 (2026-10-09), Ledger's decision:** the post-close blackout, the `blackoutNotice` event and the reduce-only notice window (`noticeReduceOnly`) are **removed**. They're replaced by (1) an **open trading window** from filing + 2 to filing + 21 trading days (20 of 63 gd), with `placeOrder` refusing `{ code: 'closedWindow', untilDay }` outside it; (2) **scheduled `TradingPlan`s**, committed ≥ 63 gd ahead, immutable, through the shared tally and ADV cap; (3) the founder-only **`windowClosing`** warning 5 trading days before the window shuts, with non-plan covered orders cancelled at close; and (4) Tape checks `window_two_way_edge`, `stacking_rule` (Forge), `closed_window_fills` and `plan_immutable`.
- **v1.1 (2026-10-09):** Ledger's 12 decisions recorded (§12). **ROADMAP §2.1's IPO pricing line** ("an NPC underwriter sets a range of 0.9–1.1 × EV … a single uniform-price auction sets the price") **is replaced** by the engine-set price at 0.9 × V_engine, with the book allocating only. Ledger updates ROADMAP; this spec does not edit it. Also new: sector-ETF blackout on every order, personal guarantees with a UI consequence step, and the post-lockup sell path for founders. T1 merge marked as awaiting Mathis.
- **v1 (2026-10-09):** first spec.
- **v1.3 addendum (2026-10-09, Ledger):** the breach code is renamed `planBarred` → `planBanned { untilDay }` (Velvet's name), and the ban now runs through the end of the **second full company quarter after the breach quarter** instead of a flat 126 gd (breach D700 → lifts after D882 in Velvet's calendar), so breaching early in a quarter gains nothing.
- **v1.3 addendum 2 (2026-10-09, Ledger):** Q23 (listing-tick weight snapshot), Q27 (quarterly salary-cap reset with `salaryCut`) and Q29 (`window.covered` + founder-only `windowClosed`) are **approved as proposed**. `cap_carry_edge` stays a Tape check; if it fails, the fix is a higher weekly forward cap (no new machinery), with new numbers reported to Ledger. *(v1.4: Ledger raised it to 1.5%/week pre-emptively, rule 7.)*
