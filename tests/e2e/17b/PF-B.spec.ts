// UI card 3 (17B PF-B) Portfolio positions: rows A→Z, Today, halt chip, badges, empty, states, row label, desktop
// columns + 520 px window, phone cards at text scale 1 / 2, colour-blind Broadsheet. Pledged qty comes from the mock's
// QUAY_HOOKS-only `?pledge=HALC:40` scenario (otherwise it sends "0"; PF-A removed body injection). Shots with SHOTS=1.
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { boot, setTextScale } from "../shell/helpers";

// Same place as the other specs (CI sets SHOTS=1); POS_SHOTS_DIR overrides it for local review shots.
const SHOTS = process.env.POS_SHOTS_DIR ?? "tests/e2e/17b/__screenshots__/PF-B";
const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const pos = (page: Page) => page.getByTestId("pf-positions").first();
const rows = (page: Page) => pos(page).getByTestId("pos-row");
async function shot(page: Page, name: string) {
  if (!process.env.SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}x${vp.height}.png` });
}

async function openPositions(page: Page, query = "", phone = false, state = "live") {
  await boot(page, `/portfolio${query}`);
  if (phone) await page.getByTestId("pf-open-positions").click();
  else await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(pos(page)).toHaveAttribute("data-state", state);
}
const isPhone = (n: string) => n === "phone";

test("PF-3-01 three rows A→Z with the contract strings", async ({ page }, info) => {
  await openPositions(page, "", isPhone(info.project.name));
  await expect(rows(page)).toHaveCount(3);
  expect(await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-asset")))).toEqual(["AVB", "HALC", "VOLT"]);
  const halc = rows(page).nth(1);
  await expect(halc.getByTestId("pos-value")).toHaveText("$50,616.00");
  if (!isPhone(info.project.name)) {
    await expect(halc.getByTestId("pos-qty")).toHaveText("1,200");
    await expect(halc.getByTestId("pos-avg")).toHaveText("39.90");
    await expect(halc.getByTestId("pos-last")).toHaveText(/^\d+\.\d\d$/);
  } else await expect(halc.getByTestId("pos-qtyat")).toHaveText("1,200 @ 39.90");
  await expect(halc.getByTestId("pos-pnl")).toHaveText(/^[▲▼][+−]\$[\d,]+\.\d\d$/);
  await shot(page, isPhone(info.project.name) ? "list" : "normal");
});

test("PF-3-02 Today: chgPct + %, sign colour and arrow", async ({ page }, info) => {
  await openPositions(page, "", isPhone(info.project.name));
  // Positions can go live before the markets channel; Today shows "—" until each ticker arrives.
  await expect(pos(page).locator('[data-testid="pos-today"][data-dir]')).toHaveCount(3);
  for (const t of await pos(page).getByTestId("pos-today").all()) {
    const txt = (await t.textContent())!;
    expect(txt).toMatch(/^(▲\d+\.\d\d%|▼−\d+\.\d\d%|0\.00%)$/);
    const want = txt.startsWith("▲") ? "var(--gain)" : txt.startsWith("▼") ? "var(--loss)" : "var(--fg-muted)";
    expect(await t.evaluate((e) => getComputedStyle(e).color)).toBe(await color(page, want));
  }
});

test("PF-3-03 halted HALC: steel 'Halted' chip, no brass on the row", async ({ page }, info) => {
  await openPositions(page, "?halt=HALC", isPhone(info.project.name));
  const chip = rows(page).nth(1).getByTestId("pos-halted");
  await expect(chip).toHaveText("Halted");
  expect(await chip.evaluate((e) => getComputedStyle(e).color)).toBe(await color(page, "var(--steel)"));
  await expect(rows(page).nth(0).getByTestId("pos-halted")).toHaveCount(0);
  const acc = await color(page, "var(--acc)");
  const used = await rows(page).evaluateAll((els) => els.flatMap((r) => [r, ...r.querySelectorAll("*")]).flatMap((e) => { const c = getComputedStyle(e); return [c.color, c.borderTopColor, c.backgroundColor]; }));
  expect(used).not.toContain(acc);
  await shot(page, "halted-HALC");
});

test("PF-3-04 Pledged 40 badge (mock ?pledge=); neutral steel outline, --fg-muted text", async ({ page }, info) => {
  await openPositions(page, "?pledge=HALC:40", isPhone(info.project.name));
  const chip = rows(page).nth(1).getByTestId("pos-pledged");
  await expect(chip).toHaveText("Pledged 40");
  const [c, b] = await chip.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).borderTopColor]);
  expect([c, b]).toEqual([await color(page, "var(--fg-muted)"), await color(page, "var(--steel)")]);
  await expect(pos(page).getByTestId("pos-lent")).toHaveCount(0);
});

test("PF-3-05 empty: 'No positions yet.' + 'Your money is all cash.'", async ({ page }, info) => {
  await openPositions(page, "?empty=1", isPhone(info.project.name));
  await expect(pos(page).getByTestId("pos-empty")).toHaveText("No positions yet.Your money is all cash.");
  await expect(rows(page)).toHaveCount(0);
  await expect(pos(page).getByRole("button")).toHaveCount(0);
  await shot(page, "empty");
});

test("PF-3-06 states: 3 skeleton rows, Couldn't load + Retry, stale Updating… with Last --fg-disabled", async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openPositions(page, "?feed=loading", phone, "loading");
  await expect(pos(page).getByTestId("pos-skel")).toHaveCount(3);
  for (const mode of ["denied", "error"]) {
    await openPositions(page, `?feed=${mode}`, phone, mode);
    await expect(pos(page).getByTestId("pos-error")).toHaveText("Couldn't loadRetry");
  }
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await openPositions(page, "?feed=stale", phone);
  await page.clock.runFor(23_000);
  await expect(pos(page)).toHaveAttribute("data-state", "stale");
  await expect(pos(page).getByTestId("pos-updating")).toHaveText("Updating…");
  if (!phone) expect(await rows(page).nth(1).getByTestId("pos-last").evaluate((e) => getComputedStyle(e).color)).toBe(await color(page, "var(--fg-disabled)"));
});

test("PF-3-07 HALC row label and focus", async ({ page }, info) => {
  await openPositions(page, "", isPhone(info.project.name));
  const halc = rows(page).nth(1);
  await expect(halc).toHaveAttribute("aria-label", /^HALC, 1,200 shares, value 50,616\.00 dollars, (up|down) \d+\.\d\d percent today, average cost 39\.90, last \d+\.\d\d$|^HALC, 1,200 shares, value 50,616\.00 dollars, unchanged today/);
  await expect(halc).toHaveAttribute("tabindex", "0");
  await halc.focus();
  await expect(halc).toBeFocused();
});

test("PF-3-08 desktop: 8 columns at 1440 (Weight after Value), Weight/Avg/Last hidden at the 520 window, row hit ≥ 28", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openPositions(page);
  const win = page.getByTestId("win-portfolio").first();
  await expect(win.locator("thead th")).toHaveText(["Asset", "Qty", "Avg cost", "Last", "Today", "Value", "Weight", "P&L"]);
  await expect(rows(page).first().getByTestId("pos-weight")).toHaveText("3.6%");
  await expect(rows(page).first().getByTestId("pos-pnl-pct")).toHaveText("(+4.4%)");
  for (const r of await rows(page).all()) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(28);
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  expect((await win.boundingBox())!.width).toBe(520);
  await expect(win.locator("thead th:visible")).toHaveText(["Asset", "Qty", "Today", "Value", "P&L"]);
  await expect(rows(page).nth(1)).toHaveAttribute("aria-label", /average cost 39\.90, last /);
  expect(await win.getByTestId("pos-table").evaluate((e) => e.scrollWidth <= e.parentElement!.clientWidth + 0.5)).toBe(true);
  await shot(page, "window-520");
});

test("PF-3-09 phone: pushed 'Positions', 3-line cards, no overflow, rows ≥ 44 at scale 1 and 2", async ({ page }, info) => {
  phoneOnly(info.project.name);
  for (const scale of ["1", "2"]) {
    await boot(page, "/settings");
    await setTextScale(page, scale);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("icon-portfolio").click();
    await page.getByTestId("pf-open-positions").click();
    await expect(pos(page)).toHaveAttribute("data-state", "live");
    await expect(page.getByTestId("app-title")).toHaveText("Positions");
    await expect(page.getByTestId("app-back")).toHaveAttribute("aria-label", "Back to Portfolio");
    await expect(pos(page).locator("table")).toHaveCount(0);
    for (const r of await rows(page).all()) {
      expect((await r.boundingBox())!.height, `scale ${scale}`).toBeGreaterThanOrEqual(44);
      await expect(r.locator(".pos-line")).toHaveCount(3);
    }
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
      && [...document.querySelectorAll("[data-testid=pf-positions] *")].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5));
    expect(ok, `scale ${scale}`).toBe(true);
    // An amount never wraps away from its sign / symbol.
    for (const m of await pos(page).locator(".money").all()) expect(await m.evaluate((e) => getComputedStyle(e).whiteSpace)).toBe("nowrap");
    if (scale === "2") await shot(page, "text-scale-2");
  }
});

// Studio PF-B round 2: at text scale >= 1.5 every card has the same 3 lines whatever the string length. HALC (the
// longest amounts) and AVB (short ticker) are measured: line 1 ticker | P&L, line 2 value · weight, line 3 qty @ avg |
// Today; left and right clusters on one row, >= 12 px apart; no amount on two lines.
test("PF-3-09b text scale 2: HALC and a short ticker (AVB) get the same 3-line geometry", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/settings");
  await setTextScale(page, "2");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByTestId("icon-portfolio").click();
  await page.getByTestId("pf-open-positions").click();
  await expect(pos(page)).toHaveAttribute("data-state", "live");
  const geo = (asset: string) => pos(page).locator(`[data-testid=pos-row][data-asset=${asset}]`).evaluate((row) => {
    const box = (e: Element | null) => { const b = e!.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height }; };
    const lines = [...row.querySelectorAll(":scope > .pos-line")];
    const lh = parseFloat(getComputedStyle(row).lineHeight) || parseFloat(getComputedStyle(row).fontSize) * 1.6;
    const pair = (line: Element) => { const k = [...line.children]; return k.length === 2 ? { left: box(k[0]), right: box(k[1]) } : { left: box(k[0]), right: null }; };
    const amounts = [...row.querySelectorAll(".money, .num")].map((e) => (e as HTMLElement).getClientRects().length);
    return { n: lines.length, tops: lines.map((l) => box(l).t), p: lines.map(pair), lh, amounts,
      ticker: row.querySelector("[data-testid=pos-ticker]")!.textContent, rowRight: box(row).r };
  });
  const halc = await geo("HALC"), avb = await geo("AVB");
  for (const g of [halc, avb]) {
    expect(g.n, g.ticker!).toBe(3);
    expect(g.tops[0] < g.tops[1] && g.tops[1] < g.tops[2], g.ticker!).toBe(true);
    for (const i of [0, 2]) {
      const { left, right } = g.p[i];
      expect(right, `${g.ticker} line ${i + 1}`).not.toBeNull();
      expect(Math.abs(left.t - right!.t), `${g.ticker} line ${i + 1} same row`).toBeLessThan(g.lh / 2);
      expect(right!.l - left.r, `${g.ticker} line ${i + 1} gap`).toBeGreaterThanOrEqual(12);
      expect(right!.r, `${g.ticker} line ${i + 1} fits`).toBeLessThanOrEqual(g.rowRight + 0.5);
    }
    expect(g.p[1].right, `${g.ticker} line 2 is one cluster`).toBeNull();
    expect(g.p[0].left.l, `${g.ticker} keeps the 16 px phone side margin`).toBeGreaterThanOrEqual(16);
    expect(390 - g.rowRight, `${g.ticker} right margin`).toBeGreaterThanOrEqual(16);
    expect(g.amounts.every((n) => n === 1), `${g.ticker} amounts on one line`).toBe(true);
  }
  // Same layout: same line count, and each line's left cluster starts at the same x.
  expect(halc.p.map((x) => Math.round(x.left.l))).toEqual(avb.p.map((x) => Math.round(x.left.l)));
});

test("PF-3-10 colour-blind Broadsheet: Today / P&L use the cb tokens, arrows present", async ({ page }, info) => {
  await openPositions(page, "", isPhone(info.project.name));
  await page.evaluate(() => { document.documentElement.dataset.palette = "broadsheet"; document.documentElement.dataset.cb = "1"; });
  expect([await color(page, "var(--gain)"), await color(page, "var(--loss)")]).toEqual(["rgb(8, 101, 122)", "rgb(168, 35, 90)"]);
  for (const el of [...await pos(page).getByTestId("pos-today").all(), ...await pos(page).getByTestId("pos-pnl").all()]) {
    const dir = await el.getAttribute("data-dir");
    if (dir === "flat") continue;
    await expect(el.locator(".pos-arrow")).toHaveText(dir === "up" ? "▲" : "▼");
    expect(await el.evaluate((e) => getComputedStyle(e).color)).toBe(dir === "up" ? "rgb(8, 101, 122)" : "rgb(168, 35, 90)");
  }
  await shot(page, "broadsheet-cb");
});
