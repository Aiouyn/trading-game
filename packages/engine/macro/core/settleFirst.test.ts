// AC-04-11-SETTLEFIRST as restated by E-104 (3): 04 posts no servicing, so issuance postings are checked against the sovCase.payments() schedule
// and the posting tick. The CASHFLOOR runs need 06 (absent), so this runs the 04-alone tick loop (genesis to DAY_CLOSE of day 364, default ports).
import { describe, expect, it, vi } from 'vitest';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { MICRO_N, TICKS_PER_GAME_DAY as D, type Id } from '@tycoon/engine-core';
import { govId } from '@tycoon/engine-ledger';
import { defaultMacroPorts } from '../ports';
import { BLOC_ORDER, type BlocId } from '../schema';
import { macroWorld } from '../testkit/macroWorld';
import { runDays } from '../testkit/macroLoop';
import { govLines, payments, type GovLine } from '../rules/sovCase';
import { BOOK_TICK } from '../rules/syndication';
import { macroGenesis } from './genesis';

const ISSUE = ['SOV_BOND_ISSUE', 'SOV_DEBT_ELASTIC_PLACEMENT'], DAYS = 365;
interface Iss { tick: number; gov: Id; ccy: string; code: string; assetId: string }
interface Pay { gov: Id; ccy: string; day: number; assetId: string; principal: bigint }
const ports = defaultMacroPorts(), w = macroWorld('settlefirst', 0);
const iss: Iss[] = [], pays: Pay[] = [];
macroGenesis(w.ctx, ports);
{
  const L = w.ctx.ledger, el = L.elasticIn.bind(L), sw = L.swapAsset.bind(L);
  L.elasticIn = ((sector: Id, to: Id, amt: bigint, ccy: string, code: string, o?: { refs?: string[] }) => {
    if (ISSUE.includes(code)) iss.push({ tick: w.ctx.tick, gov: to, ccy, code, assetId: o?.refs?.[0] ?? '' });
    return el(sector, to, amt, ccy as never, code as never, o as never);
  }) as typeof L.elasticIn;
  L.swapAsset = ((buyer: Id, seller: Id, assetId: string, q: bigint, amt: bigint, ccy: string, code: string) => {
    if (ISSUE.includes(code)) iss.push({ tick: w.ctx.tick, gov: seller, ccy, code, assetId });
    return sw(buyer, seller, assetId as never, q, amt, ccy as never, code as never);
  }) as typeof L.swapAsset;
}
for (let d = 0; d < DAYS; d++) {
  for (const b of BLOC_ORDER) for (const l of govLines(w.store, b, ports)) for (const p of payments(l, d * D - 1, d * D + D - 1))
    pays.push({ gov: govId(b), ccy: l.ccy, day: d, assetId: l.assetId, principal: p.principal });
  runDays(w, ports, d, d + 1);
  w.reads.length = 0; w.events.length = 0; w.cb.posts.length = 0; w.cb.events.length = 0; w.cb.sent.length = 0;
}

describe('AC-04-11-SETTLEFIRST (E-104 (3), 04 alone)', () => {
  it('(a) every issuance posting is at tick-of-day 330 or 420', () => {
    expect(iss.length).toBeGreaterThan(100);
    expect(iss.some((x) => x.code === 'SOV_DEBT_ELASTIC_PLACEMENT')).toBe(true);   // no players, so no SOV_BOND_ISSUE awards here
    for (const x of iss) expect([330, 420], `${x.code} ${x.assetId} ${x.tick}`).toContain(x.tick % D);
    expect(iss.some((x) => x.tick % D === 330)).toBe(true);   // no syndication prices in this year of the 04-alone run
  });
  it('(b) on each (government, currency, day) with issuance and a payments() entry, the last issuance tick < d·D + 719', () => {
    let n = 0;
    for (const p of pays) {
      const same = iss.filter((x) => x.gov === p.gov && x.ccy === p.ccy && Math.floor(x.tick / D) === p.day);
      if (same.length === 0) continue;
      n++;
      expect(Math.max(...same.map((x) => x.tick)), `${p.gov} ${p.ccy} day ${p.day}`).toBeLessThan(p.day * D + 719);
    }
    expect(n).toBeGreaterThan(10);
  });
  it('(c) FDL day 91: B3M and B6M post at 65,850 < 66,239, the day payments() lists the 912,000,000,000 B3M launch-line redemption', () => {
    const fdl = govId('FDL' as BlocId), day91 = iss.filter((x) => x.gov === fdl && Math.floor(x.tick / D) === 91);
    expect(91 * D + 330).toBe(65_850); expect(91 * D + 719).toBe(66_239);
    const at = day91.filter((x) => x.tick === 65_850).map((x) => x.assetId);
    expect(at.some((a) => a.includes('_B3M_'))).toBe(true); expect(at.some((a) => a.includes('_B6M_'))).toBe(true);
    expect(Math.max(...day91.map((x) => x.tick))).toBeLessThan(66_239);
    // The 06 launch line (E-97 FDL face row, B3M 912,000,000,000, issued at genesis) is not in a 04-alone run: payments() on the typed line.
    const launch: GovLine = { assetId: 'ast_SOV_FDL_B3M_91', ccy: 'FDL', couponRate: 0, maturityTick: 91 * D, faceOutstanding: 912_000_000_000n * MICRO_N, fxDenominated: false };
    expect(payments(launch, 91 * D - 1, 91 * D + D - 1)).toEqual([{ tick: 91 * D, amount: 912_000_000_000n * MICRO_N, principal: 912_000_000_000n * MICRO_N }]);
    expect(payments(launch, 0, 91 * D - 1)).toEqual([]);
  });
  it('(d) macro_auction_tick < 719 and the syndication pricing tick 420 < 719', () => {
    expect(w.ctx.params.int('macro_auction_tick')).toBeLessThan(719);
    expect(BOOK_TICK).toBe(420); expect(BOOK_TICK).toBeLessThan(719);
  });
});
