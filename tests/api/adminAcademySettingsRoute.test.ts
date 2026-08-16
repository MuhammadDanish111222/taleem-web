import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/admin/academy-settings/route";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import * as academyRepo from "@/lib/repositories/firestore/academySettingsRepository";

vi.mock("@/lib/auth/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/config/adminPanel", () => ({ isAdminPanelEnabled: vi.fn() }));
vi.mock("@/lib/security/adminWrite", () => ({ validateAdminWriteRequest: vi.fn() }));
vi.mock("@/lib/repositories/firestore/academySettingsRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof academyRepo>();
  return {
    ...actual,
    readAcademySettingsAdmin: vi.fn(),
    writeAcademySettingsAtomically: vi.fn(),
  };
});

function createGetRequest() {
  return new NextRequest("http://localhost/api/admin/academy-settings", {
    method: "GET",
  });
}

function createPostRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/admin/academy-settings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": "valid-token",
      origin: "http://localhost",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("Admin Academy Settings BFF Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminPanelEnabled).mockReturnValue(true);
    vi.mocked(requireAdminSession).mockResolvedValue({ uid: "admin-1", email: "admin@example.com", admin: true } as never);
    vi.mocked(validateAdminWriteRequest).mockResolvedValue(undefined as never);
    vi.mocked(academyRepo.readAcademySettingsAdmin).mockResolvedValue({
      visible: true,
      whatsapp_number: "923345405945",
      whatsapp_message_template: "Hello Sir",
    });
    vi.mocked(academyRepo.writeAcademySettingsAtomically).mockResolvedValue({
      visible: true,
      whatsapp_number: "923345405945",
      whatsapp_message_template: "Hello Sir",
    });
  });

  it("returns 404 before auth or repo calls when local admin is disabled", async () => {
    vi.mocked(isAdminPanelEnabled).mockReturnValue(false);

    const getRes = await GET();
    expect(getRes.status).toBe(404);

    const postRes = await POST(createPostRequest({ visible: true, whatsapp_number: "923345405945", whatsapp_message_template: "" }));
    expect(postRes.status).toBe(404);

    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(academyRepo.readAcademySettingsAdmin).not.toHaveBeenCalled();
    expect(academyRepo.writeAcademySettingsAtomically).not.toHaveBeenCalled();
  });

  it("GET returns 401 when admin session is unauthenticated", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("UNAUTHENTICATED"));

    const res = await GET();
    expect(res.status).toBe(401);
    expect(academyRepo.readAcademySettingsAdmin).not.toHaveBeenCalled();
  });

  it("GET returns current sanitized settings with private no-store headers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const json = await res.json();
    expect(json.status).toBe("success");
    expect(json.data).toEqual({
      visible: true,
      whatsapp_number: "923345405945",
      whatsapp_message_template: "Hello Sir",
    });
    expect(json.data.academy_name).toBeUndefined();
  });

  it("POST validates CSRF and origin before writing", async () => {
    vi.mocked(validateAdminWriteRequest).mockRejectedValue(new Error("FORBIDDEN"));

    const res = await POST(createPostRequest({ visible: true, whatsapp_number: "923345405945", whatsapp_message_template: "" }));
    expect(res.status).toBe(403);
    expect(academyRepo.writeAcademySettingsAtomically).not.toHaveBeenCalled();
  });

  it("POST writes settings atomically with validated request ID and returns sanitized response", async () => {
    const validRequestId = "123e4567-e89b-42d3-a456-426614174000";
    const res = await POST(
      createPostRequest(
        { visible: true, whatsapp_number: "923345405945", whatsapp_message_template: "Salam Sir" },
        { "x-request-id": validRequestId }
      )
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(academyRepo.writeAcademySettingsAtomically).toHaveBeenCalledWith(
      { visible: true, whatsapp_number: "923345405945", whatsapp_message_template: "Salam Sir" },
      "admin-1",
      validRequestId
    );
  });

  it("POST normalizes phone number containing spaces and hyphens", async () => {
    const res = await POST(
      createPostRequest({ visible: true, whatsapp_number: "+92 (334) 540-5945", whatsapp_message_template: "" })
    );

    expect(res.status).toBe(200);
    expect(academyRepo.writeAcademySettingsAtomically).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp_number: "923345405945" }),
      "admin-1",
      expect.any(String)
    );
  });

  it("POST generates a canonical random UUID if x-request-id is missing or invalid", async () => {
    const res = await POST(
      createPostRequest(
        { visible: true, whatsapp_number: "923345405945", whatsapp_message_template: "" },
        { "x-request-id": "invalid-request-id" }
      )
    );

    expect(res.status).toBe(200);
    expect(academyRepo.writeAcademySettingsAtomically).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    );
  });

  it("POST rejects unknown fields with 400", async () => {
    const res = await POST(
      createPostRequest({ visible: true, whatsapp_number: "923345405945", whatsapp_message_template: "", extraField: "hack" })
    );

    expect(res.status).toBe(400);
    expect(academyRepo.writeAcademySettingsAtomically).not.toHaveBeenCalled();
  });

  it("POST rejects letters, URLs, and HTML in phone number with 400", async () => {
    const lettersRes = await POST(createPostRequest({ visible: true, whatsapp_number: "923345abc945", whatsapp_message_template: "" }));
    expect(lettersRes.status).toBe(400);

    const urlRes = await POST(createPostRequest({ visible: true, whatsapp_number: "http://evil.com", whatsapp_message_template: "" }));
    expect(urlRes.status).toBe(400);

    const htmlRes = await POST(createPostRequest({ visible: true, whatsapp_number: "<script>alert(1)</script>", whatsapp_message_template: "" }));
    expect(htmlRes.status).toBe(400);

    expect(academyRepo.writeAcademySettingsAtomically).not.toHaveBeenCalled();
  });

  it("POST rejects normalized phone numbers with leading zero", async () => {
    const res = await POST(createPostRequest({ visible: true, whatsapp_number: "03345405945", whatsapp_message_template: "" }));
    expect(res.status).toBe(400);
    expect(academyRepo.writeAcademySettingsAtomically).not.toHaveBeenCalled();
  });

  it("POST rejects oversized message template (>500 chars)", async () => {
    const longMessage = "a".repeat(501);
    const res = await POST(createPostRequest({ visible: true, whatsapp_number: "923345405945", whatsapp_message_template: longMessage }));
    expect(res.status).toBe(400);
    expect(academyRepo.writeAcademySettingsAtomically).not.toHaveBeenCalled();
  });

  it("POST rejects HTML in message template", async () => {
    const res = await POST(createPostRequest({ visible: true, whatsapp_number: "923345405945", whatsapp_message_template: "<script>alert(1)</script>" }));
    expect(res.status).toBe(400);
    expect(academyRepo.writeAcademySettingsAtomically).not.toHaveBeenCalled();
  });
});
