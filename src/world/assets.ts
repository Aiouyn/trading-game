import { CITIES, districtAssetId, liquidationEquity } from '@/engine';
import {
  BIZ_BY_ID, BIZ_EVENTS, BIZ_SECTOR_BY_ID, MAX_UPGRADE, RETIRED_UPGRADES, TIERS, UPGRADES, upgradeCost, type UpgradeAxis,
} from '@/content/businesses';
import {
  LIFE_BY_ID, PROPERTY_TYPE_BY_ID, TIER_VALUE_MULT, prestigeOf, rankIndex, resaleValue,
} from '@/content/lifestyle';
import { SHOP } from '@/content/shops';
import {
  TPD, bizDef, bump, cashOf, touch, clamp, credit, debit, districtIndex, districtTier, drawFrom, keyedRng, netWorthBreakdown,
  notify, playerBusinesses, priceOf, propType, propValue, pushWire, sanitize, today,
} from './core';
import { offlineRate, purchaseShop, queueShare } from './shopRules';
import type { Business, CommandResult, GameState, Player, StepOutput } from './types';

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

/** City demand size: bigger cities pay more for the same business. */
export const CITY_DEMAND: Record<string, number> = { avalon: 1, nordhaven: 1.1, meridia: 1.15, sundara: 1.2, kaiyo: 1.25, serena: 1.3 };

/** vertical integration: sector -> sectors it supplies */
const FEEDS = new Map<string, Set<string>>();
for (const d of BIZ_BY_ID.values()) if (d.feeds) { const s = FEEDS.get(d.sector) ?? new Set<string>(); s.add(d.feeds); FEEDS.set(d.sector, s); }

const REGIME_SCORE: Record<string, number> = { expansion: 0.2, overheating: 0.6, contraction: -1, recovery: 0.3 };

export function cityUnlocked(p: Player, cityId: string): boolean {
  const c = CITIES.find((x) => x.id === cityId);
  return !!c && rankIndex(p.rankId) >= rankIndex(c.unlockRank);
}

// ================================================================ businesses

export function buyBusiness(g: GameState, pid: string, defId: string, cityId: string, name: string | undefined, out: StepOutput | null): CommandResult {
  const p = g.players[pid]!;
  const def = BIZ_BY_ID.get(defId);
  if (!def) return fail('unknown business');
  const tier = TIERS[def.tier - 1]!;
  if (rankIndex(p.rankId) < rankIndex(tier.rank)) return fail(`${tier.name} businesses unlock at a higher rank`);
  if (!cityUnlocked(p, cityId)) return fail('that city is locked at your rank');
  const owned = Object.values(g.businesses).filter((b) => b.ownerId === pid && bizDef(b).tier === def.tier).length;
  if (owned >= tier.max) return fail(`you can run at most ${tier.max} ${tier.name} businesses: sell one or move up a tier`);
  if (p.heldUntil > g.market.tick) return fail('your assets are held by the court');
  if (cashOf(g, pid) < def.cost) return fail('not enough cash');
  bump(g, pid, -def.cost); // cash becomes the business: a conversion, not a sink
  g.bizSeq++;
  const id = `b${g.bizSeq}`;
  const levels = { staff: 0, marketing: 0, equipment: 0, location: 0, automation: 0, research: 0 } as Record<UpgradeAxis, number>;
  const shop = purchaseShop(g.market.tick);
  const b: Business = {
    id, defId, ownerId: pid, cityId, name: sanitize(name || def.name, 40), boughtTick: g.market.tick, invested: def.cost,
    levels, event: null, incomePerDay: SHOP.revenueMult * def.income * Math.min(1, shop.crew), share: 0, earned: 0, shop,
  };
  g.businesses[id] = b;
  touch(g);
  p.stats.bizBought++;
  markShares(g);
  if (def.tier >= 3) pushWire(g, out, { kind: 'biz', tag: 'Deal', tone: 'brass', text: `${p.handle} buys ${def.name} in ${cityName(cityId)}`, playerId: pid });
  return ok({ id });
}

export function upgradeBusiness(g: GameState, pid: string, bizId: string, axis: UpgradeAxis): CommandResult {
  const b = g.businesses[bizId];
  if (!b || b.ownerId !== pid) return fail('not your business');
  if (RETIRED_UPGRADES.includes(axis)) return fail('biz.axis.retired');
  if (!UPGRADES.some((u) => u.id === axis)) return fail('unknown upgrade');
  const lvl = b.levels[axis];
  if (lvl >= MAX_UPGRADE) return fail('already at the top level');
  const cost = upgradeCost(bizDef(b).cost, lvl);
  if (cashOf(g, pid) < cost) return fail('not enough cash');
  debit(g, pid, cost, 'business upgrades');
  b.invested += cost;
  b.levels[axis] = lvl + 1;
  g.players[pid]!.stats.bizUpgrades++;
  markShares(g);
  return ok({ level: lvl + 1, cost });
}

export function sellBusiness(g: GameState, pid: string, bizId: string, out: StepOutput | null): CommandResult {
  const b = g.businesses[bizId];
  if (!b || b.ownerId !== pid) return fail('not your business');
  const price = businessSalePrice(b.invested);
  bump(g, pid, price);
  // the 30% haircut is destroyed money
  g.economy.sinks['business sale haircut'] = (g.economy.sinks['business sale haircut'] ?? 0) + (b.invested - price);
  delete g.businesses[bizId];
  touch(g);
  g.players[pid]!.stats.bizSold++;
  markShares(g);
  notify(g, out, pid, { kind: 'biz', tone: 'info', text: `Sold ${b.name} for $${price.toLocaleString('en-US')}` });
  return ok({ price });
}

export function renameBusiness(g: GameState, pid: string, bizId: string, name: string): CommandResult {
  const b = g.businesses[bizId];
  if (!b || b.ownerId !== pid) return fail('not your business');
  const n = sanitize(name, 40);
  if (!n) return fail('enter a name');
  b.name = n;
  return ok();
}

export function cityName(id: string): string {
  return CITIES.find((c) => c.id === id)?.name ?? id;
}

/**
 * Appeal drives market share inside a city-sector pool (logit). Marketing is the owner's spend level
 * (a flow, not a one-off upgrade); location stays a permanent upgrade. There is no tier term: a higher
 * tier earns its payback ladder through its roi alone (S1, the lone-pool ladder).
 */
export function appeal(b: Business): number {
  return SHOP.marketing.appealPerLevel * b.shop.marketing + 0.2 * b.levels.location;
}

/**
 * Recompute every business's market share and income. Each city-sector pool has NPC competitors
 * (mass grows with the number of player businesses in it), so crowding a pool lowers everyone's
 * share, and marketing and location win share from rivals (bible 01: logit market share).
 */
/**
 * A business or lever changed: recompute the shares now, inside the command. Nothing is left pending outside the
 * state, so a snapshot taken mid-day restores to the same incomes as the live game (no dirty flag to lose).
 */
export function markShares(g: GameState): void { recomputeShares(g); }

export function recomputeShares(g: GameState): void {
  const pools = new Map<string, Business[]>();
  for (const b of Object.values(g.businesses)) {
    const key = `${b.cityId}:${bizDef(b).sector}`;
    const arr = pools.get(key) ?? [];
    arr.push(b);
    pools.set(key, arr);
  }
  const regimeScore = REGIME_SCORE[g.market.regime] ?? 0;
  const owned = new Map<string, Map<string, number>>();
  for (const b of Object.values(g.businesses)) {
    const m = owned.get(b.ownerId) ?? new Map<string, number>();
    const s = bizDef(b).sector;
    m.set(s, (m.get(s) ?? 0) + 1);
    owned.set(b.ownerId, m);
  }
  for (const list of pools.values()) {
    const M = 3 + 0.3 * list.length;
    let sum = M;
    for (const b of list) sum += Math.exp(appeal(b));
    for (const b of list) {
      const def = bizDef(b);
      const sec = BIZ_SECTOR_BY_ID.get(def.sector)!;
      const share = Math.exp(appeal(b)) / sum;
      const shareFactor = clamp(share * (M + 1), 0.35, 1.8);
      const L = b.levels;
      const s = b.shop;
      const mult = (1 + 0.07 * L.equipment) * (1 + 0.05 * L.location) * (1 + 0.06 * L.research);
      const cycle = 1 + 0.25 * sec.cyclicality * regimeScore;
      const mine = owned.get(b.ownerId)!;
      let synergy = (mine.get(def.sector) ?? 0) >= 3 ? 1.1 : 1;
      for (const [sec2] of mine) {
        if (FEEDS.get(sec2)?.has(def.sector)) { synergy *= 1.05; break; }
      }
      const ev = b.event && b.event.untilTick > g.market.tick ? b.event.mult : 1;
      // demand falls with price (elastic) and with reviews; the crew caps how much of it is served
      const demand = shareFactor * Math.pow(s.price, -SHOP.elasticity) * s.reviews * cycle * ev * (CITY_DEMAND[b.cityId] ?? 1);
      const served = Math.min(demand, s.crew);
      s.demand = demand;
      s.queue = queueShare(demand, served);
      const condition = s.condition < SHOP.condition.lowBelow ? SHOP.condition.lowRevenue : 1;
      b.share = share;
      b.incomePerDay = SHOP.revenueMult * def.income * served * s.price * (1 + SHOP.quality.revenuePerLevel * s.quality) * mult * synergy * condition;
    }
  }
}

/**
 * Accrue business income each tick; credit it to cash every few ticks. Away from the game, a shop keeps
 * full income for 8 game days (16 with a manager), then ramps down to 25% (S4). Automation sets the
 * floor after that, so it no longer buys 100% forever.
 */
export function accrueBusinesses(g: GameState, credit_: boolean, out: StepOutput): void {
  const tick = g.market.tick;
  for (const b of Object.values(g.businesses)) {
    const p = g.players[b.ownerId];
    if (!p) continue;
    let rate = 1;
    if (!p.online && !p.npc) rate = offlineRate((tick - p.lastSeenTick) / TPD, b.shop.managerStars, b.levels.automation);
    const inc = (b.incomePerDay * rate) / TPD;
    b.earned += inc;
    p.pendingIncome += inc;
  }
  if (!credit_) return;
  for (const p of Object.values(g.players)) {
    if (p.pendingIncome <= 0) continue;
    const amt = p.pendingIncome;
    p.pendingIncome = 0;
    credit(g, p.id, amt, 'business income');
    p.stats.bizIncome += amt;
  }
  void out;
}

/** Day boundary: random incidents (good and bad) on businesses. */
export function businessEvents(g: GameState, out: StepOutput): void {
  const { rng, save } = drawFrom(g, 'biz');
  const tick = g.market.tick;
  const total = BIZ_EVENTS.reduce((s, e) => s + e.weight, 0);
  const ids = Object.keys(g.businesses).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  for (const id of ids) {
    const b = g.businesses[id]!;
    if (b.event && b.event.untilTick <= tick) b.event = null;
    if (b.event || !rng.chance(SHOP.incidents.chance)) continue;
    // a run-down shop (low condition or reviews) draws bad events more often (S2): neglect has a second channel
    const weak = b.shop.condition < SHOP.incidents.weakCondition || b.shop.reviews < SHOP.incidents.weakReviews;
    const wOf = (e: (typeof BIZ_EVENTS)[number]) => e.weight * (weak && !e.good ? SHOP.incidents.weakBadMult : 1);
    const totalB = weak ? BIZ_EVENTS.reduce((s, e) => s + wOf(e), 0) : total;
    let u = rng.uniform() * totalB;
    let ev = BIZ_EVENTS[0]!;
    for (const e of BIZ_EVENTS) { u -= wOf(e); if (u <= 0) { ev = e; break; } }
    if (ev.mechanical && rng.chance(0.15 * b.levels.equipment)) continue; // good equipment prevents it
    b.event = { id: ev.id, mult: ev.mult, untilTick: tick + ev.days * TPD };
    notify(g, out, b.ownerId, {
      kind: 'biz', tone: ev.good ? 'gain' : 'loss',
      text: `${ev.text.replace('{biz}', b.name).replace('{city}', cityName(b.cityId))} Income ${ev.mult >= 1 ? '+' : '−'}${Math.round(Math.abs(ev.mult - 1) * 100)}% for ${ev.days} day${ev.days > 1 ? 's' : ''}.`,
    });
  }
  save();
}

// ================================================================ property

/** A business sells for this share of what was put into it; the rest is a sink. */
export const BUSINESS_SALE_FRAC = 0.7;

export function businessSalePrice(invested: number): number {
  return Math.round(BUSINESS_SALE_FRAC * invested);
}

/** Lowest rank that may take a mortgage, and the loan-to-value cap once it can. */
export const MORTGAGE_RANK = 'R1';
export const MAX_LTV = 0.7;

export function maxLtvFor(rankId: string): number {
  return rankIndex(rankId) >= rankIndex(MORTGAGE_RANK) ? MAX_LTV : 0;
}

/** Fee on buying and selling a property (a share of its value). */
export const PROPERTY_FEE = 0.02;
/** A renovation step costs this share of the property's value. */
export const RENOVATE_FRAC = 0.12;

/** List price from a type's base value, its district tier and the district index (100 = par). */
export function priceAt(value: number, tier: keyof typeof TIER_VALUE_MULT, index: number): number {
  return Math.round(value * TIER_VALUE_MULT[tier] * (index / 100));
}

export function propertyPrice(g: GameState, cityId: string, districtId: string, typeId: string): number {
  const t = PROPERTY_TYPE_BY_ID.get(typeId);
  if (!t) return NaN;
  const tier = districtTier(cityId, districtId);
  return priceAt(t.value, tier, districtIndex(g, cityId, districtId));
}

/** Cash needed up front to buy: the price less the mortgage, plus the fee. */
export function propertyDeposit(price: number, ltv: number): number {
  const mortgage = Math.round(price * ltv);
  return price - mortgage + price * PROPERTY_FEE;
}

/** Cash a sale nets: the value less the fee and the mortgage still owed. */
export function propertySaleNet(value: number, mortgage: number): number {
  return value - value * PROPERTY_FEE - mortgage;
}

/** Cost of one renovation step. */
export function renovateCost(value: number): number {
  return value * RENOVATE_FRAC;
}

export function mortgageRate(g: GameState): number {
  return (g.market.rates?.y10 ?? 0.04) + 0.02;
}

export function buyProperty(g: GameState, pid: string, cityId: string, districtId: string, typeId: string, ltv: number, out: StepOutput | null): CommandResult {
  const p = g.players[pid]!;
  const t = PROPERTY_TYPE_BY_ID.get(typeId);
  const city = CITIES.find((c) => c.id === cityId);
  const dist = city?.districts.find((d) => d.id === districtId);
  if (!t || !city || !dist) return fail('unknown property');
  if (!t.tiers.includes(dist.tier)) return fail(`no ${t.name.toLowerCase()} in ${dist.name}`);
  if (!cityUnlocked(p, cityId)) return fail('that city is locked at your rank');
  if (rankIndex(p.rankId) < rankIndex(t.rank)) return fail('unlocks at a higher rank');
  if (p.heldUntil > g.market.tick) return fail('your assets are held by the court');
  const maxLtv = maxLtvFor(p.rankId);
  const l = clamp(ltv || 0, 0, maxLtv);
  if (ltv > maxLtv + 1e-9) return fail(maxLtv ? 'loan-to-value is capped at 70%' : 'mortgages unlock at Hustler');
  const price = propertyPrice(g, cityId, districtId, typeId);
  const fees = price * PROPERTY_FEE;
  const mortgage = Math.round(price * l);
  const cashNeeded = propertyDeposit(price, l);
  if (cashOf(g, pid) < cashNeeded) return fail('not enough cash for the deposit and fees');
  bump(g, pid, -(price - mortgage)); // converted into property, not destroyed
  debit(g, pid, fees, 'transaction fees');
  g.propSeq++;
  const id = `p${g.propSeq}`;
  g.properties[id] = {
    id, ownerId: pid, cityId, districtId, typeId, baseValue: price, baseIndex: districtIndex(g, cityId, districtId),
    improvement: 1, mortgage, mortgageRate: mortgageRate(g), boughtTick: g.market.tick, paid: price, rentEarned: 0,
  };
  touch(g);
  p.stats.propsBought++;
  if (price >= 5_000_000) pushWire(g, out, { kind: 'purchase', tag: 'Property', tone: 'brass', text: `${p.handle} buys a ${t.name.toLowerCase()} in ${dist.name}, ${city.name}`, playerId: pid });
  return ok({ id, price, mortgage });
}

export function sellProperty(g: GameState, pid: string, propId: string): CommandResult {
  const pr = g.properties[propId];
  if (!pr || pr.ownerId !== pid) return fail('not your property');
  const v = propValue(g, pr);
  const fees = v * PROPERTY_FEE;
  const net = propertySaleNet(v, pr.mortgage);
  // proceeds: the property converts back to cash; the fee is a sink
  bump(g, pid, v - pr.mortgage);
  debit(g, pid, fees, 'transaction fees');
  const p = g.players[pid]!;
  if (p.homePropId === propId) p.homePropId = null;
  delete g.properties[propId];
  touch(g);
  return ok({ net });
}

export function renovateProperty(g: GameState, pid: string, propId: string): CommandResult {
  const pr = g.properties[propId];
  if (!pr || pr.ownerId !== pid) return fail('not your property');
  if (pr.improvement >= 1.5) return fail('fully renovated');
  const cost = renovateCost(propValue(g, pr));
  if (cashOf(g, pid) < cost) return fail('not enough cash');
  debit(g, pid, cost, 'renovations');
  pr.improvement = Math.min(1.52, pr.improvement * 1.15);
  return ok({ cost });
}

export function setHome(g: GameState, pid: string, propId: string | null): CommandResult {
  const p = g.players[pid]!;
  if (propId === null) { p.homePropId = null; refreshPrestige(g, p); return ok(); }
  const pr = g.properties[propId];
  if (!pr || pr.ownerId !== pid) return fail('not your property');
  if (!propType(pr).home) return fail("you cannot live in that");
  p.homePropId = propId;
  refreshPrestige(g, p);
  return ok();
}

export function repayMortgage(g: GameState, pid: string, propId: string, amount: number): CommandResult {
  const pr = g.properties[propId];
  if (!pr || pr.ownerId !== pid) return fail('not your property');
  const a = Math.min(amount, pr.mortgage, cashOf(g, pid));
  if (!(a > 0)) return fail('nothing to repay');
  bump(g, pid, -a); // repays debt: net worth unchanged
  pr.mortgage -= a;
  return ok({ repaid: a });
}

/** Day boundary: rent in, mortgage interest and upkeep out. */
export function propertyDay(g: GameState, out: StepOutput): void {
  const dpy = g.market.config.daysPerYear;
  const { rng, save } = drawFrom(g, 'world');
  for (const id of Object.keys(g.properties).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
    const pr = g.properties[id]!;
    const t = propType(pr);
    const v = propValue(g, pr);
    const owner = g.players[pr.ownerId];
    if (!owner) continue;
    if (owner.homePropId !== pr.id) {
      const occupancy = 0.85 + 0.15 * rng.uniform();
      const rent = (v * t.rentYield * pr.improvement ** 0.5 * occupancy) / dpy;
      credit(g, pr.ownerId, rent, 'rent');
      pr.rentEarned += rent;
      owner.stats.rentCollected += rent;
    }
    debit(g, pr.ownerId, (v * t.upkeep * g.economy.stabilizer.sinkMult) / dpy, 'property upkeep');
    if (pr.mortgage > 0) {
      const interest = (pr.mortgage * pr.mortgageRate) / dpy;
      debit(g, pr.ownerId, interest, 'mortgage interest');
    }
  }
  save();
  void out;
}

// ================================================================ lifestyle

export function buyItem(g: GameState, pid: string, itemId: string): CommandResult {
  const p = g.players[pid]!;
  const item = LIFE_BY_ID.get(itemId);
  if (!item) return fail('unknown item');
  if (rankIndex(p.rankId) < rankIndex(item.rank)) return fail('unlocks at a higher rank');
  if (item.cls === 'unique' && Object.values(g.players).some((x) => x.lifestyle.some((o) => o.itemId === itemId))) return fail('someone already owns it');
  if (cashOf(g, pid) < item.price) return fail('not enough cash');
  debit(g, pid, item.price, item.category === 'philanthropy' ? 'philanthropy' : 'lifestyle');
  if (item.category === 'philanthropy') {
    p.stats.donations += item.price;
    p.reputation += Number(item.perk?.match(/\+(\d+)/)?.[1] ?? 1);
  }
  p.lifestyle.push({ uid: `${pid}-${g.market.tick}-${p.lifestyle.length}`, itemId, paid: item.price, boughtTick: g.market.tick });
  p.stats.lifeBought++;
  refreshPrestige(g, p);
  // luxury spending feeds Velour Maison (bible decision 11): a small nudge to its value
  nudgeAsset(g, 'VLMS', 0.0004 * Math.log10(1 + item.price / 1e5));
  // no Wire line for a lifestyle purchase: the Wire carries business and property purchases only (docs/V1-PRIVACY.md section 1).
  // The item shows on the buyer's own profile, the public holdings list (section 1, item 3).
  return ok();
}

export function sellItem(g: GameState, pid: string, uid: string): CommandResult {
  const p = g.players[pid]!;
  const k = p.lifestyle.findIndex((o) => o.uid === uid);
  if (k < 0) return fail('not yours');
  const o = p.lifestyle[k]!;
  const item = LIFE_BY_ID.get(o.itemId)!;
  const v = resaleValue(item, o.paid, (g.market.tick - o.boughtTick) / TPD, g.collectibles);
  if (item.cls === 'consumed') return fail('experiences cannot be resold');
  credit(g, pid, v, 'lifestyle resale');
  p.lifestyle.splice(k, 1);
  refreshPrestige(g, p);
  return ok({ price: v });
}

export function refreshPrestige(g: GameState, p: Player): void {
  const items = p.lifestyle
    .map((o) => ({ item: LIFE_BY_ID.get(o.itemId)!, ageDays: (g.market.tick - o.boughtTick) / TPD }))
    .filter((x) => x.item);
  let pp = prestigeOf(items);
  if (p.homePropId && g.properties[p.homePropId]) pp += Math.sqrt(propValue(g, g.properties[p.homePropId]!) / 1000) * 1.5;
  p.prestige = pp;
}

/** Day boundary: upkeep on lifestyle items; consumed experiences expire after 30 days. */
export function lifestyleDay(g: GameState): void {
  const dpy = g.market.config.daysPerYear;
  for (const p of Object.values(g.players)) {
    if (!p.lifestyle.length) { if (p.homePropId) refreshPrestige(g, p); continue; }
    let upkeep = 0;
    for (const o of p.lifestyle) {
      const item = LIFE_BY_ID.get(o.itemId);
      if (item) upkeep += (o.paid * item.upkeep) / dpy;
    }
    debit(g, p.id, upkeep * g.economy.stabilizer.sinkMult, 'lifestyle upkeep');
    p.lifestyle = p.lifestyle.filter((o) => {
      const item = LIFE_BY_ID.get(o.itemId);
      return !(item?.cls === 'consumed' && g.market.tick - o.boughtTick > 30 * TPD);
    });
    refreshPrestige(g, p);
  }
}

export function nudgeAsset(g: GameState, assetId: string, logMove: number): void {
  const i = g.market.config.assets.findIndex((a) => a.id === assetId);
  if (i < 0 || !Number.isFinite(logMove) || logMove === 0) return;
  const a = g.market.assets[i]!;
  const assets = g.market.assets.slice();
  assets[i] = { ...a, lnV: a.lnV + logMove };
  g.market = { ...g.market, assets };
}

// ================================================================ analyst notes

const DESKS = ['Trustwell Research', 'Meridia Equity Desk', 'Obsidian Insights', 'Fjordline Analytics', 'Kaiyo Securities', 'Harbor Street Partners'];

export function noteCost(g: GameState, pid: string): number {
  const nw = g.players[pid]!.netWorth;
  return Math.round(clamp(nw * 0.002, 150, 250_000));
}

/**
 * An analyst note: a noisy estimate of the stock's real fundamental value. Prices revert toward
 * value over weeks, so notes are a real (paid) edge; the noise shrinks with rank and with the
 * player's own analyst AI.
 */
export function buyNote(g: GameState, pid: string, assetId: string, aiMcs = 0): CommandResult {
  const p = g.players[pid]!;
  if (rankIndex(p.rankId) < 1) return fail('analyst notes unlock at Hustler');
  const i = g.market.config.assets.findIndex((a) => a.id === assetId);
  const def = g.market.config.assets[i];
  if (!def || def.listed === false || def.assetClass === 'forex' || def.assetClass === 'bond') return fail('no coverage for that asset');
  const cost = noteCost(g, pid);
  if (cashOf(g, pid) < cost) return fail('not enough cash');
  debit(g, pid, cost, 'research');
  const rng = keyedRng(g, `note:${pid}:${assetId}:${g.market.tick}`);
  const rIdx = rankIndex(p.rankId);
  const band = Math.max(0.015, (0.1 - 0.012 * rIdx) * (1 / (1 + aiMcs / 150)));
  const v = Math.exp(g.market.assets[i]!.lnV);
  const fair = v * Math.exp(band * rng.normal());
  const price = priceOf(g, assetId);
  const up = fair / price - 1;
  const rating = up > 0.15 ? 'Strong buy' : up > 0.05 ? 'Buy' : up < -0.15 ? 'Strong sell' : up < -0.05 ? 'Sell' : 'Hold';
  p.notes[assetId] = { assetId, tick: g.market.tick, fairValue: fair, band, rating, desk: DESKS[Math.floor(rng.uniform() * DESKS.length)]! };
  p.stats.notesBought++;
  return ok(p.notes[assetId]);
}

// ================================================================ net worth bookkeeping

export function refreshNetWorth(g: GameState, p: Player): number {
  const b = netWorthBreakdown(g, p.id);
  p.netWorth = b.total;
  // markets at the crowd-exit price: your own or an alt's buying can't lift the peak that rank keys off
  const acct = g.market.accounts[p.id];
  const mark = acct && (Object.keys(acct.positions).length || acct.options) ? b.total - (b.cash + b.markets) + liquidationEquity(g.market, p.id) : b.total;
  p.markNetWorth = mark;
  if (mark > p.netWorthPeak) p.netWorthPeak = mark;
  return b.total;
}

export { today, districtAssetId };
export const BUSINESS_COUNT = BIZ_BY_ID.size;
export function playerBizSectors(g: GameState, pid: string): number {
  return new Set(playerBusinesses(g, pid).map((b) => bizDef(b).sector)).size;
}
