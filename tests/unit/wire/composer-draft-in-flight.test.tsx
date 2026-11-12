// @vitest-environment happy-dom
// M1-10 (CI run 43161314039, phone): text typed while a statement post is in flight must survive the reply. The composer
// used to clear the textarea on success, wiping the next draft and leaving Post disabled with an empty box.
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

async function mount() {
  let release: (() => void) | null = null;
  const posts: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) return Response.json({ remainingToday: 3 });
    posts.push((JSON.parse(String(init?.body)) as { text: string }).text);
    await new Promise<void>((r) => { release = r; });
    return Response.json({ remainingToday: 3 - posts.length }, { status: 201 });
  }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => { createRoot(host).render(createElement(Composer, { t: EN })); });
  const q = <T extends Element>(id: string) => host.querySelector<T>(`[data-testid=${id}]`)!;
  return { posts, release: () => release?.(), text: () => q<HTMLTextAreaElement>("wire-composer-text"), submit: () => q<HTMLButtonElement>("wire-composer-submit") };
}

const disabled = (b: HTMLButtonElement) => b.disabled || b.getAttribute("aria-disabled") === "true";

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
