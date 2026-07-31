import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as ask } from "@/app/api/ai/ask/route";
import { GET as usage } from "@/app/api/ai/usage/route";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getStudentAskAccountTier } from "@/lib/services/users/userService";
import { callAiService } from "@/lib/internalApi/callAiService";

vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: vi.fn() }));
vi.mock("@/lib/services/users/userService", () => ({
  getStudentAskAccountTier: vi.fn(),
}));
vi.mock("@/lib/internalApi/callAiService", () => ({
  callAiService: vi.fn(),
}));

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const browserBody = {
  requestId,
  boardId: "punjab",
  classId: "class-9",
  subjectId: "physics",
  chapterId: "motion",
  question: "What is velocity?",
  answerMode: "short",
  answerStyle: "exam_style",
};
const internalResponse = {
  request_id: requestId,
  answer_source: "syllabus_grounded",
  answer_mode: "short",
  answer_style: "exam_style",
  blocks: [{ type: "paragraph", text: "Velocity is displacement per time." }],
  citations: [
    {
      citation_id: "chunk-safe-1",
      chapter_id: "motion",
      topic_no: "1.1",
      topic_title: "Velocity",
      page_start: 3,
      page_end: 3,
    },
  ],
  visuals: [],
  general_ai_label: null,
  prompt_version: "prompt-v2",
  corpus_version: "corpus-v1",
  approved_revision_id: null,
  usage: {
    feature: "single_question",
    used: 1,
    limit: 5,
    remaining: 4,
    resets_at: "2026-07-31T19:00:00Z",
  },
  terminal_status: "answered",
  error_code: null,
};

function post(body: unknown = browserBody, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/ai/ask", {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      authorization: "Bearer valid-token",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("public Ask BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }),
    } as never);
    vi.mocked(getStudentAskAccountTier).mockResolvedValue("premium");
    vi.mocked(callAiService).mockResolvedValue(internalResponse);
  });

  it("rejects an invalid Origin before identity, body parsing, or service work", async () => {
    const response = await ask(post("{", { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(getAdminAuth).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("rejects missing Firebase identity", async () => {
    const response = await ask(post(browserBody, { authorization: "" }));
    expect(response.status).toBe(401);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("rejects non-JSON and multipart before authentication", async () => {
    const response = await ask(
      post("not-json", {
        authorization: "",
        "content-type": "multipart/form-data; boundary=x",
      }),
    );
    expect(response.status).toBe(415);
    expect(getAdminAuth).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...browserBody, file: "book.pdf" }],
    [{ ...browserBody, image: "data:image/png;base64,AAAA" }],
    [{ ...browserBody, question: "data:application/pdf;base64,AAAA" }],
    [{ ...browserBody, answerMode: "mcq" }],
    [{ ...browserBody, answerMode: "mixed" }],
  ])("rejects files, encoded payloads, and unsupported modes", async (body) => {
    const response = await ask(post(body));
    expect(response.status).toBe(400);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("enforces typed English text at the BFF boundary", async () => {
    const response = await ask(
      post({ ...browserBody, question: "رفتار کیا ہے؟" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "ASK_TEXT_ONLY",
        message: "Single Ask accepts typed text only",
      },
    });
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("maps camelCase explicitly, trusts the profile tier, and returns safe camelCase", async () => {
    const response = await ask(post());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(callAiService).toHaveBeenCalledWith(
      "/api/v1/internal/ask",
      "POST",
      {
        request_id: requestId,
        board_id: "punjab",
        class_id: "class-9",
        subject_id: "physics",
        chapter_id: "motion",
        question: "What is velocity?",
        answer_mode: "short",
        answer_style: "exam_style",
      },
      "student-1",
      false,
      "ask",
      { requestId, accountTier: "premium" },
    );
    const body = await response.json();
    expect(body.requestId).toBe(requestId);
    expect(body.answerSource).toBe("syllabus_grounded");
    expect(body.usage).toEqual({
      feature: "single_question",
      used: 1,
      limit: 5,
      remaining: 4,
      resetsAt: "2026-07-31T19:00:00Z",
    });
    expect(JSON.stringify(body)).not.toContain("citation_id");
  });

  it("maps upstream failures to stable sanitized errors", async () => {
    const error = new Error("raw upstream detail and stack") as Error & {
      status: number;
      errorData: unknown;
    };
    error.status = 502;
    error.errorData = { detail: { code: "SECRET_PROVIDER_DETAIL" } };
    vi.mocked(callAiService).mockRejectedValue(error);
    const response = await ask(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "AI_SERVICE_UNAVAILABLE",
        message: "Ask service is temporarily unavailable",
      },
    });
  });

  it("preserves sanitized usage on a quota rejection", async () => {
    const error = new Error("upstream quota detail") as Error & {
      status: number;
      errorData: unknown;
    };
    error.status = 429;
    error.errorData = {
      detail: {
        code: "USAGE_LIMIT_REACHED",
        usage: {
          feature: "single_question",
          used: 5,
          limit: 5,
          remaining: 0,
          resets_at: "2026-07-31T19:00:00Z",
        },
      },
    };
    vi.mocked(callAiService).mockRejectedValue(error);

    const response = await ask(post());

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: {
        code: "USAGE_LIMIT_REACHED",
        message: "Daily question limit reached",
      },
      usage: {
        feature: "single_question",
        used: 5,
        limit: 5,
        remaining: 0,
        resetsAt: "2026-07-31T19:00:00Z",
      },
    });
  });

  it("returns the same usage DTO shape as Ask responses", async () => {
    vi.mocked(callAiService).mockResolvedValue(internalResponse.usage);
    const response = await usage(
      new NextRequest("http://localhost/api/ai/usage", {
        headers: { authorization: "Bearer valid-token" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      feature: "single_question",
      used: 1,
      limit: 5,
      remaining: 4,
      resetsAt: "2026-07-31T19:00:00Z",
    });
    expect(callAiService).toHaveBeenCalledWith(
      "/api/v1/internal/ask/usage",
      "GET",
      null,
      "student-1",
      false,
      "ask_usage",
      { accountTier: "premium" },
    );
  });
});
