import { rankIndex } from '@/content/lifestyle';
import { mcsTier } from '@/content/research';
import {
  TPD, cashOf, clamp, debit, drawFrom, keyedRng, notify, ownerIndex, pushWire, touch,
} from './core';
import { bestModel, labFor } from './lab';
import {
  BAIT_RANGE, HONEYPOT_COST, HONEYPOT_MIN_TIER, HONEYPOT_PLANT_EVIDENCE, HONEYPOT_POISON, baitMcs, canaryFlagChance, copyStep,
  honeypotEvidence, inheritedPoison,
} from './honeypots';
import type {
  CommandResult, ConnectionEntry, CyberOp, CyberState, DecoySession, GameState, Model, SessionStrength, StepOutput,
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

/**
 * `canary` runs the optional recon add-on (+20% of the op cost, charged by the caller's price): it may flag a honeypot in the
 * victim's systems and steer the op away from it (M29). Without it, a honeypot takes the session.
 */
export function plantSession(g: GameState, pid: string, victimId: string, strength: SessionStrength, modelId: string, out: StepOutput | null, canary = false): CommandResult {
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
  const myLive = Object.values(g.cyber.entries).filter((e) => e.hostile?.attackerId === pid).length + liveDecoys(g, pid);
  if (myLive >= 1 + mcsTier(model.mcs)) return { ok: false, error: 'too many live sessions for your model tier' };
  // punch-down tax: hitting someone ten times smaller costs much more; the canary add-on is +20% (M29)
  const base = 15_000 * 2 ** mcsTier(model.mcs);
  const cost0 = v.netWorth * 10 < p.netWorth ? base * 5 : base;
  const cost = canary ? Math.round(cost0 * 1.2) : cost0;
  if (cashOf(g, pid) < cost) return { ok: false, error: 'not enough cash for the operation' };
  debit(g, pid, cost, 'operations');
  if (p.shieldUntil > tick) p.shieldUntil = tick; // protection ends on your first attack
  const st = STRENGTHS[strength];
  const odds = breachOdds(attackPoints(model), defensePoints(g, victimId), st.bias);
  const rng = keyedRng(g, `op:${pid}:${victimId}:${tick}`);
  g.cyber.seq++;
  const opId = `op${g.cyber.seq}`;
  const meet = meetHoneypot(g, victimId, attackPoints(model), canary, rng);
  if (meet === 'decoy') {
    const result = decoyAttempt(g, { attackerId: pid, victimId, strength, model, opId, out, rng, attackerHandle: p.handle, victimHandle: v.handle });
    if (g.cyber.ops.length > 200) g.cyber.ops.length = 200;
    return { ok: true, data: { result } };
  }
  if (meet === 'avoided') notify(g, out, pid, { kind: 'security', tone: 'info', text: `Your canary flagged a decoy in ${v.handle}'s systems and stayed out of it.`, msg: { key: 'security.msg.canary', vars: { target: v.handle } } });
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
export function cyberDay(g: GameState, out: StepOutput | null): void {
  const tick = g.market.tick;
  const { rng, save } = drawFrom(g, 'cyber');
  const withEntries = ownerIndex(g).entries;
  const securityPlayers = Object.values(g.players).filter((p) => rankIndex(p.rankId) >= rankIndex(SECURITY_RANK) || withEntries.has(p.id));
  for (const p of securityPlayers) {
    ensureLegit(g, p.id, rng);
    // the last tick a hostile session was open on this player (the insurance switch waits 24 h after one)
    if (entriesOf(g, p.id).some((e) => !!e.hostile)) (g.cyber.breachedAt ??= {})[p.id] = tick;
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
      h.progress = copyStep(h.progress, st.k, online);
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
  decoyDay(g, out);
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

/**
 * A rival fund's crew plants a session on a player (M31, rivalCrews.ts). The same breach odds and session as a player's op:
 * a clean plant is a quiet hostile entry; a failed one may be detected (evidence against the crew, a warning to the victim).
 * The crew's gates (protection, rookie zone, offline, cooldown, the session caps) are the caller's. A crew pays no cash in
 * this build, so no faucet or sink is booked for it (see docs/V1-PHASE6.md, 6A).
 */
export function plantCrewSession(g: GameState, crewId: string, victimId: string, model: Model, strength: SessionStrength, out: StepOutput | null): boolean {
  const tick = g.market.tick;
  const st = STRENGTHS[strength];
  const odds = breachOdds(attackPoints(model), defensePoints(g, victimId), st.bias);
  const rng = keyedRng(g, `crew:op:${crewId}:${victimId}:${tick}`);
  g.cyber.seq++;
  const opId = `op${g.cyber.seq}`;
  g.cyber.cooldowns[`${crewId}>${victimId}`] = tick + 3 * TPD;
  // a crew always runs the canary (M29): a flagged honeypot is avoided; an unflagged one takes the session
  const meet = meetHoneypot(g, victimId, attackPoints(model), true, rng);
  if (meet === 'decoy') {
    decoyAttempt(g, { attackerId: crewId, victimId, strength, model, opId, out, rng, attackerHandle: fundName(g, crewId), victimHandle: g.players[victimId]?.handle ?? '' });
    if (g.cyber.ops.length > 200) g.cyber.ops.length = 200;
    return false;
  }
  if (rng.chance(odds)) {
    const e = newEntry(g, victimId, rng, { attackerId: crewId, strength, progress: 0, modelId: model.id });
    g.cyber.ops.unshift({ id: opId, attackerId: crewId, victimId, strength, modelId: model.id, tick, result: 'planted', entryId: e.id });
    if (g.cyber.ops.length > 200) g.cyber.ops.length = 200;
    return true;
  }
  const detected = rng.chance(0.5);
  g.cyber.ops.unshift({ id: opId, attackerId: crewId, victimId, strength, modelId: model.id, tick, result: detected ? 'detected' : 'failed' });
  if (detected) {
    g.cyber.evidence[`${crewId}>${victimId}`] = (g.cyber.evidence[`${crewId}>${victimId}`] ?? 0) + 15;
    notify(g, out, victimId, { kind: 'security', tone: 'warn', text: 'Your defenses blocked an intrusion attempt.' });
  }
  if (g.cyber.ops.length > 200) g.cyber.ops.length = 200;
  return false;
}

// ---- honeypots and decoy sessions (M29, M28): the defender's bait, the canary, and the sessions inside a honeypot or a fund ----

/** A rival fund's display name (a crew's attribution), or its id when it has none. */
export function fundName(g: GameState, id: string): string {
  return g.market.config.rivals?.find((d) => d.id === id)?.name ?? id;
}

/** The decoy sessions an attacker carries now: they count against the attacker's live-session cap (ROADMAP §2.3). */
export function liveDecoys(g: GameState, attackerId: string): number {
  return (g.cyber.decoys ?? []).filter((s) => s.attackerId === attackerId).length;
}

/**
 * Places the player's honeypot (M29, ROADMAP §2.3): a bait the size of the best security model times `ratio` (0.5 to 1.25). One
 * at a time: a new one replaces the old. The price is a sink in the security book. It is a normal entry in the defender's model
 * list, so it takes no Connections slot and drains nothing. (The 5% DU burn is not modeled: see docs/V1-PHASE6.md, 6A.)
 */
export function deployHoneypot(g: GameState, pid: string, kind: keyof typeof HONEYPOT_COST, ratio: number, out: StepOutput | null): CommandResult {
  const p = g.players[pid];
  if (!p) return { ok: false, error: 'join the world first' };
  if (rankIndex(p.rankId) < rankIndex(SECURITY_RANK)) return { ok: false, error: 'Security Ops unlock at Operator' };
  if (!(kind in HONEYPOT_COST)) return { ok: false, error: 'pick a honeypot' };
  if (!(ratio >= BAIT_RANGE[0] && ratio <= BAIT_RANGE[1])) return { ok: false, error: 'the bait is between 0.5 and 1.25 times your best model' };
  const best = g.lab[pid] ? bestModel(g.lab[pid]!, 'security') : null;
  if (!best) return { ok: false, error: 'train a security model first: the honeypot needs a bait' };
  if (defenseTier(g, pid) < HONEYPOT_MIN_TIER[kind]) return { ok: false, error: 'that honeypot needs a higher defense tier' };
  const cost = HONEYPOT_COST[kind];
  if (cashOf(g, pid) < cost) return { ok: false, error: 'not enough cash for that honeypot' };
  debit(g, pid, cost, 'security');
  defenseOf(g, pid).honeypot = { kind, poison: HONEYPOT_POISON[kind], bait: baitMcs(best.mcs, ratio), placedTick: g.market.tick };
  notify(g, out, pid, { kind: 'security', tone: 'info', text: `${kind} honeypot placed. It holds a bait the size of your best security model.`, msg: { key: 'security.msg.honeypotPlaced', vars: { kind: `@security.honeypot.kind.${kind}` } } });
  return { ok: true };
}

/**
 * What an attempt meets in a victim's systems (M29). 'none': no honeypot. 'avoided': the canary (when run) flagged it, so the
 * attempt goes to the real systems. 'decoy': the session takes the honeypot.
 */
function meetHoneypot(g: GameState, victimId: string, ap: number, canary: boolean, rng: { chance(p: number): boolean }): 'none' | 'avoided' | 'decoy' {
  if (!g.cyber.defense[victimId]?.honeypot) return 'none';
  if (canary && rng.chance(canaryFlagChance(ap, defensePoints(g, victimId)))) return 'avoided';
  return 'decoy';
}

/** Opens a decoy session. A honeypot gives the defender its plant evidence at once (+15). */
export function openDecoy(g: GameState, s: { attackerId: string; targetId: string; on: DecoySession['on']; strength: SessionStrength; bait: number; poisonTier: number }): DecoySession {
  g.cyber.seq++;
  const session: DecoySession = { id: `dc${g.cyber.seq}`, ...s, progress: 0, effHours: 0, startTick: g.market.tick, evidence: s.on === 'honeypot' ? HONEYPOT_PLANT_EVIDENCE : 0 };
  g.cyber.decoys = [...(g.cyber.decoys ?? []), session];
  if (s.on === 'honeypot') {
    const key = `${s.attackerId}>${s.targetId}`;
    g.cyber.evidence[key] = (g.cyber.evidence[key] ?? 0) + HONEYPOT_PLANT_EVIDENCE;
  }
  touch(g);
  return session;
}

/**
 * The attempt meets a honeypot and goes in: the same breach roll as any session (the 1% floor included). A clean breach opens
 * a decoy session, which the attacker believes is a real one; a failed one is detected or not, as for any failed op. The
 * defender gets the attribution roll (p = 0.5) on the plant, and the evidence clock runs on the decoy session (decoyDay).
 */
function decoyAttempt(g: GameState, a: {
  attackerId: string; victimId: string; strength: SessionStrength; model: Model; opId: string; out: StepOutput | null;
  rng: { chance(p: number): boolean }; attackerHandle: string; victimHandle: string;
}): CyberOp['result'] {
  const tick = g.market.tick;
  const hp = g.cyber.defense[a.victimId]!.honeypot!;
  const st = STRENGTHS[a.strength];
  const odds = breachOdds(attackPoints(a.model), defensePoints(g, a.victimId), st.bias);
  const key = `${a.attackerId}>${a.victimId}`;
  if (a.rng.chance(odds)) {
    openDecoy(g, { attackerId: a.attackerId, targetId: a.victimId, on: 'honeypot', strength: a.strength, bait: hp.bait, poisonTier: hp.poison });
    g.cyber.ops.unshift({ id: a.opId, attackerId: a.attackerId, victimId: a.victimId, strength: a.strength, modelId: a.model.id, tick, result: 'decoy' });
    notify(g, a.out, a.attackerId, { kind: 'security', tone: 'gain', text: `${st.label} session planted on ${a.victimHandle}'s systems.`, msg: { key: 'security.msg.planted', vars: { label: `@security.strength.${a.strength}.label`, target: a.victimHandle } } });
    const attributed = a.rng.chance(0.5);
    notify(g, a.out, a.victimId, { kind: 'security', tone: 'warn', text: `Your honeypot logged an intrusion${attributed ? ` traced to ${a.attackerHandle}` : ''}.`, msg: attributed ? { key: 'security.msg.intrusionTraced', vars: { who: a.attackerHandle } } : { key: 'security.msg.intrusion' } });
    return 'decoy';
  }
  const detected = a.rng.chance(0.5);
  g.cyber.ops.unshift({ id: a.opId, attackerId: a.attackerId, victimId: a.victimId, strength: a.strength, modelId: a.model.id, tick, result: detected ? 'detected' : 'failed' });
  notify(g, a.out, a.attackerId, { kind: 'security', tone: 'loss', text: `The operation against ${a.victimHandle} failed${detected ? ' and was detected' : ''}.`, msg: { key: detected ? 'security.msg.failedDetected' : 'security.msg.failed', vars: { target: a.victimHandle } } });
  if (detected) {
    g.cyber.evidence[key] = (g.cyber.evidence[key] ?? 0) + 15;
    notify(g, a.out, a.victimId, { kind: 'security', tone: 'warn', text: `Your defenses blocked an intrusion attempt${a.rng.chance(0.3) ? ` traced to ${a.attackerHandle}` : ''}.`, msg: { key: 'security.msg.blocked' } });
  }
  return detected ? 'detected' : 'failed';
}

/**
 * Per game day, for each decoy session: progress on the same curve as a session (the victim's presence for a honeypot, the
 * attacker's for a fund), the effective hours grow by 24 × the presence factor, and a honeypot's evidence rises to
 * honeypotEvidence(hours) (+3 an hour, capped at 40). After 7 real days a session closes and the attacker keeps a student.
 */
export function decoyDay(g: GameState, out: StepOutput | null): void {
  const list = g.cyber.decoys;
  if (!list || list.length === 0) return;
  const tick = g.market.tick;
  for (const s of list) {
    const attacker = g.players[s.attackerId];
    const target = g.players[s.targetId];
    const online = s.on === 'honeypot' ? !!(target && (target.online || target.npc)) : !!(attacker && (attacker.online || attacker.npc));
    s.progress = copyStep(s.progress, STRENGTHS[s.strength].k, online);
    s.effHours += 24 * (online ? 1 : 0.25);
    if (s.on === 'honeypot') {
      const next = honeypotEvidence(s.effHours);
      if (next > s.evidence) {
        const key = `${s.attackerId}>${s.targetId}`;
        g.cyber.evidence[key] = (g.cyber.evidence[key] ?? 0) + (next - s.evidence);
        s.evidence = next;
      }
    }
  }
  const closing = list.filter((s) => tick - s.startTick > 7 * TPD);
  if (closing.length === 0) return;
  for (const s of closing) endDecoy(g, s, out);
  g.cyber.decoys = list.filter((s) => tick - s.startTick <= 7 * TPD);
  touch(g);
}

/**
 * A decoy session closes: the attacker keeps a student built from the bait (bait · P), with the inherited poison as a cut to
 * its strength (student MCS = bait · P · (1 − poison)). The poison is not shown anywhere a player can read it.
 */
function endDecoy(g: GameState, s: DecoySession, out: StepOutput | null): void {
  const P = s.progress;
  if (P <= 0.05) {
    notify(g, out, s.attackerId, { kind: 'security', tone: 'loss', text: 'A session closed before it copied anything useful.', msg: { key: 'security.msg.closedEarly' } });
    return;
  }
  const poison = inheritedPoison(s.poisonTier, P);
  const lab = labFor(g, s.attackerId);
  lab.modelSeq++;
  const residue = Math.max(0.03, 0.7 * (0.4 + (0.6 * P) / 0.85));
  lab.models.push({
    id: `m${lab.modelSeq}`, name: s.on === 'honeypot' ? 'Distilled decoy model' : 'Distilled fund model', kind: 'security',
    mcs: s.bait * P * (1 - poison), createdTick: g.market.tick, residue, ...(poison > 0 ? { poison } : {}),
  });
  notify(g, out, s.attackerId, { kind: 'security', tone: 'gain', text: `Session closed. You distilled ${(P * 100).toFixed(0)}% of a security model.`, msg: { key: 'security.msg.distilled', vars: { pct: (P * 100).toFixed(0) } } });
}

/** The codename a decoy session shows its thief: the same shape as a real connection's, drawn from the session's own stream. */
export function decoyCodename(g: GameState, id: string): string {
  return codename(keyedRng(g, `decoy-name:${id}`));
}
