import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/ai/visual/[visualId]/route";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getStudentAskAccountTier } from "@/lib/services/users/userService";
import { callAiService } from "@/lib/internalApi/callAiService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: vi.fn() }));
vi.mock("@/lib/services/users/userService", () => ({
  getStudentAskAccountTier: vi.fn(),
}));
vi.mock("@/lib/internalApi/callAiService", () => ({
  callAiService: vi.fn(),
}));
vi.mock("@/lib/storage/googleDriveProvider", () => ({
  GoogleDriveProvider: vi.fn(),
}));

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const params = Promise.resolve({ visualId: "force-diagram" });

function request(overrides: Record<string, string> = {}) {
  return new NextRequest(
    `http://localhost/api/ai/visual/force-diagram?requestId=${requestId}`,
    {
      headers: {
        host: "localhost",
        origin: "http://localhost",
        authorization: "Bearer valid-token",
        ...overrides,
      },
    },
  );
}

describe("student Ask visual BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }),
    } as never);
    vi.mocked(getStudentAskAccountTier).mockResolvedValue("google");
    vi.mocked(callAiService).mockResolvedValue({
      storage_provider: "google_drive",
      storage_key: "server-only-key",
    });
    vi.mocked(GoogleDriveProvider).mockImplementation(
      function MockGoogleDriveProvider() {
        return {
          readImage: vi.fn().mockResolvedValue({
            stream: Readable.from([Buffer.from("png")]),
            mimeType: "image/png",
            contentLength: 3,
          }),
        };
      } as never,
    );
  });

  it("requires Firebase identity and a valid Ask request UUID", async () => {
    const unauthenticated = await GET(request({ authorization: "" }), { params });
    expect(unauthenticated.status).toBe(401);
    expect(callAiService).not.toHaveBeenCalled();

    const invalidId = new NextRequest(
      "http://localhost/api/ai/visual/force-diagram?requestId=not-a-uuid",
      {
        headers: {
          host: "localhost",
          origin: "http://localhost",
          authorization: "Bearer valid-token",
        },
      },
    );
    const invalid = await GET(invalidId, { params });
    expect(invalid.status).toBe(404);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("streams only the reviewed visual owned by the signed Ask operation", async () => {
    const response = await GET(request(), { params });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(callAiService).toHaveBeenCalledWith(
      "/api/v1/internal/ask/visual/force-diagram",
      "GET",
      null,
      "student-1",
      false,
      "ask_visual",
      { requestId, accountTier: "google" },
    );
    expect([...response.headers.values()].join(" ")).not.toContain(
      "server-only-key",
    );
  });

  it("sanitizes storage, MIME, and internal-service failures", async () => {
    vi.mocked(callAiService).mockResolvedValue({
      storage_provider: "google_drive",
      storage_key: "",
    });
    const response = await GET(request(), { params });
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("google_drive");
    expect(body).not.toContain("server-only-key");
  });
});
