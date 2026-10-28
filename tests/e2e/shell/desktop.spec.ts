import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { LAYOUT_RECTS_1440 } from "../../unit/shell/layoutRects";
import { SPEC_TABLE } from "../../unit/shell/paletteTable";
import { boot, box, intents, setReducedTransparency } from "./helpers";

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "desktop project only"));

test("Protection chip only while active; no shield chip without a data source", async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId("protection-chip")).toHaveCount(0);
  await boot(page, "/?prot=1");
  await expect(page.getByTestId("protection-chip")).toHaveText("Protected · 41:12");
  await expect(page.getByTestId("shield-chip")).toHaveCount(0);
});

test("S1-08 strip 34, shelf 52, release, phase, tick ring 22, NW, tiles, dividers", async ({ page }) => {
  await boot(page, "/?nw=412860.15"); // pinned: the mock feed now moves NW with marks every tick (one NW source, #67)
  expect((await box(page, "strip")).height).toBe(34);
  expect((await box(page, "shelf")).height).toBe(52);
  await expect(page.getByTestId("release")).toHaveText("Quay 2 · Owner");
  await expect(page.getByTestId("phase")).toHaveText("Market open · Port Avalon");
  const ring = await box(page, "tickring");
  expect([ring.width, ring.height]).toEqual([22, 22]);
  // 17A T2: the strip NW is MoneyText ctx=chip (abbreviated, full value in title).
  await expect(page.getByTestId("strip-nw")).toContainText("$412k"); // shared compact formatter: rounds down
  await expect(page.getByTestId("strip-nw").locator("[title]")).toHaveAttribute("title", "$412,860.15");
  const tiles = page.locator("[data-testid^=tile-]");
  expect(await tiles.first().getAttribute("data-testid")).toBe("tile-broker");
  const t = await tiles.first().boundingBox();
  expect([t?.width, t?.height]).toEqual([40, 40]);
  await expect(page.getByTestId("group-divider")).toHaveCount(4);
  await expect(page.getByRole("toolbar")).toHaveCount(1);
});

test("S1-07 every unlocked built:false app opens a ComingLater window; deep link shows the same", async ({ page }) => {
  await boot(page, "/?rank=R6&lic=LIC2&nw=200000&flags=charter.anyAvailable,api.eligible,character.day3&guest=0");
  const ids = await page.locator("[data-testid^=tile-][data-state=unlocked]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(5)));
  expect(ids).toHaveLength(32);
  // Wire is built (UI card 1, WIR-A): it renders its feed, covered by tests/e2e/17b/WIR-A.spec.ts.
  for (const id of ids.filter((i) => i !== "settings" && i !== "city" && i !== "wire")) {
    await page.getByTestId(`tile-${id}`).click();
    const win = page.getByTestId(`win-${id}`).first();
    if (id === "portfolio") { await expect(win.getByTestId("portfolio")).toBeVisible(); await win.getByTestId("win-close").click(); continue; } // built since card 2
    if (id === "broker") { await expect(win.getByTestId("broker")).toBeVisible(); await win.getByTestId("win-close").click(); continue; } // built since card 4 (BR-4)
    await expect(win.getByTestId("coming-later")).toContainText("Coming later");
    await expect(win.getByRole("heading")).toHaveText(await win.locator(".tb-name").innerText());
    await expect(win.getByRole("button", { name: /buy|sell/i })).toHaveCount(0);
    await win.getByTestId("win-close").click();
  }
  // Deep link: was /wire until Wire was built (UI card 1); Research is still ComingLater and not in the default layout.
  await boot(page, "/research?rank=R6&lic=LIC2&nw=200000&flags=charter.anyAvailable,api.eligible,character.day3&guest=0");
  await expect(page.getByTestId("win-research").getByTestId("coming-later")).toHaveText(/Research Desk\s*Coming later/);
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

test("S1-10 named layouts at 1440×900 (clamped to minimums); hidden when they cannot fit", async ({ page }) => {
  await boot(page, "/?rank=R6&nw=200000&flags=charter.anyAvailable");
  for (const [id, rects] of Object.entries(LAYOUT_RECTS_1440)) {
    await page.getByTestId("layout-btn").click();
    await page.getByTestId(`layout-${id}`).click();
    const got = await page.locator("[role=dialog][data-testid^=win-]").evaluateAll((els) =>
      els.map((e) => { const r = e.getBoundingClientRect(); return [e.getAttribute("data-testid")!.slice(4), r.x, r.y, r.width, r.height] as const; }));
    expect(got.length, id).toBe(rects.length);
    // DOM order is stable (not stacking order), so compare in a canonical order.
    const key = (r: readonly [string, number, number, number, number]) => `${r[0]}:${Math.round(r[1])}:${Math.round(r[2])}`;
    got.sort((a, b) => key(a).localeCompare(key(b)));
    [...rects].sort((a, b) => key(a).localeCompare(key(b))).forEach((r, i) => {
      expect(got[i][0]).toBe(r[0]);
      for (let k = 1; k < 5; k++) expect(Math.abs((got[i][k] as number) - (r[k] as number)), `${id} ${r[0]} [${k}]`).toBeLessThanOrEqual(1);
    });
  }
  expect(await intents(page)).toBe(0);
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.getByTestId("layout-btn").click();
  await expect(page.getByTestId("layouts-menu").getByRole("button")).toHaveText(["Review", "Shadow"]);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.getByTestId("layout-btn")).toHaveCount(0);
  await expect(page.getByTestId("layouts-menu")).toHaveCount(0);
});

test("Shelf: tiles never sit under the tools at 1280, 1440, 1920; Broker first; fade on the clipped edge; Alt 1 = first tile", async ({ page }) => {
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await boot(page, "/?rank=R6&nw=200000&lic=LIC2&flags=charter.anyAvailable,api.eligible,character.day3&guest=0");
    const r = await page.evaluate(() => {
      const row = document.querySelector("[data-testid=shelf-tiles]")!.getBoundingClientRect();
      const tools = document.querySelector("[data-testid=shelf-tools]")!.getBoundingClientRect();
      // A tile is drawn only where the row's clip rect shows it.
      const overlaps = Array.from(document.querySelectorAll("[data-testid^=tile-]")).filter((t) => {
        const b = t.getBoundingClientRect();
        const visibleRight = Math.min(b.right, row.right);
        return visibleRight > b.left && visibleRight > tools.left;
      }).length;
      const el = document.querySelector<HTMLElement>("[data-testid=shelf-tiles]")!;
      return { overlaps, rowRight: row.right, toolsLeft: tools.left, first: document.querySelector("[data-testid^=tile-]")!.getAttribute("data-testid"), clipped: el.scrollWidth > el.clientWidth, fade: el.dataset.clipRight, mask: getComputedStyle(el).maskImage };
    });
    expect(r.overlaps, `${width}`).toBe(0);
    expect(r.rowRight, `${width}`).toBeLessThanOrEqual(r.toolsLeft);
    expect(r.first).toBe("tile-broker");
    if (r.clipped) { expect(r.fade).toBe("true"); expect(r.mask).toContain("gradient"); }
  }
  await page.locator("body").click({ position: { x: 600, y: 400 } });
  await page.keyboard.press("Alt+1");
  await expect(page.getByTestId("win-broker").last()).toHaveClass(/active/);
});

test("Glyph colours: muted, white when active, disabled when locked; never brass (B1, m1–m3)", async ({ page }) => {
  await boot(page, "/?rank=R1&nw=30000");
  const c = await page.evaluate(() => {
    const color = (sel: string) => getComputedStyle(document.querySelector(sel)!).color;
    const probe = (v: string) => { const d = document.createElement("i"); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const ws = document.querySelector("[data-testid=ws-1]")!;
    const active = document.querySelector(".win.active")!;
    return {
      tile: color("[data-testid=tile-markets]:not(.on)"), locked: color("[data-testid=tile-quantlab]"), on: color(".tile.on"),
      wsColor: getComputedStyle(ws).color, wsBorder: getComputedStyle(ws).borderTopColor,
      winBorder: getComputedStyle(active).borderTopColor, winGlyph: color(".win.active .tb-glyph"),
      before: getComputedStyle(active.querySelector(".titlebar")!, "::before").backgroundColor,
      muted: probe("--fg-muted"), fg: probe("--fg"), disabled: probe("--fg-disabled"), acc: probe("--acc"),
    };
  });
  expect(c.tile).toBe(c.muted);
  expect(c.locked).toBe(c.disabled);
  expect(c.on).toBe(c.fg);
  expect(c.winGlyph).toBe(c.fg);
  expect(c.winBorder).toBe(c.disabled);
  for (const v of [c.tile, c.on, c.wsColor, c.wsBorder, c.winBorder, c.winGlyph, c.before]) expect(v).not.toBe(c.acc);
});

// Observable behaviour only, so it holds for the stub and for the real renderer (PR #4). The seam calls
// (cityId, setVisibility on collapse / workspace switch, setReducedMotion, unmount + dispose on close,
// ui.perf via onPerfSample) are asserted in tests/unit/shell/cityWindow.test.ts.
test("City seam: the City window mounts a canvas with no error state, and closing removes it", async ({ page }) => {
  await boot(page, "/city?rank=R2");
  const win = page.getByTestId("win-city");
  await expect(win.getByTestId("city-mount").locator("canvas")).toHaveCount(1, { timeout: 20_000 });
  await expect(win.getByTestId("city-body")).toHaveAttribute("data-visibility", "visible");
  await expect(win.getByText("Loading city…")).toHaveCount(0);
  await expect(page.getByTestId("load-message")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  await win.getByTestId("win-close").click();
  await expect(page.getByTestId("win-city")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("S1-11 5th Broker and same-ticker deep link focus the existing window", async ({ page }) => {
  await boot(page);
  for (let i = 0; i < 5; i++) await page.getByTestId("tile-broker").click();
  await expect(page.getByTestId("win-broker")).toHaveCount(4);
  await page.waitForTimeout(400); // persisted
  // 17A T4-04: a deep link restores saved windows, then focuses the existing instance at the cap.
  await boot(page, "/broker?asset=HALC");
  await expect(page.getByTestId("win-broker")).toHaveCount(4);
  await page.keyboard.press("Control+k");
  await page.locator(".launcher input").fill("HALC");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("win-broker")).toHaveCount(4);
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

test("S1-16 reduced motion and reduced transparency in every shell state of §5, overlays included", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const check = (name: string) => page.evaluate((n) => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (cs.backdropFilter && cs.backdropFilter !== "none") bad.push(`backdrop ${el.className}`);
      if (el.classList.contains("tickring-sweep")) continue;
      const durs = [...cs.transitionDuration.split(","), ...cs.animationDuration.split(",")].map((d) => parseFloat(d));
      if (durs.some((d) => d > 0)) bad.push(`motion ${el.tagName}.${el.className}`);
    }
    return { n, bad, motion: document.documentElement.dataset.motion, transparency: document.documentElement.dataset.transparency };
  }, name);
  const setTransparency = async () => {
    await page.getByTestId("tile-settings").click();
    await setReducedTransparency(page, "On");
    await page.locator("body").click({ position: { x: 700, y: 600 } });
  };
  // Overlay / world states come from the mock channels: reconnecting, Held (z 150), halted world (z 160).
  // The system-level setting covers the overlay states (overlays take input, so Settings cannot be reached there);
  // the Settings toggle itself is exercised on the base state.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-reduced-transparency", value: "reduce" }] });
  const flush = () => page.evaluate(() => (window as Window & { __quayFlush?: () => Promise<void> }).__quayFlush?.());
  const expectReduced = async (n: string) => {
    const r = await check(n);
    expect(r.motion, r.n).toBe("reduce");
    expect(r.transparency, r.n).toBe("reduce");
    expect(r.bad, r.n).toEqual([]);
  };
  // Boot state (R0 boots for 900 ms): checked before the shell is ready.
  await page.goto("/?rank=R0");
  await expect(page.getByTestId("boot")).toBeVisible();
  await expectReduced("boot");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  for (const q of ["", "?conn=reconnecting", "?load=fail", "?held=1", "?halted=1", "?held=1&halted=1&prot=1"]) {
    await boot(page, `/${q}`);
    // Held / halted overlays take input, so only the overlay state itself is checked there.
    const blocking = q.includes("held") || q.includes("halted");
    if (!q) await setTransparency();
    // Saved prefs hydrate after first paint; wait for the reduce attributes before checking.
    await expect.poll(() => page.evaluate(() => [document.documentElement.dataset.motion, document.documentElement.dataset.transparency])).toEqual(["reduce", "reduce"]);
    const all: [string, () => Promise<void>][] = [
      ["normal", async () => {}],
      ["layout menu", async () => { await page.getByTestId("layout-btn").click(); }],
      ["launcher", async () => { await page.keyboard.press("Escape"); await page.keyboard.press("Control+k"); }],
      ["key sheet", async () => { await page.keyboard.press("Escape"); await page.locator("body").click({ position: { x: 700, y: 600 } }); await page.keyboard.press("?"); }],
      ["focus", async () => { await page.keyboard.press("Escape"); await page.keyboard.press("Control+."); }],
    ];
    const states = blocking ? all.slice(0, 1) : all;
    for (const [name, go] of states) {
      await go();
      const r = await check(`${q || "base"} ${name}`);
      expect(r.motion, r.n).toBe("reduce");
      expect(r.transparency, r.n).toBe("reduce");
      expect(r.bad, r.n).toEqual([]);
    }
    if (q === "?load=fail") await expect(page.getByTestId("load-error")).toBeVisible();
    if (!blocking) {
      await page.keyboard.press("Control+."); // leave focus mode: it persists across reloads...
      await expect(page.getByTestId("shelf")).toBeVisible();
      await flush(); // ...so wait for the committed IndexedDB write before the next page load.
    }
    if (q.includes("held")) await expect(page.getByTestId("overlay-held")).toBeVisible();
    if (q.includes("halted")) await expect(page.getByTestId("overlay-halted")).toBeVisible();
  }
  // Offline: read-only snapshot with Retry.
  await boot(page, "/");
  await page.context().setOffline(true);
  await expect(page.getByTestId("offline-state")).toBeVisible();
  await expectReduced("offline");
  await page.context().setOffline(false);
});

test("S1-17 launcher, layouts, focus mode and shortcuts log zero intents", async ({ page }) => {
  await boot(page);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Find an app, a ticker, a command" }).fill("buy 100 HALC limit 42");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.getByTestId("layout-btn").click();
  await page.getByTestId("layout-trade").click();
  for (const k of ["Control+.", "Control+.", "Alt+1", "Control+ArrowLeft", "Control+ArrowRight", "Control+ArrowUp", "Control+m", "Control+Alt+ArrowRight", "Alt+n", "Alt+w", "g", "p", "?", "Escape"]) {
    await page.keyboard.press(k);
  }
  expect(await intents(page)).toBe(0);
});

test("S1-18 R0 and R6: same launcher results, Broker limit and keys", async ({ browser, baseURL }) => {
  // Each rank in a fresh context so the first run's Recent list does not leak into the second.
  const run = async (rank: string) => {
    const page = await (await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })).newPage();
    await boot(page, `/?rank=${rank}&nw=100&lic=LIC0`);
    const out: string[][] = [];
    for (const q of ["HALC", "open", "go to", "broker"]) {
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox", { name: "Find an app, a ticker, a command" }).fill(q);
      out.push(await page.locator("#launcher-list").getByRole("option").allInnerTexts());
      await page.keyboard.press("Escape");
    }
    for (let i = 0; i < 5; i++) await page.keyboard.press("Alt+n");
    out.push([String(await page.getByTestId("win-broker").count())]);
    await page.keyboard.press("?");
    out.push(await page.locator(".keysheet dl").allInnerTexts());
    await page.context().close();
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
  page.on("response", (r) => {
    if (r.request().resourceType() === "script") scripts.set(r.url(), 0); // record synchronously; size comes from request.get below
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
  // Deterministic: arm the wait for the first new script before the click that triggers the dynamic import.
  const cityChunk = page.waitForResponse((r) => r.request().resourceType() === "script" && !brokerChunks.includes(r.url()));
  await page.getByTestId("tile-city").click();
  const first = await cityChunk;
  scripts.set(first.url(), 0);
  await expect(page.getByTestId("city-mount")).toBeAttached();
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
  // The default layout opens Wire (built since UI card 1); its feed loads asynchronously, so let it settle first.
  await expect(page.getByTestId("wire")).toHaveAttribute("data-state", /^(?!loading$)/);
  // Portfolio (built since 17B CH-00) and Broker (built since UI card 4) load their chunks behind AppSkeleton; wait until
  // none is showing, then until the Broker's channels have answered (its body leaves the loading state).
  await expect(page.getByTestId("app-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("broker").first()).toHaveAttribute("data-state", /^(?!loading$)/);
  const base = await snap();
  for (const [i, p] of ["ink-brass", "broadsheet", "phosphor", "riviera"].entries()) {
    await page.evaluate((v) => (document.documentElement.dataset.palette = v), p);
    expect(await read(), p).toEqual(SPEC_TABLE.map((r) => r[i + 1]));
    expect(await snap(), p).toBe(base);
  }
});

test("§5 error / offline: inline \"Couldn't load · Retry\"; Retry reloads; offline shows the read-only snapshot", async ({ page }) => {
  await boot(page, "/?load=fail1");
  await expect(page.getByTestId("load-error")).toHaveText("Couldn't load · Retry");
  // §4: the pill's Retry is a 44×44 tap target inside the pill and clear of every other tap target.
  const hit = await page.getByTestId("load-retry").evaluate((b) => {
    const r = b.getBoundingClientRect(); const pill = b.closest(".load-state")!.getBoundingClientRect();
    const others = Array.from(document.querySelectorAll("button, a, [role=button], input")).filter((e) => e !== b).map((e) => e.getBoundingClientRect()).filter((o) => o.width > 0);
    return {
      w: r.width >= 44, h: r.height >= 44,
      inside: r.left >= pill.left && r.right <= pill.right && r.top >= pill.top && r.bottom <= pill.bottom,
      clear: !others.some((o) => o.left < r.right && o.right > r.left && o.top < r.bottom && o.bottom > r.top),
    };
  });
  expect(hit).toEqual({ w: true, h: true, inside: true, clear: true });
  await expect(page.getByTestId("strip")).toBeVisible(); // the rest of the shell stays usable
  await page.getByTestId("load-retry").click();
  await expect(page.getByTestId("load-message")).toHaveCount(0);
  await boot(page, "/?load=fail");
  await page.getByTestId("load-retry").click();
  await expect(page.getByTestId("load-retry")).toHaveText("Retry");
  await expect(page.getByTestId("load-error")).toBeVisible(); // still failing: stays, Retry re-enabled
  await boot(page, "/");
  await page.context().setOffline(true);
  await expect(page.getByTestId("offline-state")).toContainText("Offline · read-only snapshot");
  await page.getByTestId("load-retry").click();
  await expect(page.getByTestId("load-retry")).toHaveText("Retry"); // retry while offline: still offline
  await expect(page.getByTestId("offline-state")).toBeVisible();
  await page.context().setOffline(false); // back online: the browser's online event clears it
  await expect(page.getByTestId("offline-state")).toHaveCount(0);
  expect(await intents(page)).toBe(0);
});

test("Lock tags: Label style 10.5 px, inside every locked shelf tile; Quay mark --fg; tick sweep --fg-muted", async ({ page }) => {
  await boot(page, "/?rank=R1&nw=30000");
  const r = await page.evaluate(() => {
    const probe = (v: string) => { const d = document.createElement("i"); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const tags = Array.from(document.querySelectorAll(".tile.locked")).map((t) => {
      const tag = t.querySelector(".lock-tag")!; const a = tag.getBoundingClientRect(); const b = t.getBoundingClientRect(); const cs = getComputedStyle(tag);
      return { inside: a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom, size: cs.fontSize, upper: cs.textTransform, color: cs.color, h: b.height };
    });
    return { tags, mark: getComputedStyle(document.querySelector("[data-testid=strip] .fg")!).color, acc: probe("--acc"), sweep: getComputedStyle(document.querySelector(".tickring-sweep")!).stroke, fg: probe("--fg"), muted: probe("--fg-muted"), disabled: probe("--fg-disabled") };
  });
  expect(r.tags.length).toBeGreaterThan(0);
  for (const t of r.tags) expect(t).toEqual({ inside: true, size: "10.5px", upper: "uppercase", color: r.muted, h: 40 });
  for (const t of r.tags) expect(t.color).not.toBe(r.acc);
  expect(r.mark).toBe(r.fg);
  expect(r.sweep).toBe(r.muted);
});

test("Shelf spacing stays even when locked tiles widen (Studio round 6)", async ({ page }) => {
  await boot(page, "/?rank=R1&nw=30000");
  const gaps = await page.getByTestId("shelf-tiles").evaluate((row) => {
    const kids = Array.from(row.querySelectorAll(".tile"));
    const out: { gap: number; wide: boolean }[] = [];
    for (let i = 1; i < kids.length; i++) {
      const [a, b] = [kids[i - 1], kids[i]];
      if (b.parentElement!.querySelector(".shelf-divider")) continue; // across a group divider the divider sets the spacing
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      out.push({ gap: Math.round((rb.left - ra.right) * 10) / 10, wide: ra.width > 40 || rb.width > 40 });
    }
    return out;
  });
  expect(gaps.some((g) => g.wide)).toBe(true);
  expect(new Set(gaps.map((g) => g.gap))).toEqual(new Set([4]));
});

test("Retry a11y (QA r11): keeps focus, aria-disabled toggles, a second activation while pending does nothing, the alert text never changes, label left x fixed", async ({ page }) => {
  await boot(page, "/?load=fail&retryMs=1500"); // hold Retrying… long enough to try a second activation
  const retry = page.getByTestId("load-retry");
  // The banner/pill's live region (Next's own route announcer is another role=alert on the page).
  const alert = page.locator("[data-testid=load-message][role=alert]");
  await expect(alert).toHaveCount(1);
  const alertText = await alert.textContent();
  expect(await retry.evaluate((b) => b.closest("[role=alert]"))).toBeNull(); // the button sits outside the live region
  const state = () => page.evaluate(() => {
    const b = document.querySelector("[data-testid=load-retry]")!;
    return {
      focused: document.activeElement === b,
      ariaDisabled: b.getAttribute("aria-disabled"), disabledAttr: b.hasAttribute("disabled"),
      labelLeft: b.querySelector(".load-retry-label")!.getBoundingClientRect().left,
      label: b.querySelector(".load-retry-label")!.textContent,
      alert: document.querySelector("[data-testid=load-message][role=alert]")!.textContent,
      retries: (window as Window & { __quayRetries?: () => number }).__quayRetries?.() ?? -1,
    };
  });
  await retry.focus();
  const s0 = await state();
  expect(s0).toMatchObject({ focused: true, ariaDisabled: "false", disabledAttr: false, label: "Retry", alert: alertText });
  await page.keyboard.press("Enter");
  await expect(retry).toHaveText("Retrying…");
  const s1 = await state();
  expect(s1).toMatchObject({ focused: true, ariaDisabled: "true", disabledAttr: false, label: "Retrying…", alert: alertText, retries: s0.retries + 1 });
  expect(s1.labelLeft).toBe(s0.labelLeft); // Studio 01:05: labels left-aligned in the reserved slot
  await page.keyboard.press("Enter"); // second activation while pending: ignored
  // A real pointer tap (locator.click() would wait for aria-disabled to clear).
  const rb = (await retry.boundingBox())!;
  await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
  const s1b = await state();
  expect(s1b).toMatchObject({ label: "Retrying…", ariaDisabled: "true", retries: s0.retries + 1 });
  await expect(retry).toHaveText("Retry");
  const s2 = await state();
  expect(s2).toMatchObject({ focused: true, ariaDisabled: "false", disabledAttr: false, alert: alertText, retries: s0.retries + 1 });
  expect(s2.labelLeft).toBe(s0.labelLeft);
});
