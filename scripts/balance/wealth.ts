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
 *   Shard (Phase 9 R-9-9): `--first=K --seeds=N` runs seeds `<seed>-K` .. `<seed>-(K+N-1)` for the style given, or for all four
 *   styles when style is `all` (one JSON line per run, styles inner, seeds outer). Four shards of five seeds cover 20 seeds.
 *       npx tsx scripts/balance/wealth.ts bot wealth 365 all --first=1 --seeds=5
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
import { TPD, bizDef, bizValue, bizValuedIncome, cashOf, credit, netWorthBreakdown, today } from '../../src/world/core';
import { SHOP } from '../../src/content/shops';
import { wellRunCommands } from '../../src/world/shops';
import { appeal, cityUnlocked } from '../../src/world/assets';
import { siteScore, shouldExit, startAppeal, type PoolMass } from './wealth-rules';
import { dailyCosts, managerPrepayCost, managerPrepaid, offlineRate } from '../../src/world/shopRules';
import type { Command, GameState } from '../../src/world/types';
import type { BizDef } from '../../src/content/businesses';

export type Style = 'neglected' | 'casual' | 'average' | 'excellent' | 'idle' | 'managed';
const STYLES: Style[] = ['neglected', 'casual', 'average', 'excellent', 'idle', 'managed'];
const CITIES = ['avalon', 'nordhaven', 'meridia', 'sundara', 'kaiyo', 'serena'];

/** The settings a style sets when it checks in. */
function setupFor(style: Style, bizId: string, demand = 1): Command[] {
  if (style === 'neglected' || style === 'idle') return [];
  // managed: the well-run settings, kept by a 2-star manager (hired once at purchase)
  if (style === 'excellent') {
    // the owner reads demand and staffs to it (crew in steps of 0.25, within 0.5 to 2)
    const crew = Math.min(SHOP.crew.max, Math.max(SHOP.crew.min, Math.ceil(demand * 4) / 4));
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

function argv(): { mode: string; seed: string; days: number; style: Style; first?: number; seeds?: number; trace: boolean } {
  const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
  const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const [mode = 'probe', seed = 'wealth', days = '40', style = 'average'] = pos;
  const flag = (name: string) => { const f = flags.find((x) => x.startsWith(`--${name}=`)); return f === undefined ? undefined : Number(f.split('=')[1]); };
  return { mode, seed, days: Number(days), style: style as Style, first: flag('first'), seeds: flag('seeds'), trace: flags.includes('--trace') };
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
      const stars = starsFor(style);
      if (stars > 0) {
        const h = applyCommand(g, pid, { type: 'biz.manager.hire', bizId, stars });
        if (!h.ok) throw new Error(`manager hire failed for ${style} tier ${t.tier}: ${h.error}`);
      }
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
    // payback in game days, to the fraction of the day the cumulative line crosses the cost (cum[k] is the total after k + 1 days)
    const prev = payDay > 0 ? pr.cum[payDay - 1]! : 0;
    const frac = payDay >= 0 ? (pr.invested - prev) / (pr.cum[payDay]! - prev) : 0;
    const projected = payDay >= 0 ? payDay + frac : rate > 0 ? lastDay + 1 + (pr.invested - pr.cum[lastDay]!) / rate : Infinity;
    console.log(JSON.stringify({
      mode: 'probe', seed, style: pr.style, tier: pr.tier, sector: pr.sector, city: pr.city, rivals: pr.rivals, rivalsEnd,
      payback: Number(projected.toFixed(2)), simulated: payDay >= 0, netPerDay: Number((rate / pr.invested).toFixed(4)),
    }));
  }
}

/** A greedy investor (the old wealth bot) in one style and presence pattern. */
function bot(seed: string, days: number, style: Style, trace = false): void {
  const g: GameState = createGame(seed, { warmupDays: 2, npcs: true });
  applyCommand(g, 'bot', { type: 'join', handle: 'median', country: 'AV' });
  const p = g.players.bot!;
  p.onboarding.skipped = true;
  const ranks: Record<string, number> = {};
  const checkpoints: Record<number, number> = {};
  const start = g.market.tick;
  let lastDayActed = -1;
  const prevEarned: Record<string, number> = {};
  for (let t = 0; t < days * TPD; t++) {
    const gameDay = Math.floor((g.market.tick - start) / TPD);
    if ((g.market.tick - start) % TPD === 0 && gameDay !== lastDayActed) {
      lastDayActed = gameDay;
      const pres = presence(style, gameDay);
      if (p.online !== pres.online) applyCommand(g, 'bot', { type: 'presence', online: pres.online });
      if (pres.online) buyGreedy(g, style);
      if (pres.checkIn) checkIn(g, style);
      if (ranks[p.rankId] === undefined) ranks[p.rankId] = gameDay;
    }
    stepGame(g);
    if ((g.market.tick - start) % TPD === 0 && trace) {
      console.log(JSON.stringify(traceRow(g, style, (g.market.tick - start) / TPD - 1, prevEarned)));
    }
    if ((g.market.tick - start) % (TPD * 8) === 0) checkpoints[Math.floor((g.market.tick - start) / TPD)] = netWorthBreakdown(g, 'bot').total;
  }
  const income = Object.values(g.businesses).filter((b) => b.ownerId === 'bot').reduce((s, b) => s + bizValuedIncome(b), 0);
  console.log(JSON.stringify({ mode: 'bot', seed, style, days, rankFirstSeenGameDay: ranks, netWorth: Math.round(p.netWorth), valuedIncome: Math.round(income), checkpoints }));
}

/**
 * One day of the bot's books, after the day boundary: cash, net worth, and per business the lever settings, the
 * demand and what was served, the income rate, the day's earnings and each operating cost line (the same
 * `dailyCosts` the day step pays), the trailing net and the valuation. Diagnostic only; reads state, changes nothing.
 */
function traceRow(g: GameState, style: Style, day: number, prevEarned: Record<string, number>) {
  const p = g.players.bot!;
  const nw = netWorthBreakdown(g, 'bot');
  const d = today(g);
  const biz = Object.values(g.businesses).filter((b) => b.ownerId === 'bot').map((b) => {
    const s = b.shop;
    const target = bizDef(b).income;
    const managed = s.managerStars > 0;
    const maintainedNow = s.maintained || managed;
    const c = dailyCosts(target, s, maintainedNow, managerPrepaid(s.managerStars, s.managerDay, d - 1));
    const rate = p.online ? 1 : offlineRate((g.market.tick - p.lastSeenTick) / TPD, s.managerStars, b.levels.automation);
    const earnedToday = b.earned - (prevEarned[b.id] ?? b.earned);
    prevEarned[b.id] = b.earned;
    const r = (x: number) => Math.round(x * 100) / 100;
    return {
      id: b.id, tier: bizDef(b).tier, sector: bizDef(b).sector, city: b.cityId, invested: b.invested, target: r(target),
      crew: s.crew, price: s.price, quality: s.quality, marketing: s.marketing, maintained: s.maintained, mgr: s.managerStars,
      condition: r(s.condition), reviews: r(s.reviews), morale: r(s.morale), demand: r(s.demand), queue: r(s.queue),
      share: r(b.share), incPerDay: r(b.incomePerDay), rate: r(rate), event: b.event?.id ?? null, earnedToday: r(earnedToday),
      costs: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, r(v)])), costTotal: r(Object.values(c).reduce((a, x) => a + x, 0)),
      net: r(s.net[s.net.length - 1] ?? 0), valuedIncome: r(bizValuedIncome(b)), value: r(bizValue(b)), lastAttendedAgeDays: r((g.market.tick - s.lastAttendedTick) / TPD),
    };
  });
  return { mode: 'trace', style, day, cash: r2(nw.cash), netWorth: r2(nw.total), businesses: r2(nw.businesses), markets: r2(nw.markets), bizCount: biz.length, online: p.online, biz };
}
function r2(x: number): number { return Math.round(x * 100) / 100; }

/** The mass of every city-sector pool (all owners, NPCs included), by `city:sector`. */
function poolMasses(g: GameState): Map<string, PoolMass> {
  const out = new Map<string, PoolMass>();
  for (const b of Object.values(g.businesses)) {
    const key = `${b.cityId}:${bizDef(b).sector}`;
    const m = out.get(key) ?? { count: 0, expAppeal: 0 };
    m.count++;
    m.expAppeal += Math.exp(appeal(b));
    out.set(key, m);
  }
  return out;
}

/**
 * The owner's check-in: sell any shop that has lost money for two weeks (`shouldExit`), then set the style's levers on
 * what is kept. The sale is a choice the owner makes on the books, not a lever, so every style makes it.
 */
function checkIn(g: GameState, style: Style): void {
  const mine = Object.values(g.businesses).filter((b) => b.ownerId === 'bot');
  for (const b of mine) if (shouldExit(b.shop.net)) applyCommand(g, 'bot', { type: 'biz.sell', bizId: b.id });
  for (const b of Object.values(g.businesses)) if (b.ownerId === 'bot') for (const c of setupFor(style, b.id, b.shop.demand)) applyCommand(g, 'bot', c);
}

/**
 * Buy the site with the best expected return per dollar: income per dollar of cost times the share factor the site would earn
 * in its city-sector pool, given every business already there (`siteScore`). Within the cash, the rank, the tier slot cap and
 * the unlocked cities (up to four a check-in). A managed purchase only happens when the cash also covers the prepaid manager
 * salary, so the hire is asserted.
 */
function buyGreedy(g: GameState, style: Style): void {
  const p = g.players.bot!;
  const r = rankIndex(p.rankId);
  const stars = starsFor(style);
  const newAppeal = startAppeal(style === 'excellent' ? 2 : 0);
  const cities = CITIES.filter((c) => cityUnlocked(p, c));
  for (let k = 0; k < 4; k++) {
    const cash = cashOf(g, 'bot') * 0.9;
    const mine = Object.values(g.businesses).filter((b) => b.ownerId === 'bot');
    const count = (tier: number) => mine.filter((b) => bizDef(b).tier === tier).length;
    const affordable = (d: { cost: number; income: number }) => d.cost + managerPrepayCost(stars, d.income) <= cash;
    const masses = poolMasses(g);
    let best: { def: BizDef; cityId: string; score: number } | null = null;
    for (const d of BUSINESSES) {
      if (!affordable(d) || rankIndex(TIERS[d.tier - 1]!.rank) > r || count(d.tier) >= TIERS[d.tier - 1]!.max) continue;
      for (const c of cities) {
        const score = siteScore(d.income, d.cost, newAppeal, masses.get(`${c}:${d.sector}`) ?? { count: 0, expAppeal: 0 });
        if (!best || score > best.score) best = { def: d, cityId: c, score };
      }
    }
    if (!best) return;
    const r2 = applyCommand(g, 'bot', { type: 'biz.buy', defId: best.def.id, cityId: best.cityId });
    if (!r2.ok) return;
    // managed hires a 2-star manager and excellent a 3-star one, at purchase (S3); the others run without one
    if (stars > 0) {
      const h = applyCommand(g, 'bot', { type: 'biz.manager.hire', bizId: (r2.data as { id: string }).id, stars });
      if (!h.ok) throw new Error(`manager hire failed for ${style}: ${h.error}`);
    }
  }
}

/** Stars a style hires at purchase: managed 2 (S3), excellent 3, none otherwise. */
function starsFor(style: Style): number {
  if (style === 'managed') return 2;
  if (style === 'excellent') return 3;
  return 0;
}

function r3(x: number): number { return Math.round(x * 1000) / 1000; }

/**
 * Census (diagnostic): the NPC world alone, no bot. Every game day: businesses by owner kind, and the pool sizes (city:sector)
 * of the densest pools and of avalon:compute, so the 365-day crowding of a pool can be read against the 40-day probe.
 *   npx tsx scripts/balance/wealth.ts census wealth-1 365
 */
function census(seed: string, days: number): void {
  const g: GameState = createGame(seed, { warmupDays: 2, npcs: true });
  const start = g.market.tick;
  let last = -1;
  for (let t = 0; t < days * TPD; t++) {
    const gameDay = Math.floor((g.market.tick - start) / TPD);
    if (gameDay !== last && (g.market.tick - start) % TPD === 0) {
      last = gameDay;
      const all = Object.values(g.businesses);
      const pools = new Map<string, number>();
      for (const b of all) { const k = `${b.cityId}:${bizDef(b).sector}`; pools.set(k, (pools.get(k) ?? 0) + 1); }
      const sizes = [...pools.values()].sort((a, b) => b - a);
      const npc = all.filter((b) => g.players[b.ownerId]?.npc).length;
      const byTier: Record<number, number> = {};
      for (const b of all) byTier[bizDef(b).tier] = (byTier[bizDef(b).tier] ?? 0) + 1;
      console.log(JSON.stringify({
        mode: 'census', seed, day: gameDay, businesses: all.length, npcOwned: npc, byTier, pools: pools.size,
        poolMax: sizes[0] ?? 0, poolTop5: sizes.slice(0, 5), poolMedian: sizes[Math.floor(sizes.length / 2)] ?? 0,
        avalonCompute: pools.get('avalon:compute') ?? 0,
        avalonComputeSumExpAppeal: r3(all.filter((b) => b.cityId === 'avalon' && bizDef(b).sector === 'compute').reduce((a, b) => a + Math.exp(appeal(b)), 0)),
        allNpcMeanLocation: r3(all.reduce((a, b) => a + b.levels.location, 0) / Math.max(1, all.length)),
        allNpcMeanMarketing: r3(all.reduce((a, b) => a + b.shop.marketing, 0) / Math.max(1, all.length)),
        allNpcMeanReviews: r3(all.reduce((a, b) => a + b.shop.reviews, 0) / Math.max(1, all.length)),
        npcCrew: r3(all.reduce((a, b) => a + b.shop.crew, 0) / Math.max(1, all.length)),
      }));
    }
    stepGame(g);
  }
}

const { mode, seed, days, style, first, seeds, trace } = argv();
if (mode === 'census') census(seed, days);
else if (mode === 'probe') probe(seed, days);
else if (trace) bot(seed, days, style, true);
else if (first !== undefined) {
  // a shard: seeds first..first+seeds-1 (one run per style, styles inner); `all` runs the four styles of the wealth table
  const styles: Style[] = style === ('all' as Style) ? ['neglected', 'average', 'managed', 'excellent'] : [style];
  for (let k = first; k < first + (seeds ?? 1); k++) for (const st of styles) bot(`${seed}-${k}`, days, st);
} else bot(seed, days, style);
