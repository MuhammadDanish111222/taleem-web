import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
const windows = new Set(["24h", "7d", "30d"]);
export async function GET(request: NextRequest) {
  if (!isAdminPanelEnabled()) return new NextResponse("Not Found", { status: 404 });
  const window = request.nextUrl.searchParams.get("window") ?? "24h";
  if (!windows.has(window)) return NextResponse.json({ code: "OPERATIONS_WINDOW_INVALID" }, { status: 400 });
  try { const session=await requireAdminSession(); const data=await callAiService(`/api/v1/internal/admin/operations-dashboard?window=${window}`,"GET",null,session.uid,true,"local_operations_dashboard",{requestId:request.headers.get("x-request-id")??undefined}); return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}}); }
  catch (error) { const code=error instanceof Error ? error.message : ""; const status=code === "UNAUTHENTICATED" ? 401 : code === "UNAUTHORIZED" ? 403 : 503; return NextResponse.json({code:status === 503 ? "OPERATIONS_UNAVAILABLE" : code},{status,headers:{"Cache-Control":"private, no-store"}}); }
}
