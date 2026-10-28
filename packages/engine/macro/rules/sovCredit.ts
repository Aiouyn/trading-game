// T04-07 sovereign credit (04 §3.11.1–§3.11.4): pure parts, then stepSovereignCredit / igExclusionCheck (store + ports).
// exp / ln / pow via dmath (G8). BlocIds: FU = FDL, NA = NKR (BLOC_DEFAULTS conv FDL 0.002, NKR 0.0005).
import { dmath, MICRO_N, nextTradingDay, TICKS_PER_GAME_DAY, type PhaseCtx, type Qty } from '@tycoon/engine-core';
import { cbkId, govId, ROW_ID } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type CentralBank, type CurveState, type DailyHistoryRow, type FxState, type GlobalMacroState, type HookCall,
  type SovereignCreditState } from '../schema';
import { concordActive } from './concord';
import { ruleBreachPremium } from './programs';
import { blocRow } from './sovCase';
import { shockValueAt } from './trade';

export const GRADES = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC', 'CC', 'C', 'D'] as const;

export interface HazardInputs { b: BlocId; debtGdp: number; dStar: number; rEff: number; gPot: number; target: number; primaryBalanceGdp: number;
  fxDebtShare: number; depVsFdlYoy: number; reserveCoverMonths: number; fxRegime: FxState['regime']; fear: number; politicalStability: number;
  failedAuctions21d: number; coreInflation: number }

const LAMBDA_MIN = 1e-5, LAMBDA_MAX = 0.60, DISTRESS = 0.08;

/** z1..z8 unclamped, in order (§3.11.1). */
export function hazardZ(x: HazardInputs): number[] {
  const gNom = x.gPot + x.target, pbGap = (x.rEff - gNom) * x.debtGdp - x.primaryBalanceGdp;
  const reserveRegime = x.fxRegime === 'MANAGED_FLOAT' || x.fxRegime === 'MANAGED_BAND' || x.fxRegime === 'HARD_PEG';
  return [
    (x.debtGdp - x.dStar) / 0.40,
    pbGap / 0.03,
    x.fxDebtShare * Math.max(0, x.depVsFdlYoy) / 0.10,
    reserveRegime ? Math.max(0, (6 - x.reserveCoverMonths) / 3) : 0,
    (x.fear - 50) / 25,
    (0.5 - x.politicalStability) / 0.25,
    x.failedAuctions21d,
    Math.max(0, x.coreInflation - x.target) / 0.05,
  ];
}

/** [1.2, 0.8, 1.0, 0.6, w5, 0.5, 0.7, 0.3], w5 = FU −0.2, NA −0.1, else 0.4. */
export function hazardWeights(b: BlocId): number[] {
  return [1.2, 0.8, 1.0, 0.6, b === 'FDL' ? -0.2 : b === 'NKR' ? -0.1 : 0.4, 0.5, 0.7, 0.3];
}

/** λ_raw = clamp(λ0·exp(Σ w_k·clamp(z_k, −3, 4)), 1e−5, 0.60); FU cap 0.02, NA cap 0.03; then Concord × 0.6, POST_RESTRUCTURING
 *  floor 0.08·2^(−days/182), shock multiplier last, re-clamped to [1e−5, 0.60]. */
export function hazardRaw(lambda0: number, z: number[], w: number[], b: BlocId, mods: { concordActive: boolean; postRestructuringDays: number | null; shockMult: number }): number {
  let s = 0;
  for (let k = 0; k < z.length; k++) s += w[k]! * dmath.clamp(z[k]!, -3, 4);
  let l = dmath.clamp(lambda0 * dmath.exp(s), LAMBDA_MIN, LAMBDA_MAX);
  if (b === 'FDL') l = Math.min(l, 0.02); else if (b === 'NKR') l = Math.min(l, 0.03);
  if (mods.concordActive) l *= 0.6;
  if (mods.postRestructuringDays !== null) l = Math.max(l, 0.08 * dmath.pow(2, -mods.postRestructuringDays / 182));
  return dmath.clamp(l * mods.shockMult, LAMBDA_MIN, LAMBDA_MAX);
}

/** 5-day half-life λ ← λ + (λ_raw − λ)(1 − 2^(−1/5)); on a shock trigger day λ = λ_raw. */
export function stepHazard(lambda: number, lambdaRaw: number, shockTriggeredToday: boolean): number {
  return shockTriggeredToday ? lambdaRaw : lambda + (lambdaRaw - lambda) * (1 - dmath.pow(2, -1 / 5));
}

/** clamp(ln(λ/λ0)/ln 50, 0, 1). */
export function stressIndexOf(lambda: number, lambda0: number): number {
  return dmath.clamp(dmath.ln(lambda / lambda0) / dmath.ln(50), 0, 1);
}

/** Normal 0.6 + 0.4·min(1, τ/5); distress (λ > 0.08) 1.3 − 0.3·min(1, τ/5). */
export function hTerm(tau: number, lambda: number): number {
  const m = Math.min(1, tau / 5);
  return lambda > DISTRESS ? 1.3 - 0.3 * m : 0.6 + 0.4 * m;
}

/** LGD·λ·h(τ). */
export function sovSpread(tau: number, lambda: number, lgd: number): number { return lgd * lambda * hTerm(tau, lambda); }

/** 1 − e^(−λ·T·h(T)). */
export function pdAt(T: number, lambda: number): number { return 1 - dmath.exp(-lambda * T * hTerm(T, lambda)); }

/** FU 0 + breach premium; else 0.001(1 + 2(1 − depth)) + breach. */
export function liquidityPremium(b: BlocId, depthIndex: number, ruleBreachPremium: number): number {
  return b === 'FDL' ? ruleBreachPremium : 0.001 * (1 + 2 * (1 - depthIndex)) + ruleBreachPremium;
}

/** §3.11.3 market-implied λ = s / (LGD·h(τ)) (exploit 8: never feeds λ, triggers or the curve). τ is 5 (CDS) or 10 (bond), where h = 1 in both
 *  the normal and the distress shape, so λ = s / LGD. CDS takes precedence when listed with adv ≥ the on-the-run 10y line's adv (or no line adv);
 *  else from y10Mkt; neither → null. */
export function marketHazard(y10Mkt: number | null, ois10: number, tp10: number, liq: number, conv: number, lgd: number, cds: { spread5y: number; adv: number } | null, bondAdv: number | null): number | null {
  if (cds !== null && (bondAdv === null || cds.adv >= bondAdv)) return cds.spread5y / lgd;
  if (y10Mkt === null) return null;
  return Math.max(0, y10Mkt - ois10 - tp10 - liq + conv) / lgd;
}

const gradeIndex = (g: string): number => (GRADES as readonly string[]).indexOf(g);
const BBB_MINUS = gradeIndex('BBB-');

/** Two of three agencies at BBB- or better (unknown grades never count). */
export function isInvestmentGrade(grades: string[]): boolean {
  let n = 0;
  for (const g of grades) { const i = gradeIndex(g); if (i >= 0 && i <= BBB_MINUS) n++; }
  return n >= 2;
}

/** The grade of the second-best agency (collateral grade, §3.8.3); null with fewer than two known grades. */
export function lowestOfTwoBest(grades: string[]): string | null {
  const idx: number[] = [];
  for (const g of grades) { const i = gradeIndex(g); if (i >= 0) idx.push(i); }
  if (idx.length < 2) return null;
  idx.sort((a, c) => a - c);
  return GRADES[idx[1]!]!;
}

const D = TICKS_PER_GAME_DAY, LGD = 0.6 /* macro_sov_lgd (E-100) */, LOT: Qty = 1000n * MICRO_N, SELL_DAYS = 10;
const elastic = (e: string): boolean => e.startsWith('hh_') || e.startsWith('frm_') || e === ROW_ID;

/** §3.11.4: on yesterday's IG flag true → today false, one MANDATE_SELL hook for 05: per line 25% of the elastic sectors' (hh, frm, row)
 *  committed holdings floored to 1,000-face lots, 10 equal daily lot amounts (remainder lots on day 1) from the next trading day.
 *  qtyPerDay is row-major: assetIds[i]'s 10 amounts at [10i, 10i + 9] (micro-units as strings). Else null. */
export function igExclusionCheck(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): HookCall | null {
  const s = ctx.store, gov = govId(b), bloc = blocRow(s, b);
  if (bloc.sovereign.investmentGrade !== true || isInvestmentGrade(ports.funds.sovereignGrades(s, gov))) return null;
  const assetIds: string[] = [], qtyPerDay: string[] = [];
  for (const l of ports.assets.sovereignLines(s, gov)) {
    let held = 0n;
    for (const a of ctx.ledger.accountsOfAsset(l.assetId)) if (elastic(a.entityId)) held += ctx.ledger.committedQty(a.key);
    const lots = held / 4n / LOT;
    if (lots === 0n) continue;
    assetIds.push(l.assetId);
    for (let d = 0; d < SELL_DAYS; d++) qtyPerDay.push(String((lots / 10n + (d === 0 ? lots % 10n : 0n)) * LOT));
  }
  const tick = ctx.tick, h: HookCall = { id: ctx.newId('hook'), owner: '05', hook: 'MANDATE_SELL',
    args: { govId: gov, assetIds, qtyPerDay, tradingDays: SELL_DAYS, startDay: nextTradingDay(b, Math.floor(tick / D)) }, worldEventId: '', createdTick: tick, startTick: tick + 1 };
  s.put<HookCall>(macroTables.hookCall.name, h);
  return h;
}

const hist = (ctx: PhaseCtx, b: BlocId, d: number): DailyHistoryRow | undefined => ctx.store.get<DailyHistoryRow>(macroTables.history.name, `${b}:${d}`);
/** Sample stdev of the headline yoy values cpi(d)/cpi(d − 364) − 1 for the last 364 days where both rows exist (history keeps 400 days); 0 below 2. */
function inflationVol(ctx: PhaseCtx, b: BlocId, today: number): number {
  const ys: number[] = [];
  for (let d = today - 363; d <= today; d++) { const a = hist(ctx, b, d), c = hist(ctx, b, d - 364); if (a && c && c.cpiLevel > 0) ys.push(a.cpiLevel / c.cpiLevel - 1); }
  if (ys.length < 2) return 0;
  let m = 0; for (const y of ys) m += y; m /= ys.length;
  let v = 0; for (const y of ys) v += (y - m) * (y - m);
  return Math.sqrt(v / (ys.length - 1));
}

/** Day close (§3.11.1–§3.11.4, steps 9–13): λ_raw from the eight z's, modifiers, smoothing, stress, spreads and PDs, liquidity and convenience,
 *  market PD (never feeds λ: exploit 8), rating inputs, then the IG cliff check; writes the bloc's SovereignCreditState. */
export function stepSovereignCredit(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): SovereignCreditState {
  const s = ctx.store, tick = ctx.tick, today = Math.floor(tick / D), gov = govId(b), d0 = BLOC_DEFAULTS[b], bloc = blocRow(s, b), sv = bloc.sovereign, f = bloc.fiscal;
  const g = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL'), cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b));
  const lines = ports.assets.sovereignLines(s, gov);
  let face = 0, cw = 0;
  for (const l of lines) { const q = Number(l.faceOutstanding); face += q; cw += q * l.couponRate; }
  const fxDebtShare = f.debt > 0n ? Number(f.fxDebt) / Number(f.debt) : 0;
  const now = hist(ctx, b, today - 1), ago = hist(ctx, b, today - 365);
  const politicalStability = ports.world.politicalStability(s, b) ?? sv.ratingInputs?.politicalStability ?? 0.5;
  const z = hazardZ({ b, debtGdp: f.debtGdp, dStar: d0.debtReference, rEff: face > 0 ? cw / face : d0.initialPolicyRate, gPot: bloc.potentialGrowth, target: d0.inflationTarget,
    primaryBalanceGdp: f.primaryBalanceGdp, fxDebtShare, depVsFdlYoy: now && ago && now.spotVsFdl > 0 ? ago.spotVsFdl / now.spotVsFdl - 1 : 0,
    reserveCoverMonths: bloc.fx.reserveCoverMonths, fxRegime: bloc.fx.regime, fear: g?.fearIndex ?? 50, politicalStability, failedAuctions21d: sv.failedAuctions21d, coreInflation: bloc.coreInflation });
  let mult = 1, trig = false;
  for (const sh of bloc.shocks) if (sh.target === 'lambda_raw_mult') { const v = shockValueAt(sh, tick); if (v !== 0) mult *= v; if (Math.floor(sh.startTick / D) === today) trig = true; }
  const post = sv.status === 'POST_RESTRUCTURING' ? Math.floor((tick - (sv.defaultCase?.resolvedTick ?? tick)) / D) : null;
  const raw = hazardRaw(d0.sovereignBaseHazard, z, hazardWeights(b), b, { concordActive: concordActive(s, b), postRestructuringDays: post, shockMult: mult });
  const lambda = stepHazard(sv.hazard, raw, trig), depthIndex = ports.markets.bondDepthIndex(s, b, false) ?? sv.depthIndex ?? 1;
  const liq = liquidityPremium(b, depthIndex, ruleBreachPremium(s, b, tick)), conv = d0.conv, modelPd1y = pdAt(1, lambda);
  const curve = s.get<CurveState>(macroTables.curve.name, b), otr = lines.find((l) => l.onTheRun && l.tenor === 'N10Y');
  const lm = curve ? marketHazard(otr ? ports.markets.lineYield(s, otr.assetId) : null, curve.ois[5]!.yield, curve.tp10, liq, conv, LGD, ports.assets.sovCds(s, gov),
    otr ? ports.markets.lineAdv(s, otr.assetId) : null) : null;
  const next: SovereignCreditState = { ...sv, hazard: lambda, pd1y: modelPd1y, pd5y: pdAt(5, lambda), spread10y: sovSpread(10, lambda, LGD), liquidityPremium: liq,
    convenienceYield: conv, stressIndex: stressIndexOf(lambda, d0.sovereignBaseHazard), depthIndex,
    ratingInputs: { govId: gov, tick, debtGdp: f.debtGdp, interestRevenue: f.revenueGdp > 0 ? f.interestGdp / f.revenueGdp : 0, primaryBalanceGdp: f.primaryBalanceGdp,
      realGrowthTrend: bloc.potentialGrowth, inflationVol: inflationVol(ctx, b, today), reserveCoverMonths: bloc.fx.reserveCoverMonths, fxDebtShare,
      cbCredibility: cb?.credibility ?? 0, politicalStability, marketPd1y: lm === null ? modelPd1y : pdAt(1, lm), modelPd1y } };
  s.put(macroTables.bloc.name, { ...bloc, sovereign: next });
  igExclusionCheck(ctx, b, ports);
  const out: SovereignCreditState = { ...next, investmentGrade: isInvestmentGrade(ports.funds.sovereignGrades(s, gov)) };
  s.put(macroTables.bloc.name, { ...bloc, sovereign: out });
  return out;
}
