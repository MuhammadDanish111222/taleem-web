import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/rag/drive-cleanup/route";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { requireAdminSession } from "@/lib/auth/session";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { callAiService } from "@/lib/internalApi/callAiService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({ validateAdminWriteRequest: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));
vi.mock("@/lib/storage/googleDriveProvider", () => ({ GoogleDriveProvider: vi.fn(function GoogleDriveProvider() {}) }));

describe("paired visual Drive cleanup BFF", () => {
  const old = "2025-01-01T00:00:00.000Z";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminPanelEnabled).mockReturnValue(true);
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin", admin: true } as any);
    vi.mocked(validateAdminWriteRequest).mockResolvedValue();
    vi.mocked(callAiService).mockResolvedValue({ storage_keys: ["secret-drive-key-one"] });
  });

  it("gates the route before session and body work", async () => {
    vi.mocked(isAdminPanelEnabled).mockReturnValue(false);
    const request = new NextRequest("http://localhost/api/admin/rag/drive-cleanup", { method: "POST" });
    request.json = vi.fn();
    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });

  it("previews without deleting and never returns storage keys", async () => {
    const remove = vi.fn();
    vi.mocked(GoogleDriveProvider).mockImplementation(function GoogleDriveProvider() {
      return {
        listPairedVisuals: vi.fn().mockResolvedValue([
          { storageKey: "secret-drive-key-one", createdAt: old },
          { storageKey: "secret-drive-key-two", createdAt: old },
        ]),
        deletePairedVisual: remove,
      } as any;
    } as any);
    const request = new NextRequest("http://localhost/api/admin/rag/drive-cleanup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ execute: false }),
    });
    const response = await POST(request);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("secret-drive-key-one");
    expect(text).not.toContain("secret-drive-key-two");
    expect(remove).not.toHaveBeenCalled();
    expect(JSON.parse(text).data.eligible_orphan_count).toBe(1);
  });

  it("deletes only old, unreferenced importer-owned objects", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.mocked(GoogleDriveProvider).mockImplementation(function GoogleDriveProvider() {
      return {
        listPairedVisuals: vi.fn().mockResolvedValue([
          { storageKey: "secret-drive-key-one", createdAt: old },
          { storageKey: "old-orphan", createdAt: old },
          { storageKey: "new-orphan", createdAt: new Date().toISOString() },
        ]),
        deletePairedVisual: remove,
      } as any;
    } as any);
    const request = new NextRequest("http://localhost/api/admin/rag/drive-cleanup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ execute: true }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("old-orphan");
  });
});
