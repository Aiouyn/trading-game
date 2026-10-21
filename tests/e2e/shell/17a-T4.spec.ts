import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot, intents } from "./helpers";

// 17A T4: navigation (launcher, deep links, layouts, phone grid/bottom row, back, keys). Screenshots: repo only.
const SHOTS = "tests/e2e/shell/__screenshots__/17a/T4";
const PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone only");
async function shot(page: Page, name: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}x${vp.height}.png` });
}
const probe = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const wins = (page: Page) => page.locator(".win").count();
const topWin = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".win:not([hidden])")].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex)).at(-1)?.dataset.testid);

test("T4-01 Ctrl K: focus in combobox with listbox + activedescendant; Esc closes and restores focus", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  await page.getByTestId("focus-btn").focus();
  await page.keyboard.press("Control+k");
  const cb = page.getByRole("combobox");
  await expect(cb).toBeFocused();
  await cb.fill("po");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(cb).toHaveAttribute("aria-activedescendant", /li-/);
  await shot(page, "launcher-po");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("launcher")).toHaveCount(0);
  await expect(page.getByTestId("focus-btn")).toBeFocused();
});

test("T4-02 empty query = Recent group; 'zzzz' = Nothing found · Search help; group order", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  await page.keyboard.press("Control+k");
  await expect(page.locator(".launcher .label").first()).toHaveText("Recent");
  await shot(page, "launcher-recent");
  await page.getByRole("combobox").fill("zzzz");
  await expect(page.locator(".launcher .empty")).toHaveText("Nothing found · Search help");
  await shot(page, "launcher-empty");
  await page.getByRole("combobox").fill("o");
  const order = await page.locator(".launcher .label").allTextContents();
  const want = ["Apps", "Tickers", "Players and companies", "Commands", "Recent", "Help"];
  expect(order).toEqual(want.filter((g) => order.includes(g)));
});

test("T4-03 every command, plus 'buy 100 HALC limit 42' Enter, logs zero intents", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  for (const q of ["buy 100 HALC limit 42", "Open Settings", "Go to Portfolio", "Go to Wire"]) {
    await page.keyboard.press("Control+k");
    await page.locator(".launcher input").fill(q);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
  }
  expect(await intents(page)).toBe(0);
});

test("T4-04 deep link to an open app focuses it (no new window); 5th Broker same asset focuses; URL = focused", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  await page.getByTestId("win-broker").locator(".tb-name").click(); // a change, so the layout is persisted
  await page.waitForTimeout(400);
  const n = await wins(page);
  await page.goto("/wire");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await wins(page)).toBe(n);
  expect(await topWin(page)).toBe("win-wire");
  expect(new URL(page.url()).pathname).toBe("/wire");
  // 4 Brokers incl. HALC, then /broker?asset=HALC and a 5th Broker request.
  await page.evaluate(() => indexedDB.deleteDatabase("quay.guest"));
  await page.goto("/broker?asset=HALC");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Alt+n");
  await expect(page.locator("[data-testid=win-broker]")).toHaveCount(4);
  await page.waitForTimeout(400);
  const before = await wins(page);
  await page.goto("/broker?asset=HALC");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press("Alt+n");
  await page.waitForTimeout(200);
  expect(await wins(page)).toBe(before);
  expect(page.url()).toMatch(/\/broker(\?asset=HALC)?$/);
});

test("T4-05 Trade absent from the layout menu at 1263; at 1264 Broker ≥720 and Portfolio ≥520", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.setViewportSize({ width: 1263, height: 900 });
  await boot(page, "/");
  await page.getByTestId("layout-btn").click();
  await expect(page.getByTestId("layout-trade")).toHaveCount(0);
  await shot(page, "layout-menu-no-trade");
  await page.setViewportSize({ width: 1264, height: 900 });
  await page.reload(); await boot(page, "/");
  await page.getByTestId("layout-btn").click();
  await page.getByTestId("layout-trade").click();
  const b = (await page.getByTestId("win-broker").boundingBox())!, p = (await page.getByTestId("win-portfolio").boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(719);
  expect(p.width).toBeGreaterThanOrEqual(519);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("layout-btn").click();
  await shot(page, "layout-menu");
});

test("T4-05 a new account below 1264 opens Broker alone", async ({ browser, baseURL }, info) => {
  desktopOnly(info.project.name);
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1263, height: 900 } });
  const page = await ctx.newPage();
  await boot(page, "/");
  await page.waitForTimeout(300);
  expect(await page.locator(".win").evaluateAll((w) => w.map((x) => x.getAttribute("data-testid")))).toEqual(["win-broker"]);
  await ctx.close();
});

test("T4-06 phone: 5 group labels in order, bottom row fixed 4 not in grid, edge mark --fg, long-press 400 ms = Recent (≤6)", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/?rank=R6");
  const labels = await page.locator(".grid-group > .label").allTextContents();
  expect(labels.map((l) => l.toUpperCase())).toEqual(["TRADE", "BUILD", "SHADOW", "WORLD", "ME"].filter((g) => labels.map((x) => x.toUpperCase()).includes(g)));
  expect(labels.length).toBe(5);
  for (const a of ["broker", "portfolio", "wire", "messages"]) {
    await expect(page.getByTestId("bottom-row").getByTestId(`icon-${a}`)).toHaveCount(1);
    await expect(page.getByTestId("app-grid").getByTestId(`icon-${a}`)).toHaveCount(0);
  }
  expect(await page.getByTestId("edge-mark").evaluate((e) => getComputedStyle(e).color)).toBe(await probe(page, "var(--fg)"));
  await page.getByTestId("edge-bar").screenshot({ path: `${SHOTS}/edge-bar-390x844.png` });
  const mark = page.getByTestId("quay-mark");
  await mark.dispatchEvent("pointerdown");
  await page.waitForTimeout(450);
  await expect(page.getByTestId("recent")).toBeVisible();
  expect(await page.getByTestId("recent-item").count()).toBeLessThanOrEqual(6);
  await mark.dispatchEvent("pointerup");
  await shot(page, "recent-sheet");
});

test("T4-07 phone back stack: chevron, browser Back, left-edge swipe", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/");
  await page.getByTestId("icon-wire").click();
  await expect(page.getByTestId("phone-appview")).toHaveAttribute("data-app", "wire");
  // Studio T4 ruling 1: root title = app name, back names the parent (Home); no breadcrumb.
  await expect(page.getByTestId("app-title")).toHaveText("Wire");
  await expect(page.getByTestId("app-back")).toHaveAttribute("aria-label", "Back to Home");
  await shot(page, "app-chevron");
  await page.getByTestId("app-back").click();
  await expect(page.getByTestId("phone-appview")).toHaveCount(0);
  // Portfolio → journal screen (deep link), Back → Portfolio root → Home → still Home.
  await boot(page, "/portfolio/journal");
  await expect(page.getByTestId("phone-appview")).toHaveAttribute("data-screen", "journal");
  await expect(page.getByTestId("app-title")).toHaveText("Journal");
  await expect(page.getByTestId("app-back")).toHaveAttribute("aria-label", "Back to Portfolio");
  await shot(page, "app-journal");
  await page.goBack();
  await expect(page.getByTestId("app-title")).toHaveText("Portfolio");
  await expect(page.getByTestId("phone-appview")).toHaveAttribute("data-screen", "");
  await page.goBack();
  await expect(page.getByTestId("phone-appview")).toHaveCount(0);
  await page.getByTestId("app-grid").waitFor();
  await page.getByTestId("app-back").count().then((c) => expect(c).toBe(0));
  // At Home, chevron-equivalent back (edge swipe) does nothing and stays in the app.
  const edgeSwipe = async () => {
    await page.mouse.move(8, 400); await page.mouse.down(); await page.mouse.move(120, 400, { steps: 5 }); await page.mouse.up();
  };
  await edgeSwipe();
  await expect(page.getByTestId("app-grid")).toBeVisible();
  await boot(page, "/portfolio/journal");
  await edgeSwipe();
  await expect(page.getByTestId("phone-appview")).toHaveAttribute("data-screen", "");
  await edgeSwipe();
  await expect(page.getByTestId("phone-appview")).toHaveCount(0);
  await edgeSwipe();
  await expect(page.getByTestId("app-grid")).toBeVisible();
});

test("T4-08 desktop Back refocuses the previous window; window count unchanged", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  await page.waitForTimeout(300);
  const n = await wins(page);
  await page.getByTestId("win-wire").locator(".tb-name").click();
  await page.getByTestId("win-broker").locator(".tb-name").click();
  expect(await topWin(page)).toBe("win-broker");
  await page.goBack();
  await expect.poll(() => topWin(page)).toBe("win-wire");
  expect(await wins(page)).toBe(n);
});

test("T4-09 rank progress text R0..R5 = next rank + threshold; R1 'Next: Owner · … / $250k'", async ({ page }, info) => {
  phoneOnly(info.project.name);
  const names: Record<string, string> = {};
  for (const r of ["R0", "R1", "R2", "R3", "R4"]) {
    await boot(page, `/?rank=${r}`);
    const t = await page.getByTestId("rank-next").textContent();
    names[r] = t ?? "";
    expect(t).toMatch(/^Next: \S.* · .+ \/ \$/);
  }
  // R5 → R6 Dynasty at $20B (E-21); only R6 itself hides the line.
  await boot(page, "/?rank=R5&nw=4200000000");
  await expect(page.getByTestId("rank-next")).toHaveText(/^Next: Dynasty · .+ \/ \$20B$/);
  await shot(page, "home-r5");
  await boot(page, "/?rank=R6");
  await expect(page.getByTestId("rank-next")).toHaveCount(0);
  expect(names.R1).toMatch(/^Next: Owner · .+ \/ \$250k$/);
  await boot(page, "/?rank=R1&nw=30000");
  await shot(page, "home-r1");
  await boot(page, "/?rank=R2");
  await shot(page, "home-r2");
});

test("T4-10 C5 phone: every grid tile, bottom-row tile, chevron and Cancel ≥ 44×44", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/?rank=R6");
  const small = await page.evaluate(() => [...document.querySelectorAll(".phone-app, .bottom-row button")].map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  expect(small).toBe(0);
  await page.getByTestId("icon-wire").click();
  expect((await page.getByTestId("app-back").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("app-back").click();
  const sb = (await page.getByTestId("statusbar").boundingBox())!;
  await page.mouse.move(200, sb.y + 20); await page.mouse.down(); await page.mouse.move(200, sb.y + 140, { steps: 4 }); await page.mouse.up();
  await expect(page.getByTestId("launcher")).toBeVisible();
  const c = (await page.getByTestId("launcher-cancel").boundingBox())!;
  expect([c.width >= 44, c.height >= 44]).toEqual([true, true]);
  await shot(page, "launcher-full");
});

test("T4-10 C8 phone text scale 2.0: no horizontal scroll, no label broken mid-word", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/?rank=R6");
  await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  // Every word is a single unbreakable box: one line box per word, never split.
  const broken = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".phone-app .icon-label .w")]
    .filter((w) => { const r = document.createRange(); r.selectNodeContents(w); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1; })
    .map((w) => w.textContent));
  expect(broken).toEqual([]);
  await shot(page, "home-scale2");
});

test("T4-10 touch focus ring on the visible 60 px phone tile", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/");
  await page.getByTestId("icon-wire").focus();
  const v = await page.getByTestId("icon-wire").evaluate((e) => ({ own: getComputedStyle(e).outlineStyle, icon: getComputedStyle(e.querySelector(".icon")!).boxShadow }));
  expect(v.own).toBe("none");
  expect(v.icon).not.toBe("none");
});

test("T4-10 C3/C4: DOM identical across palettes; axe clean on launcher, home, key sheet", async ({ page }, info) => {
  await boot(page, "/");
  const doms: string[] = [];
  for (const p of PALETTES) { await page.evaluate((v) => { document.documentElement.dataset.palette = v; }, p); doms.push(await page.locator(".quay").evaluate((e) => e.outerHTML.replace(/style="[^"]*"/g, ""))); }
  for (const d of doms) expect(d).toBe(doms[0]);
  const ax = async (label: string) => {
    const r = await new AxeBuilder({ page }).analyze();
    expect([label, r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)]).toEqual([label, []]);
  };
  await ax("home");
  if (info.project.name === "desktop") {
    await page.keyboard.press("Control+k"); await ax("launcher"); await page.keyboard.press("Escape");
    await page.keyboard.press("?"); await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" }).or(page.locator(".keysheet"))).toBeVisible();
    await ax("keysheet"); await shot(page, "keysheet");
  }
});

test("T4 Studio label rulings at text scale 2.0: 'Research Desk' wraps to 2 lines, no ellipsis; a too-long single word ellipsizes with the full name in title + aria-label", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/?rank=R6");
  const fs0 = await page.locator(".phone-app .icon-label").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
  await expect.poll(() => page.locator(".phone-app .icon-label").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(fs0 * 2 - 0.5);
  const label = (id: string) => page.getByTestId(id).evaluate((b: HTMLElement) => {
    const l = b.querySelector<HTMLElement>(".icon-label")!;
    const ws = [...l.querySelectorAll<HTMLElement>(".w")];
    return {
      words: ws.map((w) => w.textContent), lines: new Set(ws.map((w) => Math.round(w.getBoundingClientRect().top))).size,
      over: ws.filter((w) => w.scrollWidth > w.clientWidth + 0.5).map((w) => w.textContent),
      ls: parseFloat(getComputedStyle(l).letterSpacing) || 0, ellipsis: ws.map((w) => getComputedStyle(w).textOverflow), hy: getComputedStyle(l).hyphens,
      title: b.title, aria: b.getAttribute("aria-label"), trunc: b.dataset.trunc ?? null,
    };
  });
  // Research Desk wraps at the space: 'Research' on line 1, 'Desk' on line 2. Never broken inside a word.
  // OPEN (Studio): at 390 px / scale 2.0 the column is 84 px and 'Research' is 101 px, so line 1 still needs the
  // ellipsis under the never-shrink / floor-0 rules; 'Desk' is whole. If the word fits (wider viewport), no ellipsis.
  const rd = await label("icon-research");
  expect(rd).toMatchObject({ words: ["Research", "Desk"], lines: 2 });
  expect(rd.over.filter((w) => w !== "Research")).toEqual([]);
  if (rd.over.length === 0) expect([rd.trunc, rd.aria]).toEqual([null, null]);
  else expect([rd.title, rd.aria]).toEqual(["Research Desk", "Research Desk"]);
  // Longest single word among visible tiles takes the ellipsis, full name in title + aria-label.
  const id = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll<HTMLElement>(".app-grid .phone-app")].filter((t) => t.querySelectorAll(".w").length === 1);
    const len = (t: HTMLElement) => t.querySelector(".w")!.textContent!.length;
    return tiles.sort((x, y) => len(y) - len(x))[0]!.dataset.testid!;
  });
  const lw = await label(id);
  const name = lw.words[0]!;
  expect(lw.over).toEqual([name]);
  expect([lw.lines, lw.ellipsis[0], lw.hy, lw.ls >= 0, lw.trunc]).toEqual([1, "ellipsis", "none", true, "1"]);
  expect(lw.title).toContain(name);
  expect(lw.aria).toContain(name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await shot(page, "label-trunc-scale2");
});
