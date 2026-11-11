import { assertLocalSingleProcessAuth, assertSameOriginMutation, authErrorResponse, getAuthService, jsonResponse, readJsonObjectCapped, tokenFromRequest, AuthError } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { isIdempotencyKey } from "@/server/player/privateState";
import { getLiveMarket } from "@/server/market/clock";
import { WIRE_POST_MAX_BODY_BYTES, WirePostError, mergePlayerStatements, playerPostToWireItem } from "@/server/wire/playerStatements";
import { marksFromTicker } from "@/server/wire/statementResolve";

export const dynamic = "force-dynamic";

function wireErrorResponse(err: unknown): Response {
  if (err instanceof WirePostError) {
    return jsonResponse({ error: { code: err.code, message: err.message } }, err.status);
  }
  return authErrorResponse(err);
}

/**
 * Port Avalon Wire stories (M1-09 + player statements): the stories the shared clock has published, merged with
 * durable player posts from the auth store. GET is public. It may persist newly due statement verdicts
 * (no cash or quote change). A clock restart is a new `epoch` for catalog stories; player posts rematerialize
 * from the auth store.
 */
export async function GET(): Promise<Response> {
  assertLocalSingleProcessAuth();
  getBroker();
  const market = getLiveMarket();
  const snap = market.wire();
  const auth = getAuthService();
  const marks = marksFromTicker(market.snapshot().quotes.rows);
  await auth.resolveDueWireStatements({ tick: snap.tick, marks });
  const posts = await auth.listPublicWirePosts();
  return jsonResponse({ ...snap, items: mergePlayerStatements(snap.items, posts) });
}

/**
 * soc.wire.post (15:625): a signed-in player posts a short STATEMENT about 1–3 listed assets, paying $500
 * spendable cash, at most three times per game day. Idempotent on idempotencyKey.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertLocalSingleProcessAuth();
    assertSameOriginMutation(request);
    const type = request.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(type)) throw new AuthError("BAD_REQUEST", "Expected application/json.", 415);
    const view = await getAuthService().resolveSession(tokenFromRequest(request));
    if (!view) throw new AuthError("UNAUTHORIZED", "Not signed in.", 401);
    let body: Record<string, unknown>;
    try {
      body = await readJsonObjectCapped(request, WIRE_POST_MAX_BODY_BYTES);
    } catch (err) {
      if (err instanceof AuthError && /too large/i.test(err.message)) {
        throw new WirePostError("BODY_TOO_LARGE", "Request body is too large.", 400);
      }
      throw err;
    }
    for (const k of Object.keys(body)) {
      if (!["idempotencyKey", "text", "assetTags"].includes(k)) throw new AuthError("BAD_REQUEST", `Unexpected field: ${k}.`, 400);
    }
    const key = body.idempotencyKey;
    if (!isIdempotencyKey(key)) throw new AuthError("BAD_REQUEST", "idempotencyKey must be 8–64 letters, digits, _ or -.", 400);
    const market = getLiveMarket();
    const tick = market.wire().tick;
    const result = await getAuthService().postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: key,
      text: body.text,
      assetTags: body.assetTags,
      tick,
      marks: marksFromTicker(market.snapshot().quotes.rows),
    });
    return jsonResponse({
      post: result.post,
      item: playerPostToWireItem(result.post),
      cashCents: result.cashCents,
      remainingToday: result.remainingToday,
      replayed: result.replayed,
    }, result.replayed ? 200 : 201);
  } catch (err) {
    return wireErrorResponse(err);
  }
}
