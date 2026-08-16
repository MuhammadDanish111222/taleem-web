import "server-only";

import { NextResponse } from "next/server";
import { jsonNoStore } from "@/lib/ai/bff";

const SAFE_CODES = new Set([
  "USAGE_LIMIT_REACHED",
  "REQUEST_ID_MISMATCH",
  "MULTIPLE_ASK_INPUT_INVALID",
  "MULTIPLE_ASK_SCOPE_INVALID",
  "MULTIPLE_ASK_INPUT_TOO_LARGE",
  "MULTIPLE_ASK_IDEMPOTENCY_CONFLICT",
  "MULTIPLE_ASK_SESSION_UNAVAILABLE",
  "MULTIPLE_ASK_SESSION_NOT_FOUND",
  "MULTIPLE_ASK_JOB_NOT_FOUND",
  "MULTIPLE_ASK_ITEM_NOT_FOUND",
  "MULTIPLE_ASK_ITEM_NOT_CORRECTABLE",
  "MULTIPLE_ASK_JOB_NOT_RESUMABLE",
  "MULTIPLE_ASK_CORRECTION_INVALID",
  "MULTIPLE_ASK_CORRECTION_IDEMPOTENCY_CONFLICT",
  "FEATURE_COMING_SOON",
  "NOT_FOUND",
]);

export function mapMultipleAskServiceError(error: unknown): NextResponse {
  const record = error as {
    status?: number;
    errorData?: { detail?: { code?: unknown } };
  };
  const upstreamStatus = record?.status;
  const candidate = record?.errorData?.detail?.code;
  const code = typeof candidate === "string" && SAFE_CODES.has(candidate)
    ? candidate
    : "MULTIPLE_ASK_UNAVAILABLE";
  const status = code === "MULTIPLE_ASK_UNAVAILABLE"
    ? 503
    : upstreamStatus === 429
      ? 429
      : upstreamStatus === 409 || upstreamStatus === 404 || upstreamStatus === 400
        ? upstreamStatus
        : 503;
  return jsonNoStore({ error: { code } }, status);
}
