import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { parseBrokerLedger } from "@/market/brokerLedger";
import { boot } from "../shell/helpers";

async function shot(page: Page, name: string) {
  const dir = process.env.FILL_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, animations: "disabled", caret: "hide" });
}
async function createAccount(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error("Expected the configured local origin");
  const response = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle: `Fill${Date.now().toString(36)}`, password: "local-fill-test" } });
  expect(response.status(), await response.text()).toBe(201);
}
async function filled(page: Page, scope: Locator) {
  await expect(scope.getByTestId("br-ack-title")).toContainText("3 HALC", { timeout: 15_000 });
  await expect(scope.getByTestId("br-fill-position")).toBeVisible();
  await expect.poll(async () => {
    const saved = parseBrokerLedger(await (await page.request.get("/api/broker/me")).json());
    if (!saved) throw new Error("Expected the strict broker ledger");
    const holding = saved.positions.HALC;
    return holding?.qty === "3" && saved.fills.filter((f) => f.assetId === "HALC" && f.side === "BUY").length === 1;
  }).toBe(true);
  await expect(scope.getByTestId("br-fill-pnl").getByRole("img")).toHaveAccessibleName(/dollars$/);
  expect(await scope.getByTestId("br-fill-position").evaluate((e) => e.closest('[role="status"]') === null)).toBe(true);
  await expect(scope.getByTestId("br-receipt")).toHaveAttribute("role", "status");
}
async function noOverflow(page: Page, sheet: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await sheet.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await sheet.locator(".qs-body").evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  for (const id of ["br-new", "br-sheet-close"]) {
    const control = sheet.getByTestId(id); await control.scrollIntoViewIfNeeded();
    const b = await control.boundingBox(); if (!b) throw new Error("Expected a visible control");
    expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
  }
}

test("first fill: receipt and server P&L, no extra order, then the same position in Portfolio", async ({ page, baseURL }, info) => {
  test.setTimeout(90_000);
  const phone = info.project.name === "phone";
  await createAccount(page, baseURL);
  let orders = 0;
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/broker/orders") orders++; });
  if (phone) {
    await boot(page);
    const guide = page.getByTestId("phone-first-trade-guide"); await expect(guide).toBeVisible();
    await guide.focus(); await page.keyboard.press("Enter");
    await expect(page.getByTestId("portfolio")).toBeFocused();
  }
  await boot(page, "/broker?asset=HALC");
  const broker = page.getByTestId("broker").first(); await expect(broker).toHaveAttribute("data-state", "live");
  if (phone) await broker.getByTestId("br-trade").click();
  const scope = phone ? page.getByTestId("br-sheet") : broker;
  await scope.getByTestId("br-qty").fill("3");
  await expect(scope.getByTestId("br-review")).toBeEnabled();
  await expect(scope.getByTestId("br-fill-position")).toHaveCount(0); expect(orders).toBe(0);
  await scope.getByTestId("br-review").click(); await expect(scope.getByTestId("br-place")).toBeEnabled(); expect(orders).toBe(0);
  await scope.getByTestId("br-place").click(); await filled(page, scope); expect(orders).toBe(1);
  await expect(scope.getByTestId("br-fill-holding")).toHaveText("Your position: 3 HALC");
  await scope.getByTestId("br-ack-title").scrollIntoViewIfNeeded(); await shot(page, `${info.project.name}-receipt-pnl`);
  if (phone) {
    expect(await scope.evaluate((e) => e.contains(document.activeElement))).toBe(true);
    await noOverflow(page, scope);
    for (const key of ["Tab", "Tab", "Shift+Tab"]) { await page.keyboard.press(key); expect(await scope.evaluate((e) => e.contains(document.activeElement))).toBe(true); }
  }
  await scope.getByTestId("br-new").click(); expect(orders).toBe(1);
  await expect(scope.getByTestId("br-fill-position")).toHaveCount(0);
  await expect(scope.getByTestId("br-qty")).toHaveValue("");
  if (phone) {
    await scope.getByTestId("br-sheet-close").click(); await expect(page.getByTestId("br-trade")).toBeFocused();
    await page.getByTestId("app-back").click(); await page.getByTestId("icon-portfolio").click();
    await expect(page.getByTestId("portfolio")).toBeFocused(); await page.getByTestId("pf-open-positions").click();
  } else {
    const pf = page.getByTestId("win-portfolio").first(); await expect(pf).toBeVisible(); await pf.getByTestId("pf-tab-positions").click();
  }
  const position = page.locator('[data-testid="pos-row"][data-asset="HALC"]'); await expect(position).toBeVisible();
  await expect(position.getByTestId(phone ? "pos-qtyat" : "pos-qty")).toHaveText(phone ? /^3 @ / : "3");
  await expect(position.getByTestId("pos-pnl")).toBeVisible(); expect(orders).toBe(1);
  await shot(page, `${info.project.name}-portfolio-fill`);
});

for (const width of [390, 320]) test(`phone FR200% ${width}: real fill receipt/P&L wraps and actions remain reachable`, async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone layout only"); test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await createAccount(page, baseURL); await boot(page, "/settings?locale=fr");
  await page.getByTestId("set-nav-SET-02").click(); await page.getByTestId("text-scale").fill("2"); await page.getByTestId("text-scale").blur();
  await page.getByTestId("app-back").click(); await page.getByTestId("app-back").click(); await page.getByTestId("icon-broker").click();
  const broker = page.getByTestId("broker"); await expect(broker).toHaveAttribute("data-state", "live");
  await broker.getByTestId("br-asset-select").selectOption("HALC"); await broker.getByTestId("br-trade").click();
  const sheet = page.getByTestId("br-sheet"); await sheet.getByTestId("br-qty").fill("3"); await expect(sheet.getByTestId("br-review")).toBeEnabled();
  await sheet.getByTestId("br-review").click(); await expect(sheet.getByTestId("br-place")).toBeEnabled(); await sheet.getByTestId("br-place").click();
  await filled(page, sheet); await expect(sheet.getByTestId("br-fill-holding")).toHaveText("Votre position : 3 HALC");
  await expect(sheet.getByTestId("br-fill-pnl")).toContainText("Plus-value ou moins-value latente"); await noOverflow(page, sheet);
  await sheet.getByTestId("br-ack-title").scrollIntoViewIfNeeded(); await shot(page, `phone-fr200-${width}-receipt`);
  await sheet.getByTestId("br-fill-pnl").scrollIntoViewIfNeeded(); await shot(page, `phone-fr200-${width}-pnl`);
  const axe = await new AxeBuilder({ page }).include('[data-testid="br-sheet"]').analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await sheet.getByTestId("br-sheet-close").click(); await expect(page.getByTestId("br-trade")).toBeFocused();
});
