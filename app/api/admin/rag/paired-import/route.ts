import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { callAiService } from "@/lib/internalApi/callAiService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";
import { PairedImportError, VisualCard, enrichExternalChunks, parseVisualExtractsDocx, sourceHash, validateExternalJsonl } from "@/lib/imports/pairedChapterImport";
import { DomainError } from "@/lib/services/admin/catalogueService";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ImportStage = "session" | "csrf" | "multipart" | "preflight" | "audit" | "drive" | "ingestion" | "queued_audit";

function safeMessage(error: unknown, stage: ImportStage) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return ["Unauthenticated", 401] as const;
  if (error instanceof Error && error.message === "UNAUTHORIZED") return ["Unauthorized", 403] as const;
  if (error instanceof DomainError && error.code === "FORBIDDEN") return ["Forbidden", 403] as const;
  if (error instanceof PairedImportError) {
    const detail = error.message !== error.code ? `: ${error.message}` : "";
    return [`Paired import validation failed (${error.code}${detail})`, 400, error.code] as const;
  }
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
  return ["Paired import failed", status, `PAIRED_IMPORT_${stage.toUpperCase()}_FAILED`] as const;
}

function fileValue(form: FormData, key: string) {
  const value = form.get(key);
  if (!(value instanceof File) || !value.size) throw new PairedImportError("PAIRED_IMPORT_FILE_MISSING");
  return value;
}
function scopeValue(form: FormData, key: "board_id" | "class_id" | "subject_id") {
  const value = form.get(key); if (typeof value !== "string" || !value.trim() || value.length > 240) throw new PairedImportError("PAIRED_IMPORT_SCOPE_INVALID"); return value.trim();
}

export async function POST(request: NextRequest) {
  // Must remain first: public Vercel never parses multipart bodies or touches Drive.
  if (!isAdminPanelEnabled()) return NextResponse.json({ status: "error", message: "Not Found" }, { status: 404 });
  let uploadedCreatedKeys: string[] = [];
  let ingestionQueued = false;
  let stage: ImportStage = "session";
  let audit: { uid: string; importHash: string; scope: { board_id: string; class_id: string; subject_id: string } } | null = null;
  try {
    const session = await requireAdminSession();
    stage = "csrf";
    await validateAdminWriteRequest(request);
    stage = "multipart";
    const form = await request.formData();
    const scope = { board_id: scopeValue(form, "board_id"), class_id: scopeValue(form, "class_id"), subject_id: scopeValue(form, "subject_id") };
    const jsonlVal = form.get("jsonl");
    const docxVal = form.get("visual_docx");
    const jsonlFile = jsonlVal instanceof File && jsonlVal.size > 0 ? jsonlVal : null;
    const docxFile = docxVal instanceof File && docxVal.size > 0 ? docxVal : null;

    if (!jsonlFile) {
      throw new PairedImportError("PAIRED_IMPORT_FILE_MISSING", "JSONL file is required.");
    }
    if (!jsonlFile.name.toLowerCase().endsWith(".jsonl")) {
      throw new PairedImportError("PAIRED_IMPORT_FILE_TYPE_INVALID", "JSONL file must end with .jsonl");
    }
    if (docxFile && !docxFile.name.toLowerCase().endsWith(".docx")) {
      throw new PairedImportError("PAIRED_IMPORT_FILE_TYPE_INVALID", "Visual file must end with .docx");
    }
    if (jsonlFile.size > 5 * 1024 * 1024 || (docxFile && docxFile.size > 25 * 1024 * 1024)) {
      throw new PairedImportError("PAIRED_IMPORT_FILE_TOO_LARGE");
    }

    const jsonlBytes = Buffer.from(await jsonlFile.arrayBuffer());
    let jsonl = "";
    try { jsonl = new TextDecoder("utf-8", { fatal: true }).decode(jsonlBytes); } catch { throw new PairedImportError("EXTERNAL_JSONL_INVALID"); }

    const cards = docxFile ? await parseVisualExtractsDocx(Buffer.from(await docxFile.arrayBuffer())) : new Map<string, VisualCard>();
    stage = "preflight";

    const chunks = validateExternalJsonl(jsonl, scope);
    const chapterId = chunks[0]?.chapter_id;

    const existingVisuals = new Map<string, { visual_id: string; title: string; description: string; storage_key: string }>();
    if (chapterId) {
      try {
        const insp = await callAiService(
          "/api/v1/internal/admin/rag",
          "POST",
          { operation: "get_chapter_visuals", ...scope, chapter_id: chapterId },
          session.uid,
          true,
          "local_rag_admin",
          { requestId: request.headers.get("x-request-id") ?? undefined },
        ) as Array<{ visual_id: string; title: string; description: string; storage_key: string }>;
        if (Array.isArray(insp)) {
          for (const item of insp) {
            if (item.visual_id) {
              existingVisuals.set(item.visual_id, item);
            }
          }
        }
      } catch {
        // Active version might not exist yet for first subject upload
      }
    }

    const importHash = sourceHash(chunks, cards, scope, existingVisuals); audit = { uid: session.uid, importHash, scope };

    const prior = await callAiService(
      "/api/v1/internal/paired-import/status",
      "POST",
      { import_hash: importHash },
      session.uid,
      true,
      "local_paired_import",
      { requestId: request.headers.get("x-request-id") ?? undefined },
    ) as {
      found?: boolean;
      import_status?: string;
      job_id?: string | null;
      job_status?: string | null;
      job_stage?: string | null;
      progress?: number | null;
    };
    if (
      prior.found
      && prior.job_id
      && prior.job_status
      && ["queued", "leased", "running", "retry_wait", "succeeded"].includes(prior.job_status)
    ) {
      return NextResponse.json(
        {
          status: "success",
          data: {
            duplicate: true,
            message: prior.job_status === "succeeded"
              ? "This chapter content and its visuals were already imported successfully."
              : "This exact chapter import is already being processed.",
            chunk_count: chunks.length,
            referenced_visual_count: cards.size,
            unused_visual_count: 0,
            warnings: [],
            job_id: prior.job_id,
            job_status: prior.job_status,
            job_stage: prior.job_stage,
            progress: prior.progress,
          },
        },
        { status: prior.job_status === "succeeded" ? 200 : 202 },
      );
    }

    const preflight = enrichExternalChunks(chunks, cards, new Map([...cards.keys()].map((id) => [id, "internal-preflight"])), existingVisuals);

    stage = "audit";
    await callAiService("/api/v1/internal/paired-import/audit", "POST", { operation: "started", import_hash: importHash, ...scope, chunk_count: chunks.length, referenced_visual_count: preflight.referenced.size, unused_visual_count: preflight.unused.length }, session.uid, true, "local_paired_import", { requestId: request.headers.get("x-request-id") ?? undefined });
    stage = "drive";
    const drive = new GoogleDriveProvider(); const keys = new Map<string, string>();
    for (const visualId of preflight.referenced) {
      const card = cards.get(visualId);
      if (card) {
        const stored = await drive.uploadPairedVisual({ filename: `paired-${card.imageHash}.png`, mimeType: card.mimeType, body: card.image, contentHash: card.imageHash });
        keys.set(visualId, stored.storageKey); if (stored.created) uploadedCreatedKeys.push(stored.storageKey);
      }
    }
    await callAiService("/api/v1/internal/paired-import/audit", "POST", { operation: "assets_uploaded", import_hash: importHash, ...scope, chunk_count: chunks.length, referenced_visual_count: preflight.referenced.size, unused_visual_count: preflight.unused.length, asset_hashes: [...preflight.referenced].filter((id) => cards.has(id)).map((id) => cards.get(id)!.imageHash) }, session.uid, true, "local_paired_import", { requestId: request.headers.get("x-request-id") ?? undefined });
    const enriched = enrichExternalChunks(chunks, cards, keys, existingVisuals);
    stage = "ingestion";
    const retrySuffix = prior.found && (prior.import_status === "failed" || prior.job_status === "failed")
      ? `:retry:${crypto.randomUUID()}`
      : "";
    const result = await callAiService("/api/v1/internal/ingest/jsonl", "POST", { jsonl_content: enriched.enriched, idempotency_key: `paired-import:${importHash}${retrySuffix}`, resource_version_id: "paired-import-v1" }, session.uid, true, "paired_jsonl_ingest", { requestId: request.headers.get("x-request-id") ?? undefined });
    ingestionQueued = true;
    stage = "queued_audit";
    await callAiService("/api/v1/internal/paired-import/audit", "POST", { operation: "queued", import_hash: importHash, ...scope, chunk_count: chunks.length, referenced_visual_count: enriched.referenced.size, unused_visual_count: enriched.unused.length, job_id: result.job_id }, session.uid, true, "local_paired_import", { requestId: request.headers.get("x-request-id") ?? undefined });
    uploadedCreatedKeys = [];
    return NextResponse.json({ status: "success", data: { chunk_count: chunks.length, referenced_visual_count: enriched.referenced.size, unused_visual_count: enriched.unused.length, warnings: enriched.unused.length ? ["Unused Visual Extracts assets were not uploaded."] : [], job_id: result.job_id, job_status: result.status } }, { status: 202 });
  } catch (error) {
    // A known rejected enqueue can be compensated safely.  Existing objects are
    // content-addressed and are never deleted by a retry.
    if (!ingestionQueued && uploadedCreatedKeys.length) {
      try { const drive = new GoogleDriveProvider(); await Promise.all(uploadedCreatedKeys.map((key) => drive.delete(key))); } catch { /* recorded below; never leak provider details */ }
    }
    if (audit && !ingestionQueued) {
      try { await callAiService("/api/v1/internal/paired-import/audit", "POST", { operation: "failed", import_hash: audit.importHash, ...audit.scope, error_code: error instanceof PairedImportError ? error.code : "PAIRED_IMPORT_FAILED" }, audit.uid, true, "local_paired_import", { requestId: request.headers.get("x-request-id") ?? undefined }); } catch { /* failure is still safely represented by no queued job */ }
    }
    console.error("Paired import failed", {
      stage,
      error_name: error instanceof Error ? error.name : "UnknownError",
      upstream_status: typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined,
    });
    const [message, status, code] = safeMessage(error, stage);
    return NextResponse.json({ status: "error", message, ...(code ? { code } : {}) }, { status });
  }
}
