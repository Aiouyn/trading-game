// M1-11: shrouded paths 404 before a route handler or the catch-all can render the shell.
// Runs for pages as well as /api so a `.rsc` flight and a `%2F` path cannot come back as 200.
// M3-06: when the kill switch is on, mutating /api requests get 503. Reads, including /api/health, stay.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readOnlyBlock } from "@/server/spend/guard";
import { flagsFromSearch, refuseShroudedApi, routeShrouded } from "@/shell/v1Shroud";

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function proxy(request: NextRequest) {
  const flags = flagsFromSearch(request.nextUrl.searchParams);
  const path = request.nextUrl.pathname;
  const segments = path.split("/").filter(Boolean);
  if (refuseShroudedApi(path, flags) || routeShrouded(segments, flags)) return new NextResponse(null, { status: 404 });
  if (isApiPath(path)) {
    const block = readOnlyBlock(process.env, request.method);
    if (block) {
      return NextResponse.json(
        { error: { code: "READ_ONLY", message: block.message } },
        { status: block.status },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
