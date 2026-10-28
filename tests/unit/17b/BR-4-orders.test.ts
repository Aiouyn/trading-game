// Engine Dev review of contracts/orders.ts: asset ids are opaque to the client. The engine's ids come from
// packages/content (read here, never written) and look like `ast_EQ_ADRG`; the client must pass every one of them
// through and leave unknown ids to the server (MKT_UNKNOWN_ASSET).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAssetId } from "@/shell/contracts/orders";
import { ASSETS } from "@/shell/contracts/fixtures/assets";

const catalog: unknown = JSON.parse(readFileSync(join(process.cwd(), "packages/content/data/instruments.json"), "utf8"));
const contentIds = [...JSON.stringify(catalog).matchAll(/"assetId":"([^"]+)"/g)].map((m) => m[1]!);

describe("parseAssetId (BR-4, Engine Dev review)", () => {
  it("passes a real content id unchanged", () => {
    expect(contentIds).toContain("ast_EQ_ADRG");
    expect(parseAssetId("ast_EQ_ADRG")).toBe("ast_EQ_ADRG");
  });
  it("passes every id in packages/content (equities and FX)", () => {
    expect(contentIds.length).toBeGreaterThan(200);
    expect(new Set(contentIds.map((id) => id.split("_")[1]))).toEqual(new Set(["EQ", "FX"]));
    for (const id of contentIds) expect(parseAssetId(id), id).toBe(id);
  });
  it("passes the mock's ids and any other non-empty string; only the empty string is refused", () => {
    for (const a of ASSETS) expect(parseAssetId(a.assetId)).toBe(a.assetId);
    expect(parseAssetId("zz unknown")).toBe("zz unknown");
    expect(parseAssetId("")).toBeNull();
  });
});
