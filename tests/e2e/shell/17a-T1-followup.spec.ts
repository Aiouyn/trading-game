import { copyFileSync, mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Studio T1 rulings 1, 2, 5, 7, 8 (/workspace/specs/17A-T1-studio-rulings.md) on the /__ds sheet.
const SHOTS = "tests/e2e/shell/__screenshots__/17a/T1-followup";
const EXTRA = "/workspace/avalon/front-dev-shots/17a-t1-followup";

async function ds(page: Page, palette = "ink-brass") {
  await page.goto(`/__ds?palette=${palette}`);
  await expect(page.getByTestId("ds-ready")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.palette)).toBe(palette);
}
const resolve = (page: Page, value: string, inShadow = false) => page.evaluate(([v, sh]) => {
  const el = document.createElement("div");
  el.style.color = v as string;
  ((sh ? document.querySelector("[data-subpalette=shadow]") : document.querySelector(".ds")) as HTMLElement).appendChild(el);
  const out = getComputedStyle(el).color;
  el.remove();
  return out;
}, [value, inShadow] as const);
const css = (page: Page, id: string, prop: string) => page.getByTestId(id).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
async function shot(page: Page, name: string, target?: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true }); mkdirSync(EXTRA, { recursive: true });
  const path = `${SHOTS}/${name}-${vp.width}x${vp.height}.png`;
  if (target) await page.getByTestId(target).screenshot({ path }); else await page.screenshot({ path });
  copyFileSync(path, `${EXTRA}/${name}-${vp.width}x${vp.height}.png`);
}

test("Ruling 1: hover and pressed per variant, 120 ms (0 under reduced motion), pressed never moves", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "pointer hover");
  await ds(page);
  const cases: [string, string | null, string | null, string | null][] = [
    // [variant, hover bg, pressed bg, hover border]
    ["primary", "color-mix(in oklab, var(--acc) 90%, var(--fg))", "color-mix(in oklab, var(--acc) 88%, var(--bg0))", null],
    ["secondary", "var(--win2)", "var(--line)", "var(--fg-muted)"],
    ["icon", "var(--win2)", "var(--line)", null],
    ["ghost", null, null, null],
  ];
  for (const [v, hover, pressed, border] of cases) {
    const id = `ds-btn-base-${v}-md`;
    await page.mouse.move(0, 0);
    const rest = await css(page, id, "background-color");
    const box = (await page.getByTestId(id).boundingBox())!;
    expect([v, await css(page, id, "transition-duration")]).toEqual([v, "0.12s, 0.12s, 0.12s"]);
    await page.getByTestId(id).hover();
    await page.waitForTimeout(200);
    expect([v, "hover", await css(page, id, "background-color")]).toEqual([v, "hover", hover ? await resolve(page, hover) : rest]);
    if (border) expect(await css(page, id, "border-top-color")).toBe(await resolve(page, border));
    if (v === "secondary" || v === "primary") await shot(page, `btn-${v}-hover`, "ds-buttons-base");
    await page.mouse.down();
    await page.waitForTimeout(200);
    expect([v, "pressed", await css(page, id, "background-color")]).toEqual([v, "pressed", pressed ? await resolve(page, pressed) : rest]);
    expect(await css(page, id, "transform")).toBe("none");
    expect(await page.getByTestId(id).boundingBox()).toEqual(box);
    if (v === "secondary" || v === "primary") await shot(page, `btn-${v}-pressed`, "ds-buttons-base");
    await page.mouse.up();
  }
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
  expect(await css(page, "ds-btn-base-primary-md", "transition-duration")).toMatch(/^0s(, 0s)*$/);
});

test("Ruling 2: disabled primary is win2 + line border + fg-disabled (also in Shadow)", async ({ page }) => {
  await ds(page);
  for (const [id, sh] of [["ds-btn-base-primary-disabled", false], ["ds-btn-shadow-primary-disabled", true]] as const) {
    expect([id, await css(page, id, "background-color"), await css(page, id, "border-top-color"), await css(page, id, "color")])
      .toEqual([id, await resolve(page, "var(--win2)", sh), await resolve(page, "var(--line)", sh), await resolve(page, "var(--fg-disabled)", sh)]);
  }
  await shot(page, "btn-disabled-primary", "ds-buttons-base");
});

test("Ruling 5: touch long-press shows the full value; a normal tap does not; lift + 1.5 s or next tap closes", async ({ browser }, info) => {
  const phone = info.project.name === "phone";
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  await ds(page);
  const host = page.getByTestId("ds-money-chip-1050000000").locator(".money-tip-wrap");
  const tip = page.getByTestId("money-tip");
  const ev = (type: string) => host.dispatchEvent(type, { pointerType: "touch", isPrimary: true, bubbles: true });
  await expect(host.locator("[role=img]")).toHaveAttribute("aria-label", /1,050,000,000/);
  await ev("pointerdown"); await page.waitForTimeout(200); await ev("pointerup");
  await page.waitForTimeout(500);
  await expect(tip).toHaveCount(0);
  await ev("pointerdown"); await page.waitForTimeout(650);
  await expect(tip).toHaveText("$1,050,000,000.00");
  await host.scrollIntoViewIfNeeded();
  await shot(page, "money-longpress-tip");
  await ev("pointerup");
  await page.waitForTimeout(1000);
  await expect(tip).toBeVisible();
  await page.waitForTimeout(800);
  await expect(tip).toHaveCount(0);
  await ev("pointerdown"); await page.waitForTimeout(650); await ev("pointerup");
  await expect(tip).toBeVisible();
  await ev("pointerdown");
  await expect(tip).toHaveCount(0);
  await ctx.close();
});

test("Ruling 7: estimated negative keeps loss; estimated zero is muted", async ({ page }) => {
  await ds(page);
  const neg = page.getByTestId("ds-money-estimated-neg").locator("[role=img]");
  await expect(neg).toHaveText("≈−$1,284.10");
  expect(await neg.evaluate((e) => getComputedStyle(e).color)).toBe(await resolve(page, "var(--loss)"));
  const zero = page.getByTestId("ds-money-estimated-zero").locator("[role=img]");
  expect(await zero.evaluate((e) => getComputedStyle(e).color)).toBe(await resolve(page, "var(--fg-muted)"));
  await page.getByTestId("ds-money-estimated-neg").scrollIntoViewIfNeeded();
  await shot(page, "money-estimated-negative");
});

test("Ruling 8: colour-blind Broadsheet uses #08657A / #A8235A; dark palettes keep the cb pair", async ({ page }) => {
  for (const [pal, gain, loss] of [["broadsheet", "rgb(8, 101, 122)", "rgb(168, 35, 90)"], ["ink-brass", "rgb(92, 225, 230)", "rgb(255, 92, 138)"]]) {
    await ds(page, pal);
    await page.evaluate(() => { document.documentElement.dataset.cb = "1"; });
    expect([pal, await resolve(page, "var(--gain)"), await resolve(page, "var(--loss)")]).toEqual([pal, gain, loss]);
    if (pal === "broadsheet") await shot(page, "cb-broadsheet");
  }
});
