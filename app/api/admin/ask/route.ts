import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { askAdminRequestSchema } from "@/lib/ai/adminContracts";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { DomainError } from "@/lib/services/admin/catalogueService";
import { getAdminChapters } from "@/lib/firestore/catalogue.admin";

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
  if (error instanceof DomainError && error.code === "VALIDATION") {
    return ["Admin operation rejected", 400] as const;
  }
  const upstreamStatus = (error as { status?: unknown })?.status;
  const upstreamCode = (error as { errorData?: { detail?: { code?: unknown } } })
    ?.errorData?.detail?.code;
  const visualImportError = typeof upstreamCode === "string"
    ? /^IMPORT_QUESTION_(\d+)_VISUAL_LINK_NOT_REVIEWED$/.exec(upstreamCode)
    : null;
  if (visualImportError) {
    return [`Question ${visualImportError[1]}: visual_ids must reference one approved visual in the selected scope. No questions were imported.`, 409] as const;
  }
  if (typeof upstreamStatus === "number" && upstreamStatus >= 400 && upstreamStatus < 500) {
    return ["Admin operation rejected", upstreamStatus] as const;
  }
  if (upstreamStatus === 502 || upstreamStatus === 503 || upstreamStatus === 504) {
    return ["AI service unavailable", upstreamStatus] as const;
  }
  return ["Ask administration failed", 500] as const;
}

async function validateBlueprintChapterScope(body: { operation: string; board_id?: string; class_id?: string; subject_id?: string; blueprint?: { sections: Array<{ chapter_distribution: Record<string, number> }> } }) {
  if (body.operation !== "blueprint_preview" && body.operation !== "blueprint_save") return;
  const requested = new Set(body.blueprint?.sections.flatMap((section) => Object.keys(section.chapter_distribution)) ?? []);
  if (!requested.size) return;
  const chapters = await getAdminChapters(body.board_id!, body.class_id!, body.subject_id!);
  const allowed = new Set(chapters.filter((chapter) => chapter.active).map((chapter) => chapter.slug));
  if ([...requested].some((chapter) => !allowed.has(chapter))) {
    throw new DomainError("VALIDATION", "Blueprint chapter is outside the selected catalogue scope");
  }
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
    await validateBlueprintChapterScope(parsed.data);
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
