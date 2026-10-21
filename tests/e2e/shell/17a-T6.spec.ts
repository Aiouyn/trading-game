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

test("T6-02 feed → one P0 banner (second queued, malformed dropped) + world banner, stacked under the strip, desktop pushed down", async ({ page }, info) => {
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

test("T6-04 phone: no desktop banner slots on the phone home (placement pending Studio)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await boot(page, "/?alerts=p0&world=crash");
  await expect(page.getByTestId("alert-banner")).toHaveCount(0);
  await shot(page, "home-feed");
});
