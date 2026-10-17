/**
 * Isolated launchpad audit probes. Writes only the named proof files, never a live save.
 * Usage: npx tsx scripts/research/launchpad-npc-audit-probe.ts [optional-world.db]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openAccount, placeOrder, step } from '../../src/engine';
import { clearOrders } from '../../src/engine/trading';
import { addShares } from '../../src/world/company/ipo';
import { LP, bookAccountId } from '../../src/world/launchpad/constants';
import { adminFill } from '../../src/world/launchpad/commands';
import { lpWorld, launch, CREATOR } from '../../src/world/launchpad/fixture';
import { priceNow } from '../../src/world/launchpad/rug';
import { spotAt } from '../../src/world/launchpad/curve';
import type { GameState } from '../../src/world/types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const proofDir = 'proof/economy-audit';
const results: Record<string, unknown> = { generatedAt: new Date().toISOString(), revision: 'be21a34' };

function graduated(allocation: number, ticker: string): GameState {
  const g = lpWorld('launchpad-audit-paired');
  const r = launch(g, CREATOR, ticker, { allocation });
  if (!r.ok) throw new Error(`launch failed: ${JSON.stringify(r)}`);
  const gr = adminFill(g, ticker, null);
  if (!gr.ok) throw new Error(`graduation failed: ${JSON.stringify(gr)}`);
  return g;
}

function book(g: GameState, ticker: string) {
  const a = g.market.accounts[bookAccountId(ticker)]!;
  return { cash: a.cash, qty: a.positions[ticker]?.qty ?? 0 };
}

function gradSnapshot(allocation: number, ticker: string) {
  const g = graduated(allocation, ticker);
  const t = g.launchpad!.tokens[ticker]!;
  const i = g.market.config.assets.findIndex(a => a.id === ticker);
  const beforeBook = book(g, ticker);
  const beforePrice = priceNow(g, t);
  const one = step(g.market).state;
  g.market = one;
  const afterBook = book(g, ticker);
  const afterPrice = priceNow(g, t);
  return {
    allocation,
    curveGraduationPrice: t.gradPrice,
    enginePriceAtGraduation: beforePrice,
    initialBook: beforeBook,
    bookFloatShareOfTotal: beforeBook.qty / LP.SUPPLY,
    cashPerBookToken: beforeBook.cash / beforeBook.qty,
    firstNoOrderStep: {
      priceMovePct: 100 * (afterPrice / beforePrice - 1),
      bookCashBefore: beforeBook.cash,
      bookCashAfter: afterBook.cash,
      bookCashDelta: afterBook.cash - beforeBook.cash,
      bookQtyBefore: beforeBook.qty,
      bookQtyAfter: afterBook.qty,
      bookQtyDelta: afterBook.qty - beforeBook.qty,
      engineMarkBefore: beforePrice,
      engineMarkAfter: afterPrice,
      engineAssetCount: g.market.config.assets.length,
      stateTickBefore: one.tick - 1,
      stateTickAfter: one.tick,
      orderFills: 0,
      assetLnPBefore: Math.log(beforePrice),
      assetLnPAfter: Math.log(afterPrice),
      assetIndex: i,
    },
  };
}

function tradeProbe(allocation: number, side: 'buy' | 'sell', dollars: number) {
  const ticker = 'AUDIT';
  const g = graduated(allocation, ticker);
  const i = g.market.config.assets.findIndex(a => a.id === ticker);
  const def = g.market.config.assets[i]!;
  const beforePrice = Math.exp(g.market.assets[i]!.lnP);
  const beforeBook = book(g, ticker);
  const qty = Math.max(1, Math.floor(dollars / beforePrice));
  const accountId = `audit-${side}-${allocation}`;
  g.market = openAccount(g.market, accountId, side === 'buy' ? dollars * 2 : 0);
  if (side === 'sell') g.market = addShares(g.market, accountId, ticker, qty, beforePrice);
  const queued = placeOrder(g.market, { playerId: accountId, assetId: ticker, side, type: 'market', qty });
  const settled = clearOrders(queued.state, false);
  g.market = settled.state;
  const fill = settled.fills.find(f => f.assetId === ticker);
  const afterPrice = Math.exp(g.market.assets[i]!.lnP);
  const afterBook = book(g, ticker);
  return {
    allocation,
    side,
    requestedDollars: dollars,
    requestedQty: qty,
    configuredAdv: def.advNotional,
    beforePrice,
    afterPrice,
    markMovePct: 100 * (afterPrice / beforePrice - 1),
    fills: settled.fills.filter(f => f.assetId === ticker).length,
    filledQty: fill?.qty ?? 0,
    fillPrice: fill?.price ?? null,
    fillNotional: fill ? fill.qty * fill.price : 0,
    bookCashBefore: beforeBook.cash,
    bookCashAfter: afterBook.cash,
    bookCashDelta: afterBook.cash - beforeBook.cash,
    bookQtyBefore: beforeBook.qty,
    bookQtyAfter: afterBook.qty,
    bookQtyDelta: afterBook.qty - beforeBook.qty,
  };
}

results.graduationByAllocation = [
  gradSnapshot(0, 'AUDIT'),
  gradSnapshot(50_000_000, 'AUDIT'),
];
results.graduatedOrders = [
  ...([0, 50_000_000] as const).flatMap(allocation =>
    (['buy', 'sell'] as const).flatMap(side => [100, 1_000, 5_000].map(dollars => tradeProbe(allocation, side, dollars)))),
];

if (process.argv[2]) {
  const db = new DatabaseSync(process.argv[2], { readOnly: true });
  const row = db.prepare('SELECT tick,data FROM snapshots ORDER BY id DESC LIMIT 1').get() as { tick: number; data: string };
  db.close();
  const g = JSON.parse(row.data) as GameState;
  const tokens = Object.values(g.launchpad?.tokens ?? {});
  const micro = Object.entries(g.market.accounts).filter(([id]) => id.startsWith('lp:npc:trader:')).map(([, a]) => a);
  const cash = micro.map(a => a.cash).sort((a, b) => a - b);
  const stateById = new Map(g.market.config.assets.map((a, i) => [a.id, g.market.assets[i]! ]));
  const markedByTicker = new Map<string, number>();
  let inventoryMarked = 0;
  for (const account of micro) for (const [ticker, position] of Object.entries(account.positions)) {
    const qty = Math.max(0, position.qty);
    const token = g.launchpad?.tokens[ticker];
    const livePrice = token?.status === 'live' ? spotAt(token.y) : undefined;
    const state = stateById.get(ticker);
    const mark = livePrice ?? (state ? Math.exp(state.lnP) : 0);
    const value = qty * mark;
    inventoryMarked += value;
    markedByTicker.set(ticker, (markedByTicker.get(ticker) ?? 0) + value);
  }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const top = (xs: number[], n: number) => sum(xs.slice().sort((a, b) => b - a).slice(0, n));
  const curveCash = tokens.filter(t => t.status === 'live').map(t => g.market.accounts[`lp:curve:${t.ticker}`]?.cash ?? 0);
  const bookCash = tokens.filter(t => t.status === 'graduated').map(t => g.market.accounts[bookAccountId(t.ticker)]?.cash ?? 0);
  const tokenInventory = Array.from(markedByTicker.values()).sort((a, b) => b - a);
  const cashTotal = sum(cash);
  const curveTotal = sum(curveCash);
  results.liveSnapshot = {
    tick: row.tick,
    tokenCounts: tokens.reduce((acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; }, {} as Record<string, number>),
    fundedTraderAccounts: micro.length,
    traderCash: { total: cashTotal, median: cash[Math.floor((cash.length - 1) * .5)], belowOneDollar: cash.filter(x => x < 1).length, top10Share: top(cash, 10) / cashTotal, top25Share: top(cash, 25) / cashTotal },
    traderInventoryMarked: { total: inventoryMarked, top10TokenShare: top(tokenInventory, 10) / inventoryMarked, tokenCountWithHoldings: tokenInventory.length },
    traderCashPlusMarkedInventory: cashTotal + inventoryMarked,
    liveCurveCash: { total: curveTotal, median: curveCash.slice().sort((a, b) => a - b)[Math.floor(curveCash.length * .5)], top10Share: top(curveCash, 10) / curveTotal, top25Share: top(curveCash, 25) / curveTotal },
    graduatedBookCash: sum(bookCash),
    npcRetailLedger: { faucet: g.economy.faucets.npcRetail ?? 0, sink: g.economy.sinks.npcRetail ?? 0 },
    marks: 'Live token positions use curve spot; graduated positions use engine exp(lnP); marked values have no liquidation-impact haircut.',
  };
}

mkdirSync(proofDir, { recursive: true });
writeFileSync(`${proofDir}/launchpad-npc-audit.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
