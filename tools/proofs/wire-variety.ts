// Replayable proof for sys/wire-variety: no-repeat deck, varied magnitudes, determinism.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CRISES, STORY_EVERY, STORY_SEVERITY_MAX, STORY_SEVERITY_MIN, catalogStoryAt, storyAt, storySeverity,
} from "@/market/wireStories";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";

const SEED = PORT_AVALON_MARKET_SEED;
const outDir = process.env.SYS_WIRE_VARIETY_EVIDENCE_DIR ?? ".";
mkdirSync(outDir, { recursive: true });

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
};
const ok = summary.playtestNoIdenticalTriple
  && summary.gapRepeats60or72InTenMin.length === 0
  && summary.cycle0CompaniesUnique
  && summary.cycle0AllCrises
  && summary.varyingDefs > 0
  && summary.severityInBand
  && summary.sameSeed
  && summary.otherSeedDiffers
  && summary.gridNullAtStart;

writeFileSync(join(outDir, "summary.json"), JSON.stringify({ ok, ...summary }, null, 2) + "\n");
console.log(JSON.stringify({ ok, playtest, gapRepeats: gapRepeats.length, varyingDefs: varying.length }, null, 2));
if (!ok) process.exit(1);
