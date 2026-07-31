// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AskApiError,
  AskRequest,
  askQuestion,
  loadAskUsage,
  loadAskVisual,
} from "./ask";

const request: AskRequest = {
  requestId: "123e4567-e89b-42d3-a456-426614174000",
  boardId: "punjab",
  classId: "class-9",
  subjectId: "physics",
  question: "What is velocity?",
  answerMode: "short",
  answerStyle: "exam_style",
};

const usage = {
  feature: "single_question",
  used: 1,
  limit: 5,
  remaining: 4,
  resetsAt: "2026-07-31T19:00:00Z",
};

const answer = {
  requestId: request.requestId,
  answerSource: "syllabus_grounded",
  answerMode: "short",
  answerStyle: "exam_style",
  blocks: [{ type: "paragraph", text: "Velocity is displacement per time." }],
  citations: [],
  visuals: [],
  generalAiLabel: null,
  promptVersion: "prompt-v1",
  corpusVersion: "corpus-v1",
  approvedRevisionId: null,
  usage,
  terminalStatus: "answered",
  errorCode: null,
};

describe("student Ask API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads usage once with a Firebase bearer token and no-store caching", async () => {
    const getToken = vi.fn().mockResolvedValue("firebase-token");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(usage), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(loadAskUsage(getToken)).resolves.toEqual(usage);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/usage",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: { Authorization: "Bearer firebase-token" },
      }),
    );
  });

  it("sends only the typed Single Ask JSON contract", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(answer), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      askQuestion(request, async () => "firebase-token"),
    ).resolves.toEqual(answer);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer firebase-token",
        },
      }),
    );
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(JSON.stringify(init?.body)).not.toMatch(
      /file|image|attachment|base64/i,
    );
  });

  it("maps authentication expiry without leaking an upstream body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "RAW_INTERNAL_ERROR", message: "secret detail" },
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      loadAskUsage(async () => "expired-token"),
    ).rejects.toMatchObject({
      name: "AskApiError",
      code: "AUTHENTICATION_EXPIRED",
      status: 401,
      retryable: false,
      message: "Your sign-in has expired. Please sign in again.",
    });
  });

  it("carries safe usage returned with a quota rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "USAGE_LIMIT_REACHED",
            message: "Daily question limit reached",
          },
          usage: { ...usage, used: 5, remaining: 0 },
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      askQuestion(request, async () => "firebase-token"),
    ).rejects.toMatchObject({
      code: "USAGE_LIMIT_REACHED",
      status: 429,
      usage: { ...usage, used: 5, remaining: 0 },
    });
  });

  it("rejects an invalid success payload as a retryable configuration error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      askQuestion(request, async () => "firebase-token"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AskApiError>>({
        code: "CONFIGURATION_ERROR",
        retryable: true,
      }),
    );
  });

  it("loads visuals only through the encoded same-origin proxy and allowlisted MIME types", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(new Blob(["image-bytes"], { type: "image/png" }), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );

    await loadAskVisual(
      "visual/one",
      request.requestId,
      async () => "firebase-token",
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/ai/visual/visual%2Fone?requestId=${request.requestId}`,
    );

    fetchMock.mockResolvedValueOnce(
      new Response("<script>bad</script>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    await expect(
      loadAskVisual(
        "visual-two",
        request.requestId,
        async () => "firebase-token",
      ),
    ).rejects.toMatchObject({ code: "VISUAL_UNAVAILABLE" });
  });
});
