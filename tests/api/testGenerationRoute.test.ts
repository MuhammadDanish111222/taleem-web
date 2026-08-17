import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tests/generate/route";
import { getAdminAuth } from "@/lib/firebase/admin";
import { signTestGeneratorJwt } from "@/lib/internalAuth/signInternalJwt";
import { callTestGeneratorEdge, TestGeneratorUpstreamError } from "@/lib/tests/edgeClient";
import { clearTestGenerationRateLimitForTests } from "@/lib/tests/rateLimit";

vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: vi.fn() }));
vi.mock("@/lib/internalAuth/signInternalJwt", () => ({ signTestGeneratorJwt: vi.fn() }));
vi.mock("@/lib/tests/edgeClient", () => ({ callTestGeneratorEdge: vi.fn(), TestGeneratorUpstreamError: class extends Error {
  constructor(public status: number, public payload: unknown) { super("TEST_GENERATOR_UPSTREAM"); }
} }));

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const body = { mode: "board", boardId: "punjab", classId: "class-9", subjectId: "physics", requestId };
function post(value: unknown = body, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/tests/generate", { method: "POST", headers: { host: "localhost", origin: "http://localhost", authorization: "Bearer valid", "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
}

describe("test generation BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks(); clearTestGenerationRateLimitForTests();
    vi.mocked(getAdminAuth).mockReturnValue({ verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }) } as never);
    vi.mocked(signTestGeneratorJwt).mockResolvedValue("test-generator-jwt");
    vi.mocked(callTestGeneratorEdge).mockResolvedValue({ mode: "board", sections: [] });
  });
  it("requires Firebase identity", async () => {
    const response = await POST(post(body, { authorization: "" }));
    expect(response.status).toBe(401); expect(callTestGeneratorEdge).not.toHaveBeenCalled();
  });
  it("rejects a cross-origin or malformed request before Edge", async () => {
    expect((await POST(post(body, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(post({ ...body, uid: "other" }))).status).toBe(400);
    expect(callTestGeneratorEdge).not.toHaveBeenCalled();
  });
  it("uses the dedicated audience signer and never calls Railway", async () => {
    const response = await POST(post());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(signTestGeneratorJwt).toHaveBeenCalledWith("student-1", requestId);
    expect(callTestGeneratorEdge).toHaveBeenCalledWith("test-generator-jwt", {
      mode: "board", board_id: "punjab", class_id: "class-9", subject_id: "physics", seed: requestId,
    });
  });
  it("accepts the existing validated custom selection spec and forwards it unchanged", async () => {
    const spec = { duration_minutes: 120, sections: [{ key: "A", title: "MCQs", type: "mcq", select_count: 2, attempt_count: 2, marks_each: 1, difficulty_distribution: {}, chapter_distribution: { atoms: 2 } }] };
    const response = await POST(post({ ...body, mode: "custom", spec }));
    expect(response.status).toBe(200);
    expect(callTestGeneratorEdge).toHaveBeenCalledWith("test-generator-jwt", expect.objectContaining({ mode: "custom", spec }));
  });
  it("preserves disabled feature as 404 NOT_FOUND", async () => {
    vi.mocked(callTestGeneratorEdge).mockRejectedValue(
      new TestGeneratorUpstreamError(404, { error: { code: "NOT_FOUND" } }),
    );
    const response = await POST(post());
    expect(response.status).toBe(404); expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("preserves coming-soon feature as 409 FEATURE_COMING_SOON", async () => {
    vi.mocked(callTestGeneratorEdge).mockRejectedValue(
      new TestGeneratorUpstreamError(409, { error: { code: "FEATURE_COMING_SOON" } }),
    );
    const response = await POST(post());
    expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("FEATURE_COMING_SOON");
  });
  it("maps an unavailable Edge safely", async () => {
    vi.mocked(callTestGeneratorEdge).mockRejectedValue(new Error("network"));
    const response = await POST(post());
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("TEST_GENERATOR_UNAVAILABLE");
  });
  it("maps an Edge timeout safely", async () => {
    const timeout = new Error("timed out"); timeout.name = "TimeoutError";
    vi.mocked(callTestGeneratorEdge).mockRejectedValue(timeout);
    const response = await POST(post());
    expect(response.status).toBe(504); expect((await response.json()).error.code).toBe("TEST_GENERATOR_TIMEOUT");
  });
});
