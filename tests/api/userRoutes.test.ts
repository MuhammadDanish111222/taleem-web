import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as syncUser } from "@/app/api/users/me/route";
import {
  GET as listUsers,
  PATCH as updateUser,
} from "@/app/api/admin/users/route";
import { getAdminAuth } from "@/lib/firebase/admin";
import { requireAdminSession } from "@/lib/auth/session";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import {
  ensureStudentUser,
  listStudentUsers,
  setStudentSubscription,
} from "@/lib/services/users/userService";
import { DomainError } from "@/lib/services/admin/catalogueService";

vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({
  validateAdminWriteRequest: vi.fn(),
}));
vi.mock("@/lib/services/users/userService", () => ({
  ensureStudentUser: vi.fn(),
  listStudentUsers: vi.fn(),
  setStudentSubscription: vi.fn(),
}));

const user = {
  uid: "student-1",
  email: null,
  displayName: null,
  photoURL: null,
  authProvider: "anonymous",
  subscriptionActive: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

describe("student profile and admin users APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: "student-1" }),
    } as any);
    vi.mocked(ensureStudentUser).mockResolvedValue(user as any);
    vi.mocked(requireAdminSession).mockResolvedValue({
      uid: "admin-1",
      admin: true,
    } as any);
    vi.mocked(validateAdminWriteRequest).mockResolvedValue();
    vi.mocked(listStudentUsers).mockResolvedValue({
      users: [user as any],
      nextCursor: null,
    });
    vi.mocked(setStudentSubscription).mockResolvedValue({
      ...user,
      subscriptionActive: true,
    } as any);
  });

  it("requires a Firebase bearer token before synchronizing a profile", async () => {
    const response = await syncUser(
      new NextRequest("http://localhost/api/users/me", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(ensureStudentUser).not.toHaveBeenCalled();
  });

  it("creates or reuses the profile represented by the verified token", async () => {
    const response = await syncUser(
      new NextRequest("http://localhost/api/users/me", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
    expect(response.status).toBe(200);
    expect(ensureStudentUser).toHaveBeenCalledWith({ uid: "student-1" });
    expect((await response.json()).user.subscriptionActive).toBe(false);
  });

  it("requires an admin session to list users", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(
      new Error("UNAUTHENTICATED"),
    );
    const response = await listUsers(
      new NextRequest("http://localhost/api/admin/users"),
    );
    expect(response.status).toBe(401);
    expect(listStudentUsers).not.toHaveBeenCalled();
  });

  it("rejects CSRF or Origin failures before parsing a subscription update", async () => {
    vi.mocked(validateAdminWriteRequest).mockRejectedValue(
      new DomainError("FORBIDDEN", "CSRF token mismatch"),
    );
    const response = await updateUser(
      new NextRequest("http://localhost/api/admin/users", {
        method: "PATCH",
        body: "{",
      }),
    );
    expect(response.status).toBe(403);
    expect(setStudentSubscription).not.toHaveBeenCalled();
  });

  it("allows only the admin route to change the subscription boolean", async () => {
    const response = await updateUser(
      new NextRequest("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          uid: "student-1",
          subscriptionActive: true,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(setStudentSubscription).toHaveBeenCalledWith(
      "admin-1",
      "student-1",
      true,
    );
  });
});
