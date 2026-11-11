import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ASSETS } from "@/market/catalog";
import { MAJOR_KINDS_V1, RIPPLE_KINDS, majorStockShocks, rippleStockShocks } from "@/server/market/crises";
import { TICKS_PER_DAY } from "@/server/market/meme";
import {
  FLASH_LOG_HALF_LIFE_DAYS,
  FLASH_PRICE_RECOVERY_PER_DAY,
  ShockFeed,
  equityErpTickLog,
  flashCrashHalfLifeDays,
  shockHalfLifeDays,
} from "@/server/market/shockFeed";
import { STORM_KINDS, stormStockShocks } from "@/server/market/storms";
import type { AccountId } from "@/server/auth/types";
import { buildPlayerPrivate } from "@/server/player/privateState";

const HORIZONS = [0, 60, TICKS_PER_DAY, 2 * TICKS_PER_DAY, 10 * TICKS_PER_DAY] as const;
const EXTRA_KINDS = ["BANKING_PANIC", "CREDIT_CRUNCH", "UNKNOWN_KIND"] as const;
const ALL_KIND_KEYS = [...STORM_KINDS, ...MAJOR_KINDS_V1, ...RIPPLE_KINDS, ...EXTRA_KINDS];
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const marksOf = (feed: ShockFeed) => {
  const rows: [string, number][] = [...feed.assets.entries()].map(([id, s]) => [id, s.last]);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return Object.fromEntries(rows);
};
const priceRecovery = (l0: number, l1: number) => (Math.exp(l1) - Math.exp(l0)) / (1 - Math.exp(l0));

function shocksFor(kind: string): { assetId: string; bp: number }[] {
  if ((STORM_KINDS as readonly string[]).includes(kind)) return stormStockShocks(kind as (typeof STORM_KINDS)[number], 1, 0);
  if ((MAJOR_KINDS_V1 as readonly string[]).includes(kind)) return majorStockShocks(kind as (typeof MAJOR_KINDS_V1)[number], 1);
  if ((RIPPLE_KINDS as readonly string[]).includes(kind)) return rippleStockShocks(kind as (typeof RIPPLE_KINDS)[number], -1, 1, 0);
  return [{ assetId: "AVB", bp: -500 }, { assetId: "GX", bp: -800 }];
}

function runKind(kind: string, shocks: ReadonlyArray<{ assetId: string; bp: number }>) {
  const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  const trigger = shocks.map((s) => {
    const result = feed.applyShock(s.assetId, s.bp, shockHalfLifeDays(kind));
    return { assetId: s.assetId, bp: s.bp, from: result?.from ?? null, to: result?.to ?? null };
  });
  const at: Record<string, { residual: ReturnType<ShockFeed["residualSnapshot"]>; marks: Record<string, number> }> = {
    0: { residual: feed.residualSnapshot(), marks: marksOf(feed) },
  };
  let stepped = 0;
  for (const h of HORIZONS.slice(1)) {
    feed.catchUpDecay(h - stepped);
    stepped = h;
    at[String(h)] = { residual: feed.residualSnapshot(), marks: marksOf(feed) };
  }
  return { kind, halfLifeDays: shockHalfLifeDays(kind), trigger, at };
}

export function capture() {
  const halfLifeTable = Object.fromEntries(ALL_KIND_KEYS.map((k) => [k, shockHalfLifeDays(k)]));
  const isolated = ALL_KIND_KEYS.map((k) => runKind(k, shocksFor(k)));
  const mixed = (() => {
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const applied: { kind: string; assetId: string; bp: number; from: number | null; to: number | null }[] = [];
    for (const kind of ALL_KIND_KEYS) {
      if (kind === "FLASH_CRASH") continue;
      for (const s of shocksFor(kind)) {
        const result = feed.applyShock(s.assetId, s.bp, shockHalfLifeDays(kind));
        applied.push({ kind, assetId: s.assetId, bp: s.bp, from: result?.from ?? null, to: result?.to ?? null });
      }
    }
    const at: Record<string, unknown> = { 0: { residual: feed.residualSnapshot(), marks: marksOf(feed) } };
    let stepped = 0;
    for (const h of HORIZONS.slice(1)) {
      feed.catchUpDecay(h - stepped);
      stepped = h;
      at[String(h)] = { residual: feed.residualSnapshot(), marks: marksOf(feed) };
    }
    return { applied, at };
  })();
  const flash = isolated.find((r) => r.kind === "FLASH_CRASH")!;
  const flashRecovery = Object.fromEntries(
    HORIZONS.map((h) => {
      const row = flash.trigger[0]!;
      const last = flash.at[String(h)]!.marks[row.assetId]!;
      const drop = row.from! - row.to!;
      const recovered = row.from! != null && drop !== 0 ? (last - row.to!) / drop : null;
      const residual = flash.at[String(h)]!.residual.find((r) => r.assetId === row.assetId);
      const l0 = Math.log(row.to! / row.from!);
      return [String(h), { last, recovered, residualImplied: residual ? priceRecovery(l0, residual.log) : null }];
    }),
  );
  return { ticksPerDay: TICKS_PER_DAY, halfLifeTable, isolated, mixed, flashRecovery };
}

function compareToBaseline(after: ReturnType<typeof capture>, baselinePath: string) {
  const before = JSON.parse(readFileSync(baselinePath, "utf8")) as ReturnType<typeof capture>;
  assert.deepEqual(after.halfLifeTable, before.halfLifeTable, "kind-table half-lives must be unchanged");
  assert.equal(digest(after.mixed), digest(before.mixed), "non-FLASH mixed shock+decay snapshot must be byte-identical");
  const beforeNonFlash = before.isolated.filter((r) => r.kind !== "FLASH_CRASH");
  const afterNonFlash = after.isolated.filter((r) => r.kind !== "FLASH_CRASH");
  assert.equal(digest(afterNonFlash), digest(beforeNonFlash), "isolated non-FLASH kind snapshots must be byte-identical");

  const bFlash = before.isolated.find((r) => r.kind === "FLASH_CRASH")!;
  const aFlash = after.isolated.find((r) => r.kind === "FLASH_CRASH")!;
  assert.deepEqual(aFlash.trigger, bFlash.trigger, "FLASH trigger prints must be unchanged");
  assert.notEqual(digest(aFlash.at), digest(bFlash.at), "FLASH recovery path must change");
  const changedHorizons = HORIZONS.filter((h) => digest(aFlash.at[String(h)]) !== digest(bFlash.at[String(h)]));
  // t=0 residual k changes immediately; marks at t=0 (the trigger print) stay the same.
  assert.deepEqual(aFlash.at["0"].marks, bFlash.at["0"].marks, "FLASH marks at the crash tick must be unchanged");
  assert.notDeepEqual(aFlash.at["0"].residual, bFlash.at["0"].residual, "FLASH residual k at the crash tick must change");
  assert.ok(changedHorizons.includes(TICKS_PER_DAY), "1-GD FLASH residual/marks must differ from the legacy law");
  return {
    halfLifeTableEqual: true,
    mixedEqual: true,
    nonFlashIsolatedEqual: true,
    flashTriggerEqual: true,
    flashT0MarksEqual: true,
    flashRecoveryChangedHorizons: changedHorizons,
    flashBefore1gd: before.flashRecovery[String(TICKS_PER_DAY)],
    flashAfter1gd: after.flashRecovery[String(TICKS_PER_DAY)],
  };
}

function proveFlashRecovery() {
  const sizes: { severity: number; residualImplied: number; markNetOfErpDelta: number }[] = [];
  for (const severity of [0.6, 1, 1.4]) {
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const [shock] = majorStockShocks("FLASH_CRASH", severity);
    const hit = feed.applyShock(shock!.assetId, shock!.bp, shockHalfLifeDays("FLASH_CRASH"));
    assert.ok(hit);
    const l0 = Math.log(hit.to / hit.from);
    feed.catchUpDecay(TICKS_PER_DAY);
    const residual = feed.residualSnapshot().find((r) => r.assetId === shock!.assetId)!;
    const recovered = priceRecovery(l0, residual.log);
    assert.ok(Math.abs(recovered - FLASH_PRICE_RECOVERY_PER_DAY) < 1e-9, `severity ${severity} recovered ${recovered}`);
    const leftover = feed.erpSnapshot().find((r) => r.assetId === shock!.assetId)?.log ?? 0;
    const printedErp = equityErpTickLog() * TICKS_PER_DAY - leftover;
    const markNetOfErp = feed.assets.get(shock!.assetId)!.last / Math.exp(printedErp);
    const implied = hit.from * Math.exp(residual.log);
    const delta = Math.abs(markNetOfErp - implied);
    assert.ok(delta <= 5, `printed-mark delta ${delta}`);
    sizes.push({ severity, residualImplied: recovered, markNetOfErpDelta: delta });
  }
  return sizes;
}

function proveRestartJump() {
  const tick = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  const jump = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  tick.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"));
  jump.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"));
  for (let i = 0; i < 200; i++) tick.advanceDecay();
  const midRes = tick.residualSnapshot();
  const midErp = tick.erpSnapshot();
  const midMinors = new Map([...tick.assets].map(([id, s]) => [id, s.last]));
  const midLast = tick.assets.get("GX")!.last;

  const restarted = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  for (const def of ASSETS) {
    const dst = restarted.assets.get(def.assetId), mid = midMinors.get(def.assetId);
    if (dst && mid != null) dst.last = mid;
  }
  restarted.hydrateResidual(midRes, false);
  restarted.hydrateErp(midErp);
  assert.deepEqual(restarted.residualSnapshot(), midRes);
  assert.deepEqual(restarted.erpSnapshot(), midErp);
  assert.equal(restarted.assets.get("GX")!.last, midLast);

  const rest = TICKS_PER_DAY - 200;
  for (let i = 0; i < rest; i++) tick.advanceDecay();
  jump.catchUpDecay(TICKS_PER_DAY);
  for (let i = 0; i < rest; i++) restarted.advanceDecay();
  assert.deepEqual(tick.residualSnapshot(), jump.residualSnapshot());
  assert.deepEqual(tick.erpSnapshot(), jump.erpSnapshot());
  assert.equal(tick.assets.get("GX")!.last, jump.assets.get("GX")!.last);
  assert.deepEqual(restarted.residualSnapshot(), tick.residualSnapshot());
  assert.deepEqual(restarted.erpSnapshot(), tick.erpSnapshot());
  assert.equal(restarted.assets.get("GX")!.last, tick.assets.get("GX")!.last);
  return {
    midTick: 200,
    endTick: TICKS_PER_DAY,
    midLast,
    endLast: tick.assets.get("GX")!.last,
    residual: tick.residualSnapshot(),
    erp: tick.erpSnapshot(),
    legacyK: 1 - Math.pow(2, -1 / (FLASH_LOG_HALF_LIFE_DAYS * TICKS_PER_DAY)),
    solvedK: 1 - Math.pow(2, -1 / (flashCrashHalfLifeDays(Math.log(378014 / 420015)) * TICKS_PER_DAY)),
  };
}

function proveConservation() {
  const cash = 1_000_000;
  const before = buildPlayerPrivate("acct_flash" as AccountId, { cashCents: cash, positions: {}, openOrders: {} });
  const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  feed.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"));
  feed.catchUpDecay(TICKS_PER_DAY);
  const after = buildPlayerPrivate("acct_flash" as AccountId, { cashCents: cash, positions: {}, openOrders: {} });
  assert.deepEqual(after, before);
  assert.equal(after.cashCents, cash);
  assert.equal(before.cashCents, after.cashCents);
  return { cashCentsBefore: before.cashCents, cashCentsAfter: after.cashCents, cashDelta: 0, marksMoved: true, moneyCreated: false };
}

async function main() {
  const evidence = process.env.SYS_SHOCKFEED_EVIDENCE_DIR;
  if (!evidence) throw new Error("SYS_SHOCKFEED_EVIDENCE_DIR required");
  mkdirSync(evidence, { recursive: true });
  const out = (name: string, value: unknown) => writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + "\n");

  const snap = capture();
  out("snapshot.json", snap);
  writeFileSync(path.join(evidence, "SHA256.txt"), digest(snap) + "\n");
  const baselinePath = process.env.SYS_SHOCKFEED_BASELINE ?? path.join(evidence, "..", "baseline", "out", "snapshot.json");
  const drift = compareToBaseline(snap, baselinePath);
  const flash = proveFlashRecovery();
  const restart = proveRestartJump();
  const conservation = proveConservation();
  const summary = {
    ok: true,
    ticksPerDay: TICKS_PER_DAY,
    flashPriceRecoveryPerDay: FLASH_PRICE_RECOVERY_PER_DAY,
    flashLogHalfLifeDays: FLASH_LOG_HALF_LIFE_DAYS,
    snapshotSha256: digest(snap),
    mixedSha256: digest(snap.mixed),
    nonFlashIsolatedSha256: digest(snap.isolated.filter((r) => r.kind !== "FLASH_CRASH")),
    drift,
    flash,
    restart,
    conservation,
  };
  out("summary.json", summary);
  console.log(JSON.stringify({ ok: true, evidence, snapshotSha256: summary.snapshotSha256, drift, flash, conservation }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
