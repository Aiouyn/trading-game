import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { boot } from "./helpers";

// Touch follow-up (Studio post-#14 rulings + queued items). Screenshots: repo dir only (CI-safe).
const SHOTS = "tests/e2e/shell/__screenshots__/17a/touch";
async function shot(page: Page, name: string, selector?: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  const path = `${SHOTS}/${name}-${vp.width}x${vp.height}.png`;
  if (selector) await page.locator(selector).first().screenshot({ path }); else await page.screenshot({ path });
}
async function touchDesktop(browser: Browser, path = "/wire") {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  await boot(page, path);
  return { ctx, page };
}
const ring = (page: Page) => page.evaluate(() => { const e = document.createElement("i"); e.style.boxShadow = "var(--focus-ring)"; document.body.append(e); const v = getComputedStyle(e).boxShadow; e.remove(); return v; });
const desktopOnly = (name: string) => test.skip(name !== "desktop", "desktop project drives its own touch context");

test("(a) touch focus ring sits on the visible glyph for Notifications and window controls; Notifications ring stays on screen", async ({ browser }, info) => {
  desktopOnly(info.project.name);
  const { ctx, page } = await touchDesktop(browser);
  const want = await ring(page);
  for (const sel of ["[data-testid=strip] .icon-btn", "[data-testid=win-wire] [data-testid=win-close]", "[data-testid=win-wire] .tb-controls button >> nth=0"]) {
    const el = page.locator(sel).first();
    await el.focus();
    const v = await el.evaluate((n) => {
      const svg = n.querySelector("svg")!, r = svg.getBoundingClientRect(), b = n.getBoundingClientRect();
      return { visible: n.matches(":focus-visible"), own: getComputedStyle(n).boxShadow, outline: getComputedStyle(n).outlineStyle, glyph: getComputedStyle(svg).boxShadow, ringLeft: r.left - 4, ringRight: r.right + 4, ringTop: r.top - 4, hitW: b.width, vw: innerWidth };
    });
    expect([sel, v.visible, v.own, v.outline, v.glyph]).toEqual([sel, true, "none", "none", want]);
    expect(v.hitW).toBeGreaterThanOrEqual(44);
    expect(v.ringLeft).toBeGreaterThanOrEqual(0);
    expect(v.ringRight).toBeLessThanOrEqual(v.vw);
    expect(v.ringTop).toBeGreaterThanOrEqual(0);
  }
  await page.locator("[data-testid=strip] .icon-btn").focus();
  await shot(page, "focus-notifications-touch", "[data-testid=strip]");
  await page.getByTestId("win-close").first().focus();
  await shot(page, "focus-win-close-touch", "[data-testid=win-wire] .titlebar");
  await ctx.close();
});

test("(c) touch workspace slots ws-1 and ws-2 are 44 wide", async ({ browser }, info) => {
  desktopOnly(info.project.name);
  const { ctx, page } = await touchDesktop(browser, "/");
  for (const id of ["ws-1", "ws-2"]) expect([id, (await page.getByTestId(id).boundingBox())!.width]).toEqual([id, 44]);
  await ctx.close();
});

test("(d) touch shelf tiles: 40×40 visible, 44 px hit area, edge to edge, no overlap", async ({ browser }, info) => {
  desktopOnly(info.project.name);
  const { ctx, page } = await touchDesktop(browser, "/");
  const r = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll(".shelf-tiles .tile")];
    const clip = document.querySelector(".shelf-tiles")!.getBoundingClientRect();
    const rows = tiles.map((t) => {
      const b = t.getBoundingClientRect(), c = getComputedStyle(t);
      const bw = parseFloat(c.borderLeftWidth);
      return { id: t.getAttribute("data-testid"), l: Math.max(b.left, clip.left), r: Math.min(b.right, clip.right), w: b.width, h: b.height, vw: b.width - 2 * bw, vh: b.height - 2 * bw, locked: t.classList.contains("locked"), clipBg: c.backgroundClip };
    });
    const small = rows.filter((x) => x.w < 43.5 || x.h < 43.5).map((x) => x.id);
    const visibleWrong = rows.filter((x) => !x.locked && (x.vw !== 40 || x.vh !== 40)).map((x) => `${x.id} ${x.vw}x${x.vh}`);
    const overlaps: string[] = [];
    const shown = rows.filter((x) => x.r - x.l > 0);
    for (let i = 1; i < shown.length; i++) if (shown[i].l < shown[i - 1].r - 0.5) overlaps.push(`${shown[i - 1].id}×${shown[i].id}`);
    return { small, visibleWrong, overlaps, clip: [...new Set(rows.map((x) => x.clipBg))] };
  });
  expect(r).toEqual({ small: [], visibleWrong: [], overlaps: [], clip: ["padding-box"] });
  await shot(page, "shelf-tiles-touch", "[data-testid=shelf]");
  await ctx.close();
});

test("(e) touch taps at y 40–48 on a window's title-bar controls and title reach the window, not the launcher", async ({ browser }, info) => {
  desktopOnly(info.project.name);
  const { ctx, page } = await touchDesktop(browser, "/");
  const top = (await page.getByTestId("win-wire").boundingBox())!.y;
  expect(top).toBeLessThanOrEqual(42);
  for (const y of [40, 44, 48]) {
    // Title text (window content of the title bar): focuses the window, never opens the launcher.
    const name = (await page.getByTestId("win-wire").locator(".tb-name").boundingBox())!;
    await page.touchscreen.tap(name.x + 10, Math.max(y, top + 1));
    await expect(page.getByTestId("launcher")).toHaveCount(0);
    await expect(page.getByTestId("win-wire")).toHaveClass(/active/);
  }
  for (const y of [40, 44, 48]) {
    const fill = (await page.getByTestId("win-wire").locator(".tb-controls button").nth(0).boundingBox())!;
    await page.touchscreen.tap(fill.x + fill.width / 2, y);
    await expect(page.getByTestId("launcher")).toHaveCount(0);
    await page.touchscreen.tap(fill.x + fill.width / 2, y); // collapse toggles back
  }
  const close = (await page.getByTestId("win-wire").getByTestId("win-close").boundingBox())!;
  await page.touchscreen.tap(close.x + close.width / 2, 44);
  await expect(page.getByTestId("launcher")).toHaveCount(0);
  await expect(page.getByTestId("win-wire")).toHaveCount(0);
  await ctx.close();
});

test("(b) ruling 4 guard: chips use the --line border; outline colours the border (acc included)", async ({ page }) => {
  await page.goto("/__ds");
  await expect(page.getByTestId("ds-ready")).toBeVisible();
  const v = await page.evaluate(() => {
    const probe = (x: string) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
    const b = (sel: string) => getComputedStyle(document.querySelector(sel)!).borderTopColor;
    return { acc: b("[data-testid=ds-chip-acc]"), gain: b("[data-testid=ds-chip-gain]"), line: probe("var(--line)"), accOutline: b(".chip-outline.chip-acc"), accVar: probe("var(--acc)"), accText: getComputedStyle(document.querySelector("[data-testid=ds-chip-acc]")!).color };
  });
  expect(v.acc).toBe(v.line);
  expect(v.gain).toBe(v.line);
  expect(v.accOutline).toBe(v.accVar);
  expect(v.accText).toBe(v.accVar);
});

test("phone: shots of home and shelf-equivalent bottom row", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  await boot(page, "/");
  await shot(page, "phone-home");
});

test("City error state: centred block, muted message, --fg Retry 8 px below, ≥44 touch hit, no 'View as table' yet", async ({ browser }, info) => {
  const phone = info.project.name === "phone";
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await boot(page, "/city?city=fail");
  await expect(page.getByTestId("city-error")).toHaveText("Couldn't load the city");
  const v = await page.evaluate(() => {
    const probe = (x: string) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
    const body = document.querySelector("[data-testid=city-body]")!.getBoundingClientRect();
    const msg = document.querySelector("[data-testid=city-error]")!, btn = document.querySelector("[data-testid=city-retry]")!;
    const m = msg.getBoundingClientRect(), b = btn.getBoundingClientRect();
    return { mid: (m.top + b.bottom) / 2 - (body.top + body.bottom) / 2, hmid: (m.left + m.right) / 2 - (b.left + b.right) / 2,
      gap: b.top - m.bottom, msg: getComputedStyle(msg).color, btn: getComputedStyle(btn).color, muted: probe("var(--fg-muted)"), fg: probe("var(--fg)"), h: b.height, w: b.width };
  });
  expect(Math.abs(v.mid)).toBeLessThanOrEqual(1);
  expect(Math.abs(v.hmid)).toBeLessThanOrEqual(1);
  expect(Math.round(v.gap)).toBe(8);
  expect([v.msg, v.btn]).toEqual([v.muted, v.fg]);
  if (phone) { expect(v.h).toBeGreaterThanOrEqual(44); expect(v.w).toBeGreaterThanOrEqual(44); }
  await expect(page.getByText("View as table")).toHaveCount(0);
  await shot(page, "city-error");
  await ctx.close();
});

// #19 QA: Retry must be reachable by a REAL pointer click (1440) and a REAL touch tap (390): the error layer stacks
// above the canvas mount and the mount never intercepts. No force:true, no dispatchEvent.
for (const mode of ["click-1440", "tap-390"] as const) {
  test(`City Retry: real ${mode} re-creates the renderer (error layer above the mount)`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "each case drives its own context");
    const tap = mode === "tap-390";
    const ctx = await browser.newContext(tap ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await boot(page, "/city?city=fail");
    const retry = page.getByTestId("city-retry");
    await expect(page.getByTestId("city-error")).toHaveText("Couldn't load the city");
    // Hit test at the button's centre lands on Retry itself, not the city mount.
    const top = await retry.evaluate((b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === b || b.contains(e); });
    expect(top).toBe(true);
    // Let the next attempt succeed: drop the failure hook from the URL (the click/tap itself stays real).
    await page.evaluate(() => history.replaceState(null, "", location.pathname));
    if (tap) await retry.tap(); else await retry.click();
    await expect(page.getByTestId("city-error")).toHaveCount(0);
    await expect(page.getByTestId("city-retry")).toHaveCount(0);
    await expect(page.locator("[data-testid=city-mount] canvas")).toHaveCount(1, { timeout: 15_000 });
    await ctx.close();
  });
}
