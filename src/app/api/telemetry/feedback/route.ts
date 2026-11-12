import { AuthError } from "@/server/auth/types";
import { jsonResponse } from "@/server/auth/http";
import {
  appendFeedback,
  handleTelemetry,
  TELEMETRY_FEEDBACK_MAX_CHARS,
  TELEMETRY_ROUTE_MAX,
} from "@/server/telemetry";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTelemetry(request, "feedback", async (body, requestId) => {
    const text = typeof body.text === "string" ? body.text : "";
    const route = typeof body.route === "string" ? body.route : "";
    if (!text.trim()) throw new AuthError("BAD_REQUEST", "Missing or invalid field: text.", 400);
    if (!route) throw new AuthError("BAD_REQUEST", "Missing or invalid field: route.", 400);
    if (text.length > TELEMETRY_FEEDBACK_MAX_CHARS) throw new AuthError("BAD_REQUEST", "Feedback is too long.", 400);
    if (route.length > TELEMETRY_ROUTE_MAX) throw new AuthError("BAD_REQUEST", "Route is too long.", 400);
    await appendFeedback({ requestId, route, text });
    return jsonResponse({ ok: true, requestId });
  });
}
