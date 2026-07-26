import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/rag/route";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { requireAdminSession } from "@/lib/auth/session";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import { callAiService } from "@/lib/internalApi/callAiService";
import { DomainError } from "@/lib/services/admin/catalogueService";

vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({ validateAdminWriteRequest: vi.fn() }));
vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));

const request = (body = JSON.stringify({ operation: "overview", board_id: "b", class_id: "c", subject_id: "s" })) => new NextRequest("http://localhost/api/admin/rag", { method: "POST", body });

describe("local RAG BFF", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(isAdminPanelEnabled).mockReturnValue(true); vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin", admin: true } as any); vi.mocked(validateAdminWriteRequest).mockResolvedValue(); vi.mocked(callAiService).mockResolvedValue({ versions: [], jobs: [] }); });
  it("returns 404 before auth or parsing when disabled", async () => { vi.mocked(isAdminPanelEnabled).mockReturnValue(false); const response = await POST(request()); expect(response.status).toBe(404); expect(requireAdminSession).not.toHaveBeenCalled(); expect(validateAdminWriteRequest).not.toHaveBeenCalled(); expect(callAiService).not.toHaveBeenCalled(); });
  it("rejects missing Origin before parsing a malformed body or calling the service", async () => { vi.mocked(validateAdminWriteRequest).mockRejectedValue(new DomainError("FORBIDDEN", "Invalid origin")); const response = await POST(request("{")); expect(response.status).toBe(403); expect(callAiService).not.toHaveBeenCalled(); });
  it("rejects missing or invalid CSRF before parsing a malformed body or calling the service", async () => { vi.mocked(validateAdminWriteRequest).mockRejectedValue(new DomainError("FORBIDDEN", "CSRF token mismatch")); const response = await POST(request("{")); expect(response.status).toBe(403); expect(callAiService).not.toHaveBeenCalled(); });
  it("forwards only after session and CSRF validation", async () => { const response = await POST(request()); expect(response.status).toBe(200); expect(callAiService).toHaveBeenCalledWith("/api/v1/internal/admin/rag", "POST", expect.objectContaining({ operation: "overview" }), "admin", true, "local_rag_admin", expect.any(Object)); });
});
