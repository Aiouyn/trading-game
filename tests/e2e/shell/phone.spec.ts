import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { boot, box } from "./helpers";

test.beforeEach(({}, info) => test.skip(info.project.name !== "phone", "phone project only"));

test("S1-13 phone home: status bar 44, 4-col 60×60 grid, 5 groups, bottom row, no h-scroll at 1.0 and 2.0", async ({ page }) => {
  await boot(page, "/?rank=R6&nw=200000&flags=charter.anyAvailable,api.eligible&day=3&guest=0&lic=LIC2");
  expect((await box(page, "statusbar")).height).toBe(44);
  const labels = await page.locator(".grid-group > .label").allInnerTexts();
  expect(labels.map((l) => l.toLowerCase())).toEqual(["trade", "build", "shadow", "world", "me"]);
  const icon = await page.getByTestId("app-grid").locator(".icon").first().boundingBox();
  expect([icon?.width, icon?.height]).toEqual([60, 60]);
  const cols = await page.getByTestId("group-build").locator(".grid4").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(4);
  const bottom = await page.getByTestId("bottom-row").locator("[data-testid^=icon-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(bottom).toEqual(["icon-broker", "icon-portfolio", "icon-wire", "icon-messages"]);
  for (const id of ["broker", "portfolio", "wire", "messages"]) await expect(page.getByTestId("app-grid").getByTestId(`icon-${id}`)).toHaveCount(0);
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && Array.from(document.querySelectorAll("*")).every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5));
  expect(await noHScroll()).toBe(true);
  // Text scale 2.0: double every computed font size.
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("body *"));
    const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    els.forEach((e, i) => (e.style.fontSize = `${sizes[i] * 2}px`));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("S1-13 grid groups hold only apps of that group", async ({ page }) => {
  await boot(page, "/?rank=R6&nw=200000");
  const map = await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid^=group-]")).map((g) => [g.getAttribute("data-testid"), Array.from(g.querySelectorAll("[data-testid^=icon-]")).map((i) => i.getAttribute("data-testid"))]));
  expect(map).toEqual([
    ["group-trade", ["icon-markets", "icon-risk", "icon-quantlab", "icon-research"]],
    ["group-build", ["icon-businesses", "icon-company", "icon-property", "icon-city", "icon-bank", "icon-funds", "icon-insurance", "icon-institutions"]],
    ["group-shadow", ["icon-ailab", "icon-security", "icon-legal"]],
    ["group-world", ["icon-boards", "icon-alliance", "icon-contracts", "icon-auctions", "icon-civic", "icon-replay"]],
    ["group-me", ["icon-estate", "icon-profile", "icon-academy", "icon-help", "icon-atelier", "icon-settings"]],
  ]);
});

test("S1-07 phone: ComingLater full screen and deep link", async ({ page }) => {
  await boot(page);
  await page.getByTestId("icon-markets").click();
  await expect(page.getByTestId("coming-later")).toHaveText(/Markets\s*Coming later/);
  await boot(page, "/wire");
  await expect(page.getByTestId("coming-later")).toHaveText(/Wire\s*Coming later/);
});

test("S1-14 long-press 400 ms on the Quay mark opens Recent with ≤ 6 entries", async ({ page }) => {
  await boot(page);
  for (const id of ["markets", "wire", "broker", "portfolio", "messages", "bank", "funds", "insurance"]) {
    await page.getByTestId(`icon-${id}`).click();
    await page.getByRole("button", { name: "Back" }).click();
  }
  const mark = await box(page, "quay-mark");
  await page.mouse.move(mark.x + 10, mark.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await expect(page.getByTestId("recent")).toBeVisible();
  await page.mouse.up();
  const n = await page.getByTestId("recent-item").count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(6);
});

test("S1-19 axe: phone home, launcher, ComingLater", async ({ page }) => {
  for (const [path, launcher] of [["/", false], ["/", true], ["/markets", false]] as const) {
    await boot(page, path);
    if (launcher) {
      const sb = await box(page, "statusbar");
      await page.mouse.move(sb.x + 200, sb.y + 20);
      await page.mouse.down();
      await page.mouse.move(sb.x + 200, sb.y + 120, { steps: 4 });
      await page.mouse.up();
      await expect(page.getByTestId("launcher")).toBeVisible();
    }
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id), path).toEqual([]);
  }
});
