import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, PATCH } from "../../app/api/admin/catalogue/route";
import { NextRequest } from "next/server";
import { requireAdminSession } from "../../lib/auth/session";
import { catalogueService } from "../../lib/services/admin/catalogueService";
import { revalidateTag } from "next/cache";

vi.mock("../../lib/auth/session", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("../../lib/services/admin/catalogueService", () => ({
  catalogueService: {
    handleMutation: vi.fn(),
  },
  DomainError: class DomainError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
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

describe("Admin Catalogue Route (app/api/admin/catalogue/route.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (method: "POST" | "PATCH", body: any) => {
    return new NextRequest("http://localhost/api/admin/catalogue", {
      method,
      headers: new Headers({
        "content-type": "application/json",
        origin: "http://localhost",
        host: "localhost",
        "x-csrf-token": "valid-csrf-token",
      }),
      body: JSON.stringify(body),
    });
  };

  it("POST handler calls revalidateTag('catalogue', { expire: 0 }) cleanly without errors", async () => {
    vi.mocked(requireAdminSession).mockResolvedValueOnce({ uid: "admin-1" } as any);
    vi.mocked(catalogueService.handleMutation).mockResolvedValueOnce(undefined as any);

    const payload = {
      operation: "create",
      level: "board",
      boardId: "punjab",
      name: "Punjab Board",
    };

    const req = createMockRequest("POST", payload);
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(catalogueService.handleMutation).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("catalogue", { expire: 0 });
  });

  it("PATCH handler calls revalidateTag('catalogue', { expire: 0 }) cleanly without errors", async () => {
    vi.mocked(requireAdminSession).mockResolvedValueOnce({ uid: "admin-1" } as any);
    vi.mocked(catalogueService.handleMutation).mockResolvedValueOnce(undefined as any);

    const payload = {
      operation: "update",
      level: "board",
      boardId: "punjab",
      name: "Punjab Board Updated",
    };

    const req = createMockRequest("PATCH", payload);
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(catalogueService.handleMutation).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("catalogue", { expire: 0 });
  });
});
