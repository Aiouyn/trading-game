import { NPCS, type NpcPersona } from '@/content/progression';
import { BUSINESSES, TIERS } from '@/content/businesses';
import { LIFE_ITEMS, PROPERTY_TYPES, rankIndex } from '@/content/lifestyle';
import { CITIES } from '@/engine';
import { cashOf, drawFrom, playerBusinesses } from './core';
import { cityUnlocked, maxLtvFor, propertyPrice } from './assets';
import { wellRunCommands } from './shops';
import { createPlayer } from './players';
import { CHATTER } from './text/npcChat';
import type { Command, CommandResult, GameState, Player } from './types';

type Apply = (g: GameState, pid: string, cmd: Command) => CommandResult;

/** Seed the NPC rivals into a new world. */
export function seedNpcs(g: GameState): void {
  for (const n of NPCS) {
    if (g.players[n.id]) continue;
    const p = createPlayer(g, n.id, n.handle, n.country, { npc: n.id, bio: n.bio, cash: n.start });
    p.netWorthPeak = n.start;
  }
}

function persona(p: Player): NpcPersona | undefined {
  return NPCS.find((n) => n.id === p.npc);
}

function tradable(g: GameState, filter: (cls: string, sector: string) => boolean): string[] {
  return g.market.config.assets.filter((a) => a.listed !== false && filter(a.assetClass, a.sector)).map((a) => a.id);
}

/**
 * NPCs act through the same commands as humans. Each acts every ~2 game hours with its own
 * staggered offset, so the world stays busy without flooding the tape.
 */
export function npcTick(g: GameState, apply: Apply): void {
  const tick = g.market.tick;
  const npcs = Object.values(g.players).filter((p) => p.npc).sort((a, b) => a.id.localeCompare(b.id));
  if (!npcs.length) return;
  const { rng, save } = drawFrom(g, 'npc');
  npcs.forEach((p, idx) => {
    if ((tick + idx * 37) % 240 !== 0) return;
    const n = persona(p);
    if (!n) return;
    const cash = cashOf(g, p.id);
    const acct = g.market.accounts[p.id]!;
    const pick = <T>(arr: T[]): T | undefined => arr[Math.floor(rng.uniform() * arr.length)];
    const buy = (assetId: string, frac: number) => {
      const i = g.market.config.assets.findIndex((a) => a.id === assetId);
      const px = Math.exp(g.market.assets[i]!.lnP);
      const whole = g.market.config.assets[i]!.assetClass === 'stock';
      const q = whole ? Math.floor((cash * frac) / px) : Math.floor(((cash * frac) / px) * 1e4) / 1e4;
      if (q > 0) apply(g, p.id, { type: 'order.place', order: { assetId, side: 'buy', type: 'market', qty: q } });
    };
    const sellAll = (assetId: string) => {
      const q = acct.positions[assetId]?.qty ?? 0;
      if (q > 0) apply(g, p.id, { type: 'order.place', order: { assetId, side: 'sell', type: 'market', qty: q } });
    };
    const held = Object.keys(acct.positions);
    const stocks = tradable(g, (c) => c === 'stock');
    const moveOf = (id: string) => {
      const i = g.market.config.assets.findIndex((a) => a.id === id);
      const a = g.market.assets[i]!;
      return a.lnP - a.lnOpen;
    };

    switch (n.style) {
      case 'momentum': {
        const best = stocks.map((id) => ({ id, m: moveOf(id) + 0.01 * rng.normal() })).sort((a, b) => b.m - a.m);
        for (const h of held) if (moveOf(h) < -0.01) sellAll(h);
        if (best[0] && best[0].m > 0.01) buy(best[0].id, 0.25);
        break;
      }
      case 'contrarian': {
        const worst = stocks.map((id) => ({ id, m: moveOf(id) + 0.01 * rng.normal() })).sort((a, b) => a.m - b.m);
        for (const h of held) if (moveOf(h) > 0.015) sellAll(h);
        if (worst[0] && worst[0].m < -0.015) buy(worst[0].id, 0.2);
        break;
      }
      case 'value': {
        const cands = stocks.map((id) => {
          const i = g.market.config.assets.findIndex((a) => a.id === id);
          const a = g.market.assets[i]!;
          return { id, gap: a.lnV - a.lnP + 0.06 * rng.normal() };
        }).sort((a, b) => b.gap - a.gap);
        for (const h of held) {
          const i = g.market.config.assets.findIndex((a) => a.id === h);
          if (g.market.assets[i] && g.market.assets[i]!.lnV - g.market.assets[i]!.lnP < -0.02) sellAll(h);
        }
        if (cands[0] && cands[0].gap > 0.05) buy(cands[0].id, 0.15);
        break;
      }
      case 'dividend': {
        const divs = g.market.config.assets.filter((a) => (a.dividendYield ?? 0) >= 0.04 && a.listed !== false).map((a) => a.id);
        const t = pick(divs);
        if (t && cash > 1000) buy(t, 0.2);
        break;
      }
      case 'crypto': {
        const cs = tradable(g, (c) => c === 'crypto');
        if (rng.chance(0.4)) for (const h of held) sellAll(h);
        const t = pick(cs);
        if (t && cash > 100) buy(t, 0.5);
        break;
      }
      case 'gambler': {
        const vol = stocks.filter((id) => (g.market.config.assets.find((a) => a.id === id)?.vol ?? 0) > 0.5);
        if (held.length && rng.chance(0.5)) sellAll(held[0]!);
        else { const t = pick(vol); if (t) buy(t, 0.9); }
        break;
      }
      case 'macro': {
        const regime = g.market.regime;
        const want = regime === 'contraction' ? ['GOLD', 'AV10', 'AV30'] : regime === 'overheating' ? ['OIL', 'GOLD', 'COPR'] : ['HYLD', 'COPR', 'OIL'];
        for (const h of held) if (!want.includes(h)) sellAll(h);
        if (rankIndex(p.rankId) >= 2) { const t = pick(want); if (t) buy(t, 0.3); }
        else buy(pick(['GLDF', 'PTRA', 'AVBK'])!, 0.3);
        break;
      }
      case 'tycoon':
      case 'whale': {
        buyBestBusiness(g, p, apply);
        upgradeSomething(g, p, apply, rng.uniform());
        if (n.style === 'whale' && rng.chance(0.3)) { const t = pick(stocks); if (t) buy(t, 0.05); }
        break;
      }
      case 'landlord': {
        const city = CITIES.filter((c) => cityUnlocked(p, c.id));
        const c = pick(city);
        const d = c && pick(c.districts);
        if (c && d) {
          const types = PROPERTY_TYPES.filter((t) => t.tiers.includes(d.tier) && rankIndex(p.rankId) >= rankIndex(t.rank) && !t.home)
            .filter((t) => propertyPrice(g, c.id, d.id, t.id) * 0.32 < cash);
          const t = types.sort((a, b) => b.value - a.value)[0];
          if (t) apply(g, p.id, { type: 'prop.buy', cityId: c.id, districtId: d.id, typeId: t.id, ltv: maxLtvFor(p.rankId) });
        }
        if (playerBusinesses(g, p.id).length < 2) buyBestBusiness(g, p, apply);
        break;
      }
    }
    // everyone also builds a little business income, and rich NPCs flex
    if (n.style !== 'tycoon' && n.style !== 'whale' && rng.chance(0.15)) buyBestBusiness(g, p, apply);
    if (rng.chance(0.08)) {
      const items = LIFE_ITEMS.filter((i) => rankIndex(p.rankId) >= rankIndex(i.rank) && i.price < cashOf(g, p.id) * 0.05 && i.cls !== 'unique');
      const it = pick(items);
      if (it) apply(g, p.id, { type: 'life.buy', itemId: it.id });
    }
    if (rng.chance(0.06)) {
      const line = pick(CHATTER[n.style])!;
      apply(g, p.id, { type: 'chat.send', channel: 'world', text: line.replace('{a}', pick(stocks) ?? 'GX') });
    }
  });
  save();
}

function buyBestBusiness(g: GameState, p: Player, apply: Apply): void {
  const cash = cashOf(g, p.id);
  const r = rankIndex(p.rankId);
  const opts = BUSINESSES.filter((b) => rankIndex(TIERS[b.tier - 1]!.rank) <= r && b.cost <= cash * 0.6)
    .sort((a, b) => b.cost - a.cost || a.id.localeCompare(b.id));
  const def = opts[0];
  if (!def) return;
  const cities = CITIES.filter((c) => cityUnlocked(p, c.id));
  const city = cities[(g.market.tick / 240 + p.id.length) % cities.length | 0] ?? cities[0]!;
  const bought = apply(g, p.id, { type: 'biz.buy', defId: def.id, cityId: city.id });
  // NPC shops run the well-run settings from the start (they are the competition the player shops meet)
  if (bought.ok) for (const c of wellRunCommands((bought.data as { id: string }).id)) apply(g, p.id, c);
}

function upgradeSomething(g: GameState, p: Player, apply: Apply, u: number): void {
  const mine = playerBusinesses(g, p.id);
  if (!mine.length) return;
  const b = mine[Math.floor(u * mine.length)]!;
  const axes = ['equipment', 'location', 'automation', 'research'] as const;
  apply(g, p.id, { type: 'biz.upgrade', bizId: b.id, axis: axes[Math.floor(u * 97) % axes.length]! });
}
