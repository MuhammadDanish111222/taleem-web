import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("admin panel feature gate", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 404 for admin pages and APIs when disabled", () => {
    process.env = { ...originalEnv, ADMIN_PANEL_ENABLED: "false" };

    expect(proxy(new NextRequest("http://localhost/admin/dashboard")).status).toBe(404);
    expect(proxy(new NextRequest("http://localhost/api/admin/ingest/jsonl")).status).toBe(404);
  });

  it("allows enabled admin API routes through to their route-level protections", () => {
    process.env = { ...originalEnv, ADMIN_PANEL_ENABLED: "true" };

    const response = proxy(new NextRequest("http://localhost/api/admin/ingest/jsonl"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
