// gatekeeper b321731f NO-GO b1: from game day ~4 a restart re-added up to 17 old rumor/denial rows that a server
// that never restarted had already dropped (catalog ids among them), and they stayed for good. Cause: restoreStories
// merged every rebuildRumorStories() row under the saved `wire`, not only the rows retainStories would still hold.
// Lesson (REVIEW-LESSONS 32): a restart at any tick lists exactly the rows (ids and values) of a never-restarted server.
import { describe, expect, it } from "vitest";
import { LiveMarket } from "@/server/market/clock";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import type { WireItem } from "@/shell/contracts/channels";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";

const SEED = PORT_AVALON_MARKET_SEED;
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
  : v;
const rows = (items: readonly WireItem[]) => items.map((i) => JSON.stringify(canon(i)));
const ids = (m: LiveMarket) => m.wire().items.map((i) => i.id);

/** Run a never-restarted server to `cut`, restart a second one from its store, and compare both now and after +120 steps. */
function parity(secret: string, cut: (m: LiveMarket) => boolean) {
  const store = new MemoryStormWorldStore();
  const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: secret, seed: SEED });
  while (!cut(a)) a.step();
  const b = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED }); // the restart
  expect(b.snapshot().tick).toBe(a.snapshot().tick);
  const extra = ids(b).filter((id) => !ids(a).includes(id));
  expect(extra, `rows a restart re-added: ${extra.join(", ")}`).toEqual([]);
  expect(ids(b)).toEqual(ids(a));
  expect(rows(b.wire().items)).toEqual(rows(a.wire().items));
  // Keep publishing: the same rows, none resurrected later. Values are not compared here: a restart re-marks prices
  // (main's restart path, eng/market-restart-marks), so later effects may differ; prices are pinned in wire-restart-history.
  for (let i = 0; i < 120; i++) { a.step(); b.step(); }
  expect(ids(b)).toEqual(ids(a));
}

describe("b1: restart vs never-restarted Wire id-list parity", () => {
  it("restart at START_TICK+3600 lists the same rows (ids and values) as a server that never restarted", () => {
    parity("wire-restart-history-secret", (m) => m.snapshot().tick >= START_TICK + 3600);
  }, 120_000);

  it("restart at the gatekeeper gk-diff point (seed 17, 2880 steps, its secret) lists the same rows", () => {
    let n = 0;
    parity("gk-secret-XYZ", () => n++ >= 2880);
  }, 120_000);
});
