import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/rag/visual/[visualId]/route";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));
vi.mock("@/lib/storage/googleDriveProvider", () => ({ GoogleDriveProvider: vi.fn() }));

const params = Promise.resolve({ visualId: "visual-1" });
const request = () => new NextRequest("http://localhost/api/admin/rag/visual/visual-1?board_id=b&class_id=c&subject_id=s&corpus_version_id=v");

describe("local RAG visual BFF stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminPanelEnabled).mockReturnValue(true);
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin", admin: true } as any);
    vi.mocked(callAiService).mockResolvedValue({ storage_key: "server-only-key" });
    vi.mocked(GoogleDriveProvider).mockImplementation(function MockGoogleDriveProvider() { return {
      readImage: vi.fn().mockResolvedValue({ stream: Readable.from([Buffer.from("png")]), mimeType: "image/png", contentLength: 3 }),
    }; } as any);
  });

  it("returns 404 before auth or internal service when disabled", async () => {
    vi.mocked(isAdminPanelEnabled).mockReturnValue(false);
    const response = await GET(request(), { params });
    expect(response.status).toBe(404);
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests without calling the service", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("UNAUTHENTICATED"));
    const response = await GET(request(), { params });
    expect(response.status).toBe(404);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("rejects a non-admin session without calling the service", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "user", admin: false } as any);
    const response = await GET(request(), { params });
    expect(response.status).toBe(403);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("streams an allowlisted image without exposing the Drive key or URL", async () => {
    const response = await GET(request(), { params });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...response.headers.values()].join(" ")).not.toContain("server-only-key");
  });

  it("hides invalid cross-scope and provider failures", async () => {
    vi.mocked(callAiService).mockRejectedValue(new Error("CORPUS_VERSION_OUTSIDE_SCOPE server-only-key"));
    const response = await GET(request(), { params });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("server-only-key");
  });

  it("rejects an unsupported provider MIME without exposing key or provider detail", async () => {
    vi.mocked(GoogleDriveProvider).mockImplementation(function UnsupportedImageProvider() { return {
      readImage: vi.fn().mockRejectedValue(new Error("unsupported MIME application/pdf for google_drive server-only-key")),
    }; } as any);
    const response = await GET(request(), { params });
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("server-only-key");
    expect(body).not.toContain("google_drive");
    expect(body).not.toContain("application/pdf");
  });
});
