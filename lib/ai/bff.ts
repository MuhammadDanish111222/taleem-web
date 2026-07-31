import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import {
  AskAccountTier,
  getStudentAskAccountTier,
} from "@/lib/services/users/userService";
import {
  toBrowserUsage,
  usageInternalResponseSchema,
} from "@/lib/ai/contracts";

export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function validateSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0];
  const host = forwardedHost?.trim() || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0];
  const protocol =
    forwardedProto?.trim() || request.nextUrl.protocol.replace(":", "");
  if (!origin || !host || !protocol) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && parsed.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export async function authenticateAskRequest(
  request: NextRequest,
): Promise<
  | { ok: true; uid: string; accountTier: AskAccountTier }
  | { ok: false; response: NextResponse }
> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) {
    return {
      ok: false,
      response: jsonNoStore(
        { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
        401,
      ),
    };
  }
  try {
    const token = await getAdminAuth().verifyIdToken(authorization.slice(7));
    const accountTier = await getStudentAskAccountTier(token);
    return { ok: true, uid: token.uid, accountTier };
  } catch {
    return {
      ok: false,
      response: jsonNoStore(
        { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
        401,
      ),
    };
  }
}

const SAFE_CODES = new Set([
  "USAGE_LIMIT_REACHED",
  "REQUEST_ID_MISMATCH",
  "ASK_TEXT_ONLY",
  "GENERAL_AI_DISABLED",
  "NO_ANSWER",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_FAILURE",
  "AUTH_INVALID_TOKEN",
  "AUTH_FEATURE_FORBIDDEN",
]);

export function mapAiServiceError(error: unknown): NextResponse {
  const record = error as {
    status?: number;
    errorData?: { detail?: { code?: unknown; usage?: unknown } };
  };
  const upstreamStatus =
    typeof record?.status === "number" ? record.status : undefined;
  const rawCode = record?.errorData?.detail?.code;
  const code =
    typeof rawCode === "string" && SAFE_CODES.has(rawCode)
      ? rawCode
      : upstreamStatus === 429
        ? "USAGE_LIMIT_REACHED"
        : "AI_SERVICE_UNAVAILABLE";
  const status =
    upstreamStatus === 400 ||
    upstreamStatus === 401 ||
    upstreamStatus === 403 ||
    upstreamStatus === 409 ||
    upstreamStatus === 429
      ? upstreamStatus
      : 503;
  const parsedUsage = usageInternalResponseSchema.safeParse(
    record?.errorData?.detail?.usage,
  );
  return jsonNoStore(
    {
      error: {
        code,
        message:
          code === "USAGE_LIMIT_REACHED"
            ? "Daily question limit reached"
            : "Ask service is temporarily unavailable",
      },
      ...(parsedUsage.success
        ? { usage: toBrowserUsage(parsedUsage.data) }
        : {}),
    },
    status,
  );
}
