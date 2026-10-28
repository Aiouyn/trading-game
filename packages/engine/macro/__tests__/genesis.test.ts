// T04-21 genesis: the 16 entities, the Concord endowment and the call order, on a real LedgerWorld (03) with macroWorld's params.
// MISSING EXPORT: T02-21 TestWorld, T03-28 LEDGER_MODULE: the module genesis runs on a LedgerWorld + macroWorld ctx instead.
import { describe, expect, it, vi } from 'vitest';
import type { PhaseCtx } from '@tycoon/engine-core';
import { cbkId, govId, LedgerWorld } from '@tycoon/engine-ledger';
import { csfEndowment0, csfQuotas0, macroModuleGenesis, registerMacroEntities } from '../genesis';
import { CSF_ID, DEALER_POOL_ID } from '../ids';
import { lendingCapacity, quotas } from '../rules/concord';
import { BLOC_ORDER, macroTables } from '../schema';
import { stubPorts } from '../testkit/cbWorld';
import { macroWorld } from '../testkit/macroWorld';

const order: string[] = [];
// MISSING EXPORT T03-28 registerEntity: the stub forwards to the test's LedgerWorld.
vi.mock('../rules/t03Stubs', async (orig) => ({ ...(await orig<object>()), putFact: vi.fn(),   // MISSING EXPORT T03-08 putFact (as T04-20's tests)
  registerEntity: (ctx: { world: LedgerWorld }, spec: { id: string }) => { order.push(`reg:${spec.id}`); return ctx.world.registerEntity(spec); } }));
vi.mock('../rules/t0422Stubs', () => ({ registerMacroInstitutions: () => { order.push('institutions'); },
  postOpeningBalanceSheets: (_c: unknown, _p: unknown, S0: number) => { order.push(`sheets:${S0}`); } }));
vi.mock('../core/genesis', async (orig) => {
  const m = await orig<typeof import('../core/genesis')>();
  return { ...m, macroGenesis: (ctx: PhaseCtx, ports: never) => {
    order.push(`macroGenesis:${[...ctx.store.iter(macroTables.bloc.name)].length}`); return m.macroGenesis(ctx, ports); } };
});

const IDS = BLOC_ORDER.flatMap((b) => [govId(b), cbkId(b), DEALER_POOL_ID(b)]).concat([CSF_ID]);
function setup(over: Record<string, number> = {}) {
  const mw = macroWorld('g', 0); mw.nums(over);
  const w = new LedgerWorld();
  const api = w.apiFor('04', 'P12').ledger;
  const mint = api.mint.bind(api);
  const ledger = { ...api, mint: (...a: Parameters<typeof api.mint>) => { order.push(`mint:${a[3]}`); return mint(...a); } };
  const base = mw.ctx as unknown as Record<string, unknown>;
  const ctx = { tick: 0, header: mw.ctx.header, cal: mw.ctx.cal, phase: 'P8', params: mw.ctx.params, content: base.content, store: mw.store,
    newId: base.newId, rng: base.rng, emit: base.emit, holds: base.holds, send: base.send, inbox: base.inbox, ledger, world: w } as unknown as PhaseCtx;
  return { mw, w, ctx };
}
const nEnt = (w: LedgerWorld) => (w as unknown as { s: { entities: { size: number } } }).s.entities.size;

describe('T04-21 registerMacroEntities', () => {
  it('16 ids in step 5 order; owners, ccys; a second run adds no entity', () => {
    const { w, ctx } = setup();
    const n0 = nEnt(w);
    expect(registerMacroEntities(ctx)).toEqual(IDS);
    expect(IDS.length).toBe(16);
    const n1 = nEnt(w);
    expect(n1 - n0).toBe(11);   // cbk_<B> (5) are pre-registered by 03's constructor (E-92 (5)); this call fills their owner
    for (const b of BLOC_ORDER) {
      expect(w.entity(cbkId(b))?.ownerId).toBe(govId(b));
      for (const id of [govId(b), cbkId(b), DEALER_POOL_ID(b)]) expect(w.entity(id)?.reportingCcy).toBe(b);
      expect(w.entity(govId(b))?.ownerId).toBeNull(); expect(w.entity(DEALER_POOL_ID(b))?.ownerId).toBeNull();
    }
    expect(w.entity('gov_SRL')?.reportingCcy).toBe('SRL');
    expect(w.entity(CSF_ID)).toMatchObject({ reportingCcy: 'FDL', ownerId: null, kind: 'npc' });
    expect(w.entity('gov_FDL')?.kind).toBe('gov'); expect(w.entity('cbk_FDL')?.kind).toBe('cbk');
    expect(registerMacroEntities(ctx)).toEqual(IDS);
    expect(nEnt(w)).toBe(n1);
  });
});

describe('T04-21 Concord endowment', () => {
  it('worked example 1 (S0 0.2): quotas per bloc, Σ×3 = 1200000000000000012', () => {
    const p = macroWorld('g', 0).ctx.params;
    expect(csfQuotas0(0.2, p)).toEqual({ FDL: 128000000000000000n, EUN: 88000000000000000n, PYN: 96000000000000000n, NKR: 28000000000000004n, SRL: 60000000000000000n });
    expect(csfEndowment0(0.2, p)).toBe(1200000000000000012n);
  });
  it('worked example 2 (S0 1): Σ×3 = 6000000000000000000', () => {
    const p = macroWorld('g', 0).ctx.params;
    expect(csfQuotas0(1, p)).toEqual({ FDL: 640000000000000000n, EUN: 440000000000000000n, PYN: 480000000000000000n, NKR: 140000000000000000n, SRL: 300000000000000000n });
    expect(csfEndowment0(1, p)).toBe(6000000000000000000n);
  });
  it('macroModuleGenesis: npc_CSF holds 1200000000000000012 FDL micro from one MAC_GENESIS_ENDOWMENT (FAUCET) posting; pools hold 0', () => {
    const { w, ctx } = setup();
    macroModuleGenesis(ctx, stubPorts());
    const r = w.runP13();
    expect(r.committed).toBe(true);
    expect(w.cash(CSF_ID, 'FDL')).toBe(1200000000000000012n);
    const es = w.entryLog().filter((e) => e.reason === 'MAC_GENESIS_ENDOWMENT');
    expect(es.length).toBe(1);
    expect(es[0].template).toBe('MINT');
    expect(w.catalog.get('MAC_GENESIS_ENDOWMENT')?.cls).toBe('FAUCET');
    for (const b of BLOC_ORDER) expect(w.cash(DEALER_POOL_ID(b), b)).toBe(0n);
  });
  it('macro_scale_min 1: npc_CSF holds 6000000000000000000', () => {
    const { w, ctx } = setup({ macro_scale_min: 1 });
    macroModuleGenesis(ctx, stubPorts());
    w.runP13();
    expect(w.cash(CSF_ID, 'FDL')).toBe(6000000000000000000n);
  });
  it('cross-check after macroGenesis: 3 × Σ quotas(store) and lendingCapacity(store) within 10,000 micro of the endowment', () => {
    const { mw, ctx } = setup();
    macroModuleGenesis(ctx, stubPorts());
    const e = csfEndowment0(0.2, mw.ctx.params);
    const q = quotas(mw.store);
    const s = BLOC_ORDER.reduce((a, b) => a + q[b], 0n);
    const abs = (x: bigint) => (x < 0n ? -x : x);
    expect(abs(3n * s - e) <= 10000n).toBe(true);
    expect(abs(lendingCapacity(mw.store) - e) <= 10000n).toBe(true);
  });
});

describe('T04-21 genesis order', () => {
  it('entities, T04-22 institutions and sheets (S0), the endowment, then macroGenesis once, last, before any mac.* bloc row', () => {
    order.length = 0;
    const { ctx } = setup();
    macroModuleGenesis(ctx, stubPorts());
    expect(order).toEqual([...IDS.map((id) => `reg:${id}`), 'institutions', 'sheets:0.2', 'mint:MAC_GENESIS_ENDOWMENT', 'macroGenesis:0']);
  });
});
