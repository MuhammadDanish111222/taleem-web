import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { DomainError } from "@/lib/services/admin/catalogueService";

const allowedOperations = new Set([
  "overview", "create_draft", "approve_qa", "activate", "rollback",
  "add_question", "edit_question", "delete_question", "edit_visual", "qa_search", "inspect_version",
]);

function safeError(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return ["Unauthenticated", 401] as const;
  if (error instanceof Error && error.message === "UNAUTHORIZED") return ["Unauthorized", 403] as const;
  if (error instanceof DomainError && error.code === "FORBIDDEN") return ["Forbidden", 403] as const;
  return ["RAG admin operation failed", typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500] as const;
}

export async function POST(request: NextRequest) {
  // This gate must remain first: public deployments do not reach session, CSRF,
  // JSON parsing, or the internal service for any Phase 3F route.
  if (!isAdminPanelEnabled()) return NextResponse.json({ status: "error", message: "Not Found" }, { status: 404 });
  try {
    const session = await requireAdminSession();
    await validateAdminWriteRequest(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.operation !== "string" || !allowedOperations.has(body.operation)) {
      return NextResponse.json({ status: "error", message: "Invalid RAG admin request" }, { status: 400 });
    }
    for (const field of ["board_id", "class_id", "subject_id"] as const) {
      if (typeof body[field] !== "string" || !body[field].trim()) {
        return NextResponse.json({ status: "error", message: "Missing corpus scope" }, { status: 400 });
      }
    }
    const result = await callAiService("/api/v1/internal/admin/rag", "POST", body, session.uid, true, "local_rag_admin", {
      requestId: request.headers.get("x-request-id") ?? undefined,
    });
    return NextResponse.json({ status: "success", data: result });
  } catch (error) {
    const [message, status] = safeError(error);
    return NextResponse.json({ status: "error", message }, { status });
  }
}
