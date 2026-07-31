"use client";

import type { AskAdminRequest } from "@/lib/ai/adminContracts";

export class AskAdminClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new AskAdminClientError("Could not establish a secure admin session", response.status);
  const payload = await response.json() as { csrfToken?: unknown };
  if (typeof payload.csrfToken !== "string" || !payload.csrfToken) {
    throw new AskAdminClientError("Could not establish a secure admin session", 500);
  }
  return payload.csrfToken;
}

export async function callAskAdmin<T>(request: AskAdminRequest, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/admin/ask", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": await getCsrfToken(),
      "X-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => null) as {
    status?: unknown;
    message?: unknown;
    data?: T;
  } | null;
  if (!response.ok || payload?.status !== "success" || payload.data === undefined) {
    throw new AskAdminClientError(
      typeof payload?.message === "string" ? payload.message : "Admin operation failed",
      response.status,
    );
  }
  return payload.data;
}
