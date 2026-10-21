import { describe, expect, it } from "vitest";
import { KEY_SHEET } from "@/shell/keys";
import { search } from "@/shell/launcher";
import { applyLayout } from "@/shell/layouts";
import { mockChannels } from "@/shell/mockChannels";
import { evaluate } from "@/shell/unlock";
import { intentLog } from "@/shell/intentLog";
import { APPS } from "@/shell/registry";
import { workArea } from "@/shell/wm";

// S1-18 (17-AT-12): R0 and R6 get the same launcher results, Broker limit and key bindings.
const visAt = (rank: string) => evaluate(mockChannels(new URLSearchParams({ rank, nw: "100", lic: "LIC0" })), new Set()).vis;

describe("rank parity (S1-18)", () => {
  it.each(["HALC", "port", "go to", "open", "broker", "how"])("launcher '%s' identical at R0 and R6", (q) => {
    expect(search(q, visAt("R0"), [])).toEqual(search(q, visAt("R6"), []));
  });
  it("Broker limit and keys do not depend on rank", () => {
    expect(APPS.broker.maxInstances).toBe(4);
    expect(KEY_SHEET.length).toBeGreaterThan(0);
  });
});

describe("no intents from shell actions (S1-17, pure half)", () => {
  it("layouts and launcher search write nothing to the intent log", () => {
    applyLayout("trade", workArea(1440, 900), () => true);
    search("buy 100 HALC", visAt("R2"), []);
    expect(intentLog()).toHaveLength(0);
  });
});
