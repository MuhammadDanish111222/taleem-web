import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && !isAdminPanelEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (pathname.startsWith("/test-") || pathname.startsWith("/api/test-")) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  // API routes must issue their established JSON 401/403 responses themselves.
  if (pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (!request.cookies.has("__session")) {
    return NextResponse.redirect(
      new URL("/admin/login", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/test-:path*", "/api/test-:path*"],
};
