// T04-09 FDL swap lines (04 §3.8.7): cb_FDL lends FDL to EUN, NKR, PYN (SRL only under an ACTIVE Concord program); they floor the basis.
import { accrue, divRoundHalfEven, EngineFault, mulRate, MICRO_N, roundHalfEven, type Ccy, type Money, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import { cbkId, type FlowClass } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type BlocMacroState, type CentralBank, type ConcordFacility, type CurveState, type GlobalMacroState, type SwapLine } from '../schema';
import { crossCurrencyBasis, oisZero } from './curves';
import { bookCbkFdl } from './fxReserves';

export const SWAP_DRAW_MSG = 'mac.swap.draw', SWAP_REPAY_MSG = 'mac.swap.repay';
const SPREAD = 0.0025, ONLEND = 0.0010, LIMIT_GDP = 0.03, CALM_DAYS = 10, BASIS_ON = -0.004, FSI_ON = 0.6;
const SWAP_BLOCS: readonly BlocId[] = ['EUN', 'PYN', 'NKR', 'SRL'];
const e6 = (r: number): bigint => BigInt(roundHalfEven(r * 1e6));

export const MACRO_EXTENSION_CODES_SWAP: readonly { code: string; cls: FlowClass; template: string; desc: string }[] = Object.freeze([
  { code: 'CBK_SWAP_LINE_DRAW', cls: 'TRANSFER', template: 'FX', desc: 'FDL swap line draw, cbk_FDL to cbk_X' },
  { code: 'CBK_SWAP_LINE_REPAY', cls: 'TRANSFER', template: 'FX', desc: 'FDL swap line repayment, cbk_X to cbk_FDL' },
  { code: 'CBK_SWAP_LINE_INTEREST', cls: 'TRANSFER', template: 'PAY', desc: 'FDL swap line daily interest, cbk_X to cbk_FDL' },
]);

const fdlCb = (s: StoreRead): CentralBank => {
  const cb = s.get<CentralBank>(macroTables.cb.name, cbkId('FDL'));
  if (!cb) throw new EngineFault('I0.macro_missing', 'no cb row for FDL');
  return cb;
};

/** FDL OIS(1/364) from the FDL curve's market-implied path (no curve row: flat at the policy rate) + 0.0025. On-lending adds ONLEND_SPREAD. */
export function swapLineRate(store: StoreRead): number {
  const i = fdlCb(store).policyRate, c = store.get<CurveState>(macroTables.curve.name, 'FDL');
  const E = { 1: i, 2: i, 4: i, 8: i } as Record<1 | 2 | 4 | 8, number>;
  for (const p of c?.marketImplied ?? []) E[p.horizonQuarters] = p.rate;
  return oisZero(1 / 364, i, E, c?.nInf ?? i) + SPREAD;
}
export const ONLEND_SPREAD = ONLEND;

export function swapLineActive(store: StoreRead, b: BlocId): boolean {
  return fdlCb(store).swapLinesOut.find((l) => l.counterpartyCbk === cbkId(b))?.active ?? false;
}

/** Limit = 0.03 × nominalGdp_X × spot_X (FDL per unit X; 05 spot, else the bloc's genesis fx0). */
export function swapLineLimit(nominalGdpX: Money, spotX: number): Money { return mulRate(nominalGdpX, e6(LIMIT_GDP * spotX)); }

const spotOf = (s: StoreRead, ports: MacroPorts, b: BlocId): number => ports.markets.fxSpot(s, b as Ccy) ?? BLOC_DEFAULTS[b].fx0;
function concordActive(s: StoreRead, b: BlocId, tick: number): boolean {
  const f = s.get<ConcordFacility>(macroTables.csf.name, 'npc_CSF');
  return (f?.programs ?? []).some((p) => p.bloc === b && p.startTick <= tick && tick < p.endTick);
}

/** Day close: daily interest X → FDL on drawn amounts, then per counterparty (EUN, PYN, NKR, SRL) the limit, activation
 *  (basis < −0.004 or FSI > 0.6, SWAPLINE_ON) and deactivation (10 calm trading days with nothing drawn, SWAPLINE_OFF). */
export function swapLineStep(ctx: PhaseCtx, ports: MacroPorts): void {
  const T = macroTables.cb.name, cb = fdlCb(ctx.store), rate = swapLineRate(ctx.store);
  const fsi = ctx.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.financialStressIndex ?? 0;
  const lines: SwapLine[] = [];
  for (const b of SWAP_BLOCS) {
    const id = cbkId(b), old = cb.swapLinesOut.find((l) => l.counterpartyCbk === id);
    if (old && old.drawn > 0n) { const int = accrue(old.drawn, e6(rate), 1); ctx.ledger.pay(id, cbkId('FDL'), int, 'FDL', 'CBK_SWAP_LINE_INTEREST'); bookCbkFdl(ctx, b, -int); }
    const eligible = b !== 'SRL' || concordActive(ctx.store, b, ctx.tick);
    const gdp = ctx.store.get<BlocMacroState>(macroTables.bloc.name, b)?.nominalGdp ?? 0n;
    const limit = swapLineLimit(gdp, spotOf(ctx.store, ports, b));
    const basis = ctx.store.get<CurveState>(macroTables.curve.name, b)?.basis ?? crossCurrencyBasis(b, fsi, old?.active ?? false);
    const stress = basis < BASIS_ON || fsi > FSI_ON;
    const line: SwapLine = old ? { ...old, limit } : { counterpartyCbk: id, limit, spread: SPREAD, active: false, drawn: 0n, calmDays: 0 };
    if (!line.active) {
      if (eligible && stress) { line.active = true; line.calmDays = 0; ctx.emit('macro.cb.tool', [cbkId('FDL')], { bloc: b, tool: 'SWAPLINE_ON', params: { limit: limit.toString() } }, 'PUBLIC'); }
    } else {
      line.calmDays = stress && eligible ? 0 : (line.calmDays ?? 0) + 1;
      if ((line.calmDays >= CALM_DAYS || !eligible) && line.drawn === 0n) {
        line.active = false; line.calmDays = 0;
        ctx.emit('macro.cb.tool', [cbkId('FDL')], { bloc: b, tool: 'SWAPLINE_OFF', params: {} }, 'PUBLIC');
      }
    }
    if (old || line.active) lines.push(line);
  }
  ctx.store.put<CentralBank>(T, { ...cb, swapLinesOut: lines });
}

/** Inbox `mac.swap.draw` / `mac.swap.repay` { bloc, amount } (amount = FDL decimal string) from 07, in inbox order. A draw over the limit
 *  or on an inactive line is refused (no posting). Local leg = amount ÷ spot (FDL per unit X), half-even. Repay is clipped to drawn. */
export function handleSwapDraws(ctx: PhaseCtx, ports?: MacroPorts): void {
  const T = macroTables.cb.name;
  for (const m of [...ctx.inbox(SWAP_DRAW_MSG), ...ctx.inbox(SWAP_REPAY_MSG)]) {
    const r = m.body as { bloc: BlocId; amount: string }, cb = fdlCb(ctx.store), id = cbkId(r.bloc);
    const k = cb.swapLinesOut.findIndex((l) => l.counterpartyCbk === id);
    if (k < 0) continue;
    const line = cb.swapLinesOut[k]!, draw = m.kind === SWAP_DRAW_MSG;
    let amt = BigInt(r.amount);
    if (draw && (!line.active || line.drawn + amt > line.limit)) continue;
    if (!draw && amt > line.drawn) amt = line.drawn;
    if (amt <= 0n) continue;
    const spot = ports ? spotOf(ctx.store, ports, r.bloc) : BLOC_DEFAULTS[r.bloc].fx0;
    const local = divRoundHalfEven(amt * MICRO_N, e6(spot));
    const lines = [...cb.swapLinesOut];
    lines[k] = { ...line, drawn: draw ? line.drawn + amt : line.drawn - amt };
    ctx.store.put<CentralBank>(T, { ...cb, swapLinesOut: lines });
    // E-106 (2): the borrowing cbk's FDL leg, as posted (the REPAY template moves FDL cbk_FDL → cbk_X; see PR Decisions).
    if (draw) { ctx.ledger.fx(cbkId('FDL'), id, 'FDL', amt, r.bloc as Ccy, local, 'CBK_SWAP_LINE_DRAW'); bookCbkFdl(ctx, r.bloc, amt); }
    else { ctx.ledger.fx(id, cbkId('FDL'), r.bloc as Ccy, local, 'FDL', amt, 'CBK_SWAP_LINE_REPAY'); bookCbkFdl(ctx, r.bloc, amt); }
  }
}
