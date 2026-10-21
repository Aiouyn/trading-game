// @vitest-environment happy-dom
// Studio #38: segments stack at text scale >= 1.5, and at any scale when one row would overflow (never truncate).
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STACK_AT } from "@/apps/settings/Appearance";
import { rowOverflows, Segment } from "@/apps/settings/controls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const OPTS = [{ id: "system", label: "System" }, { id: "on", label: "On" }, { id: "off", label: "Off" }] as const;

function mount(stacked: boolean, rowWidth: number, hostWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("measure-row") ? rowWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => hostWidth);
  const host = document.createElement("div");
  document.body.append(host);
  act(() => createRoot(host).render(<Segment label="Reduce motion" value="system" options={OPTS} onChange={() => {}} stacked={stacked} testId="seg" />));
  return host.querySelector<HTMLElement>("[data-testid=seg]")!;
}
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("Segment stacking", () => {
  it("threshold is 1.5 (same as the icon-only dock)", () => expect(STACK_AT).toBe(1.5));
  it("scale stacking: stacked prop → column", () => {
    const el = mount(true, 100, 400);
    expect(el.className).toContain("stacked");
    expect(el.dataset.stacked).toBe("scale");
  });
  it("scale 1, labels fit: one row", () => {
    const el = mount(false, 180, 400);
    expect(el.className).not.toContain("stacked");
    expect(el.dataset.stacked).toBeUndefined();
  });
  it("scale 1, labels would overflow: stacks so nothing truncates", () => {
    const el = mount(false, 260, 200);
    expect(el.className).toContain("stacked");
    expect(el.dataset.stacked).toBe("overflow");
    expect(el.classList.contains("measure-row")).toBe(false);
  });
  it("rowOverflows measures the unwrapped row against the container", () => {
    const el = mount(false, 10, 400);
    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(301);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
    expect(rowOverflows(el)).toBe(true);
  });
});
