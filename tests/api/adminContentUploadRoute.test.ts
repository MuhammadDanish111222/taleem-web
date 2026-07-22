import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../app/api/admin/content/upload/route";
import { NextRequest } from "next/server";
import { requireAdminSession } from "../../lib/auth/session";
import { parseMultipartRequest } from "../../lib/security/multipartUpload";

vi.mock("../../lib/auth/session", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("../../lib/security/multipartUpload", () => ({
  parseMultipartRequest: vi.fn(),
}));

// Mock Next.js cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn((name) => {
      if (name === "__csrf") return { value: "valid-csrf" };
      return undefined;
    }),
  })),
}));

describe("Upload Route API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (headers: Record<string, string>) => {
    return new NextRequest("http://localhost/api/admin/content/upload", {
      method: "POST",
      headers: new Headers(headers),
      body: "dummy body stream",
    });
  };

  it("should reject Unauthenticated requests (401) BEFORE parsing the body", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    
    const req = createMockRequest({
      "content-type": "multipart/form-data; boundary=----123",
      "origin": "http://localhost",
      "host": "localhost",
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "idem-123"
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    
    // Verify it didn't reach body parsing
    expect(parseMultipartRequest).not.toHaveBeenCalled();
  });

  it("should reject Unauthorized requests (403) BEFORE parsing the body", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    
    const req = createMockRequest({
      "content-type": "multipart/form-data; boundary=----123",
      "origin": "http://localhost",
      "host": "localhost",
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "idem-123"
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    
    // Verify it didn't reach body parsing
    expect(parseMultipartRequest).not.toHaveBeenCalled();
  });

  it("should reject oversized Content-Length precheck (413) BEFORE parsing", async () => {
    vi.mocked(requireAdminSession).mockResolvedValueOnce({ uid: "admin1", admin: true } as any);
    
    const req = createMockRequest({
      "content-type": "multipart/form-data; boundary=----123",
      "origin": "http://localhost",
      "host": "localhost",
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "idem-123",
      "content-length": "1000000000" // 1 GB
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
    
    expect(parseMultipartRequest).not.toHaveBeenCalled();
  });

  it("should reject missing or mismatched CSRF token (403)", async () => {
    const req = createMockRequest({
      "content-type": "multipart/form-data; boundary=----123",
      "origin": "http://localhost",
      "host": "localhost",
      "x-csrf-token": "invalid-csrf",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
