// T03-01 account-key codec and authored ids (src/accounts.ts per E-79).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  accountKey, CCP_ID, cbkId, ENTITY_KINDS, entityOfKey, frmId, govId, hhId, kindOfId, parseAccountKey, ROW_ID, SERENA_AUTHORITY_GOV,
  suspenseSub, SYS_ID, type Ccy,
} from '../src';

const CCYS: Ccy[] = ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'];

describe('T03-01 accountKey', () => {
  it('formats the card examples', () => {
    expect(accountKey('chr_A', 1500, 'FDL', 'ast_EQ_HALC')).toBe('chr_A:1500:ast_EQ_HALC:FDL');
    expect(accountKey('sys_SYSTEM', 9900, 'EUN', 'P1->P2')).toBe('sys_SYSTEM:9900:P1->P2:EUN');
    expect(accountKey('chr_A', 1001, 'FDL')).toBe('chr_A:1001:FDL');
    expect(parseAccountKey('sys_SYSTEM:9900:P1->P2:EUN')).toEqual({ entityId: 'sys_SYSTEM', code: 9900, sub: 'P1->P2', ccy: 'EUN' });
  });
  it('sub with colons round-trips', () => {
    const k = accountKey('biz_1', 1001, 'SRL', 'RESTRICTED:51840:AD_GRANT');
    expect(k).toBe('biz_1:1001:RESTRICTED:51840:AD_GRANT:SRL');
    expect(parseAccountKey(k)).toEqual({ entityId: 'biz_1', code: 1001, sub: 'RESTRICTED:51840:AD_GRANT', ccy: 'SRL' });
    expect(parseAccountKey(accountKey('chr_A', 1010, 'FDL', 'bnk_x:term_y'))?.sub).toBe('bnk_x:term_y');
    expect(entityOfKey(k)).toBe('biz_1');
  });
  it('rejects malformed keys with undefined (E-79: no throw)', () => {
    expect(parseAccountKey('chr_A:1001')).toBeUndefined();
    expect(parseAccountKey('chr_A:101:FDL')).toBeUndefined();
    expect(parseAccountKey('chr_A:1001:XXX')).toBeUndefined();
    expect(parseAccountKey('zzz_A:1001:FDL')).toBeUndefined();
  });
  it('round-trips random ids, codes, subs and currencies', () => {
    const entityId = fc.tuple(fc.constantFrom(...ENTITY_KINDS), fc.stringMatching(/^[A-Za-z0-9_]{1,12}$/)).map(([k, s]) => `${k}_${s}`);
    const sub = fc.option(fc.stringMatching(/^[A-Za-z0-9_:>-]{1,20}$/), { nil: undefined });
    fc.assert(fc.property(entityId, fc.integer({ min: 1000, max: 9999 }), fc.constantFrom(...CCYS), sub, (e, code, ccy, s) => {
      const k = accountKey(e, code, ccy, s);
      expect(parseAccountKey(k)).toEqual({ entityId: e, code, sub: s, ccy });
      expect(entityOfKey(k)).toBe(e);
    }), { numRuns: 2000, seed: 301 });
  });
});

describe('T03-01 authored ids', () => {
  it('builds the authored system ids', () => {
    expect(SYS_ID).toBe('sys_SYSTEM');
    expect(cbkId('EUN')).toBe('cbk_EUN');
    expect(govId('PYN')).toBe('gov_PYN');
    expect(frmId('NKR')).toBe('frm_NKR');
    expect(hhId('c07')).toBe('hh_c07');
    expect(ROW_ID).toBe('row_WORLD');
    expect(CCP_ID).toBe('ccp_TCH');
    expect(SERENA_AUTHORITY_GOV).toBe('gov_FDL');
    expect(suspenseSub('P1', 'P2')).toBe('P1->P2');
  });
  it('kindOfId reads the prefix before the first underscore', () => {
    expect(kindOfId('chr_01H')).toBe('chr');
    expect([SYS_ID, cbkId('FDL'), govId('FDL'), frmId('FDL'), hhId('x'), ROW_ID, CCP_ID].map(kindOfId)).toEqual(['sys', 'cbk', 'gov', 'frm', 'hh', 'row', 'ccp']);
    expect(kindOfId('foo_1')).toBeUndefined();
  });
});
