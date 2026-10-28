// T04-10: fiscal programs (04 §3.9.4, §6.8): proposals from politics (16) validated against the rule, the public breach window and its
// 25 bp liquidity premium (04#45), sector demand multipliers for 09 and budgeted incentives for 09, 10 and 11.
// Store: `mac.program` is canonical; the bloc row's fiscal.programs carries the same rows (stepFiscalDay reads them).
import { fromMoney, TICKS_PER_GAME_DAY, type Money, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { govId, type FlowClass } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type BlocMacroState, type FiscalProgram, type GlobalMacroState } from '../schema';
import { revenueAnnual } from './fiscal';
import { ruleInputs, wouldBreach } from './fiscalRules';

const BREACH_TICKS = 182 * TICKS_PER_GAME_DAY, BREACH_PREMIUM = 0.0025;
type Kind = FiscalProgram['kind'];
type Target = 'CAPEX_SECTOR' | 'COMPUTE_SPEND' | 'MORTGAGE_RATE' | 'HIRING';
const isActive = (p: FiscalProgram, tick: Tick): boolean => p.startTick <= tick && tick < p.endTick;
const byId = (a: { id: string }, c: { id: string }): number => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0);

/** Keyed by 22's SectorId (decision: the card's sector names mapped to ids; "Energy renewables" → ENERGY, "Security and Defense" → SECURITY). */
export const SECTOR_DEMAND_DEFAULTS: Readonly<Record<Kind, Record<string, number>>> = Object.freeze({
  INFRASTRUCTURE: { INDUSTRIALS: 0.06, MATERIALS: 0.04, REAL_ESTATE: 0.03 }, GREEN_ENERGY: { ENERGY: 0.08 }, AI_COMPUTE: { SEMI: 0.05, TECH: 0.03 },
  HOUSING: { REAL_ESTATE: 0.05 }, DEFENSE_SECURITY: { SECURITY: 0.08 }, TAX_CUT: {}, HOUSEHOLD_TRANSFER: {}, INDUSTRIAL_SUBSIDY: {}, AUSTERITY: {},
});
export const INCENTIVE_DEFAULTS: Readonly<{ CAPEX_SECTOR: 0.10; COMPUTE_SPEND: 0.08; MORTGAGE_RATE: -0.005; HIRING: 0.05 }> =
  Object.freeze({ CAPEX_SECTOR: 0.10, COMPUTE_SPEND: 0.08, MORTGAGE_RATE: -0.005, HIRING: 0.05 } as const);
export const MACRO_EXTENSION_CODES_FISCAL: readonly { code: string; cls: FlowClass; template: string; desc: string }[] = Object.freeze([
  { code: 'GOV_SUBSIDY_P', cls: 'TRANSFER', template: 'PAY', desc: 'Fiscal program incentive paid by gov_X (requesters 09, 10, 11)' },
  { code: 'SWF_TRANSFER', cls: 'TRANSFER', template: 'PAY', desc: 'NKR treasury surplus to the SWF, or the SWF draw back to the treasury' },
]);

function save(ctx: PhaseCtx, prog: FiscalProgram): void {
  ctx.store.put(macroTables.program.name, prog);
  const st = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, prog.bloc);
  if (!st) return;
  const programs = st.fiscal.programs.filter((p) => p.id !== prog.id).concat([prog]).sort(byId);
  ctx.store.put(macroTables.bloc.name, { ...st, fiscal: { ...st.fiscal, programs } });
}
/** Empty sectorDemand → the kind's defaults, resolved to positions in ContentView.sectors(). */
function withDemand(ctx: PhaseCtx, prog: FiscalProgram): FiscalProgram {
  const sectors = ctx.content.sectors();
  if (sectors.some((_s, i) => prog.sectorDemand[i] !== undefined)) return prog;
  const d = SECTOR_DEMAND_DEFAULTS[prog.kind], sd: Record<number, number> = {};
  sectors.forEach((s, i) => { const m = d[s.sectorId]; if (m !== undefined) sd[i] = m; });
  return { ...prog, sectorDemand: sd };
}
/** Store the program and emit macro.fiscal.program (PUBLIC); a breach also emits macro.fiscal.rule_breach (PUBLIC). */
export function addProgram(ctx: PhaseCtx, prog: FiscalProgram, breach: boolean): void {
  const p = withDemand(ctx, breach ? { ...prog, breachUntilTick: ctx.tick + BREACH_TICKS } : prog), gov = govId(p.bloc);
  save(ctx, p);
  ctx.emit('macro.fiscal.program', [gov], { programId: p.id, bloc: p.bloc, kind: p.kind, sizeGdpPerYear: p.sizeGdpPerYear, budget: p.budget,
    startTick: p.startTick, endTick: p.endTick, source: p.source, sponsors: p.sponsorActorIds }, 'PUBLIC');
  if (breach) ctx.emit('macro.fiscal.rule_breach', [gov], { bloc: p.bloc, rule: BLOC_DEFAULTS[p.bloc].fiscalRule.kind, programId: p.id }, 'PUBLIC');
}
/** Daily: 16's proposals for bloc b (by id, unseen ones only) → validated against the rule, stored, events. Returns the accepted programs. */
export function acceptProposals(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): FiscalProgram[] {
  const props = ports.world.fiscalProposals(ctx.store, ctx.tick).filter((p) => p.bloc === b && ctx.store.get(macroTables.program.name, p.id) === undefined).sort(byId);
  if (!props.length) return [];
  const st = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!st) return [];
  const g = fromMoney(st.nominalGdp), rb = ctx.params.num(`macro_rev_base_${b.toLowerCase()}`);
  const s = ruleInputs(ctx.store, b, ctx.tick, rb, revenueAnnual(b, g, st.outputGap, ctx.store.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL')?.energyIndex ?? 100, ctx.params));
  if (!s) return [];
  for (const p of props) addProgram(ctx, p, wouldBreach(b, p, s));
  return props;
}
/** 0.0025 per breach window active at `tick` ([until − 182·720, until)), summed — the input to T04-07 liquidityPremium. */
export function ruleBreachPremium(store: StoreRead, b: BlocId, tick: Tick): number {
  let n = 0;
  for (const p of store.iter<FiscalProgram>(macroTables.program.name))
    if (p.bloc === b && p.breachUntilTick !== undefined && p.breachUntilTick - BREACH_TICKS <= tick && tick < p.breachUntilTick) n++;
  return n * BREACH_PREMIUM;
}
/** Σ over active programs of mult × sizeGdpPerYear/0.01 for one sector position (09 reads). */
export function sectorDemandAdd(store: StoreRead, b: BlocId, sectorIndex: number, tick: Tick): number {
  let s = 0;
  for (const p of store.iter<FiscalProgram>(macroTables.program.name)) {
    const m = p.sectorDemand[sectorIndex];
    if (p.bloc === b && m !== undefined && isActive(p, tick)) s += (m * p.sizeGdpPerYear) / 0.01;
  }
  return s;
}
/** Active programs with an incentive on `target` and budget left (remaining = budget − spent > 0), by id. */
export function activeIncentives(store: StoreRead, b: BlocId, target: Target, tick: Tick): { programId: string; rate: number; sector?: number; remaining: Money }[] {
  const out: { programId: string; rate: number; sector?: number; remaining: Money }[] = [];
  for (const p of [...store.iter<FiscalProgram>(macroTables.program.name)].sort(byId)) {
    const inc = p.incentive, remaining = p.budget - p.spent;
    if (p.bloc !== b || !inc || inc.target !== target || !isActive(p, tick) || remaining <= 0n) continue;
    out.push({ programId: p.id, rate: inc.rate, ...(inc.sector !== undefined ? { sector: inc.sector } : {}), remaining });
  }
  return out;
}
/** Inbox 'mac.program.spent' { programId, amount } (NEXT from 09/10/11): spent += amount; overshoot within a tick is kept as recorded. */
export function handleProgramSpend(ctx: PhaseCtx): void {
  for (const m of ctx.inbox('mac.program.spent')) {
    const body = m.body as { programId: string; amount: Money };
    const p = ctx.store.get<FiscalProgram>(macroTables.program.name, body.programId);
    if (p) save(ctx, { ...p, spent: p.spent + body.amount });
  }
}
