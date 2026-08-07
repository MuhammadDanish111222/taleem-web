import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createSession } from "@/app/api/ai/multiple-ask/upload-session/route";
import { POST as finalize } from "@/app/api/ai/multiple-ask/finalize/route";
import { POST as submitText } from "@/app/api/ai/multiple-ask/text/route";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getStudentAskAccountTier } from "@/lib/services/users/userService";
import { callAiService } from "@/lib/internalApi/callAiService";

vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: vi.fn() }));
vi.mock("@/lib/services/users/userService", () => ({ getStudentAskAccountTier: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const sessionId = "123e4567-e89b-42d3-a456-426614174001";
const scope = { boardId: "punjab", classId: "class-9", subjectId: "physics", chapterId: "motion" };

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      authorization: "Bearer valid-token",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("Module 5 Run 1 Multiple Ask BFF contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MULTIPLE_ASK_RUN1_ENABLED;
    vi.mocked(getAdminAuth).mockReturnValue({ verifyIdToken: vi.fn() } as never);
    vi.mocked(getStudentAskAccountTier).mockResolvedValue("google");
  });

  it("returns 404 before authentication or service work while disabled", async () => {
    const response = await createSession(post("/api/ai/multiple-ask/upload-session", {}));
    expect(response.status).toBe(404);
    expect(getAdminAuth).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("maps only metadata to the internal direct-upload request", async () => {
    process.env.MULTIPLE_ASK_RUN1_ENABLED = "true";
    vi.mocked(getAdminAuth).mockReturnValue({ verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }) } as never);
    vi.mocked(callAiService).mockResolvedValue({
      session_id: sessionId,
      upload_url: "https://project.supabase.co/storage/v1/object/upload/sign/private/source?token=short",
      upload_method: "PUT",
      upload_headers: { "Content-Type": "application/pdf" },
      upload_capability_expires_at: "2026-08-06T12:00:00Z",
    });
    const response = await createSession(post("/api/ai/multiple-ask/upload-session", {
      requestId, inputKind: "pdf", contentType: "application/pdf", sizeBytes: 123, ...scope,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sessionId,
      uploadUrl: expect.any(String),
      uploadMethod: "PUT",
      uploadHeaders: { "Content-Type": "application/pdf" },
      uploadCapabilityExpiresAt: "2026-08-06T12:00:00Z",
    });
    expect(callAiService).toHaveBeenCalledWith(
      "/api/v1/internal/multiple-ask/upload-sessions", "POST",
      { request_id: requestId, input_kind: "pdf", content_type: "application/pdf", size_bytes: 123,
        board_id: "punjab", class_id: "class-9", subject_id: "physics", chapter_id: "motion" },
      "student-1", false, "multiple_ask", expect.objectContaining({ requestId }),
    );
  });

  it("requires safe immutable curriculum scope before internal work", async () => {
    process.env.MULTIPLE_ASK_RUN1_ENABLED = "true";
    vi.mocked(getAdminAuth).mockReturnValue({ verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }) } as never);
    const response = await createSession(post("/api/ai/multiple-ask/upload-session", {
      requestId, inputKind: "pdf", contentType: "application/pdf", sizeBytes: 123,
      ...scope, subjectId: "physics subject",
    }));
    expect(response.status).toBe(400);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("keeps finalize and pasted text in the separate feature-gated namespace", async () => {
    process.env.MULTIPLE_ASK_RUN1_ENABLED = "true";
    vi.mocked(getAdminAuth).mockReturnValue({ verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }) } as never);
    vi.mocked(callAiService).mockResolvedValue({
      job_id: sessionId, workflow_status: "queued", queue_status: "queued",
    });
    const finalResponse = await finalize(post("/api/ai/multiple-ask/finalize", { requestId, sessionId }));
    const textResponse = await submitText(post("/api/ai/multiple-ask/text", { requestId, text: "What is velocity?", ...scope }));
    expect(finalResponse.status).toBe(202);
    expect(textResponse.status).toBe(202);
    expect(callAiService).toHaveBeenNthCalledWith(1,
      "/api/v1/internal/multiple-ask/upload-sessions/finalize", "POST",
      { request_id: requestId, session_id: sessionId }, "student-1", false, "multiple_ask", expect.any(Object));
    expect(callAiService).toHaveBeenNthCalledWith(2,
      "/api/v1/internal/multiple-ask/text", "POST",
      { request_id: requestId, text: "What is velocity?", board_id: "punjab", class_id: "class-9", subject_id: "physics", chapter_id: "motion" }, "student-1", false, "multiple_ask", expect.any(Object));
  });
});
