import {
  AuthError,
  assertLocalSingleProcessAuth,
  assertSameOriginMutation,
  getAuthService,
  readJsonObject,
  tokenFromRequest,
  type AuthSessionView,
} from "@/server/auth";
import { isIdempotencyKey } from "@/server/player/privateState";
import type { OrderDraft } from "@/shell/contracts/channels";
import { orderDraft, ParseError } from "@/shell/contracts/schema";

/** Session for a Broker route; 401 when signed out. */
export async function requireBrokerSession(request: Request): Promise<AuthSessionView> {
  assertLocalSingleProcessAuth();
  const view = await getAuthService().resolveSession(tokenFromRequest(request));
  if (!view) throw new AuthError("UNAUTHORIZED", "Not signed in.", 401);
  return view;
}

/**
 * Broker mutation guard: same-origin (auth's CSRF rule) and a JSON body, so a cross-site form post cannot place orders.
 * Returns the parsed object.
 */
export async function readBrokerMutation(request: Request): Promise<Record<string, unknown>> {
  assertLocalSingleProcessAuth();
  assertSameOriginMutation(request);
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new AuthError("BAD_REQUEST", "Expected application/json.", 415);
  return readJsonObject(request);
}

export function requireIdempotencyKey(body: Record<string, unknown>): string {
  const key = body.idempotencyKey;
  if (!isIdempotencyKey(key)) throw new AuthError("BAD_REQUEST", "idempotencyKey must be 8–64 letters, digits, _ or -.", 400);
  return key;
}

export function requireDraft(body: Record<string, unknown>): OrderDraft {
  try {
    return orderDraft(body.draft, "draft");
  } catch (err) {
    if (err instanceof ParseError) throw new AuthError("BAD_REQUEST", `Invalid order: ${err.message}`, 400);
    throw err;
  }
}

export function requireOrderId(body: Record<string, unknown>): string {
  const id = body.orderId;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new AuthError("BAD_REQUEST", "Invalid orderId.", 400);
  return id;
}

export function assertOnlyKeys(body: Record<string, unknown>, keys: readonly string[]): void {
  for (const k of Object.keys(body)) if (!keys.includes(k)) throw new AuthError("BAD_REQUEST", `Unexpected field: ${k}.`, 400);
}
