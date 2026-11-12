import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ASSET_BY_ID, ASSETS } from "@/market/catalog";
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
import { decidePlace, notionalCents, sweepLedger, type IdSource, type ServerQuote } from "@/server/broker/execution";
import { feeOf } from "@/server/broker/book";
import { fmt } from "@/shell/contracts/mockFeed";

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

function reconstructDelta(feed: ShockFeed, assetId: string, from: number, residualLog: number, ticks: number): number {
  const leftover = feed.erpSnapshot().find((r) => r.assetId === assetId)?.log ?? 0;
  const implied = from * Math.exp(residualLog) * Math.exp(equityErpTickLog() * ticks);
  return feed.assets.get(assetId)!.last * Math.exp(leftover) - implied;
}

function proveFlashRecovery() {
  const sizes: { label: string; bp: number; residualImplied: number; reconstructDelta: number }[] = [];
  const cases: [string, number][] = [["sev=0.6", -600], ["sev=1", -1000], ["sev=1.4", -1400], ["small-1bp", -1], ["small-10bp", -10], ["small-50bp", -50], ["huge-sev3", -3000], ["huge-sev5", -5000], ["huge-sev8", -8000]];
  for (const [label, bp] of cases) {
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const hit = feed.applyShock("GX", bp, shockHalfLifeDays("FLASH_CRASH"));
    assert.ok(hit);
    const l0 = Math.log(hit.to / hit.from);
    feed.catchUpDecay(TICKS_PER_DAY);
    const residual = feed.residualSnapshot().find((r) => r.assetId === "GX")!;
    const recovered = priceRecovery(l0, residual.log);
    assert.ok(Math.abs(recovered - FLASH_PRICE_RECOVERY_PER_DAY) < 1e-9, `${label} recovered ${recovered}`);
    const delta = reconstructDelta(feed, "GX", hit.from, residual.log, TICKS_PER_DAY);
    assert.ok(Math.abs(delta) <= 1, `${label} reconstruct ${delta}`);
    sizes.push({ label, bp, residualImplied: recovered, reconstructDelta: delta });
  }
  return sizes;
}

function proveLeftoverPlateau() {
  const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  const first = feed.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"))!;
  feed.catchUpDecay(10 * TICKS_PER_DAY);
  const leftover = feed.erpSnapshot().find((r) => r.assetId === "GX")?.log ?? 0;
  const d10 = Math.abs(feed.assets.get("GX")!.last * Math.exp(leftover) - first.from * Math.exp(equityErpTickLog() * 10 * TICKS_PER_DAY));
  assert.ok(d10 <= 2, `10-GD leftover plateau ${d10}`);
  const serial: number[] = [];
  const s = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  let ticks = 0;
  for (let i = 0; i < 5; i++) {
    s.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"));
    s.catchUpDecay(10 * TICKS_PER_DAY);
    ticks += 10 * TICKS_PER_DAY;
    const acc = s.erpSnapshot().find((r) => r.assetId === "GX")?.log ?? 0;
    const delta = s.assets.get("GX")!.last * Math.exp(acc) - first.from * Math.exp(equityErpTickLog() * ticks);
    assert.ok(Math.abs(delta) <= 2, `serial ${i} ${delta}`);
    serial.push(delta);
  }
  return { after10gdReconstruct: d10, serialReconstruct: serial };
}

function proveOverlap() {
  const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  const first = feed.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"))!;
  const l1 = Math.log(first.to / first.from);
  feed.catchUpDecay(360);
  const k1 = feed.residualSnapshot().find((r) => r.assetId === "GX")!.k;
  const second = feed.applyShock("GX", -500, shockHalfLifeDays("FLASH_CRASH"))!;
  const l2 = Math.log(second.to / second.from);
  assert.equal(feed.residualSnapshot().filter((r) => r.assetId === "GX").length, 2);
  feed.catchUpDecay(TICKS_PER_DAY - 360);
  const atFirst = feed.residualSnapshot().filter((r) => r.assetId === "GX");
  const firstRow = atFirst.find((r) => Math.abs(r.k - k1) < 1e-18)!;
  const rec1 = priceRecovery(l1, firstRow.log);
  assert.ok(Math.abs(rec1 - FLASH_PRICE_RECOVERY_PER_DAY) < 1e-9, `first component ${rec1}`);
  feed.catchUpDecay(360);
  const atSecond = feed.residualSnapshot().filter((r) => r.assetId === "GX");
  const secondRow = atSecond.find((r) => Math.abs(r.k - k1) >= 1e-18)!;
  const rec2 = priceRecovery(l2, secondRow.log);
  assert.ok(Math.abs(rec2 - FLASH_PRICE_RECOVERY_PER_DAY) < 1e-9, `second component ${rec2}`);
  return { midTick: 360, firstOwnDay: rec1, secondOwnDay: rec2, rowsAtSecondDay: atSecond.length };
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
  const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
  const avb = ASSET_BY_ID.AVB!, pre = feed.assets.get("AVB")!.last;
  const src: IdSource = (() => { let n = 0; return { next: (kind: "o" | "x" | "i") => `${kind}_${++n}` }; })();
  const quote = (): ServerQuote => ({ tick: feed.tick, last: (id) => { const s = feed.assets.get(id); return s && s.last > 0 ? s.last : null; }, tradable: (id) => feed.assets.has(id) });
  const rec0 = buildPlayerPrivate("acct_flash" as AccountId, {
    cashCents: 5_000_000,
    positions: { AVB: { assetId: "AVB", qty: "200", avgCost: fmt(pre, avb.displayDecimals) } },
    openOrders: {},
  });
  const buyLimit = Math.round(pre * 0.93);
  const placedBuy = decidePlace(rec0, "key-buy-01", { assetId: "AVB", side: "BUY", type: "limit", qty: "200", limit: fmt(buyLimit, avb.displayDecimals), tif: "day" }, quote(), src);
  assert.equal(placedBuy.result.status, "ACCEPTED");
  let rec = buildPlayerPrivate("acct_flash" as AccountId, placedBuy.next);
  const genesis = rec.cashCents;
  let npc = 0, fees = 0, fills = 0;
  const account = (next: typeof rec) => {
    for (const f of (next.fills ?? []).slice((rec.fills ?? []).length)) {
      const px = Math.round(Number(f.price) * 10 ** avb.displayDecimals);
      const notional = notionalCents(avb, f.side, Number(f.qty), px);
      const fee = feeOf(notional);
      fees += fee;
      npc += f.side === "BUY" ? notional : -notional;
      fills += 1;
    }
    rec = next;
    assert.equal(rec.cashCents + npc + fees, genesis);
  };
  const crash = feed.applyShock("AVB", -1000, shockHalfLifeDays("FLASH_CRASH"))!;
  const afterCrash = sweepLedger(rec, quote(), src);
  assert.ok(afterCrash, "buy should fill at the crash");
  account(buildPlayerPrivate("acct_flash" as AccountId, afterCrash!));
  const sellLimit = crash.to + Math.round(0.7 * (crash.from - crash.to) * 0.8);
  const placedSell = decidePlace(rec, "key-sell-01", { assetId: "AVB", side: "SELL", type: "limit", qty: "200", limit: fmt(sellLimit, avb.displayDecimals), tif: "day" }, quote(), src);
  assert.equal(placedSell.result.status, "ACCEPTED");
  rec = buildPlayerPrivate("acct_flash" as AccountId, placedSell.next);
  assert.equal(rec.cashCents + npc + fees, genesis);
  let sold = false;
  for (let i = 0; i < TICKS_PER_DAY; i++) {
    feed.advanceDecay();
    const swept = sweepLedger(rec, quote(), src);
    if (swept) { account(buildPlayerPrivate("acct_flash" as AccountId, swept)); sold = true; break; }
  }
  assert.ok(sold, "sell should fill during recovery");
  assert.equal(rec.cashCents + npc + fees, genesis);
  return { genesisCents: genesis, cashCentsAfter: rec.cashCents, npcCents: npc, feeCents: fees, total: rec.cashCents + npc + fees, cashDelta: rec.cashCents + npc + fees - genesis, fills, moneyCreated: false, vacuous: false };
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
  const leftover = proveLeftoverPlateau();
  const overlap = proveOverlap();
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
    leftover,
    overlap,
    restart,
    conservation,
  };
  out("summary.json", summary);
  console.log(JSON.stringify({ ok: true, evidence, snapshotSha256: summary.snapshotSha256, drift, flash, leftover, overlap, conservation }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
