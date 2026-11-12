// The last-price tag sits on the series' last price as soon as the chart has painted, not one redraw later. The library
// rescales the price axis on its own frame after setData; a tag placed only on data / range / size events stayed ~35 px
// off until the next tick (10 of 20 loads under `taskset -c 0,1`), which also broke S1-03's palette DOM compare.
import { expect, test } from "@playwright/test";
import { boot } from "../shell/helpers";

type Hook = { data: () => { close: number }[]; coord: (tick: number, price: number) => { y: number | null } };

test("the last-price tag is on the last price once the Broker has loaded", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "default desktop layout opens the Broker");
  await boot(page);
  await expect(page.getByTestId("app-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("broker").first()).toHaveAttribute("data-state", /^(?!loading$)/);
  await expect(page.getByTestId("br-chart-tag")).toBeVisible();
  const at = await page.evaluate(() => {
    const tag = document.querySelector<HTMLElement>("[data-testid=br-chart-tag]")!;
    const h = (window as unknown as { __quayChart: Hook }).__quayChart;
    const d = h.data();
    const y = h.coord(0, d[d.length - 1]!.close).y!;
    return { tag: Number(/,\s*(-?\d+)px\)/.exec(tag.style.transform)?.[1]), price: Math.round(y - tag.offsetHeight / 2) };
  });
  expect(at.tag).toBe(at.price);
});
