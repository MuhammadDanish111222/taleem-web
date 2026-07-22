import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../app/api/admin/content/[id]/route";
import { NextRequest } from "next/server";
import { requireAdminSession } from "../../lib/auth/session";
import {
  publishResource,
  hideResource,
  archiveResource,
  restoreArchivedResource,
} from "../../lib/services/admin/resourceService";
import { revalidateTag } from "next/cache";

vi.mock("../../lib/auth/session", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("../../lib/services/admin/resourceService", () => ({
  publishResource: vi.fn(),
  hideResource: vi.fn(),
  archiveResource: vi.fn(),
  restoreArchivedResource: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn((name: string) => {
      if (name === "__csrf") return { value: "valid-csrf-token" };
      return undefined;
    }),
  })),
}));

describe("Admin Content Mutation Route POST /api/admin/content/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (body: any, headersOverride: Record<string, string> = {}) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      origin: "http://localhost",
      host: "localhost",
      "x-csrf-token": "valid-csrf-token",
      ...headersOverride,
    };

    return new NextRequest("http://localhost/api/admin/content/res-123", {
      method: "POST",
      headers: new Headers(headers),
      body: JSON.stringify(body),
    });
  };

  const mockResource = {
    id: "res-123",
    boardId: "fbise",
    classId: "class-9",
    subjectId: "physics",
    status: "published",
  };

  it("should publish resource, call resourceService.publishResource, and revalidate all 3 expected tags", async () => {
    vi.mocked(requireAdminSession).mockResolvedValueOnce({ uid: "admin-1" } as any);
    vi.mocked(publishResource).mockResolvedValueOnce(mockResource as any);

    const req = createMockRequest({ action: "publish" });
    const params = Promise.resolve({ id: "res-123" });

    const res = await POST(req, { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.resource).toEqual(mockResource);

    // Verify service call
    expect(publishResource).toHaveBeenCalledTimes(1);
    expect(publishResource).toHaveBeenCalledWith({ uid: "admin-1" }, "res-123");

    // Verify all 3 tags were revalidated with values from mock resource
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(revalidateTag).toHaveBeenNthCalledWith(1, "resources");
    expect(revalidateTag).toHaveBeenNthCalledWith(2, "resources:fbise:class-9:physics");
    expect(revalidateTag).toHaveBeenNthCalledWith(3, "resource:res-123");
  });

  it("should reject non-admin requests (401) BEFORE calling resourceService or revalidateTag", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));

    const req = createMockRequest({ action: "publish" });
    const params = Promise.resolve({ id: "res-123" });

    const res = await POST(req, { params });
    expect(res.status).toBe(401);

    expect(publishResource).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("should reject missing or mismatched CSRF requests (403) BEFORE calling resourceService or revalidateTag", async () => {
    vi.mocked(requireAdminSession).mockResolvedValueOnce({ uid: "admin-1" } as any);

    // Invalid CSRF token
    const req = createMockRequest({ action: "publish" }, { "x-csrf-token": "invalid-csrf-token" });
    const params = Promise.resolve({ id: "res-123" });

    const res = await POST(req, { params });
    expect(res.status).toBe(403);

    expect(publishResource).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("should reject invalid action value in payload with 422", async () => {
    vi.mocked(requireAdminSession).mockResolvedValueOnce({ uid: "admin-1" } as any);

    const req = createMockRequest({ action: "invalid_action_value" });
    const params = Promise.resolve({ id: "res-123" });

    const res = await POST(req, { params });
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBe("Validation failed");

    expect(publishResource).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("should handle hide, archive, and restore actions correctly", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin-1" } as any);
    vi.mocked(hideResource).mockResolvedValueOnce({ ...mockResource, status: "hidden" } as any);
    vi.mocked(archiveResource).mockResolvedValueOnce({ ...mockResource, status: "archived" } as any);
    vi.mocked(restoreArchivedResource).mockResolvedValueOnce({ ...mockResource, status: "draft" } as any);

    // 1. Hide
    const resHide = await POST(createMockRequest({ action: "hide" }), { params: Promise.resolve({ id: "res-123" }) });
    expect(resHide.status).toBe(200);
    expect(hideResource).toHaveBeenCalledWith({ uid: "admin-1" }, "res-123");

    // 2. Archive
    const resArchive = await POST(createMockRequest({ action: "archive" }), { params: Promise.resolve({ id: "res-123" }) });
    expect(resArchive.status).toBe(200);
    expect(archiveResource).toHaveBeenCalledWith({ uid: "admin-1" }, "res-123");

    // 3. Restore
    const resRestore = await POST(createMockRequest({ action: "restore" }), { params: Promise.resolve({ id: "res-123" }) });
    expect(resRestore.status).toBe(200);
    expect(restoreArchivedResource).toHaveBeenCalledWith({ uid: "admin-1" }, "res-123");
  });
});
