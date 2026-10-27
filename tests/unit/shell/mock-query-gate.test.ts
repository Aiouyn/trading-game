// AC-HOOKS-PROD: the mock-channel query surface is compiled out of production builds without QUAY_HOOKS=1.
import { describe, expect, it, vi } from "vitest";

const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const m = await import("@/shell/mockChannels");
  vi.unstubAllEnvs();
  return m;
};
const q = new URLSearchParams("rank=R5&halted=1&held=1&conn=reconnecting&nw=1&tick=100&guest=1&prot=1&lic=LIC3");

describe("mock-channel query hooks are gated at build time", () => {
  it("production without QUAY_HOOKS: query ignored, defaults only", async () => {
    const m = await load({ NODE_ENV: "production", QUAY_HOOKS: "0" });
    expect(m.mockChannels(q)).toEqual(m.mockChannels(new URLSearchParams()));
    const c = m.mockChannels(q);
    expect([c.rank.rank, c.system.halted, c.system.held, c.system.connection, c.me.guest, c.me.license]).toEqual(["R2", false, false, "live", false, "LIC1"]);
  });
  it("e2e build (QUAY_HOOKS=1) honours the query", async () => {
    for (const env of [{ NODE_ENV: "production", QUAY_HOOKS: "1" }] as Record<string, string>[]) {
      const c = (await load(env)).mockChannels(q);
      expect([c.rank.rank, c.system.halted, c.system.held, c.system.connection, c.me.nw, c.clock.tick, c.me.guest, c.me.license]).toEqual(["R5", true, true, "reconnecting", "1", 100, true, "LIC3"]);
    }
  });
});
