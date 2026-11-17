// Quay's API is the simulation. This route only forwards.
import { ensureSim } from "@/server/sim/host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  let origin: string;
  try { origin = await ensureSim(); }
  catch (err) {
    const message = err instanceof Error ? err.message : "simulation is not running";
    return Response.json({ error: message }, { status: 503 });
  }
  const { path } = await ctx.params;
  const incoming = new URL(req.url);
  const target = `${origin}/${path.map((seg) => encodeURIComponent(seg)).join("/")}${incoming.search}`;
  const headers = new Headers();
  const type = req.headers.get("content-type");
  if (type) headers.set("content-type", type);
  const init: RequestInit = { method: req.method, headers, cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();
  let res: Response;
  try { res = await fetch(target, init); }
  catch (err) {
    const message = err instanceof Error ? err.message : "simulation did not answer";
    return Response.json({ error: message }, { status: 502 });
  }
  const out = new Headers();
  const resType = res.headers.get("content-type");
  if (resType) out.set("content-type", resType);
  out.set("cache-control", resType?.includes("text/event-stream") ? "no-cache, no-transform" : "no-store");
  if (resType?.includes("text/event-stream")) out.set("x-accel-buffering", "no");
  return new Response(res.body, { status: res.status, headers: out });
}

export const GET = forward;
export const POST = forward;
