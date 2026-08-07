// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createUploadSession, finalizeUpload, getMultipleAskStatus, putToSignedUpload, submitCorrection, submitPastedText } from "./multipleAsk";

const token = vi.fn().mockResolvedValue("firebase-token");
const scope = { boardId: "punjab", classId: "class-9", subjectId: "physics" };
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const jobId = "123e4567-e89b-42d3-a456-426614174001";
const itemId = "123e4567-e89b-42d3-a456-426614174002";
const status = { jobId, workflowStatus: "needs_correction", inputKind: "text", scope, createdAt: "2026-08-07T00:00:00Z", updatedAt: "2026-08-07T00:00:00Z", retentionExpiresAt: "2026-08-14T00:00:00Z", terminalErrorCode: null, queue: { status: "succeeded", stage: "extract", progress: 100 }, items: [{ itemId, itemIndex: 0, displayLabel: "2(ii)", sectionContext: "Short", itemStatus: "needs_correction", normalizedQuestion: null, answerMode: "not_clear", mcqOptions: [], unclearReason: "QUESTION_TEXT_UNCLEAR", extractionVersion: 1, correctionVersion: 0, correctedAt: null, result: null }], summary: { total: 1, short: 0, long: 0, mcq: 0, not_clear: 1 } };

afterEach(() => vi.unstubAllGlobals());

describe("Multiple Ask browser client", () => {
  it("uses session BFF, one signed PUT, then finalize BFF without routing bytes through an app route", async () => {
    const file = new File(["pdf bytes"], "paper.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: jobId, uploadUrl: "https://project.supabase.co/signed-upload", uploadMethod: "PUT", uploadHeaders: { "Content-Type": "application/pdf" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobId, workflowStatus: "queued", queueStatus: "queued" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const session = await createUploadSession({ ...scope, requestId, inputKind: "pdf", contentType: file.type, sizeBytes: file.size }, token);
    await putToSignedUpload(session.uploadUrl, session.uploadMethod, session.uploadHeaders, file);
    await finalizeUpload({ requestId, sessionId: session.sessionId }, token);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/multiple-ask/upload-session");
    expect(fetchMock.mock.calls[1][0]).toBe("https://project.supabase.co/signed-upload");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file });
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/ai/multiple-ask/finalize");
  });

  it("sends pasted text only to the same-origin text BFF and never writes it to browser storage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobId, workflowStatus: "queued", queueStatus: "queued" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const rawText = "This must not be stored locally.";
    await submitPastedText({ ...scope, requestId, text: rawText }, token);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/multiple-ask/text");
    expect(sessionStorage.getItem("taleem-multiple-ask-resume-v1")).toBeNull();
    expect(localStorage.getItem("taleem-multiple-ask-resume-v1")).toBeNull();
  });

  it("keeps status ordered and correction insists on strict A-D options at the caller boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(status), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const loaded = await getMultipleAskStatus(jobId, token);
    expect(loaded.summary.notClear).toBe(1);
    expect(loaded.items[0].displayLabel).toBe("2(ii)");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(status), { status: 200 }));
    await submitCorrection(jobId, itemId, { requestId, questionText: "Define speed.", answerMode: "mcq", mcqOptions: [{ label: "A", text: "a" }, { label: "B", text: "b" }, { label: "C", text: "c" }, { label: "D", text: "d" }] }, token);
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body as string).mcqOptions).toHaveLength(4);
  });
});
