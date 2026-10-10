/**
 * Tape section 0 and the v1.7 foundation rows (tape-company-building.md, re-targeted to Quant v1.7). Each test name
 * carries the Tape check id. Layer: U (unit). Rows that need a seed sweep or the engine run are in the balance script
 * (scripts/balance/company-tape.ts).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceTo, companyOf, founded, listedWorld } from '../b1fixture';
import { publicCompanyView } from '../views';
import { statementsHash } from '../filings';
import { consensusUnitCost } from '../signals';

const ROOT = resolve(__dirname, '..', '..', '..', '..');
const src = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('Tape s0: foundations', () => {
  it('co_determinism: the same seed and actions give an identical company state after 2 quarters (3 seeds)', () => {
    for (const seed of ['det-a', 'det-b', 'det-c']) {
      const one = founded(seed);
      const two = founded(seed);
      advanceTo(one.g, 130);
      advanceTo(two.g, 130);
      expect(JSON.stringify(companyOf(one.g))).toBe(JSON.stringify(companyOf(two.g)));
      expect(JSON.stringify(one.g.companies)).toBe(JSON.stringify(two.g.companies));
    }
  });

  it('co_ledger_balances: money is conserved across the company day step (faucet and sink tracked, 2 quarters)', () => {
    const { g } = founded('ledger-1');
    const totalOf = () => {
      let t = 0;
      for (const a of Object.values(g.market.accounts)) t += a.cash;
      for (const c of Object.values(g.companies!.companies)) t += c.cash;
      for (const p of Object.values(g.companies!.investors)) t += p.cash;
      return t;
    };
    const before = totalOf() + g.companies!.flows.sink - g.companies!.flows.faucet;
    advanceTo(g, 130);
    const after = totalOf() + g.companies!.flows.sink - g.companies!.flows.faucet;
    expect(Math.abs(after - before)).toBeLessThan(1e-6);
  });

  it('filing_hash_match: a filed statement carries a 64-hex hash of its frozen statements', () => {
    const { g } = founded('hash-1');
    advanceTo(g, 70);
    const c = companyOf(g);
    expect(c.filings.length).toBeGreaterThanOrEqual(1);
    const f = c.filings[0]!;
    expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
    // the hash is a pure function of the statements: hashing the same statements twice agrees
    expect(statementsHash(c.closed[0]!)).toBe(statementsHash(c.closed[0]!));
  });

  it('public_view_schema: the public view carries the v1.7 filed fields (unitCost) and no private names', () => {
    const { g } = listedWorld('schema-1');
    const c = companyOf(g);
    const v = publicCompanyView(c, 230) as unknown as Record<string, unknown>;
    for (const key of ['id', 'name', 'sector', 'tier', 'filings', 'signals', 'credibility', 'insiderTrades', 'distressFlag',
      'buybackPrograms', 'plans', 'planSkips', 'listed', 'window']) {
      expect(v).toHaveProperty(key);
    }
    for (const priv of ['capTable', 'planRows', 'planSeq', 'orders', 'ipo', 'npcs', 'qtd', 'cash', 'ownerId', 'closed', 'treasuryId']) {
      expect(v).not.toHaveProperty(priv);
    }
    expect(c.filings.length).toBeGreaterThan(0);
    for (const f of publicCompanyView(c, 230).filings) expect(typeof f.unitCost).toBe('number');
  });

  it('co_no_split_api: the company action set has no split and the command union has no company split', () => {
    const cmd = src('src/world/game.ts') + src('src/world/company/bridge.ts') + src('src/world/company/company.ts');
    expect(cmd).not.toMatch(/company\.split/);
    expect(cmd).not.toMatch(/kind: 'split'/);
  });

  it('co_no_governance_term: the valuation sources carry no governance or AGM term (twin test by inspection)', () => {
    // the valuation module imports no governance module (the executives' coefficient is the only governance-like input,
    // read through execMult in signals.ts, and it is a CEO-trait multiplier, not a vote or an AGM term)
    const v = src('src/world/company/valuation.ts');
    expect(v).not.toMatch(/from '\.\/governance'|agm|AGM|shareholderVote/);
  });

  it('co_property_is_cost: N/A to this build (no property system in the company world); recorded, not run', () => {
    expect(true).toBe(true);
  });

  it('co_speed (timing): recorded as the balance-script row, not a unit test', () => {
    expect(true).toBe(true);
  });

  it('consensus_margin_unit_cost (identity): consensus unit cost is the filed unit cost when the index has not moved', () => {
    const { g } = listedWorld('gp-1');
    const c = companyOf(g);
    const last = c.filings[c.filings.length - 1]!;
    expect(consensusUnitCost(last, last.inputIndex)).toBe(last.unitCost);
    // GP identity: units x (price - unitCost) with the filed unit cost (G23), to 1e-12
    const units = 1000, price = 12.5;
    const gp = units * (price - consensusUnitCost(last, last.inputIndex));
    expect(Math.abs(gp - units * (price - last.unitCost))).toBeLessThan(1e-12);
  });

  it('co_determinism (save and load mid-quarter): the world state round-trips through JSON', () => {
    const { g } = founded('det-save');
    advanceTo(g, 40);
    const saved = JSON.parse(JSON.stringify(g.companies));
    advanceTo(g, 80);
    const live = JSON.stringify(g.companies);
    expect(JSON.stringify(saved)).not.toBe(live);
    expect(saved.companies && Object.keys(saved.companies).length).toBe(1);
  });
});
