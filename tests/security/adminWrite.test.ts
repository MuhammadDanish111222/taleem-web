import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ csrfCookie: "valid-csrf-token" }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => name === "__csrf" && state.csrfCookie ? { value: state.csrfCookie } : undefined,
  })),
}));

import { validateAdminWriteRequest } from "@/lib/security/adminWrite";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/admin/ingest/jsonl", {
    method: "POST",
    headers: { host: "localhost", origin: "http://localhost", "x-csrf-token": "valid-csrf-token", ...headers },
  });
}

describe("validateAdminWriteRequest", () => {
  beforeEach(() => { state.csrfCookie = "valid-csrf-token"; });

  it("accepts same-origin requests with matching double-submit tokens", async () => {
    await expect(validateAdminWriteRequest(request())).resolves.toBeUndefined();
  });

  it.each([
    ["missing CSRF", () => request({ "x-csrf-token": "" })],
    ["invalid CSRF", () => request({ "x-csrf-token": "wrong" })],
    ["invalid Origin", () => request({ origin: "https://attacker.example" })],
  ])("rejects %s", async (_label, createRequest) => {
    await expect(validateAdminWriteRequest(createRequest())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
