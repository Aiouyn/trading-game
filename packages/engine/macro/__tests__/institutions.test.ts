// T04-22: authored institutions and opening balance sheets, on a real LedgerWorld (03) with macroWorld's params.
import { describe, expect, it, vi } from 'vitest';
import { fromMoney, toMoney, type Ccy, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId, govId, LedgerWorld } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import { genesisNominalGdp, launchDebtSplit, macroGenesis } from '../core/genesis';
import { EXA_ID, MACRO_INSTITUTION_IDS, openingReservesFdl, openingSrlFdlCash, openingTreasuryCash, postOpeningBalanceSheets,
  registerMacroInstitutions, WORLD_COURT_IDS } from '../institutions';
import { macroTables, type BlocMacroState } from '../schema';
import { macroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';
import { cashShadow } from '../testkit/cashShadow';
import { runDays } from '../testkit/macroLoop';
import { defaultMacroPorts } from '../ports';
import type { CentralBank } from '../schema';

// MISSING EXPORT T03-08 LedgerApi.registerEntity: the stub forwards to the test's LedgerWorld.
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn(),
  registerEntity: (ctx: { world: LedgerWorld }, spec: { id: string }) => ctx.world.registerEntity(spec) }));

vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));

const NON_FDL = ['EUN', 'PYN', 'NKR', 'SRL'] as const;
const CCYS: Ccy[] = ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'];

function setup(over: Record<string, number> = {}) {
  const mw = macroWorld('g', 0); mw.nums(over);
  const w = new LedgerWorld();
  for (const b of CCYS) w.registerEntity({ id: govId(b), reportingCcy: b });   // T04-21 registerMacroEntities (not built yet)
  const p = mw.ctx.params, S0 = p.num('macro_scale_min');
  const ctx = { world: w, params: p, ledger: w.apiFor('04').ledger } as unknown as PhaseCtx;
  return { w, p, S0, ctx, mw };
}
function post(over: Record<string, number> = {}) {
  const x = setup(over), m0 = CCYS.map((c) => x.w.aggregates(c).M0_sys), n0 = x.w.entryLog().length;
  registerMacroInstitutions(x.ctx); postOpeningBalanceSheets(x.ctx, x.p, x.S0);
  const r = x.w.runP13();
  const entries = x.w.entryLog().slice(n0).filter((e) => e.reason === 'MAC_GENESIS_ENDOWMENT');
  return { ...x, r, entries, dM0: CCYS.map((c, i) => x.w.aggregates(c).M0_sys - m0[i]) };
}
const sumBy = (es: { postings: unknown[]; headline?: { amount: bigint; ccy: Ccy } }[], c: Ccy) => es.reduce((a, e) => (e.headline?.ccy === c ? a + e.headline.amount : a), 0n);

describe('T04-22 institutions', () => {
  it('AC-04-22-1: 15 ids in step 1 order, kinds, ccys, null owners; a second call changes nothing', () => {
    expect(MACRO_INSTITUTION_IDS).toEqual(['reg_FDL', 'crt_FDL', 'reg_EUN', 'crt_EUN', 'reg_PYN', 'crt_PYN', 'reg_NKR', 'crt_NKR', 'reg_SRL', 'crt_SRL',
      'sys_EXA', 'sys_STAB', 'crt_MCC', 'crt_GCB', 'crt_TCHA']);
    expect([EXA_ID, ...WORLD_COURT_IDS]).toEqual(['sys_EXA', 'crt_MCC', 'crt_GCB', 'crt_TCHA']);
    const { w, ctx } = setup();
    registerMacroInstitutions(ctx);
    const ents = MACRO_INSTITUTION_IDS.map((id) => w.entity(id)!);
    const kinds = ents.map((e) => e.kind);
    expect([kinds.filter((k) => k === 'reg').length, kinds.filter((k) => k === 'crt').length, kinds.filter((k) => k === 'sys').length]).toEqual([5, 8, 2]);
    expect(ents.map((e) => e.reportingCcy)).toEqual(['FDL', 'FDL', 'EUN', 'EUN', 'PYN', 'PYN', 'NKR', 'NKR', 'SRL', 'SRL', 'FDL', 'FDL', 'FDL', 'FDL', 'FDL']);
    expect(ents.every((e) => e.ownerId === null)).toBe(true);
    const h = w.snapshot();
    registerMacroInstitutions(ctx);
    expect(w.snapshot()).toBe(h);
  });

  it('AC-04-22-2: 10 opening postings; exact treasury and reserve balances; S0 = 1 scales by 5; step 1 entities hold 0', () => {
    const { w, p, S0, r, entries } = post();
    expect(r.failures).toEqual([]);
    expect(entries.length).toBe(10);
    expect(w.cash('gov_FDL', 'FDL')).toBe(157440000000000000n);
    expect(w.cash('gov_PYN', 'PYN')).toBe(640000000000000000n);
    for (const b of CCYS) expect(w.cash(govId(b), b)).toBe(openingTreasuryCash(b, S0, p));
    for (const b of NON_FDL) expect(w.cash(cbkId(b), 'FDL')).toBe(openingReservesFdl(b, S0, p));
    expect(fromMoney(openingReservesFdl('SRL', S0, p))).toBeCloseTo(1.0154e12, -8);
    for (const id of MACRO_INSTITUTION_IDS) for (const c of CCYS) expect(w.cash(id, c)).toBe(0n);
    const one = post({ macro_scale_min: 1 });
    expect([one.w.cash('gov_FDL', 'FDL'), one.w.cash('gov_PYN', 'PYN')]).toEqual([787200000000000000n, 3200000000000000000n]);
  });

  it('AC-04-22-3: a zero param posts nothing; cover 3 for SRL; one FAUCET per non-zero param; invariants and ΔM0_sys', () => {
    const { w, r, entries, dM0 } = post({ mac_gov_cash0_gdp_PYN: 0, mac_cbk_reserve_cover0_SRL: 3 });
    expect(r.failures).toEqual([]);
    expect(r.failedInvariants.filter((i) => i === 'INV-LED-001' || i === 'INV-LED-003')).toEqual([]);
    expect(w.cash('gov_PYN', 'PYN')).toBe(0n);
    expect(entries.some((e) => e.headline?.ccy === 'PYN')).toBe(false);
    expect(w.cash('cbk_SRL', 'FDL')).toBe(toMoney(3 * 0.4 * 1.5e13 * 0.2 / 13, 'FDL'));
    expect(entries.length).toBe(9);
    expect(dM0).toEqual(CCYS.map((c) => sumBy(entries, c)));
  });

  it('AC-04-22-4: genesis reservesFdl equals the minted amounts; cover 4/10/4/11; range throws before any posting', () => {
    const { w, p, S0 } = post(), mw = macroWorld('g', 0);
    macroGenesis(mw.ctx, stubPorts());
    for (const b of NON_FDL) {
      const st = mw.store.get<BlocMacroState>(macroTables.bloc.name, b)!, d = BLOC_DEFAULTS[b];
      expect(st.fx.reservesFdl).toBe(w.cash(cbkId(b), 'FDL'));
      const cover = fromMoney(st.fx.reservesFdl) / (d.openness * fromMoney(genesisNominalGdp(b, S0, p)) * d.fx0 / 13);
      expect(Math.abs(cover - { EUN: 4, PYN: 10, NKR: 4, SRL: 11 }[b])).toBeLessThan(1e-9);
      expect(st.fx.reserveCoverMonths).toBe({ EUN: 4, PYN: 10, NKR: 4, SRL: 11 }[b]);
    }
    for (const bad of <Record<string, number>[]>[{ mac_gov_cash0_gdp_NKR: -0.01 }, { mac_gov_cash0_gdp_SRL: 0.2501 }, { mac_cbk_reserve_cover0_SRL: 36.01 }, { mac_cbk_reserve_cover0_EUN: -1 }]) {
      const x = setup(bad), n0 = x.w.entryLog().length;
      expect(() => postOpeningBalanceSheets(x.ctx, x.p, x.S0)).toThrow(expect.objectContaining({ code: 'MAC_PARAM_RANGE' }));
      x.w.runP13();
      expect(x.w.entryLog().length).toBe(n0);
    }
  });

  it('AC-04-22-4 (E-106 (3)): cb.reserves.fdl = ledger cash(cbk_<b>, FDL) after genesis and close 1; close-1 cover within 0.05 of genesis', () => {
    const mw = macroWorld('g', 0), ports = defaultMacroPorts(), sh = cashShadow(mw.ctx), p = mw.ctx.params;
    postOpeningBalanceSheets(mw.ctx, p, p.num('macro_scale_min'));
    macroGenesis(mw.ctx, ports);
    const at = (b: (typeof NON_FDL)[number]) => ({ st: mw.store.get<BlocMacroState>(macroTables.bloc.name, b)!.fx, cb: mw.store.get<CentralBank>(macroTables.cb.name, cbkId(b))! });
    const g = Object.fromEntries(NON_FDL.map((b) => [b, at(b).st.reserveCoverMonths]));
    for (const b of NON_FDL) expect([at(b).cb.reserves.fdl, at(b).st.reservesFdl]).toEqual([sh.cash(cbkId(b), 'FDL'), sh.cash(cbkId(b), 'FDL')]);
    expect(g).toEqual({ EUN: 4, PYN: 10, NKR: 4, SRL: 11 });
    runDays(mw, ports, 0, 1);
    for (const b of NON_FDL) {
      expect(at(b).cb.reserves.fdl).toBe(sh.cash(cbkId(b), 'FDL'));
      expect(Math.abs(at(b).st.reserveCoverMonths - g[b]!)).toBeLessThan(0.05);
    }
  }, 60_000);

  it('AC-04-22-6: SRL FDL treasury cash, day-182 coupon margin, 0 posts nothing, 0.06 throws', () => {
    const a = post(), b = post({ macro_scale_min: 1 });
    expect([a.w.cash('gov_SRL', 'FDL'), b.w.cash('gov_SRL', 'FDL')]).toEqual([22176000000000000n, 110880000000000000n]);
    const margin = (x: { p: PhaseCtx['params']; S0: number }) => openingSrlFdlCash(x.S0, x.p) - launchDebtSplit('SRL', x.S0, x.p).fdlUnits * 1000n * 1000000n * 32n / 1000n;
    expect([margin(a), margin(b)]).toEqual([2016000000000000n, 10080000000000000n]);
    const z = post({ mac_gov_fdlcash0_gdp_SRL: 0 });
    expect(z.w.cash('gov_SRL', 'FDL')).toBe(0n);
    expect(z.entries.length).toBe(9);
    const x = setup({ mac_gov_fdlcash0_gdp_SRL: 0.06 }), n0 = x.w.entryLog().length;
    expect(() => postOpeningBalanceSheets(x.ctx, x.p, x.S0)).toThrow(expect.objectContaining({ code: 'MAC_PARAM_RANGE' }));
    x.w.runP13();
    expect(x.w.entryLog().length).toBe(n0);
  });
});
