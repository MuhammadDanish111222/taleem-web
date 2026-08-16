import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/ask/route";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { requireAdminSession } from "@/lib/auth/session";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { callAiService } from "@/lib/internalApi/callAiService";
import { DomainError } from "@/lib/services/admin/catalogueService";
import { getAdminChapters } from "@/lib/firestore/catalogue.admin";

vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({ validateAdminWriteRequest: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));
vi.mock("@/lib/firestore/catalogue.admin", () => ({ getAdminChapters: vi.fn() }));

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/admin/ask", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", ...headers },
    body: JSON.stringify(body),
  });
}

describe("Module 4 local Ask admin BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminPanelEnabled).mockReturnValue(true);
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin-1", admin: true } as never);
    vi.mocked(validateAdminWriteRequest).mockResolvedValue();
    vi.mocked(callAiService).mockResolvedValue({ items: [] });
    vi.mocked(getAdminChapters).mockResolvedValue([]);
  });

  it("returns 404 before session, CSRF, parsing, or service work when disabled", async () => {
    vi.mocked(isAdminPanelEnabled).mockReturnValue(false);
    const req = request({ operation: "prompt_history" });
    req.json = vi.fn();
    const response = await POST(req);
    expect(response.status).toBe(404);
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(validateAdminWriteRequest).not.toHaveBeenCalled();
    expect(req.json).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it.each([
    ["UNAUTHENTICATED", 401],
    ["UNAUTHORIZED", 403],
  ])("maps %s sessions without calling the service", async (reason, status) => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error(reason));
    const response = await POST(request({ operation: "candidate_list" }));
    expect(response.status).toBe(status);
    expect(validateAdminWriteRequest).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("rejects same-origin or CSRF failure before JSON parsing", async () => {
    vi.mocked(validateAdminWriteRequest).mockRejectedValue(new DomainError("FORBIDDEN", "CSRF token mismatch"));
    const req = request({ operation: "candidate_list" });
    req.json = vi.fn();
    const response = await POST(req);
    expect(response.status).toBe(403);
    expect(req.json).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("strictly rejects unsupported operations and extra fields", async () => {
    const unsupported = await POST(request({ operation: "bank_delete" }));
    const extra = await POST(request({ operation: "candidate_list", storage_key: "must-not-pass" }));
    expect(unsupported.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("forwards only a validated operation with the signed local-admin feature", async () => {
    const response = await POST(request(
      { operation: "candidate_list", board_id: "punjab", subject_id: "physics", limit: 25 },
      { "x-request-id": "browser-request-id" },
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(callAiService).toHaveBeenCalledWith(
      "/api/v1/internal/admin/ask",
      "POST",
      { operation: "candidate_list", board_id: "punjab", subject_id: "physics", limit: 25 },
      "admin-1",
      true,
      "local_ask_admin",
      { requestId: "browser-request-id" },
    );
  });

  it("accepts the scoped, human-friendly Question Bank JSON import contract", async () => {
    const body = {
      operation: "bank_import",
      import_key: "question-bank:punjab:class-9:chemistry:atoms:hash",
      board_id: "punjab",
      class_id: "class-9",
      subject_id: "chemistry",
      chapter_id: "atoms",
      import_questions: [{
        question: "Which particle has a negative charge?",
        type: "mcq",
        difficulty: "easy",
        options: ["Proton", "Electron"],
        correct_answer: "Electron",
        question_visual_ids: [],
        answer_visual_ids: [],
      }],
    };
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(callAiService).toHaveBeenLastCalledWith(
      "/api/v1/internal/admin/ask", "POST", expect.objectContaining({
        ...body,
        import_questions: [expect.objectContaining({
          ...body.import_questions[0], answer_blocks: [], question_visual_ids: [], answer_visual_ids: [],
        })],
      }), "admin-1", true,
      "local_ask_admin", { requestId: undefined },
    );
  });

  it("validates blueprint chapters against the selected catalogue scope before forwarding", async () => {
    vi.mocked(getAdminChapters).mockResolvedValue([{ slug: "motion", active: true }] as never);
    const body = {
      operation: "blueprint_preview" as const,
      board_id: "punjab", class_id: "class-9", subject_id: "physics",
      blueprint: {
        duration_minutes: 120,
        sections: [{
          key: "B", title: "Short", type: "short", select_count: 1, attempt_count: 1, marks_each: 2,
          difficulty_distribution: {}, chapter_distribution: { motion: 1 },
        }],
      },
    };
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(getAdminChapters).toHaveBeenCalledWith("punjab", "class-9", "physics");
    expect(callAiService).toHaveBeenLastCalledWith(
      "/api/v1/internal/admin/ask", "POST", body, "admin-1", true, "local_ask_admin", { requestId: undefined },
    );
  });

  it("rejects a blueprint chapter outside the selected catalogue scope", async () => {
    vi.mocked(getAdminChapters).mockResolvedValue([{ slug: "motion", active: true }] as never);
    const response = await POST(request({
      operation: "blueprint_preview", board_id: "punjab", class_id: "class-9", subject_id: "physics",
      blueprint: { duration_minutes: 120, sections: [{ key: "B", title: "Short", type: "short", select_count: 1, attempt_count: 1, marks_each: 2, difficulty_distribution: {}, chapter_distribution: { atoms: 1 } }] },
    }));
    expect(response.status).toBe(400);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it.each([
    { operation: "prompt_history", prompt_key: "ask_grounded", answer_mode: "short", subject_id: "physics" },
    { operation: "prompt_history", prompt_key: "ask_general", answer_mode: "long", board_id: "punjab", class_id: "class-9", subject_id: "physics" },
    { operation: "prompt_update_draft", prompt_id: "11111111-1111-4111-8111-111111111111", content: "Updated draft" },
    {
      operation: "candidate_list",
      board_id: "punjab",
      class_id: "class-9",
      subject_id: "physics",
      chapter_id: "motion",
      answer_mode: "short",
      answer_source: "syllabus_grounded",
      source_feature: "single_question",
      provider: "deepseek",
      age_days: 30,
      limit: 50,
    },
    { operation: "candidate_retention_preview" },
    { operation: "bank_list", board_id: "punjab", answer_mode: "long", bank_source: "admin_authored", limit: 20 },
    { operation: "bank_history", question_id: "22222222-2222-4222-8222-222222222222" },
    { operation: "bank_archive", revision_id: "33333333-3333-4333-8333-333333333333", reason: "Superseded by corrected material" },
    { operation: "bank_set_variation_active", variation_id: "44444444-4444-4444-8444-444444444444", active: false },
    { operation: "bank_requeue_embedding", revision_id: "55555555-5555-4555-8555-555555555555" },
    { operation: "source_policy_get", subject_id: "physics" },
    { operation: "source_policy_set_semantic_threshold", subject_id: "physics", class_id: "class-9", semantic_similarity_threshold: 0.82 },
  ] as const)("accepts and forwards the landed $operation contract", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(callAiService).toHaveBeenLastCalledWith(
      "/api/v1/internal/admin/ask",
      "POST",
      body,
      "admin-1",
      true,
      "local_ask_admin",
      { requestId: undefined },
    );
  });

  it.each([
    { operation: "prompt_history" },
    { operation: "prompt_create_draft", prompt_key: "ask_grounded", answer_mode: "short" },
    { operation: "prompt_update_draft", content: "Missing prompt ID" },
    { operation: "prompt_test_draft", prompt_id: "11111111-1111-4111-8111-111111111111" },
    { operation: "prompt_activate" },
    { operation: "prompt_rollback" },
    { operation: "candidate_inspect" },
    { operation: "candidate_approve", candidate_id: "11111111-1111-4111-8111-111111111111" },
    { operation: "candidate_reject", candidate_id: "11111111-1111-4111-8111-111111111111" },
    { operation: "bank_history" },
    { operation: "bank_create" },
    { operation: "bank_import", import_key: "module4-import" },
    { operation: "bank_view" },
    { operation: "bank_archive", revision_id: "33333333-3333-4333-8333-333333333333" },
    { operation: "bank_add_variation", revision_id: "33333333-3333-4333-8333-333333333333" },
    { operation: "bank_set_variation_active", variation_id: "44444444-4444-4444-8444-444444444444" },
    { operation: "bank_requeue_embedding" },
    { operation: "bank_set_visuals", revision_id: "55555555-5555-4555-8555-555555555555" },
    { operation: "source_policy_set_semantic_threshold", subject_id: "physics" },
    { operation: "candidate_retention_cleanup", limit: 25 },
  ])("rejects incomplete high-impact $operation requests at the BFF", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it.each([
    { operation: "prompt_history", prompt_key: "ask_grounded", answer_mode: "short", board_id: "punjab" },
    { operation: "prompt_history", prompt_key: "ask_grounded", answer_mode: "short", class_id: "class-9" },
    { operation: "prompt_history", prompt_key: "ask_grounded", answer_mode: "short" },
    { operation: "prompt_history", prompt_key: "ask_grounded", answer_mode: "short", class_id: "class-9", subject_id: "physics" },
    { operation: "prompt_history", prompt_key: "ask_grounded", answer_mode: "mcq", subject_id: "physics" },
  ])("rejects incomplete prompt hierarchy scopes", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("does not expose upstream error details", async () => {
    const upstream = new Error("AI Service Error: secret prompt and provider key") as Error & { status: number };
    upstream.status = 409;
    vi.mocked(callAiService).mockRejectedValue(upstream);
    const response = await POST(request({ operation: "candidate_list" }));
    const text = await response.text();
    expect(response.status).toBe(409);
    expect(text).toContain("Admin operation rejected");
    expect(text).not.toContain("secret prompt");
    expect(text).not.toContain("provider key");
  });

  it("surfaces only the safe question index for an invalid imported visual", async () => {
    const upstream = new Error("AI Service Error") as Error & { status: number; errorData: unknown };
    upstream.status = 409;
    upstream.errorData = { detail: { code: "IMPORT_QUESTION_37_VISUAL_LINK_NOT_REVIEWED", secret: "must not leak" } };
    vi.mocked(callAiService).mockRejectedValue(upstream);
    const response = await POST(request({ operation: "candidate_list" }));
    const text = await response.text();
    expect(response.status).toBe(409);
    expect(text).toContain("Question 37");
    expect(text).not.toContain("secret");
  });
});
