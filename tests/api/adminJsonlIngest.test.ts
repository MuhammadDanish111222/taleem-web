import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/ingest/jsonl/route";
import { requireAdminSession } from "@/lib/auth/session";
import { callAiService } from "@/lib/internalApi/callAiService";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";

vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({ validateAdminWriteRequest: vi.fn() }));

const sampleJsonl = JSON.stringify({
  board_id: "fbise", class_id: "class_9", subject_id: "physics", chapter_id: "ch_1",
  topic_no: "1.1", topic_title: "Title", chunk_order: 0, content_type: "explanation",
  chunk_text: "Sample text", expected_questions: [],
});

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/admin/ingest/jsonl", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonl_content: sampleJsonl, idempotency_key: "key-1" }),
  });
}

describe("Admin JSONL ingestion BFF", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ADMIN_PANEL_ENABLED: "true" };
    vi.clearAllMocks();
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin-user-999", admin: true } as any);
    vi.mocked(validateAdminWriteRequest).mockResolvedValue();
    vi.mocked(callAiService).mockResolvedValue({ status: "queued", job_id: "job-uuid-12345" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the normal 401 before reading or forwarding when the admin session is missing", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("UNAUTHENTICATED"));

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(validateAdminWriteRequest).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("returns the normal 403 for an authenticated non-admin without forwarding", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await POST(request());

    expect(res.status).toBe(403);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it.each([
    ["missing CSRF token", "Missing CSRF token"],
    ["invalid CSRF token", "CSRF token mismatch"],
    ["invalid Origin", "Invalid origin"],
  ])("returns 403 for %s without forwarding", async (_label, message) => {
    vi.mocked(validateAdminWriteRequest).mockRejectedValue(Object.assign(new Error(message), { status: 403 }));

    const res = await POST(request());

    expect(res.status).toBe(403);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("forwards a valid protected request with its request ID", async () => {
    const res = await POST(request({ "x-request-id": "req-jsonl-123" }));

    expect(res.status).toBe(202);
    expect(validateAdminWriteRequest).toHaveBeenCalledTimes(1);
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

  it("returns 404 without invoking auth or the AI service when the panel is disabled", async () => {
    process.env.ADMIN_PANEL_ENABLED = "false";

    const res = await POST(request());

    expect(res.status).toBe(404);
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });
});
