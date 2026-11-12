// @vitest-environment happy-dom
// M1-10 (CI run 43161314039, phone): text typed while a statement post is in flight must survive the reply. The composer
// used to clear the textarea on success, wiping the next draft and leaving Post disabled with an empty box.
// Card 37: an append during Posting must drop the already-sent prefix on ack (and never auto-resend), so a leftover
// "first more" cannot be posted as a second $500 / daily-slot charge.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EN } from "@/apps/wire/strings";

vi.mock("@/shell/contracts/useChannel", () => ({ getFeed: () => ({ resync: () => {} }) }));
import { Composer } from "@/apps/wire/Composer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

function type(el: HTMLTextAreaElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

type MountOpts = { status?: number; error?: { code: string; message?: string } };

async function mount(opts: MountOpts = {}) {
  let release: (() => void) | null = null;
  const posts: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) return Response.json({ remainingToday: 3 });
    posts.push((JSON.parse(String(init?.body)) as { text: string }).text);
    await new Promise<void>((r) => { release = r; });
    if (opts.status && opts.status >= 400) {
      return Response.json({ error: opts.error ?? { code: "BAD_REQUEST" } }, { status: opts.status });
    }
    return Response.json({ remainingToday: 3 - posts.length }, { status: 201 });
  }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => { createRoot(host).render(createElement(Composer, { t: EN })); });
  const q = <T extends Element>(id: string) => host.querySelector<T>(`[data-testid=${id}]`)!;
  return {
    posts,
    release: () => release?.(),
    text: () => q<HTMLTextAreaElement>("wire-composer-text"),
    submit: () => q<HTMLButtonElement>("wire-composer-submit"),
    form: () => q<HTMLFormElement>("wire-composer-form"),
    fee: () => q("wire-composer-fee"),
    error: () => host.querySelector("[data-testid=wire-composer-post-error]"),
  };
}

const disabled = (b: HTMLButtonElement) => b.disabled || b.getAttribute("aria-disabled") === "true";

async function settle() {
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

it("a draft typed while a post is in flight is kept when the post lands, and can be posted next", async () => {
  const c = await mount();
  await act(async () => { type(c.text(), "first"); });
  await act(async () => { c.submit().click(); });
  expect(c.posts).toEqual(["first"]);
  await act(async () => { type(c.text(), "second"); }); // typed while "first" is in flight
  await act(async () => { c.release(); await Promise.resolve(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(c.text().value).toBe("second");
  expect(disabled(c.submit())).toBe(false);
  await act(async () => { c.submit().click(); });
  expect(c.posts).toEqual(["first", "second"]);
});

it("an unchanged draft is cleared when its post lands", async () => {
  const c = await mount();
  await act(async () => { type(c.text(), "only"); });
  await act(async () => { c.submit().click(); });
  await act(async () => { c.release(); await Promise.resolve(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(c.text().value).toBe("");
  expect(disabled(c.submit())).toBe(true); // empty draft: nothing to post
});

it("an append typed while sending loses the sent prefix on ack, and is not auto-resent", async () => {
  const c = await mount();
  await act(async () => { type(c.text(), "first"); });
  await act(async () => { c.submit().click(); });
  expect(c.posts).toEqual(["first"]);
  await act(async () => { type(c.text(), "first more"); });
  await act(async () => { c.release(); await Promise.resolve(); });
  await settle();
  expect(c.text().value).toBe("more");
  expect(c.posts).toEqual(["first"]);
  expect(disabled(c.submit())).toBe(false);
});

it("an edit that no longer starts with the sent text is left as typed, and is not auto-resent", async () => {
  const c = await mount();
  await act(async () => { type(c.text(), "first"); });
  await act(async () => { c.submit().click(); });
  expect(c.posts).toEqual(["first"]);
  await act(async () => { type(c.text(), "edited inside"); });
  await act(async () => { c.release(); await Promise.resolve(); });
  await settle();
  expect(c.text().value).toBe("edited inside");
  expect(c.posts).toEqual(["first"]);
  expect(disabled(c.submit())).toBe(false);
});

it("a whitespace-only remainder after the sent prefix leaves the box empty", async () => {
  const c = await mount();
  await act(async () => { type(c.text(), "first"); });
  await act(async () => { c.submit().click(); });
  await act(async () => { type(c.text(), "first   "); });
  await act(async () => { c.release(); await Promise.resolve(); });
  await settle();
  expect(c.text().value).toBe("");
  expect(c.posts).toEqual(["first"]);
  expect(disabled(c.submit())).toBe(true);
});

it("a rejected post keeps the full box, including text typed while it was sending", async () => {
  const c = await mount({ status: 400, error: { code: "BAD_REQUEST" } });
  await act(async () => { type(c.text(), "first"); });
  await act(async () => { c.submit().click(); });
  await act(async () => { type(c.text(), "first more"); });
  await act(async () => { c.release(); await Promise.resolve(); });
  await settle();
  expect(c.text().value).toBe("first more");
  expect(c.posts).toEqual(["first"]);
  expect(c.error()?.textContent).toBeTruthy();
  expect(disabled(c.submit())).toBe(false);
});

it("a second click or Enter while Posting sends only the first post", async () => {
  const c = await mount();
  await act(async () => { type(c.text(), "first"); });
  await act(async () => {
    c.submit().click();
    c.submit().click();
    c.form().requestSubmit();
  });
  expect(c.posts).toEqual(["first"]);
  await act(async () => { c.release(); await Promise.resolve(); });
  await settle();
  expect(c.posts).toEqual(["first"]);
  expect(c.text().value).toBe("");
});
