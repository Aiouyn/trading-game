// T04-21 module.test: ModuleDef shape, dependency check, reason-code registration (E-104 (6): 459 -> 476, SINK 3, TRANSFER 14).
import { describe, expect, it } from 'vitest';
import { buildModuleSet, defineModule } from '@tycoon/engine-core';
import { LedgerWorld } from '@tycoon/engine-ledger';
import { createMacroModule, MACRO_MODULE, NULL_STAB } from '../index';
import { MACRO_INTENTS } from '../intents';
import { MACRO_REASON_ROWS, registerMacroReasonCodes } from '../reasonCodes';
import { ALL_MACRO_TABLES } from '../schema';
import { MACRO_STREAMS } from '../streams';
import { stubPorts } from '../testkit/cbWorld';

const KINDS = ['mkt.sov.bid', 'mkt.sov.bidCancel', 'mkt.sov.buybackOffer', 'mkt.sov.syndicationOrder', 'mkt.sov.exchangeVote',
  'bank.cb.repo', 'bank.cb.repoRepay', 'bank.cb.deposit', 'bank.cb.depositWithdraw', 'bank.cb.elaRequest',
  'bank.primaryDealer.apply', 'bank.primaryDealer.resign'];
// MISSING EXPORT: T03-28 LEDGER_MODULE, T02-21 TestWorld / core '02': bare units stand in for the dependency check.
const bare = (id: string, dependsOn: string[]) => defineModule({ id, module: id, dependsOn, tables: [], streams: [], phases: {}, intents: [], events: {}, invariants: [], views: [] });
const FAKE_02 = bare('02', ['19A', '23', '22A', '20A']);
const FAKE_03 = bare('03', ['02']);

describe('T04-21 MACRO_MODULE', () => {
  it('id, dependsOn, 12 intents in 04 §4 order, no invariants, streams, tables, phases P2/P4/P6/P8, boundaries {}', () => {
    const m = MACRO_MODULE;
    expect([m.id, m.module, m.dependsOn]).toEqual(['04', '04', ['03']]);
    expect(m.invariants.length).toBe(0);
    expect(m.intents.length).toBe(12);
    expect(m.intents.map((h) => h.kind)).toEqual(KINDS);
    expect(new Set(m.intents.map((h) => h.kind)).size).toBe(12);
    expect(m.intents).toEqual(MACRO_INTENTS);
    expect(m.streams).toEqual([...MACRO_STREAMS]);
    expect(m.streams.length).toBe(11);   // card: 10; E-63 added macro.nowcast
    expect(m.tables).toBe(ALL_MACRO_TABLES);
    expect(Object.keys(m.phases).sort()).toEqual(['P2', 'P4', 'P6', 'P8']);
    expect(m.boundaries).toEqual({});
    expect(m.services?.reasonCodes).toBe(MACRO_REASON_ROWS);
    expect(typeof m.genesis).toBe('function');
    expect(NULL_STAB.latestDailyReport({} as never)).toBeNull();
  });
  it('createMacroModule takes ports and stab; a second module is a fresh frozen ModuleDef', () => {
    const m = createMacroModule({ ports: stubPorts(), stab: NULL_STAB });
    expect(m).not.toBe(MACRO_MODULE);
    expect(Object.isFrozen(m)).toBe(true);
    expect(m.intents.map((h) => h.kind)).toEqual(KINDS);
  });
  it('builds with its 03 dependency; alone it fails with the missing dependency 03', () => {
    expect(() => buildModuleSet([FAKE_02, FAKE_03, MACRO_MODULE])).not.toThrow();
    expect(buildModuleSet([MACRO_MODULE, FAKE_03, FAKE_02]).intent('bank.cb.repo')?.def).toBe(MACRO_MODULE);
    expect(() => buildModuleSet([FAKE_02, MACRO_MODULE])).toThrow(/unit '04' needs '03'/);
  });
});

describe('T04-21 reason codes', () => {
  it('17 rows sorted by code, owner 4, SINK 3 / TRANSFER 14 / FAUCET 0, mayRequest per the card', () => {
    const codes = MACRO_REASON_ROWS.map((r) => r.code);
    expect(codes.length).toBe(17);
    expect([...codes].sort()).toEqual(codes);
    expect(MACRO_REASON_ROWS.every((r) => r.owner === 4)).toBe(true);
    const n = (c: string) => MACRO_REASON_ROWS.filter((r) => r.cls === c).length;
    expect([n('SINK'), n('TRANSFER'), n('FAUCET')]).toEqual([3, 14, 0]);
    const by = (c: string) => MACRO_REASON_ROWS.find((r) => r.code === c)!;
    expect(by('CAPCON_LEVY').requestableBy).toEqual([4, 5]);
    expect(by('CBK_RESERVE_PENALTY_P').requestableBy).toEqual([4, 7]);
    expect(by('CBK_RESERVE_PENALTY_W').requestableBy).toEqual([4, 7]);
    expect(by('GOV_SUBSIDY_P').requestableBy).toEqual([4, 9, 10, 11]);
    expect(by('GOV_BUYBACK').allowedTemplates).toEqual(['SWAP_ASSET']);
    expect(by('MAC_FX_CAPITAL_FLOW').allowedTemplates).toEqual(['FX']);
    expect(codes).not.toContain('MAC_GENESIS_ENDOWMENT');
  });
  it('459 -> 476 (returns 17); a second call returns 0 and leaves 476; class counts move by SINK 3, TRANSFER 14', () => {
    const w = new LedgerWorld();
    expect(w.catalog.all().length).toBe(459);
    const c0 = w.catalog.countByClass();
    expect(registerMacroReasonCodes(w.catalog)).toBe(17);
    expect(w.catalog.all().length).toBe(476);
    const c1 = w.catalog.countByClass();
    expect([c1.SINK - c0.SINK, c1.TRANSFER - c0.TRANSFER, c1.FAUCET - c0.FAUCET]).toEqual([3, 14, 0]);
    expect(registerMacroReasonCodes(w.catalog)).toBe(0);
    expect(w.catalog.all().length).toBe(476);
    for (const r of MACRO_REASON_ROWS) expect(w.catalog.mayRequest(r.code, 4)).toBe(true);
    expect(w.catalog.mayRequest('CBK_RESERVE_PENALTY_P', 7)).toBe(true);
    expect(w.catalog.mayRequest('CBK_RESERVE_PENALTY_P', 5)).toBe(false);
    expect(w.catalog.get('GOV_SUBSIDY_P')?.cls).toBe('TRANSFER');
  });
  it('a CAPCON_LEVY already present as TRANSFER throws LEDGER_EXTENSION_CONFLICT and adds nothing', () => {
    const w = new LedgerWorld();
    const cap = MACRO_REASON_ROWS.find((r) => r.code === 'CAPCON_LEVY')!;
    expect(w.catalog.registerReasonCodes(4, 'TRANSFER', [{ ...cap, cls: 'TRANSFER', allowedTemplates: ['PAY'] }])).toEqual([]);
    expect(() => registerMacroReasonCodes(w.catalog)).toThrow(/^LEDGER_EXTENSION_CONFLICT: CAPCON_LEVY /);
    expect(w.catalog.all().length).toBe(460);
  });
  it('a row equal field for field is skipped; one differing only in mayRequest conflicts', () => {
    const w = new LedgerWorld();
    const swf = MACRO_REASON_ROWS.find((r) => r.code === 'SWF_TRANSFER')!;
    expect(w.catalog.registerReasonCodes(4, 'TRANSFER', [swf])).toEqual([]);
    expect(registerMacroReasonCodes(w.catalog)).toBe(16);
    const w2 = new LedgerWorld();
    expect(w2.catalog.registerReasonCodes(4, 'TRANSFER', [{ ...swf, requestableBy: [4, 5] }])).toEqual([]);
    expect(() => registerMacroReasonCodes(w2.catalog)).toThrow(/LEDGER_EXTENSION_CONFLICT: SWF_TRANSFER/);
  });
});
