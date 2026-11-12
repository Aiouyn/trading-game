// Card 22: after a signed-in load, step 3 of the first-trade guide and "Hide guide"
// must sit fully inside the Trade-layout Portfolio window (desktop 1440) or clear the
// phone app body and edge bar (390 and 360×640). No test-driven scroll. Measure only
// after animations have finished and two animation frames have passed. The guide is
// not painted while /api/auth/me is still held (auth loading).
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-guide-fit" } });
  expect(res.status(), await res.text()).toBe(201);
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
}

type Fit = {
  step3Text: string | null;
  hideText: string | null;
  step3OverflowPx: number | null;
  hideOverflowPx: number | null;
  step3FullyVisible: boolean;
  hideFullyVisible: boolean;
  hideOverlapsChrome: boolean;
  step3OverlapsChrome: boolean;
  canScroll: boolean;
  scrollTop: number;
};

async function measure(page: Page, kind: "desktop" | "phone"): Promise<Fit> {
  return page.evaluate((mode) => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const win = q("win-portfolio");
    const body = mode === "desktop"
      ? win?.querySelector<HTMLElement>(".win-body") ?? null
      : document.querySelector<HTMLElement>(".phone-appbody");
    const step3 = q("pf-guide-step-3");
    const step3Text = (step3?.querySelector("span") as HTMLElement | null) ?? step3;
    const hide = q("pf-guide-hide");
    const chrome = [
      document.querySelector<HTMLElement>(".titlebar"),
      document.querySelector<HTMLElement>(".appbar"),
      document.querySelector<HTMLElement>("[data-testid=edge-bar]"),
      document.querySelector<HTMLElement>("[data-testid=bottom-row]"),
      document.querySelector<HTMLElement>(".shelf"),
    ].filter((el): el is HTMLElement => !!el);
    const clip = body?.getBoundingClientRect() ?? null;
    const overflow = (el: HTMLElement | null) => {
      if (!el || !clip) return null;
      return +(el.getBoundingClientRect().bottom - clip.bottom).toFixed(2);
    };
    const fullyVisible = (el: HTMLElement | null) => {
      if (!el || !clip) return false;
      const r = el.getBoundingClientRect();
      return r.top >= clip.top - 0.5 && r.bottom <= clip.bottom + 0.5 && r.left >= clip.left - 0.5 && r.right <= clip.right + 0.5 && r.width > 0 && r.height > 0;
    };
    const overlaps = (el: HTMLElement | null) => {
      if (!el) return false;
      const a = el.getBoundingClientRect();
      return chrome.some((c) => {
        const b = c.getBoundingClientRect();
        return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      });
    };
    return {
      step3Text: step3Text?.textContent ?? null,
      hideText: hide?.textContent ?? null,
      step3OverflowPx: overflow(step3Text),
      hideOverflowPx: overflow(hide),
      step3FullyVisible: fullyVisible(step3Text),
      hideFullyVisible: fullyVisible(hide),
      hideOverlapsChrome: overlaps(hide),
      step3OverlapsChrome: overlaps(step3Text),
      canScroll: body ? body.scrollHeight - body.clientHeight > 1 : false,
      scrollTop: body?.scrollTop ?? 0,
    };
  }, kind);
}

async function openDesktopGuide(page: Page, baseURL: string) {
  await register(page.request, baseURL, `GfD${Date.now().toString(36)}`);
  await page.goto("/");
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("account-chip").or(page.getByTestId("account-chip-home"))).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("pf-guide")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("pf-guide-step-3")).toBeVisible();
  await expect(page.getByTestId("pf-guide-hide")).toBeVisible();
  await settle(page);
}

async function openPhoneGuide(page: Page, baseURL: string) {
  await register(page.request, baseURL, `GfP${Date.now().toString(36)}`);
  await page.goto("/");
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("phone-first-trade-guide")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("phone-first-trade-guide").click();
  await expect(page.getByTestId("pf-guide")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("pf-guide-step-3")).toBeVisible();
  await expect(page.getByTestId("pf-guide-hide")).toBeVisible();
  await settle(page);
}

function assertFits(m: Fit, label: string) {
  expect(m.scrollTop, `${label} measured at rest`).toBe(0);
  expect(m.step3FullyVisible, `${label} step 3 fully visible in the content box (overflow ${m.step3OverflowPx})`).toBe(true);
  expect(m.hideFullyVisible, `${label} Hide guide fully visible in the content box (overflow ${m.hideOverflowPx})`).toBe(true);
  expect(m.step3OverlapsChrome, `${label} step 3 does not overlap window or phone chrome`).toBe(false);
  expect(m.hideOverlapsChrome, `${label} Hide guide does not overlap window or phone chrome`).toBe(false);
}

test("the first-trade guide is not painted while the session is still loading", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one loading check is enough");
  test.setTimeout(60_000);
  await register(page.request, baseURL!, `GfL${Date.now().toString(36)}`);
  await page.route("**/api/auth/me", (route) => {
    // hold until the test unroutes; never fulfill while held
  });
  await page.goto("/");
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("pf-guide")).toHaveCount(0);
  await expect(page.getByTestId("pf-guide-step-3")).toHaveCount(0);
  await expect(page.getByTestId("pf-guide-hide")).toHaveCount(0);
  await expect(page.getByText("Place the order to confirm it", { exact: false })).toHaveCount(0);
  await page.unroute("**/api/auth/me");
});

test("desktop 1440: step 3 and Hide guide sit inside the Trade-layout Portfolio window", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop Trade layout");
  test.setTimeout(60_000);
  await openDesktopGuide(page, baseURL!);
  const m = await measure(page, "desktop");
  assertFits(m, "desktop 1440");
});

test("phone 390: step 3 and Hide guide clear the app body and the edge bar", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone guide");
  test.setTimeout(60_000);
  await openPhoneGuide(page, baseURL!);
  const m = await measure(page, "phone");
  assertFits(m, "phone 390");
});

test("phone 360x640: step 3 and Hide guide clear the app body and the edge bar", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone guide");
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await openPhoneGuide(page, baseURL!);
  const m = await measure(page, "phone");
  assertFits(m, "phone 360x640");
});
