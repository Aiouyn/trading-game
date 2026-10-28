// T04-19: the per-bloc public view row (04 §2.4). Writes every field except `prints` (T04-16), the curve block (T04-07) and the
// cycle label (T04-20 day step); those are carried over unchanged. Every value is copied from an already-public source.
import { EngineFault, fromMoney, TICKS_PER_GAME_DAY, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { macroTables, type BlocId, type BlocMacroState, type CentralBank, type CurveState, type PublicMacroView } from '../schema';
import { spotOfStore } from '../rules/fxReserves';

const D = TICKS_PER_GAME_DAY, QD = 91;
type Row = PublicMacroView & { id: BlocId };
type H = 1 | 2 | 4 | 8;

/** Schedule ids are `${bloc}:${kind}:${tick}` (rules/calendar.ts writeQuarterSchedule). */
function nextScheduled(s: StoreRead, b: BlocId, kind: string, now: Tick): Tick {
  let best = -1;
  for (const r of s.iter<{ id: string; bloc: BlocId; kind: string }>(macroTables.schedule.name)) {
    if (r.bloc !== b || r.kind !== kind) continue;
    const t = Number(r.id.slice(r.id.lastIndexOf(':') + 1));
    if (t > now && (best < 0 || t < best)) best = t;
  }
  return best;
}

export function buildPublicView(s: StoreRead, b: BlocId, tick: Tick): Row {
  const bl = s.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b), cb = s.get<CentralBank>(macroTables.cb.name, b);
  if (!bl || !cb) throw new EngineFault('MAC_STATE_MISSING', `public view ${b}`, [b]);
  const prev = s.get<Row>(macroTables.publicView.name, b), curve = s.get<CurveState>(macroTables.curve.name, b);
  const fiscal = prev?.prints?.FISCAL, gdp = fromMoney(bl.nominalGdp), bs = cb.balanceSheet;
  const fx = bl.fx;
  return {
    id: b, bloc: b, asOfTick: tick,
    prints: prev?.prints ?? ({} as Row['prints']),
    cycleLabel: prev?.cycleLabel ?? 'UNDETERMINED', cycleLabelSinceDay: prev?.cycleLabelSinceDay ?? 0,
    policyRate: cb.policyRate, depositRate: cb.facilities.depositRate, lendingRate: cb.facilities.lendingRate, reserveRequirement: cb.reserveRequirement,
    nextMeeting: { tick: nextScheduled(s, b, 'CB_DECISION', tick), guidanceTick: nextScheduled(s, b, 'CB_GUIDANCE', tick) },
    guidance: cb.guidance && cb.guidance.tick <= tick ? { tick: cb.guidance.tick, score: cb.guidance.score, text: cb.guidance.textKey } : null,
    dots: cb.dots.map((d) => ({ horizonQuarters: d.horizonQuarters as H, rate: d.rate })),
    marketImpliedPath: (curve?.marketImplied ?? []).map((m) => ({ horizonQuarters: m.horizonQuarters, rate: m.rate })),
    curve: prev?.curve ?? [], ois: prev?.ois ?? [], breakeven10y: prev?.breakeven10y ?? 0, termPremium10y: prev?.termPremium10y ?? 0,
    sovereignSpread10y: bl.sovereign.spread10y, sovereignPd1y: bl.sovereign.pd1y,
    fiscalPrints: fiscal
      ? { deficitGdp: fiscal.actual, debtGdp: fiscal.extra.debtGdp ?? 0, primaryBalanceGdp: fiscal.extra.primaryBalanceGdp ?? 0, asOfQuarter: Math.floor(fiscal.tick / (QD * D)) }
      : prev?.fiscalPrints ?? { deficitGdp: 0, debtGdp: 0, primaryBalanceGdp: 0, asOfQuarter: -1 },
    fx: { spotVsFdl: spotOfStore(s, b), regime: fx.regime, ...(fx.band ? { band: { center: fx.band.centerLn /* as macro.fx.regime publishes it */, halfWidth: fx.band.halfWidth } } : {}),
      reservesFdl: fx.reservesFdl.toString(), reserveCoverMonths: fx.reserveCoverMonths, capitalControls: fx.capitalControls },
    qeHoldingsGdp: gdp > 0 ? fromMoney(bs.govBonds + bs.corpBonds + bs.abs) / gdp : 0,
    ccyb: cb.macroprudential.ccyb, ltvCapResidential: cb.macroprudential.ltvCapResidential, ltvCapCommercial: cb.macroprudential.ltvCapCommercial,
    credibilityPublic: cb.credibility,
  };
}

/** Upserts mac.public_view[b] (see header) and returns the row. */
export function refreshPublicView(ctx: PhaseCtx, b: BlocId): PublicMacroView {
  const row = buildPublicView(ctx.store, b, ctx.tick);
  ctx.store.put(macroTables.publicView.name, row);
  return row;
}
