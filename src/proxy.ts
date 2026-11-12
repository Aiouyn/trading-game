// M1-11: shrouded paths 404 before a route handler or the catch-all can render the shell.
// Runs for pages as well as /api so a `.rsc` flight and a `%2F` path cannot come back as 200.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { flagsFromSearch, refuseShroudedApi, routeShrouded } from "@/shell/v1Shroud";

export function proxy(request: NextRequest) {
  const flags = flagsFromSearch(request.nextUrl.searchParams);
  const path = request.nextUrl.pathname;
  const segments = path.split("/").filter(Boolean);
  if (refuseShroudedApi(path, flags) || routeShrouded(segments, flags)) return new NextResponse(null, { status: 404 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
