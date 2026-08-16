import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/admin/ai-settings/route";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { requireAdminSession } from "@/lib/auth/session";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { callAiService } from "@/lib/internalApi/callAiService";

vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({ validateAdminWriteRequest: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));

describe("local runtime settings BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(isAdminPanelEnabled).mockReturnValue(true);
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin", admin: true } as any);
    vi.mocked(validateAdminWriteRequest).mockResolvedValue(); vi.mocked(callAiService).mockResolvedValue({ registry: [], effective: [] });
  });
  it("returns 404 before sensitive work when the local admin gate is disabled", async () => {
    vi.mocked(isAdminPanelEnabled).mockReturnValue(false);
    const request = new NextRequest("http://localhost/api/admin/ai-settings", { method: "POST" }); request.json = vi.fn();
    expect((await POST(request)).status).toBe(404); expect(requireAdminSession).not.toHaveBeenCalled(); expect(validateAdminWriteRequest).not.toHaveBeenCalled(); expect(request.json).not.toHaveBeenCalled(); expect(callAiService).not.toHaveBeenCalled();
  });
  it("requires the established admin session and CSRF checks before mutation", async () => {
    const request = new NextRequest("http://localhost/api/admin/ai-settings", { method: "POST", body: JSON.stringify({ key: "feature.multiple_ask", scope: { kind: "global" }, value: "enabled" }), headers: { "content-type": "application/json" } });
    expect((await POST(request)).status).toBe(200); expect(validateAdminWriteRequest).toHaveBeenCalledWith(request); expect(callAiService).toHaveBeenCalledWith("/api/v1/internal/admin/runtime-settings", "POST", expect.anything(), "admin", true, "local_runtime_settings", expect.anything());
  });
  it("does not require CSRF for the authenticated no-store read", async () => {
    expect((await GET(new NextRequest("http://localhost/api/admin/ai-settings"))).status).toBe(200); expect(validateAdminWriteRequest).not.toHaveBeenCalled();
  });
});
