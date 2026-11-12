import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop only");
const topWin = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[role=dialog][data-testid^=win-]")].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex)).at(-1)?.dataset.testid);
const overlaps = (page: Page) => page.evaluate(() => {
  const s = document.querySelector("[data-testid=win-settings]");
  const g = document.querySelector("[data-testid=pf-goal]");
  if (!s || !g) return false;
  const a = s.getBoundingClientRect(), b = g.getBoundingClientRect();
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
});

// Playtest e30f6822 d08: after Create account, Settings must not stay on top of the goal/guide.
test("after sign-up, Settings closes so the goal/guide is visible", async ({ page, baseURL }, info) => {
  desktopOnly(info.project.name);
  test.setTimeout(90_000);
  await boot(page, "/");
  await page.waitForFunction(() => document.querySelector("[data-testid=sign-in-entry]"));
  await page.evaluate(() => (document.querySelector("[data-testid=sign-in-entry]") as HTMLElement).click());
  await expect(page.getByTestId("settings-account")).toBeVisible({ timeout: 20_000 });
  const handle = `Sg${Date.now().toString(36)}`;
  await page.locator("input[name=handle]").fill(handle);
  await page.locator("input[name=password]").fill("local-tick-test");
  await page.getByRole("button", { name: "Create account" }).last().click();
  // Settings closes on a successful sign-up, so wait for the window to go and Sign in to leave the strip.
  const err = page.getByTestId("account-error");
  const closed = page.getByTestId("win-settings").waitFor({ state: "hidden", timeout: 20_000 }).then(() => "closed" as const);
  const failed = err.waitFor({ state: "visible", timeout: 20_000 }).then(() => "error" as const);
  const result = await Promise.race([closed, failed]);
  if (result === "error") throw new Error("register failed: " + await err.innerText());
  await expect(page.getByTestId("win-settings")).toHaveCount(0);
  await expect(page.getByTestId("pf-goal")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("pf-guide")).toBeVisible();
  expect(await overlaps(page)).toBe(false);
  expect(await topWin(page)).not.toBe("win-settings");

  await page.goto(baseURL ? new URL("/", baseURL).toString() : "/");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await expect(page.getByTestId("win-settings")).toHaveCount(0);
  await expect(page.getByTestId("pf-goal")).toBeVisible({ timeout: 20_000 });
  expect(await overlaps(page)).toBe(false);
  expect(await topWin(page)).not.toBe("win-settings");
});

test("phone: after sign-up, Settings closes and home shows the goal", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  test.setTimeout(90_000);
  await boot(page, "/");
  await page.waitForFunction(() => document.querySelector("[data-testid=sign-in-entry]"));
  await page.evaluate(() => (document.querySelector("[data-testid=sign-in-entry]") as HTMLElement).click());
  await expect(page.getByTestId("phone-appview")).toHaveAttribute("data-app", "settings", { timeout: 20_000 });
  await expect(page.getByTestId("settings-account")).toBeVisible();
  const handle = `SgP${Date.now().toString(36)}`;
  await page.locator("input[name=handle]").fill(handle);
  await page.locator("input[name=password]").fill("local-tick-test");
  await page.getByRole("button", { name: "Create account" }).last().click();
  const err = page.getByTestId("account-error");
  const home = page.getByTestId("phone-goal").waitFor({ state: "visible", timeout: 20_000 }).then(() => "home" as const);
  const failed = err.waitFor({ state: "visible", timeout: 20_000 }).then(() => "error" as const);
  const result = await Promise.race([home, failed]);
  if (result === "error") throw new Error("register failed: " + await err.innerText());
  await expect(page.getByTestId("phone-appview")).toHaveCount(0);
  await expect(page.getByTestId("phone-goal")).toHaveText("Goal: grow $10,000 to $20,000.");
  await expect(page.getByTestId("phone-first-trade-guide")).toBeVisible();
});
