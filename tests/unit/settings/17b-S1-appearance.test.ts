// @vitest-environment happy-dom
// 17B S1: applyAppearance (shell choice, fallback, R5 glass), mock shells, prefs persistence seam.
import { describe, expect, it } from "vitest";
import { applyAppearance, availableShells, effectiveShell } from "@/shell/appearance";
import type { RankChannel } from "@/shell/channels";
import { mockChannels } from "@/shell/mockChannels";
import { prefsClient } from "@/shell/prefs";
import { createShellStore, PREFS_ACCOUNT } from "@/shell/store";

const base = createShellStore(mockChannels(new URLSearchParams())).getState().prefs;
const rk = (rank: RankChannel["rank"], earned: string[], owned: string[] = []) =>
  ({ rank, shellsEarned: earned, shellsOwned: owned }) as Pick<RankChannel, "rank" | "shellsEarned" | "shellsOwned">;
const html = () => document.createElement("html");
const no = () => false;

describe("17B S1 appearance", () => {
  it("S1-06: mock ?shells / ?owned script the list; default is every rank shell to date", () => {
    const c = mockChannels(new URLSearchParams("rank=R3&shells=r0,r1,r2,r3,cosmetic_glass&owned=cosmetic_glass"));
    expect(availableShells(c.rank)).toEqual(["r0", "r1", "r2", "r3", "cosmetic_glass"]);
    expect(c.rank.shellsOwned).toEqual(["cosmetic_glass"]);
    expect(mockChannels(new URLSearchParams("rank=R2")).rank.shellsEarned).toEqual(["r0", "r1", "r2"]);
  });

  it("S1-06: a chosen earned shell wins over the rank shell; only one shell-* class", () => {
    const el = html();
    el.classList.add("shell-r3");
    applyAppearance(el, { palette: "ink-brass", prefs: { ...base, shell: "r1" }, rank: rk("R3", ["r0", "r1", "r2", "r3"]), media: no });
    expect([...el.classList]).toEqual(["shell-r1"]);
  });

  it("S1-06: a stale prefs.shell falls back to the rank shell", () => {
    expect(effectiveShell({ palette: "ink-brass", prefs: { ...base, shell: "r3" }, rank: rk("R1", ["r0", "r1"]), media: no })).toBe("r1");
  });

  it("R5 glass renders as R4 under reduced transparency (pref or system)", () => {
    const r5 = rk("R5", ["r0", "r1", "r2", "r3", "r4", "r5"]);
    expect(effectiveShell({ palette: "ink-brass", prefs: { ...base, shell: "r5" }, rank: r5, media: no })).toBe("r5");
    expect(effectiveShell({ palette: "ink-brass", prefs: { ...base, shell: "r5", reducedTransparency: "on" }, rank: r5, media: no })).toBe("r4");
    expect(effectiveShell({ palette: "ink-brass", prefs: { ...base, shell: "r5" }, rank: r5, media: (q) => q.includes("transparency") })).toBe("r4");
  });

  it("applies data-palette, hc, cb, motion and --text-scale", () => {
    const el = html();
    applyAppearance(el, { palette: "broadsheet", prefs: { ...base, highContrast: true, colorBlindPair: true, reducedMotion: "on", textScale: 1.5 }, rank: rk("R0", ["r0"]), media: no });
    expect(el.dataset).toMatchObject({ palette: "broadsheet", hc: "1", cb: "1", motion: "reduce" });
    expect(el.style.getPropertyValue("--text-scale")).toBe("1.5");
  });

  it("S1-05: setPrefs goes to prefsClient; the palette never does", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.getState().setPalette("riviera");
    store.getState().setPrefs({ highContrast: true });
    await new Promise((r) => setTimeout(r, 0));
    const saved = prefsClient.memo.get(PREFS_ACCOUNT)!;
    expect(saved.highContrast).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("riviera");
    expect(Object.keys(saved)).not.toContain("palette");
  });
});
