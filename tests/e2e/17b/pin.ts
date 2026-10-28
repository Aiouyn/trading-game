import type { Page } from "@playwright/test";

/** Pins `<html data-cb|data-hc>` for the rest of the page (or unpins it). QuayShell's applyAppearance rewrites these
 *  attributes from the prefs on its next effect, so a plain hand-set value may or may not survive until the
 *  assertion or the screenshot (it survived on CI, not on the box). A MutationObserver puts the pinned value back
 *  before the next frame, so a cb / hc baseline really renders under those tokens. */
export async function pinHtml(page: Page, k: "cb" | "hc", on: boolean) {
  await page.evaluate(([key, v]) => {
    const w = window as Window & { __quayPins?: Map<string, boolean> };
    const html = document.documentElement;
    const apply = () => w.__quayPins!.forEach((pinned, a) => {
      if (pinned && html.dataset[a] !== "1") html.dataset[a] = "1";
      if (!pinned && a in html.dataset) delete html.dataset[a];
    });
    if (!w.__quayPins) {
      w.__quayPins = new Map();
      new MutationObserver(apply).observe(html, { attributes: true, attributeFilter: ["data-cb", "data-hc"] });
    }
    w.__quayPins.set(key, v);
    apply();
  }, [k, on] as const);
}
