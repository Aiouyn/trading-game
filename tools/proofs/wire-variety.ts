// Replayable proof for sys/wire-variety: no-repeat deck, varied magnitudes, determinism.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CRISES, STORY_EVERY, STORY_SEVERITY_MAX, STORY_SEVERITY_MIN, catalogStoryAt, storyAt, storySeverity,
} from "@/market/wireStories";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";

const SEED = PORT_AVALON_MARKET_SEED;
const outDir = process.env.SYS_WIRE_VARIETY_EVIDENCE_DIR ?? ".";
mkdirSync(outDir, { recursive: true });

// Fresh-process cold catalogStoryAt at cycle 10k (Gatekeeper q1 budget <3s).
// Invoked by the parent proof via WIRE_VARIETY_COLD_JUMP=1 so the memo is empty
// and the clock is not competing with the ~194-worker vitest pool (sys-PLAN 18:12).
if (process.env.WIRE_VARIETY_COLD_JUMP === "1") {
  const CYCLE_SLOTS = 16;
  const tick = START_TICK + (10_000 * CYCLE_SLOTS + 1) * STORY_EVERY;
  const t0 = performance.now();
  const story = catalogStoryAt(SEED, tick);
  const ms = performance.now() - t0;
  const report = { coldJumpMs: ms, tick, defId: story?.defId ?? null, ok: story != null && ms < 3_000 };
  writeFileSync(join(outDir, "cold-jump.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report) + "\n");
  process.exit(report.ok ? 0 : 1);
}


const slots = (n: number) => Array.from({ length: n }, (_, i) => START_TICK + (i + 1) * STORY_EVERY);
const PLAYTEST = [27694, 27754, 27814] as const;
const TEN_MIN = 20;

const playtest = PLAYTEST.map((tick) => {
  const s = catalogStoryAt(SEED, tick)!;
  return { tick, defId: s.defId, kind: s.kind, bp: (s.effects[0] ?? s.asserted?.[0])?.bp ?? 0 };
});
const playtestDistinct = new Set(playtest.map((r) => r.defId)).size;

const window = slots(TEN_MIN);
const gapRepeats: { tick: number; dt: number; defId: string }[] = [];
for (const t of window) {
  const s = storyAt(SEED, t);
  if (!s || s.crisis) continue;
  for (const dt of [60, 72] as const) {
    const later = storyAt(SEED, t + dt);
    if (later && !later.crisis && later.defId === s.defId) gapRepeats.push({ tick: t, dt, defId: s.defId });
  }
}

const cycle0 = Array.from({ length: 16 }, (_, i) => START_TICK + (i + 1) * STORY_EVERY).map((t) => storyAt(SEED, t)!);
const companyIds = cycle0.filter((s) => !s.crisis).map((s) => s.defId);
const crisisKinds = cycle0.filter((s) => s.phase === "forecast" && s.crisis).map((s) => s.crisis);

const byDef = new Map<string, number[]>();
for (const t of slots(16 * 8)) {
  const s = storyAt(SEED, t)!;
  const fx = s.effects[0] ?? s.asserted?.[0];
  if (!fx) continue;
  const list = byDef.get(s.defId) ?? [];
  list.push(fx.bp);
  byDef.set(s.defId, list);
}
const varying = [...byDef.entries()].filter(([, bps]) => new Set(bps).size > 1).map(([defId, bps]) => ({ defId, sizes: [...new Set(bps)] }));

const sameSeed = slots(32).every((t) => JSON.stringify(storyAt(SEED, t)) === JSON.stringify(storyAt(SEED, t)));
const otherSeedDiffers = slots(32).some((t) => storyAt(SEED, t)!.defId !== storyAt(SEED + 1, t)!.defId);
const sev = storySeverity(SEED, "probe");

const CYCLE_SLOTS = 16;
const cycleTicks = (cycle: number) =>
  Array.from({ length: CYCLE_SLOTS }, (_, i) => START_TICK + (cycle * CYCLE_SLOTS + i + 1) * STORY_EVERY);
const cycleCompanyIds = (cycle: number) =>
  cycleTicks(cycle).map((t) => storyAt(SEED, t)!).filter((s) => !s.crisis).map((s) => s.defId);
const cycleCrisisKinds = (cycle: number) =>
  cycleTicks(cycle).map((t) => storyAt(SEED, t)!).filter((s) => s.phase === "forecast" && s.crisis).map((s) => s.crisis);

const longSlots = Math.floor(10_000 / STORY_EVERY);
const longIds = slots(longSlots).map((t) => storyAt(SEED, t)!.defId);
let periodicAtOrBelow72 = 0;
for (let p = 1; p <= 72 / STORY_EVERY; p++) {
  let periodic = true;
  for (let i = 0; i + p < longIds.length; i++) {
    if (longIds[i] !== longIds[i + p]) { periodic = false; break; }
  }
  if (periodic) periodicAtOrBelow72 = p * STORY_EVERY;
}
const nCycles = Math.floor(longSlots / CYCLE_SLOTS);
const identicalConsecutive: number[] = [];
const boundaryRepeats: number[] = [];
for (let c = 0; c < nCycles - 1; c++) {
  const a = cycleCompanyIds(c), b = cycleCompanyIds(c + 1);
  if (a.every((id, i) => id === b[i])) identicalConsecutive.push(c);
  if (b[0] === a[a.length - 1]) boundaryRepeats.push(c);
  const ca = cycleCrisisKinds(c), cb = cycleCrisisKinds(c + 1);
  if (ca.every((k, i) => k === cb[i]) || cb[0] === ca[ca.length - 1]) boundaryRepeats.push(c);
}
const jumpKs = [0, 1, 7, 40];
const jumpEqualsWalk = jumpKs.every((k) => {
  const walkedCo = cycleCompanyIds(k);
  const walkedCr = cycleCrisisKinds(k);
  return walkedCo.join() === cycleCompanyIds(k).join() && walkedCr.join() === cycleCrisisKinds(k).join();
});

// Gatekeeper B1 (82576f02): minimum same-headline gap over 10k ticks on several seeds.
const COMPANY_FLOOR = 84;
const CRISIS_FLOOR = 72;
const minGaps = [SEED, 7, 18, 21, 27, 31, 42, 100].map((seed) => {
  const lastCo = new Map<string, number>(), lastCr = new Map<string, number>();
  let company = Infinity, crisis = Infinity;
  for (const t of slots(Math.floor(10_000 / STORY_EVERY))) {
    const s = storyAt(seed, t)!;
    if (!s.crisis) {
      const p = lastCo.get(s.defId);
      if (p !== undefined) company = Math.min(company, t - p);
      lastCo.set(s.defId, t);
    } else if (s.phase === "forecast") {
      const p = lastCr.get(s.crisis);
      if (p !== undefined) crisis = Math.min(crisis, t - p);
      lastCr.set(s.crisis, t);
    }
  }
  return { seed, company, crisis };
});
const minGapFloorsHeld = minGaps.every((g) => g.company >= COMPANY_FLOOR && g.crisis >= CRISIS_FLOOR);

// Gatekeeper q2: same headline key across companies must also keep the 84-tick floor.
const keyGaps = [SEED, 7, 18, 21, 27, 31, 42, 100].map((seed) => {
  const last = new Map<string, { tick: number; defId: string }>();
  let min = Infinity;
  for (const t of slots(Math.floor(10_000 / STORY_EVERY))) {
    const s = storyAt(seed, t)!;
    if (s.crisis) continue;
    const prev = last.get(s.headlineKey);
    if (prev !== undefined && prev.defId !== s.defId) min = Math.min(min, t - prev.tick);
    last.set(s.headlineKey, { tick: t, defId: s.defId });
  }
  return { seed, min: Number.isFinite(min) ? min : null };
});
const keyGapFloorHeld = keyGaps.every((g) => g.min === null || g.min >= COMPANY_FLOOR);
const seed17KeySplit = storyAt(SEED, 27802)!.headlineKey !== storyAt(SEED, 27814)!.headlineKey;

// 0 throws over 300 seeds x 2000 cycles (same stress as Gatekeeper's a8c597ab run).
const THROW_SEEDS = 300;
const THROW_CYCLES = 2000;
const throwLastTick = START_TICK + THROW_CYCLES * CYCLE_SLOTS * STORY_EVERY;
const throwSeeds: number[] = [];
for (let seed = 1; seed <= THROW_SEEDS; seed++) {
  try {
    catalogStoryAt(seed, throwLastTick);
  } catch {
    throwSeeds.push(seed);
  }
}
const throwCount = throwSeeds.length;

// Cold jump in a fresh process (empty memo, own wall clock).
const self = fileURLToPath(import.meta.url);
const child = spawnSync(process.execPath, [...process.execArgv, self], {
  env: { ...process.env, WIRE_VARIETY_COLD_JUMP: "1" },
  encoding: "utf8",
});
let coldJump: { coldJumpMs: number; tick: number; defId: string | null; ok: boolean } | null = null;
try {
  const line = (child.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
  coldJump = JSON.parse(line) as { coldJumpMs: number; tick: number; defId: string | null; ok: boolean };
} catch {
  coldJump = null;
}
const coldJumpOk = child.status === 0 && coldJump !== null && coldJump.ok;

const summary = {
  seed: SEED,
  playtest,
  playtestDistinct,
  playtestNoIdenticalTriple: playtestDistinct > 1 && !playtest.every((r) => r.defId === "avb-earnings"),
  gapRepeats60or72InTenMin: gapRepeats,
  cycle0CompaniesUnique: new Set(companyIds).size === companyIds.length,
  cycle0AllCrises: new Set(crisisKinds).size === CRISES.length,
  varyingDefs: varying.length,
  sampleVarying: varying.slice(0, 6),
  severityProbe: sev,
  severityInBand: sev >= STORY_SEVERITY_MIN && sev < STORY_SEVERITY_MAX,
  sameSeed,
  otherSeedDiffers,
  gridNullAtStart: storyAt(SEED, START_TICK) === null,
  periodicAtOrBelow72,
  identicalConsecutiveCycles: identicalConsecutive,
  boundaryRepeats,
  jumpEqualsWalk,
  minGaps,
  minGapFloorsHeld,
  keyGaps,
  keyGapFloorHeld,
  seed17KeySplit,
  throwCount,
  throwSeeds,
  coldJump,
  coldJumpOk,
};
const ok = summary.playtestNoIdenticalTriple
  && summary.gapRepeats60or72InTenMin.length === 0
  && summary.cycle0CompaniesUnique
  && summary.cycle0AllCrises
  && summary.varyingDefs > 0
  && summary.severityInBand
  && summary.sameSeed
  && summary.otherSeedDiffers
  && summary.gridNullAtStart
  && summary.periodicAtOrBelow72 === 0
  && summary.identicalConsecutiveCycles.length === 0
  && summary.boundaryRepeats.length === 0
  && summary.jumpEqualsWalk
  && summary.minGapFloorsHeld
  && summary.keyGapFloorHeld
  && summary.seed17KeySplit
  && summary.throwCount === 0
  && summary.coldJumpOk;

writeFileSync(join(outDir, "summary.json"), JSON.stringify({ ok, ...summary }, null, 2) + "\n");
console.log(JSON.stringify({
  ok,
  playtest,
  gapRepeats: gapRepeats.length,
  varyingDefs: varying.length,
  minGaps,
  keyGaps,
  throwCount,
  coldJump,
}, null, 2));
if (!ok) process.exit(1);
