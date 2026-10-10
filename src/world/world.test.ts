import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD, cashOf, credit, netWorthBreakdown } from './core';
import { refreshNetWorth } from './assets';
import { applyRank, checkAchievements } from './players';
import { marketFrame, mirrorWorld, playerView } from './view';
import { BUSINESSES } from '@/content/businesses';
import { estimateFill, universeConfig } from '@/engine';
import type { Command, GameState } from './types';

function game(seed = 'w', npcs = false): GameState {
  return createGame(seed, { warmupDays: 1, npcs });
}

function run(g: GameState, n: number) {
  for (let k = 0; k < n; k++) stepGame(g);
}

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** Make a player rich enough for a rank (test helper; real players earn it). */
function boost(g: GameState, pid: string, amount: number) {
  credit(g, pid, amount, 'test');
  const p = g.players[pid]!;
  refreshNetWorth(g, p);
  applyRank(g, p, null);
}

function hash(g: GameState): string {
  const s = JSON.stringify({ m: g.market.assets.map((a) => a.lnP), acc: g.market.accounts, b: g.businesses, p: g.players, w: g.wire.length });
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return String(h);
}

describe('world creation and joining', () => {
  it('is deterministic for a seed and seeds the NPC rivals', () => {
    const a = createGame('det', { warmupDays: 1 });
    const b = createGame('det', { warmupDays: 1 });
    expect(a.market.assets.map((x) => x.lnP)).toEqual(b.market.assets.map((x) => x.lnP));
    expect(Object.values(a.players).filter((p) => p.npc).length).toBe(24);
    expect(a.wire.length).toBeGreaterThan(0);
  });

  it('a new player gets $5,000 plus the $250 broker grant, a rival and protection', () => {
    const g = createGame('join', { warmupDays: 1 });
    const r = cmd(g, 'u1', { type: 'join', handle: 'mathis', country: 'FR' });
    expect(r.ok).toBe(true);
    expect(cashOf(g, 'u1')).toBe(5250);
    const p = g.players.u1!;
    expect(p.rankId).toBe('R0');
    expect(p.rivalId).not.toBeNull();
    expect(p.shieldUntil).toBeGreaterThan(g.market.tick);
    expect(cmd(g, 'u2', { type: 'join', handle: 'MATHIS', country: 'FR' }).error).toBe('handle taken');
    expect(cmd(g, 'u3', { type: 'join', handle: 'no spaces!', country: 'FR' }).ok).toBe(false);
  });
});

describe('trading through commands', () => {
  it('caps the very first buy at 20% of cash, fills next tick, and counts the trade', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'trader', country: 'AV' });
    expect(cmd(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 20 } }).error).toMatch(/20%/);
    expect(cmd(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 5 } }).ok).toBe(true);
    const out = stepGame(g);
    expect(out.fills.some((f) => f.playerId === 'u1')).toBe(true);
    expect(g.players.u1!.stats.trades).toBe(1);
    expect(g.players.u1!.inbox.some((n) => n.kind === 'fill')).toBe(true);
  });

  it('gates asset classes by license: commodities need Pro', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'trader', country: 'AV' });
    g.players.u1!.onboarding.skipped = true;
    expect(cmd(g, 'u1', { type: 'order.place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 0.1 } }).error).toMatch(/Pro license/);
    boost(g, 'u1', 300_000);
    expect(g.players.u1!.rankId).toBe('R2');
    expect(g.market.accounts.u1!.canShort).toBe(true);
    expect(cmd(g, 'u1', { type: 'order.place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 0.1 } }).ok).toBe(true);
  });
});

describe('businesses', () => {
  it('buy, earn every tick, upgrade, and sell at 70%', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'tycoon', country: 'AV' });
    const cart = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
    const r = cmd(g, 'u1', { type: 'biz.buy', defId: cart.id, cityId: 'avalon' });
    expect(r.ok).toBe(true);
    const id = (r.data as { id: string }).id;
    const cash0 = cashOf(g, 'u1');
    run(g, TPD);
    const earned = cashOf(g, 'u1') - cash0;
    expect(earned).toBeGreaterThan(cart.income * 0.3);
    expect(earned).toBeLessThan(cart.income * 3);
    expect(cmd(g, 'u1', { type: 'biz.upgrade', bizId: id, axis: 'staff' }).ok).toBe(true);
    expect(g.businesses[id]!.levels.staff).toBe(1);
    const inv = g.businesses[id]!.invested;
    const before = cashOf(g, 'u1');
    expect(cmd(g, 'u1', { type: 'biz.sell', bizId: id }).ok).toBe(true);
    expect(cashOf(g, 'u1') - before).toBeCloseTo(Math.round(inv * 0.7), 6);
  });

  it('tiers are rank-gated and crowding a city-sector pool lowers market share', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'tycoon', country: 'AV' });
    const t2 = BUSINESSES.find((b) => b.tier === 2)!;
    expect(cmd(g, 'u1', { type: 'biz.buy', defId: t2.id, cityId: 'avalon' }).ok).toBe(false);
    const cart = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food' && b.cost <= 2000)!;
    cmd(g, 'u1', { type: 'biz.buy', defId: cart.id, cityId: 'avalon' });
    run(g, 1);
    const share1 = Object.values(g.businesses)[0]!.share;
    cmd(g, 'u1', { type: 'biz.buy', defId: cart.id, cityId: 'avalon' });
    run(g, 1);
    const share2 = Object.values(g.businesses)[0]!.share;
    expect(share2).toBeLessThan(share1);
  });

  it('caps how many businesses of one tier a player can run', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'spammer', country: 'AV' });
    boost(g, 'u1', 10_000);
    const cart = BUSINESSES.find((b) => b.tier === 1)!;
    for (let k = 0; k < 4; k++) expect(cmd(g, 'u1', { type: 'biz.buy', defId: cart.id, cityId: 'avalon' }).ok).toBe(true);
    expect(cmd(g, 'u1', { type: 'biz.buy', defId: cart.id, cityId: 'avalon' }).error).toMatch(/at most 4/);
  });

  it('buying a business barely moves net worth (it is valued, not spent)', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'tycoon', country: 'AV' });
    const nw0 = netWorthBreakdown(g, 'u1').total;
    const cart = BUSINESSES.find((b) => b.tier === 1)!;
    cmd(g, 'u1', { type: 'biz.buy', defId: cart.id, cityId: 'avalon' });
    const nw1 = netWorthBreakdown(g, 'u1').total;
    expect(Math.abs(nw1 / nw0 - 1)).toBeLessThan(0.1);
  });
});

describe('property and lifestyle', () => {
  it('rents a studio out, then lives in it for Prestige instead', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'landlord', country: 'AV' });
    boost(g, 'u1', 150_000);
    expect(g.players.u1!.rankId).toBe('R1');
    const r = cmd(g, 'u1', { type: 'prop.buy', cityId: 'avalon', districtId: 'docks', typeId: 'studio', ltv: 0.5 });
    expect(r.ok).toBe(true);
    const id = (r.data as { id: string }).id;
    expect(g.properties[id]!.mortgage).toBeGreaterThan(0);
    run(g, TPD + 1);
    expect(g.properties[id]!.rentEarned).toBeGreaterThan(0);
    expect(cmd(g, 'u1', { type: 'prop.home', propId: id }).ok).toBe(true);
    run(g, TPD);
    expect(g.players.u1!.prestige).toBeGreaterThan(0);
    expect(cmd(g, 'u1', { type: 'prop.buy', cityId: 'kaiyo', districtId: 'neon', typeId: 'studio', ltv: 0 }).error).toMatch(/locked/);
  });

  it('lifestyle purchases add Prestige with diminishing weight in a category', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'flex', country: 'AV' });
    boost(g, 'u1', 100_000);
    cmd(g, 'u1', { type: 'life.buy', itemId: 'steel-diver' });
    const one = g.players.u1!.prestige;
    cmd(g, 'u1', { type: 'life.buy', itemId: 'steel-diver' });
    const two = g.players.u1!.prestige;
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThan(one * 2);
    expect(cmd(g, 'u1', { type: 'life.buy', itemId: 'superyacht' }).ok).toBe(false);
  });
});

describe('ranks, contracts and notes', () => {
  it('rank-up grants licenses and margin, and is never lost', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'climber', country: 'AV' });
    boost(g, 'u1', 6_000_000);
    expect(g.players.u1!.rankId).toBe('R3');
    expect(g.market.accounts.u1!.canOptions).toBe(true);
    expect(g.market.accounts.u1!.maxLeverage).toBe(5);
    g.market.accounts.u1!.cash = 10;
    refreshNetWorth(g, g.players.u1!);
    applyRank(g, g.players.u1!, null);
    expect(g.players.u1!.rankId).toBe('R3');
  });

  it('three hourly contracts roll per game day and pay out when done', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'worker', country: 'AV' });
    cmd(g, 'u1', { type: 'presence', online: true });
    expect(g.players.u1!.contracts).toHaveLength(3);
    const c = g.players.u1!.contracts[0]!;
    c.done = true;
    const before = cashOf(g, 'u1');
    expect(cmd(g, 'u1', { type: 'contract.claim', contractId: c.id }).ok).toBe(true);
    expect(cashOf(g, 'u1')).toBeGreaterThan(before);
    expect(cmd(g, 'u1', { type: 'contract.claim', contractId: c.id }).ok).toBe(false);
  });

  it('analyst notes cost money and carry a fair value near the hidden value', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'reader', country: 'AV' });
    expect(cmd(g, 'u1', { type: 'note.buy', assetId: 'HLCN' }).ok).toBe(false); // Hustler first
    boost(g, 'u1', 30_000);
    const r = cmd(g, 'u1', { type: 'note.buy', assetId: 'HLCN' });
    expect(r.ok).toBe(true);
    const n = g.players.u1!.notes.HLCN!;
    const i = g.market.config.assets.findIndex((a) => a.id === 'HLCN');
    expect(Math.abs(Math.log(n.fairValue) - g.market.assets[i]!.lnV)).toBeLessThan(0.5);
  });
});

describe('AI lab', () => {
  // explicit timeout: the training run steps five game days and took 6.3 s in the full suite (the default is 5 s)
  it('research, then a training run produces a model with an MCS', { timeout: 30_000 }, () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'labrat', country: 'AV' });
    expect(cmd(g, 'u1', { type: 'lab.research', nodeId: 'rules' }).error).toMatch(/Owner/);
    boost(g, 'u1', 2_000_000);
    expect(cmd(g, 'u1', { type: 'lab.research', nodeId: 'rules' }).ok).toBe(true);
    run(g, TPD);
    expect(g.lab.u1!.research).toContain('rules');
    expect(cmd(g, 'u1', { type: 'lab.data', source: 'broker', qty: 2000 }).ok).toBe(true);
    const t = cmd(g, 'u1', { type: 'lab.train', kind: 'trading', name: 'Alpha', budget: 2000, careful: true });
    expect(t.ok).toBe(true);
    run(g, Math.ceil(5 * TPD));
    const lab = g.lab.u1!;
    expect(lab.training).toBeNull();
    expect(lab.models.length + (g.players.u1!.inbox.some((n) => /failed/.test(n.text)) ? 1 : 0)).toBeGreaterThanOrEqual(1);
  });
});

describe('security and court', () => {
  // explicit timeout: this test runs a full session replay and took 5.9 s when the 20-seed hunts ran alongside it (the
  // default is 5 s). It passes in 1.3 s unloaded; the assertions are unchanged.
  it('a planted session is invisible to the victim, copies over time, and cutting it yields evidence that wins in court', { timeout: 60_000 }, () => {
    const g = game('sec');
    cmd(g, 'att', { type: 'join', handle: 'attacker', country: 'AV' });
    cmd(g, 'vic', { type: 'join', handle: 'victim', country: 'AV' });
    boost(g, 'att', 8_000_000);
    boost(g, 'vic', 8_000_000);
    g.players.vic!.shieldUntil = 0;
    g.players.vic!.joinedTick = -1e9;
    g.players.att!.shieldUntil = 0;
    // give the attacker a strong security model and the victim a trading model worth copying
    g.lab.att = { ...(g.lab.att ?? { gpus: {}, reserved: null, data: 0, dataSynth: 0, research: [], researching: null, models: [], training: null, researchers: 0, bots: [], lastSignalTick: 0, modelSeq: 0 }) };
    g.lab.att.models.push({ id: 'mA', name: 'Spear', kind: 'security', mcs: 5000, createdTick: 0, residue: 0 });
    g.lab.vic = { gpus: {}, reserved: null, data: 0, dataSynth: 0, research: [], researching: null, models: [{ id: 'mV', name: 'Crown', kind: 'trading', mcs: 300, createdTick: 0, residue: 0 }], training: null, researchers: 0, bots: [], lastSignalTick: 0, modelSeq: 1 };
    let planted = false;
    for (let k = 0; k < 6 && !planted; k++) {
      cmd(g, 'att', { type: 'sec.plant', victimId: 'vic', strength: 'siphon', modelId: 'mA' });
      planted = Object.values(g.cyber.entries).some((e) => e.hostile?.attackerId === 'att');
      if (!planted) g.cyber.cooldowns = {};
      run(g, 1);
    }
    expect(planted).toBe(true);
    // the victim's view never shows which entry is hostile
    const view = playerView(g, 'vic')!;
    expect(view.security.entries.every((e) => !('hostile' in e))).toBe(true);
    run(g, TPD * 3 + 1);
    const hostile = Object.values(g.cyber.entries).find((e) => e.hostile?.attackerId === 'att')!;
    expect(hostile.hostile!.progress).toBeGreaterThan(0);
    expect(hostile.hostile!.progress).toBeLessThanOrEqual(0.85);
    expect(cmd(g, 'vic', { type: 'sec.disconnect', entryId: hostile.id }).ok).toBe(true);
    expect(g.cyber.evidence['att>vic']).toBeGreaterThanOrEqual(35);
    expect(g.lab.att.models.some((m) => m.name.startsWith('Distilled'))).toBe(true);
    // stack enough evidence for a strong case, file, and let the hearing happen
    g.cyber.evidence['att>vic'] = 90;
    const f = cmd(g, 'vic', { type: 'court.file', defendantId: 'att', kind: 'cyber intrusion', counsel: 2 });
    expect(f.ok).toBe(true);
    const caseId = (f.data as { id: string }).id;
    run(g, TPD * 2 + 1);
    const c = g.court.cases[caseId]!;
    expect(['won', 'lost']).toContain(c.status);
    if (c.status === 'won') expect(c.fine).toBeGreaterThan(0);
  });

  it('protections stop attacks on new players', () => {
    const g = game('shield');
    cmd(g, 'att', { type: 'join', handle: 'attacker', country: 'AV' });
    cmd(g, 'vic', { type: 'join', handle: 'newbie', country: 'AV' });
    boost(g, 'att', 8_000_000);
    g.lab.att = { gpus: {}, reserved: null, data: 0, dataSynth: 0, research: [], researching: null, models: [{ id: 'mA', name: 'Spear', kind: 'security', mcs: 100, createdTick: 0, residue: 0 }], training: null, researchers: 0, bots: [], lastSignalTick: 0, modelSeq: 1 };
    expect(cmd(g, 'att', { type: 'sec.plant', victimId: 'vic', strength: 'tap', modelId: 'mA' }).error).toMatch(/protection/);
  });
});

describe('deals', () => {
  it('a loan moves cash, accrues interest, and defaults into a court-ready claim', () => {
    const g = game('loan');
    cmd(g, 'a', { type: 'join', handle: 'lender', country: 'AV' });
    cmd(g, 'b', { type: 'join', handle: 'borrower', country: 'AV' });
    boost(g, 'a', 100_000);
    const o = cmd(g, 'a', { type: 'deal.offer', kind: 'loan', toId: 'b', amount: 10_000, rate: 0.5, termDays: 1, note: 'good luck' });
    expect(o.ok).toBe(true);
    const id = (o.data as { id: string }).id;
    expect(cmd(g, 'b', { type: 'deal.respond', dealId: id, accept: true }).ok).toBe(true);
    expect(cashOf(g, 'b')).toBeGreaterThan(15_000);
    g.market.accounts.b!.cash = 0; // borrower spends it all
    run(g, TPD * 2 + 2);
    expect(g.deals[id]!.status).toBe('defaulted');
    expect(cmd(g, 'a', { type: 'court.file', defendantId: 'b', kind: 'loan default', counsel: 0 }).ok).toBe(true);
  });
});

describe('replay: snapshot + command log rebuilds the exact world', () => {
  it('replays identically', () => {
    const base = createGame('replay', { warmupDays: 1 });
    const snapshot = JSON.stringify(base);
    const log: { tick: number; pid: string; cmd: Command }[] = [];
    const g = base;
    const play = (pid: string, c: Command) => { log.push({ tick: g.market.tick, pid, cmd: c }); applyCommand(g, pid, c); };
    play('u1', { type: 'join', handle: 'replayer', country: 'AV' });
    play('u1', { type: 'order.place', order: { assetId: 'NRON', side: 'buy', type: 'market', qty: 2 } });
    run(g, 50);
    play('u1', { type: 'biz.buy', defId: BUSINESSES[0]!.id, cityId: 'avalon' });
    run(g, 400);
    play('u1', { type: 'chat.send', channel: 'world', text: 'hello world' });
    run(g, 300);
    const end = g.market.tick;

    const r = JSON.parse(snapshot) as GameState;
    let k = 0;
    while (r.market.tick < end) {
      while (k < log.length && log[k]!.tick === r.market.tick) { applyCommand(r, log[k]!.pid, log[k]!.cmd); k++; }
      stepGame(r);
    }
    expect(hash(r)).toBe(hash(g));
  });
});

describe('client mirror', () => {
  it('lets the client preview fills from the public frame without the hidden value', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'client', country: 'AV' });
    const frame = marketFrame(g);
    const m = mirrorWorld(universeConfig(), frame, { id: 'u1', account: g.market.accounts.u1!, orders: [] });
    const a = estimateFill(m, { assetId: 'HLCN', side: 'buy', qty: 3 });
    const b = estimateFill(g.market, { assetId: 'HLCN', side: 'buy', qty: 3 });
    expect(a.total).toBeCloseTo(b.total, 2); // the frame is rounded; previews agree to the cent
    expect(m.assets[0]!.lnV).toBe(m.assets[0]!.lnP);
  });
});

describe('npc rivals', () => {
  it('act through commands over a game day: they trade, buy businesses and chat', () => {
    const g = createGame('npcs', { warmupDays: 1 });
    run(g, TPD);
    const npcTrades = Object.values(g.players).filter((p) => p.npc).reduce((s, p) => s + p.stats.trades + p.stats.bizBought, 0);
    expect(npcTrades).toBeGreaterThan(10);
    expect(g.boards.netWorth.length).toBeGreaterThan(10);
  });
});

describe('the public Wire stays about the world, not every account', () => {
  const publicText = (g: GameState): string[] => g.wire.map((w) => w.text);

  it('a new account posts no account-opening story to the public Wire', () => {
    const g = game('no-opening');
    cmd(g, 'u1', { type: 'join', handle: 'quiet', country: 'AV' });
    expect(publicText(g).some((t) => t.includes('opens an account'))).toBe(false);
    expect(g.wire.some((w) => w.tag === 'New')).toBe(false);
    // The player still gets the welcome in their own inbox.
    expect(g.players.u1!.inbox.some((i) => i.text.startsWith('Welcome to Port Avalon'))).toBe(true);
  });

  it('a common achievement is the player news only, after the first in the world', () => {
    const g = game('common-ach');
    cmd(g, 'u1', { type: 'join', handle: 'first', country: 'AV' });
    cmd(g, 'u2', { type: 'join', handle: 'second', country: 'AV' });
    const achievements = (): string[] => g.wire.filter((w) => w.tag === 'Achievement' && w.text.includes('Opening Bell')).map((w) => w.text);
    g.players.u1!.stats.trades = 1;
    checkAchievements(g, g.players.u1!, null);
    // u1 is the first to open Opening Bell: named once, as the first in Port Avalon.
    expect(achievements()).toEqual(['first unlocks Opening Bell, the first in Port Avalon']);
    expect(g.firstUnlocks?.['first-trade']).toBe('first');
    g.players.u2!.stats.trades = 1;
    checkAchievements(g, g.players.u2!, null);
    // u2 has the same common unlock: it stays in u2's own inbox, not the public Wire.
    expect(achievements()).toHaveLength(1);
    expect(g.players.u2!.inbox.some((i) => i.text.includes('Opening Bell'))).toBe(true);
  });

  it('a rare (legend) achievement is named on the public Wire every time', () => {
    const g = game('rare-ach');
    cmd(g, 'u1', { type: 'join', handle: 'titan', country: 'AV' });
    cmd(g, 'u2', { type: 'join', handle: 'titan2', country: 'AV' });
    g.players.u1!.rankId = 'R5';
    checkAchievements(g, g.players.u1!, null);
    g.players.u2!.rankId = 'R5';
    checkAchievements(g, g.players.u2!, null);
    const rare = g.wire.filter((w) => w.tag === 'Achievement' && w.text.includes('Titan'));
    expect(rare.map((w) => w.text)).toEqual(['titan2 unlocks Titan', 'titan unlocks Titan']);
  });

  it('a human rank-up posts to the public Wire only from R3 up', () => {
    const g = game('rank-noise');
    cmd(g, 'u1', { type: 'join', handle: 'climber', country: 'AV' });
    boost(g, 'u1', 30_000);
    expect(g.players.u1!.rankId).toBe('R1');
    expect(g.wire.some((w) => w.text.includes('reaches'))).toBe(false);
    expect(g.players.u1!.inbox.some((i) => i.text.startsWith('Rank up: you are now Hustler'))).toBe(true);
    boost(g, 'u1', 6_000_000);
    expect(g.players.u1!.rankId).toBe('R3');
    expect(g.wire.some((w) => w.text === 'climber reaches Operator')).toBe(true);
  });

  it('NPC achievements never reach the public Wire', () => {
    const g = game('npc-ach', true);
    const npc = Object.values(g.players).find((p) => p.npc)!;
    npc.stats.trades = 1;
    checkAchievements(g, npc, null);
    expect(g.wire.some((w) => w.tag === 'Achievement')).toBe(false);
  });
});
