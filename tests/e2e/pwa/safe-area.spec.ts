import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

async function applyStandin(page: Page, insets: { top?: number; right?: number; bottom?: number; left?: number }) {
  await page.evaluate((v) => {
    const s = document.documentElement.style;
    s.setProperty("--sa-top", `${v.top ?? 0}px`);
    s.setProperty("--sa-right", `${v.right ?? 0}px`);
    s.setProperty("--sa-bottom", `${v.bottom ?? 0}px`);
    s.setProperty("--sa-left", `${v.left ?? 0}px`);
  }, insets);
}

test("the served document asks for viewport-fit=cover, a translucent iOS status bar, and apple-mobile-web-app-capable", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toMatch(/viewport-fit=cover/);
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
});

test("the iOS status-bar style follows the palette: default on Broadsheet, black-translucent on Ink & Brass", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Appearance is pushed as a phone screen");
  await boot(page, "/settings");
  await page.getByTestId("set-nav-SET-02").click();
  await expect(page.getByTestId("palette-swatches")).toBeVisible();
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await page.getByTestId("swatch-broadsheet").click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "broadsheet");
  await expect.poll(async () => page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content")).toBe("default");
  await page.getByTestId("swatch-ink-brass").click();
  await expect.poll(async () => page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content")).toBe("black-translucent");
});

test("landscape 700×390 with 47 px side stand-ins: Sign in, tiles and the trade-bar box clear the sides", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone chrome only below 768");
  await page.setViewportSize({ width: 700, height: 390 });
  await boot(page, "/");
  await applyStandin(page, { left: 47, right: 47 });
  const limit = { left: 47, right: 700 - 47 };
  const signIn = page.getByTestId("sign-in-entry");
  await expect(signIn).toBeVisible();
  const signBox = (await signIn.boundingBox())!;
  expect(signBox.x).toBeGreaterThanOrEqual(limit.left);
  expect(signBox.x + signBox.width).toBeLessThanOrEqual(limit.right);
  const tile = (await page.locator(".phone-home .phone-app .icon").first().boundingBox())!;
  expect(tile.x).toBeGreaterThanOrEqual(limit.left);
  expect(tile.x + tile.width).toBeLessThanOrEqual(limit.right);
  await page.getByTestId("icon-broker").click();
  await expect(page.getByTestId("br-trade-bar")).toBeVisible();
  const bar = (await page.getByTestId("br-trade-bar").boundingBox())!;
  expect(bar.x).toBeGreaterThanOrEqual(limit.left);
  expect(bar.x + bar.width).toBeLessThanOrEqual(limit.right);
});

test("Recent empty state 'Nothing open yet.' clears a 34 px home-indicator stand-in", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Recent is the phone long-press sheet");
  await boot(page, "/");
  await applyStandin(page, { bottom: 34 });
  const mark = page.getByTestId("quay-mark");
  await mark.focus();
  await mark.dispatchEvent("pointerdown");
  await page.waitForTimeout(450);
  await mark.dispatchEvent("pointerup");
  await expect(page.getByTestId("recent")).toBeVisible();
  const line = page.getByText("Nothing open yet.");
  await expect(line).toBeVisible();
  const box = (await line.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844 - 34);
});
