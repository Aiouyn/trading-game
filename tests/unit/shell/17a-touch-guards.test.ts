// Guard for Studio T1 ruling 8: the contrast lint covers data-cb="1" in all 4 palettes (it used to skip it).
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

describe("contrast lint: ruling 8 (data-cb=\"1\")", () => {
  const out = execFileSync(process.execPath, ["tools/lint/contrast.mjs"], { encoding: "utf8" });
  const cb = out.split("\n").filter((l) => l.includes("(ruling 8)"));
  it("checks cb gain/loss on bg0, win, win2, chrome in all 4 palettes (32 pairs), all passing", () => {
    expect(cb).toHaveLength(32);
    for (const p of ["ink-brass", "broadsheet", "phosphor", "riviera"]) expect(cb.filter((l) => l.includes(p))).toHaveLength(8);
    expect(cb.filter((l) => l.startsWith("FAIL"))).toEqual([]);
  });
  it("Broadsheet uses the darker cb pair (5.12–6.88 per Studio's table)", () => {
    expect(cb.find((l) => /broadsheet cb gain\s+on chrome/.test(l))).toContain("5.12");
    expect(cb.find((l) => /broadsheet cb loss\s+on win /.test(l))).toContain("6.88");
  });
});

describe("?city=fail e2e hook is unreachable in a production build", () => {
  it("production without the opt-in ignores it; with it (or in dev) it forces failure", async () => {
    const { cityFailForced } = await import("@/apps/city/createShellCityRenderer");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL", "");
    expect(cityFailForced("?city=fail")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL", "1");
    expect(cityFailForced("?city=fail")).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL", "");
    expect(cityFailForced("?city=fail")).toBe(true);
    expect(cityFailForced("?city=ok")).toBe(false);
    vi.unstubAllEnvs();
  });
});
