import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const shots = process.env.WIRE_FIRST_STEP_SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.getByTestId("wire-empty-help").evaluate(el => [el, ...el.querySelectorAll("*")].filter(n => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX === "visible").length)).toBe(0);
}
async function resetWithKeyboard(page: Page) {
  const reset = page.getByTestId("wire-show-all");
  await page.keyboard.press("Tab");
  await expect(reset).toBeFocused();
  await page.keyboard.press("Enter");
  const all = page.getByTestId("wire-filter-all");
  await expect(all).toHaveAttribute("aria-checked", "true");
  await expect(all).toBeFocused();
  expect(await all.evaluate(el => el === document.activeElement)).toBe(true);
  await expect(all).toBeInViewport({ ratio: 1 });
}

test("real first-guide Wire: explain the cold feed, recover an empty filter to actual stories, place nothing", async ({ page }, info) => {
  test.setTimeout(100_000);
  const phone = info.project.name === "phone";
  await page.goto("/");
  await page.getByTestId("sign-in-entry").click();
  await page.getByTestId("account-handle-input").fill(`WireStep${info.project.name}${Date.now().toString(36)}`);
  await page.getByTestId("account-password-input").fill("local-wire-first-step");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-logout")).toBeVisible();
  await page.goto("/");
  if (phone) await page.getByTestId("phone-first-trade-guide").click();
  await page.getByTestId("pf-guide-open-wire").click();
  await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live");
  const cold = await page.getByTestId("wire-empty").isVisible();
  if (cold) {
    await expect(page.getByTestId("wire-empty-help")).toHaveText("Market stories appear as events happen. You can explore Broker while you wait.");
    await expect(page.getByTestId("wire-show-all")).toHaveCount(0);
    await shot(page, `${info.project.name}-01-cold-feed`);
  }
  await info.attach("natural-cold-feed-observed", { body: JSON.stringify({ cold }), contentType: "application/json" });
  await expect(page.getByTestId("wire-row").first()).toBeVisible({ timeout: 65_000 });
  const id = await page.getByTestId("wire-row").first().getAttribute("data-id");
  expect(id).toBeTruthy();
  await expect(page.getByTestId("wire-demo")).toHaveCount(0);
  const writes: string[] = [];
  page.on("request", r => { if (r.method() === "POST" && /\/api\/broker\/(orders|preview)/.test(r.url())) writes.push(r.url()); });
  await page.getByTestId("wire-filter-filings").click();
  await expect(page.getByTestId("wire-empty")).toHaveText("Nothing in this filter yet.");
  await expect(page.getByTestId("wire-empty-help")).toContainText("Try All to see the whole feed.");
  await noOverflow(page);
  expect((await page.getByTestId("wire-show-all").boundingBox())!.height).toBeGreaterThanOrEqual(phone ? 44 : 28);
  await shot(page, `${info.project.name}-02-empty-filter`);
  await resetWithKeyboard(page);
  await expect(page.locator(`[data-testid="wire-row"][data-id=${JSON.stringify(id)}]`)).toBeVisible();
  await expect(page.getByTestId("wire-empty-help")).toHaveCount(0);
  await shot(page, `${info.project.name}-03-recovered-all`);
  expect(writes).toEqual([]);
  const ledger: unknown = await (await page.context().request.get("/api/broker/me")).json();
  expect(ledger).toMatchObject({ orders: {}, fills: [] });
  await info.attach("unchanged-empty-ledger", { body: JSON.stringify(ledger), contentType: "application/json" });
});

test("French 200% text and reduced motion: a guest can recover a filter on phone or a narrow desktop", async ({ page }, info) => {
  test.setTimeout(60_000);
  const phone = info.project.name === "phone";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings?locale=fr");
  if (phone) await page.getByTestId("set-nav-SET-02").click();
  await page.getByTestId("text-scale").fill("2");
  await page.getByTestId("text-scale").blur();
  if (phone) {
    await page.getByTestId("app-back").click();
    await page.getByTestId("app-back").click();
    await page.getByTestId("icon-wire").click();
  } else await page.getByTestId("tile-wire").click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim())).toBe("2");
  await expect(page.getByTestId("wire-demo")).toBeVisible();
  if (!phone) {
    const win = page.getByTestId("win-wire").first();
    const box = (await win.boundingBox())!, handle = (await win.getByTestId("resize-handle").boundingBox())!;
    await page.mouse.move(handle.x + 5, handle.y + 5); await page.mouse.down();
    await page.mouse.move(handle.x + 5 - (box.width - 360), handle.y + 5 - (box.height - 300), { steps: 5 }); await page.mouse.up();
    await expect.poll(async () => Math.round((await win.boundingBox())!.width)).toBe(360);
  }
  await page.getByTestId("wire-filter-verdicts").click();
  await expect(page.getByTestId("wire-empty-help")).toContainText("Essayez Tout pour voir le fil complet.");
  await expect(page.getByTestId("wire-show-all")).toHaveText("Afficher toutes les dépêches");
  await noOverflow(page);
  await page.getByTestId("wire-show-all").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("wire-show-all")).toBeInViewport({ ratio: 1 });
  await shot(page, `${info.project.name}-04-fr-scale2`);
  await resetWithKeyboard(page);
  await expect(page.getByTestId("wire-row").first()).toBeVisible();
  await expect(page.getByTestId("wire-demo")).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim())).toBe("2");
});
