import { mkdirSync, copyFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

// 17A T2: window chrome, strip, shelf, tiles, glyphs (T2-01..T2-04, T2-06, T2-07, C3–C9).
const PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
const SHOTS = "tests/e2e/shell/__screenshots__/17a/T2";
const EXTRA = process.env.SHOTS_COPY_DIR;
const desktopOnly = (name: string) => test.skip(name !== "desktop", "1440×900 desktop only");
const phoneOnly = (name: string) => test.skip(name !== "phone", "390×844 phone only");

async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  const file = `${name}-${vp.width}x${vp.height}.png`;
  await page.waitForTimeout(250); // let 120 ms hover/banner transitions settle
  await page.screenshot({ path: `${SHOTS}/${file}`, fullPage: opts.fullPage });
  if (EXTRA) { mkdirSync(EXTRA, { recursive: true }); copyFileSync(`${SHOTS}/${file}`, `${EXTRA}/${file}`); }
}

/** Resolve `var(--x)` to a computed colour. */
const token = (page: Page, name: string) => page.evaluate((n) => {
  const el = document.createElement("i");
  el.style.color = `var(--${n})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
}, name);

async function setPalette(page: Page, p: string) {
  await page.evaluate((v) => { document.documentElement.dataset.palette = v; }, p);
  await page.waitForTimeout(200); // colour transitions are 120 ms
}

test("T2-01 strip 34 / shelf 52; Quay mark --fg; no brass in strip or shelf except rank chip and fresh dot", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/?rank=R2");
  expect((await page.getByTestId("strip").boundingBox())!.height).toBe(34);
  expect((await page.getByTestId("shelf").boundingBox())!.height).toBe(52);
  const fg = await token(page, "fg");
  expect(await page.locator(".strip .brand > .fg").evaluate((el) => getComputedStyle(el).color)).toBe(fg);
  for (const p of PALETTES) {
    await setPalette(page, p);
    const acc = await token(page, "acc");
    const brass = await page.evaluate((a) => [...document.querySelectorAll(".strip *, .shelf *")]
      .filter((el) => !el.closest(".chip-acc") && !el.classList.contains("fresh-dot"))
      .filter((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor, s.borderTopColor, s.borderBottomColor].includes(a); })
      .map((el) => el.className.toString()), acc);
    expect([p, brass]).toEqual([p, []]);
  }
  await shot(page, "home-r2");
});

test("T2-02 active window: no brass edge, title bar 32, controls ≥28 pointer", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/wire");
  await page.getByTestId("tile-portfolio").click();
  const win = page.getByTestId("win-portfolio");
  await expect(win).toHaveClass(/active/);
  const acc = await token(page, "acc");
  const r = await win.evaluate((el) => {
    const s = getComputedStyle(el), b = getComputedStyle(el, "::before"), a = getComputedStyle(el, "::after");
    return { top: s.borderTopColor, before: b.content, after: a.content, bar: el.querySelector(".titlebar")!.getBoundingClientRect().height,
      controls: [...el.querySelectorAll(".tb-controls button")].map((c) => [c.getBoundingClientRect().width, c.getBoundingClientRect().height]) };
  });
  expect(r.top).not.toBe(acc);
  expect([r.before, r.after]).toEqual(["none", "none"]);
  expect(r.bar).toBe(32);
  for (const [w, h] of r.controls) { expect(w).toBeGreaterThanOrEqual(28); expect(h).toBeGreaterThanOrEqual(28); }
  await shot(page, "windows-active-inactive");
});

test("T2-02 window controls are 44×44 under hasTouch", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  await boot(page, "/wire");
  const sizes = await page.locator(".tb-controls button").evaluateAll((bs) => bs.map((b) => [b.getBoundingClientRect().width, b.getBoundingClientRect().height]));
  expect(sizes.length).toBe(3);
  for (const [w, h] of sizes) expect([w, h]).toEqual([44, 44]);
  await ctx.close();
});

test("T2-03 locked shelf tile: 40 tall, Label-style --fg-muted tag, --fg-disabled glyph, tag ≥4.5:1 on --chrome", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/?rank=R1&nw=30000");
  const tile = page.locator(".shelf .tile.locked").first();
  expect((await tile.boundingBox())!.height).toBe(40);
  for (const p of PALETTES) {
    await setPalette(page, p);
    const [muted, disabled, chrome] = [await token(page, "fg-muted"), await token(page, "fg-disabled"), await token(page, "chrome")];
    const t = await tile.evaluate((el) => {
      const tag = getComputedStyle(el.querySelector(".lock-tag")!);
      return { size: parseFloat(tag.fontSize), upper: tag.textTransform, ls: parseFloat(tag.letterSpacing) / parseFloat(tag.fontSize), color: tag.color, glyph: getComputedStyle(el).color };
    });
    expect(t.size).toBeCloseTo(10.5, 1);
    expect(t.upper).toBe("uppercase");
    expect(t.ls).toBeCloseTo(0.14, 2);
    expect(t.color).toBe(muted);
    expect(t.glyph).toBe(disabled);
    const ratio = await page.evaluate(([a, b]) => {
      const lum = (c: string) => { const v = c.match(/\d+/g)!.slice(0, 3).map((x) => Number(x) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    }, [t.color, chrome]);
    expect([p, ratio >= 4.5]).toEqual([p, true]);
  }
  await setPalette(page, "ink-brass");
  await shot(page, "home-r1-locked");
});

test("T2-04 shelf tiles never intersect the tools at 1280, 1440, 1920", async ({ page }, info) => {
  desktopOnly(info.project.name);
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await boot(page, "/?rank=R6&nw=100000000");
    const hits = await page.evaluate(() => {
      const tools = document.querySelector(".shelf-tools")!.getBoundingClientRect();
      const row = document.querySelector(".shelf-tiles")!.getBoundingClientRect();
      return [...document.querySelectorAll(".shelf .tile")].map((t) => t.getBoundingClientRect())
        .filter((r) => r.right > row.left && r.left < row.right) // visible part of the clipped row
        .filter((r) => Math.min(r.right, row.right) > tools.left && r.left < tools.right).length;
    });
    expect([width, hits]).toEqual([width, 0]);
    if (width === 1280) await shot(page, "home-shelf-clip");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page, "/?rank=R6&nw=100000000");
  await page.getByTestId("shelf-tiles").evaluate((el) => { el.scrollLeft = el.scrollWidth; el.dispatchEvent(new Event("scroll")); });
  await shot(page, "shelf-scrolled-end");
});

test("T2-06 phone tile glyphs are never brass (all apps)", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/?rank=R6&nw=100000000");
  for (const p of PALETTES) {
    await setPalette(page, p);
    const acc = await token(page, "acc");
    const colours = await page.locator(".phone-app .icon").evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
    expect(colours.length).toBeGreaterThanOrEqual(30);
    expect(colours.filter((c) => c === acc)).toEqual([]);
  }
  const ds = await page.goto("/__ds");
  expect(ds!.ok()).toBe(true);
  const acc = await token(page, "acc");
  const sheet = await page.locator(".ds-glyph .tile-phone").evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
  expect(sheet).toHaveLength(32);
  expect(sheet.filter((c) => c === acc)).toEqual([]);
});

test("T2-07 focus mode: 24 px strip with exactly clock, tick ring and NW", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  await page.getByTestId("focus-btn").click();
  const strip = page.getByTestId("strip");
  expect((await strip.boundingBox())!.height).toBe(24);
  const kids = await strip.evaluate((el) => [...el.children].map((c) => (c.classList.contains("clock") ? "clock" : c.classList.contains("tickring") ? "tickring" : c.getAttribute("data-testid"))));
  expect(kids).toEqual(["clock", "tickring", "strip-nw"]);
  await shot(page, "focus-mode");
});

test("C3 home DOM identical across palettes", async ({ page }) => {
  await boot(page, "/?rank=R2");
  const doms: string[] = [];
  for (const p of PALETTES) { await setPalette(page, p); doms.push(await page.locator(".quay").evaluate((el) => el.outerHTML)); }
  for (const d of doms) expect(d).toBe(doms[0]);
});

test("C4 axe: home, R1 home, focus mode, Shadow window, ComingLater", async ({ page }, info) => {
  const routes = info.project.name === "phone" ? ["/?rank=R2", "/?rank=R1&nw=30000", "/markets"] : ["/?rank=R2", "/?rank=R1&nw=30000", "/ailab?nw=200000", "/markets"];
  for (const r of routes) {
    await boot(page, r);
    const res = await new AxeBuilder({ page }).analyze();
    expect([r, res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)]).toEqual([r, []]);
  }
});

test("C5 hit targets in strip, shelf and windows (pointer ≥28, touch ≥44)", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await boot(page, phone ? "/?rank=R2" : "/wire");
  const min = phone ? 44 : 28;
  // Known exceptions pending Studio (see PR): the 20 px workspace slots and the 24 px launcher field.
  const small = await page.evaluate((m) => [...document.querySelectorAll(".strip button, .shelf button, .win button, .statusbar button, .bottom-row button, .phone-app")]
    .filter((el) => !el.closest(".ws") && !el.classList.contains("launch-field"))
    .map((el) => ({ id: el.getAttribute("data-testid") ?? el.getAttribute("aria-label"), r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < m || r.height < m)).map(({ id, r }) => `${id} ${Math.round(r.width)}x${Math.round(r.height)}`), min);
  expect(small).toEqual([]);
});

test("C7 reduced motion → 0 ms in chrome; reduced transparency → opaque strip, no backdrop-filter", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/wire");
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; document.documentElement.dataset.transparency = "reduce"; });
  const bad = await page.evaluate(() => [...document.querySelectorAll(".strip, .strip *, .shelf, .shelf *, .win, .win *")]
    .filter((el) => !el.classList.contains("tickring-sweep"))
    .flatMap((el) => {
      const s = getComputedStyle(el);
      const d = [...s.transitionDuration.split(","), ...s.animationDuration.split(",")].some((x) => parseFloat(x) > 0);
      return [...(d ? [`${el.className} duration`] : []), ...(s.backdropFilter !== "none" ? [`${el.className} backdrop`] : [])];
    }));
  expect(bad).toEqual([]);
  expect(await page.getByTestId("strip").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await token(page, "chrome"));
});

test("C8 text scale 2.0 at 390: no horizontal scroll, NW not truncated", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/?rank=R2");
  await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
  const r = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    clipped: [...document.querySelectorAll(".money")].filter((m) => m.scrollWidth > m.clientWidth + 1).length,
  }));
  expect(r).toEqual({ page: 0, clipped: 0 });
});

test("C9 screenshots: Broadsheet home, AI Lab (Shadow), ComingLater, glyph sheet", async ({ page }, info) => {
  if (info.project.name === "desktop") {
    await boot(page, "/?rank=R2");
    await setPalette(page, "broadsheet");
    await shot(page, "home-broadsheet");
    await boot(page, "/ailab?nw=200000");
    await shot(page, "ailab-shadow");
  } else {
    await boot(page, "/?rank=R2");
    await shot(page, "phone-home-r2");
    await boot(page, "/?rank=R1&nw=30000");
    await shot(page, "phone-home-r1-locked");
    await boot(page, "/markets");
    await shot(page, "coming-later");
    await page.goto("/__ds");
    await page.evaluate(() => { document.body.style.overflow = "visible"; document.body.style.height = "auto"; document.documentElement.style.height = "auto"; (document.querySelector(".ds") as HTMLElement).style.height = "auto"; });
    await page.getByTestId("ds-glyphs").scrollIntoViewIfNeeded();
    const file = `glyphs-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png`;
    mkdirSync(SHOTS, { recursive: true });
    await page.getByTestId("ds-glyphs").screenshot({ path: `${SHOTS}/${file}` });
    if (EXTRA) copyFileSync(`${SHOTS}/${file}`, `${EXTRA}/${file}`);
  }
});

test("C9 glyph sheet at 1440", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.goto("/__ds");
  const file = `glyphs-1440x900.png`;
  mkdirSync(SHOTS, { recursive: true });
  await page.getByTestId("ds-glyphs").screenshot({ path: `${SHOTS}/${file}` });
  if (EXTRA) copyFileSync(`${SHOTS}/${file}`, `${EXTRA}/${file}`);
});
