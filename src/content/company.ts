/**
 * Company building: every tunable number of quant-company-building v1.7 (Phase 4, stage A3). The world code in
 * src/world/company/* reads these and holds no numbers of its own.
 *
 * Units: gd = game day (1 real hour). A quarter is 63 gd, a game year 252 gd, a game week 5 gd. $ are in-game dollars.
 *
 * Settled readings (Ledger rulings and lead decisions, Phase 4):
 * - G22 passing reading (DECISIONS C1): F_s is the unit-variance sector shock (sum of z*sqrt(dt)), and there are no
 *   unobserved working-capital or cost surprises. Under this reading the engine's rho probe passes (median 0.1012,
 *   p90 0.1824). The F_s shock is the engine's sector factor return per day (O-12, src/world/company/sectorFactor.ts): its scale
 *   comes from the engine's tick rate (dt = 1 / (ticksPerDay * daysPerYear)), so there is no sector-shock constant here.
 * - Ledger rulings G15-G23 (spec v1.7 changelog) are all implemented; each knob that they name is marked.
 *
 * Proposals and gaps (numbers the spec does not give, flagged for Ledger and Tape, not settled):
 * - PE_s(macro) and EVS_s are referenced to "01 section 3.1" but have no values in v1.7: `valuation` uses one flat PE and
 *   one flat EVS, and the macro term is 1.
 * - Cost-efficiency gain from Cost projects, the pharma spend factor and the NPC price-cut floor are not in the spec.
 * - Round size is capped at 25% of post-money (spec); the NPC investor pool sizes are sandbox values.
 */

import type { RegimeId } from '@/engine/types';

export type CompanySector = 'tech' | 'health' | 'staples' | 'discretionary' | 'industrials' | 'security';
export type CompanyRole = 'ops' | 'sales' | 'rd' | 'ga';
export type CompanyTierId = 'seed' | 'growth' | 'late';

/** One sector row of §2 (market table) and §3 (R&D), with the engine's stock cycle beta for the sector. */
export interface SectorEcon {
  id: CompanySector;
  /** engine id of the matching stock sector (the spec's first column) */
  label: string;
  /** gross margin at the reference load, §2 table */
  grossMargin: number;
  /** NPC cancellation rate c_s, deterministic per order (v1.6, tunable for Tape) */
  cancelRate: number;
  /** R&D success scale p_s, §3 (pharma uses its gate odds instead) */
  pSuccess: number;
  /** T0_s, base R&D duration in gd at n_RD = n_req (pharma runs 3 gates of 20 gd) */
  rdDays: number;
  /** frontier drift delta_s per gd, §3 */
  frontierDrift: number;
  /** cycle beta from the engine's stock values (staples 0.3, discretionary 1.5 per §2) */
  cycleBeta: number;
  /** §1 input index: 'oil_sqrt' (industrials), 'oil_food' (staples), or none */
  inputIndex: 'oil_sqrt' | 'oil_food' | 'none';
  /** pharma and industrial successes grant a 252 gd patent (§3) */
  patents: boolean;
}

export const SECTORS: Record<CompanySector, SectorEcon> = {
  tech: { id: 'tech', label: 'software', grossMargin: 0.80, cancelRate: 0.02, pSuccess: 0.80, rdDays: 15, frontierDrift: 0.0010, cycleBeta: 1.3, inputIndex: 'none', patents: false },
  health: { id: 'health', label: 'pharma', grossMargin: 0.70, cancelRate: 0.04, pSuccess: 0.29, rdDays: 60, frontierDrift: 0.0002, cycleBeta: 0.4, inputIndex: 'none', patents: true },
  staples: { id: 'staples', label: 'food', grossMargin: 0.35, cancelRate: 0.03, pSuccess: 0.85, rdDays: 10, frontierDrift: 0.0002, cycleBeta: 0.3, inputIndex: 'oil_food', patents: false },
  discretionary: { id: 'discretionary', label: 'consumer goods', grossMargin: 0.45, cancelRate: 0.05, pSuccess: 0.75, rdDays: 15, frontierDrift: 0.0005, cycleBeta: 1.5, inputIndex: 'none', patents: false },
  industrials: { id: 'industrials', label: 'industrial', grossMargin: 0.25, cancelRate: 0.06, pSuccess: 0.70, rdDays: 25, frontierDrift: 0.0003, cycleBeta: 1.1, inputIndex: 'oil_sqrt', patents: true },
  security: { id: 'security', label: 'security services', grossMargin: 0.40, cancelRate: 0.03, pSuccess: 0.80, rdDays: 10, frontierDrift: 0.0005, cycleBeta: 0.2, inputIndex: 'none', patents: false },
};

/** Pharma gate odds (§3): three gates of 20 gd each, p = 0.65 * 0.55 * 0.80 = 0.286 (spec: about 0.29 overall). */
export const PHARMA_GATES = { odds: [0.65, 0.55, 0.80], gateDays: 20 } as const;

export const COMPANY = {
  /** calendar (§0 units) */
  quarterDays: 63,
  yearDays: 252,
  weekDays: 5,
  /** filing day F = period close + 3 gd (§6.1) */
  filingLagDays: 3,
  /** plant and product depreciation: straight line (§1, §4) */
  depreciationDays: 504,
  /** tax (§1) */
  taxRate: 0.20,
  /** working capital in days (§1) */
  dso: 10,
  dio: 15,
  dpo: 12,
  /** the reference "$ per gd" wages (§4) and hiring/ramp timing */
  wages: { ops: 120, sales: 150, rd: 200, ga: 140 } as Record<CompanyRole, number>,
  rampDays: { ops: 5, sales: 10, rd: 21, ga: 5 } as Record<CompanyRole, number>,
  /** a seat takes 3 gd to fill; severance is 21 gd of wages (§4) */
  hireFillDays: 3,
  severanceDays: 21,
  /** a hire needs cash for this many gd of its wages (a proposal: payroll itself is mandatory and may take cash below zero) */
  hireRunwayDays: 5,
  /** capacity: 60 units/gd per productive Ops head times the plant multiplier (§4) */
  unitsPerOpsHead: 60,
  /** orders are booked and shipped up to 115% of capacity (§2 overtime ceiling, G15 booking test) */
  overloadCap: 1.15,
  /** overtime cost per unit above capacity: 1.5 x the Ops wage per unit (1.5 * 120 / 60 = 3.0 $) */
  overtimeMult: 1.5,
  /** G&A: each G&A head supports 12 others; each missing one costs 3% of output (§4) */
  gaSpan: 12,
  gaPenalty: 0.03,
  /** plant levels: cost C0 * 0.10 * 1.18^n, 10 gd to build, multiplier 1 + 0.25 per level (§4, a tunable) */
  plant: { c0: 100_000, costFactor: 0.10, costGrowth: 1.18, buildDays: 10, multPerLevel: 0.25 },
  /**
   * Trading rules the engine enforces (WorldConfig.companyRules; restrictions.ts, programs.ts, companyAssets.ts): the
   * plan lead, the price hold, the plan floor cap, live plans, the window-closing warning, the buyback cap and the tender
   * floor (v1.7 §5.1, §5.2, §6.1, §9.2; G12 for the floor and the hold).
   */
  trading: {
    planLeadDays: 63,
    priceHoldDays: 63,
    planFloorMaxRatio: 0.8,
    planLiveLimit: 2,
    windowClosingDays: 5,
    buybackFloatPerDay: 0.01,
    tenderFloorRatio: 1.2,
  },
  /** headcount caps by tier (§4, §5). Listed companies are unbounded (Infinity). */
  headcountCap: { seed: 25, growth: 250, late: 2_500 } as Record<CompanyTierId, number>,
  /** products allowed per tier (§5). Seed 2; the others are not gated in A3. */
  productCap: { seed: 2, growth: 6, late: 12 } as Record<CompanyTierId, number>,
  /** one R&D project at a time per company (A3 simplification, documented in the world code) */
  rdProjectsAtOnce: 1,
  /** R&D (§3) */
  rd: {
    nReq: 2,
    sRefDays: 20,
    sRefMin: 20_000,
    gain: 0.20,
    kDecay: 0.8,
    zSpread: 0.25,
    /** the display mark a product must reach to read "ready to ship" (the screen threshold, velvet-company-app 14) */
    readyMark: 55,
    /** band shown before launch: p +- 5 points (X15, CB-024) */
    pBand: 0.05,
    /** the cost project gain on unit cost efficiency (a proposal: same form as quality, half size) */
    costGain: 0.10,
    costEffCap: 0.5,
    /** NPC quality closes half of its gap to the leader every 126 gd (§3) */
    imitationHalfLife: 126,
    /** patent length in gd (§3): pauses imitation of the gain */
    patentDays: 252,
  },
  /** quality display (§3, CB-025): qualityScore = clamp(round(80 + 30 * ln(q / Q_f)), 0, 100) */
  qualityScale: { base: 80, slope: 30 },
  /** demand and share (§2) */
  demand: {
    kappaD: 0.5,
    /** regime multipliers on demand (§2) */
    regimeMult: { expansion: 1.0, overheating: 1.04, recovery: 0.97, contraction: 0.90 } as Record<RegimeId, number>,
    /** logit coefficients a, b, c, d and the no-purchase utility u_0 (§2) */
    a: 1.0, b: 0.35, c: 2.0, d: 0.5, u0: 0,
    /** reference price and marketing (per gd): the reference company's list price is $50 (§1) */
    priceRef: 50,
    marketingRef: 1_000,
    /** price band +- 30% of priceRef (§2) */
    priceBand: 0.30,
    /** marketing per product per gd is capped (a proposal: 10 x marketingRef); it is paid only from cash on hand */
    marketingMax: 10_000,
    /** distribution: a base level plus 0.1 * ln(1 + sales heads) (§4); levels 1..5 come with Expansion (not in A3) */
    distBase: 1,
    distSalesWeight: 0.1,
    /** brand: -0.02 per stockout day, recovering at 0.01 per gd (§4) */
    brandStockout: 0.02,
    brandRecover: 0.01,
    /**
     * The demand scale D0 per market (sector), calibrated so the reference Seed company ($150k, 10 heads, one product at
     * $50) earns about the Seed yield of 1.90%/gd of capital (section 7). Measured with scripts/balance/company-calibrate.ts
     * at 16-24 seeds, 252 gd, by linear interpolation between 600 and 1200 (industrials and staples: wider). The spread
     * across sectors is the margin structure: a high-margin sector needs less volume for the same yield.
     */
    d0BySector: { tech: 790, health: 1000, staples: 1750, discretionary: 1340, industrials: 2100, security: 1600 } as Record<CompanySector, number>,
    // the sector shock F_s is the engine's sector factor return: the sum of its per-tick sector draws over the day, on the G22
    // unit reading (z * sqrt(dt), dt = 1 / (ticksPerDay * daysPerYear)). Quarterly sd of ln demand is then kappaD * sqrt(63/252)
    // = 0.25. There is no sector-shock constant: O-12 (V1-PHASE9 9C.3) replaced the old per-company scale and stream.
  },
  /** NPC competitors (§2): 3-5 per market, weekly reaction, quarterly entry and exit */
  npc: {
    minCount: 3,
    maxCount: 5,
    /** reaction when the player's share is above 25%: price cut up to 8% per week, marketing +20% */
    reactShare: 0.25,
    reactPriceCut: 0.08,
    reactMarketing: 0.20,
    /** NPC prices never fall below 70% of priceRef (a proposal: the spec's +-30% bound) */
    priceFloor: 0.70,
    /** exit after 2 quarters of negative margin (§2) */
    exitQuarters: 2,
    /** entry per quarter 0.25 * max(0, sector margin - 10%) / 10%, capped at 0.6 (§2) */
    entryBase: 0.25,
    entryMarginFloor: 0.10,
    entryMarginStep: 0.10,
    entryCap: 0.6,
    /** the NPC population cap (a sandbox bound; the spec does not give one) */
    maxNpcs: 8,
    /** antitrust: share above 60% for 2 quarters triggers a review (§2; the mechanic lives in B) */
    antitrustShare: 0.60,
    antitrustQuarters: 2,
    /** NPC seeded quality spread (ln) and marketing (per gd) */
    qualitySpread: 0.15,
    marketingBase: 600,
  },
  /** signals (§6.2) */
  signals: {
    /** noise sd: backlog 0.04, shipped revenue 0.02, drawn once per filing (G20) */
    sigBacklog: 0.04,
    sigRevenue: 0.02,
    /** band half widths: shipped revenue QTD +-5%, backlog and CB +-10%, run rate +-5% */
    bandRevenue: 0.05,
    bandBacklog: 0.10,
    bandRunRate: 0.05,
    /** the weekly cap (dormant after G18): 1.5% per signal, 2.5% one-signal hold (§6.2) */
    forwardCap: 0.015,
    holdCap: 0.025,
    /** weekly signals are kept per company */
    keep: 13,
  },
  /** utilization bands (signal text): < 60, 60-85, 85-100, > 100% (§6.2) */
  utilBands: [0.60, 0.85, 1.00],
  /** headcount bands (§6.2) */
  headcountBands: [10, 50, 200, 1_000, 5_000] as const,
  /** consensus and valuation (§5, §6.4) */
  valuation: {
    /** P/E and EV/sales (proposals, see the file header) */
    pe: 14,
    evs: 2.0,
    gamma: 0.5,
    /** w_b, the backlog weight (0.5; the 0.25 contingency is named below, not the default) */
    wb: 0.5,
    wbFallback: 0.25,
    /** m clipped to [0.10, 0.90]; g clipped to [-50%, +100%] */
    mClip: [0.10, 0.90] as const,
    gClip: [-0.5, 1.0] as const,
    /** C: guidance credibility starts at 0.5 and the multiplier is 0.85 + 0.15 C (§5) */
    cInit: 0.5,
    cBase: 0.85,
    cSlope: 0.15,
    /** a private mark annualizes the quarter's run rate only after this many gd of trading (a proposal; see privateInputs) */
    privateMarkDays: 21,
  },
  /** private rounds (§5, X12, N9): NPC investors only, at 0.70 * V_engine, at most 25% of post-money */
  rounds: {
    priceFactor: 0.70,
    maxPostMoneyShare: 0.25,
    /** the seed round (Seed tier) and the series round (Growth and Late) are the two investor types */
    investorCash: { seed: 5_000_000, series: 50_000_000, bank: 20_000_000 } as Record<InvestorKind, number>,
  },
  /** the private mark of a company counted in its owner's net worth (spec 5.1): 0.85 x V x ownership */
  netWorth: { privateHaircut: 0.85 },
  /** founding (§5 Seed tier; C4 founder template): R2 owner, at least $100k of founder equity */
  founding: {
    minRank: 'R2',
    minEquity: 100_000,
    capital: 150_000,
    /** founder shares at founding (ownership is shares; the founder holds all of them until a round) */
    founderShares: 1_000_000,
    /** founder template: 5 Ops, 2 Sales, 2 R&D, 1 G&A (§1 reference Seed company) */
    heads: { ops: 5, sales: 2, rd: 2, ga: 1 } as Record<CompanyRole, number>,
    /** one product at $50, quality 1 (Q_f starts at 1) */
    productPrice: 50,
    productName: 'Flagship',
    sector: 'tech' as CompanySector,
  },
  /** tier entry rules, on the company's frozen quarterly statements (§5, see the Seed/Growth note in the world code) */
  tiers: {
    growth: { revenueLast2: 1_000_000 },
    late: { revenueLast4: 15_000_000, profitableOfLast4: 2 },
  },
  /** the first goals of the founder template (C4): reachable, each with a threshold */
  goals: {
    firstRevenue: 5_000,
    firstRoundAmount: 25_000,
  },
  /** IPO (B1, quant v1.7 section 5.1, decided by Ledger §12 #2, #3, #9, Q16, Q19): price at 0.9 x V_engine, float 15-49% */
  ipo: {
    /** P_IPO = (1 - discount) * V_engine / shares_post */
    discount: 0.10,
    floatMin: 0.15,
    floatMax: 0.49,
    /** a buyer takes at most this share of the float (N8) */
    allocCapOfFloat: 0.05,
    /** accounts younger than this many game days are not allocated (N8) */
    minAccountAgeDays: 7,
    /** founder shares are locked this long from listing (§5.1) */
    lockupDays: 168,
    /** filed quarters before an IPO can be requested (§5) */
    minFiledQuarters: 3,
    /** engine equity value floor (§5) */
    minValue: 50_000_000,
    /** the owner's rank floor (Ledger §12 #2: R3+) */
    minRank: 'R3',
    /** a conviction within this many game days blocks the IPO (no S4+ conviction in 8 weeks) */
    convictionDays: 56,
    /** the book is one game day: request on day D, list at the start of D + 1 (§5.1, shown 1 gd ahead) */
    bookDays: 1,
    /** ADV at listing is 0.8% of the float market cap, decaying to 0.4% (half-life 21 gd) */
    advAtListing: 0.008,
    advFloor: 0.004,
    advHalfLifeDays: 21,
    /** spread = clamp(25 + 2000 / sqrt(floatCap / $1M), 25, 200) bps */
    spreadBase: 25,
    spreadScale: 2000,
    spreadMin: 25,
    spreadMax: 200,
    /** the sector peer's vol times (1 + 0.5 * max(0, 1 - floatCap / $500M)) */
    volSmallCapSlope: 0.5,
    volSmallCapRef: 500_000_000,
    /** the underwriting fee on the gross IPO proceeds (the float at the IPO price): a sink, paid out of the company's receipts (§5.1) */
    underwritingFee: 0.05,
  },
  /** owner and insider rules (§6.1, §5.1, §9.1): the insider roster, the trading window and the owner's sell cap */
  insiders: {
    /** an account holding at least this share of the shares outstanding is an insider (§6.1) */
    holderPct: 0.10,
    /** the window opens on F + windowOpenDay and closes after F + windowCloseDay (Ledger Q2) */
    windowOpenDay: 2,
    windowCloseDay: 21,
    /** the founder's sell cap: 2% of shares outstanding a game day after the lockup (§5.1, documented as a commit-time check) */
    sellCapPct: 0.02,
  },
  /** debt, covenants and guarantees (B1, §5 Growth and Late tiers, §5.3 covenants, §5 buyback leverage, Ledger §12 #8, #12) */
  debt: {
    /** bank rate per game day on principal (about 12.6% a game year); priced relative to company yields (Ledger §12 #12) */
    ratePerDay: 0.0005,
    /** a personal guarantee lowers the rate to 75% of r_debt (Ledger §12 #8) */
    guaranteedFactor: 0.75,
    /** covenants (quant v1.7 knobs): net debt / TTM EBITDA at most 3.5x, EBITDA / TTM interest at least 2.0x, 21 gd cure */
    maxLeverage: 3.5,
    minInterestCover: 2.0,
    cureDays: 21,
    /** a liquidity cure: cash below zero with a facility drawn, for five game days, then default if not cured (spec §5; O-7) */
    liquidityCureDays: 5,
    /** buybacks: net debt / EBITDA after the buyback at most 2.5x (§5.2) */
    buybackMaxLeverage: 2.5,
    /** the tier a loan needs: revolver from Growth, term loans from Late (§5) */
    loanMinTier: 'growth',
    /** a buyback reserves this share above the current price, so the market buys can clear */
    buybackReserve: 1.10,
    /** a covenant breach in cure adds this rate to the daily rate while the cure is open (§5, +0.05%/gd) */
    cureRatePerDay: 0.0005,
  },
  /** dividends (§5.3): retained earnings, cash for 21 gd of costs, covenants and TTM FCF */
  dividends: {
    cashCoverDays: 21,
  },
  /** trading programs (B1, §5.2, §6.1): buyback filing day and the plan limits the engine enforces */
  programs: {
    /** buybacks file only on F + 1 (Ledger v1.3, Q24) */
    buybackFilingOffset: 1,
    /** a buyback's shares a game day cap: 1% of float (ROADMAP §2.1, §5.2) */
    buybackFloatPerDay: 0.01,
    /** a plan's minimum sell price is set in the engine (commit-day close, 0.8 cap) */
    planLimit: 2,
  },
  /**
   * Founder goal rewards (B2, C4): cash paid into the company when a goal is reached, booked as world money (a faucet).
   * A proposal: small enough that the goals are a starting path, not a second income.
   */
  goalRewards: { firstHire: 2_000, firstRevenue: 5_000, breakEven: 10_000, firstRound: 5_000 } as Record<'firstHire' | 'firstRevenue' | 'breakEven' | 'firstRound', number>,
  /**
   * Governance (B2, spec 9.1 for the CEO; C4 for executives and the board). CEO: a public notice of 10 gd, a freeze of 21 gd
   * after it, and a 252 gd cooling before the ex-CEO can return. Executives: salary per gd by role (a proposal), a minimum
   * term, and severance in days of salary. Each trait moves one coefficient by its size (5 to 10%; the signs are the
   * effect): Operator capacity, Visionary R&D effort, Cost-cutter wages, Rainmaker demand, Steady NPC cancellations.
   */
  governance: {
    ceo: { noticeDays: 10, exitFreezeDays: 21, cooldownDays: 252 },
    exec: {
      salary: { CEO: 400, CFO: 300, COO: 300, CTO: 300 } as Record<'CEO' | 'CFO' | 'COO' | 'CTO', number>,
      termDays: 63,
      severanceDays: 21,
      traits: {
        Operator: { key: 'capacity', size: 0.08 },
        Visionary: { key: 'rd', size: 0.10 },
        'Cost-cutter': { key: 'wages', size: -0.06 },
        Rainmaker: { key: 'demand', size: 0.07 },
        Steady: { key: 'cancel', size: -0.05 },
      } as Record<'Operator' | 'Visionary' | 'Cost-cutter' | 'Rainmaker' | 'Steady', { key: 'capacity' | 'rd' | 'wages' | 'demand' | 'cancel'; size: number }>,
    },
    /** a dilutive round above this share of the post-round shares needs a board vote (C4) */
    dilutionVoteShare: 0.20,
    /** a personal guarantee of company debt may not exceed this share of the founder's net worth at signing */
    guaranteeMaxShare: 0.5,
  },
  /**
   * Failure and clawbacks (B2, spec 5.3 and 9): default after this many consecutive game days of negative cash. The
   * lookback is 63 gd (inclusive at 63), and terms signed 64 gd or more before the default are safe for ordinary
   * contracts. Recovery is the liquidator's realization rate on book assets, clamped to 20% to 60% (per sector, a proposal).
   * Clawbacks leave the first recipient at least the court floor. Salaries above max(50 $/gd, 1% of TTM revenue / 252) are
   * covered for the excess only.
   */
  failure: {
    defaultDays: 21,
    clawbackLookbackDays: 63,
    safeHarbourDays: 64,
    recovery: { tech: 0.35, health: 0.45, staples: 0.40, discretionary: 0.30, industrials: 0.50, security: 0.40 } as Record<CompanySector, number>,
    recoveryMin: 0.20,
    recoveryMax: 0.60,
    floor: 5_000,
    salaryCapFloor: 50,
    salaryCapRevenueShare: 0.01,
    /** surveillance points (the insider backstop): a related-party price outside the band, a closed-window attempt, a plan abuse */
    insiderPoints: { relatedOutOfBand: 30, windowAttempt: 15, planAbuse: 20 },
    /** the backstop opens a case with these odds per point of evidence, capped at 60% per case (spec 6.2) */
    insiderOddsPerPoint: 0.01,
    insiderOddsCap: 0.6,
    /** the evidence a case needs before the backstop can act (the civil bar) */
    insiderBar: 40,
    /** an account holding at least this share of the company's shares is an insider (spec 5.3) */
    insiderStake: 0.10,
  },
  /**
   * Contracts with player accounts (B2, spec 5.3 covered payments, 6.3): a contractor's fee and a loan from a player each
   * run for `termDays`. A loan is repaid in equal daily amounts over the term. `marketPerDay` is the market day rate of a
   * contractor (a proposal: the band of supply.band applies to it, spec 6.3). `minLoan` is the smallest loan (a proposal).
   */
  contract: { termDays: 126, marketPerDay: 300, minLoan: 1_000 },
  /** Franchising (B2, C4): a licence to an NPC operator for a 4 to 8% royalty on its revenue; at most 3 per sector. */
  franchise: {
    rateMin: 0.04,
    rateMax: 0.08,
    capPerSector: 3,
    /** the operator's sales as a share of the brand's own revenue per gd, at least the floor (proposals) */
    operatorShare: 0.5,
    operatorFloorPerDay: 1_000,
  },
  /** Supply deals (B2, C4 and spec 6.3): priced within this band of the market reference, or blocked with surveillance */
  supply: { band: 0.10, maxUnitsPerDay: 500 },
  /** Takeovers (B2, spec 9.2): T0 is 63 gd before the announcement at the latest; the floor is VWAP over 30 closed gd ending T0 - 1 */
  takeover: { preAttackDays: 63, vwapDays: 30, floorRatio: 1.2, bigSellShare: 0.005 },
} as const;

/** Money-conservation sizes for the NPC investor pools, kept in the content so the world seeds them */
export const INVESTOR_KINDS = ['seed', 'series', 'bank'] as const;
export type InvestorKind = (typeof INVESTOR_KINDS)[number];
