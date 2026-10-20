import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SPEC_TABLE } from "../../unit/shell/paletteTable";
import { boot, box, intents } from "./helpers";

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "desktop project only"));

test("S1-08 strip 34, shelf 52, release, phase, tick ring 22, NW, tiles, dividers", async ({ page }) => {
  await boot(page);
  expect((await box(page, "strip")).height).toBe(34);
  expect((await box(page, "shelf")).height).toBe(52);
  await expect(page.getByTestId("release")).toHaveText("Quay 2 · Owner");
  await expect(page.getByTestId("phase")).toHaveText("Market open · Port Avalon");
  const ring = await box(page, "tickring");
  expect([ring.width, ring.height]).toEqual([22, 22]);
  await expect(page.getByTestId("strip-nw")).toContainText("$412,860.15");
  const tiles = page.locator("[data-testid^=tile-]");
  expect(await tiles.first().getAttribute("data-testid")).toBe("tile-broker");
  const t = await tiles.first().boundingBox();
  expect([t?.width, t?.height]).toEqual([40, 40]);
  await expect(page.getByTestId("group-divider")).toHaveCount(4);
  await expect(page.getByRole("toolbar")).toHaveCount(1);
});

test("S1-07 every unlocked built:false app opens a ComingLater window; deep link shows the same", async ({ page }) => {
  await boot(page, "/?rank=R6&lic=LIC2&nw=200000&day=3&flags=charter.anyAvailable,api.eligible&guest=0");
  const ids = await page.locator("[data-testid^=tile-][data-state=unlocked]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(5)));
  expect(ids).toHaveLength(32);
  for (const id of ids.filter((i) => i !== "settings" && i !== "city")) {
    await page.getByTestId(`tile-${id}`).click();
    const win = page.getByTestId(`win-${id}`).first();
    await expect(win.getByTestId("coming-later")).toContainText("Coming later");
    await expect(win.getByRole("heading")).toHaveText(await win.locator(".tb-name").innerText());
    await expect(win.getByRole("button", { name: /buy|sell/i })).toHaveCount(0);
    await win.getByTestId("win-close").click();
  }
  await boot(page, "/wire");
  await expect(page.getByTestId("win-wire").getByTestId("coming-later")).toHaveText(/Wire\s*Coming later/);
});

test("S1-09 workspace slots by rank; apps open on workspace 1", async ({ page }) => {
  for (const [rank, n] of [["R0", 1], ["R1", 1], ["R2", 2], ["R3", 3], ["R6", 3]] as const) {
    await boot(page, `/?rank=${rank}`);
    await expect(page.getByTestId("ws-switcher").getByRole("button")).toHaveCount(n);
  }
  await page.getByTestId("ws-3").click();
  await page.getByTestId("tile-markets").click();
  await expect(page.getByTestId("ws-1")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("win-markets")).toBeVisible();
});

test("S1-10 named layouts at 1440×900 and absent at 1000", async ({ page }) => {
  const EXPECT: Record<string, [string, number, number, number, number][]> = {
    trade: [["broker", 8, 42, 947, 798], ["wire", 963, 42, 469, 395], ["portfolio", 963, 445, 469, 395]],
    review: [["portfolio", 8, 42, 708, 798], ["portfolio", 724, 42, 708, 798]],
    research: [["research", 8, 42, 947, 798], ["broker", 963, 42, 469, 395], ["wire", 963, 445, 469, 395]],
    operator: [["businesses", 8, 42, 708, 798], ["city", 724, 42, 708, 395], ["property", 724, 445, 708, 395]],
    shadow: [["security", 8, 42, 708, 798], ["ailab", 724, 42, 708, 798]],
    institution: [["institutions", 8, 42, 947, 798], ["messages", 963, 42, 469, 395], ["markets", 963, 445, 469, 395]],
  };
  await boot(page, "/?rank=R6&nw=200000&flags=charter.anyAvailable");
  for (const [id, rects] of Object.entries(EXPECT)) {
    await page.getByTestId("layout-btn").click();
    await page.getByTestId(`layout-${id}`).click();
    const got = await page.locator("[role=dialog][data-testid^=win-]").evaluateAll((els) =>
      els.map((e) => { const r = e.getBoundingClientRect(); return [e.getAttribute("data-testid")!.slice(4), r.x, r.y, r.width, r.height] as const; }));
    expect(got.length).toBe(rects.length);
    rects.forEach((r, i) => {
      expect(got[i][0]).toBe(r[0]);
      for (let k = 1; k < 5; k++) expect(Math.abs((got[i][k] as number) - (r[k] as number))).toBeLessThanOrEqual(1);
    });
  }
  expect(await intents(page)).toBe(0);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.getByTestId("layout-btn")).toHaveCount(0);
  await expect(page.getByTestId("layouts-menu")).toHaveCount(0);
});

test("S1-11 5th Broker and same-ticker deep link focus the existing window", async ({ page }) => {
  await boot(page);
  for (let i = 0; i < 5; i++) await page.getByTestId("tile-broker").click();
  await expect(page.getByTestId("win-broker")).toHaveCount(4);
  await boot(page, "/broker?asset=HALC");
  await expect(page.getByTestId("win-broker")).toHaveCount(1);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("HALC");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("win-broker")).toHaveCount(1);
});

test("S1-12 windows cannot be resized below their minimum", async ({ page }) => {
  await boot(page, "/broker");
  const h = await box(page, "resize-handle");
  await page.mouse.move(h.x + 5, h.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, 50, { steps: 5 });
  await page.mouse.up();
  const w = await box(page, "win-broker");
  expect([w.width, w.height]).toEqual([720, 420]);
});

test("S1-15 Shadow sub-palette in AI Lab and Security; Broker stays brass", async ({ page }) => {
  await boot(page, "/?nw=200000");
  for (const id of ["ailab", "security", "broker", "legal"]) await page.getByTestId(`tile-${id}`).click();
  const read = (id: string) => page.getByTestId(`win-${id}`).first().evaluate((el) => {
    const b = document.createElement("button");
    b.className = "btn-primary";
    el.appendChild(b);
    const cs = getComputedStyle(el);
    const bs = getComputedStyle(b);
    const out = { acc: cs.getPropertyValue("--acc").trim(), steel: cs.getPropertyValue("--steel").trim(), bg: bs.backgroundColor, border: bs.borderTopColor, steelRgb: "" };
    b.style.color = "var(--steel)";
    out.steelRgb = getComputedStyle(b).color;
    b.remove();
    return out;
  });
  for (const id of ["ailab", "security"]) {
    const r = await read(id);
    expect(r.acc).toBe(r.steel);
    expect(r.bg).toBe("rgba(0, 0, 0, 0)");
    expect(r.border).toBe(r.steelRgb);
  }
  expect((await read("broker")).acc.toUpperCase()).toBe("#C9A45C");
  expect((await read("legal")).acc.toUpperCase()).toBe("#C9A45C");
});

test("S1-16 reduced motion and reduced transparency in every shell state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page, "/settings");
  await page.locator("select").nth(1).selectOption("on");
  const check = () => page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (cs.backdropFilter && cs.backdropFilter !== "none") bad.push(`backdrop ${el.className}`);
      if (el.classList.contains("tickring-sweep")) continue;
      const durs = [...cs.transitionDuration.split(","), ...cs.animationDuration.split(",")].map((d) => parseFloat(d));
      if (durs.some((d) => d > 0)) bad.push(`motion ${el.tagName}.${el.className}`);
    }
    return { bad, motion: document.documentElement.dataset.motion, transparency: document.documentElement.dataset.transparency };
  });
  const states: [string, () => Promise<void>][] = [
    ["normal", async () => {}],
    ["layout menu", async () => { await page.getByTestId("layout-btn").click(); }],
    ["launcher", async () => { await page.keyboard.press("Escape"); await page.keyboard.press("Control+k"); }],
    ["key sheet", async () => { await page.keyboard.press("Escape"); await page.locator("body").click({ position: { x: 700, y: 600 } }); await page.keyboard.press("?"); }],
    ["focus", async () => { await page.keyboard.press("Escape"); await page.keyboard.press("Control+."); }],
  ];
  for (const [name, go] of states) {
    await go();
    const r = await check();
    expect(r.motion, name).toBe("reduce");
    expect(r.transparency, name).toBe("reduce");
    expect(r.bad, name).toEqual([]);
  }
});

test("S1-17 launcher, layouts, focus mode and shortcuts log zero intents", async ({ page }) => {
  await boot(page);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("buy 100 HALC limit 42");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.getByTestId("layout-btn").click();
  await page.getByTestId("layout-trade").click();
  for (const k of ["Control+.", "Control+.", "Alt+1", "Control+ArrowLeft", "Control+ArrowRight", "Control+ArrowUp", "Control+m", "Control+Alt+ArrowRight", "Alt+n", "Alt+w", "g", "p", "?", "Escape"]) {
    await page.keyboard.press(k);
  }
  expect(await intents(page)).toBe(0);
});

test("S1-18 R0 and R6: same launcher results, Broker limit and keys", async ({ page }) => {
  const run = async (rank: string) => {
    await boot(page, `/?rank=${rank}&nw=100&lic=LIC0`);
    const out: string[][] = [];
    for (const q of ["HALC", "open", "go to", "broker"]) {
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox").fill(q);
      out.push(await page.getByRole("option").allInnerTexts());
      await page.keyboard.press("Escape");
    }
    for (let i = 0; i < 5; i++) await page.keyboard.press("Alt+n");
    out.push([String(await page.getByTestId("win-broker").count())]);
    await page.keyboard.press("?");
    out.push(await page.locator(".keysheet dl").allInnerTexts());
    return out;
  };
  const r0 = await run("R0");
  expect(r0.at(-2)).toEqual(["4"]);
  expect(await run("R6")).toEqual(r0);
});

test("S1-19 axe: zero serious violations at 1440 and 1000", async ({ page }) => {
  for (const width of [1440, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, open] of [["/", false], ["/", true], ["/markets", false]] as const) {
      await boot(page, path);
      if (open) await page.keyboard.press("Control+k");
      const r = await new AxeBuilder({ page }).analyze();
      const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`), `${width} ${path} launcher=${open}`).toEqual([]);
    }
  }
  await boot(page, "/markets");
  await expect(page.getByRole("dialog", { name: "Markets" })).toBeVisible();
});

test("S1-20 City dynamic-imports @/city in its own chunk; Broker route has no three.js and ≤200 KB gz", async ({ page, request }) => {
  const scripts = new Map<string, number>();
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") scripts.set(r.url(), (await r.body()).length);
  });
  await boot(page, "/broker");
  await page.waitForLoadState("networkidle");
  const brokerChunks = [...scripts.keys()];
  const zlib = await import("node:zlib");
  let gz = 0;
  for (const url of brokerChunks) {
    const body = await (await request.get(url)).body();
    expect(body.toString().includes("WebGLRenderer"), url).toBe(false);
    gz += zlib.gzipSync(body).length;
  }
  console.log(`S1-20 broker first-load JS: ${brokerChunks.length} chunks, ${(gz / 1024).toFixed(1)} KB gzipped`);
  expect(gz).toBeLessThanOrEqual(200 * 1024);
  await page.getByTestId("tile-city").click();
  await expect(page.getByTestId("city-mount")).toBeAttached();
  await page.waitForLoadState("networkidle");
  const cityChunks = [...scripts.keys()].filter((u) => !brokerChunks.includes(u));
  console.log(`S1-20 chunks loaded on opening City: ${cityChunks.join(", ")}`);
  expect(cityChunks.length).toBeGreaterThan(0);
});

test("S1-03 computed tokens per palette; DOM identical across palettes", async ({ page }) => {
    await boot(page);
  const read = () => page.evaluate((names) => names.map((n) => getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim().toUpperCase().replace(/^#(\w)(\w)(\w)$/, "#$1$1$2$2$3$3")), SPEC_TABLE.map((r) => r[0]));
  await page.evaluate(() => delete document.documentElement.dataset.palette);
  expect(await read()).toEqual(SPEC_TABLE.map((r) => r[1]));
  const snap = () => page.locator("[data-testid=quay-ready]").evaluate((el) => el.outerHTML);
  const base = await snap();
  for (const [i, p] of ["ink-brass", "broadsheet", "phosphor", "riviera"].entries()) {
    await page.evaluate((v) => (document.documentElement.dataset.palette = v), p);
    expect(await read(), p).toEqual(SPEC_TABLE.map((r) => r[i + 1]));
    expect(await snap(), p).toBe(base);
  }
});
