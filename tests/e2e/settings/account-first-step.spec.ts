import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const shots = process.env.ACCOUNT_FIRST_STEP_SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
}
const account = (page: Page) => page.getByTestId("settings-account");
async function expectContinuationFocus(page: Page) {
  const btn = page.getByTestId("account-open-portfolio");
  await expect(btn).toBeEnabled();
  await expect(btn).toBeFocused();
  expect(await btn.evaluate((el) => el === document.activeElement)).toBe(true);
}
async function register(page: Page, handle: string) {
  await page.getByTestId("account-handle-input").fill(handle);
  await page.getByTestId("account-password-input").fill("local-account-first-step-test");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-open-portfolio")).toBeVisible();
  await expectContinuationFocus(page);
}
async function continueToPortfolio(page: Page, alreadyFocused = false) {
  const btn = page.getByTestId("account-open-portfolio");
  await btn.scrollIntoViewIfNeeded();
  if (alreadyFocused) await expectContinuationFocus(page);
  else await btn.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("portfolio").first()).toBeFocused({ timeout: 15_000 });
  await expect(page.getByTestId("pf-goal").first()).toBeVisible({ timeout: 20_000 });
}

test("UI registration gives a clear goal and continuation; navigation places nothing; first fill, restore, logout, second account", async ({ page }, info) => {
  test.setTimeout(120_000);
  const phone = info.project.name === "phone";
  const prefix = info.project.name;
  await page.goto("/");
  await page.getByTestId("sign-in-entry").click();
  await expect(page.getByTestId("account-intro")).toHaveText("Start with $10,000 in game money and a goal of $20,000.");
  await expect(page.getByTestId("account-save-notice")).toHaveText("Demo trades are not saved.");
  await expect(page.getByTestId("account-disclaimer")).toBeHidden();
  await shot(page, `${prefix}-01-signup`);
  const summary = page.getByTestId("account-save-summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("account-disclaimer")).toBeVisible();
  await expect(page.getByTestId("account-disclaimer")).toContainText("not saved");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("account-disclaimer")).toBeHidden();
  await page.getByTestId("account-mode").getByRole("radio", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("account-intro")).toHaveText("Sign in to continue with your saved account.");
  await page.getByTestId("account-mode").getByRole("radio", { name: "Create account", exact: true }).click();
  const firstHandle = `FirstStep${prefix}${Date.now().toString(36)}`;
  await register(page, firstHandle);
  await expect(page.getByTestId("account-save-details")).not.toHaveAttribute("open");
  const next = page.getByTestId("account-open-portfolio");
  await expect(next).toBeInViewport({ ratio: 1 });
  expect((await next.boundingBox())?.height).toBeGreaterThanOrEqual(phone ? 44 : 28);
  await shot(page, `${prefix}-02-created`);
  const sent: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/api\/broker\/(orders|preview)/.test(r.url())) sent.push(r.url()); });
  await continueToPortfolio(page, true);
  await expect(page.getByTestId("pf-goal-now")).toHaveText("Saved net worth now $10,000.00 of $20,000.00");
  await expect(page.getByTestId("pf-guide-steps")).toBeVisible();
  expect(sent).toEqual([]);
  const empty = await (await page.context().request.get("/api/broker/me")).json();
  expect(empty.fills).toEqual([]);
  expect(empty.orders).toEqual({});
  await shot(page, `${prefix}-03-portfolio-guide`);

  if (!phone) {
    const win = page.getByTestId("win-portfolio");
    await win.getByRole("button", { name: "Collapse", exact: true }).click();
    await page.getByTestId("account-chip").first().click();
    await continueToPortfolio(page);
    await expect(win).not.toHaveClass(/collapsed/);
    await expect(win).toHaveCount(1);
  }
  await page.getByTestId("pf-guide-open-broker").click();
  const broker = page.getByTestId("broker").first();
  await expect(broker).toHaveAttribute("data-state", "live");
  await broker.getByTestId("br-asset-select").selectOption("HALC");
  await broker.getByTestId("br-qty").fill("1");
  await expect(broker.getByTestId("br-review")).toBeEnabled();
  await broker.getByTestId("br-review").click();
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("br-place").first().click();
  await expect(broker.getByTestId("br-ack-title")).toContainText("Bought 1 HALC", { timeout: 20_000 });
  await page.getByTestId("account-chip").first().click();
  await continueToPortfolio(page);
  await expect(page.getByTestId("pf-goal").first()).toHaveAttribute("data-stage", "done");
  await shot(page, `${prefix}-04-first-fill`);

  await page.getByTestId("account-chip").first().click();
  await page.getByTestId("account-logout").click();
  await expect(page.getByTestId("account-handle-input")).toBeVisible();
  await expect(page.getByTestId("account-open-portfolio")).toHaveCount(0);
  await register(page, `SecondStep${prefix}${Date.now().toString(36)}`);
  await continueToPortfolio(page, true);
  await expect(page.getByTestId("pf-goal").first()).toHaveAttribute("data-stage", "start");
  await expect(page.getByTestId("pf-goal-now")).toHaveText("Saved net worth now $10,000.00 of $20,000.00");
  expect((await (await page.context().request.get("/api/broker/me")).json()).fills).toEqual([]);

  await page.getByTestId("account-chip").first().click();
  await page.getByTestId("account-logout").click();
  await expect(page.getByTestId("account-handle-input")).toBeVisible();
  await page.getByTestId("account-mode").getByRole("radio", { name: "Sign in", exact: true }).click();
  await page.getByTestId("account-handle-input").fill(firstHandle);
  await page.getByTestId("account-password-input").fill("local-account-first-step-test");
  await page.getByTestId("account-submit").click();
  await expectContinuationFocus(page);
  await shot(page, `${prefix}-07-signin-focused`);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("portfolio").first()).toBeFocused({ timeout: 15_000 });
  await expect(page.getByTestId("pf-goal").first()).toHaveAttribute("data-stage", "done");
});

test("French, 200% text, reduced motion, and optional save details stay usable", async ({ page }, info) => {
  test.setTimeout(60_000);
  const phone = info.project.name === "phone";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings?locale=fr");
  await expect(page.getByTestId("settings")).toBeVisible();
  if (phone) await page.getByTestId("set-nav-SET-02").click();
  await page.getByTestId("text-scale").fill("2");
  await page.getByTestId("text-scale").blur();
  if (phone) {
    await page.getByTestId("app-back").click();
    await page.getByTestId("set-nav-SET-01").click();
  } else await page.getByTestId("set-nav-SET-01").click();
  await expect(page.getByTestId("account-intro")).toHaveText("Commencez avec 10\u202F000\u00A0$ d’argent fictif et un objectif de 20\u202F000\u00A0$.");
  const summary = page.getByTestId("account-save-summary");
  await summary.scrollIntoViewIfNeeded();
  expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(phone ? 44 : 28);
  await summary.click();
  await expect(page.getByTestId("account-disclaimer")).toBeVisible();
  await summary.click();
  await register(page, `FrStep${info.project.name}${Date.now().toString(36)}`);
  const next = page.getByTestId("account-open-portfolio");
  await expect(next).toHaveText("Ouvrir Portefeuille");
  await next.scrollIntoViewIfNeeded();
  await shot(page, `${info.project.name}-05-fr-scale2-account`);
  expect(await account(page).evaluate((el) => [...el.querySelectorAll("*")].filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX === "visible").length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await continueToPortfolio(page);
  await shot(page, `${info.project.name}-06-fr-scale2-portfolio`);
});
