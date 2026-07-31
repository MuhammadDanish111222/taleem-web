import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { askAdminRequestSchema } from "@/lib/ai/adminContracts";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { DomainError } from "@/lib/services/admin/catalogueService";

function safeError(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return ["Unauthenticated", 401] as const;
  }
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return ["Unauthorized", 403] as const;
  }
  if (error instanceof DomainError && error.code === "FORBIDDEN") {
    return ["Forbidden", 403] as const;
  }
  const upstreamStatus = (error as { status?: unknown })?.status;
  if (typeof upstreamStatus === "number" && upstreamStatus >= 400 && upstreamStatus < 500) {
    return ["Admin operation rejected", upstreamStatus] as const;
  }
  if (upstreamStatus === 502 || upstreamStatus === 503 || upstreamStatus === 504) {
    return ["AI service unavailable", upstreamStatus] as const;
  }
  return ["Ask administration failed", 500] as const;
}

export async function POST(request: NextRequest) {
  // The local-only gate is deliberately first so public deployments never
  // perform session checks, CSRF work, body parsing, JWT signing, or service IO.
  if (!isAdminPanelEnabled()) {
    return NextResponse.json({ status: "error", message: "Not Found" }, { status: 404 });
  }

  try {
    const session = await requireAdminSession();
    await validateAdminWriteRequest(request);
    const parsed = askAdminRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid Ask admin request" }, { status: 400 });
    }
    const data = await callAiService(
      "/api/v1/internal/admin/ask",
      "POST",
      parsed.data,
      session.uid,
      true,
      "local_ask_admin",
      { requestId: request.headers.get("x-request-id") ?? undefined },
    );
    return NextResponse.json({ status: "success", data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const [message, status] = safeError(error);
    return NextResponse.json({ status: "error", message }, { status });
  }
}
