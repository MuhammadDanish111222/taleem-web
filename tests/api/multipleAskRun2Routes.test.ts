import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getStatus } from "@/app/api/ai/multiple-ask/jobs/[jobId]/route";
import { POST as correct } from "@/app/api/ai/multiple-ask/jobs/[jobId]/items/[itemId]/correction/route";
import { POST as resume } from "@/app/api/ai/multiple-ask/jobs/[jobId]/resume/route";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getStudentAskAccountTier } from "@/lib/services/users/userService";
import { callAiService } from "@/lib/internalApi/callAiService";

vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: vi.fn() }));
vi.mock("@/lib/services/users/userService", () => ({ getStudentAskAccountTier: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));

const jobId = "123e4567-e89b-42d3-a456-426614174000";
const itemId = "123e4567-e89b-42d3-a456-426614174001";
const requestId = "123e4567-e89b-42d3-a456-426614174002";
const headers = { host: "localhost", origin: "http://localhost", authorization: "Bearer token", "content-type": "application/json" };
const status = {
  job_id: jobId, workflow_status: "needs_correction", input_kind: "image",
  scope: { board_id: "punjab", class_id: "class-9", subject_id: "physics", chapter_id: null },
  created_at: "2026-08-06T12:00:00Z", updated_at: "2026-08-06T12:01:00Z",
  retention_expires_at: "2026-08-13T12:00:00Z", terminal_error_code: null,
  queue: { status: "succeeded", stage: "completed", progress: 100 },
  items: [{ item_id: itemId, item_index: 0, display_label: "2(ii)", section_context: "Write short answers", item_status: "needs_correction", normalized_question: null, answer_mode: "not_clear", mcq_options: [], unclear_reason: "QUESTION_TEXT_UNCLEAR", terminal_error_code: null, source_locator: { page_number: 1 }, extraction_version: 1, correction_version: 0, corrected_at: null }],
  summary: { total: 1, short: 0, long: 0, mcq: 0, not_clear: 1 },
};

describe("Module 5 Run 2 correction and polling BFF contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MULTIPLE_ASK_RUN1_ENABLED;
    vi.mocked(getAdminAuth).mockReturnValue({ verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }) } as never);
    vi.mocked(getStudentAskAccountTier).mockResolvedValue("google");
  });

  it("remains dark before any authentication or upstream work", async () => {
    const request = new NextRequest(`http://localhost/api/ai/multiple-ask/jobs/${jobId}`, { headers });
    expect((await getStatus(request, { params: Promise.resolve({ jobId }) })).status).toBe(404);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("maps polling status and correction metadata without source text", async () => {
    process.env.MULTIPLE_ASK_RUN1_ENABLED = "true";
    vi.mocked(callAiService).mockResolvedValue(status);
    const getRequest = new NextRequest(`http://localhost/api/ai/multiple-ask/jobs/${jobId}`, { headers });
    const response = await getStatus(getRequest, { params: Promise.resolve({ jobId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobId, workflowStatus: "needs_correction", items: [{ itemId, unclearReason: "QUESTION_TEXT_UNCLEAR" }] });
    expect(callAiService).toHaveBeenCalledWith(`/api/v1/internal/multiple-ask/jobs/${jobId}`, "GET", undefined, "student-1", false, "multiple_ask", expect.any(Object));

    const correctionRequest = new NextRequest(`http://localhost/api/ai/multiple-ask/jobs/${jobId}/items/${itemId}/correction`, { method: "POST", headers, body: JSON.stringify({ requestId, questionText: "Define acceleration.", answerMode: "short", mcqOptions: [] }) });
    expect((await correct(correctionRequest, { params: Promise.resolve({ jobId, itemId }) })).status).toBe(200);
    expect(callAiService).toHaveBeenLastCalledWith(`/api/v1/internal/multiple-ask/jobs/${jobId}/items/${itemId}/correction`, "POST", { request_id: requestId, question_text: "Define acceleration.", answer_mode: "short", mcq_options: [] }, "student-1", false, "multiple_ask", expect.objectContaining({ requestId }));
  });

  it("sends an idempotent resume request only after validation", async () => {
    process.env.MULTIPLE_ASK_RUN1_ENABLED = "true";
    vi.mocked(callAiService).mockResolvedValue({ job_id: jobId, workflow_status: "extracting", queue_status: "queued" });
    const request = new NextRequest(`http://localhost/api/ai/multiple-ask/jobs/${jobId}/resume`, { method: "POST", headers, body: JSON.stringify({ requestId }) });
    expect((await resume(request, { params: Promise.resolve({ jobId }) })).status).toBe(202);
    expect(callAiService).toHaveBeenCalledWith(`/api/v1/internal/multiple-ask/jobs/${jobId}/resume`, "POST", { request_id: requestId }, "student-1", false, "multiple_ask", expect.objectContaining({ requestId }));
  });
});
