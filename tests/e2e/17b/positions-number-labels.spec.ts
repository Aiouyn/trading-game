import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { MeTradingBody } from "@/shell/contracts/channels";

const shots = process.env.POSITION_LABELS_SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
}
async function positions(page: Page, phone: boolean, query = "") {
  await page.goto(`/portfolio${query}`);
  await expect(page.getByTestId("pf-overview").last()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await page.getByTestId(phone ? "pf-open-positions" : "pf-tab-positions").last().click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.getByTestId("pf-positions").first().evaluate((root) => [...root.querySelectorAll("*")].every((el) => el.getBoundingClientRect().right <= window.innerWidth + 0.5))).toBe(true);
}

test("a real first fill has clearly identified P&L, daily move, value and average cost", async ({ page }, info) => {
  test.setTimeout(90_000);
  const phone = info.project.name === "phone";
  await page.goto("/settings/SET-01");
  await page.getByTestId("account-handle-input").fill(`PosRead${info.project.name}${Date.now().toString(36)}`);
  await page.getByTestId("account-password-input").fill("local-positions-labels-test");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-logout")).toBeVisible();
  await positions(page, phone);
  await expect(page.getByTestId("pos-empty")).toBeVisible();
  await expect(page.getByTestId("pos-reading-key")).toHaveCount(0);

  await page.goto("/broker?asset=HALC");
  const broker = page.getByTestId("broker").last();
  await expect(broker).toHaveAttribute("data-state", "live");
  await broker.getByTestId("br-qty").fill("1");
  await broker.getByTestId("br-review").click();
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("br-place").first().click();
  await expect(broker.getByTestId("br-ack-title")).toContainText("Bought 1 HALC", { timeout: 20_000 });

  const writes: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/api\/broker\/(preview|orders)/.test(r.url())) writes.push(r.url()); });
  await positions(page, phone);
  const row = page.getByTestId("pos-row").first();
  await expect(row).toHaveAttribute("data-asset", "HALC");
  await expect(row).toHaveAttribute("aria-label", /unrealized P&L .* dollars, before fees$/);
  await expect(page.getByTestId("pos-reading-key")).toHaveText("P&L is the change from your average cost, before fees. Today is the asset’s daily price move, not your return.");
  if (phone) {
    await expect(row.getByTestId("pos-card-label")).toHaveText(["P&L", "Value · Weight", "Qty @ avg cost", "Today"]);
    await expect(row.getByTestId("pos-qtyat")).toHaveText(/^1 @ \d+\.\d\d$/);
  } else await expect(page.locator(".pos-table thead th:visible")).toContainText(["Asset", "Qty", "Today", "Value", "P&L"]);
  await row.focus();
  await expect(row).toBeFocused();
  await noOverflow(page);
  expect(writes).toEqual([]);
  const ledger: unknown = await (await page.context().request.get("/api/broker/me")).json();
  expect(ledger).toMatchObject({ positions: { HALC: { qty: "1" } }, fills: expect.arrayContaining([expect.objectContaining({ side: "BUY", qty: "1" } satisfies Pick<MeTradingBody["fills"][number], "side" | "qty">)]) });
  await info.attach("saved-first-fill-ledger", { body: JSON.stringify(ledger, null, 2), contentType: "application/json" });
  await shot(page, `${info.project.name}-01-first-position`);
});

test("French card labels and the reading key fit at 200% text with reduced motion", async ({ page }, info) => {
  test.setTimeout(60_000);
  const phone = info.project.name === "phone";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings?locale=fr");
  if (phone) await page.getByTestId("set-nav-SET-02").click();
  await page.getByTestId("text-scale").fill("2");
  await page.getByTestId("text-scale").blur();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim())).toBe("2");
  if (phone) {
    await page.getByTestId("app-back").click();
    await page.getByTestId("app-back").click();
    await page.getByTestId("icon-portfolio").click();
  } else await page.getByTestId("tile-portfolio").click();
  await page.getByTestId(phone ? "pf-open-positions" : "pf-tab-positions").last().click();
  await expect(page.getByTestId("pf-positions").last()).toHaveAttribute("data-state", "live");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim())).toBe("2");
  const rows = page.getByTestId("pos-row");
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("pos-reading-key")).toContainText("hors frais");
  for (const row of await rows.all()) {
    await expect(row.getByTestId("pos-card-label")).toHaveText(["P&L", "Valeur · Poids", "Qté @ coût moyen", "Jour"]);
    await expect(row).toHaveAttribute("aria-label", /plus ou moins-value latente .* dollars, hors frais$/);
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(phone ? 44 : 28);
  }
  await noOverflow(page);
  await shot(page, `${info.project.name}-02-fr-scale2`);
});
