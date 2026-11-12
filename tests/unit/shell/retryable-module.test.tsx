// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryableLazy, scopedModuleProps } from "@/components/shell/retryableLazy";

let host: HTMLDivElement, outside: HTMLButtonElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  host = document.createElement("div"); outside = document.createElement("button");
  document.body.append(outside, host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); outside.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function Loaded() { return <input aria-label="Recovered content" />; }
function retryButton() {
  const button = host.querySelector("button");
  if (!button) throw new Error("Expected scoped retry action");
  return button;
}

// Card 5 folded into main's retryableLazy ({ focus: true } + scopedModuleProps); these are its original behaviours.
describe("scoped lazy module recovery", () => {
  it.each(["en", "fr"])("%s reimports the failed module and returns focus to recovered content", async (locale) => {
    const load = vi.fn<() => Promise<{ default: typeof Loaded }>>()
      .mockRejectedValueOnce(new Error("Chunk transport failed"))
      .mockResolvedValueOnce({ default: Loaded });
    const Module = retryableLazy(load, { focus: true });
    await act(async () => root.render(<Module {...scopedModuleProps("settings", locale)} fallback={<span>Loading</span>} />));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(retryButton().textContent).toBe(locale === "fr" ? "Réessayer" : "Retry");
    expect(document.activeElement).toBe(retryButton());
    await act(async () => retryButton().click());
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("input"));
  });

  it("does not steal focus from the still-usable surrounding app on failure or recovery", async () => {
    const load = vi.fn<() => Promise<{ default: typeof Loaded }>>()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ default: Loaded });
    const Module = retryableLazy(load, { focus: true }); outside.focus();
    await act(async () => root.render(<Module {...scopedModuleProps("news", "en")} fallback={null} />));
    expect(document.activeElement).toBe(outside);
    await act(async () => retryButton().click());
    expect(document.activeElement).toBe(outside);
    expect(host.querySelector("input")).not.toBeNull();
  });

  it("retains normal component state and reuses a successful module after a remount", async () => {
    function Counter({ label }: { label: string }) {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount(count + 1)}>{label}: {count}</button>;
    }
    const load = vi.fn(async () => ({ default: Counter }));
    const Module = retryableLazy<{ label: string }>(load, { focus: true });
    const render = (label: string) => root.render(<Module {...scopedModuleProps("news", "en")} label={label} fallback={<span>Loading</span>} />);
    await act(async () => render("First"));
    await act(async () => retryButton().click());
    await act(async () => render("Updated"));
    expect(retryButton().textContent).toBe("Updated: 1");
    await act(async () => root.render(null));
    act(() => render("Remounted"));
    expect(retryButton().textContent).toBe("Remounted: 0");
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("main's retryableLazy without focus (Broker, GoalGuide, Launchpad callers)", () => {
  it("does not move focus on failure or after Retry", async () => {
    const load = vi.fn<() => Promise<{ default: typeof Loaded }>>()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ default: Loaded });
    const Module = retryableLazy(load);
    await act(async () => root.render(<Module errorMessage="Couldn't load" retryLabel="Retry" fallback={null} />));
    expect(document.activeElement).toBe(document.body);
    await act(async () => retryButton().click());
    expect(host.querySelector("input")).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(host.querySelector('[data-testid="lazy-chunk-focus"]')).toBeNull();
  });
});
