import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
const windows = new Set(["24h", "7d", "30d"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request: NextRequest) {
  if (!isAdminPanelEnabled()) return new NextResponse("Not Found", { status: 404 });
  const p=request.nextUrl.searchParams, window=p.get("window")??"24h", limit=Number(p.get("limit")??50);
  if (!windows.has(window)||!Number.isInteger(limit)||limit<1||limit>100) return NextResponse.json({code:"AUDIT_QUERY_INVALID"},{status:400});
  const query=new URLSearchParams({window,limit:String(limit)}); for(const key of ["cursor","action","target_type","target_id","error_code"] as const) { const value=p.get(key); const max=key === "target_id" ? 160 : key === "cursor" ? 36 : 120; if(value && (value.length>max || (key === "cursor" && !uuid.test(value)))) return NextResponse.json({code:"AUDIT_QUERY_INVALID"},{status:400}); if(value) query.set(key,value); }
  try { const s=await requireAdminSession(); const data=await callAiService(`/api/v1/internal/admin/audit-search?${query}`,"GET",null,s.uid,true,"local_operations_dashboard",{requestId:request.headers.get("x-request-id")??undefined}); return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}}); }
  catch (error) { const code=error instanceof Error ? error.message : ""; const status=code === "UNAUTHENTICATED" ? 401 : code === "UNAUTHORIZED" ? 403 : 503; return NextResponse.json({code:status === 503 ? "AUDIT_UNAVAILABLE" : code},{status,headers:{"Cache-Control":"private, no-store"}}); }
}
