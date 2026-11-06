import { expect, test } from "@playwright/test";

test("M1-04 world catalog matches Broker choices; added assets open quote/chart/ticket", async ({ page, request }) => {
  const world = await (await request.get("/api/world")).json();
  await page.goto("/broker");
  const select = page.getByTestId("br-asset-select");
  await expect(select).toBeVisible();
  await expect(select.locator("option")).toHaveCount(world.catalog.length);
  expect(await select.locator("option").evaluateAll(options => options.map(o => o.getAttribute("value")))).toEqual(world.catalog.map((a: { assetId: string }) => a.assetId).sort());
  for (const [id, name] of [["NMBS", "Nimbus Compute"], ["VRDN", "Verdane Energy"], ["HALC", "Halcyon Shipping"]]) {
    await select.selectOption(id);
    await expect(select.locator("option:checked")).toHaveText(`${id} · ${name}`);
    await expect(page.getByTestId("br-ticket")).toBeVisible();
    await expect(page.getByTestId("br-chart-plot")).toBeVisible();
    await expect(page.getByTestId("br-last")).not.toHaveText("—");
    await expect(page.getByTestId("broker")).toHaveAttribute("data-state", "live");
  }
});

test("M1-04 two accounts read the same world catalog with separate private identities", async ({ playwright, baseURL }) => {
  const a = await playwright.request.newContext({ baseURL });
  const b = await playwright.request.newContext({ baseURL });
  try {
    const accounts = [];
    for (const [i, context] of [a, b].entries()) {
      const registered = await context.post("/api/auth/register", {
        headers: { origin: baseURL! },
        data: { handle: `Catalog${i}${Date.now()}`, password: "local-catalog-test" },
      });
      expect(registered.status()).toBe(201);
      accounts.push(await (await context.get("/api/auth/me")).json());
    }
    expect(accounts[0].account.accountId).not.toBe(accounts[1].account.accountId);
    expect(accounts[0].account.worldId).toBe(accounts[1].account.worldId);
    const worlds = await Promise.all([a, b].map(async context => (await context.get("/api/world")).json()));
    expect(worlds[0].catalog).toEqual(worlds[1].catalog);
    expect(worlds[0].catalog).toHaveLength(10);
  } finally {
    await a.dispose(); await b.dispose();
  }
});
