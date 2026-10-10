// Horizon check (V1-PHASE1 round 6, reviewer 4): realized daily and 21-day vol of named universe assets against the daily band and the
// option horizon expectation (expectedVolOf with horizonDays 21). Usage: SEEDS=4 npx tsx scripts/balance/horizon.ts (3 game years, 24 ticks).
// Not a release gate: a diagnostic for the bond option horizon (F21).
import { createWorld, stepMany, universeConfig, expectedVolOf, closePrint, ratePrintOf } from "../../src/engine/index";
const cfg = universeConfig({ ticksPerDay: 24 });
const ids = ["AV10", "AV30", "AV2Y", "IGCB", "HYLD", "RE.avalon.docks", "HLCN", "NMBS", "FLUX", "AUSD"];
const H = 21;
const acc: Record<string, { d: number[]; h: number[] }> = {};
for (const id of ids) acc[id] = { d: [], h: [] };
const seeds = Number(process.env.SEEDS ?? 4);
for (let k = 1; k <= seeds; k++) {
  let s = createWorld(`hz-${k}`, cfg);
  const px: Record<string, number[]> = {};
  for (const id of ids) px[id] = [];
  for (let d = 0; d < 252 * 3; d++) {
    s = stepMany(s, 24).state;
    for (const id of ids) { const i = s.config.assets.findIndex((a) => a.id === id); px[id]!.push(s.assets[i]!.lnP); }
  }
  for (const id of ids) {
    const x = px[id]!;
    const r1 = x.slice(1).map((v, i) => v - x[i]!);
    const rH = x.slice(H).map((v, i) => v - x[i]!);
    const sd = (a: number[]) => { const m = a.reduce((p, q) => p + q, 0) / a.length; return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / a.length); };
    acc[id]!.d.push(sd(r1) * Math.sqrt(252));
    acc[id]!.h.push(sd(rH) * Math.sqrt(252 / H));
  }
}
const a = (xs: number[]) => xs.reduce((p, q) => p + q, 0) / xs.length;
console.log(`seeds ${seeds}, 3 game years, 24 ticks; realized daily vol, realized 21-day vol (annualized), expectation: daily band (closePrint, ratePrintOf), 21-day horizon (print 1, horizon 21)`);
for (const id of ids) {
  const def = cfg.assets.find((x) => x.id === id)!;
  const band = expectedVolOf(def, cfg, undefined, closePrint(cfg), ratePrintOf(cfg));
  const hz = expectedVolOf(def, cfg, undefined, 1, 1, H);
  console.log(id.padEnd(16), `daily ${(a(acc[id]!.d) * 100).toFixed(2)}% vs band ${(band * 100).toFixed(2)}% (ratio ${(a(acc[id]!.d) / band).toFixed(3)})`, ` 21d ${(a(acc[id]!.h) * 100).toFixed(2)}% vs horizon ${(hz * 100).toFixed(2)}% (ratio ${(a(acc[id]!.h) / hz).toFixed(3)})`);
}
