import { ASSETS } from "@/market/catalog";
import { assertLocalSingleProcessAuth, jsonResponse } from "@/server/auth";
import { syncListings } from "@/server/launchpad";
import { worldAttachBody } from "@/server/world";

export const dynamic = "force-dynamic";

/** Server-owned Port Avalon world identity (M1-02). Public read; attach is the constant itself. */
export async function GET(): Promise<Response> {
  assertLocalSingleProcessAuth();
  await syncListings(); // the catalog includes the coins listed at graduation (L4)
  return jsonResponse({ ...worldAttachBody(), catalog: ASSETS });
}
