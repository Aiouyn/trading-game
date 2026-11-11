import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readOnlyBlock } from "@/server/spend/guard";

/** Kill switch: mutating API calls stop. Reads, including /api/health, stay. */
export function proxy(request: NextRequest) {
  const block = readOnlyBlock(process.env, request.method);
  if (!block) return NextResponse.next();
  return NextResponse.json({ error: "READ_ONLY", message: block.message }, { status: block.status });
}

export const config = {
  matcher: ["/api/:path*"],
};
