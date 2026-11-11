import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { setTextScale } from "../shell/helpers";

const b = (page: Page) => page.getByTestId("broker").first();
const shots = process.env.TICKET_ENTRY_SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
}
async function narrowDesktop(page: Page) {
  const win = page.getByTestId("win-broker");
  const handle = await win.getByTestId("resize-handle").boundingBox();
  const box = await win.boundingBox();
  if (!handle || !box) throw new Error("Broker resize handle is missing");
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 5 - (box.width - 520), handle.y + 5, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await win.boundingBox())?.width ?? 0)).toBe(520);
}
async function ticketEntry(page: Page, phone: boolean) {
  const entry = b(page).getByTestId("br-ticket-entry");
  await expect(entry).toBeInViewport({ ratio: 1 });
  const box = await entry.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(phone ? 44 : 28);
  if (!box) throw new Error("Ticket entry is missing");
  expect(await entry.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === el;
  })).toBe(true);
  return entry;
}

test("ticket entry: visible before the chart, keyboard navigation only, draft preserved, explicit review and real fill", async ({ page, baseURL }, info) => {
  test.setTimeout(90_000);
  const phone = info.project.name === "phone";
  const request = page.context().request;
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL! }, data: { handle: `Ticket${info.project.name}${Date.now().toString(36)}`, password: "local-ticket-entry-test" } });
  expect(res.status()).toBe(201);
  await page.goto("/broker?asset=HALC");
  await expect(b(page)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await expect(page.getByTestId("account-chip").first()).toBeVisible();
  await expect(b(page).getByTestId("market-tick")).toBeVisible();
  if (!phone) {
    await expect(b(page).getByTestId("br-ticket-entry")).toBeHidden();
    await shot(page, "desktop-wide-unchanged");
    await narrowDesktop(page);
  }
  const sent: string[] = [];
  page.on("request", (r) => { if (/\/api\/broker\/(orders|preview)(?:$|\?)/.test(r.url())) sent.push(r.url()); });
  const entry = await ticketEntry(page, phone);
  await shot(page, `${info.project.name}-entry`);
  const targetId = await entry.getAttribute("aria-controls");
  expect(targetId).toBeTruthy();
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(b(page).getByRole("group", { name: "Order ticket", exact: true })).toBeFocused();
  await expect(b(page).getByTestId("br-side-buy")).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Tab");
  await expect(b(page).getByTestId("br-side-buy")).toBeFocused();
  expect(sent).toEqual([]);
  await expect(b(page).getByTestId("br-qty")).toHaveValue("");
  await expect(b(page).getByTestId("br-review")).toBeDisabled();
  await shot(page, `${info.project.name}-ticket`);

  await b(page).getByTestId("br-qty").fill("1");
  await expect(b(page).getByTestId("br-review")).toBeEnabled();
  await entry.scrollIntoViewIfNeeded();
  await entry.click();
  await expect(b(page).getByTestId("br-qty")).toHaveValue("1");
  await expect(b(page).getByTestId("br-side-buy")).toHaveAttribute("aria-pressed", "true");
  await expect(b(page).getByTestId("br-type-market")).toHaveAttribute("aria-pressed", "true");
  const before = await (await request.get("/api/broker/me")).json();
  expect(before.fills).toEqual([]);
  expect(before.orders).toEqual({});
  await b(page).getByTestId("br-review").click();
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 15_000 });
  await shot(page, `${info.project.name}-review`);
  await page.getByTestId("br-place").first().click();
  await expect(b(page).getByTestId("br-ack")).toBeVisible({ timeout: 20_000 });
  await expect(b(page).getByTestId("br-ack-title")).toContainText("Bought 1 HALC");
  await shot(page, `${info.project.name}-fill`);
  await page.goto("/portfolio");
  await expect(page.getByTestId("pf-overview")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await page.getByTestId(phone ? "pf-open-positions" : "pf-tab-positions").click();
  await expect(page.locator('[data-testid="pos-row"][data-asset="HALC"]')).toBeVisible();
  await shot(page, `${info.project.name}-portfolio-position`);
  const after = await (await request.get("/api/broker/me")).json();
  expect(after.fills).toHaveLength(1);
});

test("French ticket entry is visible and About has no stale ticket target", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/broker?asset=HALC&locale=fr");
  await expect(b(page)).toHaveAttribute("data-state", "live");
  if (info.project.name === "desktop") await narrowDesktop(page);
  const entry = await ticketEntry(page, info.project.name === "phone");
  await expect(entry).toHaveText("Aller au ticket d’ordre");
  await entry.click();
  await expect(b(page).getByRole("group", { name: "Ticket d’ordre", exact: true })).toBeFocused();
  await shot(page, `${info.project.name}-french-ticket`);
  await b(page).getByTestId("br-view-about").click();
  await expect(b(page).getByTestId("br-ticket-entry")).toHaveCount(0);
});

test("phone at 200% text keeps the ticket entry reachable without horizontal overflow", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone scale case");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  await expect(page.getByTestId("settings")).toBeVisible();
  await setTextScale(page, "2");
  await page.getByTestId("app-back").click();
  await page.getByTestId("icon-broker").click();
  await expect(b(page)).toHaveAttribute("data-state", "live");
  const entry = await ticketEntry(page, true);
  await shot(page, "phone-scale2-entry");
  await entry.click();
  await expect(b(page).getByRole("group", { name: "Order ticket", exact: true })).toBeFocused();
  await expect(b(page).getByTestId("br-side-buy")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "phone-scale2-ticket");
});
