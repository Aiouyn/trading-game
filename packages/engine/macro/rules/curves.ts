// T04-07 (04 §3.7) curves: market belief ĥ, expected path, OIS, term premium, government curve and NS fits, breakevens, basis, and
// recomputeCurve (reads mac.* rows, upserts mac.curve and the curve block of mac.public_view). No randomness.
import { cbkId } from '@tycoon/engine-ledger';
import { dmath, EngineFault, type ParamsView, type PhaseCtx, type Tick } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { macroTables, type BlocId, type BlocMacroState, type CentralBank, type CurvePoint, type CurveState, type GlobalMacroState,
  type PublicMacroView, type SovereignCreditState } from '../schema';
import { coeffsFromHawk, publishedData, ruleRate, type PublishedData } from './cb';
import { dots } from './guidance';
import { nsFit } from './nelsonSiegel';
import { sovSpread } from './sovCredit';
import { swapLineActive } from './swapLines';
import { activeShockSum } from './shocks';

export const CURVE_NODES = Object.freeze([0.25, 0.5, 1, 2, 5, 10, 30] as const);
type Path = Record<1 | 2 | 4 | 8, number>;

export function nInfinity(rStarCb: number, piE5: number): number { return rStarCb + piE5; }

/** f(s): linear through (0,i), (0.25,E1), (0.5,E2), (1,E4), (2,E8); beyond 2: nInf + (E8 − nInf)·2^(−(s−2)/2). */
export function forwardRate(s: number, i: number, E: Path, nInf: number): number {
  const xs = [0, 0.25, 0.5, 1, 2], ys = [i, E[1], E[2], E[4], E[8]];
  if (s > 2) return nInf + (E[8] - nInf) * dmath.pow(2, -(s - 2) / 2);
  for (let k = 1; k < xs.length; k++) if (s <= xs[k]!) return ys[k - 1]! + ((ys[k]! - ys[k - 1]!) * (s - xs[k - 1]!)) / (xs[k]! - xs[k - 1]!);
  return E[8];
}

/** (1/τ)∫₀^τ f, trapezoid on the k/52 grid; a τ below one grid step (overnight) uses the single trapezoid [0, τ]. */
export function oisZero(tau: number, i: number, E: Path, nInf: number): number {
  const n = Math.floor(tau * 52 + 1e-9);
  if (n === 0) return (forwardRate(0, i, E, nInf) + forwardRate(tau, i, E, nInf)) / 2;
  let sum = 0;
  for (let k = 0; k < n; k++) sum += (forwardRate(k / 52, i, E, nInf) + forwardRate((k + 1) / 52, i, E, nInf)) / 2 / 52;
  return sum / tau;
}

export interface TermPremiumInputs { b: BlocId; piE5: number; target: number; debtGdp: number; dStar: number; qeHoldingsGdp: number; fear: number; shockSum: number }
/** tpBase + 0.25·|π_e5 − π*| + 0.15·(debt − d*)/0.5·0.01 − 0.00025·(qe/0.01) + tpFear·(F − 50)/10 + shockSum, clamp [−0.01, 0.04]. */
export function termPremium10(x: TermPremiumInputs): number {
  const d = BLOC_DEFAULTS[x.b];
  const tp = d.tpBase + 0.25 * (Math.abs(x.piE5 - x.target) / 0.01) * 0.01 + 0.15 * ((x.debtGdp - x.dStar) / 0.5) * 0.01
    - 0.00025 * (x.qeHoldingsGdp / 0.01) + (d.tpFear * (x.fear - 50)) / 10 + x.shockSum;
  return Math.min(0.04, Math.max(-0.01, tp));
}
export function termPremiumAt(tp10: number, tau: number): number { return (tp10 * (1 - dmath.exp(-tau / 4))) / (1 - dmath.exp(-2.5)); }

export function breakevenAt(tau: number, piE1: number, piE5: number, irp: number): number {
  const be10 = 0.6 * piE5 + 0.4 * piE1 + irp;
  if (tau <= 1) return piE1;
  return tau <= 10 ? piE1 + ((be10 - piE1) * (tau - 1)) / 9 : be10;
}

/** EUN/PYN/NKR −(0.0005 + 0.006·max(0, FSI − 0.3)); SRL −(0.003 + 0.015·FSI); FDL 0; an active swap line floors it at −0.0025. */
export function crossCurrencyBasis(b: BlocId, fsi: number, swapLineActive: boolean): number {
  if (b === 'FDL') return 0;
  const raw = b === 'SRL' ? -(0.003 + 0.015 * fsi) : -(0.0005 + 0.006 * Math.max(0, fsi - 0.3));
  return swapLineActive ? Math.max(raw, -0.0025) : raw;
}

export type CurveRecomputeReason = 'RELEASE' | 'CB_GUIDANCE' | 'CB_DECISION' | 'CB_MINUTES' | 'RATING_ACTION' | 'FX_REGIME' | 'DAY_CLOSE' | 'GENESIS';
type Dot = { horizonQuarters: 1 | 2 | 4 | 8; rate: number };
/** macro_ns_lambda 1.8, macro_irp 0.002, macro_sov_lgd 0.6 (E-100; the T23 param rows are not registered yet). */
export const NS_LAMBDA = 1.8, IRP = 0.002, SOV_LGD = 0.6;

/** g(h) = iPrev + ρ(i*(h) − iPrev) − iNew; opposite signs at 0 and 1 (or a zero) → 40 halvings, the final midpoint; else the endpoint
 *  with the smaller |g| (0 on ties). */
export function impliedHawk(iPrev: number, iNew: number, rStarCb: number, d: PublishedData, target: number, nairu: number, b: BlocId,
  mandate: CentralBank['mandate'], p: ParamsView): number {
  const g = (h: number): number => { const c = coeffsFromHawk(b, h, mandate, p); return iPrev + c.rho * (ruleRate(rStarCb, d, target, nairu, b, c).iStar - iPrev) - iNew; };
  let lo = 0, hi = 1, glo = g(0);
  const ghi = g(1);
  if (glo * ghi > 0) return Math.abs(ghi) < Math.abs(glo) ? 1 : 0;
  for (let k = 0; k < 40; k++) {
    const m = (lo + hi) / 2, gm = g(m);
    if (glo * gm <= 0) hi = m; else { lo = m; glo = gm; }
  }
  return (lo + hi) / 2;
}
export function stepHHat(hHat: number, hawkImplied: number): number { return hHat + 0.2 * (hawkImplied - hHat); }
/** E_h = cred·dots_h + (1 − cred)·model_h, h ∈ {1, 2, 4, 8}; a horizon missing on one side takes the other's rate. */
export function marketPath(cred: number, dotsPath: Dot[], modelPath: Dot[]): Dot[] {
  return ([1, 2, 4, 8] as const).map((h) => {
    const dd = dotsPath.find((x) => x.horizonQuarters === h)?.rate, mm = modelPath.find((x) => x.horizonQuarters === h)?.rate;
    const dv = dd ?? mm, mv = mm ?? dd;
    if (dv === undefined || mv === undefined) throw new EngineFault('MAC_STATE_MISSING', `marketPath: no rate at ${h}q`);
    return { horizonQuarters: h, rate: cred * dv + (1 - cred) * mv };
  });
}

export interface CurveBuildInputs { b: BlocId; i: number; cred: number; dotsPath: Dot[]; modelPathRates: Dot[]; rStarCb: number; piE1: number; piE5: number;
  tp: TermPremiumInputs; sov: SovereignCreditState; liq: number; conv: number; fsi: number; swapLineActive: boolean; hHat: number; inversionDays: number; p: ParamsView }
/** y(τ) = OIS(τ) + TP(τ) + s_sov(τ) + liq − conv at each node; NS fits of the govt, OIS and real (y − breakeven) nodes; TP10, breakevens, basis. */
export function buildCurve(x: CurveBuildInputs, tick: Tick): CurveState {
  const mi = marketPath(x.cred, x.dotsPath, x.modelPathRates), nInf = nInfinity(x.rStarCb, x.piE5), tp10 = termPremium10(x.tp);
  const E: Path = { 1: mi[0]!.rate, 2: mi[1]!.rate, 4: mi[2]!.rate, 8: mi[3]!.rate };
  const ois: CurvePoint[] = [], nodes: CurvePoint[] = [], breakeven: CurvePoint[] = [], real: CurvePoint[] = [];
  for (const tau of CURVE_NODES) {
    const o = oisZero(tau, x.i, E, nInf), y = o + termPremiumAt(tp10, tau) + sovSpread(tau, x.sov.hazard, SOV_LGD) + x.liq - x.conv, be = breakevenAt(tau, x.piE1, x.piE5, IRP);
    ois.push({ tenorYears: tau, yield: o }); nodes.push({ tenorYears: tau, yield: y }); breakeven.push({ tenorYears: tau, yield: be }); real.push({ tenorYears: tau, yield: y - be });
  }
  return { id: x.b, tick, hHat: x.hHat, marketImplied: mi, nInf, nodes, ois, ns: nsFit(nodes, NS_LAMBDA), nsOis: nsFit(ois, NS_LAMBDA), nsReal: nsFit(real, NS_LAMBDA),
    tp10, breakeven, basis: crossCurrencyBasis(x.b, x.fsi, x.swapLineActive), inversionDays: x.inversionDays };
}

/** Reads mac.cb, mac.bloc, mac.global, mac.public_view and the previous curve (ĥ 0.5 and 0 inversion days at genesis), builds and upserts
 *  mac.curve and the curve block of mac.public_view. `reason` only names the trigger (§3.7.1). */
export function recomputeCurve(ctx: PhaseCtx, b: BlocId, _reason: CurveRecomputeReason): CurveState {
  const s = ctx.store, cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b)), st = s.get<BlocMacroState>(macroTables.bloc.name, b);
  const g = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  if (!cb || !st || !g) throw new EngineFault('MAC_STATE_MISSING', `recomputeCurve ${b}`, [b]);
  const prev = s.get<CurveState>(macroTables.curve.name, b), view = s.get<PublicMacroView & { id: BlocId }>(macroTables.publicView.name, b);
  const d0 = BLOC_DEFAULTS[b], rStarCb = st.rStar + cb.rStarBias, hHat = prev?.hHat ?? 0.5, data = publishedData(s, b);
  const modelPathRates = dots(cb.policyRate, rStarCb, data, d0.inflationTarget, d0.nairu, b, coeffsFromHawk(b, hHat, cb.mandate, ctx.params), d0.elb, ctx.params);
  const dotsPath = cb.dots.length > 0 ? (cb.dots as Dot[]) : modelPathRates;
  const c = buildCurve({ b, i: cb.policyRate, cred: cb.credibility, dotsPath, modelPathRates, rStarCb, piE1: st.inflationExp1y, piE5: st.inflationExp5y5y,
    tp: { b, piE5: st.inflationExp5y5y, target: d0.inflationTarget, debtGdp: st.fiscal.debtGdp, dStar: d0.debtReference, qeHoldingsGdp: view?.qeHoldingsGdp ?? 0,
      fear: g.fearIndex, shockSum: activeShockSum(s, 'tp10', b, ctx.tick) },
    sov: st.sovereign, liq: st.sovereign.liquidityPremium, conv: st.sovereign.convenienceYield, fsi: g.financialStressIndex, swapLineActive: swapLineActive(s, b),
    hHat, inversionDays: prev?.inversionDays ?? 0, p: ctx.params }, ctx.tick);
  s.put<CurveState>(macroTables.curve.name, c);
  if (view) s.put(macroTables.publicView.name, { ...view, curve: c.nodes, ois: c.ois, breakeven10y: c.breakeven[5]!.yield, termPremium10y: c.tp10,
    sovereignSpread10y: st.sovereign.spread10y, sovereignPd1y: st.sovereign.pd1y, marketImpliedPath: c.marketImplied });
  return c;
}
