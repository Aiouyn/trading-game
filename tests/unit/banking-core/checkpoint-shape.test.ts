import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { createHash } from "node:crypto";
import { BankingCoreEngine } from "../../../src/server/banking-core/engine";
import type { CoreStore } from "../../../src/server/banking-core/model";
import * as F from "./fixture";

/**
 * Gatekeeper lesson on 8b38f538: adding bank.priorResolutions changed the persisted state shape, so a checkpoint written
 * before it failed with the generic CORE_CHECKPOINT_DIGEST. The fixture is the cross-module jump store written by the
 * 7078c75f engine (proofs at ea3e10bb; src is identical to 7078c75f). Bank a is resolved at 3599 and again at 4319.
 * Raw sha256 bad5dce1…, brotli-compressed to keep the repo small.
 */
const FIXTURE = join(__dirname, "fixtures/cross-module-7078c75f.checkpoint.json.br");
const OLD_SHA = "bad5dce18f7ea00e3743c4e86676cb148260f2bde4bc511e27c7342c9a8d3ce5";

class ReadOnly implements CoreStore {
  saves = 0;
  constructor(private readonly payload: unknown) {}
  async load() { return { revision: "fixture", payload: structuredClone(this.payload) }; }
  async save(): Promise<string> { this.saves++; throw new Error("READ_ONLY"); }
}

function oldStore(): { raw: Buffer; payload: Record<string, unknown> } {
  const raw = brotliDecompressSync(readFileSync(FIXTURE));
  return { raw, payload: JSON.parse(raw.toString("utf8")) as Record<string, unknown> };
}

async function openError(payload: unknown): Promise<{ message: string; saves: number }> {
  const store = new ReadOnly(payload);
  try { await BankingCoreEngine.open(store, F.crossModule().g, true); return { message: "OPENED", saves: store.saves }; }
  catch (err) { return { message: (err as Error).message, saves: store.saves }; }
}

describe("banking-core checkpoint written before priorResolutions", () => {
  it("is the 7078c75f cross-module store (double resolution of bank a)", () => {
    const { raw, payload } = oldStore();
    expect(createHash("sha256").update(raw).digest("hex")).toBe(OLD_SHA);
    expect([payload.version, payload.target]).toEqual([1, 5040]);
  });

  it("fails with the named CORE_CHECKPOINT_SHAPE_OUTDATED, not the generic digest error, and writes nothing", async () => {
    expect(await openError(oldStore().payload)).toEqual({ message: "CORE_CHECKPOINT_SHAPE_OUTDATED", saves: 0 });
  }, 120000);

  it("still reports a tampered digest as CORE_CHECKPOINT_DIGEST", async () => {
    const { payload } = oldStore();
    payload.digest = "0".repeat(64);
    expect(await openError(payload)).toEqual({ message: "CORE_CHECKPOINT_DIGEST", saves: 0 });
  }, 120000);
});
