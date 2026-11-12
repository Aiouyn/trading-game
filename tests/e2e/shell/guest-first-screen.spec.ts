// Card 9: a logged-out stranger on phone reads what Quay is and what to do in the first viewport.
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

async function shot(page: Page, name: string) {
  if (!process.env.GUEST_SHOTS_DIR) return;
  mkdirSync(process.env.GUEST_SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${process.env.GUEST_SHOTS_DIR}/${name}.png`, animations: "disabled", caret: "hide" });
}

const COPY = {
  // Label and CTA are card 36's (main), not localized yet; card 9 adds the pitch.
  en: { label: "Net worth", pitch: /^Quay is a trading game\. Start with \$10,000 in game money and try to grow it to \$20,000\. No real money\.$/, cta: "Sign in" },
  fr: { label: "Net worth", pitch: /^Quay est un jeu de trading\. .*Pas d’argent réel\.$/, cta: "Sign in" },
} as const;

async function guestHome(page: Page, width: number, locale: "en" | "fr", scale: 1 | 2) {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (locale === "en" && scale === 1) { await boot(page, "/"); return; }
  await boot(page, `/settings?locale=${locale}`);
  if (scale === 2) { await page.getByTestId("set-nav-SET-02").click(); await page.getByTestId("text-scale").fill("2"); await page.getByTestId("text-scale").blur(); await page.getByTestId("app-back").click(); }
  await page.getByTestId("app-back").click();
  await expect(page.getByTestId("widget")).toBeVisible();
}

test.describe("phone", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "phone", "phone project only"));

  for (const [width, locale, scale] of [[390, "en", 1], [320, "en", 1], [390, "fr", 2], [320, "fr", 2]] as const) {
    test(`guest ${locale} x${scale} ${width}: what the game is and the one action fit the first viewport`, async ({ page }) => {
      await guestHome(page, width, locale, scale);
      const c = COPY[locale];
      await expect(page.getByTestId("widget-nw-label")).toHaveText(c.label);
      await expect(page.getByTestId("guest-pitch")).toHaveText(c.pitch);
      const cta = page.getByTestId("sign-in-entry");
      await expect(cta).toHaveText(c.cta);
      await expect(cta).toHaveAccessibleName(c.cta);
      // The example numbers stay (they show what the game looks like), after the pitch and the action.
      await expect(page.getByTestId("hero-nw")).toBeVisible();
      const g = await page.evaluate(() => {
        const r = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        const dock = r("bottom-row");
        return { label: r("widget-nw-label"), pitch: r("guest-pitch"), cta: r("sign-in-entry"), hero: r("hero-nw"), dockTop: dock.top, scrollTop: document.querySelector(".phone-home")?.scrollTop ?? 0,
          overflow: document.documentElement.scrollWidth > innerWidth,
          // Nothing in the card pokes out of the card (the rank chip used to be pushed past its right edge by a long label).
          outside: (() => { const w = r("widget"); return [...document.querySelectorAll<HTMLElement>('[data-testid="widget"] *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > w.right + 0.5 || b.left < w.left - 0.5); }).map((e) => e.dataset.testid ?? e.className); })() };
      });
      expect(g.scrollTop).toBe(0);
      expect(g.label.bottom).toBeLessThanOrEqual(g.pitch.top + 0.5);
      expect(g.pitch.bottom).toBeLessThanOrEqual(g.cta.top + 0.5);
      expect(g.cta.bottom).toBeLessThanOrEqual(g.hero.top + 0.5);
      // Read and tap without scrolling: the whole CTA sits above the bottom dock.
      expect(g.cta.bottom).toBeLessThanOrEqual(g.dockTop);
      expect(g.cta.height).toBeGreaterThanOrEqual(44);
      expect(g.cta.width).toBeGreaterThanOrEqual(200);
      expect(g.overflow).toBe(false);
      expect(g.outside).toEqual([]);
      const axe = await new AxeBuilder({ page }).include('[data-testid="widget"]').analyze();
      expect(axe.violations).toEqual([]);
      await shot(page, `phone-${locale}${scale}-${width}-guest-home`);
    });
  }

  test("guest CTA opens Account on Create account; after registering Home shows the signed-in starter card, no pitch", async ({ page }) => {
    await guestHome(page, 390, "en", 1);
    await page.getByTestId("sign-in-entry").click();
    await expect(page.getByTestId("app-title")).toHaveText("Account");
    await expect(page.getByTestId("settings-account")).toBeVisible();
    const submit = page.getByTestId("account-submit");
    await expect(submit).toHaveText("Create account");
    await shot(page, "phone-en1-390-account-from-guest");
    const handle = `Guest9${Date.now().toString(36)}`;
    await page.getByTestId("account-handle-input").fill(handle);
    await page.getByTestId("account-password-input").fill("guest-first-pass");
    await submit.click();
    await expect(page.getByTestId("account-handle")).toContainText(handle, { timeout: 15_000 });
    // Account -> Settings list -> Home.
    await page.getByTestId("app-back").click();
    await expect(page.getByTestId("app-title")).toHaveText("Settings");
    await page.getByTestId("app-back").click();
    await expect(page.getByTestId("account-chip-home")).toBeVisible();
    await expect(page.getByTestId("guest-pitch")).toHaveCount(0);
    await expect(page.getByTestId("sign-in-entry")).toHaveCount(0);
    await expect(page.getByTestId("widget-nw-label")).toHaveText("Net worth"); // main card 29: signed-in Home says Net worth
    await shot(page, "phone-en1-390-home-after-register");
  });
});

test("desktop guest first screen is unchanged: strip Sign in, example windows, no phone pitch", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop project only");
  await boot(page, "/");
  await expect(page.getByTestId("sign-in-entry")).toHaveText("Sign in");
  await expect(page.getByTestId("guest-pitch")).toHaveCount(0);
  await shot(page, "desktop-en-1440-guest-first-screen");
});
