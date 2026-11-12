// Player journey for verify-port-avalon. Clicks the same controls a player uses.
// Selectors and the signed-in order door match tests/e2e (shell/helpers boot, M1-06 ticket ids).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { boot } from "../../tests/e2e/shell/helpers";
import { EVIDENCE_ROOT, readState, writeState } from "./state";

export type ViewportName = "desktop" | "phone";

const PASSWORD = "verify-player";
const WORLD_ID = "world_port_avalon";

type Check = { id: string; ok: boolean; detail: string };

type Ledger = {
  cashCents: number;
  positions: Record<string, { qty: string }>;
  orders: Record<string, { status: string; limit?: string }>;
};

const playerExpect = expect.configure({ timeout: 30_000 });

function shotName(viewport: ViewportName, name: string): string {
  return `${viewport}-${name}.png`;
}

async function dismissConsent(page: Page): Promise<void> {
  const decline = page.getByTestId("quay-consent-decline");
  try {
    await decline.waitFor({ state: "visible", timeout: 2_000 });
    await decline.click();
  } catch {
    // A production build shows the prompt after the first pointer. It may already be decided.
  }
}

async function signUp(page: Page, handle: string): Promise<void> {
  await boot(page, "/");
  await page.getByTestId("sign-in-entry").click();
  await dismissConsent(page);
  const input = page.getByTestId("account-handle-input");
  try {
    await input.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    await page.getByTestId("set-nav-SET-01").click();
    await input.waitFor({ state: "visible", timeout: 10_000 });
  }
  await input.fill(handle);
  await page.getByTestId("account-password-input").fill(PASSWORD);
  await page.getByTestId("account-submit").click();
  const error = page.getByTestId("account-error");
  const handleOut = page.getByTestId("account-handle");
  await playerExpect(handleOut.or(error)).toBeVisible({ timeout: 20_000 });
  if (await error.isVisible()) throw new Error(`signup failed: ${(await error.innerText()).trim()}`);
  await playerExpect(handleOut).toHaveText(handle);
  await playerExpect(page.getByTestId("account-logout")).toBeVisible();
  await playerExpect(page.getByTestId("account-world")).toContainText(WORLD_ID);
}

async function phoneHome(page: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    if (await page.getByTestId("app-grid").isVisible().catch(() => false)) return;
    const mark = page.getByTestId("quay-mark");
    if (await mark.isVisible().catch(() => false)) {
      await mark.click();
      continue;
    }
    const back = page.getByTestId("app-back");
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      continue;
    }
    break;
  }
  await page.getByTestId("app-grid").waitFor({ state: "visible", timeout: 10_000 });
}

async function openBroker(page: Page, viewport: ViewportName): Promise<Locator> {
  if (viewport === "phone") {
    await phoneHome(page);
    await page.getByTestId("icon-broker").click();
  } else {
    const tile = page.getByTestId("tile-broker");
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
  }
  await dismissConsent(page);
  const broker = viewport === "phone"
    ? page.getByTestId("phone-appview").getByTestId("broker")
    : page.locator('[data-testid="win-broker"].active').getByTestId("broker");
  await playerExpect(broker).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  const select = broker.getByTestId("br-asset-select");
  if (await select.count()) {
    await select.selectOption("HALC");
  } else {
    await playerExpect(broker.getByTestId("br-ticker")).toHaveText("HALC");
  }
  await playerExpect(broker).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  return broker;
}

/** Card 6: on the phone the ticket lives in a bottom sheet behind Trade (`br-trade`). Open it the way a player does. */
async function openTicket(broker: Locator): Promise<void> {
  const trade = broker.getByTestId("br-trade");
  if (!(await trade.count()) || (await trade.getAttribute("aria-expanded")) !== "false") return;
  await trade.click();
  await playerExpect(broker.getByTestId("br-sheet")).toBeVisible();
}

async function placeOrder(broker: Locator, kind: "market" | "limit", qty: string, limit?: string): Promise<void> {
  await openTicket(broker);
  await broker.getByTestId("br-side-buy").click();
  await broker.getByTestId(kind === "limit" ? "br-type-limit" : "br-type-market").click();
  if (limit) {
    const price = broker.getByTestId("br-price-limit");
    await price.scrollIntoViewIfNeeded();
    await price.fill(limit);
  }
  const qtyBox = broker.getByTestId("br-qty");
  await qtyBox.scrollIntoViewIfNeeded();
  await qtyBox.fill(qty);
  const review = broker.getByTestId("br-review");
  await playerExpect(review).toBeEnabled({ timeout: 15_000 });
  await review.scrollIntoViewIfNeeded();
  await review.click();
  const place = broker.getByTestId("br-place");
  await place.scrollIntoViewIfNeeded();
  await playerExpect(place).toBeEnabled({ timeout: 15_000 });
  await place.click();
  await playerExpect(broker.getByTestId("br-ack")).toBeVisible({ timeout: 15_000 });
}

async function readLedger(page: Page): Promise<Ledger> {
  const res = await page.request.get("/api/broker/me");
  if (!res.ok()) throw new Error(`GET /api/broker/me returned ${res.status()}: ${await res.text()}`);
  const body: unknown = await res.json();
  if (!isLedger(body)) throw new Error("GET /api/broker/me was not a ledger");
  return body;
}

function isLedger(v: unknown): v is Ledger {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.cashCents === "number"
    && typeof o.positions === "object" && o.positions !== null && !Array.isArray(o.positions)
    && typeof o.orders === "object" && o.orders !== null && !Array.isArray(o.orders);
}

async function openSettings(page: Page, viewport: ViewportName): Promise<void> {
  if (viewport === "phone") await phoneHome(page);
  const chip = page.getByTestId(viewport === "phone" ? "account-chip-home" : "account-chip");
  await chip.click();
  await playerExpect(page.getByTestId("settings")).toBeVisible();
}

async function openCity(page: Page, viewport: ViewportName): Promise<void> {
  if (viewport === "phone") {
    await phoneHome(page);
    const icon = page.getByTestId("icon-city");
    await icon.scrollIntoViewIfNeeded();
    await icon.click();
  } else {
    const tile = page.getByTestId("tile-city");
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
  }
  const city = viewport === "phone"
    ? page.getByTestId("phone-appview").getByTestId("city")
    : page.locator('[data-testid="win-city"].active').getByTestId("city");
  await playerExpect(city).toBeVisible({ timeout: 20_000 });
  await playerExpect(city.getByTestId("dv-name")).toHaveText("Financial Mile");
  await playerExpect(city.getByTestId("dv-readonly")).toBeVisible();
  await playerExpect(city.getByTestId("coming-later")).toHaveCount(0);
}

async function reloadBroker(page: Page, viewport: ViewportName): Promise<Locator> {
  await page.reload();
  await playerExpect(page.getByTestId("quay-ready")).toBeVisible();
  await dismissConsent(page);
  const broker = await openBroker(page, viewport);
  return broker;
}

type Journey = {
  pageA: Page;
  pageB: Page;
  viewport: ViewportName;
  dir: string;
  checks: Check[];
};

async function record(journey: Journey, page: Page, id: string, shot: string, fn: () => Promise<string>): Promise<boolean> {
  const file = shotName(journey.viewport, shot);
  try {
    const detail = await fn();
    await page.screenshot({ path: path.join(journey.dir, file) });
    journey.checks.push({ id: `${journey.viewport}.${id}`, ok: true, detail });
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    try { await page.screenshot({ path: path.join(journey.dir, file) }); } catch { /* page may be mid-navigation */ }
    journey.checks.push({ id: `${journey.viewport}.${id}`, ok: false, detail });
    return false;
  }
}

async function playViewport(browser: BrowserContext, other: BrowserContext, viewport: ViewportName, dir: string): Promise<Check[]> {
  const checks: Check[] = [];
  const pageA = await browser.newPage();
  const pageB = await other.newPage();
  const journey: Journey = { pageA, pageB, viewport, dir, checks };
  const stamp = Date.now().toString(36);
  const mark = viewport === "desktop" ? "d" : "p";
  const handleA = `Va${mark}${stamp}`;
  const handleB = `Vb${mark}${stamp}`;
  pageA.setDefaultTimeout(20_000);
  pageB.setDefaultTimeout(20_000);

  const signedA = await record(journey, pageA, "signup-a", "signup-a", async () => {
    await signUp(pageA, handleA);
    return `signed in as ${handleA}`;
  });
  const signedB = await record(journey, pageB, "signup-b", "signup-b", async () => {
    await signUp(pageB, handleB);
    return `signed in as ${handleB}`;
  });
  if (!signedA || !signedB) {
    const reason = "signup did not reach two signed-in accounts";
    for (const id of ["market-buy", "limit-order", "isolation", "persist", "settings", "city"]) {
      checks.push({ id: `${viewport}.${id}`, ok: false, detail: reason });
    }
    return checks;
  }

  let brokerA: Locator | null = null;
  let orderId = "";
  const bought = await record(journey, pageA, "market-buy", "market-buy", async () => {
    brokerA = await openBroker(pageA, viewport);
    await placeOrder(brokerA, "market", "1");
    const title = (await brokerA.getByTestId("br-ack-title").innerText()).trim();
    if (!title.startsWith("Bought 1 HALC at ")) throw new Error(`ack was ${title}`);
    await playerExpect(brokerA.getByTestId("br-you-hold")).toHaveText("You hold 1");
    return title;
  });
  const rested = bought && await record(journey, pageA, "limit-order", "limit-order", async () => {
    if (!brokerA) throw new Error("broker was not open");
    await brokerA.getByTestId("br-new").click();
    await placeOrder(brokerA, "limit", "1", "1.00");
    await playerExpect(brokerA.getByTestId("br-ack-title")).toHaveText("Order placed. It's in Open orders.");
    const row = brokerA.locator("[data-testid^=\"br-oo-row-\"]").first();
    await playerExpect(row).toBeVisible();
    orderId = (await row.getAttribute("data-testid"))?.replace("br-oo-row-", "") ?? "";
    if (!orderId) throw new Error("open order row had no id");
    const ledger = await readLedger(pageA);
    const order = ledger.orders[orderId];
    if (!order || order.status !== "WORKING" || order.limit !== "1.00") {
      throw new Error(`ledger order ${orderId} was ${JSON.stringify(order ?? null)}`);
    }
    if (ledger.positions.HALC?.qty !== "1") throw new Error(`ledger holding was ${ledger.positions.HALC?.qty ?? "absent"}`);
    return `working limit ${orderId}; holding 1 HALC`;
  });

  if (!bought) checks.push({ id: `${viewport}.limit-order`, ok: false, detail: "market buy did not land" });
  if (bought && rested) {
    await record(journey, pageB, "isolation", "isolation", async () => {
      const brokerB = await openBroker(pageB, viewport);
      await playerExpect(brokerB.getByTestId("br-you-hold")).toHaveCount(0);
      await playerExpect(brokerB.getByTestId("br-oo-empty")).toBeVisible();
      await playerExpect(pageB.getByTestId("account-chip")).toHaveText(handleB);
      const ledgerB = await readLedger(pageB);
      const ledgerA = await readLedger(pageA);
      if (ledgerB.cashCents !== 1_000_000 || Object.keys(ledgerB.positions).length !== 0 || Object.keys(ledgerB.orders).length !== 0) {
        throw new Error(`account B ledger was not empty: cash ${ledgerB.cashCents}, positions ${Object.keys(ledgerB.positions).join(",")}, orders ${Object.keys(ledgerB.orders).join(",")}`);
      }
      if (orderId in ledgerB.orders || !(orderId in ledgerA.orders)) {
        throw new Error(`order ${orderId} was not private to account A`);
      }
      await playerExpect(pageA.getByTestId("account-chip")).toHaveText(handleA);
      return `${handleB} has no holding and no open order; ${handleA} still owns ${orderId}`;
    });
    await record(journey, pageA, "persist", "persist", async () => {
      const before = await readLedger(pageA);
      const broker = await reloadBroker(pageA, viewport);
      await playerExpect(broker.getByTestId("br-you-hold")).toHaveText("You hold 1");
      await playerExpect(broker.locator(`[data-testid="br-oo-row-${orderId}"]`)).toBeVisible();
      const after = await readLedger(pageA);
      if (after.cashCents !== before.cashCents) throw new Error(`cash changed across reload: ${before.cashCents} -> ${after.cashCents}`);
      if (after.positions.HALC?.qty !== "1") throw new Error("holding did not survive reload");
      if (after.orders[orderId]?.status !== "WORKING" || after.orders[orderId]?.limit !== "1.00") {
        throw new Error("limit order did not survive reload");
      }
      return `after reload, still holding 1 HALC and working limit ${orderId}`;
    });
  } else {
    checks.push({ id: `${viewport}.isolation`, ok: false, detail: "market buy and resting limit did not both land" });
    checks.push({ id: `${viewport}.persist`, ok: false, detail: "market buy and resting limit did not both land" });
  }

  if (signedA) {
    await record(journey, pageA, "settings", "settings", async () => {
      await openSettings(pageA, viewport);
      await playerExpect(pageA.getByTestId("account-handle")).toHaveText(handleA);
      await playerExpect(pageA.getByTestId("account-world")).toContainText(WORLD_ID);
      return `Settings shows ${handleA}`;
    });
    await record(journey, pageA, "city", "city", async () => {
      await openCity(pageA, viewport);
      return "City opened on Financial Mile";
    });
  }
  return checks;
}

function contextOptions(viewport: ViewportName, baseURL: string) {
  if (viewport === "phone") {
    return {
      baseURL,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    };
  }
  return { baseURL, viewport: { width: 1280, height: 800 } };
}

export async function drivePlayerJourney(viewport: ViewportName | "both"): Promise<string> {
  const state = readState();
  if (!state) throw new Error("no verification server. Run launch, then doctor, then drive.");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(EVIDENCE_ROOT, stamp);
  mkdirSync(dir, { recursive: true });
  writeState({ ...state, evidenceDir: dir });
  const viewports: ViewportName[] = viewport === "both" ? ["desktop", "phone"] : [viewport];
  const checks: Check[] = [];
  let browserError = "";
  const browser = await chromium.launch({ args: ["--disable-lcd-text"] }).catch((err: unknown) => {
    browserError = err instanceof Error ? err.message : String(err);
    return null;
  });
  if (browser) {
    try {
      for (const name of viewports) {
        console.log(`playing ${name}`);
      const contextA = await browser.newContext(contextOptions(name, state.url));
        const contextB = await browser.newContext(contextOptions(name, state.url));
        try {
          checks.push(...await playViewport(contextA, contextB, name, dir));
        } finally {
          await contextA.close();
          await contextB.close();
        }
      }
    } finally {
      await browser.close();
    }
  } else {
    checks.push({ id: "browser", ok: false, detail: browserError });
  }
  const ok = checks.every((check) => check.ok) && checks.length > 0 && browserError === "";
  const report = { ok, url: state.url, port: state.port, pid: state.pid, viewports, checks };
  writeFileSync(path.join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const passed = checks.filter((check) => check.ok).length;
  const lines = [`${ok ? "PASS" : "FAIL"} ${passed}/${checks.length}`, ...checks.map((check) => `${check.ok ? "ok" : "FAIL"} ${check.id}: ${check.detail}`)];
  writeFileSync(path.join(dir, "summary.txt"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  console.log(`evidence ${dir}`);
  return dir;
}
