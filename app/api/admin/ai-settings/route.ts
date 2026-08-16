import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { z } from "zod";

const scopeSchema = z.object({
  kind: z.enum(["global", "subject", "class_subject", "account_tier"]),
  subject_id: z.string().trim().min(1).max(120).optional(),
  class_id: z.string().trim().min(1).max(120).optional(),
  account_tier: z.enum(["anonymous", "google", "premium"]).optional(),
}).strict();
const mutationSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/).max(160),
  scope: scopeSchema,
  value: z.union([z.boolean(), z.number(), z.string()]),
}).strict();

function failure(error: unknown) {
  const status = (error as { status?: unknown })?.status;
  const code = (error as { errorData?: { detail?: { code?: unknown } } })?.errorData?.detail?.code;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return NextResponse.json({ status: "error", code: typeof code === "string" ? code : "RUNTIME_SETTING_REJECTED" }, { status });
  }
  return NextResponse.json({ status: "error", code: "RUNTIME_SETTINGS_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  // Local gate is first: no session, JWT signing, or service call on public deployments.
  if (!isAdminPanelEnabled()) return new NextResponse("Not Found", { status: 404 });
  try {
    const session = await requireAdminSession();
    const data = await callAiService("/api/v1/internal/admin/runtime-settings", "GET", null, session.uid, true, "local_runtime_settings", { requestId: request.headers.get("x-request-id") ?? undefined });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  // Keep the established local-admin protection order for mutations.
  if (!isAdminPanelEnabled()) return new NextResponse("Not Found", { status: 404 });
  try {
    const session = await requireAdminSession();
    await validateAdminWriteRequest(request);
    const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ status: "error", code: "RUNTIME_SETTING_INVALID_REQUEST" }, { status: 400 });
    const data = await callAiService("/api/v1/internal/admin/runtime-settings", "POST", parsed.data, session.uid, true, "local_runtime_settings", { requestId: request.headers.get("x-request-id") ?? undefined });
    return NextResponse.json({ status: "success", data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
