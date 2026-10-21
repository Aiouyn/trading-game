// @vitest-environment happy-dom
// 17B S2: <About /> rendered directly (S2-01..S2-05, S2-07 component side).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { About } from "@/apps/settings/About";
import { LICENCES } from "@/apps/settings/about-data";
import { SETTINGS_STRINGS } from "@/apps/settings/strings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

function mount(locale = "en") {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  act(() => root.render(<About locale={locale} />));
  return el;
}
afterEach(() => { document.body.innerHTML = ""; vi.unstubAllEnvs(); });

describe("17B S2 About", () => {
  it("S2-01: version line is '<version> (build <sha7>)' in EN and FR; 'dev' when not built from git", () => {
    expect(SETTINGS_STRINGS.en.versionLine("0.1.0", "abc1234")).toBe("0.1.0 (build abc1234)");
    expect(SETTINGS_STRINGS.fr.versionLine("0.1.0", "abc1234")).toBe("0.1.0 (build abc1234)");
    vi.stubEnv("NEXT_PUBLIC_RELEASE", "0.1.0");
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "abc1234");
    expect(mount().querySelector("[data-testid=about-version]")!.textContent).toBe("0.1.0 (build abc1234)");
    document.body.innerHTML = "";
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "");
    expect(mount().querySelector("[data-testid=about-version]")!.textContent).toBe("0.1.0 (build dev)");
  });

  it("S2-01: next.config injects package.json version and `git rev-parse --short=7 HEAD`, else dev", async () => {
    const { execSync } = await import("node:child_process");
    const env = (await import("../../../next.config")).default.env!;
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(env.NEXT_PUBLIC_RELEASE).toBe(pkg.version);
    expect(env.NEXT_PUBLIC_BUILD_SHA).toBe(execSync("git rev-parse --short=7 HEAD").toString().trim());
    expect(env.NEXT_PUBLIC_BUILD_SHA).toMatch(/^[0-9a-f]{7}$/);
  });

  it("S2-02: licence rows, verified against node_modules package.json", () => {
    const rows = [...mount().querySelectorAll("[data-testid=about-licence-row] td:first-child")].map((td) => td.textContent);
    for (const n of ["Instrument Serif", "Inter", "JetBrains Mono", "Lightweight Charts", "three.js"]) expect(rows.some((r) => r?.includes(n))).toBe(true);
    const lic = (pkg: string) => JSON.parse(readFileSync(resolve(process.cwd(), "node_modules", pkg, "package.json"), "utf8")).license;
    expect(lic("lightweight-charts")).toBe("Apache-2.0");
    expect(lic("three")).toBe("MIT");
    for (const r of LICENCES) if (r.pkg) expect(r.licence).toBe(lic(r.pkg));
  });

  it("S2-03 / S2-05: TradingView attribution; external links open safely with an accessible hint", () => {
    const el = mount();
    const tv = [...el.querySelectorAll("a")].find((a) => a.textContent?.includes("Charts by TradingView"))!;
    expect(tv.getAttribute("href")).toBe("https://www.tradingview.com");
    for (const a of el.querySelectorAll("a[target]")) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.textContent).toContain("opens in a new tab");
    }
  });

  it("S2-04: integrity report links to /markets/MKT-08", () => {
    expect(mount().querySelector("[data-testid=about-integrity]")!.getAttribute("href")).toBe("/markets/MKT-08");
  });

  it("S2-07: copy puts the exact version on the clipboard; button has aria-label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const el = mount();
    const btn = el.querySelector<HTMLButtonElement>("[data-testid=about-copy]")!;
    expect(btn.getAttribute("aria-label")).toBeTruthy();
    await act(async () => { btn.click(); });
    expect(writeText).toHaveBeenCalledWith(el.querySelector("[data-testid=about-version]")!.textContent);
  });

  it("Studio #38: external links carry the 12 px external glyph after the label, plus sr-only text", () => {
    const a = mount().querySelector("a[target]")!;
    const g = a.querySelector("[data-testid=ext-glyph] svg")!;
    expect(g.getAttribute("width")).toBe("12");
    expect(g.getAttribute("data-glyph")).toBe("external");
    expect(a.querySelector(".sr-only")!.textContent).toContain("opens in a new tab");
    expect(a.lastElementChild!.className).toBe("sr-only");
  });

  it("FR strings render", () => {
    expect(mount("fr").textContent).toContain("Licences");
  });
});
