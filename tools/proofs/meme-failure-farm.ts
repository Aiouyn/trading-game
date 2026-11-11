import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LP } from "../../src/launchpad/rules";
import { advanceFarm, assertConservation, cashTotal, commandFarm, createFarm, publicCoins, tokenTotal, walletValue } from "../../src/server/launchpad/failureFarm/engine";
import { FailureFarmEngine, FileFarmStore } from "../../src/server/launchpad/failureFarm/store";
import type { FarmFrame, FarmState } from "../../src/server/launchpad/failureFarm/model";
import { Draws, MemeProcess, TICKS_PER_HOUR } from "../../src/server/market/meme";
import { GAME_DAYS_PER_CHAPTER } from "../../src/server/market/crises";

const digest = (s: FarmState) => createHash("sha256").update(JSON.stringify(s)).digest("hex");
async function main() {
const out = process.env.SYS_FARM_EVIDENCE_DIR ?? await mkdtemp(join(tmpdir(), "sys-farm-proof-"));
await mkdir(out, { recursive: true });
const storeDir = await mkdtemp(join(out, "clean-stores-"));
const save = (name: string, value: unknown) => writeFile(join(out, name), JSON.stringify(value, null, 2) + "\n");
const pathFrames = (from: number, to: number): FarmFrame[] => Array.from({ length: to - from }, (_, i) => ({ hour: from + i + 1, coins: {} }));
function launch(s: FarmState, wallet: string, ticker: string) {
  const r = commandFarm(s, { kind: "LAUNCH", wallet, ticker, name: `${ticker} Club`, fee: LP.LAUNCH_FEE, nowMs: 0, key: `launch-${ticker}` });
  assert.equal(r.reply.kind, "LAUNCHED"); return r.state;
}
function buy(s: FarmState, wallet: string, ticker: string, amount: number) {
  const r = commandFarm(s, { kind: "TRADE", wallet, ticker, side: "BUY", amount, key: `buy-${ticker}-${wallet}` });
  assert.equal(r.reply.kind, "FILLED"); return r.state;
}

// The decision is recorded before measurement: report actual rates, never retune or kill a quota.
// "~0" is the spec's death state: pool liquidity < $1,000 for 7 game days -> DELISTED, tokens "marked at 0" (06:762),
// public event mkt.meme.dead (06:1139). Horizon: one chapter = 1,344 game days (20:11; 01:145), from birth (all cohort
// coins are born at hour 0). Price cutoffs are secondary authored diagnostics only; no spec line defines them.
await save("measurement-contract.json", { version: 3, seedCount: 24, coinsPerSeed: 12, chapterGameDays: GAME_DAYS_PER_CHAPTER,
  horizon: "all cohort coins launched at hour 0 and observed for one full chapter (1,344 game days) from birth",
  nearZero: "DEAD: discovery DELISTED under the 06:762 death rule (liquidity < $1,000 = 100,000 cents for 7 consecutive game days), wallet tokens marked at exactly 0",
  secondaryDiagnostics: { finalMarkAtMost1PctOfListing: "authored, not spec", everMarkAtMost1PctOfListing: "authored, not spec", finalMarketCapBelowDeathLiquidity: "authored reuse of the 06:762 $1,000 figure on market cap, not spec" },
  citations: { nearZeroDefinitionAndTarget: "06-ASSET-CLASSES.md:762", deadEvent: "06-ASSET-CLASSES.md:1139", population: "06-ASSET-CLASSES.md:760-761",
    chapterLength: "20-VERIFICATION-AND-BALANCE.md:11; 01-EVALUATION-OF-V3.md:145", activationGate: "20-VERIFICATION-AND-BALANCE.md:1130 (section 8 edge case 8)",
    frozenAgents: "20-VERIFICATION-AND-BALANCE.md section 9 E2/E3 (exploit table)", tuningToTheTest: "20-VERIFICATION-AND-BALANCE.md section 9 E1, E7", finiteBook: "05-MARKETS-PRICE-ENGINE.md:364,437,508 + owner finite-book override" },
  target: "about 90% per complete 06:762; descriptive comparison only, not G3 certification", decision: "report the measured rate; no kill quota, no parameter tuning, no authored holder policy counted as calibration",
  limits: ["isolated cohort, not a full population experiment", "24 DEV seeds, not 60/200 VALIDATION/WITHHELD seeds", "no new live app mounting", "base curve/finite book, not the 06 NPC Tidepool AMM venue", "holders never sell in the main cohort (frozen agents, 20 E2)", "rugs flag actual sales, no linked-owner graph/Court"] });

// Real clean-file restart, durable idempotency, chunked jump, and dead-wallet proof.
let fixture = createFarm("restart-proof", [{ id: "creator", kind: "PLAYER", cash: 10_000_000 }, { id: "holder", kind: "PLAYER", cash: 20_000_000 }]);
fixture = buy(launch(fixture, "creator", "GULL"), "holder", "GULL", 50_000);
const file = join(storeDir, "restart.json");
const engine = await FailureFarmEngine.open(new FileFarmStore(file), fixture);
await engine.advance(pathFrames(0, 80));
const persisted = await readFile(file, "utf8"), beforeRestart = engine.snapshot();
const restarted = await FailureFarmEngine.open(new FileFarmStore(file));
assert.deepEqual(beforeRestart, restarted.snapshot());
const afterJump = advanceFarm(fixture, pathFrames(0, 200));
const perHour = pathFrames(0, 200).reduce((s, frame) => advanceFarm(s, [frame]), fixture);
await restarted.advance(pathFrames(80, 200));
assert.deepEqual(afterJump, perHour); assert.deepEqual(afterJump, restarted.snapshot());
const unchanged = restarted.snapshot();
await restarted.execute({ kind: "TRADE", wallet: "holder", ticker: "GULL", side: "BUY", amount: 50_000, key: "buy-GULL-holder" });
assert.deepEqual(restarted.snapshot(), unchanged);
assert.equal(publicCoins(afterJump).length, 0); assert.equal(walletValue(afterJump, "holder", "GULL"), 0);
assert.equal(tokenTotal(afterJump, "GULL"), LP.SUPPLY);
await save("restart-jump-proof.json", { freshStore: file, intermediateCheckpointSha256: createHash("sha256").update(persisted).digest("hex"), restartBeforeContinue: true,
  repeatedCommandNoChange: true, fullStateJumpEqualsStepping: true, restartEqualsUninterrupted: true, fullStateSha256: digest(afterJump),
  retainedTokens: afterJump.wallets.holder!.tokens.GULL, zeroMark: walletValue(afterJump, "holder", "GULL"), discoveryRemoved: publicCoins(afterJump).length === 0,
  initialCashCents: fixture.initialCash, finalCashIncludingSinkCents: cashTotal(afterJump), cashDelta: cashTotal(afterJump) - fixture.initialCash, ok: true });
await save("restart-final-state.json", restarted.snapshot());

// Actual dump/abandonment settlement, with a saved mid-dump restart and a finite-book exhaustion trace.
let rugWorld = createFarm("rug-proof", [{ id: "creator", kind: "PLAYER", cash: 10_000_000 }, { id: "holder", kind: "PLAYER", cash: 20_000_000 }]);
rugWorld = buy(launch(rugWorld, "creator", "GULL"), "creator", "GULL", 150_000);
rugWorld = buy(rugWorld, "holder", "GULL", 10_000_000);
const dumpFile = join(storeDir, "dump.json"), dumpEngine = await FailureFarmEngine.open(new FileFarmStore(dumpFile), rugWorld);
let dumpSold = 0;
for (let hour = 1; hour <= 80; hour++) {
  await dumpEngine.advance([{ hour, coins: {} }]);
  const r = await dumpEngine.execute({ kind: "TRADE", wallet: "creator", ticker: "GULL", side: "SELL", amount: 1_000_000, key: `dump-${hour}` });
  if (r.kind === "FILLED") dumpSold += r.qty;
  assertConservation(dumpEngine.snapshot());
}
const dumpRestarted = await FailureFarmEngine.open(new FileFarmStore(dumpFile));
assert.deepEqual(dumpRestarted.snapshot(), dumpEngine.snapshot());
assert.equal(dumpRestarted.snapshot().coins.GULL!.rug?.kind, "EARLY_EXIT");
let npcWorld = createFarm("npc-proof", [{ id: "launcher", kind: "NPC", cash: 10_000_000 }]);
npcWorld = buy(launch(npcWorld, "launcher", "GULL"), "launcher", "GULL", 2_000_000);
const beforeNpc = npcWorld.wallets.launcher!.tokens.GULL!, beforeVolume = npcWorld.coins.GULL!.hourVolume;
npcWorld = advanceFarm(npcWorld, [{ hour: 1, coins: {} }]);
const npcSold = beforeNpc - npcWorld.wallets.launcher!.tokens.GULL!;
assert.equal(npcSold, Math.floor(beforeVolume * .2));
npcWorld = advanceFarm(npcWorld, pathFrames(1, 100));
assert.equal(npcWorld.coins.GULL!.launcher.kind, "NPC_ABANDONED");
await save("rug-npc-proof.json", { actualCreatorSoldTokens: dumpSold, creatorFlag: dumpEngine.snapshot().coins.GULL!.rug,
  dumpRestartFullStateEqual: true, npcRallySoldTokens: npcSold, precedingHourActualVolumeTokens: beforeVolume,
  npcSaleFraction: npcSold / beforeVolume, npcAbandoned: npcWorld.coins.GULL!.launcher,
  cashDeltaDump: cashTotal(dumpEngine.snapshot()) - rugWorld.initialCash, cashDeltaNpc: cashTotal(npcWorld) - npcWorld.initialCash,
  supplyDump: tokenTotal(dumpEngine.snapshot(), "GULL"), supplyNpc: tokenTotal(npcWorld, "GULL"), ok: true });

const reports: { seed: number; launched: number; graduated: number; delisted: number; abandoned: number; rugFlags: number; nearZero: number; nearZeroRate: number; diagFinalMarkAtMost1Pct: number; diagEverMarkAtMost1Pct: number; diagFinalCapBelowDeathLiquidity: number; graduatedBookCashMinCents: number; graduatedHolderSells: number; cashDelta: number; supplyOk: boolean; stateSha256: string }[] = [];
for (let seed = 17; seed < 41; seed++) {
  const n = 12, tickers = Array.from({ length: n }, (_, i) => `ZF${String.fromCharCode(65 + seed - 17)}${String.fromCharCode(65 + i)}`);
  let s = createFarm(`chapter-${seed}`, [
    ...tickers.map((_, i) => ({ id: `npc_${i}`, kind: "NPC" as const, cash: 30_000_000 })),
    { id: "retail", kind: "PLAYER", cash: 300_000_000 },
  ]);
  const paths = new Map<string, MemeProcess>(), factors = new Draws(`farm:chapter:${seed}:factors`);
  for (const [i, ticker] of tickers.entries()) {
    s = launch(s, `npc_${i}`, ticker);
    if (i % 4 === 0) { s = buy(s, "retail", ticker, 30_000); continue; } // genuinely thin ungraduated launches
    s = buy(s, `npc_${i}`, ticker, 1_500_000); // actual paid NPC allocation, never a minted wallet grant
    s = buy(s, "retail", ticker, 10_000_000); // reaches real base graduation (clipped payment)
    const c = s.coins[ticker]!; assert.equal(c.venue.kind, "BOOK");
    paths.set(ticker, new MemeProcess(ticker, c.mark, 8));
  }
  let checks = 0;
  const minRatio = new Map<string, number>();
  for (let hour = 1; hour <= GAME_DAYS_PER_CHAPTER * 24; hour++) {
    const frame: FarmFrame = { hour, coins: {} };
    // The real template gets 30 tick steps per hourly frame, using the saved hype at that hour's start.
    for (let tick = 0; tick < TICKS_PER_HOUR; tick++) {
      const market = factors.normal(), crypto = factors.normal();
      for (const [ticker, process] of paths) {
        const c = s.coins[ticker]!;
        process.step(market, crypto, { hype: c.hype, reg: { vol: 1, jump: 1, skew: 0 } });
      }
    }
    for (const [ticker, process] of paths) frame.coins[ticker] = { mark: process.minor(), mentions: 0 };
    s = advanceFarm(s, [frame]);
    // Apply only committed settlement impact back to each real price process, once per supplied frame.
    for (const [ticker, process] of paths) {
      const mark = s.coins[ticker]!.mark;
      if (mark !== process.minor()) process.shift(Math.log(mark / process.minor()));
    }
    for (const ticker of paths.keys()) {
      const c = s.coins[ticker]!;
      if (c.venue.kind === "BOOK") minRatio.set(ticker, Math.min(minRatio.get(ticker) ?? Infinity, c.mark / c.venue.listedPrice));
    }
    assertConservation(s); checks++;
  }
  const coins = Object.values(s.coins), graduated = coins.filter((c) => c.venue.kind === "BOOK").length;
  const dead = (c: (typeof coins)[number]) => c.discovery.kind === "DELISTED";
  const nearZero = coins.filter(dead).length;
  const book = coins.flatMap((c) => c.venue.kind === "BOOK" ? [{ c, v: c.venue }] : []);
  const finalPct1 = coins.filter((c) => dead(c) || (c.venue.kind === "BOOK" && c.mark <= .01 * c.venue.listedPrice)).length;
  const everPct1 = coins.filter((c) => dead(c) || (minRatio.get(c.ticker) ?? Infinity) <= .01).length;
  const capBelow = coins.filter((c) => dead(c) || (c.venue.kind === "BOOK" && (LP.SUPPLY - c.venue.book.tokens) * c.mark / 1e6 < 100_000)).length;
  const row = { seed, launched: coins.length, graduated, delisted: nearZero,
    abandoned: coins.filter((c) => c.launcher.kind === "NPC_ABANDONED").length, rugFlags: coins.filter((c) => c.rug !== null).length,
    nearZero, nearZeroRate: nearZero / coins.length, diagFinalMarkAtMost1Pct: finalPct1, diagEverMarkAtMost1Pct: everPct1, diagFinalCapBelowDeathLiquidity: capBelow,
    graduatedBookCashMinCents: Math.min(...book.map(({ v }) => v.book.cash)), graduatedHolderSells: 0, cashDelta: cashTotal(s) - s.initialCash, supplyOk: coins.every((c) => tokenTotal(s, c.ticker) === LP.SUPPLY), stateSha256: digest(s) };
  assert.equal(row.cashDelta, 0); assert.equal(row.supplyOk, true); assert.equal(checks, GAME_DAYS_PER_CHAPTER * 24);
  reports.push(row);
  await save(`chapter-seed-${seed}.json`, { ...row, hourlyChecks: checks, finalState: s });
  process.stdout.write(`seed ${seed}: dead ${nearZero}/${coins.length}; final<=1% ${finalPct1}; ever<=1% ${everPct1}; cash delta ${row.cashDelta}\n`);
}
const total = reports.reduce((n, r) => n + r.launched, 0), nearZero = reports.reduce((n, r) => n + r.nearZero, 0);
const sum = (k: "diagFinalMarkAtMost1Pct" | "diagEverMarkAtMost1Pct" | "diagFinalCapBelowDeathLiquidity" | "graduated") => reports.reduce((n, r) => n + r[k], 0);

// Sensitivity bound, NOT calibration: the same cohort for 60 game days, where the one retail holder (player-level, public
// information only: publicCoins shows the launcher abandoned) offers its whole position once a game day to the real finite book.
// It shows death in the finite book is decided by holders' exits, which 06 leaves to agents (20 E2), not by the engine.
const exitRows: { seed: number; dead: number; launched: number; cashDelta: number }[] = [];
for (let seed = 17; seed < 41; seed++) {
  const n = 12, tickers = Array.from({ length: n }, (_, i) => `ZF${String.fromCharCode(65 + seed - 17)}${String.fromCharCode(65 + i)}`);
  let s = createFarm(`chapter-${seed}`, [...tickers.map((_, i) => ({ id: `npc_${i}`, kind: "NPC" as const, cash: 30_000_000 })), { id: "retail", kind: "PLAYER", cash: 300_000_000 }]);
  const paths = new Map<string, MemeProcess>(), factors = new Draws(`farm:chapter:${seed}:factors`);
  for (const [i, ticker] of tickers.entries()) {
    s = launch(s, `npc_${i}`, ticker);
    if (i % 4 === 0) { s = buy(s, "retail", ticker, 30_000); continue; }
    s = buy(buy(s, `npc_${i}`, ticker, 1_500_000), "retail", ticker, 10_000_000);
    paths.set(ticker, new MemeProcess(ticker, s.coins[ticker]!.mark, 8));
  }
  for (let hour = 1; hour <= 60 * 24; hour++) {
    const frame: FarmFrame = { hour, coins: {} };
    for (let tick = 0; tick < TICKS_PER_HOUR; tick++) {
      const market = factors.normal(), crypto = factors.normal();
      for (const [ticker, process] of paths) process.step(market, crypto, { hype: s.coins[ticker]!.hype, reg: { vol: 1, jump: 1, skew: 0 } });
    }
    for (const [ticker, process] of paths) frame.coins[ticker] = { mark: process.minor(), mentions: 0 };
    s = advanceFarm(s, [frame]);
    for (const view of publicCoins(s)) {
      const held = s.wallets.retail!.tokens[view.ticker] ?? 0;
      if (view.launcher.kind !== "NPC_ABANDONED" || held === 0 || hour % 24 !== 0) continue; // one exit order a game day
      s = commandFarm(s, { kind: "TRADE", wallet: "retail", ticker: view.ticker, side: "SELL", amount: held, key: `exit-${view.ticker}-${hour}` }).state;
    }
    for (const [ticker, process] of paths) {
      const mark = s.coins[ticker]!.mark;
      if (mark !== process.minor()) process.shift(Math.log(mark / process.minor()));
    }
    assertConservation(s);
  }
  const coins = Object.values(s.coins);
  exitRows.push({ seed, launched: coins.length, dead: coins.filter((c) => c.discovery.kind === "DELISTED").length, cashDelta: cashTotal(s) - s.initialCash });
  assert.equal(exitRows.at(-1)!.cashDelta, 0);
}
const exitDead = exitRows.reduce((n, r) => n + r.dead, 0), exitTotal = exitRows.reduce((n, r) => n + r.launched, 0);
await save("holder-exit-sensitivity.json", { purpose: "sensitivity bound, not calibration and not counted", horizonGameDays: 60, rule: "retail holder offers its whole remaining position once a game day (partial finite-book fills) after the launcher is publicly NPC_ABANDONED",
  seeds: exitRows, dead: exitDead, total: exitTotal, deadRate: exitDead / exitTotal, conservationEveryHour: true, allCashDeltasZero: exitRows.every((r) => r.cashDelta === 0) });
process.stdout.write(`holder-exit sensitivity: dead ${exitDead}/${exitTotal}\n`);

await save("chapter-farm-report.json", { definition: "DEAD per 06:762 (liquidity < $1,000 for 7 game days -> DELISTED, marked at 0)", seeds: reports, totalCoins: total, nearZeroCoins: nearZero, nearZeroRate: nearZero / total,
  minimumSeedRate: Math.min(...reports.map((r) => r.nearZeroRate)), maximumSeedRate: Math.max(...reports.map((r) => r.nearZeroRate)),
  graduatedCoins: sum("graduated"), graduatedDead: reports.reduce((n, r) => n + r.nearZero, 0) - (total - sum("graduated")),
  secondaryDiagnostics: { finalMarkAtMost1Pct: sum("diagFinalMarkAtMost1Pct"), everMarkAtMost1Pct: sum("diagEverMarkAtMost1Pct"), finalCapBelowDeathLiquidity: sum("diagFinalCapBelowDeathLiquidity"), denominator: total },
  holderExitSensitivity: { dead: exitDead, total: exitTotal, file: "holder-exit-sensitivity.json" },
  comparison: nearZero / total >= .9 ? "at least 90% in this isolated cohort (not G3-certified)" : "REPORT: below the approximate 90% target; no forced failure or tune",
  conservationEveryHour: true, allCashDeltasZero: reports.every((r) => r.cashDelta === 0), allSuppliesOneBillion: reports.every((r) => r.supplyOk),
  noImplicitFunding: true, initialCashOnlyGenesis: true, ok: true });
process.stdout.write(`proofs: ${out}\n`);

}
void main().catch((err: unknown) => { process.stderr.write(`${String(err)}\n`); process.exitCode = 1; });
