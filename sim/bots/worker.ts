// One bot, one world. The parent forks this file so each run has its own process.
import { DAYS_PER_YEAR, type World } from '../kernel/index.ts';
import { openWorld } from '../run.ts';
import { PRISON } from '../modules/economy/people.ts';
import { act, playerIndex, view, type Command } from '../modules/player/index.ts';
import type { Job, Jump, RunResult } from './result.ts';
import * as bond from './bond-ladder.ts';
import * as gambler from './gambler.ts';
import * as indexInvestor from './index-investor.ts';
import * as insider from './insider.ts';
import * as landlord from './landlord.ts';
import * as meme from './meme.ts';
import * as momentum from './momentum.ts';
import * as nothing from './nothing.ts';
import * as raider from './raider.ts';
import * as randomBot from './random.ts';
import * as value from './value.ts';

interface Strategy {
  name: string;
  bot: (view: ReturnType<typeof view>, w: World) => Command[];
  missing?: string;
}

const strategies: Strategy[] = [nothing, indexInvestor, bond, momentum, value, gambler, meme, insider, raider, landlord, randomBot];
const byName = new Map(strategies.map((s) => [s.name, s]));

const why = (e: unknown): string => e instanceof Error ? e.message : String(e);

function indexRel(w: World): number {
  // Capitalisation-weighted total return: the price index plus dividends reinvested after tax.
  const m = w.state.markets as { tr?: number } | undefined;
  return m?.tr && m.tr > 0 ? m.tr / 100 : 1;
}

function keep(jumps: Jump[], j: Jump): void {
  jumps.push(j);
  jumps.sort((a, b) => (b.to - b.from) - (a.to - a.from));
  if (jumps.length > 6) jumps.length = 6;
}

function traceDay(w: World, fromId: number, toId: number, actor: string, name: string): string[] {
  const hits: number[] = [];
  for (let id = fromId; id < toId; id++) {
    const e = w.events.get(id);
    if (!e) continue;
    if (e.actor === actor || (name.length > 3 && e.msg.includes(name))) hits.push(id);
  }
  const lines = hits.slice(0, 5).map((id) => w.events.explain(id, 4).join('\n'));
  if (lines.length) return lines;
  for (let id = toId - 1; id >= fromId && lines.length < 2; id--) {
    const e = w.events.get(id);
    if (!e) continue;
    if (e.kind === 'macro.cpi' || e.kind === 'cb.rate' || e.kind === 'earnings.report' || e.kind === 'mkt.news')
      lines.push(w.events.explain(id, 3).join('\n'));
  }
  if (!lines.length) lines.push('(no event that day names the player; the move is a mark)');
  return lines;
}

function caughtOf(w: World, ids: Set<string>): number {
  const evs = w.events.recent(['law.charge', 'law.verdict', 'law.judgment'], 20000);
  let charges = 0, convictions = 0;
  for (const e of evs) {
    if (!e.actor || !ids.has(e.actor)) continue;
    if (e.kind === 'law.charge') charges++;
    else if (e.msg.includes('convicted')) convictions++;
  }
  return Math.max(charges, convictions);
}

function blank(bot: string, seed: number, years: number, error: string): RunResult {
  return {
    bot, seed, start: 0, end: 0, rel: 0, indexRel: 1, days: 0, years,
    bankrupt: false, dead: false, prison: false, caught: 0,
    threw: [], books: [], jumps: [], path: [], missing: '', ms: 0, error,
  };
}

export function runJob(job: Job): RunResult {
  const mod = byName.get(job.bot);
  if (!mod) return blank(job.bot, job.seed, job.years, `unknown bot ${job.bot}`);
  const t0 = Date.now();
  const w = openWorld(String(job.seed), new Set());
  const threw: string[] = [];
  const books: string[] = [];
  const jumps: Jump[] = [];
  const path: { day: number; worth: number }[] = [];
  const ids = new Set<string>();
  const v0 = view(w);
  const start = v0.netWorth;
  let prev = start;
  let name = v0.name;
  const horizon = Math.max(1, job.years) * DAYS_PER_YEAR;
  const open = w.ledger.check();
  if (open.length) books.push(...open.slice(0, 8));
  while (w.day < horizon && !books.length) {
    const who = playerIndex(w);
    if (who >= 0) ids.add(`p_${who}`);
    if (w.day % 7 === 0) {
      const v = view(w);
      name = v.name;
      if (v.alive && !v.over) {
        let cmds: Command[] = [];
        try { cmds = mod.bot(v, w); }
        catch (e) { threw.push(why(e)); }
        for (const cmd of cmds) {
          try { act(w, cmd); }
          catch (e) { threw.push(why(e)); }
        }
      }
    }
    const c0 = w.events.count;
    try { w.step(); }
    catch (e) {
      const msg = `day ${w.day}: ${why(e)}`;
      threw.push(msg);
      const lines: string[] = [];
      for (let id = w.events.count - 1; id >= 0 && lines.length < 8; id--) {
        const ev = w.events.get(id);
        if (!ev || ev.day < w.day) break;
        lines.push(`[day ${ev.day}] ${ev.kind}${ev.actor ? ' ' + ev.actor : ''}: ${ev.msg}`);
      }
      if (lines.length) threw.push(lines.reverse().join('\n'));
      const opt: string[] = [];
      for (let id = w.events.count - 1; id >= 0 && opt.length < 6; id--) {
        const ev = w.events.get(id);
        if (!ev) continue;
        if (ev.kind.startsWith('opt.')) opt.push(`[day ${ev.day}] ${ev.kind}${ev.actor ? ' ' + ev.actor : ''}: ${ev.msg}`);
      }
      if (opt.length) threw.push(opt.reverse().join('\n'));
      books.push(msg);
      break;
    }
    const v = view(w);
    const worth = v.netWorth;
    const gain = worth - prev;
    const floor = jumps.length < 6 ? 0 : jumps[jumps.length - 1].to - jumps[jumps.length - 1].from;
    if (gain > floor) {
      const actor = who >= 0 ? `p_${playerIndex(w)}` : '';
      keep(jumps, { day: w.day, from: prev, to: worth, trace: traceDay(w, c0, w.events.count, actor, name) });
    }
    prev = worth;
    if (w.day % DAYS_PER_YEAR === 0) path.push({ day: w.day, worth });
    if (w.day % 30 === 0 || w.day === horizon) {
      const bad = w.ledger.check();
      if (bad.length) books.push(...bad.slice(0, 8));
    }
  }
  const end = view(w);
  const who = playerIndex(w);
  if (who >= 0) ids.add(`p_${who}`);
  const P = (w.state.economy as { P: { flags: Uint8Array; n: number } }).P;
  let prison = who >= 0 && who < P.n && (P.flags[who] & PRISON) !== 0;
  if (!prison) {
    for (const e of w.events.recent(['law.verdict'], 20000)) {
      if (e.actor && ids.has(e.actor) && e.msg.includes('imprisoned')) { prison = true; break; }
    }
  }
  const dead = end.over || !end.alive;
  const rel = start > 0 ? end.netWorth / start : 0;
  if (path.length === 0 || path[path.length - 1].day !== w.day) path.push({ day: w.day, worth: end.netWorth });
  return {
    bot: mod.name,
    seed: job.seed,
    start,
    end: end.netWorth,
    rel,
    indexRel: indexRel(w),
    days: w.day,
    years: job.years,
    bankrupt: !dead && end.netWorth <= 0,
    dead,
    prison: !dead && prison,
    caught: caughtOf(w, ids),
    threw,
    books,
    jumps: rel > 50 ? jumps : [],
    path,
    missing: mod.missing ?? '',
    ms: Date.now() - t0,
  };
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('worker.ts') || entry.endsWith('worker.js')) {
  process.on('message', (job: Job) => {
    try { process.send?.(runJob(job)); }
    catch (e) { process.send?.(blank(job.bot, job.seed, job.years, why(e))); }
  });
}
