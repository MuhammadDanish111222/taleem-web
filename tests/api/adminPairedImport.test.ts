import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/rag/paired-import/route";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { requireAdminSession } from "@/lib/auth/session";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { callAiService } from "@/lib/internalApi/callAiService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";
import * as paired from "@/lib/imports/pairedChapterImport";
import { DomainError } from "@/lib/services/admin/catalogueService";

vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({ validateAdminWriteRequest: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));
vi.mock("@/lib/storage/googleDriveProvider", () => ({ GoogleDriveProvider: vi.fn(function GoogleDriveProvider() {}) }));
vi.mock("@/lib/imports/pairedChapterImport", () => ({
  PairedImportError: class PairedImportError extends Error { code = "TEST"; },
  validateExternalJsonl: vi.fn(() => [{ visuals: [] }]), parseVisualExtractsDocx: vi.fn(async () => new Map()),
  enrichExternalChunks: vi.fn(() => ({ enriched: '{"internal":true}', referenced: new Set(), unused: [] })), sourceHash: vi.fn(() => "a".repeat(64)),
}));

describe("paired chapter import BFF security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminPanelEnabled).mockReturnValue(true);
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin", admin: true } as any);
    vi.mocked(validateAdminWriteRequest).mockResolvedValue();
    vi.mocked(callAiService).mockImplementation(async (endpoint) => (
      endpoint === "/api/v1/internal/paired-import/status"
        ? { found: false }
        : { status: "queued", job_id: "job-1" }
    ));
  });
  it("rejects disabled panel before session, CSRF, multipart body parsing, or service calls", async () => {
    vi.mocked(isAdminPanelEnabled).mockReturnValue(false); const request = new NextRequest("http://localhost/api/admin/rag/paired-import", { method: "POST" }); request.formData = vi.fn();
    const response = await POST(request);
    expect(response.status).toBe(404); expect(requireAdminSession).not.toHaveBeenCalled(); expect(validateAdminWriteRequest).not.toHaveBeenCalled(); expect(request.formData).not.toHaveBeenCalled(); expect(callAiService).not.toHaveBeenCalled();
  });
  it.each(["UNAUTHENTICATED", "UNAUTHORIZED"])('rejects an invalid or non-admin session before multipart parsing (%s)', async (reason) => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error(reason));
    const request = new NextRequest("http://localhost/api/admin/rag/paired-import", { method: "POST" }); request.formData = vi.fn();
    const response = await POST(request);
    expect(response.status).toBe(reason === "UNAUTHENTICATED" ? 401 : 403); expect(request.formData).not.toHaveBeenCalled(); expect(validateAdminWriteRequest).not.toHaveBeenCalled(); expect(callAiService).not.toHaveBeenCalled();
  });
  it.each(["Invalid origin", "CSRF token mismatch"])('rejects Origin or CSRF failure before multipart parsing (%s)', async (message) => {
    vi.mocked(validateAdminWriteRequest).mockRejectedValue(new DomainError("FORBIDDEN", message));
    const request = new NextRequest("http://localhost/api/admin/rag/paired-import", { method: "POST" }); request.formData = vi.fn();
    const response = await POST(request);
    expect(response.status).toBe(403); expect(request.formData).not.toHaveBeenCalled(); expect(callAiService).not.toHaveBeenCalled();
  });
  it("never returns enriched JSONL or storage keys", async () => {
    const form = new FormData(); form.set("board_id", "b"); form.set("class_id", "c"); form.set("subject_id", "s"); form.set("jsonl", new File(["{}"], "chapter.jsonl")); form.set("visual_docx", new File(["PK\x03\x04"], "visuals.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const request = new NextRequest("http://localhost/api/admin/rag/paired-import", { method: "POST", body: form });
    const response = await POST(request); const text = await response.text(); expect(response.status).toBe(202); expect(text).not.toContain("internal"); expect(text).not.toContain("storage_key");
  });
  it("returns the existing successful job without uploading or enqueueing an exact duplicate", async () => {
    const upload = vi.fn();
    vi.mocked(GoogleDriveProvider).mockImplementation(function GoogleDriveProvider() {
      return { uploadPairedVisual: upload } as any;
    } as any);
    vi.mocked(callAiService).mockImplementation(async (endpoint) => {
      if (endpoint === "/api/v1/internal/paired-import/status") {
        return { found: true, import_status: "queued", job_id: "job-existing", job_status: "succeeded", job_stage: "completed", progress: 100 };
      }
      throw new Error(`Unexpected call: ${endpoint}`);
    });
    const form = new FormData(); form.set("board_id", "b"); form.set("class_id", "c"); form.set("subject_id", "s"); form.set("jsonl", new File(["{}"], "chapter.jsonl")); form.set("visual_docx", new File(["PK\x03\x04"], "visuals.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const response = await POST(new NextRequest("http://localhost/api/admin/rag/paired-import", { method: "POST", body: form }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ duplicate: true, job_id: "job-existing", job_status: "succeeded" });
    expect(upload).not.toHaveBeenCalled();
    expect(callAiService).toHaveBeenCalledTimes(1);
  });
  it("automatically creates an editable copy before importing a new chapter after activation", async () => {
    const calls: Array<{ endpoint: string; body: any }> = [];
    vi.mocked(callAiService).mockImplementation(async (endpoint, _method, body) => {
      calls.push({ endpoint, body });
      if (endpoint === "/api/v1/internal/paired-import/status") return { found: false };
      if (endpoint === "/api/v1/internal/admin/rag" && body.operation === "overview") {
        return { versions: [{ id: "active-version", status: "active" }] };
      }
      if (endpoint === "/api/v1/internal/ingest/jsonl") return { status: "queued", job_id: "job-new" };
      return { status: "ok" };
    });
    const form = new FormData(); form.set("board_id", "b"); form.set("class_id", "c"); form.set("subject_id", "s"); form.set("jsonl", new File(["{}"], "chapter.jsonl")); form.set("visual_docx", new File(["PK\x03\x04"], "visuals.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const response = await POST(new NextRequest("http://localhost/api/admin/rag/paired-import", { method: "POST", body: form }));
    expect(response.status).toBe(202);
    const cloneIndex = calls.findIndex((call) => call.body.operation === "create_draft");
    const ingestIndex = calls.findIndex((call) => call.endpoint === "/api/v1/internal/ingest/jsonl");
    expect(cloneIndex).toBeGreaterThan(-1);
    expect(ingestIndex).toBeGreaterThan(cloneIndex);
    expect(calls[cloneIndex].body).toMatchObject({ corpus_version_id: "active-version", board_id: "b", class_id: "c", subject_id: "s" });
  });
  it("compensates only newly created Drive objects when enqueue fails", async () => {
    const upload = vi.fn().mockResolvedValue({ storageKey: "private-drive-key", created: true }); const remove = vi.fn().mockResolvedValue(undefined);
    vi.mocked(GoogleDriveProvider).mockImplementation(function GoogleDriveProvider() { return { uploadPairedVisual: upload, delete: remove } as any; } as any);
    vi.mocked(paired.validateExternalJsonl).mockReturnValue([{ visuals: [{ visual_id: "v1" }] }] as any);
    vi.mocked(paired.parseVisualExtractsDocx).mockResolvedValue(new Map([["v1", { imageHash: "b".repeat(64), image: Buffer.from("image"), mimeType: "image/png" }]]) as any);
    vi.mocked(paired.enrichExternalChunks).mockReturnValue({ enriched: "private-drive-key", referenced: new Set(["v1"]), unused: [] });
    vi.mocked(callAiService).mockImplementation(async (endpoint) => { if (endpoint === "/api/v1/internal/paired-import/status") return { found: false }; if (endpoint === "/api/v1/internal/ingest/jsonl") { const error: any = new Error("service failure"); error.status = 503; throw error; } return { status: "ok" }; });
    const form = new FormData(); form.set("board_id", "b"); form.set("class_id", "c"); form.set("subject_id", "s"); form.set("jsonl", new File(["{}"], "chapter.jsonl")); form.set("visual_docx", new File(["PK\x03\x04"], "visuals.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const response = await POST(new NextRequest("http://localhost/api/admin/rag/paired-import", { method: "POST", body: form })); const text = await response.text();
    expect(response.status).toBe(503); expect(remove).toHaveBeenCalledWith("private-drive-key"); expect(text).not.toContain("private-drive-key");
  });
  it("does not delete an existing content-addressed Drive object when retry enqueue fails", async () => {
    const upload = vi.fn().mockResolvedValue({ storageKey: "existing-private-key", created: false }); const remove = vi.fn();
    vi.mocked(GoogleDriveProvider).mockImplementation(function GoogleDriveProvider() { return { uploadPairedVisual: upload, delete: remove } as any; } as any);
    vi.mocked(paired.validateExternalJsonl).mockReturnValue([{ visuals: [{ visual_id: "v1" }] }] as any);
    vi.mocked(paired.parseVisualExtractsDocx).mockResolvedValue(new Map([["v1", { imageHash: "b".repeat(64), image: Buffer.from("image"), mimeType: "image/png" }]]) as any);
    vi.mocked(paired.enrichExternalChunks).mockReturnValue({ enriched: "existing-private-key", referenced: new Set(["v1"]), unused: [] });
    vi.mocked(callAiService).mockImplementation(async (endpoint) => { if (endpoint === "/api/v1/internal/paired-import/status") return { found: false }; if (endpoint === "/api/v1/internal/ingest/jsonl") { const error: any = new Error("service failure"); error.status = 503; throw error; } return { status: "ok" }; });
    const form = new FormData(); form.set("board_id", "b"); form.set("class_id", "c"); form.set("subject_id", "s"); form.set("jsonl", new File(["{}"], "chapter.jsonl")); form.set("visual_docx", new File(["PK\x03\x04"], "visuals.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const response = await POST(new NextRequest("http://localhost/api/admin/rag/paired-import", { method: "POST", body: form }));
    expect(response.status).toBe(503); expect(remove).not.toHaveBeenCalled();
  });
});
