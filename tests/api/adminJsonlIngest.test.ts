import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/ingest/jsonl/route";
import { requireAdminSession } from "@/lib/auth/session";
import { callAiService } from "@/lib/internalApi/callAiService";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { DomainError } from "@/lib/services/admin/catalogueService";

vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({ validateAdminWriteRequest: vi.fn() }));
vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));

const sampleJsonl = JSON.stringify({
  board_id: "fbise", class_id: "class_9", subject_id: "physics", chapter_id: "ch_1",
  topic_no: "1.1", topic_title: "Title", chunk_order: 0, content_type: "explanation",
  chunk_text: "Sample text", expected_questions: [],
});

describe("Admin JSONL ingestion BFF", () => {
  const originalEnv = process.env;
  let callOrder: string[] = [];

  function createSpiedRequest(headers: Record<string, string> = {}) {
    const req = new NextRequest("http://localhost:3000/api/admin/ingest/jsonl", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ jsonl_content: sampleJsonl, idempotency_key: "key-1" }),
    });

    const originalJson = req.json.bind(req);
    req.json = vi.fn().mockImplementation(async () => {
      callOrder.push("req.json");
      return originalJson();
    });
    return req;
  }

  beforeEach(() => {
    process.env = { ...originalEnv, ADMIN_PANEL_ENABLED: "true" };
    callOrder = [];
    vi.clearAllMocks();

    vi.mocked(isAdminPanelEnabled).mockImplementation(() => {
      callOrder.push("isAdminPanelEnabled");
      return process.env.ADMIN_PANEL_ENABLED === "true";
    });

    vi.mocked(requireAdminSession).mockImplementation(async () => {
      callOrder.push("requireAdminSession");
      return { uid: "admin-user-999", admin: true } as any;
    });

    vi.mocked(validateAdminWriteRequest).mockImplementation(async () => {
      callOrder.push("validateAdminWriteRequest");
    });

    vi.mocked(callAiService).mockImplementation(async () => {
      callOrder.push("callAiService");
      return { status: "queued", job_id: "job-uuid-12345" };
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("proves strict call order for valid requests: isAdminPanelEnabled -> requireAdminSession -> validateAdminWriteRequest -> req.json() -> callAiService", async () => {
    const req = createSpiedRequest({ "x-request-id": "req-jsonl-123" });
    const res = await POST(req);

    expect(res.status).toBe(202);
    expect(callOrder).toEqual([
      "isAdminPanelEnabled",
      "requireAdminSession",
      "validateAdminWriteRequest",
      "req.json",
      "callAiService",
    ]);
    expect(callAiService).toHaveBeenCalledWith(
      "/api/v1/internal/ingest/jsonl",
      "POST",
      expect.objectContaining({ jsonl_content: sampleJsonl, idempotency_key: "key-1" }),
      "admin-user-999",
      true,
      "jsonl_ingest",
      { requestId: "req-jsonl-123" },
    );
  });

  it("returns 404 without calling auth, security checks, body parsing, or AI service when panel is disabled", async () => {
    process.env.ADMIN_PANEL_ENABLED = "false";
    const req = createSpiedRequest();

    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(callOrder).toEqual(["isAdminPanelEnabled"]);
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(validateAdminWriteRequest).not.toHaveBeenCalled();
    expect(req.json).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("returns 401 and does not parse body or call AI service when admin session fails", async () => {
    vi.mocked(requireAdminSession).mockImplementation(async () => {
      callOrder.push("requireAdminSession");
      throw new Error("UNAUTHENTICATED");
    });
    const req = createSpiedRequest();

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(callOrder).toEqual(["isAdminPanelEnabled", "requireAdminSession"]);
    expect(validateAdminWriteRequest).not.toHaveBeenCalled();
    expect(req.json).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("returns 403 and does not parse body or call AI service for non-admin session", async () => {
    vi.mocked(requireAdminSession).mockImplementation(async () => {
      callOrder.push("requireAdminSession");
      throw new Error("UNAUTHORIZED");
    });
    const req = createSpiedRequest();

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(callOrder).toEqual(["isAdminPanelEnabled", "requireAdminSession"]);
    expect(validateAdminWriteRequest).not.toHaveBeenCalled();
    expect(req.json).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("returns 403 and does not parse body or call AI service when Origin validation fails", async () => {
    vi.mocked(validateAdminWriteRequest).mockImplementation(async () => {
      callOrder.push("validateAdminWriteRequest");
      throw new DomainError("FORBIDDEN", "Invalid origin");
    });
    const req = createSpiedRequest();

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(callOrder).toEqual(["isAdminPanelEnabled", "requireAdminSession", "validateAdminWriteRequest"]);
    expect(req.json).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("returns 403 and does not parse body or call AI service when CSRF validation fails", async () => {
    vi.mocked(validateAdminWriteRequest).mockImplementation(async () => {
      callOrder.push("validateAdminWriteRequest");
      throw new DomainError("FORBIDDEN", "CSRF token mismatch");
    });
    const req = createSpiedRequest();

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(callOrder).toEqual(["isAdminPanelEnabled", "requireAdminSession", "validateAdminWriteRequest"]);
    expect(req.json).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });
});
