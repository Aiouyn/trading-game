// T04-14 FX regimes (04 §3.13.2–§3.13.5): band, managed float, coordinated intervention, hard peg, realignment, EMP, the break rule, day close.
import { divRoundHalfEven, dmath, EngineFault, MICRO_N, roundHalfEven, sessionState, TICKS_PER_GAME_DAY, type Ccy, type Money, type PhaseCtx, type Price, type Qty, type StoreRead, type Tick } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type BlocMacroState, type CentralBank, type FxRegimeKind, type FxState, type GlobalMacroState, type NpcPoolOrder } from '../schema';
import { S } from '../streams';
import { activeShockSum } from './shocks';
import { tradingDaysOfPeriod } from './calendar';
import { runMeeting } from './cb';
import { canAgreeConcord, concordActive, openConcord } from './concord';
import { credibilityOneOff } from './credibility';
import { setCapitalControls } from './capitalControls';
import { currentAccount, pppLn, realGap, stepFairValue } from './fxFair';
import { fxReservesFdl, importsMonthFdl, nominalGdpFdl, reserveCover } from './fxReserves';
import { iocLimit } from './poolOrders';
import { adjustRr } from './reserves';
import { sovSpread } from './sovCredit';

type X = Exclude<BlocId, 'FDL'>;
const D = TICKS_PER_GAME_DAY, XS: readonly X[] = ['EUN', 'PYN', 'NKR', 'SRL'], CONT_LAST = 539, T45 = 45, HIST = 370;
const HW_WIDE = 0.06, EDGE_X = 2, LEAN_X = 0.05, ZONE = 0.8, NEAR = 0.005, REALIGN_DAYS = 21, MF_MOVE = 0.04, MF_SHARE = 0.02,
  COORD_SHARE = 0.01, COORD_GAP = 0.25, PEG_BAND = 0.001, PEG_SELL_X = 10, EMP_COVER = 3, EMP_MIN = 2, EMP_DAYS = 5, CORE_PEG = 0.25, PEG_DAYS = 91,
  BREAK_BASE = 0.15, BREAK_SEV = 0.25, LGD = 0.6 /* macro_sov_lgd (E-100) */;
const DEVALUE = dmath.ln(0.97), REVALUE = dmath.ln(1.02);

const blocOf = (s: StoreRead, b: BlocId): BlocMacroState & { id: BlocId } => {
  const r = s.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!r) throw new EngineFault('MAC_STATE_MISSING', `no bloc row ${b}`);
  return r;
};
const cbOf = (s: StoreRead, b: BlocId): CentralBank => {
  const r = s.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (!r) throw new EngineFault('MAC_STATE_MISSING', `no cb row ${b}`);
  return r;
};
const putFx = (ctx: PhaseCtx, b: BlocId, fx: FxState): void => { ctx.store.put(macroTables.bloc.name, { ...blocOf(ctx.store, b), fx }); };
const emitRegime = (ctx: PhaseCtx, b: BlocId, old: FxRegimeKind, fx: FxState, devaluation: number): void => {
  ctx.emit('macro.fx.regime', [cbkId(b)], { bloc: b, old, new: fx.regime, band: fx.band ? { center: fx.band.centerLn, halfWidth: fx.band.halfWidth } : null, devaluation }, 'PUBLIC');
};
/** The authored pair against FDL (22 §4.5, mirrors ContentView.fxAssetId; macro has no content dependency): EUN is the base, else FDL. */
export const fxPair = (c: X): { assetId: string; xBase: boolean; base: Ccy; quote: Ccy } =>
  c === 'EUN' ? { assetId: 'ast_FX_EUNFDL', xBase: true, base: 'EUN', quote: 'FDL' } : { assetId: `ast_FX_FDL${c}`, xBase: false, base: 'FDL', quote: c };
const spotOf = (s: StoreRead, ports: MacroPorts, c: X): number => ports.markets.fxSpot(s, c) ?? BLOC_DEFAULTS[c].fx0;
const continuous = (b: BlocId, tick: Tick): boolean => sessionState('BLOC_LISTED', tick, { bloc: b, holidayFxDepthMult: 1 }).state === 'CONTINUOUS';
function sessionTicks(b: BlocId, tick: Tick): number {
  const d0 = tick - (tick % D);
  let n = 0;
  for (let t = d0; t <= d0 + CONT_LAST; t++) if (continuous(b, t)) n++;
  return Math.max(1, n);
}
const isTradingDay = (b: BlocId, day: number): boolean => tradingDaysOfPeriod(b, day, 1).length > 0;
const micro = (x: number): bigint => BigInt(roundHalfEven(x * 1e6));
/** Pair quantity (micro) that costs `fdl` when buying X; FDL-base pairs are sized in FDL directly. */
const qtyForFdl = (c: X, fdl: Money, spot: number): Qty => (fxPair(c).xBase ? divRoundHalfEven(fdl * MICRO_N, micro(spot)) : fdl);
const advOf = (s: StoreRead, ports: MacroPorts, c: X): number => ports.markets.lineAdv(s, fxPair(c).assetId) ?? 0;
/** An order buying (or selling) X against FDL at `fdlPerX`, expressed in the pair's own side and quote. */
function order(b: X, buyX: boolean, fdlPerX: number, qty: Qty, tif: 'TICK' | 'RESTING', purpose: NpcPoolOrder['purpose'], tick: Tick, k: number, halfSpread?: number): NpcPoolOrder {
  const p = fxPair(b), side = buyX === p.xBase ? 'BUY' : 'SELL', px: Price = micro(p.xBase ? fdlPerX : 1 / fdlPerX);
  return { id: `fx_${b}_${tick}_${k}`, poolId: `CB:${b}`, assetId: p.assetId, side, qty, limitPrice: halfSpread === undefined ? px : iocLimit(px, halfSpread, side), tif, tick, purpose };
}

/** c0 + 0.3 ln(S_EUN/S0) + 0.2 ln(S_NKR/S0). */
export function bandCenter(c0: number, sEun: number, sEun0: number, sNkr: number, sNkr0: number): number {
  return c0 + 0.3 * dmath.ln(sEun / sEun0) + 0.2 * dmath.ln(sNkr / sNkr0);
}
/** PYN: resting SELL at exp(c + hw) and BUY at exp(c − hw), 2 × ADV each (BUY bounded by FDL reserves); outer-zone IOC lean. */
export function bandOrders(store: StoreRead, ports: MacroPorts, tick: Tick): NpcPoolOrder[] {
  const fx = blocOf(store, 'PYN').fx, band = fx.band;
  if (fx.regime !== 'MANAGED_BAND' || !band || !continuous('PYN', tick)) return [];
  const c = band.centerLn, hw = band.halfWidth, adv = advOf(store, ports, 'PYN'), edge = BigInt(roundHalfEven(EDGE_X * adv)), lo = dmath.exp(c - hw);
  const cap = qtyForFdl('PYN', cbOf(store, 'PYN').reserves.fdl, lo), buy = edge < cap ? edge : cap, out: NpcPoolOrder[] = [];
  out.push(order('PYN', false, dmath.exp(c + hw), edge, 'RESTING', 'FX_BAND', tick, 0));
  if (buy > 0n) out.push(order('PYN', true, lo, buy, 'RESTING', 'FX_BAND', tick, 1));
  const lnS = dmath.ln(spotOf(store, ports, 'PYN')), dev = lnS - c, into = Math.abs(dev) - ZONE * hw;
  if (into > 0) {
    const q = BigInt(roundHalfEven(LEAN_X * adv * Math.min(1, into / ((1 - ZONE) * hw))));
    if (q > 0n) out.push(order('PYN', dev < 0, dmath.exp(lnS), q, 'TICK', 'FX_LEAN', tick, 2, ports.markets.makerHalfSpread(store, fxPair('PYN').assetId) ?? 0));
  }
  return out;
}
const fdlSlice = (fdl: Money, share: number, b: BlocId, tick: Tick): Money => divRoundHalfEven(fdl * micro(share), MICRO_N * BigInt(sessionTicks(b, tick)));
/** SRL: |Δ5 ln S| > 0.04 → IOC against the move, 0.02 × reserves per trading day over the session; off below 3 months of cover without Concord. */
export function managedFloatOrders(store: StoreRead, ports: MacroPorts, tick: Tick): NpcPoolOrder[] {
  const fx = blocOf(store, 'SRL').fx, h = fx.hist ?? [];
  if (fx.regime !== 'MANAGED_FLOAT' || h.length < 5 || !continuous('SRL', tick)) return [];
  if (fx.reserveCoverMonths < EMP_COVER && !concordActive(store, 'SRL')) return [];
  const sp = spotOf(store, ports, 'SRL'), move = dmath.ln(sp) - h[h.length - 5]!.lnS;
  if (Math.abs(move) <= MF_MOVE) return [];
  const budget = fdlSlice(fx.reservesFdl, MF_SHARE, 'SRL', tick), buyX = move < 0;
  const q = buyX ? qtyForFdl('SRL', budget, sp) : qtyForFdl('SRL', budget, sp);
  return q > 0n ? [order('SRL', buyX, sp, q, 'TICK', 'FX_LEAN', tick, 0, ports.markets.makerHalfSpread(store, fxPair('SRL').assetId) ?? 0)] : [];
}
/** Free floats while a major world event is active and |S/F − 1| ≥ 0.25: IOC against the move, 1% of reserves per trading day over the session. */
export function coordinatedOrders(store: StoreRead, ports: MacroPorts, tick: Tick): NpcPoolOrder[] {
  const g = store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  if (!g || g.scheduler.activeMajorId === null) return [];
  const out: NpcPoolOrder[] = [];
  for (const c of XS) {
    const fx = blocOf(store, c).fx;
    if (fx.regime !== 'FREE_FLOAT' || !continuous(c, tick)) continue;
    const sp = spotOf(store, ports, c), gap = sp / dmath.exp(fx.fairValueLn) - 1;
    if (Math.abs(gap) < COORD_GAP) continue;
    const q = qtyForFdl(c, fdlSlice(fx.reservesFdl, COORD_SHARE, c, tick), sp);
    if (q > 0n) out.push(order(c, gap < 0, sp, q, 'TICK', 'FX_COORD', tick, 0, ports.markets.makerHalfSpread(store, fxPair(c).assetId) ?? 0));
  }
  return out;
}
/** Hard peg at p: resting BUY X at p(1 − 0.001) sized by FDL reserves, SELL X at p(1 + 0.001) at 10 × ADV. */
export function pegOrders(store: StoreRead, ports: MacroPorts, tick: Tick): NpcPoolOrder[] {
  const out: NpcPoolOrder[] = [];
  for (const c of XS) {
    const fx = blocOf(store, c).fx;
    if (fx.regime !== 'HARD_PEG' || fx.pegLn === undefined || !continuous(c, tick)) continue;
    const p = dmath.exp(fx.pegLn), lo = p * (1 - PEG_BAND), buy = qtyForFdl(c, cbOf(store, c).reserves.fdl, lo);
    if (buy > 0n) out.push(order(c, true, lo, buy, 'RESTING', 'FX_PEG', tick, 0));
    out.push(order(c, false, p * (1 + PEG_BAND), BigInt(roundHalfEven(PEG_SELL_X * advOf(store, ports, c))), 'RESTING', 'FX_PEG', tick, 1));
  }
  return out;
}
/** At a PYN scheduled meeting: weak edge ≥ 21 trading days and cover < 6 → c0 += ln 0.97; strong edge ≥ 21 and cover > 15 → c0 += ln 1.02. */
export function realignAtMeeting(ctx: PhaseCtx, b: 'PYN'): 'DEVALUE' | 'REVALUE' | 'NONE' {
  const fx = blocOf(ctx.store, b).fx;
  if (fx.regime !== 'MANAGED_BAND' || !fx.band) return 'NONE';
  const move = (fx.weakEdgeDays ?? 0) >= REALIGN_DAYS && fx.reserveCoverMonths < 6 ? DEVALUE : (fx.strongEdgeDays ?? 0) >= REALIGN_DAYS && fx.reserveCoverMonths > 15 ? REVALUE : 0;
  if (move === 0) return 'NONE';
  const next: FxState = { ...fx, bandC0: (fx.bandC0 ?? dmath.ln(BLOC_DEFAULTS[b].fx0)) + move, band: { ...fx.band, centerLn: fx.band.centerLn + move }, weakEdgeDays: 0, strongEdgeDays: 0 };
  putFx(ctx, b, next);
  emitRegime(ctx, b, fx.regime, next, move);
  return move < 0 ? 'DEVALUE' : 'REVALUE';
}
/** −Δ5 ln S / σ5d + (−Δ5 R / R) / 0.05 + Δ5 i / 0.01 (a zero σ or R drops its term). */
export function emp(d5LnS: number, sigma5d: number, d5Reserves: number, reserves: number, d5i: number): number {
  return (sigma5d > 0 ? -d5LnS / sigma5d : 0) + (reserves > 0 ? -d5Reserves / reserves / 0.05 : 0) + d5i / 0.01;
}
/** Free float, ln F −= 0.15 + 0.25 × severity (severity 0.6 + 0.8u, one draw on S.fx), controls 2 for 3 days then 1 for 28, emergency hike,
 *  PEG_BREAK credibility for band or peg breaks, SRL reserve requirement DEFENCE. */
export function executeBreak(ctx: PhaseCtx, b: BlocId): void {
  if (b === 'FDL') return;
  const fx = blocOf(ctx.store, b).fx, p = fxPair(b), sev = 0.6 + 0.8 * ctx.rng(S.fx(p.base, p.quote)).next(), drop = BREAK_BASE + BREAK_SEV * sev;
  const { band: _b, pegLn: _p, ...rest } = fx;
  const next: FxState = { ...rest, regime: 'FREE_FLOAT', fairValueLn: fx.fairValueLn - drop, breakTick: ctx.tick, breakArmed: false, empDays: 0, highCoreDays: 0, crisisFlag: true };
  putFx(ctx, b, next);
  if (b === 'SRL' || b === 'PYN') setCapitalControls(ctx, b, 2, 3, 'BREAK');
  runMeeting(ctx, b, true, ['CURRENCY']);
  if (fx.regime === 'MANAGED_BAND' || fx.regime === 'HARD_PEG') {
    const cb = cbOf(ctx.store, b);
    ctx.store.put(macroTables.cb.name, { ...cb, credibility: credibilityOneOff(cb.credibility, 'PEG_BREAK') });
  }
  if (b === 'SRL') adjustRr(ctx, b, 'DEFENCE');
  emitRegime(ctx, b, fx.regime, next, drop);
}
/** At t = 45 of a trading day once armed: Concord (BREAK_PENDING; PYN band ±0.06) when it can be agreed, else the break. */
export function breakRuleCheck(ctx: PhaseCtx, b: BlocId, _ports: MacroPorts): 'CONCORD' | 'BREAK' | null {
  if (b === 'FDL') return null;
  const fx = blocOf(ctx.store, b).fx, day = Math.floor(ctx.tick / D);
  if (!fx.breakArmed || ctx.tick % D !== T45 || !isTradingDay(b, day)) return null;
  if (canAgreeConcord(ctx.store, b)) {
    openConcord(ctx, b, 'BREAK_PENDING');
    const now = blocOf(ctx.store, b).fx, wide = b === 'PYN' && now.band ? { band: { ...now.band, halfWidth: HW_WIDE }, bandToleranceWide: true } : {};
    putFx(ctx, b, { ...now, ...wide, breakArmed: false, empDays: 0 });
    return 'CONCORD';
  }
  executeBreak(ctx, b);
  return 'BREAK';
}
/** At a meeting: core inflation above 0.25 for 91 game days after a break → currency board at the then-spot. */
export function hardPegCheck(ctx: PhaseCtx, b: BlocId): boolean {
  if (b === 'FDL') return false;
  const fx = blocOf(ctx.store, b).fx;
  if (fx.regime === 'HARD_PEG' || fx.breakTick === undefined || (fx.highCoreDays ?? 0) < PEG_DAYS) return false;
  const pub = ctx.store.get<{ fx?: { spotVsFdl?: number } }>(macroTables.publicView.name, b)?.fx?.spotVsFdl ?? BLOC_DEFAULTS[b].fx0;
  const next: FxState = { ...fx, regime: 'HARD_PEG', pegLn: dmath.ln(pub), highCoreDays: 0 };
  putFx(ctx, b, next);
  emitRegime(ctx, b, fx.regime, next, 0);
  return true;
}
/** Peg break-back: FDL reserves < 0.8 × computeM0(X) in FDL (M0 × spot, FDL per X), via LedgerApi.m0 (T03-11 computeM0). */
export function pegBreakBack(reservesFdl: Money, m0X: Money, spotFdlPerX: number): boolean {
  return reservesFdl * 10n < 8n * divRoundHalfEven(m0X * micro(spotFdlPerX), MICRO_N);
}
/** i_FDL + s_sov(0.25). */
export function pegPolicyRate(store: StoreRead, b: BlocId): number {
  return cbOf(store, 'FDL').policyRate + sovSpread(0.25, blocOf(store, b).sovereign.hazard, LGD);
}
function stdev5(h: readonly { lnS: number }[]): number {
  const d: number[] = [];
  for (let k = Math.max(5, h.length - 364); k < h.length; k++) d.push(h[k]!.lnS - h[k - 5]!.lnS);
  if (d.length < 2) return 0;
  const m = d.reduce((a, x) => a + x, 0) / d.length;
  return Math.sqrt(d.reduce((a, x) => a + (x - m) * (x - m), 0) / (d.length - 1));
}
const meetingToday = (s: StoreRead, b: BlocId, day: number): boolean => cbOf(s, b).meetings.scheduledTicks.some((t) => Math.floor(t / D) === day);

/** Day close per X in EUN, PYN, NKR, SRL: fair value, PPP, q̃, CA (yesterday's gaps), reserves and cover, CA absorption for managed regimes,
 *  band centre and edge counters, EMP and the break arming, core-inflation counter, PYN emergency widening, realignment and hard-peg checks
 *  on scheduled meeting days; yesterday's macro.fx.intervention.daily goes out on the next trading day. */
export function stepFxDay(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store, day = Math.floor(ctx.tick / D), g = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL'), fdl = blocOf(s, 'FDL');
  const iFdl = cbOf(s, 'FDL').policyRate, RA = g?.riskAppetite ?? 0, E = g?.energyIndex ?? 100;
  const gaps = XS.map((c) => blocOf(s, c).outputGap).concat([fdl.outputGap]);
  for (const c of XS) {
    const st = blocOf(s, c), fx0 = st.fx, cb = cbOf(s, c), trading = isTradingDay(c, day);
    if (fx0.pendingDaily && trading) ctx.emit('macro.fx.intervention.daily', [cbkId(c)], { bloc: c, gameDay: fx0.pendingDaily.gameDay,
      netInterventionFdl: fx0.pendingDaily.net.toString(), reservesFdl: fx0.pendingDaily.reserves.toString() }, 'PUBLIC');
    const sp = spotOf(s, ports, c), lnS = dmath.ln(sp), ppp0 = dmath.ln(BLOC_DEFAULTS[c].fx0);
    const ppp = pppLn(ppp0, fdl.cpiLevel, 100, st.cpiLevel, 100), xOthers = (gaps.reduce((a, x) => a + x, 0) - st.outputGap) / (gaps.length - 1);
    const ca = currentAccount(c, fx0.realExchangeGap, xOthers, st.outputGap, E);
    const fLn = stepFairValue(fx0.fairValueLn, { iX: cb.policyRate, iFdl, pppLn: ppp, ca, dRA: RA - (fx0.lastRA ?? RA), dLnEnergy: dmath.ln(E / (fx0.lastEnergy ?? E)),
      surpriseX: 0, surpriseFdl: 0, shocks: activeShockSum(s, 'fx_fair_ln', c, ctx.tick), b: c }, ctx.params);
    if (fx0.regime !== 'FREE_FLOAT') {
      const fdlAmt = divRoundHalfEven(nominalGdpFdl(s, c) * micro(ca), 364n * MICRO_N), xAmt = divRoundHalfEven((fdlAmt < 0n ? -fdlAmt : fdlAmt) * MICRO_N, micro(sp));
      if (fdlAmt > 0n) ctx.ledger.fx(cbkId(c), 'row', c, xAmt, 'FDL', fdlAmt, 'MAC_FX_CA_ABSORB');
      else if (fdlAmt < 0n) ctx.ledger.fx(cbkId(c), 'row', 'FDL', -fdlAmt, c, xAmt, 'MAC_FX_CA_ABSORB');
    }
    const reserves = fxReservesFdl(s, c, ports), cover = reserveCover(reserves, importsMonthFdl(s, c));
    let fx: FxState = { ...fx0, fairValueLn: fLn, pppLn: ppp, realExchangeGap: realGap(lnS, st.cpiLevel, fdl.cpiLevel, ppp0), currentAccountGdp: ca, reservesFdl: reserves,
      reserveCoverMonths: cover, lastRA: RA, lastEnergy: E, pendingDaily: trading ? { gameDay: day, net: fx0.interventionToday, reserves } : fx0.pendingDaily,
      interventionToday: trading ? 0n : fx0.interventionToday, highCoreDays: fx0.breakTick !== undefined && st.coreInflation > CORE_PEG ? (fx0.highCoreDays ?? 0) + 1 : 0 };
    if (trading) {
      const h = [...(fx0.hist ?? []), { lnS, res: reserves, i: cb.policyRate }].slice(-HIST), n = h.length;
      fx = { ...fx, hist: h };
      let exhausted = c === 'SRL';
      if (c === 'PYN' && fx.regime === 'MANAGED_BAND' && fx.band) {
        const c0 = fx.bandC0 ?? ppp0, center = bandCenter(c0, spotOf(s, ports, 'EUN'), BLOC_DEFAULTS.EUN.fx0, spotOf(s, ports, 'NKR'), BLOC_DEFAULTS.NKR.fx0);
        const hw = fx.band.halfWidth, weak = lnS <= center - hw + NEAR, strong = lnS >= center + hw - NEAR;
        fx = { ...fx, bandC0: c0, band: { ...fx.band, centerLn: center }, weakEdgeDays: weak ? (fx.weakEdgeDays ?? 0) + 1 : 0, strongEdgeDays: strong ? (fx.strongEdgeDays ?? 0) + 1 : 0 };
        exhausted = weak && cb.reserves.fdl <= 0n;
        if (cover < EMP_COVER && hw < HW_WIDE) {
          fx = { ...fx, band: { ...fx.band!, halfWidth: HW_WIDE } };
          putFx(ctx, c, fx);
          runMeeting(ctx, c, true, ['CURRENCY']);
          emitRegime(ctx, c, fx.regime, fx, 0);
          fx = blocOf(s, c).fx;
        }
      }
      if (n >= 6 && fx.regime !== 'FREE_FLOAT') {
        const p5 = h[n - 6]!, e = emp(lnS - p5.lnS, stdev5(h), Number(reserves - p5.res) / 1e6, Number(reserves) / 1e6, cb.policyRate - p5.i);
        const days = cover < EMP_COVER && e > EMP_MIN && exhausted ? (fx.empDays ?? 0) + 1 : 0;
        fx = { ...fx, exchangeMarketPressure: e, empDays: days, breakArmed: fx.breakArmed || days >= EMP_DAYS };
      }
    }
    putFx(ctx, c, fx);
    if (fx.regime === 'HARD_PEG' && pegBreakBack(reserves, ctx.ledger.m0(c), sp)) { executeBreak(ctx, c); continue; }
    if (trading && meetingToday(s, c, day)) {
      if (c === 'PYN') realignAtMeeting(ctx, 'PYN');
      hardPegCheck(ctx, c);
    }
  }
}
