// Card 37: text appended while a Wire statement is posting must lose the already-sent prefix on ack.
// A second click or Enter during Posting… must not send a second $500 / daily-slot charge.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

interface Ledger { cashCents: number }
interface Me { remainingToday?: number }
interface WireItem { id: string; kind: string; slots?: Record<string, string> }
interface Wire { items: WireItem[] }

const wire = async (r: APIRequestContext) => (await (await r.get("/api/wire")).json()) as Wire;
const ledger = async (r: APIRequestContext) => (await (await r.get("/api/broker/me")).json()) as Ledger;
const me = async (r: APIRequestContext) => (await (await r.get("/api/auth/me")).json()) as Me;

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-wire-test" } });
  expect(res.status(), await res.text()).toBe(201);
}

async function openComposer(page: Page) {
  await page.goto("/wire");
  await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  const composer = page.getByTestId("wire-composer");
  await expect(composer).toBeVisible();
  const isOpen = await composer.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) await page.getByTestId("wire-composer-toggle").click();
  await expect(page.getByTestId("wire-composer-form")).toBeVisible();
  const chip = page.getByTestId("wire-composer-asset-HALC");
  if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
}

test("append during Posting leaves the remainder and charges once, even if Post is clicked again", async ({ page, baseURL }, info) => {
  test.setTimeout(180_000);
  const stamp = `${Date.now().toString(36)}${info.project.name[0] ?? ""}`;
  const handle = `Cs${stamp}`;
  const sent = `HALC steady ${stamp}`;
  const ctx = page.context();

  let releasePost: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { releasePost = resolve; });
  let postCount = 0;
  const postedTexts: string[] = [];
  await page.route("**/api/wire", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    postCount += 1;
    try { postedTexts.push((JSON.parse(req.postData() ?? "{}") as { text?: string }).text ?? ""); } catch { postedTexts.push(""); }
    await held;
    await route.continue();
  });

  await register(ctx.request, baseURL!, handle);
  const cash0 = (await ledger(ctx.request)).cashCents;
  const slots0 = (await me(ctx.request)).remainingToday;
  expect(cash0).toBe(1_000_000);
  expect(slots0).toBe(3);

  await openComposer(page);
  const box = page.getByTestId("wire-composer-text");
  const submit = page.getByTestId("wire-composer-submit");
  await box.fill(sent);
  await submit.click();
  await expect(submit).toHaveText("Posting…");

  await box.fill(`${sent} plus more`);
  await expect(box).toHaveValue(`${sent} plus more`);
  await submit.click({ force: true });
  await submit.dblclick({ force: true });
  await page.getByTestId("wire-composer-form").evaluate((f) => (f as HTMLFormElement).requestSubmit());
  expect(postCount).toBe(1);

  releasePost!();
  await expect(submit).toHaveText("Post", { timeout: 20_000 });
  await expect(box).toHaveValue("plus more");
  expect(postCount).toBe(1);
  expect(postedTexts).toEqual([sent]);

  await expect.poll(async () => (await ledger(ctx.request)).cashCents, { timeout: 15_000 }).toBe(cash0 - 50_000);
  await expect.poll(async () => (await me(ctx.request)).remainingToday, { timeout: 15_000 }).toBe((slots0 ?? 3) - 1);
  await expect(page.getByTestId("wire-composer-fee")).toContainText("2 left");

  const mine = (await wire(ctx.request)).items.filter((i) => i.id.startsWith("w-p-") && i.slots?.handle === handle);
  expect(mine.length).toBe(1);
  expect(mine[0]?.kind).toBe("STATEMENT");
});
