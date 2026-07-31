import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { DomainError } from "@/lib/services/admin/catalogueService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

const MINIMUM_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

function safeError(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return ["Unauthenticated", 401] as const;
  if (error instanceof Error && error.message === "UNAUTHORIZED") return ["Unauthorized", 403] as const;
  if (error instanceof DomainError && error.code === "FORBIDDEN") return ["Forbidden", 403] as const;
  return ["Drive visual cleanup failed", 500] as const;
}

export async function POST(request: NextRequest) {
  if (!isAdminPanelEnabled()) {
    return NextResponse.json({ status: "error", message: "Not Found" }, { status: 404 });
  }
  try {
    const session = await requireAdminSession();
    await validateAdminWriteRequest(request);
    const body = await request.json().catch(() => null) as { execute?: unknown } | null;
    if (!body || typeof body.execute !== "boolean") {
      return NextResponse.json({ status: "error", message: "Invalid cleanup request" }, { status: 400 });
    }
    const referenced = await callAiService(
      "/api/v1/internal/paired-import/referenced-assets",
      "POST",
      {},
      session.uid,
      true,
      "local_paired_import_cleanup",
      { requestId: request.headers.get("x-request-id") ?? undefined },
    ) as { storage_keys?: unknown };
    const referencedKeys = new Set(
      Array.isArray(referenced.storage_keys)
        ? referenced.storage_keys.filter((value): value is string => typeof value === "string")
        : [],
    );
    const drive = new GoogleDriveProvider();
    const objects = await drive.listPairedVisuals();
    const cutoff = Date.now() - MINIMUM_ORPHAN_AGE_MS;
    const referencedObjectCount = objects.filter((object) => referencedKeys.has(object.storageKey)).length;
    const youngUnreferencedCount = objects.filter((object) => (
      !referencedKeys.has(object.storageKey)
      && Number.isFinite(Date.parse(object.createdAt))
      && Date.parse(object.createdAt) >= cutoff
    )).length;
    const candidates = objects.filter((object) => (
      !referencedKeys.has(object.storageKey)
      && Number.isFinite(Date.parse(object.createdAt))
      && Date.parse(object.createdAt) < cutoff
    ));
    if (body.execute) {
      for (const candidate of candidates) {
        await drive.deletePairedVisual(candidate.storageKey);
      }
    }
    return NextResponse.json({
      status: "success",
      data: {
        mode: body.execute ? "executed" : "preview",
        importer_owned_count: objects.length,
        referenced_count: referencedObjectCount,
        young_unreferenced_count: youngUnreferencedCount,
        eligible_orphan_count: candidates.length,
        deleted_count: body.execute ? candidates.length : 0,
        minimum_age_hours: 24,
      },
    });
  } catch (error) {
    const [message, status] = safeError(error);
    return NextResponse.json({ status: "error", message }, { status });
  }
}
