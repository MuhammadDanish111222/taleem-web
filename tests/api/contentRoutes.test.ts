import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getContentList } from "../../app/api/content/route";
import { GET as getPreview } from "../../app/api/content/[resourceId]/preview/route";
import { GET as getDownload } from "../../app/api/content/[resourceId]/download/route";
import { NextRequest } from "next/server";
import { getResource, getResourceVersion } from "../../lib/repositories/firestore/resourceRepository";
import { listPublicResources } from "../../lib/resources/public";
import { GoogleDriveProvider } from "../../lib/storage/googleDriveProvider";
import { ResourceError } from "../../lib/resources/errors";
import { Readable } from "stream";

vi.mock("../../lib/repositories/firestore/resourceRepository", () => ({
  getResource: vi.fn(),
  getResourceVersion: vi.fn(),
}));

vi.mock("../../lib/resources/public", () => ({
  listPublicResources: vi.fn(),
}));

vi.mock("../../lib/storage/googleDriveProvider", () => {
  return {
    GoogleDriveProvider: class MockGoogleDriveProvider {
      readRange = vi.fn().mockImplementation(async (_key: string, range?: any) => {
        const totalSize = 10000;
        let start = 0;
        let end = totalSize - 1;

        if (range) {
          start = range.start;
          end = range.end !== undefined ? range.end : totalSize - 1;
        }

        const contentLength = end - start + 1;
        const dummyStream = Readable.from(Buffer.alloc(contentLength));

        return {
          stream: dummyStream,
          status: range ? 206 : 200,
          mimeType: "application/pdf",
          contentLength,
          totalSize,
          contentRange: range ? { start, end, total: totalSize } : undefined,
        };
      });
    },
  };
});

describe("Content Routes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockPublishedResource = {
    id: "res-pub-1",
    type: "book",
    title: "Physics Textbook",
    boardId: "fbise",
    classId: "class-9",
    subjectId: "physics",
    chapterId: null,
    status: "published",
    currentVersionId: "ver-1",
    language: "english",
    curriculumVersion: "2024",
    displayOrder: 1,
  };

  const mockVersion = {
    id: "ver-1",
    resourceId: "res-pub-1",
    storageProvider: "google_drive",
    storageKey: "drive-key-123",
    originalFilename: "physics_grade9.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10000,
    sha256: "a".repeat(64),
    providerRevision: "rev-1",
    pageCount: 50,
  };

  describe("GET /api/content (Public List API)", () => {
    it("should return 200 OK with list response and nosniff headers", async () => {
      vi.mocked(listPublicResources).mockResolvedValueOnce({
        data: [
          {
            id: "res-pub-1",
            type: "book",
            title: "Physics Textbook",
            boardId: "fbise",
            classId: "class-9",
            subjectId: "physics",
            chapterId: null,
            examinationBoardId: null,
            paperYear: null,
            paperSession: null,
            paperType: null,
            language: "english",
            curriculumVersion: "2024",
            displayOrder: 1,
            publishedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      });

      const req = new NextRequest("http://localhost/api/content?boardId=fbise&classId=class-9&subjectId=physics");
      const res = await getContentList(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate");

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("res-pub-1");
    });

    it("should return 400 when listPublicResources throws ResourceError (e.g., VALIDATION_FAILED or HIERARCHY_INACTIVE)", async () => {
      vi.mocked(listPublicResources).mockRejectedValueOnce(
        new ResourceError("VALIDATION_FAILED", "Invalid cursor format")
      );

      const req = new NextRequest("http://localhost/api/content?boardId=fbise&classId=class-9&subjectId=physics&cursor=invalid");
      const res = await getContentList(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid cursor format");
    });
  });

  describe("GET /api/content/[resourceId]/preview (PDF Preview Proxy)", () => {
    it("should return 200 OK full stream when no Range header is provided", async () => {
      vi.mocked(getResource).mockResolvedValueOnce(mockPublishedResource as any);
      vi.mocked(getResourceVersion).mockResolvedValueOnce(mockVersion as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/preview");
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getPreview(req, { params });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Content-Disposition")).toContain('inline; filename="physics_grade9.pdf"');
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate");
      expect(res.headers.get("ETag")).toBe(`"${mockVersion.sha256}"`);
      expect(res.headers.get("Content-Length")).toBe("10000");
    });

    it("should return 206 Partial Content for a valid Range header (bytes=0-1023)", async () => {
      vi.mocked(getResource).mockResolvedValueOnce(mockPublishedResource as any);
      vi.mocked(getResourceVersion).mockResolvedValueOnce(mockVersion as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/preview", {
        headers: { range: "bytes=0-1023" },
      });
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getPreview(req, { params });

      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 0-1023/10000");
      expect(res.headers.get("Content-Length")).toBe("1024");
    });

    it("should return 206 Partial Content for suffix Range header (bytes=-500)", async () => {
      vi.mocked(getResource).mockResolvedValueOnce(mockPublishedResource as any);
      vi.mocked(getResourceVersion).mockResolvedValueOnce(mockVersion as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/preview", {
        headers: { range: "bytes=-500" },
      });
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getPreview(req, { params });

      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 9500-9999/10000");
      expect(res.headers.get("Content-Length")).toBe("500");
    });

    it("should clamp end range bound when end >= sizeBytes (bytes=0-9999999)", async () => {
      vi.mocked(getResource).mockResolvedValueOnce(mockPublishedResource as any);
      vi.mocked(getResourceVersion).mockResolvedValueOnce(mockVersion as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/preview", {
        headers: { range: "bytes=0-9999999" },
      });
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getPreview(req, { params });

      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 0-9999/10000");
      expect(res.headers.get("Content-Length")).toBe("10000");
    });

    it("should fall back to 200 OK full file for syntactically malformed Range header (bytes=invalid-syntax)", async () => {
      vi.mocked(getResource).mockResolvedValueOnce(mockPublishedResource as any);
      vi.mocked(getResourceVersion).mockResolvedValueOnce(mockVersion as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/preview", {
        headers: { range: "bytes=invalid-syntax" },
      });
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getPreview(req, { params });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Length")).toBe("10000");
    });

    it("should return 416 Range Not Satisfiable for unsatisfiable range (bytes=999999-)", async () => {
      vi.mocked(getResource).mockResolvedValueOnce(mockPublishedResource as any);
      vi.mocked(getResourceVersion).mockResolvedValueOnce(mockVersion as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/preview", {
        headers: { range: "bytes=999999-" },
      });
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getPreview(req, { params });

      expect(res.status).toBe(416);
      expect(res.headers.get("Content-Range")).toBe("bytes */10000");
    });

    it("should return 304 Not Modified when If-None-Match matches version sha256 ETag", async () => {
      vi.mocked(getResource).mockResolvedValueOnce(mockPublishedResource as any);
      vi.mocked(getResourceVersion).mockResolvedValueOnce(mockVersion as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/preview", {
        headers: { "if-none-match": `"${mockVersion.sha256}"` },
      });
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getPreview(req, { params });

      expect(res.status).toBe(304);
      expect(res.headers.get("ETag")).toBe(`"${mockVersion.sha256}"`);
    });

    it("should return 404 for draft, hidden, or archived resources", async () => {
      vi.mocked(getResource).mockResolvedValueOnce({
        ...mockPublishedResource,
        status: "hidden",
      } as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/preview");
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getPreview(req, { params });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/content/[resourceId]/download (Attachment Download Route)", () => {
    it("should return 200 OK with attachment disposition and safe filename", async () => {
      vi.mocked(getResource).mockResolvedValueOnce(mockPublishedResource as any);
      vi.mocked(getResourceVersion).mockResolvedValueOnce(mockVersion as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/download");
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getDownload(req, { params });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Content-Disposition")).toContain('attachment; filename="physics_grade9.pdf"');
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate");
    });

    it("should return 404 if resource status is not published", async () => {
      vi.mocked(getResource).mockResolvedValueOnce({
        ...mockPublishedResource,
        status: "archived",
      } as any);

      const req = new NextRequest("http://localhost/api/content/res-pub-1/download");
      const params = Promise.resolve({ resourceId: "res-pub-1" });

      const res = await getDownload(req, { params });
      expect(res.status).toBe(404);
    });
  });
});
