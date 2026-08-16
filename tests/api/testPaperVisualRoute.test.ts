import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/tests/visual/route";
import { getAdminAuth } from "@/lib/firebase/admin";
import { signTestGeneratorJwt } from "@/lib/internalAuth/signInternalJwt";
import { callTestPaperVisualReference } from "@/lib/tests/edgeClient";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: vi.fn() }));
vi.mock("@/lib/internalAuth/signInternalJwt", () => ({ signTestGeneratorJwt: vi.fn() }));
vi.mock("@/lib/tests/edgeClient", () => ({ callTestPaperVisualReference: vi.fn() }));
vi.mock("@/lib/storage/googleDriveProvider", () => ({ GoogleDriveProvider: vi.fn(function GoogleDriveProvider() {}) }));

const query = "questionId=123e4567-e89b-42d3-a456-426614174000&visualId=benzene&boardId=punjab&classId=class-9&subjectId=chemistry";
const request = (value = query, authorization = "Bearer valid") => new NextRequest(`http://localhost/api/tests/visual?${value}`, { headers: { authorization } });

describe("test paper visual BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminAuth).mockReturnValue({ verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }) } as never);
    vi.mocked(signTestGeneratorJwt).mockResolvedValue("test-generator-jwt");
    vi.mocked(callTestPaperVisualReference).mockResolvedValue({ storage_provider: "google_drive", storage_key: "private-drive-key" });
    vi.mocked(GoogleDriveProvider).mockImplementation(function MockGoogleDriveProvider() {
      return { readImage: vi.fn().mockResolvedValue({ stream: Readable.from(Buffer.from("image")), mimeType: "image/png", contentLength: 5 }) } as never;
    } as never);
  });

  it("streams only a role-authorized image and keeps the storage key server-side", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const streamed = await response.text();
    expect(streamed).toBe("image");
    expect(streamed).not.toContain("private-drive-key");
    expect(callTestPaperVisualReference).toHaveBeenCalledWith("test-generator-jwt", expect.objectContaining({
      operation: "visual_reference", question_id: "123e4567-e89b-42d3-a456-426614174000", visual_id: "benzene", board_id: "punjab",
    }));
  });

  it("rejects invalid requests before signing or resolving a visual", async () => {
    const response = await GET(request("questionId=not-a-uuid"));
    expect(response.status).toBe(404);
    expect(signTestGeneratorJwt).not.toHaveBeenCalled();
    expect(callTestPaperVisualReference).not.toHaveBeenCalled();
  });
});
