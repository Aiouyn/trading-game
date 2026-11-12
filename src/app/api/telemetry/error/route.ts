import { AuthError } from "@/server/auth/types";
import { jsonResponse } from "@/server/auth/http";
import { appendError, handleTelemetry, TELEMETRY_ROUTE_MAX } from "@/server/telemetry";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTelemetry(request, "error", async (body, requestId) => {
    const route = typeof body.route === "string" ? body.route : "";
    const message = typeof body.message === "string" ? body.message : "";
    if (!route || !message) throw new AuthError("BAD_REQUEST", "Missing or invalid field: route or message.", 400);
    if (route.length > TELEMETRY_ROUTE_MAX) throw new AuthError("BAD_REQUEST", "Route is too long.", 400);
    await appendError({ requestId, route, message, level: "error" });
    return jsonResponse({ ok: true, requestId });
  });
}
