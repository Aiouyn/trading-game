// M2-05 service worker source (served at /sw.js by src/app/sw.js/route.ts, versioned by the build SHA).
// Safety rules (docs/v1/PWA.md):
// - It caches ONLY the public static allowlist below, into `quay-static-<version>`; never HTML, RSC, API, _next or
//   anything personalised. activate deletes only older `quay-static-*` caches.
// - It never handles a non-GET request (orders, auth and every write go straight to the network; nothing is queued
//   or replayed) and never a cross-origin one.
// - Navigations are network-only and never stored; only when the network fails is the static /offline.html shown.
// - It never reloads a page: a new version takes over silently (the app's behaviour does not depend on it).
export const SW_CACHE_PREFIX = "quay-static-";
export const SW_ALLOWLIST = ["/offline.html", "/quay-icon.svg", "/manifest.webmanifest"] as const;

export function swSource(version: string): string {
  return `"use strict";
const CACHE = ${JSON.stringify(SW_CACHE_PREFIX + version)};
const ALLOW = ${JSON.stringify(SW_ALLOWLIST)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ALLOW.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(${JSON.stringify(SW_CACHE_PREFIX)}) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html", { cacheName: CACHE }).then((r) => r || Response.error())));
    return;
  }
  if (!url.search && ALLOW.includes(url.pathname)) {
    e.respondWith(caches.match(url.pathname, { cacheName: CACHE }).then((r) => r || fetch(req)));
  }
});
`;
}
