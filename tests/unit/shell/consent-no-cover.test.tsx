// @vitest-environment happy-dom
// Card 17: the consent prompt docks into reserved space and is easy to dismiss without writing a choice.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConsentPrompt } from "@/components/shell/ConsentPrompt";
import { workArea } from "@/shell/wm";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("consent prompt presentation", () => {
  let el: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    localStorage.clear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    localStorage.clear();
  });

  it("Accept and Decline are equal-weight, and Dismiss hides the prompt without writing a consent value", async () => {
    const done: boolean[] = [];
    await act(async () => {
      root.render(
        createElement(ConsentPrompt, { onDone: () => done.push(true) }),
      );
    });
    const accept = el.querySelector(
      "[data-testid=quay-consent-accept]",
    ) as HTMLButtonElement;
    const decline = el.querySelector(
      "[data-testid=quay-consent-decline]",
    ) as HTMLButtonElement;
    const dismiss = el.querySelector(
      "[data-testid=quay-consent-dismiss]",
    ) as HTMLButtonElement;
    expect(accept).not.toBeNull();
    expect(decline).not.toBeNull();
    expect(dismiss).not.toBeNull();
    expect(accept.className).toBe(decline.className);
    expect(accept.disabled).toBe(false);
    expect(decline.disabled).toBe(false);
    await act(async () => {
      dismiss.click();
    });
    expect(done).toEqual([true]);
    expect(localStorage.getItem("quay.telemetry.consent")).toBeNull();
    expect(localStorage.getItem("quay.telemetry.optout")).toBeNull();
  });

  it("the work area shrinks from the bottom by the consent strip, leaving the shelf reserve in place", () => {
    const plain = workArea(1440, 900);
    const reserved = workArea(1440, 900, false, 0, 48);
    expect(reserved.h).toBe(plain.h - 48);
    expect(reserved.y).toBe(plain.y);
    expect(reserved.w).toBe(plain.w);
  });
});
