import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CREATOR, TRADER, launch, lpWorld } from '../../src/world/launchpad/fixture';
import { barsOf } from '../../src/world/launchpad/bars';
import { lpTick } from '../../src/world/launchpad/flow';
import { buyCurve, sellCurve } from '../../src/world/launchpad/trade';
import { replyToken } from '../../src/world/launchpad/reply';
import type { LpBar } from '../../src/world/launchpad/types';

type Scenario = 'baseline' | 'player_buy_8m' | 'player_buy_sell_8m_15m' | 'player_reply_8m';
type Row = { seed: string; scenario: Scenario; bars: LpBar[]; tradeTicks: number[]; scriptEvents: number; scriptCursor: number; attentionAccounts: number; status: string; lastTradeTick: number; tapeLength: number };

function simulate(seed: string, scenario: Scenario): Row {
  const g = lpWorld(`tape-audit-${seed}`);
  const launched = launch(g, CREATOR, 'WAVE');
  if (!launched.ok) throw new Error(`launch failed: ${JSON.stringify(launched)}`);
  const ticker = Object.keys(g.launchpad!.tokens)[0]!;
  const token = () => g.launchpad!.tokens[ticker]!;
  const t = token();
  const tradeTicks: number[] = [];
  let lastTradeTick = t.lastTradeTick;
  const totalTicks = 90 * 12;
  for (let i = 1; i <= totalTicks; i++) {
    g.market = { ...g.market, tick: g.market.tick + 1 };
    const current = token();
    // Reproduce the pre-rhythm behavior for a paired control: every tick in an active launch script may run pitTick.
    // This changes no prices directly; it only keeps the legacy gate open in this isolated experiment.
    if (process.env.LAUNCHPAD_TAPE_MODE === 'pre-rhythm' && current.micro?.episode?.script && current.micro.episode.cursor < current.micro.episode.script.length) {
      current.micro.episode.lastScriptFillMinute = Math.floor((g.market.tick - current.micro.episode.startTick) / 12);
    }
    if (i === 8 * 12 && scenario === 'player_buy_8m') {
      const r = buyCurve(g, TRADER, ticker, 1_000_000, 1, null);
      if (!r.ok) throw new Error(`player buy failed: ${JSON.stringify(r)}`);
    }
    if (i === 8 * 12 && scenario === 'player_buy_sell_8m_15m') {
      const r = buyCurve(g, TRADER, ticker, 1_000_000, 1, null);
      if (!r.ok) throw new Error(`player buy failed: ${JSON.stringify(r)}`);
    }
    if (i === 15 * 12 && scenario === 'player_buy_sell_8m_15m') {
      const qty = current.bal[TRADER] ?? 0;
      if (qty > 0) {
        const r = sellCurve(g, TRADER, ticker, qty, 1, null);
        if (!r.ok) throw new Error(`player sell failed: ${JSON.stringify(r)}`);
      }
    }
    if (i === 8 * 12 && scenario === 'player_reply_8m') {
      const r = replyToken(g, TRADER, ticker, 'watching this one', null);
      if (!r.ok) throw new Error(`player reply failed: ${JSON.stringify(r)}`);
    }
    lpTick(g, null);
    const after = token();
    if (after.lastTradeTick !== lastTradeTick) {
      tradeTicks.push(i);
      lastTradeTick = after.lastTradeTick;
    }
  }
  const finalToken = token();
  return { seed, scenario, bars: barsOf(finalToken).m, tradeTicks, scriptEvents: finalToken.micro?.episode?.script?.length ?? 0, scriptCursor: finalToken.micro?.episode?.cursor ?? 0, attentionAccounts: finalToken.micro?.traders.filter(w => (w.attn ?? 0) > 0).length ?? 0, status: finalToken.status, lastTradeTick: finalToken.lastTradeTick, tapeLength: finalToken.tape.length };
}

function summarize(row: Row) {
  const bars = row.bars;
  const rets = bars.slice(1).map((b, i) => b[4] / bars[i]![4] - 1);
  const directional = rets.map(r => Math.abs(r) < .005 ? 0 : Math.sign(r));
  let flips = 0, previous = 0, upRun = 0, downRun = 0, maxUpRun = 0, maxDownRun = 0;
  for (const sign of directional) {
    if (sign !== 0 && previous !== 0 && sign !== previous) flips++;
    if (sign === 0) { upRun = 0; downRun = 0; continue; }
    if (sign > 0) { upRun++; downRun = 0; maxUpRun = Math.max(maxUpRun, upRun); }
    else { downRun++; upRun = 0; maxDownRun = Math.max(maxDownRun, downRun); }
    previous = sign;
  }
  const bands = [];
  for (let i = 0; i < directional.length; i += 5) {
    const part = directional.slice(i, i + 5);
    bands.push({ fromMinute: i + 1, toMinute: Math.min(i + part.length, directional.length), nonFlat: part.filter(x => x !== 0).length, buys: part.filter(x => x > 0).length, sells: part.filter(x => x < 0).length });
  }
  const sortedWicks = bars.map(b => (b[2] - b[3]) / Math.max(b[1], 1e-12)).sort((a, b) => a - b);
  const active = new Set(row.tradeTicks.map(t => Math.floor((t - 1) / 12)));
  const inactivity = [];
  let run = 0;
  for (let m = 0; m < 90; m++) {
    if (active.has(m)) run = 0; else { run++; inactivity.push(run); }
  }
  return {
    seed: row.seed, scenario: row.scenario,
    firstClose: bars[0]?.[4], lastClose: bars.at(-1)?.[4],
    peakCloseMultiple: Math.max(...bars.map(b => b[4])) / (bars[0]?.[1] ?? 1),
    minuteReturn: { medianAbs: median(rets.map(Math.abs)), p90Abs: quantile(rets.map(Math.abs), .9), min: Math.min(...rets), max: Math.max(...rets) },
    closeSigns: { signFlips: flips, maxUpRun, maxDownRun, positive: directional.filter(x => x > 0).length, negative: directional.filter(x => x < 0).length, flatUnderHalfPct: directional.filter(x => x === 0).length },
    burstClustering: bands,
    tradeActivity: { activeMinutes: active.size, maxConsecutiveInactiveMinutes: Math.max(0, ...inactivity), tradeTicksObserved: row.tradeTicks.length },
    scriptAt90m: { totalEvents: row.scriptEvents, consumed: row.scriptCursor, remaining: Math.max(0, row.scriptEvents - row.scriptCursor) },
    attentionAccountsAt90m: row.attentionAccounts,
    endState: { status: row.status, lastTradeTick: row.lastTradeTick, retainedTapeLength: row.tapeLength },
    wickBody: { medianRangeOverOpen: median(sortedWicks), medianAbsCloseBody: median(bars.map(b => Math.abs(b[4] - b[1]) / Math.max(b[1], 1e-12))), medianUpperWickToBody: median(bars.map(b => (b[2] - Math.max(b[1], b[4])) / Math.max(Math.abs(b[4] - b[1]), 1e-12))), medianLowerWickToBody: median(bars.map(b => (Math.min(b[1], b[4]) - b[3]) / Math.max(Math.abs(b[4] - b[1]), 1e-12))) },
    playerEventAtTick: row.scenario === 'baseline' ? null : 8 * 12,
  };
}
function median(values: number[]) { const x = values.filter(Number.isFinite).sort((a, b) => a - b); return x.length ? x[Math.floor(x.length / 2)]! : 0; }
function quantile(values: number[], q: number) { const x = values.filter(Number.isFinite).sort((a, b) => a - b); return x.length ? x[Math.min(x.length - 1, Math.floor((x.length - 1) * q))]! : 0; }

const seeds = ['01','02','03','04','05','06','07','08'];
const scenarios: Scenario[] = ['baseline', 'player_buy_8m', 'player_buy_sell_8m_15m', 'player_reply_8m'];
const results = scenarios.flatMap(scenario => seeds.map(seed => summarize(simulate(seed, scenario))));
const artifact = {
  generatedAt: new Date().toISOString(),
  purpose: 'Superseded diagnostic artifact only. No numeric result from this harness is valid evidence; no world save or service is opened.',
  validity: 'invalid-superseded',
  invalidityReason: 'The active-minute observer used lastTradeTick, which excludes NPC fills; an earlier version also retained stale token references. Do not cite its activity or OHLC summary metrics.',
  supersededBy: 'proof/memecoin-visual-20261015/game-young-launchpath-metrics.json and proof/memecoin-visual-20261015/game-young-launchpath-after-metrics.json',
  phase: process.env.LAUNCHPAD_TAPE_MODE === 'pre-rhythm' ? 'paired legacy pit control (before settlement gate)' : process.env.LAUNCHPAD_TAPE_PHASE === 'after-rhythm' ? 'after settlement-gated ambient pit change' : process.env.LAUNCHPAD_TAPE_PHASE === 'after' ? 'after bounded active-script reply-response change' : 'pre-change baseline',
  source: { head: 'be21a34 (worktree branch economy/causality)', scenarioTicks: 90 * 12, timeUnit: 'tick/12 is elapsed runtime-equivalent minutes at 1x; 720 ticks is one in-game day (60 elapsed minutes)', candle: 'one launchpad minute', playerBuyDollars: 10_000, playerBuyMinute: 8, playerSellMinute: 15 },
  methodology: 'Eight deterministic seed pairs per scenario. Summaries use minute OHLC folds and changed lastTradeTick values. External scenarios are a $10,000 player buy at minute 8; a $10,000 buy at minute 8 and sale of that full position at minute 15; or a reply at minute 8. No target-price replay or live save.',
  results,
};
const phase = process.env.LAUNCHPAD_TAPE_MODE === 'pre-rhythm' ? 'pre-rhythm-corrected' : process.env.LAUNCHPAD_TAPE_PHASE === 'after-rhythm' ? 'after-rhythm' : process.env.LAUNCHPAD_TAPE_PHASE === 'after' ? 'after' : 'before';
const out = resolve(`proof/economy-audit/launchpad-tape-${phase}.json`);
async function main() {
  await mkdir(resolve('proof/economy-audit'), { recursive: true });
  await writeFile(out, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  process.stdout.write(`${out}\n`);
}
void main();
