// M1-11: shrouded API prefixes 404 before a route handler or the catch-all page can run.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { flagsFromSearch, refuseShroudedApi } from "@/shell/v1Shroud";

export function proxy(request: NextRequest) {
  const denied = refuseShroudedApi(request.nextUrl.pathname, flagsFromSearch(request.nextUrl.searchParams));
  if (!denied) return NextResponse.next();
  return new NextResponse(null, { status: denied.status });
}

export const config = { matcher: ["/api/:path*"] };
