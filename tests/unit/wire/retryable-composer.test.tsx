// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { EN } from "@/apps/wire/strings";
import { retryableComposer, type ComposerModule } from "@/apps/wire/RetryableComposer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("a failed composer chunk shows Retry and remounts a working chunk", async () => {
  let calls = 0;
  const load = (): Promise<ComposerModule> => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve({
        default: function Boom() {
          throw new Error("composer-chunk-failed");
        },
      });
    }
    return Promise.resolve({
      default: function Ok() {
        return createElement("div", { "data-testid": "wire-composer-ok" }, "ok");
      },
    });
  };
  const Comp = retryableComposer(load);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const prev = console.error;
  console.error = () => {};
  try {
    await act(async () => { root.render(createElement(Comp, { t: EN })); });
    await act(async () => { await Promise.resolve(); });
  } finally {
    console.error = prev;
  }
  const err = host.querySelector("[data-testid=wire-composer-error]");
  expect(err).not.toBeNull();
  expect(err?.textContent).toContain("Couldn't load the composer.");
  const retry = host.querySelector<HTMLButtonElement>("[data-testid=wire-composer-retry]");
  expect(retry).not.toBeNull();
  await act(async () => { retry!.click(); });
  expect(host.querySelector("[data-testid=wire-composer-error]")).toBeNull();
  expect(host.querySelector("[data-testid=wire-composer-ok]")?.textContent).toBe("ok");
  root.unmount();
  host.remove();
});
