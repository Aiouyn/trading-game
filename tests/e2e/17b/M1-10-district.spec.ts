// M1-10: City opens the static, read-only district view on the Financial Mile. The player reads landmarks by picking
// districts (pointer and keyboard), sees the read-only status, and returns to Broker. No canvas / WebGL, no city data
// request, no animation; fits 1440 and 1024 desktop, the City minimum window (560×400) and phone 390.
// Repo CI evidence (automation), not a human playtest.
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

const SHOTS = process.env.DISTRICT_SHOTS_DIR ?? "";
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
const overflowing = (page: Page, sel: string) => page.locator(sel).first().evaluate((root) =>
  [root, ...root.querySelectorAll("*")].filter((e) => !(e instanceof SVGElement) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible").map((e) => e.getAttribute("data-testid") ?? e.className).slice(0, 5));

for (const width of [1440, 1024] as const) {
  test(`desktop ${width}: City opens the Financial Mile read-only; keyboard picks a district; Back to Broker`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "desktop widths");
    const ctx = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 768 } });
    const page = await ctx.newPage();
    try {
      await boot(page, "/");
      const cityReq: string[] = [];
      page.on("request", (r) => { if (/\/city\//.test(new URL(r.url()).pathname)) cityReq.push(r.url()); });
      await page.getByTestId("tile-city").click();
      const win = page.getByTestId("win-city");
      await expect(win.getByTestId("city")).toBeVisible({ timeout: 20_000 });
      await expect(win.getByTestId("dv-name")).toHaveText("Financial Mile");
      await expect(win.getByTestId("dv-readonly")).toHaveText("Read-only view. Nothing here can be bought or changed.");
      await expect(win.getByTestId("dv-landmark")).toHaveText("Landmark: Port Avalon Exchange Building");
      await expect(win.locator('[data-testid="dv-marker"]')).toHaveCount(8);
      await expect(win.locator("canvas")).toHaveCount(0);
      // Every landmark label is readable: none overlaps another or leaves the map.
      const boxes = await win.locator(".dv-label").evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().toJSON() as DOMRect));
      const map = (await win.getByTestId("dv-map").boundingBox())!;
      for (const [i, a] of boxes.entries()) {
        expect(a.left >= map.x && a.right <= map.x + map.width, `label ${i} inside the map`).toBe(true);
        for (const b of boxes.slice(i + 1)) expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `labels ${i} overlap`).toBe(true);
      }
      expect(await win.getByTestId("city").evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
      expect(await overflowing(page, '[data-testid="win-city"] [data-testid="city"]')).toEqual([]);
      await shot(page, `d01-${width}-financial-mile`);

      // Keyboard: focus the first district button, Tab twice to Old Harbor, Enter.
      await win.locator('[data-testid="dv-pick"]').first().focus();
      await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
      await expect(win.locator('[data-testid="dv-pick"][data-id="dst_port_avalon_old_harbor"]')).toBeFocused();
      expect(await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return s.outlineStyle !== "none" || s.boxShadow !== "none"; })).toBe(true);
      await page.keyboard.press("Enter");
      await expect(win.getByTestId("dv-name")).toHaveText("Old Harbor");
      await expect(win.getByTestId("dv-landmark")).toHaveText("Landmark: Old Harbor Lighthouse");
      await expect(win.locator('[data-testid="dv-pick"][data-id="dst_port_avalon_old_harbor"]')).toHaveAttribute("aria-pressed", "true");
      await expect(win.locator('[data-testid="dv-marker"][data-on]')).toHaveAttribute("data-id", "dst_port_avalon_old_harbor");
      await shot(page, `d02-${width}-old-harbor`);

      // Back to Broker: this workspace's Broker comes to the front (no second one); City stays open.
      const brokers = await page.getByTestId("win-broker").count();
      await win.getByTestId("dv-back").click();
      await expect(page.getByTestId("win-broker")).toHaveCount(Math.max(brokers, 1));
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('[data-testid^="win-"]:not([data-testid="win-close"])')].map((e) => [e.getAttribute("data-testid"), Number(getComputedStyle(e).zIndex) || 0]))
        .then((ws) => ws.sort((a, b) => (a[1] as number) - (b[1] as number)).at(-1)![0])).toBe("win-broker");
      await expect(page.getByTestId("win-city")).toHaveCount(1);
      expect(cityReq).toEqual([]);
      await shot(page, `d03-${width}-back-to-broker`);
    } finally { await ctx.close(); }
  });
}

test("City minimum window 560×400: nothing overflows; every control reachable by scrolling the window", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop window");
  await boot(page, "/city");
  const win = page.getByTestId("win-city").first();
  await expect(win.getByTestId("city")).toBeVisible({ timeout: 20_000 });
  const h = (await win.getByTestId("resize-handle").boundingBox())!, box = (await win.boundingBox())!;
  await page.mouse.move(h.x + 5, h.y + 5); await page.mouse.down();
  await page.mouse.move(h.x + 5 - (box.width - 560), h.y + 5 - (box.height - 400), { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => { const b = (await win.boundingBox())!; return [Math.round(b.width), Math.round(b.height)]; }).toEqual([560, 400]);
  expect(await overflowing(page, '[data-testid="win-city"] [data-testid="city"]')).toEqual([]);
  await win.getByTestId("dv-back").scrollIntoViewIfNeeded();
  const bb = (await win.getByTestId("dv-back").boundingBox())!;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-testid]")?.getAttribute("data-testid"), [bb.x + bb.width / 2, bb.y + bb.height / 2])).toBe("dv-back");
  await shot(page, "d04-window-560x400");
});

test("phone 390: City opens the district view, no horizontal overflow, controls ≥44 and uncovered, Back to Broker pushes Broker", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page, "/");
  await page.getByTestId("icon-city").tap();
  const view = page.locator('[data-testid="phone-appview"][data-app="city"]');
  await expect(view.getByTestId("city")).toBeVisible({ timeout: 20_000 });
  await expect(view.getByTestId("dv-name")).toHaveText("Financial Mile");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await overflowing(page, '[data-testid="phone-appview"][data-app="city"] [data-testid="city"]')).toEqual([]);
  await shot(page, "d05-phone-390");
  await view.locator('[data-testid="dv-pick"][data-id="dst_port_avalon_glasshill"]').tap();
  await expect(view.getByTestId("dv-landmark")).toHaveText("Landmark: Glasshill Observatory");
  for (const sel of ['[data-testid="dv-pick"][data-id="dst_port_avalon_summit_estates_on_gilt_hill"]', '[data-testid="dv-back"]']) {
    const el = view.locator(sel);
    await el.scrollIntoViewIfNeeded();
    const b = (await el.boundingBox())!;
    expect(b.height, sel).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-testid]")?.getAttribute("data-testid"), [b.x + b.width / 2, b.y + b.height / 2]), sel).toBe(sel.includes("dv-back") ? "dv-back" : "dv-pick");
  }
  await shot(page, "d06-phone-390-glasshill");
  await view.getByTestId("dv-back").tap();
  await expect(page.getByTestId("app-title")).toHaveText("Broker");
  await expect(page.locator('[data-testid="phone-appview"][data-app="broker"]')).toHaveCount(1);
});
