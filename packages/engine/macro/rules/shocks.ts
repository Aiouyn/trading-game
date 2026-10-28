// T04-18 steps 2-4: shock shapes and sums, story/storm/ripple shock vectors and their application (04 §3.16.4).
// Storage (unit decision): a SHOCK spec scoped to a bloc goes to that bloc's mac.bloc `shocks`; a WORLD-scoped one goes to the event's
// `shocks`. activeShockSum(…, b) reads the bloc row only; (…, 'WORLD') reads every mac.event row only.
import { dmath, EngineFault, TICKS_PER_GAME_DAY, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type ActiveShock, type BlocId, type BlocMacroState, type CentralBank, type RippleKind, type StormKind, type WorldEvent } from '../schema';
import { catalogInputs, MAJORS, type ShockSpec } from './crisisCatalog';
import { writeHook } from './hooks';

const D = TICKS_PER_GAME_DAY;

/** STEP constant in [start, end); RAMP 0 → value linearly; DECAY value·2^(−days/halfLife) until end; 0 outside. */
export function shockValue(s: ActiveShock, tick: Tick): number {
  if (tick < s.startTick || tick >= s.endTick) return 0;
  if (s.shape === 'STEP') return s.value;
  if (s.shape === 'RAMP') return s.value * (tick - s.startTick) / (s.endTick - s.startTick);
  if (s.halfLifeDays === undefined) throw new EngineFault('MAC_STATE_MISSING', `DECAY shock ${s.id} without halfLifeDays`, [s.id]);
  return s.value * dmath.pow(2, -(tick - s.startTick) / (s.halfLifeDays * D));
}

function shocksOf(store: StoreRead, bloc: BlocId | 'WORLD'): ActiveShock[] {
  if (bloc !== 'WORLD') return store.get<BlocMacroState>(macroTables.bloc.name, bloc)?.shocks ?? [];
  const out: ActiveShock[] = [];
  for (const e of store.iter<WorldEvent>(macroTables.event.name)) out.push(...e.shocks);
  return out;
}
export function activeShockSum(store: StoreRead, target: string, bloc: BlocId | 'WORLD', tick: Tick): number {
  let sum = 0;
  for (const s of shocksOf(store, bloc)) if (s.target === target) sum += shockValue(s, tick);
  return sum;
}
/** Π of the active `target` shocks (a 0 value, i.e. outside the window or a RAMP at its start, leaves the product unchanged). */
export function activeShockProduct(store: StoreRead, target: string, bloc: BlocId | 'WORLD', tick: Tick): number {
  let p = 1;
  for (const s of shocksOf(store, bloc)) if (s.target === target) { const v = shockValue(s, tick); if (v !== 0) p *= v; }
  return p;
}
export const SHOCK_TARGETS: readonly string[] = ['x_target', 'tp10', 'lambda_raw_mult', 'auction_stress', 'z5_fear_add', 'fx_fair_ln', 'tariff_level', 'fear_add',
  'credit_conditions_add', 'interbank_add', 'capital_flow', 'pi_e1_add', 'city_activity:<cityId>', 'sector_value:<sector>', 'commodity_value:<id>'];

type Sh = Omit<ActiveShock, 'id'>;
export const shock = (bloc: BlocId | 'WORLD', target: string, value: number, startTick: Tick, endTick: Tick, shape: Sh['shape'] = 'STEP', halfLifeDays?: number): ShockSpec =>
  ({ kind: 'SHOCK', bloc, shock: { target, value, startTick, endTick, shape, ...(halfLifeDays === undefined ? {} : { halfLifeDays }) } });
export const hook = (owner: Extract<ShockSpec, { kind: 'HOOK' }>['owner'], name: string, args: Extract<ShockSpec, { kind: 'HOOK' }>['args']): ShockSpec => ({ kind: 'HOOK', owner, hook: name, args });

/** Major kinds: the catalog's precursor or trigger vector. Storms: stormShocks on the event's first bloc/sector/asset hint (start = triggerTick).
 *  Ripples are applied at start through rippleEffect (T04-17), so they return []. `ports` (unit addition) feeds the trigger's inputs. */
/** E-35 BANK_RUN_LOCAL: the weakest NPC bank (07 port; CREDIT_WOBBLE is WORLD-scoped, so world-wide), delta −U(0.10, 0.20). No 07 → generic. */
function bankRunOf(ev: WorldEvent, store: StoreRead, ports: MacroPorts): { bankRun?: { bankId: string; delta: number } } {
  if (ev.subDef?.key !== 'BANK_RUN_LOCAL') return {};
  const bankId = ports.credit?.weakestNpcBanks(store, 1)[0];
  return bankId === undefined ? {} : { bankRun: { bankId, delta: -(0.10 + 0.10 * ev.subDef.u) } };
}
export function storyShocks(ev: WorldEvent, store: StoreRead, phase: 'PRECURSOR' | 'TRIGGER', ports: MacroPorts = defaultMacroPorts()): ShockSpec[] {
  if (ev.tier === 'MAJOR') {
    const def = MAJORS.find((m) => m.kind === ev.kind);
    if (!def) return [];
    return phase === 'PRECURSOR' ? def.precursor(ev) : def.trigger(ev, catalogInputs(store, ports));
  }
  if (ev.tier === 'STORM' && phase === 'TRIGGER')
    return stormShocks(ev.kind as StormKind, ev.severity, { ...(ev.blocs[0] ? { bloc: ev.blocs[0] } : {}), ...(ev.sectors[0] !== undefined ? { sector: ev.sectors[0] } : {}),
      ...(ev.assetsHint[0] ? { assetClass: ev.assetsHint[0] } : {}), ...bankRunOf(ev, store, ports) }).map((s) => (s.kind === 'SHOCK' ? { ...s, shock: { ...s.shock, startTick: s.shock.startTick + ev.triggerTick, endTick: s.shock.endTick + ev.triggerTick } } : s));
  return [];
}

/** Storm vectors (step 2). SHOCK ticks are relative to the storm start (storyShocks offsets them). FX_SQUALL needs target.bloc (SRL/PYN, drawn by
 *  the scheduler); SECTOR_ROTATION uses `sector` as s1 and `sector + 1` as s2 (unit decision: the card names no s2 rule). */
export function stormShocks(kind: StormKind, sev: number, target: { bloc?: BlocId; sector?: number; assetClass?: string; bankRun?: { bankId: string; delta: number } }): ShockSpec[] {
  const b = target.bloc ?? 'FDL';
  switch (kind) {
    case 'RATE_SCARE': return [shock(b, 'tp10', 0.004 * sev, 0, 5 * D, 'RAMP'), shock(b, 'tp10', 0.004 * sev, 5 * D, 30 * D, 'DECAY', 10)];
    case 'OIL_SPIKE_LITE': return [hook('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.03 * sev, days: 20 })];
    case 'CRYPTO_FLUSH': return [hook('16', 'WIRE_ITEM', { key: 'storm.crypto_flush.hype', delta: -0.4 }), hook('05', 'makerWithdrawal', { assetFilter: 'CRYPTO', depthMult: 0.5, ticks: 720 })];
    case 'CREDIT_WOBBLE': return target.bankRun ? [hook('07', 'depositConfidenceShock', { bankIds: [target.bankRun.bankId], delta: target.bankRun.delta })]
      : [hook('07', 'corporatePdMultiplier', { bloc: 'WORLD', mult: 1.4, days: 30 })];
    case 'FX_SQUALL': return [shock(b, 'capital_flow', -0.4 * sev, 0, 10 * D)];
    case 'SECTOR_ROTATION': { const s1 = target.sector ?? 0;
      return [hook('06', 'erpShock', { bloc: 'WORLD', sector: s1, deltaPremium: 0.01, halfLifeDays: null }), hook('06', 'erpShock', { bloc: 'WORLD', sector: s1 + 1, deltaPremium: -0.005, halfLifeDays: null })]; }
    case 'EARNINGS_SCARE': return [hook('06', 'consensusEpsShock', { delta: -0.05 })];
    case 'LIQUIDITY_HICCUP': return [hook('05', 'makerWithdrawal', { assetFilter: target.assetClass ?? 'ALL', depthMult: 0.5, ticks: 60 })];
  }
}

/** Ripple effect at `store`'s tick (step 3). `u.target` is the sector index / commodity index / city index, `sign` ±1, `size` fraction, `length` days. */
/** Commodity ids in ports order; a COMMODITY_* ripple target is an index into this list (unit decision). */
export const RIPPLE_COMMODITIES = Object.freeze(['CRUDE', 'GAS', 'MWH', 'WHEAT', 'CORN', 'COFFEE', 'COCOA', 'GOLD'] as const);
/** target: sector index (SECTOR_SHOCK, REGULATORY_NOTE), commodity index (COMMODITY_*), or city id (LOCAL_BOOM). */
export function rippleEffect(store: StoreRead, kind: RippleKind, u: { target: number | string; sign: number; size: number; length: number }): ShockSpec[] {
  const t = store.get<{ tick: Tick }>(macroTables.global.name, 'GLOBAL')?.tick ?? 0, end = t + u.length * D;
  if (kind === 'SECTOR_SHOCK' || kind === 'REGULATORY_NOTE') return [shock('WORLD', `sector_value:${u.target}`, u.sign * u.size, t, end)];
  if (kind === 'LOCAL_BOOM') return [shock('WORLD', `city_activity:${u.target}`, u.size, t, end)];
  const pct = (kind === 'COMMODITY_SUPPLY' ? -1 : 1) * u.sign * u.size;
  return [hook('06', 'commoditySupplyShock', { commodityId: typeof u.target === 'number' ? RIPPLE_COMMODITIES[u.target] ?? RIPPLE_COMMODITIES[0] : u.target, pct, days: u.length })];
}

/** Writes SHOCK specs (bloc row or event), HOOK rows (with the event id), ONE_OFFs (credibility on the CB row, π_e1/π_e5/fx fair on the bloc row;
 *  WORLD = every bloc), and one causeChain entry per spec; stores the updated event. */
export function applyEventShocks(ctx: PhaseCtx, ev: WorldEvent, specs: ShockSpec[]): void {
  const s = ctx.store, cur = s.get<WorldEvent>(macroTables.event.name, ev.id) ?? ev;
  const evShocks = [...cur.shocks], chain = [...cur.causeChain];
  let n = evShocks.length;
  for (const b of BLOC_ORDER) n += (s.get<BlocMacroState>(macroTables.bloc.name, b)?.shocks ?? []).filter((x) => x.sourceCrisisId === ev.id).length;
  for (const sp of specs) {
    if (sp.kind === 'SHOCK') {
      const row: ActiveShock = { id: `shk_${ev.id}_${n++}`, ...sp.shock, sourceCrisisId: ev.id };
      if (sp.bloc === 'WORLD') evShocks.push(row);
      else { const st = s.get<BlocMacroState>(macroTables.bloc.name, sp.bloc); if (st) s.put(macroTables.bloc.name, { ...st, shocks: [...st.shocks, row] }); }
      chain.push({ tick: ctx.tick, key: `shock.${sp.shock.target}`, refs: [row.id, sp.bloc] });
    } else if (sp.kind === 'HOOK') {
      const h = writeHook(ctx, sp.owner, sp.hook, sp.args, ev.id);
      chain.push({ tick: ctx.tick, key: `hook.${sp.hook}`, refs: [h.id] });
    } else {
      for (const b of sp.bloc === 'WORLD' ? BLOC_ORDER : [sp.bloc]) {
        if (sp.target === 'credibility') {
          const cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b));
          if (cb) s.put(macroTables.cb.name, { ...cb, credibility: dmath.clamp(cb.credibility + sp.value, 0, 1) });
        } else {
          const st = s.get<BlocMacroState>(macroTables.bloc.name, b);
          if (!st) continue;
          s.put(macroTables.bloc.name, sp.target === 'pi_e1' ? { ...st, inflationExp1y: st.inflationExp1y + sp.value }
            : sp.target === 'pi_e5' ? { ...st, inflationExp5y5y: st.inflationExp5y5y + sp.value } : { ...st, fx: { ...st.fx, fairValueLn: st.fx.fairValueLn + sp.value } });
        }
      }
      chain.push({ tick: ctx.tick, key: `oneoff.${sp.target}`, refs: [sp.bloc] });
    }
  }
  s.put(macroTables.event.name, { ...cur, shocks: evShocks, causeChain: chain });
}
