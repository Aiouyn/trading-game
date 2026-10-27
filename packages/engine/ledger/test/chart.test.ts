// T03-01 chart of accounts (03 §3.2) as data in src/accounts.ts (E-79).
import { describe, expect, it } from 'vitest';
import { CHART, chartEntry, classOfCode, ENTITY_KINDS, isMoneyCode, kindMayUse, MARKETABLE_CODES, type EntityKind } from '../src';

/** Every code of 03 §3.2: 1xxx (60), 2xxx (42), 3xxx (12), 4xxx (18), 5xxx (30), 6xxx (3), 9xxx (6). */
const EXPECTED = [
  1001, 1002, 1003, 1009, 1010, 1050, 1060, 1070, 1100, 1110, 1120, 1130, 1140, 1150, 1160, 1190, 1200, 1210, 1220, 1221,
  1230, 1300, 1301, 1302, 1303, 1304, 1305, 1306, 1307, 1309, 1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1570, 1580,
  1600, 1700, 1710, 1720, 1730, 1740, 1800, 1810, 1830, 1839, 1840, 1850, 1860, 1870, 1880, 1900, 1909, 1910, 1950, 1999,
  2001, 2002, 2003, 2100, 2110, 2120, 2130, 2140, 2150, 2160, 2200, 2201, 2202, 2203, 2206, 2300, 2310, 2320, 2330, 2400,
  2410, 2420, 2430, 2500, 2510, 2520, 2530, 2540, 2550, 2560, 2570, 2580, 2590, 2600, 2700, 2710, 2800, 2900, 2909, 2950,
  2990, 2999, 3100, 3110, 3150, 3200, 3300, 3400, 3500, 3600, 3700, 3800, 3900, 3990, 4000, 4010, 4020, 4030, 4040, 4050,
  4060, 4070, 4080, 4090, 4100, 4110, 4120, 4130, 4140, 4150, 4190, 4900, 5000, 5010, 5020, 5030, 5040, 5050, 5060, 5070,
  5080, 5090, 5100, 5110, 5120, 5130, 5140, 5150, 5160, 5170, 5180, 5190, 5200, 5210, 5220, 5230, 5240, 5250, 5260, 5270,
  5280, 5900, 6000, 6010, 6020, 9100, 9110, 9200, 9300, 9900, 9910,
];

describe('T03-01 chart', () => {
  it('(a) has exactly the 03 §3.2 codes (171)', () => {
    expect(EXPECTED.length).toBe(171);
    expect(CHART.size).toBe(EXPECTED.length);
    expect(CHART.keys()).toEqual([...EXPECTED].sort((a, b) => a - b).map((c) => String(c).padStart(4, '0')));
    for (const c of EXPECTED) expect(chartEntry(c)?.code).toBe(c);
    expect(chartEntry(7000)).toBeUndefined();
    expect(chartEntry(1.5)).toBeUndefined();
  });
  it('uses the exact spec names and sub meanings', () => {
    expect(chartEntry(1001)?.name).toBe('Settlement cash');
    expect(chartEntry(1309)?.name).toBe('Allowance for credit losses (contra-asset)');
    expect(chartEntry(2999)?.name).toBe('Suspense');
    expect(chartEntry(3990)?.name).toBe('Net issuance');
    expect(chartEntry(4110)?.name).toBe('Faucet income (start cash, grants, ads, rewards, compensation)');
    expect(chartEntry(5900)?.name).toBe('Net issuance expense (sys only)');
    expect(chartEntry(6020)?.name).toBe('Withholding tax suffered (non-creditable part)');
    expect(chartEntry(9900)?.name).toBe('Interpartition suspense');
    expect(chartEntry(1001)?.subMeaning).toBeNull();
    expect(chartEntry(1010)?.subMeaning).toBe('bnkId');
    expect(chartEntry(1003)?.subMeaning).toBe('sub-accounts: GENERAL, DEPOSIT_INSURANCE_FUND');
    expect(chartEntry(2400)?.subMeaning).toBe('jurisdiction:taxType:year');
    expect(chartEntry(3100)?.subMeaning).toBe('shareClass');
    expect(chartEntry(3800)?.subMeaning).toBe('ccy');
    expect(chartEntry(3110)?.subMeaning).toBeNull();
    expect(chartEntry(4000)?.subMeaning).toBe('segment, counterparty class or asset');
    expect(chartEntry(5000)?.subMeaning).toBeNull();
    expect(chartEntry(9900)?.subMeaning).toBe('A->B');
  });
  it('(b) class by first digit; contra flags on 1309/1839/3150', () => {
    const want = { 1: 'ASSET', 2: 'LIABILITY', 3: 'EQUITY', 4: 'INCOME', 5: 'EXPENSE', 6: 'EXPENSE', 9: 'MEMO' } as const;
    for (const e of CHART.values()) {
      expect(e.cls).toBe(want[Math.floor(e.code / 1000) as keyof typeof want]);
      expect(classOfCode(e.code)).toBe(e.cls);
    }
    expect(CHART.values().filter((e) => e.contra).map((e) => e.code)).toEqual([1309, 1839, 3150]);
    expect([chartEntry(1309)?.cls, chartEntry(1839)?.cls, chartEntry(3150)?.cls]).toEqual(['ASSET', 'ASSET', 'EQUITY']);
  });
  it('qtyBearing, mustBeZeroAtP13, consolidatedOnly and isMoney are exactly the card lists', () => {
    const pick = (f: (e: { qtyBearing: boolean; mustBeZeroAtP13: boolean; consolidatedOnly: boolean; isMoney: boolean }) => boolean) =>
      CHART.values().filter(f).map((e) => e.code);
    expect(pick((e) => e.qtyBearing)).toEqual([1200, 1210, 1220, 1221, 1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1570, 1580, 1800, 1850, 1860,
      1870, 1880, 2300, 2310, 2320, 2330, 3100, 3150, 9100, 9110]);
    expect(pick((e) => e.mustBeZeroAtP13)).toEqual([1999, 2999]);
    expect(pick((e) => e.consolidatedOnly)).toEqual([3500, 3600]);
    expect(pick((e) => e.isMoney)).toEqual([1001, 1002, 1003, 1010]);
  });
  it('kinds are exactly the card step 2 rows; everything else ALL', () => {
    const restricted: Record<number, EntityKind[]> = {
      1003: ['gov'], 1009: ['hh', 'frm', 'row'], 1307: ['cbk'], 1909: ['sys'], 1910: ['cbk'], 2001: ['cbk'], 2002: ['cbk'], 2003: ['cbk'],
      2100: ['bnk'], 2140: ['ccp', 'bnk'], 2150: ['ccp', 'crt'], 2160: ['ccp', 'crt'], 2310: ['gov'], 2320: ['spv'], 2700: ['ins'], 2710: ['ins'],
      2900: ['sys'], 2909: ['sys'], 2950: ['biz', 'prop'], 3700: ['fnd'], 3900: ['chr', 'ali'], 3990: ['sys'], 4900: ['sys'], 5900: ['sys'], 9900: ['sys'],
    };
    for (const e of CHART.values()) {
      const r = restricted[e.code];
      if (r === undefined) expect(e.kinds, String(e.code)).toBe('ALL');
      else expect([...(e.kinds as EntityKind[])].sort()).toEqual([...r].sort());
      for (const k of ENTITY_KINDS) expect(kindMayUse(e.code, k)).toBe(r === undefined || r.includes(k));
    }
  });
  it('(c) isMoneyCode: 1009 only for elastic kinds', () => {
    expect(isMoneyCode(1009, 'hh')).toBe(true);
    expect(isMoneyCode(1009, 'chr')).toBe(false);
  });
  it('(d) kindMayUse(2100) only for bnk; unknown code false', () => {
    expect(kindMayUse(2100, 'chr')).toBe(false);
    expect(kindMayUse(2100, 'bnk')).toBe(true);
    expect(kindMayUse(7000, 'sys')).toBe(false);
  });
  it('(e) MARKETABLE_CODES is the 03 §3.3.8 list and excludes 1220', () => {
    expect(MARKETABLE_CODES).toEqual([1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1600, 2600, 1210, 1870]);
    expect(MARKETABLE_CODES).not.toContain(1220);
  });
});
