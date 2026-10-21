// ?load=fail / fail1 / retryMs are e2e hooks, compiled out of production builds unless the e2e build opts in.
import { describe, expect, it, vi } from "vitest";

const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const m = await import("@/shell/loader");
  const c = await import("@/shell/mockChannels");
  vi.unstubAllEnvs();
  return { ...m, ...c };
};
const q = new URLSearchParams("load=fail");

describe("?load= hook is gated at build time", () => {
  it("production without the opt-in: compiled out, starts ok", async () => {
    const m = await load({ NODE_ENV: "production", NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL: "0" });
    expect(m.LOAD_FAIL_HOOK).toBe(false);
    expect(m.loadHookMode(q)).toBeNull();
    expect(m.mockChannels(q).system.load).toBe("ok");
  });
  it("production e2e build and dev honour it", async () => {
    for (const env of [{ NODE_ENV: "production", NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL: "1" }, { NODE_ENV: "development" }] as Record<string, string>[]) {
      const m = await load(env);
      expect(m.loadHookStartsFailed(q)).toBe(true);
      expect(m.loadHookStartsFailed(new URLSearchParams("load=fail1"))).toBe(true);
      expect(m.mockChannels(q).system.load).toBe("error");
    }
  });
});
