// Acceptance for the NPC rival funds (specs/quant-npc-funds.md): over N seeds x 5 game years on the game universe,
// each rival's median multiple is in [0.4, 2.5], and no rival beats buy-and-hold of GX in more than 70% of seeds.
//   npx tsx scripts/balance/rivals.ts [--seeds 60] [--years 5] [--tpd 24] [--out balance-out/rivals]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createWorld, stepMany, indexLevel, universeConfig } from "../../src/engine";
import type { WorldState } from "../../src/engine";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const nSeeds = Number(arg("seeds", "60"));
const years = Number(arg("years", "5"));
const tpd = Number(arg("tpd", "24"));
const outDir = arg("out", "balance-out/rivals");

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function equityOf(s: WorldState, id: string): number {
  const book = s.ecology!.rivals!.find((r) => r.id === id)!;
  let eq = book.cash;
  s.config.assets.forEach((a, i) => { eq += (book.units[a.id] ?? 0) * Math.exp(s.ecology!.assets[i]!.lnS); });
  return eq;
}

const cfg0 = universeConfig({ ticksPerDay: tpd });
const days = Math.round(years * cfg0.daysPerYear);
const names = (cfg0.rivals ?? []).map((r) => r.id);
const perRival: Record<string, number[]> = Object.fromEntries(names.map((id) => [id, []]));
const beatsBH: Record<string, number> = Object.fromEntries(names.map((id) => [id, 0]));
const t0 = Date.now();

for (let k = 1; k <= nSeeds; k++) {
  const seed = `tape-${String(k).padStart(2, "0")}`;
  let s = createWorld(seed, universeConfig({ ticksPerDay: tpd }));
  const gx0 = indexLevel(s, "GX");
  const start = Object.fromEntries((cfg0.rivals ?? []).map((r) => [r.id, r.startingCash]));
  s = stepMany(s, days * tpd).state;
  const bh = indexLevel(s, "GX") / gx0;
  for (const id of names) {
    const mult = equityOf(s, id) / start[id]!;
    perRival[id]!.push(mult);
    if (mult > bh) beatsBH[id]! += 1;
  }
  console.log(`seed ${seed}: ${names.map((id) => `${id} ${equityOf(s, id).toFixed(0)}`).join(" | ")}  GX x${bh.toFixed(3)}`);
}

const result = names.map((id) => {
  const m = median(perRival[id]!);
  const beat = beatsBH[id]! / nSeeds;
  const ok = m >= 0.4 && m <= 2.5 && beat <= 0.7;
  return { id, medianMultiple: m, beatBuyAndHoldShare: beat, pass: ok };
});
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "rivals.json"), JSON.stringify({ seeds: nSeeds, years, tpd, result }, null, 2));
for (const r of result) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id.padEnd(6)} median x${r.medianMultiple.toFixed(3)} [0.4, 2.5]  beats GX buy-and-hold ${(r.beatBuyAndHoldShare * 100).toFixed(0)}% [<=70%]`);
console.log(`rivals: ${nSeeds} seeds x ${years} game years, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (result.some((r) => !r.pass)) process.exit(1);
