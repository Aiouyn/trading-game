import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function moduleChunks(name: "settings" | "news") {
  const marker = name === "settings" ? '"settings-account"' : '"ap-news"';
  const dir = join(process.cwd(), ".next/static/chunks");
  const chunks = readdirSync(dir).filter((f) => f.endsWith(".js") && readFileSync(join(dir, f), "utf8").includes(marker));
  if (!chunks.length) throw new Error(`${name} must have a real lazy production chunk`);
  return chunks;
}
async function shot(page: Page, name: string) {
  if (!process.env.RETRY_SHOTS_DIR) return;
  mkdirSync(process.env.RETRY_SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${process.env.RETRY_SHOTS_DIR}/${name}.png`, animations: "disabled" });
}
for (const name of ["settings", "news"] satisfies ("settings" | "news")[]) for (const locale of ["en", "fr"]) {
  test(`lazy ${name} ${locale}: abort stays scoped; explicit Retry reimports and recovers focus`, async ({ page }, info) => {
    let blocked = true, attempts = 0;
    for (const chunk of moduleChunks(name)) await page.route(`**/_next/static/chunks/${chunk}`, async (route) => {
      attempts++;
      if (blocked) await route.abort("failed"); else await route.continue();
    });
    const b = page.getByTestId("broker").first();
    if (name === "settings") await page.goto(`/settings?locale=${locale}`);
    else {
      await page.goto(`/broker?asset=HALC&locale=${locale}`);
      await expect(b).toHaveAttribute("data-state", "live");
      await b.getByTestId("br-qty").fill("7");
      await b.getByTestId("br-view-about").click();
      await b.getByTestId("br-about-tabs-news").click();
    }
    const failure = page.getByTestId(`${name}-module-error`);
    await expect(failure).toBeVisible();
    const retry = failure.getByRole("button", { name: locale === "fr" ? "Réessayer" : "Retry", exact: true });
    expect(attempts).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: /This page couldn.t load/ })).toHaveCount(0);
    expect(page.url()).not.toBe("about:blank");
    await shot(page, `${info.project.name}-${name}-${locale}-failed`);
    if (name === "news") {
      if (info.project.name === "phone") await page.getByTestId("app-back").click();
      else await b.getByTestId("br-view-trade").click();
      await expect(b.getByTestId("br-qty")).toHaveValue("7");
      await b.getByTestId("br-view-about").click();
      await b.getByTestId("br-about-tabs-news").click();
      await expect(failure).toBeVisible();
    } else if (info.project.name === "phone") {
      await page.getByTestId("app-back").click();
      await expect(page.locator(".phone-home")).toBeVisible();
      expect(page.url()).not.toBe("about:blank");
      await page.getByTestId("icon-broker").click();
      await expect(b).toHaveAttribute("data-state", "live");
      await page.getByTestId("app-back").click();
      await page.getByTestId("icon-settings").click();
      await expect(failure).toBeVisible();
    } else {
      await page.getByTestId("tile-broker").click();
      await expect(b).toHaveAttribute("data-state", "live");
      await page.getByTestId("tile-settings").click();
      await expect(failure).toBeVisible();
    }
    const failedAttempts = attempts;
    blocked = false;
    await retry.click();
    const loaded = page.getByTestId(name === "settings" ? "settings" : "ap-news");
    await expect(loaded).toBeVisible();
    await expect(failure).toHaveCount(0);
    expect(attempts, "Retry performs another real chunk request, not just an error-flag reset").toBeGreaterThan(failedAttempts);
    await expect.poll(() => loaded.evaluate((e, marker) => e.contains(document.activeElement) || document.activeElement?.getAttribute("data-testid") === marker, `${name}-module-focus`)).toBe(true);
    await shot(page, `${info.project.name}-${name}-${locale}-recovered`);
  });
}
