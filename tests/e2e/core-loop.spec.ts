import { test, expect, type Page } from "@playwright/test";

// Tape: Phase 0 core loop on the live engine. Deterministic via ?seed=&fresh and window.__tg hooks (Forge).
const money = (s: string | null) => { const m = (s ?? "").replace(/\u2212/g, "-").match(/-?\$?\s?[\d,]+(?:\.\d+)?/); return m ? Number(m[0].replace(/[$,\s]/g, "")) : NaN; };

async function freshGame(page: Page, seed: string) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?seed=${seed}&fresh`);
  await page.waitForFunction(() => Boolean((window as unknown as { __tg?: unknown }).__tg), null, { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __tg: { pause(): void } }).__tg.pause());
  await expect(page.getByTestId("net-worth")).toBeVisible();
  await page.getByRole("button", { name: "Open Markets", exact: true }).click();
  return errors;
}

async function openTicket(page: Page, assetId: string, project: string) {
  await page.getByTestId(`watch-${assetId}`).click();
  if (project === "phone") await page.getByTestId("open-trade").click();
  await expect(page.getByTestId("order-submit")).toBeVisible();
}

const advance = (page: Page, n: number) =>
  page.evaluate((k) => (window as unknown as { __tg: { advance(n: number): void } }).__tg.advance(k), n);

test("core loop: buy within the first-trade cap, fill, persist across reload", async ({ page }, info) => {
  const errors = await freshGame(page, "tape-e2e");
  await expect(page.getByTestId("game-clock")).toBeVisible();
  await expect(page.getByTestId("chart-price")).toBeVisible();
  const cash0 = money(await page.getByTestId("cash").first().textContent());
  expect(cash0).toBeCloseTo(5000, 0);

  await openTicket(page, "HLCN", info.project.name);
  await page.getByTestId("chip-Max").click();
  await expect(page.getByTestId("first-trade-cap")).toBeVisible();
  const total = money(await page.getByTestId("order-total").textContent());
  expect(total, "Max must respect the 20% Simple-mode first-trade cap").toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(1000);
  await page.screenshot({ path: `test-results/proof/${info.project.name}-ticket.png` });

  await page.getByTestId("order-submit").click();
  await expect(page.getByTestId("order-pending")).toBeVisible();
  await advance(page, 3);
  await expect(page.getByTestId("toast")).toBeVisible();
  // phone: the trade sheet closes on its own after a fill (14cc4fc)
  if (info.project.name === "phone") await expect(page.getByTestId("order-submit")).toBeHidden();
  await expect(page.getByTestId("position-HLCN")).toBeVisible();
  const cash1 = money(await page.getByTestId("cash").first().textContent());
  expect(cash1, "cash should drop by about the order total").toBeLessThan(cash0 - total * 0.9);
  await page.screenshot({ path: `test-results/proof/${info.project.name}-after-fill.png`, fullPage: true });

  await page.waitForTimeout(1500); // let the IndexedDB autosave land
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __tg?: unknown }).__tg), null, { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __tg: { pause(): void } }).__tg.pause());
  await page.getByRole("button", { name: "Open Markets", exact: true }).click();
  await expect(page.getByTestId("position-HLCN")).toBeVisible();
  expect(money(await page.getByTestId("cash").first().textContent()), "cash restored after reload").toBeCloseTo(cash1, 0);
  expect(errors, "console errors during the core loop").toEqual([]);
});

test("first-trade cap blocks an oversized order", async ({ page }, info) => {
  await freshGame(page, "tape-cap");
  await openTicket(page, "HLCN", info.project.name);
  await page.getByTestId("order-qty").fill("1000");
  await expect(page.getByTestId("order-submit")).toBeDisabled();
});
