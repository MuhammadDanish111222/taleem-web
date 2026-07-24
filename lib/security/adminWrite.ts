import "server-only";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { DomainError } from "@/lib/services/admin/catalogueService";

/**
 * Shared Origin and double-submit CSRF validation for cookie-authenticated
 * admin writes. Keep this as the sole implementation for admin API routes.
 */
export async function validateAdminWriteRequest(request: NextRequest): Promise<void> {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    throw new DomainError("FORBIDDEN", "Invalid origin");
  }

  try {
    if (new URL(origin).host !== host) {
      throw new DomainError("FORBIDDEN", "Invalid origin");
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("FORBIDDEN", "Invalid origin");
  }

  const csrfHeader = request.headers.get("x-csrf-token");
  const csrfCookie = (await cookies()).get("__csrf")?.value;
  if (!csrfHeader || !csrfCookie || csrfCookie !== csrfHeader) {
    throw new DomainError("FORBIDDEN", "CSRF token mismatch");
  }
}
