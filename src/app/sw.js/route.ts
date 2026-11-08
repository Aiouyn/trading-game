import { swSource } from "@/pwa/swSource";

// M2-05: /sw.js, one static file per build. The build SHA in the cache name makes every deploy install a fresh
// allowlist and drop the previous one.
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(swSource(process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev"), {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}
