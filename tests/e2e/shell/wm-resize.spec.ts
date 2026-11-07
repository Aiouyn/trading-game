// Owner request 2026-11-07: every desktop window resizes from its edges and corners like a real desktop, at 1024×768 and
// 1440×900; the size survives a reload; the Broker reflows with its window (chart takes the height, nothing clipped);
// phone (390) keeps full-screen apps with no handles. Real pointer drags and keys on the production build.
// Shots: WM_SHOTS_DIR (default: the test's output folder). Repo browser evidence only, not a desktop play session.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { boot } from "./helpers";

const win = (page: Page) => page.getByTestId("win-broker").first();
const rectOf = async (l: Locator) => { const b = (await l.boundingBox())!; return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
const workTop = 34 + 8; // strip + gutter (wm.workArea, no banners)

async function shot(page: Page, name: string) {
  const dir = process.env.WM_SHOTS_DIR ?? test.info().outputPath("shots");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const b = (await handle.boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}
const handle = (page: Page, edge: string) => win(page).locator(`[data-edge="${edge}"]`);
/** Every Broker control that must stay usable: visible and fully inside the window frame horizontally. */
async function expectControlsInside(page: Page, label: string) {
  const w = await rectOf(win(page));
  for (const id of ["br-side-buy", "br-side-sell", "br-type-market", "br-type-limit", "br-qty", "br-review"]) {
    const c = win(page).getByTestId(id).first();
    await expect(c, `${label} ${id}`).toBeVisible();
    const b = await rectOf(c);
    expect(b.x, `${label} ${id} left`).toBeGreaterThanOrEqual(w.x);
    expect(b.x + b.w, `${label} ${id} right`).toBeLessThanOrEqual(w.x + w.w);
  }
  const overflowX = await win(page).locator(".win-body").evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(overflowX, `${label} no sideways scroll`).toBeLessThanOrEqual(0);
}
const chartBox = (page: Page) => win(page).locator(".br-chart-box");

for (const vp of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test(`WM-R1 ${vp.width}x${vp.height}: edges and corners resize the Broker; limits hold; the size survives a reload`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop windows only");
    await page.setViewportSize(vp);
    await boot(page, "/broker");
    await expect(win(page).getByTestId("broker")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    const tag = `${vp.width}x${vp.height}`;
    await shot(page, `${tag}-0-open`);

    // All eight handles exist, each with its resize cursor.
    const cursors = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
    for (const [edge, cursor] of Object.entries(cursors)) {
      await expect(handle(page, edge)).toHaveCount(1);
      expect(await handle(page, edge).evaluate((e) => getComputedStyle(e).cursor), edge).toBe(cursor);
    }

    // Start from a known floating rect: shrink with the corner, then move it to the middle.
    await drag(page, handle(page, "se"), -2000, -2000);
    let r = await rectOf(win(page));
    expect([r.w, r.h]).toEqual([520, 420]); // Broker minimum (registry)
    await expectControlsInside(page, `${tag} at minimum`);
    await shot(page, `${tag}-1-minimum`);
    const tb = win(page).locator(".titlebar");
    const t0 = (await tb.boundingBox())!;
    await page.mouse.move(t0.x + 100, t0.y + 10); await page.mouse.down();
    await page.mouse.move(t0.x + 100 + 150, t0.y + 10 + 60, { steps: 6 }); await page.mouse.up();
    r = await rectOf(win(page));

    // Each edge moves only its own side.
    await drag(page, handle(page, "e"), 120, 0);
    let n = await rectOf(win(page));
    expect([n.x, n.y, n.w, n.h]).toEqual([r.x, r.y, r.w + 120, r.h]); r = n;
    await drag(page, handle(page, "s"), 0, 80);
    n = await rectOf(win(page));
    expect([n.x, n.y, n.w, n.h]).toEqual([r.x, r.y, r.w, r.h + 80]); r = n;
    await drag(page, handle(page, "w"), -60, 0);
    n = await rectOf(win(page));
    expect([n.x, n.y, n.w, n.h]).toEqual([r.x - 60, r.y, r.w + 60, r.h]); r = n;
    await drag(page, handle(page, "n"), 0, -30);
    n = await rectOf(win(page));
    expect([n.x, n.y, n.w, n.h]).toEqual([r.x, r.y - 30, r.w, r.h + 30]); r = n;
    await drag(page, handle(page, "nw"), -20, -10);
    n = await rectOf(win(page));
    expect([n.x, n.y, n.w, n.h]).toEqual([r.x - 20, r.y - 10, r.w + 20, r.h + 10]); r = n;

    // Limits: dragging past the screen stops at the work area; the title bar and its controls stay reachable.
    await drag(page, handle(page, "ne"), 3000, -3000);
    n = await rectOf(win(page));
    expect(n.y).toBe(workTop);
    expect(n.x + n.w).toBeLessThanOrEqual(vp.width - 8);
    await expect(win(page).getByTestId("win-close")).toBeInViewport();
    await drag(page, handle(page, "sw"), -3000, 3000);
    n = await rectOf(win(page));
    expect(n.x).toBeGreaterThanOrEqual(8);
    expect(n.y + n.h).toBeLessThanOrEqual(vp.height - 52 - 8); // above the shelf
    await expectControlsInside(page, `${tag} large`);

    // The chart takes the window's height and its canvas follows the box.
    const big = await rectOf(chartBox(page));
    await expect.poll(async () => (await rectOf(win(page).locator(".br-chart-box canvas").first())).w).toBeGreaterThan(big.w - 80);
    await shot(page, `${tag}-2-large`);
    await drag(page, handle(page, "s"), 0, -200);
    const smaller = await rectOf(chartBox(page));
    // 1440×900 has spare height for the chart; at 1024×768 a full-height Broker already sits at the 240 px chart minimum.
    if (vp.height >= 900) expect(smaller.h).toBeLessThan(big.h); else expect(smaller.h).toBeLessThanOrEqual(big.h);
    expect(smaller.h).toBeGreaterThanOrEqual(240);

    // Keyboard: Ctrl Shift arrows resize the active window by 32 px.
    r = await rectOf(win(page));
    await win(page).locator(".tb-name").click();
    await page.keyboard.press("Control+Shift+ArrowLeft");
    await expect.poll(async () => (await rectOf(win(page))).w).toBe(r.w - 32);
    await page.keyboard.press("Control+Shift+ArrowUp");
    await expect.poll(async () => (await rectOf(win(page))).h).toBe(r.h - 32);
    r = await rectOf(win(page));

    // Reload: the same rect comes back (device-local IndexedDB).
    await page.evaluate(() => (window as Window & { __quayFlush?: () => Promise<void> }).__quayFlush?.());
    await page.reload();
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await expect.poll(async () => rectOf(win(page))).toEqual(r);
    await shot(page, `${tag}-3-after-reload`);

    // Maximised: fills the work area; dragging an edge from there leaves Fill and resizes from the maximised rect.
    await win(page).getByRole("button", { name: /fill|maximi/i }).click();
    n = await rectOf(win(page));
    expect([n.x, n.y, n.w]).toEqual([8, workTop, vp.width - 16]);
    await drag(page, handle(page, "e"), -200, 0);
    const un = await rectOf(win(page));
    expect([un.x, un.y, un.w, un.h]).toEqual([n.x, n.y, n.w - 200, n.h]);
  });
}

test("WM-R1 every other desktop window resizes from its edges too (Wire, Portfolio)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop windows only");
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const app of ["wire", "portfolio"]) {
    await boot(page, `/${app}`);
    const w = page.getByTestId(`win-${app}`).first();
    const r = await rectOf(w);
    const h = w.locator('[data-edge="w"]');
    const b = (await h.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 4 }); await page.mouse.up();
    const n = await rectOf(w);
    expect([n.x, n.w], app).toEqual([r.x + 40, r.w - 40]);
  }
});

test("WM-R1 phone 390: apps stay full screen with no resize handles", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await boot(page, "/broker");
  await expect(page.getByTestId("broker").first()).toBeVisible();
  await expect(page.locator("[data-edge]")).toHaveCount(0);
  const b = (await page.getByTestId("broker").first().boundingBox())!;
  expect(Math.round(b.width)).toBeGreaterThanOrEqual(390 - 2 * 16); // full width inside the phone padding
  await shot(page, "390x844-broker");
});
