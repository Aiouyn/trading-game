// A quiet pulse on the clock when the simulation's day changes and time is running.
// The clock lives in the shell; this watches the node it already paints.

let started = false;

function running(): boolean {
  const sim = document.querySelector("[data-testid='sim-time']");
  if (!sim) return false;
  return document.querySelector("[data-testid='speed-pause'][data-on='1']") == null;
}

function arm(el: Element): void {
  if (el.hasAttribute("data-pulse-armed")) return;
  el.setAttribute("data-pulse-armed", "1");
  let last = `${el.getAttribute("data-tick") ?? ""}|${el.textContent ?? ""}`;
  const obs = new MutationObserver(() => {
    const next = `${el.getAttribute("data-tick") ?? ""}|${el.textContent ?? ""}`;
    if (next === last) return;
    last = next;
    el.classList.remove("is-pulsing");
    if (!running()) return;
    void (el as HTMLElement).offsetWidth;
    el.classList.add("is-pulsing");
  });
  obs.observe(el, { attributes: true, attributeFilter: ["data-tick"], childList: true, characterData: true, subtree: true });
}

export function startAlive(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  const scan = (root: ParentNode) => {
    if (root instanceof Element && root.matches(".clock")) arm(root);
    root.querySelectorAll?.(".clock").forEach(arm);
  };
  scan(document);
  const boot = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
  });
  boot.observe(document.body, { childList: true, subtree: true });
}
