import { assertLocalSingleProcessAuth, assertSameOriginMutation, authErrorResponse, getAuthService, jsonResponse, readJsonObject, tokenFromRequest, AuthError } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { isIdempotencyKey } from "@/server/player/privateState";
import { getLiveMarket } from "@/server/market/clock";
import { WirePostError, mergePlayerStatements, playerPostToWireItem } from "@/server/wire/playerStatements";

export const dynamic = "force-dynamic";

function wireErrorResponse(err: unknown): Response {
  if (err instanceof WirePostError) {
    return jsonResponse({ error: { code: err.code, message: err.message } }, err.status);
  }
  return authErrorResponse(err);
}

/**
 * Port Avalon Wire stories (M1-09 + player statements): the stories the shared clock has published, merged with
 * durable player posts from the auth store. GET is public and writes nothing. A clock restart is a new `epoch`
 * for catalog stories; player posts rematerialize from the auth store.
 */
export async function GET(): Promise<Response> {
  assertLocalSingleProcessAuth();
  getBroker();
  const snap = getLiveMarket().wire();
  const posts = await getAuthService().listPublicWirePosts();
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
    const body = await readJsonObject(request);
    for (const k of Object.keys(body)) {
      if (!["idempotencyKey", "text", "assetTags"].includes(k)) throw new AuthError("BAD_REQUEST", `Unexpected field: ${k}.`, 400);
    }
    const key = body.idempotencyKey;
    if (!isIdempotencyKey(key)) throw new AuthError("BAD_REQUEST", "idempotencyKey must be 8–64 letters, digits, _ or -.", 400);
    const tick = getLiveMarket().wire().tick;
    const result = await getAuthService().postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: key,
      text: body.text,
      assetTags: body.assetTags,
      tick,
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
