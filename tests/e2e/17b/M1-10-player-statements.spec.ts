// Player Wire statements: a signed-in player posts from the composer, the STATEMENT appears, cash drops by $500,
// the daily cap rejects a fourth post, a refresh still shows the row, and a second account cannot see the first's cash.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

interface Ledger { cashCents: number }
interface WireItem { id: string; kind: string; slots?: Record<string, string>; handle?: string }
interface Wire { items: WireItem[] }

const wire = async (r: APIRequestContext) => (await (await r.get("/api/wire")).json()) as Wire;
const me = async (r: APIRequestContext) => (await (await r.get("/api/broker/me")).json()) as Ledger;

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-wire-test" } });
  expect(res.status(), await res.text()).toBe(201);
}

async function openWire(page: Page) {
  await page.goto("/wire");
  await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
}

async function postStatement(page: Page, text: string, asset = "HALC") {
  const composer = page.getByTestId("wire-composer");
  await expect(composer).toBeVisible();
  if (!(await composer.getAttribute("open") ?? "")) await page.getByTestId("wire-composer-toggle").click();
  await expect(page.getByTestId("wire-composer-form")).toBeVisible();
  const chip = page.getByTestId(`wire-composer-asset-${asset}`);
  if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
  await page.getByTestId("wire-composer-text").fill(text);
  await page.getByTestId("wire-composer-submit").click();
}

async function journey(page: Page, pageB: Page, request: APIRequestContext, requestB: APIRequestContext, baseURL: string, stamp: string, layout: string) {
  const handleA = `PsA${stamp}`;
  const handleB = `PsB${stamp}`;
  await register(request, baseURL, handleA);
  await register(requestB, baseURL, handleB);
  const cash0 = (await me(request)).cashCents;
  expect(cash0).toBe(1_000_000);

  await openWire(page);
  await expect(page.getByTestId("wire-composer")).toBeVisible();
  await expect(page.getByTestId("wire-demo")).toHaveCount(0);
  await postStatement(page, `HALC is steady ${stamp}`);
  const row = page.locator('[data-testid="wire-row"][data-id^="w-p-"]');
  await expect(row.first()).toBeVisible({ timeout: 20_000 });
  await expect(row.first()).toContainText(handleA);
  await expect(row.first()).toContainText(`HALC is steady ${stamp}`);

  await expect.poll(async () => (await me(request)).cashCents, { timeout: 15_000 }).toBe(cash0 - 50_000);
  const afterOne = await wire(request);
  const mine = afterOne.items.filter((i) => i.id.startsWith("w-p-") && i.slots?.handle === handleA);
  expect(mine.length).toBe(1);
  expect(mine[0]?.kind).toBe("STATEMENT");
  expect(JSON.stringify(mine[0])).not.toMatch(/cashCents|cash\b/i);

  await postStatement(page, `second look ${stamp}`);
  await postStatement(page, `third look ${stamp}`);
  await expect.poll(async () => (await wire(request)).items.filter((i) => i.id.startsWith("w-p-") && i.slots?.handle === handleA).length, { timeout: 20_000 }).toBe(3);
  await expect.poll(async () => (await me(request)).cashCents, { timeout: 15_000 }).toBe(cash0 - 150_000);

  await postStatement(page, `fourth should fail ${stamp}`);
  await expect(page.getByTestId("wire-composer-error")).toBeVisible({ timeout: 10_000 });
  expect((await wire(request)).items.filter((i) => i.id.startsWith("w-p-") && i.slots?.handle === handleA).length).toBe(3);
  expect((await me(request)).cashCents).toBe(cash0 - 150_000);

  await page.reload();
  await openWire(page);
  await expect(page.locator('[data-testid="wire-row"][data-id^="w-p-"]').first()).toBeVisible({ timeout: 20_000 });
  expect((await wire(request)).items.filter((i) => i.id.startsWith("w-p-") && i.slots?.handle === handleA).length).toBe(3);

  await openWire(pageB);
  await expect(pageB.locator('[data-testid="wire-row"][data-id^="w-p-"]').filter({ hasText: handleA }).first()).toBeVisible({ timeout: 20_000 });
  expect((await me(requestB)).cashCents).toBe(1_000_000);
  const bodyB = await (await requestB.get("/api/broker/me")).text();
  expect(bodyB).not.toContain(String(cash0 - 150_000));
  expect((await me(requestB)).cashCents).not.toBe(cash0 - 150_000);
  void layout;
}

test("desktop: post, cash −$500, hit the cap, refresh persists, second account is isolated", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey");
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const page = await a.newPage();
    const pageB = await b.newPage();
    await journey(page, pageB, a.request, b.request, baseURL!, stamp, "desktop");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  } finally {
    await a.close();
    await b.close();
  }
});

test("phone: post, cash −$500, hit the cap, refresh persists, second account is isolated", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone journey");
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const a = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await a.newPage();
    const pageB = await b.newPage();
    await journey(page, pageB, a.request, b.request, baseURL!, stamp, "phone");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await a.close();
    await b.close();
  }
});
