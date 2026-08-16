import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as dashboard } from "@/app/api/admin/operations/dashboard/route";
import { GET as audits } from "@/app/api/admin/operations/audits/route";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";

vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));

describe("local operations dashboard BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminPanelEnabled).mockReturnValue(true);
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin", admin: true } as never);
    vi.mocked(callAiService).mockResolvedValue({ items: [] });
  });

  it("returns 404 before session parsing or upstream work while locally disabled", async () => {
    vi.mocked(isAdminPanelEnabled).mockReturnValue(false);
    expect((await dashboard(new NextRequest("http://localhost/api/admin/operations/dashboard"))).status).toBe(404);
    expect((await audits(new NextRequest("http://localhost/api/admin/operations/audits"))).status).toBe(404);
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("requires an admin session and does not turn authorization failures into 503", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("UNAUTHORIZED"));
    const response = await dashboard(new NextRequest("http://localhost/api/admin/operations/dashboard"));
    expect(response.status).toBe(403);
    expect(callAiService).not.toHaveBeenCalled();
  });

  it("bounds invalid queries before auth and forwards the narrow feature claim", async () => {
    expect((await dashboard(new NextRequest("http://localhost/api/admin/operations/dashboard?window=forever"))).status).toBe(400);
    expect((await audits(new NextRequest("http://localhost/api/admin/operations/audits?limit=101"))).status).toBe(400);
    expect((await audits(new NextRequest("http://localhost/api/admin/operations/audits?cursor=not-a-uuid"))).status).toBe(400);
    expect(requireAdminSession).not.toHaveBeenCalled();
    const response = await dashboard(new NextRequest("http://localhost/api/admin/operations/dashboard?window=7d"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(callAiService).toHaveBeenCalledWith(
      "/api/v1/internal/admin/operations-dashboard?window=7d", "GET", null, "admin", true,
      "local_operations_dashboard", expect.any(Object),
    );
  });
});
