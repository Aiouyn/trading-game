// M2-05: register /sw.js after load, in production builds only. Never in `next dev` or the e2e hooks build
// (QUAY_HOOKS=1), whose page.route mocks a service worker would bypass. No reload, no install prompt.
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production" || process.env.QUAY_HOOKS === "1") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const go = () => { navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}); };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}
