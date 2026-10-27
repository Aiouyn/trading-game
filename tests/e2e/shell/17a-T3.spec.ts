import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot, bootPaused } from "./helpers";

// 17A T3: TickRing + MarketPhase (T3-01..T3-07). Screenshots go to the repo dir only (CI-safe).
const SHOTS = "tests/e2e/shell/__screenshots__/17a/T3";
const PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
const DAY = 38 * 720;
const desktopOnly = (name: string) => test.skip(name !== "desktop", "1440×900 desktop only");
const phoneOnly = (name: string) => test.skip(name !== "phone", "390×844 phone only");

async function shot(page: Page, name: string, selector: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  await page.locator(selector).screenshot({ path: `${SHOTS}/${name}-${vp.width}x${vp.height}.png`, animations: "allow" });
}
const probe = (page: Page, value: string) => page.evaluate((v) => {
  const e = document.createElement("i"); e.style.color = v; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c;
}, value);
const setPalette = (page: Page, p: string) => page.evaluate((v) => { document.documentElement.dataset.palette = v; }, p);

test("T3-01 sweep restarts within one frame of each tick; with ticks stopped 12 s it holds full and never loops", async ({ page }, info) => {
  desktopOnly(info.project.name);
  // Measured in animation time from the TICK itself (QA #18 r3), not from the sweep's DOM insertion:
  // a test-side init script (registered after page.clock.install, so it wraps the FAKE setInterval; no production
  // hook) wraps the shell's 5 s clock-channel interval. When armed, it starts a probe Web Animation synchronously in
  // the tick's own task, before the channel update runs. A pending animation's startTime resolves to the timeline
  // time of the first frame rendered after it was created, so probe.startTime = the first frame after the tick.
  // The i-th new sweep's Animation.startTime is then compared with the i-th tick probe.
  //
  // Limit 0.5 ms: timeline times are frame-quantized (all animations made pending in the same task start in the
  // same frame and get the identical startTime), so a sweep that starts in the first frame after its tick gives
  // exactly 0, whatever the load (a slow frame delays probe and sweep alike). Any later start is a whole frame or
  // more: +16.7 ms at 60 Hz, +4.2 ms even at 240 Hz. 0.5 ms only absorbs float rounding, so "≤ one frame after
  // the tick" (Studio) passes and one extra frame — late remount OR late animation start — fails.
  await bootPaused(page, "/", undefined, () => page.addInitScript(() => {
    const w = window as unknown as { __tickArmed: boolean; __tickProbes: Animation[] };
    w.__tickArmed = false; w.__tickProbes = [];
    const orig = window.setInterval;
    (window as unknown as { setInterval: unknown }).setInterval = (cb: TimerHandler, ms?: number, ...rest: unknown[]) => {
      if (ms !== 5000 || typeof cb !== "function") return orig(cb, ms, ...rest);
      return orig(() => {
        if (w.__tickArmed) {
          const el = document.createElement("i"); el.style.cssText = "position:fixed;width:0;height:0;"; document.documentElement.append(el);
          w.__tickProbes.push(el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 60_000 }));
        }
        (cb as (...a: unknown[]) => void)(...rest);
      }, ms);
    };
  }));
  await page.evaluate(() => {
    const w = window as unknown as { __tickArmed: boolean; __sweepStarts: (number | null)[] };
    w.__sweepStarts = [];
    const fEl = document.createElement("i"); fEl.style.cssText = "position:fixed;width:0;height:0;"; document.documentElement.append(fEl);
    // Next rendered frame without rAF (faked by page.clock): a fresh animation's ready resolves on it.
    const nextFrame = () => { const f = fEl.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1000 }); return f.ready.then(() => f.cancel()); };
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if ((n as Element).classList?.contains("tickring-sweep")) {
        const i = w.__sweepStarts.push(null) - 1;
        const a = (n as Element).getAnimations()[0]!;
        // Snapshot startTime as soon as the sweep is running (a held sweep has none yet; a removed one goes idle).
        void (async () => {
          for (let k = 0; k < 30 && !(a.playState === "running" && a.startTime != null); k++) await nextFrame();
          w.__sweepStarts[i] = a.startTime as number;
        })();
      }
    }).observe(document.querySelector("[data-testid=tickring]")!, { childList: true, subtree: true });
    w.__tickArmed = true;
  });
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate((n) => (window as unknown as { __sweepStarts: (number | null)[] }).__sweepStarts.filter((v) => v != null).length >= n, i + 1)).toBe(true);
  }
  const { ticks, restarts, late } = await page.evaluate(() => {
    const w = window as unknown as { __tickProbes: Animation[]; __sweepStarts: number[] };
    return { ticks: w.__tickProbes.length, restarts: w.__sweepStarts.length, late: w.__sweepStarts.map((t, i) => t - (w.__tickProbes[i]!.startTime as number)) };
  });
  expect([ticks, restarts]).toEqual([3, 3]);
  console.log(`T3-01 tick→sweep start (ms): ${late.map((l) => l.toFixed(3)).join(", ")}`);
  for (const l of late) expect(l).toBeLessThanOrEqual(0.5);
  await page.evaluate(() => (window as unknown as { __tickProbes: Animation[] }).__tickProbes.forEach((a) => a.cancel()));
  // No more ticks: 12 s of real time. The sweep is not replaced, finishes, and holds full.
  await page.waitForTimeout(12_000);
  const held = await page.evaluate(() => {
    const s = document.querySelector(".tickring-sweep")!;
    return { restarts: (window as unknown as { __sweepStarts: unknown[] }).__sweepStarts.length, state: s.getAnimations()[0]?.playState, offset: getComputedStyle(s).strokeDashoffset, iter: getComputedStyle(s).animationIterationCount };
  });
  expect(held).toEqual({ restarts: 3, state: "finished", offset: "0px", iter: "1" });
});

test("T3-02 sweep = --fg-muted, track = --line, never --acc, in all 4 palettes", async ({ page }) => {
  await boot(page, "/");
  const ring = page.locator("[data-testid=strip] [data-testid=tickring], [data-testid=tickring]").first();
  test.skip(!(await ring.count()), "no ring on this viewport");
  for (const p of PALETTES) {
    await setPalette(page, p);
    const v = await page.evaluate(() => ({ sweep: getComputedStyle(document.querySelector(".tickring-sweep")!).stroke, track: getComputedStyle(document.querySelector(".tickring-track")!).stroke }));
    expect([p, v.sweep, v.track]).toEqual([p, await probe(page, "var(--fg-muted)"), await probe(page, "var(--line)")]);
    expect(v.sweep).not.toBe(await probe(page, "var(--acc)"));
  }
});

test("T3-03 reconnecting: dashed 2 2 in --fg-faint; halted: --steel pause glyph, no sweep", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/?conn=reconnecting");
  const rec = await page.evaluate(() => { const t = getComputedStyle(document.querySelector(".tickring-track")!); return { dash: t.strokeDasharray, stroke: t.stroke, sweeps: document.querySelectorAll(".tickring-sweep").length }; });
  expect(rec).toEqual({ dash: "2px, 2px", stroke: await probe(page, "var(--fg-faint)"), sweeps: 0 });
  await shot(page, "strip-reconnecting", ".strip-mid");
  await boot(page, "/?halted=1");
  const h = await page.evaluate(() => ({ pause: getComputedStyle(document.querySelector(".tickring-pause")!).stroke, sweeps: document.querySelectorAll(".tickring-sweep").length, dot: getComputedStyle(document.querySelector("[data-testid=phase] .mp-dot")!).borderLeftColor, label: document.querySelector("[data-testid=phase-label]")!.textContent }));
  expect(h).toEqual({ pause: await probe(page, "var(--steel)"), sweeps: 0, dot: await probe(page, "var(--steel)"), label: "Trading halted · Port Avalon" });
  await shot(page, "strip-halted", ".strip-mid");
});

test("T3-04 reduced motion: sweep steps(5, end) over 5000 ms; every other duration is 0", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
  const v = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".tickring-sweep")!);
    const others = [...document.querySelectorAll(".strip-mid *, [data-testid=phase] *")].filter((e) => !e.classList.contains("tickring-sweep"))
      .map((e) => getComputedStyle(e)).filter((c) => c.transitionDuration.split(", ").some((d) => d !== "0s") || c.animationDuration.split(", ").some((d) => d !== "0s"));
    return { tf: s.animationTimingFunction, dur: s.animationDuration, others: others.length };
  });
  expect(v).toEqual({ tf: "steps(5)", dur: "5s", others: 0 });
  await page.waitForTimeout(2500);
  await shot(page, "strip-reduced-motion", ".strip-mid");
});

test("T3-05 MarketPhase: desktop label + dot token per phase; phone dot only with aria-label", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const cases = [["pre", "Pre-market", "--fg-faint"], ["open_auction", "Opening auction", "--warn"], ["continuous", "Market open", "--gain"], ["close_auction", "Closing auction", "--warn"], ["after", "After hours", "--fg-faint"], ["weekend", "Weekend", "--fg-faint"]] as const;
  for (const [phase, label, token] of cases) {
    await boot(page, `/?phase=${phase}`);
    const el = page.getByTestId("phase");
    const dot = await el.locator(".mp-dot").evaluate((d) => getComputedStyle(d).backgroundColor);
    expect([phase, dot]).toEqual([phase, await probe(page, `var(${token})`)]);
    if (phone) {
      await expect(page.getByTestId("phase-dot")).toHaveAttribute("aria-label", `${label} · Port Avalon`);
      expect((await el.innerText()).trim()).toBe("");
    } else {
      await expect(page.getByTestId("phase-label")).toHaveText(`${label} · Port Avalon`);
      if (["pre", "continuous", "close_auction", "weekend"].includes(phase)) { await page.waitForTimeout(1500); await shot(page, `strip-phase-${phase}`, ".strip-mid"); }
    }
  }
  if (phone) {
    await boot(page, "/");
    await shot(page, "statusbar-running", "[data-testid=statusbar]");
    await boot(page, "/?conn=reconnecting");
    await shot(page, "statusbar-reconnecting", "[data-testid=statusbar]");
  } else {
    await boot(page, "/");
    await page.waitForTimeout(2500);
    await shot(page, "strip-running", ".strip-mid");
    await setPalette(page, "broadsheet");
    await shot(page, "strip-running-broadsheet", ".strip-mid");
  }
});

test("T3-05 phase change cross-fades the label over --dur-base (0 under reduced motion)", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await bootPaused(page, `/?tick=${DAY + 284}`);
  await expect(page.getByTestId("phase-label")).toHaveText("Pre-market · Port Avalon");
  await page.clock.runFor(5000);
  await expect(page.getByTestId("phase-label")).toHaveText("Market open · Port Avalon");
  const d = await page.evaluate(() => [".mp-in", ".mp-out"].map((s) => getComputedStyle(document.querySelector(s)!).animationDuration));
  expect(d).toEqual(["0.22s", "0.22s"]);
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".mp-in")!).animationDuration)).toBe("0s");
});

// Root cause of the intermittent S1-19 / C4 axe colour-contrast failures: the label also played its 220 ms fade-in when
// it first mounted, and axe ran right after quay-ready, often inside that fade (axe blends opacity into the colour:
// 1.41:1 at 5 %, 3.87:1 at 20 %). Only a phase change cross-fades. Deterministic: any mp-fade-in present after boot
// is frozen at 5 % before axe runs, so a mount fade fails every time instead of on timing luck.
test("T3-05 initial phase label does not fade in on mount (axe never sees it mid-fade)", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.addInitScript(() => {
    const w = window as Window & { __mpFades?: string[] };
    w.__mpFades = [];
    document.addEventListener("animationstart", (e) => { if (e.animationName === "mp-fade-in") w.__mpFades!.push((e.target as Element).textContent ?? ""); }, true);
  });
  for (const path of ["/", "/markets", "/?conn=reconnecting"]) {
    await boot(page, path);
    const frozen = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === "mp-fade-in").map((a) => {
      a.pause(); a.currentTime = Number(a.effect!.getComputedTiming().duration) * 0.05; return (a.effect as KeyframeEffect).target!.textContent;
    }));
    const r = await new AxeBuilder({ page }).include("[data-testid=phase]").withRules(["color-contrast"]).analyze();
    const fades = await page.evaluate(() => (window as Window & { __mpFades?: string[] }).__mpFades);
    expect([path, frozen, fades, await page.getByTestId("phase-label").evaluate((e) => getComputedStyle(e).opacity), r.violations.map((v) => v.id)])
      .toEqual([path, [], [], "1", []]);
  }
});

test("T3-06 nothing flashes more than once per second (opacity sampled per frame for 10 s)", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  const flips = await page.evaluate(() => new Promise<number>((done) => {
    let last: string | null = null, n = 0; const t0 = performance.now();
    const step = () => {
      const els = [...document.querySelectorAll(".tickring-sweep, .tickring-track, [data-testid=phase] *")];
      const key = els.map((e) => (parseFloat(getComputedStyle(e).opacity) >= 0.5 ? "1" : "0")).join("");
      if (last !== null && key !== last) n++;
      last = key;
      if (performance.now() - t0 < 10_000) requestAnimationFrame(step); else done(n);
    };
    requestAnimationFrame(step);
  }));
  // Each flash is two flips; at most 10 flashes in 10 s.
  expect(flips).toBeLessThanOrEqual(20);
});

test("C3 T3 DOM identical across palettes (running, reconnecting, halted)", async ({ page }) => {
  for (const q of ["/", "/?conn=reconnecting", "/?halted=1"]) {
    await boot(page, q);
    const doms: string[] = [];
    for (const p of PALETTES) { await setPalette(page, p); doms.push(await page.getByTestId("phase").evaluate((e) => e.outerHTML) + (await page.locator("[data-testid=tickring]").evaluateAll((r) => r.map((x) => x.outerHTML.replace(/ style="[^"]*"/g, "")).join("")))); }
    for (const d of doms) expect([q, d]).toEqual([q, doms[0]]);
  }
});

test("C4 axe: running, reconnecting, halted, each screenshot phase", async ({ page }) => {
  for (const q of ["/", "/?conn=reconnecting", "/?halted=1", "/?phase=pre", "/?phase=close_auction", "/?phase=weekend"]) {
    await boot(page, q);
    const res = await new AxeBuilder({ page }).include("[data-testid=phase]").analyze();
    expect([q, res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)]).toEqual([q, []]);
  }
});

test("C5/C7: T3 adds no interactive elements; no backdrop-filter under reduced transparency", async ({ page }) => {
  await boot(page, "/");
  expect(await page.evaluate(() => document.querySelectorAll("[data-testid=phase] :is(button,a,input,[role=button]), [data-testid=tickring] :is(button,a,input,[role=button])").length)).toBe(0);
  await page.evaluate(() => { document.documentElement.dataset.transparency = "reduce"; });
  expect(await page.evaluate(() => [...document.querySelectorAll("[data-testid=phase], [data-testid=phase] *, [data-testid=tickring], [data-testid=tickring] *")].filter((e) => { const b = getComputedStyle(e).backdropFilter; return b && b !== "none"; }).length)).toBe(0);
});

test("C8 text scale 2.0 at 390: status bar has no horizontal scroll and the phase dot stays visible", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/");
  await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  const sb = (await page.getByTestId("statusbar").boundingBox())!;
  const dot = (await page.getByTestId("phase").boundingBox())!;
  expect(dot.x + dot.width).toBeLessThanOrEqual(sb.x + sb.width);
  expect(dot.width).toBeGreaterThan(0);
});

test("Studio T3: desktop reconnecting shows 'Reconnecting… · Port Avalon' with a dashed --fg-faint dot", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/?conn=reconnecting");
  await expect(page.getByTestId("phase-label")).toHaveText("Reconnecting… · Port Avalon");
  const d = await page.locator("[data-testid=phase] .mp-dot").evaluate((e) => { const c = getComputedStyle(e); return { style: c.borderTopStyle, color: c.borderTopColor }; });
  expect(d).toEqual({ style: "dashed", color: await probe(page, "var(--fg-faint)") });
  await shot(page, "strip-reconnecting", ".strip-mid");
});

test("Studio T3: phone has no tick ring; the dot carries halted (steel pause bars) and reconnecting (dashed) with full aria-label", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/");
  expect(await page.locator("[data-testid=statusbar] [data-testid=tickring]").count()).toBe(0);
  await boot(page, "/?halted=1");
  const dot = page.getByTestId("phase-dot");
  await expect(dot).toHaveAttribute("aria-label", "Trading halted · Port Avalon");
  const h = await dot.evaluate((e) => { const c = getComputedStyle(e); return { l: c.borderLeftStyle, r: c.borderRightStyle, t: c.borderTopWidth, bg: c.backgroundColor, color: c.borderLeftColor }; });
  expect(h).toEqual({ l: "solid", r: "solid", t: "0px", bg: "rgba(0, 0, 0, 0)", color: await probe(page, "var(--steel)") });
  await shot(page, "statusbar-halted", "[data-testid=statusbar]");
  await boot(page, "/?conn=reconnecting");
  await expect(dot).toHaveAttribute("aria-label", "Reconnecting… · Port Avalon");
  expect(await dot.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe("dashed");
});

test("Studio T3: phase changes are always announced via a polite live region (not the initial phase)", async ({ page }) => {
  await bootPaused(page, `/?tick=${DAY + 284}`);
  const live = page.getByTestId("phase-live");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText("");
  await page.clock.runFor(5000);
  await expect(live).toHaveText("Market open · Port Avalon");
});
