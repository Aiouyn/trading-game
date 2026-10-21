import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

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
  // Fake timers, paused: the mock clock channel only ticks when the test advances it.
  await page.clock.install({ time: new Date("2026-10-21T08:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-21T08:00:00.010Z"));
  await boot(page, "/");
  await page.evaluate(() => {
    const w = window as unknown as { __restarts: number[]; __lag: number[] };
    w.__restarts = []; w.__lag = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if ((n as Element).classList?.contains("tickring-sweep")) {
        const added = document.timeline.currentTime as number;
        w.__restarts.push(added);
        const a = (n as Element).getAnimations()[0];
        void a.ready.then(() => w.__lag.push((a.startTime as number) - added));
      }
    }).observe(document.querySelector("[data-testid=tickring]")!, { childList: true, subtree: true });
  });
  for (let i = 0; i < 3; i++) { await page.clock.runFor(5000); await page.waitForTimeout(100); }
  const { restarts, lag } = await page.evaluate(() => { const w = window as unknown as { __restarts: number[]; __lag: number[] }; return { restarts: w.__restarts.length, lag: w.__lag }; });
  expect(restarts).toBe(3);
  for (const l of lag) expect(l).toBeLessThanOrEqual(17);
  // No more ticks: 12 s of real time. The sweep is not replaced, finishes, and holds full.
  await page.waitForTimeout(12_000);
  const held = await page.evaluate(() => {
    const s = document.querySelector(".tickring-sweep")!;
    return { restarts: (window as unknown as { __restarts: number[] }).__restarts.length, state: s.getAnimations()[0]?.playState, offset: getComputedStyle(s).strokeDashoffset, iter: getComputedStyle(s).animationIterationCount };
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
  const h = await page.evaluate(() => ({ pause: getComputedStyle(document.querySelector(".tickring-pause")!).stroke, sweeps: document.querySelectorAll(".tickring-sweep").length, dot: getComputedStyle(document.querySelector("[data-testid=phase] .mp-dot")!).backgroundColor, label: document.querySelector("[data-testid=phase-label]")!.textContent }));
  expect(h).toEqual({ pause: await probe(page, "var(--steel)"), sweeps: 0, dot: await probe(page, "var(--steel)"), label: "Halted · Port Avalon" });
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
      await expect(el).toHaveAttribute("aria-label", `${label} · Port Avalon`);
      expect(await el.innerText()).toBe("");
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
  await page.clock.install({ time: new Date("2026-10-21T08:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-21T08:00:00.010Z"));
  await boot(page, `/?tick=${DAY + 284}`);
  await expect(page.getByTestId("phase-label")).toHaveText("Pre-market · Port Avalon");
  await page.clock.runFor(5000);
  await expect(page.getByTestId("phase-label")).toHaveText("Market open · Port Avalon");
  const d = await page.evaluate(() => [".mp-in", ".mp-out"].map((s) => getComputedStyle(document.querySelector(s)!).animationDuration));
  expect(d).toEqual(["0.22s", "0.22s"]);
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".mp-in")!).animationDuration)).toBe("0s");
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
