/**
 * Tape section 0 and the v1.7 foundation rows (tape-company-building.md, re-targeted to Quant v1.7). Each test name
 * carries the Tape check id. Layer: U (unit), with L (static) where the check is about the source text. Rows that need a
 * seed sweep or the engine run are in the balance script (scripts/balance/company-tape.ts). Rows with no runnable form in
 * this build are recorded as skipped in wait-register.test.ts, not as passes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../../types';
import { advanceTo, companyOf, founded, listedWorld, totalMoney } from '../b1fixture';
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

  it('co_determinism (save and load mid-quarter): a JSON save taken at day 40 (mid-quarter) and reloaded runs to the same state as the live world at day 80', () => {
    const { g: live } = founded('det-save');
    advanceTo(live, 40);
    // the save is the plain JSON of the whole world, as the host writes it; the reload is a fresh object from that text
    const reloaded = JSON.parse(JSON.stringify(live)) as GameState;
    advanceTo(live, 80);
    advanceTo(reloaded, 80);
    expect(JSON.stringify(reloaded.companies)).toBe(JSON.stringify(live.companies));
    expect(JSON.stringify(reloaded.market.accounts)).toBe(JSON.stringify(live.market.accounts));
  });

  it('co_determinism (save and load in the window and with a listed company): the reloaded listed world matches the live one at day 260', () => {
    const { g: live } = listedWorld('det-listed');
    advanceTo(live, 230);
    const reloaded = JSON.parse(JSON.stringify(live)) as GameState;
    advanceTo(live, 260);
    advanceTo(reloaded, 260);
    expect(JSON.stringify(reloaded.companies)).toBe(JSON.stringify(live.companies));
  });

  it('co_ledger_balances: money is conserved across the company day step (faucet and sink tracked, 2 quarters)', () => {
    const { g } = founded('ledger-1');
    const booked = () => totalMoney(g) + g.companies!.flows.sink - g.companies!.flows.faucet;
    const before = booked();
    advanceTo(g, 130);
    // a non-trivial run: the company must have booked flows, or the identity holds only because nothing moved
    expect(g.companies!.flows.faucet + g.companies!.flows.sink).toBeGreaterThan(0);
    expect(Math.abs(booked() - before)).toBeLessThan(1e-6);
  });

  it('filing_hash_match: each public filing carries the hash of the frozen statements it covers, and a changed statement changes the hash', () => {
    const { g } = founded('hash-1');
    advanceTo(g, 130);
    const c = companyOf(g);
    expect(c.filings.length).toBeGreaterThanOrEqual(2);
    for (const f of c.filings) {
      expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
      const frozen = c.closed.find((s) => s.quarter === f.quarter);
      expect(frozen, `frozen statements for quarter ${f.quarter}`).toBeDefined();
      if (!frozen) continue;
      expect(statementsHash(frozen)).toBe(f.hash);
      // a tampered copy of the frozen statements (one revenue cent) no longer matches the filed hash
      const tampered = { ...frozen, revenue: frozen.revenue + 0.01 } as typeof frozen;
      expect(statementsHash(tampered)).not.toBe(f.hash);
    }
  });

  it('public_view_schema: the public view carries the v1.7 filed fields (unitCost) and no private names', () => {
    const { g } = listedWorld('schema-1');
    const c = companyOf(g);
    const v = publicCompanyView(c, 230) as unknown as Record<string, unknown>;
    for (const key of ['id', 'name', 'sector', 'tier', 'filings', 'signals', 'credibility', 'insiderTrades', 'distressFlag',
      'buybackPrograms', 'plans', 'planSkips', 'window']) {
      expect(v).toHaveProperty(key);
    }
    for (const priv of ['capTable', 'planRows', 'planSeq', 'orders', 'ipo', 'npcs', 'qtd', 'cash', 'ownerId', 'closed', 'treasuryId']) {
      expect(v).not.toHaveProperty(priv);
    }
    expect(c.filings.length).toBeGreaterThan(0);
    for (const f of publicCompanyView(c, 230).filings) expect(typeof f.unitCost).toBe('number');
  });

  it('co_no_split_api (L): the company action set has no split and the command union has no company split', () => {
    const cmd = src('src/world/game.ts') + src('src/world/company/bridge.ts') + src('src/world/company/company.ts');
    expect(cmd).not.toMatch(/company\.split/);
    expect(cmd).not.toMatch(/kind: 'split'/);
  });

  it('co_no_governance_term (L): the valuation module imports no governance module and names no AGM or vote term', () => {
    // the executives' coefficient is read through execMult in governance.ts (a CEO-trait multiplier); valuation.ts takes
    // no governance input at all, so a twin with a different governance state has the same value
    const v = src('src/world/company/valuation.ts');
    expect(v).not.toMatch(/from '\.\/governance'|agm|AGM|shareholderVote/);
  });

  it('consensus_margin_unit_cost (G23): the consensus unit cost moves with the public index by the material part only', () => {
    const { g } = listedWorld('gp-1');
    const c = companyOf(g);
    const last = c.filings[c.filings.length - 1]!;
    expect(last.inputIndex).toBeGreaterThan(0);
    expect(last.matUnit).toBeGreaterThan(0); // without a material part the index could not move the cost at all
    // the formula, not a restatement of it: a 20% index move shifts the filed cost by matUnit x 0.2, and nothing else
    const moved = consensusUnitCost(last, last.inputIndex * 1.2);
    expect(moved).toBeCloseTo(last.unitCost + last.matUnit * 0.2, 12);
    expect(consensusUnitCost(last, last.inputIndex)).toBe(last.unitCost);
    // the consensus gross profit uses that cost, and the filed unit cost is what the public sees (G23)
    expect(publicCompanyView(c, 230).filings[publicCompanyView(c, 230).filings.length - 1]!.unitCost).toBe(last.unitCost);
  });
});
