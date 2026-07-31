import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { listAdminResources } from "@/lib/services/admin/adminContentService";

export async function GET(request: NextRequest) {
  await connection();
  try {
    await requireAdminSession();
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const result = await listAdminResources(cursor, 20);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    console.error("Admin content list failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load content" }, { status: 500 });
  }
}
