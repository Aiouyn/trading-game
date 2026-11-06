import { assertLocalSingleProcessAuth, jsonResponse } from "@/server/auth";
import { worldAttachBody } from "@/server/world";

export const dynamic = "force-dynamic";

/** Server-owned Port Avalon world identity (M1-02). Public read; attach is the constant itself. */
export async function GET(): Promise<Response> {
  assertLocalSingleProcessAuth();
  return jsonResponse(worldAttachBody());
}
