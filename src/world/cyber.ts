import { rankIndex } from '@/content/lifestyle';
import { mcsTier } from '@/content/research';
import {
  TPD, cashOf, clamp, debit, drawFrom, keyedRng, notify, ownerIndex, pushWire, touch,
} from './core';
import { bestModel, labFor } from './lab';
import type {
  CommandResult, ConnectionEntry, CyberState, GameState, Model, SessionStrength, StepOutput,
} from './types';

/**
 * Security Ops (bible 03, Mathis's "hidden sessions" ruling). Everything here is abstract game
 * math: a successful operation quietly adds an entry to the victim's Connections panel that looks
 * exactly like a legit one. While it stays connected it slowly copies the victim's best model
 * (never more than 85%), slows their bots a little, and leaves faint clues among harmless
 * decoys. The victim's defense AI scans on a cadence; the victim can tag, disconnect or lock
 * down. Disconnecting a hostile entry yields evidence for court.
 */

export const SECURITY_RANK = 'R3';
/** A deep scan may run once per six game days. */
export const SCAN_COOLDOWN_TICKS = 6 * TPD;

export const STRENGTHS: Record<SessionStrength, { bias: number; drain: number; k: number; clue: number; m: number; evidence: number; label: string }> = {
  whisper: { bias: 0.5, drain: 0.02, k: 0.02, clue: 0.03, m: 0.6, evidence: 20, label: 'Whisper' },
  tap: { bias: 0, drain: 0.05, k: 0.05, clue: 0.07, m: 1.0, evidence: 28, label: 'Tap' },
  siphon: { bias: -0.5, drain: 0.1, k: 0.12, clue: 0.14, m: 1.6, evidence: 35, label: 'Siphon' },
};

/** Decoy rate per game day for every account, and scan cadence (game days) / strength per tier. */
const DECOY_RATE = 0.05;
const SCAN_EVERY = [Infinity, 24, 12, 6, 4, 2];
const SCAN_S = [0, 0.15, 0.2, 0.25, 0.3, 0.35];
const LEGIT_SIZE: [number, number][] = [[2, 4], [4, 8], [8, 15], [15, 30], [30, 60], [60, 120]];
const LEGIT_CHURN = [0.5, 1, 2.5, 5, 10, 20];
const KINDS: ConnectionEntry['kind'][] = ['data feed', 'broker API', 'analytics', 'backup', 'partner', 'monitoring'];
const CODE_A = ['amber', 'basalt', 'cobalt', 'delta', 'ember', 'fjord', 'granite', 'harbor', 'indigo', 'juniper', 'kestrel', 'lumen', 'meridian', 'nimbus', 'onyx', 'pallas', 'quartz', 'raven', 'sable', 'tundra', 'umber', 'vesper', 'willow', 'xenon', 'yarrow', 'zephyr'];
const CODE_B = ['relay', 'node', 'gate', 'link', 'bridge', 'sync', 'mirror', 'vault', 'pipe', 'lens'];

export function emptyCyber(): CyberState {
  return { entries: {}, clues: [], seq: 0, defense: {}, cooldowns: {}, evidence: {}, ops: [] };
}

export function defenseOf(g: GameState, pid: string) {
  return (g.cyber.defense[pid] ??= { budget: 0, tier: 0, lastScanTick: 0, lockdownUntil: 0, shieldUntil: 0 });
}

/** Defense tier comes from the player's best security model (or T1 from budget alone). */
export function defenseTier(g: GameState, pid: string): number {
  const d = defenseOf(g, pid);
  const m = g.lab[pid] ? bestModel(g.lab[pid]!, 'security') : null;
  const t = m ? mcsTier(m.mcs) : 0;
  return Math.max(t, d.budget >= 10_000 ? 1 : 0);
}

/** Effective defense points: (DP_ai + DP_money + 10), DP_ai = 0.8 × security MCS, DP_money = 40·√(budget/10k). */
export function defensePoints(g: GameState, pid: string): number {
  const d = defenseOf(g, pid);
  const m = g.lab[pid] ? bestModel(g.lab[pid]!, 'security') : null;
  const dpAi = m ? 0.8 * m.mcs : 0;
  const dpMoney = 40 * Math.sqrt(d.budget / 10_000);
  const allianceBonus = (() => {
    const a = g.players[pid]?.allianceId ? g.alliances[g.players[pid]!.allianceId!] : null;
    return a ? Math.min(30, a.sharedDefense) : 0;
  })();
  return dpAi + dpMoney + 10 + allianceBonus;
}

export function attackPoints(m: Model): number {
  return m.mcs;
}

/** p_breach = 1% + 89% · σ(log2(AP/DP) + bias) (the 1% floor per Mathis). */
export function breachOdds(ap: number, dp: number, bias: number): number {
  const z = Math.log2(Math.max(1e-6, ap) / Math.max(1e-6, dp)) + bias;
  return 0.01 + 0.89 / (1 + Math.exp(-z));
}

function codename(rng: { uniform(): number }): string {
  return `${CODE_A[Math.floor(rng.uniform() * CODE_A.length)]}-${CODE_B[Math.floor(rng.uniform() * CODE_B.length)]}-${Math.floor(rng.uniform() * 90 + 10)}`;
}

function newEntry(g: GameState, ownerId: string, rng: { uniform(): number }, hostile?: ConnectionEntry['hostile']): ConnectionEntry {
  g.cyber.seq++;
  const id = `e${g.cyber.seq}`;
  const t = g.market.tick;
  const load = hostile ? STRENGTHS[hostile.strength].drain : 0.01 + 0.11 * rng.uniform() ** 1.6;
  const e: ConnectionEntry = {
    id, ownerId, kind: KINDS[Math.floor(rng.uniform() * KINDS.length)]!, codename: codename(rng),
    firstSeenTick: t, lastHandshakeTick: t, load, tag: null, flagged: false, ...(hostile ? { hostile } : {}),
  };
  g.cyber.entries[id] = e;
  touch(g);
  return e;
}

export function entriesOf(g: GameState, pid: string): ConnectionEntry[] {
  return (ownerIndex(g).entries.get(pid) ?? []).slice();
}

/** Keep each Security-unlocked account's legit list at its tier's typical size. */
function ensureLegit(g: GameState, pid: string, rng: { uniform(): number }): void {
  const tier = defenseTier(g, pid);
  const [lo, hi] = LEGIT_SIZE[tier]!;
  const legit = entriesOf(g, pid).filter((e) => !e.hostile);
  const target = Math.round((lo + hi) / 2);
  for (let k = legit.length; k < target; k++) newEntry(g, pid, rng);
  void lo;
}

/** Give a player who just unlocked Security their normal list of legit connections. */
export function seedConnections(g: GameState, pid: string): void {
  if (ownerIndex(g).entries.has(pid)) return;
  const { rng, save } = drawFrom(g, 'cyber');
  ensureLegit(g, pid, rng);
  save();
}

export function setBudget(g: GameState, pid: string, budget: number): CommandResult {
  if (!(budget >= 0 && budget <= 1e9)) return { ok: false, error: 'bad budget' };
  defenseOf(g, pid).budget = budget;
  return { ok: true };
}

/** Ticks until a deep scan may run again (0 when it may run now or never ran). The Security app reads this. */
export function scanCooldownLeft(lastScanTick: number, nowTick: number): number {
  if (!(lastScanTick > 0)) return 0;
  return Math.max(0, SCAN_COOLDOWN_TICKS - (nowTick - lastScanTick));
}

/** Cash a deep scan costs. */
export function deepScanCost(netWorth: number): number {
  return 5000 + 0.0001 * netWorth;
}

/** Cash a cut costs: free for a flagged connection, otherwise a small fee capped at $250k. */
export function disconnectCost(flagged: boolean, netWorth: number): number {
  return flagged ? 0 : Math.min(250_000, 1000 + 0.0002 * netWorth);
}

export function manualScan(g: GameState, pid: string, out: StepOutput | null): CommandResult {
  const p = g.players[pid]!;
  if (rankIndex(p.rankId) < rankIndex(SECURITY_RANK)) return { ok: false, error: 'Security Ops unlock at Operator' };
  const d = defenseOf(g, pid);
  if (scanCooldownLeft(d.lastScanTick, g.market.tick) > 0) return { ok: false, error: 'deep scan cooling down' };
  const cost = deepScanCost(p.netWorth);
  if (cashOf(g, pid) < cost) return { ok: false, error: 'not enough cash' };
  debit(g, pid, cost, 'security');
  d.lastScanTick = g.market.tick;
  p.stats.scansRun++;
  const found = scan(g, pid, 0.5, out);
  return { ok: true, data: { found } };
}

function scan(g: GameState, pid: string, s: number, out: StepOutput | null): number {
  const rng = keyedRng(g, `scan:${pid}:${g.market.tick}`);
  const dp = defensePoints(g, pid);
  let found = 0;
  for (const e of entriesOf(g, pid)) {
    if (!e.hostile || e.flagged) continue;
    const atk = g.lab[e.hostile.attackerId]?.models.find((m) => m.id === e.hostile!.modelId);
    const ap = atk ? attackPoints(atk) : 10;
    const m = STRENGTHS[e.hostile.strength].m;
    const odds = clamp(s * m * Math.sqrt(clamp(dp / ap, 0.25, 4)), 0.02, 0.9);
    if (rng.chance(odds)) {
      e.flagged = true;
      found++;
      notify(g, out, pid, { kind: 'security', tone: 'warn', text: `Your defense AI flagged connection ${e.codename} as hostile.` });
    }
  }
  return found;
}

export function tagEntry(g: GameState, pid: string, entryId: string, tag: ConnectionEntry['tag']): CommandResult {
  const e = g.cyber.entries[entryId];
  if (!e || e.ownerId !== pid) return { ok: false, error: 'unknown connection' };
  e.tag = tag;
  return { ok: true };
}

export function disconnect(g: GameState, pid: string, entryId: string, out: StepOutput | null): CommandResult {
  const e = g.cyber.entries[entryId];
  if (!e || e.ownerId !== pid) return { ok: false, error: 'unknown connection' };
  const p = g.players[pid]!;
  const cost = disconnectCost(e.flagged, p.netWorth);
  if (cashOf(g, pid) < cost) return { ok: false, error: 'not enough cash' };
  debit(g, pid, cost, 'security');
  delete g.cyber.entries[entryId];
  touch(g);
  if (e.hostile) endSession(g, e, true, out);
  else notify(g, out, pid, { kind: 'security', tone: 'info', text: `Disconnected ${e.codename}. It was a legit ${e.kind}; its partner contract ends.` });
  return { ok: true, data: { hostile: !!e.hostile } };
}

export function lockdown(g: GameState, pid: string, out: StepOutput | null): CommandResult {
  const d = defenseOf(g, pid);
  if (g.market.tick < d.lockdownUntil + 22 * TPD && d.lockdownUntil > 0) return { ok: false, error: 'lockdown cooling down' };
  let reconnects = 0;
  for (const e of entriesOf(g, pid)) {
    delete g.cyber.entries[e.id];
    touch(g);
    if (e.hostile) endSession(g, e, true, out);
    else reconnects++;
  }
  debit(g, pid, reconnects * 500, 'security');
  d.lockdownUntil = g.market.tick + 2 * TPD;
  d.shieldUntil = g.market.tick + 14 * TPD;
  for (const b of labFor(g, pid).bots) b.lastRunTick = d.lockdownUntil;
  notify(g, out, pid, { kind: 'security', tone: 'warn', text: `Lockdown: every connection cut, your AIs pause for 2 days, then you are shielded from new sessions for 12.` });
  return { ok: true };
}

function endSession(g: GameState, e: ConnectionEntry, byVictim: boolean, out: StepOutput | null): void {
  const h = e.hostile!;
  const st = STRENGTHS[h.strength];
  const key = `${h.attackerId}>${e.ownerId}`;
  g.cyber.cooldowns[key] = g.market.tick + 24 * TPD;
  // the attacker keeps what was copied: a distilled student, capped below the teacher, with residue
  const teacher = g.lab[e.ownerId] ? bestModel(g.lab[e.ownerId]!, 'trading') ?? bestModel(g.lab[e.ownerId]!, 'analyst') : null;
  if (teacher && h.progress > 0.05) {
    const lab = labFor(g, h.attackerId);
    lab.modelSeq++;
    const residue = Math.max(0.03, 0.7 * (0.4 + 0.6 * h.progress / 0.85));
    lab.models.push({ id: `m${lab.modelSeq}`, name: `Distilled ${teacher.name}`, kind: teacher.kind, mcs: teacher.mcs * h.progress * 0.85, createdTick: g.market.tick, residue });
    notify(g, out, h.attackerId, { kind: 'security', tone: 'gain', text: `Session ${e.codename} closed. You distilled ${(h.progress * 100).toFixed(0)}% of a ${teacher.kind} model.` });
  } else {
    notify(g, out, h.attackerId, { kind: 'security', tone: 'loss', text: `Session ${e.codename} was closed before it copied anything useful.` });
  }
  if (byVictim) {
    const pts = st.evidence + (e.flagged ? 10 : 0);
    g.cyber.evidence[key] = (g.cyber.evidence[key] ?? 0) + pts;
    g.players[e.ownerId]!.stats.sessionsCut++;
    notify(g, out, e.ownerId, { kind: 'security', tone: 'gain', text: `Cut hostile session ${e.codename}. Evidence +${pts} against ${g.players[h.attackerId]?.handle ?? 'the attacker'}; you can file in court.` });
  }
}

export function plantSession(g: GameState, pid: string, victimId: string, strength: SessionStrength, modelId: string, out: StepOutput | null): CommandResult {
  const p = g.players[pid]!;
  const v = g.players[victimId];
  const tick = g.market.tick;
  if (!v || victimId === pid) return { ok: false, error: 'pick a target' };
  if (rankIndex(p.rankId) < rankIndex(SECURITY_RANK)) return { ok: false, error: 'Security Ops unlock at Operator' };
  if (!STRENGTHS[strength]) return { ok: false, error: 'pick a strength' };
  const model = labFor(g, pid).models.find((m) => m.id === modelId && m.kind === 'security');
  if (!model) return { ok: false, error: 'pick a security model' };
  // anti-grief (bible 03): new-player shield, rookie zone, lockdown shield, cooldowns, dogpile cap
  if (v.shieldUntil > tick) return { ok: false, error: 'that player is under new-player protection' };
  if (v.netWorth < 1_000_000 && tick - v.joinedTick < 7 * 24 * TPD) return { ok: false, error: 'that player is in the rookie zone' };
  if (defenseOf(g, victimId).shieldUntil > tick) return { ok: false, error: 'that player is shielded after a lockdown' };
  const key = `${pid}>${victimId}`;
  if ((g.cyber.cooldowns[key] ?? 0) > tick) return { ok: false, error: 'cooldown on this target' };
  const onVictim = entriesOf(g, victimId).filter((e) => e.hostile);
  if (onVictim.length >= 3) return { ok: false, error: 'the target already has 3 hostile sessions' };
  if (onVictim.some((e) => e.hostile!.attackerId === pid)) return { ok: false, error: 'one session per target' };
  const myLive = Object.values(g.cyber.entries).filter((e) => e.hostile?.attackerId === pid).length;
  if (myLive >= 1 + mcsTier(model.mcs)) return { ok: false, error: 'too many live sessions for your model tier' };
  // punch-down tax: hitting someone ten times smaller costs much more
  const base = 15_000 * 2 ** mcsTier(model.mcs);
  const cost = v.netWorth * 10 < p.netWorth ? base * 5 : base;
  if (cashOf(g, pid) < cost) return { ok: false, error: 'not enough cash for the operation' };
  debit(g, pid, cost, 'operations');
  if (p.shieldUntil > tick) p.shieldUntil = tick; // protection ends on your first attack
  const st = STRENGTHS[strength];
  const odds = breachOdds(attackPoints(model), defensePoints(g, victimId), st.bias);
  const rng = keyedRng(g, `op:${pid}:${victimId}:${tick}`);
  g.cyber.seq++;
  const opId = `op${g.cyber.seq}`;
  if (rng.chance(odds)) {
    const e = newEntry(g, victimId, rng, { attackerId: pid, strength, progress: 0, modelId });
    g.cyber.ops.unshift({ id: opId, attackerId: pid, victimId, strength, modelId, tick, result: 'planted', entryId: e.id });
    p.notoriety += 1;
    notify(g, out, pid, { kind: 'security', tone: 'gain', text: `${st.label} session planted on ${v.handle}'s systems as ${e.codename}.` });
  } else {
    const detected = rng.chance(0.5);
    g.cyber.ops.unshift({ id: opId, attackerId: pid, victimId, strength, modelId, tick, result: detected ? 'detected' : 'failed' });
    notify(g, out, pid, { kind: 'security', tone: 'loss', text: `The operation against ${v.handle} failed${detected ? ' and was detected' : ''}.` });
    if (detected) {
      const attributed = rng.chance(0.3);
      g.cyber.evidence[`${pid}>${victimId}`] = (g.cyber.evidence[`${pid}>${victimId}`] ?? 0) + 15;
      notify(g, out, victimId, { kind: 'security', tone: 'warn', text: `Your defenses blocked an intrusion attempt${attributed ? ` traced to ${p.handle}` : ''}.` });
    }
  }
  if (g.cyber.ops.length > 200) g.cyber.ops.length = 200;
  return { ok: true };
}

/**
 * Per game day: sessions copy (online hours count fully, offline hours a quarter, one offline
 * stretch adds at most 0.08), clues and decoys appear, auto-scans run by tier, legit entries churn,
 * sessions expire after 7 real days.
 */
export function cyberDay(g: GameState, out: StepOutput): void {
  const tick = g.market.tick;
  const { rng, save } = drawFrom(g, 'cyber');
  const withEntries = ownerIndex(g).entries;
  const securityPlayers = Object.values(g.players).filter((p) => rankIndex(p.rankId) >= rankIndex(SECURITY_RANK) || withEntries.has(p.id));
  for (const p of securityPlayers) {
    ensureLegit(g, p.id, rng);
    const tier = defenseTier(g, p.id);
    // legit churn
    const churn = LEGIT_CHURN[tier]! / 24;
    if (rng.chance(Math.min(1, churn))) {
      const legit = entriesOf(g, p.id).filter((e) => !e.hostile && e.tag !== 'trusted');
      if (legit.length) { delete g.cyber.entries[legit[Math.floor(rng.uniform() * legit.length)]!.id]; touch(g); }
      newEntry(g, p.id, rng);
    }
    for (const e of entriesOf(g, p.id)) {
      e.lastHandshakeTick = tick - Math.floor(rng.uniform() * 200);
      if (!e.hostile) { e.load = clamp(e.load * Math.exp(0.15 * rng.normal()), 0.01, 0.12); continue; }
      const h = e.hostile;
      const st = STRENGTHS[h.strength];
      const online = p.online || !!p.npc;
      const hEff = online ? 1 : 0.25;
      const target = 0.85 * (1 - Math.exp(-st.k * 24 * hEff));
      const add = (0.85 - h.progress) * (target / 0.85);
      h.progress = Math.min(0.85, h.progress + (online ? add : Math.min(add, 0.08)));
      if (rng.chance(st.clue * 6)) addClue(g, p.id, rng, true, e.id);
      if (tick - e.firstSeenTick > 7 * 24 * TPD) {
        delete g.cyber.entries[e.id];
        touch(g);
        endSession(g, e, false, out);
      }
    }
    if (rng.chance(DECOY_RATE * 6)) addClue(g, p.id, rng, false);
    const d = defenseOf(g, p.id);
    if (Number.isFinite(SCAN_EVERY[tier]!) && tick - d.lastScanTick >= SCAN_EVERY[tier]! * TPD) {
      d.lastScanTick = tick;
      scan(g, p.id, SCAN_S[tier]!, out);
    }
    if (d.budget > 0) debit(g, p.id, d.budget, 'security');
  }
  if (g.cyber.clues.length > 600) g.cyber.clues.splice(0, g.cyber.clues.length - 600);
  save();
}

function addClue(g: GameState, pid: string, rng: { uniform(): number }, real: boolean, entryId?: string): void {
  const kinds: ('slowdown' | 'odd usage' | 'off-hours handshake')[] = ['slowdown', 'odd usage', 'off-hours handshake'];
  const kind = kinds[Math.floor(rng.uniform() * 3)]!;
  g.cyber.seq++;
  let target = entryId;
  if (kind === 'off-hours handshake' && !real) {
    const legit = entriesOf(g, pid).filter((e) => !e.hostile);
    target = legit.length ? legit[Math.floor(rng.uniform() * legit.length)]!.id : undefined;
  }
  g.cyber.clues.push({ id: `cl${g.cyber.seq}`, ownerId: pid, tick: g.market.tick, kind, ...(kind === 'off-hours handshake' && target ? { entryId: target } : {}), real });
}

/** Bots of a player who carries hostile sessions skip runs in proportion to the drain. */
export function drainOf(g: GameState, pid: string): number {
  return Math.min(0.2, entriesOf(g, pid).filter((e) => e.hostile).reduce((s, e) => s + STRENGTHS[e.hostile!.strength].drain, 0));
}

export function announceBreach(g: GameState, out: StepOutput, text: string): void {
  pushWire(g, out, { kind: 'security', tag: 'Security', tone: 'warn', text });
}
