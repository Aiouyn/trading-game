/**
 * Meme-coin price action v2: seeded stats harness. Read-only research script; it opens no save and writes only the files named below.
 * Usage: npx tsx scripts/launchpad/pa-v2.ts [worldIndex] [launchesPerWorld] [outDir]
 *   One process runs one world (seed `pa-v2-w<index>`). The merge step (pa-v2-merge.ts) pools the worlds and prints the done check.
 * The harness is privileged: it reads the hidden archetype for the per-type table only. The bots read public data only (tape lines,
 * holder balances, buzz), the same fields the token page shows.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { lpWorld } from '../../src/world/launchpad/fixture';
import { lpTick } from '../../src/world/launchpad/flow';
import { npcLaunchDraw } from '../../src/world/launchpad/launch';
import { spotAt } from '../../src/world/launchpad/curve';
import { cohortsOf } from '../../src/world/launchpad/cohorts';
import { TPD, LP } from '../../src/world/launchpad/constants';
import { driveAt } from '../../src/world/launchpad/attention';
import type { PaState } from '../../src/world/launchpad/attention';
import type { LpToken } from '../../src/world/launchpad/types';

const world = Number(process.argv[2] ?? 0);
const N = Number(process.argv[3] ?? 500);
const outDir = process.argv[4] ?? 'proof/pa-v2';
const SEED = process.env.PA_SEED ?? 'pa-v2-w';
/** attention below this many orders per tick counts as dead (about one order every 20 ticks) */
const DEAD_LAM = 0.05;
const H = 7 * TPD;
const LAUNCH_EVERY = 12; // 60 launches a game day, the world's own rate

type Rec = {
  ticker: string; born: number; arch: string; mimic: string;
  o: Float64Array; h: Float64Array; l: Float64Array; c: Float64Array; v: Float32Array; n: Uint16Array; y: Float64Array;
  status: string; gradTick: number; deadTick: number;
  seenSeq: number; buyers: Set<string>; buyers5: number; early: Map<string, number>; earlySoldBy: Map<string, number>; earlySold: number; earlyBought: number;
  dipBuy: number; dipSell: number; feat?: number[]; actLife: number; top6?: [string, number][];
};

const g = lpWorld(`${SEED}${world}`);
const s = g.launchpad ?? (g.launchpad = undefined as never);
const recs: Rec[] = [];
const byTicker = new Map<string, Rec>();
const t0 = g.market.tick;
const total = N * LAUNCH_EVERY + H + 2;
const started = Date.now();

function volOf(t: LpToken) { return t.flows.npcBuy + t.flows.npcSell + t.flows.playerBuy + t.flows.playerSell; }
const lastVol = new Map<string, number>();

for (let i = 1; i <= total; i++) {
  g.market = { ...g.market, tick: g.market.tick + 1 };
  const tick = g.market.tick;
  if ((i - 1) % LAUNCH_EVERY === 0 && recs.length < N) {
    const before = new Set(g.launchpad?.order ?? []);
    npcLaunchDraw(g, null);
    const tk = (g.launchpad?.order ?? []).find(x => !before.has(x));
    if (tk) {
      const r: Rec = { ticker: tk, born: tick, arch: '', mimic: '', o: new Float64Array(H), h: new Float64Array(H), l: new Float64Array(H), c: new Float64Array(H),
        v: new Float32Array(H), n: new Uint16Array(H), y: new Float64Array(H), status: 'live', gradTick: -1, deadTick: -1, seenSeq: -1,
        buyers: new Set(), buyers5: 0, early: new Map(), earlySoldBy: new Map(), earlySold: 0, earlyBought: 0, dipBuy: 0, dipSell: 0, actLife: 0 };
      recs.push(r); byTicker.set(tk, r); lastVol.set(tk, 0);
    }
  }
  lpTick(g, null);
  for (const r of recs) {
    const age = tick - r.born;
    if (age < 0 || age >= H) continue;
    const t = g.launchpad!.tokens[r.ticker]!;
    if (!r.arch) { const pa = (t.micro as unknown as { pa?: { arch: string; mimic: string } })?.pa; r.arch = pa?.arch ?? 'n/a'; r.mimic = pa?.mimic ?? 'n/a'; }
    const prevC = age > 0 ? r.c[age - 1]! : spotAt(LP.Y0);
    const bar = t.bars?.s?.[t.bars.s.length - 1];
    const live = t.status === 'live';
    const p = live ? spotAt(t.y) : prevC;
    if (bar && bar[0] === tick && live) { r.o[age] = prevC; r.h[age] = Math.max(bar[2], prevC); r.l[age] = Math.min(bar[3], prevC); r.c[age] = bar[4]; }
    else { r.o[age] = prevC; r.h[age] = Math.max(prevC, p); r.l[age] = Math.min(prevC, p); r.c[age] = p; }
    r.y[age] = live ? t.y : (age > 0 ? r.y[age - 1]! : LP.Y0);
    const vNow = volOf(t);
    r.v[age] = Math.max(0, vNow - (lastVol.get(r.ticker) ?? 0));
    lastVol.set(r.ticker, vNow);
    // public tape lines new this tick
    let k = 0;
    const ret = prevC > 0 ? r.c[age]! / prevC - 1 : 0;
    for (let j = t.tape.length - 1; j >= 0; j--) {
      const tr = t.tape[j]!;
      if (tr.tick !== tick) break;
      if (tr.chatter) continue;
      k++;
      const usd = tr.usd ?? tr.qty * tr.price;
      if (age < 120) {
        const who = tr.anon ?? `npc`;
        if (tr.side === 'buy') {
          // unique buyers count buys of $50 or more (scalper clips are noise a player filters out)
          if (usd >= 50 && !r.buyers.has(who)) { r.buyers.add(who); if (age < 60) r.buyers5++; }
          // early buyers: ticks 1 to 23 (the launch tick's sniper and launch-buzz fill are excluded)
          if (age >= 1 && age < 24 && tr.anon) { r.early.set(who, (r.early.get(who) ?? 0) + tr.qty); r.earlyBought += tr.qty; }
        } else if (tr.anon && r.early.has(who)) { r.earlySold += tr.qty; r.earlySoldBy.set(who, (r.earlySoldBy.get(who) ?? 0) + tr.qty); }
        // dip-buy strength: flow on ticks that follow a red tick
        if (age > 0 && r.c[age - 1]! < r.o[age - 1]! * 0.97) { if (tr.side === 'buy') r.dipBuy += usd; else r.dipSell += usd; }
      }
    }
    void ret;
    r.n[age] = Math.min(65535, k);
    const holdersOf = () => { const h = new Map<string, number>(); for (const c of cohortsOf(t)) { if (!c.wallet) continue; h.set(c.wallet, (h.get(c.wallet) ?? 0) + c.tokens); } for (const [pid, q] of Object.entries(t.bal)) h.set(pid, (h.get(pid) ?? 0) + q); return h; };
    // the public holder list half a minute in: its top three wallets are the launch whales a player watches
    if (age === 6) r.top6 = [...holdersOf().entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (age === 119) {
      // public tells at minute 10
      const holders = new Map<string, number>();
      for (const c of cohortsOf(t)) { const w = c.wallet ?? 'cohort'; holders.set(w, (holders.get(w) ?? 0) + c.tokens); }
      for (const [pid, q] of Object.entries(t.bal)) holders.set(pid, (holders.get(pid) ?? 0) + q);
      const sorted = [...holders.values()].sort((a, b) => b - a);
      const held = sorted.reduce((a, b) => a + b, 0);
      const top5 = held > 0 ? sorted.slice(0, 5).reduce((a, b) => a + b, 0) / held : 1;
      const uniq = r.buyers.size, growth = (uniq - r.buyers5) / Math.max(1, r.buyers5);
      // dev-sell timing: the share of the largest early (first two minutes) buyers' tokens they sold by minute 10
      // dev-sell tell: the share of the half-minute top-three holders' tokens gone by minute 10
      const devSold = (() => { const top = r.top6 ?? []; const had = top.reduce((a, [, q]) => a + q, 0); const gone = top.reduce((a, [w, q]) => a + Math.max(0, q - (holders.get(w) ?? 0)), 0); return had > 0 ? gone / had : 0; })();
      const buzz = t.buzz.base + t.buzz.board + t.buzz.wire;
      const dip = (r.dipBuy + 1) / (r.dipBuy + r.dipSell + 2);
      const mom = r.c[age]! / spotAt(LP.Y0);
      r.feat = [Math.log1p(uniq), growth, top5, devSold, Math.log1p(buzz), dip, Math.log(mom)];
    }
    if (t.status === 'graduated' && r.gradTick < 0) r.gradTick = age;
    if (t.status === 'dead' && r.deadTick < 0) r.deadTick = age;
    r.status = t.status;
    { const pa = (t.micro as unknown as { pa?: PaState })?.pa; if (pa && t.status !== 'dead') { const lam = driveAt(pa, age).drive + pa.e + (pa.f ?? 0); if (lam >= DEAD_LAM) r.actLife = age; } }
  }
  if (i % 2000 === 0) process.stderr.write(`w${world} tick ${i}/${total} launches ${recs.length} ${(Date.now() - started) / 1000}s\n`);
}

mkdirSync(outDir, { recursive: true });
// One Float32 block per coin: o, h, l, c, v, n, y (H values each), plus a JSON index.
const F = 7;
const buf = new Float32Array(recs.length * F * H);
recs.forEach((r, k) => { const base = k * F * H; [r.o, r.h, r.l, r.c, r.v, r.n, r.y].forEach((a, j) => buf.set(a as ArrayLike<number>, base + j * H)); });
writeFileSync(`${outDir}/world-${world}.bin`, Buffer.from(buf.buffer));
writeFileSync(`${outDir}/world-${world}.json`, JSON.stringify({ world, seed: `${SEED}${world}`, t0, H, F, launches: recs.length, recs: recs.map(r => ({ ticker: r.ticker, arch: r.arch, mimic: r.mimic, status: r.status, gradTick: r.gradTick, deadTick: r.deadTick, actLife: r.actLife, feat: r.feat ?? null })) }));
process.stderr.write(`w${world} done ${recs.length} launches in ${(Date.now() - started) / 1000}s\n`);
