import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

// 17A T6: shell mount points for Banner, WorldEventBanner and Sheet, fed by the typed (mock) feed.
const SHOTS = "tests/e2e/shell/__screenshots__/17a/T6";
const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop only");
async function shot(page: Page, name: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}x${vp.height}.png` });
}
const axe = async (page: Page, label: string) => {
  const r = await new AxeBuilder({ page }).analyze();
  expect([label, r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)]).toEqual([label, []]);
};

test("T6-01 no feed → both slots closed (0 px); desktop unchanged", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  for (const id of ["alert-slot", "world-slot"]) expect((await page.getByTestId(id).boundingBox())?.height ?? 0).toBe(0);
});

test("T6-02 feed → one P0 banner (second queued, malformed dropped) + world banner, stacked under the strip", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  const top0 = (await page.getByTestId("desktop").boundingBox())!.y;
  await boot(page, "/?alerts=p0,p0b,bad&world=crash");
  await expect(page.getByTestId("alert-banner")).toHaveCount(1);
  await expect(page.getByTestId("alert-banner")).toHaveAttribute("data-priority", "P0");
  await expect(page.getByTestId("alert-slot")).toHaveAttribute("data-queued", "1");
  await expect(page.getByTestId("alert-banner")).not.toContainText("malformed");
  await expect(page.getByTestId("world-banner")).toHaveAttribute("aria-label", "● CRASH · DAY 3 · GX \u221218.40% since it began · Today \u22122.10%");
  const strip = (await page.getByTestId("strip").boundingBox())!;
  const a = (await page.getByTestId("alert-banner").boundingBox())!;
  const w = (await page.getByTestId("world-banner").boundingBox())!;
  expect([Math.round(a.y), Math.round(w.y), a.height, w.height]).toEqual([Math.round(strip.y + strip.height), Math.round(a.y + 34), 34, 34]);
  expect(Math.round((await page.getByTestId("desktop").boundingBox())!.y - top0)).toBe(68);
  // Banners never cover a window title bar.
  const below = a.y + a.height + w.height;
  const tops = await page.locator(".win").evaluateAll((ws) => ws.map((e) => e.getBoundingClientRect().top));
  for (const t of tops) expect(t).toBeGreaterThanOrEqual(below - 0.5);
  await shot(page, "banners-shell");
  await axe(page, "banners-shell");
  await expect(page.getByTestId("alert-banner").getByRole("link")).toHaveAttribute("href", "/risk");
});

test("T6-03 shell Sheet mount: opens on the right (desktop) / bottom (phone), Esc closes", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await boot(page, "/?sheet=demo");
  const sheet = page.getByTestId("shell-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveClass(new RegExp(`qs-${phone ? "bottom" : "right"}`));
  await page.waitForTimeout(300);
  await shot(page, "sheet-shell");
  await axe(page, "sheet-shell");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

const phoneOnly = (n: string) => test.skip(n !== "phone", "phone only");
const rectOf = (page: Page, id: string) => page.getByTestId(id).first().evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);

test("T6-05 alert link uses the shell deep-link handling (opens / focuses the window, no page navigation)", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await boot(page, "/?alerts=p1b");
  const url = page.url();
  await page.evaluate(() => { (window as Window & { __mark?: number }).__mark = 1; });
  await page.getByTestId("alert-banner").getByRole("link").click();
  if (phone) await expect(page.locator("#phone-app-title")).toHaveText("Markets");
  else await expect.poll(async () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".win:not([hidden])")].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex)).at(-1)?.dataset.testid)).toBe("win-markets");
  expect(await page.evaluate(() => (window as Window & { __mark?: number }).__mark)).toBe(1); // same document
  void url;
});

test("T6-06 phone stack: P0 → error → world order, max 2, +N opens the alerts sheet; banners push content down", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/");
  const y0 = (await rectOf(page, "widget")).y;
  await boot(page, "/?alerts=p0,p1&load=fail&world=crash");
  await expect(page.getByTestId("load-error")).toBeVisible();
  const stack = page.getByTestId("phone-stack");
  await expect(stack).toHaveAttribute("data-count", "2");
  const sb = await rectOf(page, "statusbar");
  const al = await rectOf(page, "alert-banner");
  const ld = await rectOf(page, "phone-banner");
  expect(Math.round(al.y)).toBe(Math.round(sb.y + sb.height));
  expect(ld.y).toBeGreaterThanOrEqual(al.y + al.height - 0.5);
  await expect(page.getByTestId("world-banner")).toHaveCount(0);
  await expect(page.getByTestId("alert-banner")).toHaveAttribute("data-priority", "P0");
  const more = page.getByTestId("banner-more");
  await expect(more).toHaveText("+2"); // world + queued P1
  const mb = (await more.boundingBox())!;
  expect([mb.width >= 44, mb.height >= 44]).toEqual([true, true]);
  await page.waitForTimeout(200);
  const y1 = (await rectOf(page, "widget")).y;
  expect(y1 - y0).toBeGreaterThanOrEqual(al.height + ld.height - 1);
  await shot(page, "phone-stack-more");
  await axe(page, "phone-stack");
  await more.click();
  await expect(page.getByTestId("alerts-sheet")).toBeVisible();
  await expect(page.getByTestId("alerts-sheet")).toHaveClass(/qs-bottom/);
  await expect(page.getByTestId("alerts-item")).toHaveCount(4); // 2 alerts + error + world
  // Studio 08:31: order P0 → error → world → rest; leading glyph column on every row; Retry on the right of the error row.
  expect(await page.getByTestId("alerts-item").evaluateAll((li) => li.map((e) => (e as HTMLElement).dataset.kind + ((e as HTMLElement).dataset.priority ?? "")))).toEqual(["alertP0", "load", "world", "alertP1"]);
  expect(await page.getByTestId("alerts-item").evaluateAll((li) => li.map((e) => !!e.firstElementChild?.matches("[data-testid=row-glyph]")))).toEqual([true, true, true, true]);
  const loss = await page.evaluate(() => { const p = document.createElement("i"); p.style.color = "var(--loss)"; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; });
  const p0Row = page.locator("[data-testid=alerts-item][data-priority=P0] [data-testid=row-glyph]");
  await expect(p0Row.locator("svg")).toHaveCount(1);
  expect(await p0Row.evaluate((e) => getComputedStyle(e).color)).toBe(loss);
  expect(await page.getByTestId("alert-icon").first().evaluate((e) => getComputedStyle(e).color)).toBe(loss);
  await expect(page.locator("[data-testid=alerts-item][data-kind=world] .row-text")).not.toContainText("●");
  const loadRow = page.locator("[data-testid=alerts-item][data-kind=load]");
  const retry = page.getByTestId("sheet-retry");
  await expect(retry).toHaveText("Retry");
  const [lr, rr] = [(await loadRow.boundingBox())!, (await retry.boundingBox())!];
  expect(lr.x + lr.width - (rr.x + rr.width)).toBeLessThan(4); // right-aligned like the other rows' actions
  expect(rr.height).toBeGreaterThanOrEqual(44);
  const before = await page.evaluate(() => (window as Window & { __quayRetries?: () => number }).__quayRetries?.() ?? -1);
  await retry.click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __quayRetries?: () => number }).__quayRetries?.() ?? -1)).toBeGreaterThan(before);
  await page.waitForTimeout(300);
  await shot(page, "phone-alerts-sheet");
  await page.keyboard.press("Escape");
  await boot(page, "/?world=crash");
  await expect(page.getByTestId("phone-stack")).toHaveAttribute("data-count", "1");
  expect((await rectOf(page, "widget")).y).toBeGreaterThan(y0);
});

test("T6-07 desktop: banners shrink the workspace; maximized and tiled refit, floating moves down only as needed", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  const before = await page.locator(".win").evaluateAll((ws) => ws.map((e) => ({ id: (e as HTMLElement).dataset.testid, ...e.getBoundingClientRect().toJSON() })));
  await boot(page, "/?alerts=p0&world=crash");
  const strip = await rectOf(page, "strip");
  const bannersBottom = strip.y + strip.height + 68;
  const shelf = await page.getByTestId("shelf").evaluate((e) => e.getBoundingClientRect().top);
  // Tiled (default Trade layout panes): all below the banners, bottoms still above the shelf.
  const tiled = await page.locator(".win").evaluateAll((ws) => ws.map((e) => ({ id: (e as HTMLElement).dataset.testid, ...e.getBoundingClientRect().toJSON() })));
  for (const t of tiled) { expect(t.top).toBeGreaterThanOrEqual(bannersBottom); expect(t.bottom).toBeLessThanOrEqual(shelf + 0.5); }
  expect(tiled.find((t) => t.id === "win-broker")!.height).toBeLessThan(before.find((t) => t.id === "win-broker")!.height);
  await shot(page, "desk-tiled-banners");
  // Maximized: Fill → exactly the shrunk area.
  await page.getByTestId("win-broker").getByRole("button", { name: "Fill" }).click();
  const max = await rectOf(page, "win-broker");
  expect(max.top).toBeGreaterThanOrEqual(bannersBottom);
  expect(max.bottom).toBeLessThanOrEqual(shelf + 0.5);
  expect(max.bottom).toBeGreaterThan(shelf - 20);
  await shot(page, "desk-maximized-banners");
  // Floating: drag Wire's title bar to the top; it keeps its size and sits just below the banners.
  const wire = page.getByTestId("win-wire");
  const w0 = await rectOf(page, "win-wire");
  const tb = (await wire.locator(".titlebar").boundingBox())!;
  await page.mouse.move(tb.x + 60, tb.y + 10); await page.mouse.down(); await page.mouse.move(tb.x + 60 - 300, 0, { steps: 6 }); await page.mouse.up();
  const w1 = await rectOf(page, "win-wire");
  expect(w1.top).toBeGreaterThanOrEqual(bannersBottom);
  expect(w1.top).toBeLessThan(bannersBottom + 20);
  // Keeps its stored size (no banner rescale once floating): same width, height not reduced.
  expect(Math.round(w1.width)).toBe(Math.round(w0.width));
  expect(w1.height).toBeGreaterThanOrEqual(w0.height - 0.5);
  await shot(page, "desk-floating-banners");
});
