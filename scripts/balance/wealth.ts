/**
 * Shop economics and wealth balance (Phase 4 A1, DECISIONS S6).
 *
 * Two modes, both with NPC competition present (the 24 NPC personas run their own shops):
 *
 *   probe (default): for each management style and each tier, one business in its own city-sector pool.
 *     Reports the cash payback in game days (cumulative earned less costs against the cost paid), and
 *     the steady net per game day when payback falls past the run.
 *       npx tsx scripts/balance/wealth.ts probe [seed=wealth] [days=40]
 *
 *   bot: one greedy investor in a style and a presence pattern. Reports net worth and rank timing in game days.
 *       npx tsx scripts/balance/wealth.ts bot [seed=wealth] [days=40] [style=average]
 *
 * Styles (shops.md 7.1): neglected (buy, set nothing, check in once per 24 game days), casual (well-run
 * settings, check in once per 24 game days, no manager), average (well-run settings, online 16 of every 24
 * game days), excellent (3-star manager; crew tracks demand; price 1.05, quality 3, marketing 2; online 16 of 24),
 * idle (online 16 of 24 like average, but sets nothing: the shops.md neglected row), managed (S3: once a real
 * day, well-run settings, a 2-star manager hired at purchase, no daily attention).
 * One game day is one real hour, so "once per real day" is one online game day in every 24.
 *
 * Output is JSON lines, so a driver can aggregate several seeds in parallel.
 */
import { BIZ_SECTORS, BUSINESSES, TIERS } from '../../src/content/businesses';
import { applyCommand, createGame, stepGame } from '../../src/world/game';
import { rankIndex } from '../../src/content/lifestyle';
import { TPD, bizDef, bizValuedIncome, cashOf, credit, netWorthBreakdown } from '../../src/world/core';
import { wellRunCommands } from '../../src/world/shops';
import type { Command, GameState } from '../../src/world/types';

export type Style = 'neglected' | 'casual' | 'average' | 'excellent' | 'idle' | 'managed';
const STYLES: Style[] = ['neglected', 'casual', 'average', 'excellent', 'idle', 'managed'];
const CITIES = ['avalon', 'nordhaven', 'meridia', 'sundara', 'kaiyo', 'serena'];

/** The settings a style sets when it checks in. */
function setupFor(style: Style, bizId: string, demand = 1): Command[] {
  if (style === 'neglected' || style === 'idle') return [];
  // managed: the well-run settings, kept by a 2-star manager (hired once at purchase)
  if (style === 'excellent') {
    // the owner reads demand and staffs to it (crew in steps of 0.25, within 0.5 to 2)
    const crew = Math.min(2, Math.max(0.5, Math.ceil(demand * 4) / 4));
    return [
      { type: 'biz.crew', bizId, crew },
      { type: 'biz.price', bizId, price: 1.05 },
      { type: 'biz.quality', bizId, level: 3 },
      { type: 'biz.marketing', bizId, level: 2 },
      { type: 'biz.maintain', bizId, on: true },
    ];
  }
  return wellRunCommands(bizId);
}

/** Whether a style is online at this game day (and a daily check-in day for the once-a-day styles). */
function presence(style: Style, gameDay: number): { online: boolean; checkIn: boolean } {
  if (style === 'neglected' || style === 'casual' || style === 'managed') return { online: gameDay % 24 === 0, checkIn: gameDay % 24 === 0 };
  const hourOfDay = gameDay % 24;
  // an owner who is online checks in every day, so the shop never goes unattended (idle: online, sets nothing)
  return { online: hourOfDay < 16, checkIn: style !== 'idle' && hourOfDay < 16 };
}

function argv(): { mode: string; seed: string; days: number; style: Style } {
  const [mode = 'probe', seed = 'wealth', days = '40', style = 'average'] = process.argv.slice(2);
  return { mode, seed, days: Number(days), style: style as Style };
}

function hash(x: string): number {
  let h = 2166136261;
  for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619);
  return (h >>> 0);
}

/** A probe: four players (one per style), each holding one business per tier in its own pool. */
function probe(seed: string, days: number): void {
  const g: GameState = createGame(seed, { warmupDays: 2, npcs: true });
  const sectors = BIZ_SECTORS.map((s) => s.id);
  const pools = sectors.flatMap((sec) => CITIES.map((c) => [sec, c] as const));
  const used = new Set<number>();
  const h0 = hash(seed);
  const probes: { style: Style; pid: string; bizId: string; tier: number; invested: number; sector: string; city: string; rivals: number; cum: number[] }[] = [];
  STYLES.forEach((style) => {
    const pid = `probe-${style}`;
    applyCommand(g, pid, { type: 'join', handle: `probe-${style}`, country: 'AV' });
    const p = g.players[pid]!;
    p.onboarding.skipped = true;
    p.rankId = 'R5';
    credit(g, pid, 5e9, 'calibration');
    TIERS.forEach((t) => {
      let k = (h0 + hash(`${style}:${t.tier}`)) % pools.length;
      while (used.has(k)) k = (k + 1) % pools.length;
      used.add(k);
      const [sector, city] = pools[k]!;
      const def = BUSINESSES.find((b) => b.sector === sector && b.tier === t.tier)!;
      const rivals = Object.values(g.businesses).filter((b) => b.cityId === city && BUSINESSES.find((x) => x.id === b.defId)!.sector === sector).length;
      const r = applyCommand(g, pid, { type: 'biz.buy', defId: def.id, cityId: city });
      if (!r.ok) throw new Error(`buy failed for ${style} tier ${t.tier}: ${r.error}`);
      const bizId = (r.data as { id: string }).id;
      if (style === 'managed') applyCommand(g, pid, { type: 'biz.manager.hire', bizId, stars: 2 });
      probes.push({ style, pid, bizId, tier: t.tier, invested: def.cost, sector, city, rivals, cum: [] });
    });
  });
  const start = g.market.tick;
  const T = days * TPD;
  let lastDayActed = -1;
  for (let t = 0; t < T; t++) {
    const gameDay = Math.floor((g.market.tick - start) / TPD);
    if ((g.market.tick - start) % TPD === 0 && gameDay !== lastDayActed) {
      lastDayActed = gameDay;
      for (const pr of probes) {
        const pres = presence(pr.style, gameDay);
        const p = g.players[pr.pid]!;
        if (p.online !== pres.online) applyCommand(g, pr.pid, { type: 'presence', online: pres.online });
        if (pres.checkIn) for (const c of setupFor(pr.style, pr.bizId, g.businesses[pr.bizId]!.shop.demand)) applyCommand(g, pr.pid, c);
      }
    }
    stepGame(g);
    if ((g.market.tick - start) % TPD === 0) {
      for (const pr of probes) {
        const b = g.businesses[pr.bizId]!;
        pr.cum.push(b.earned - b.shop.costs);
      }
    }
  }
  for (const pr of probes) {
    const payDay = pr.cum.findIndex((c) => c >= pr.invested);
    const sectorOf = (id: string) => BUSINESSES.find((x) => x.id === id)!.sector;
    const rivalsEnd = Object.values(g.businesses).filter((b) => b.ownerId !== pr.pid && b.cityId === pr.city && sectorOf(b.defId) === pr.sector).length;
    const lastDay = pr.cum.length - 1;
    const rate = lastDay > 10 ? (pr.cum[lastDay]! - pr.cum[10]!) / (lastDay - 10) : 0;
    const projected = payDay >= 0 ? payDay + 1 : rate > 0 ? lastDay + 1 + (pr.invested - pr.cum[lastDay]!) / rate : Infinity;
    console.log(JSON.stringify({
      mode: 'probe', seed, style: pr.style, tier: pr.tier, sector: pr.sector, city: pr.city, rivals: pr.rivals, rivalsEnd,
      payback: Number(projected.toFixed(2)), simulated: payDay >= 0, netPerDay: Number((rate / pr.invested).toFixed(4)),
    }));
  }
}

/** A greedy investor (the old wealth bot) in one style and presence pattern. */
function bot(seed: string, days: number, style: Style): void {
  const g: GameState = createGame(seed, { warmupDays: 2, npcs: true });
  applyCommand(g, 'bot', { type: 'join', handle: 'median', country: 'AV' });
  const p = g.players.bot!;
  p.onboarding.skipped = true;
  const ranks: Record<string, number> = {};
  const checkpoints: Record<number, number> = {};
  const start = g.market.tick;
  let lastDayActed = -1;
  for (let t = 0; t < days * TPD; t++) {
    const gameDay = Math.floor((g.market.tick - start) / TPD);
    if ((g.market.tick - start) % TPD === 0 && gameDay !== lastDayActed) {
      lastDayActed = gameDay;
      const pres = presence(style, gameDay);
      if (p.online !== pres.online) applyCommand(g, 'bot', { type: 'presence', online: pres.online });
      if (pres.online) buyGreedy(g, style);
      if (pres.checkIn) for (const b of Object.values(g.businesses)) if (b.ownerId === 'bot') for (const c of setupFor(style, b.id)) applyCommand(g, 'bot', c);
      if (ranks[p.rankId] === undefined) ranks[p.rankId] = gameDay;
    }
    stepGame(g);
    if ((g.market.tick - start) % (TPD * 8) === 0) checkpoints[Math.floor((g.market.tick - start) / TPD)] = netWorthBreakdown(g, 'bot').total;
  }
  const income = Object.values(g.businesses).filter((b) => b.ownerId === 'bot').reduce((s, b) => s + bizValuedIncome(b), 0);
  console.log(JSON.stringify({ mode: 'bot', seed, style, days, rankFirstSeenGameDay: ranks, netWorth: Math.round(p.netWorth), valuedIncome: Math.round(income), checkpoints }));
}

/** Buy the best net income per dollar the cash and rank allow, within each tier's slot cap (up to four a check-in). */
function buyGreedy(g: GameState, style: Style): void {
  const p = g.players.bot!;
  const r = rankIndex(p.rankId);
  for (let k = 0; k < 4; k++) {
    const cash = cashOf(g, 'bot') * 0.9;
    const mine = Object.values(g.businesses).filter((b) => b.ownerId === 'bot');
    const count = (tier: number) => mine.filter((b) => bizDef(b).tier === tier).length;
    const best = BUSINESSES.filter((d) => d.cost <= cash && rankIndex(TIERS[d.tier - 1]!.rank) <= r && count(d.tier) < TIERS[d.tier - 1]!.max)
      .sort((a, b) => b.income / b.cost - a.income / a.cost || a.id.localeCompare(b.id))[0];
    if (!best) return;
    const r2 = applyCommand(g, 'bot', { type: 'biz.buy', defId: best.id, cityId: CITIES[0]! });
    if (!r2.ok) return;
    // the managed style hires a 2-star manager at purchase (S3); the others run without one
    if (style === 'managed') applyCommand(g, 'bot', { type: 'biz.manager.hire', bizId: (r2.data as { id: string }).id, stars: 2 });
  }
}

const { mode, seed, days, style } = argv();
if (mode === 'probe') probe(seed, days);
else bot(seed, days, style);
