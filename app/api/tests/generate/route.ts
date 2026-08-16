import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { jsonNoStore, validateSameOrigin } from "@/lib/ai/bff";
import { signTestGeneratorJwt } from "@/lib/internalAuth/signInternalJwt";
import { testGenerationRequestSchema } from "@/lib/tests/contracts";
import { callTestGeneratorEdge, TestGeneratorUpstreamError } from "@/lib/tests/edgeClient";
import { takeTestGenerationSlot } from "@/lib/tests/rateLimit";

const MAX_BODY_BYTES = 32_000;
const SAFE_CODES = new Set(["NO_ACTIVE_BLUEPRINT", "INVALID_CUSTOM_SPEC", "INSUFFICIENT_QUESTION_BANK", "INVALID_REQUEST"]);

function error(code: string, status: number, message: string) {
  return jsonNoStore({ error: { code, message } }, status);
}

export async function POST(request: NextRequest) {
  if (!validateSameOrigin(request)) return error("INVALID_ORIGIN", 403, "Invalid request origin");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return error("JSON_REQUIRED", 415, "JSON request required");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES) return error("INVALID_REQUEST", 400, "Invalid test request");

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) return error("UNAUTHENTICATED", 401, "Authentication required");
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(authorization.slice(7))).uid; }
  catch { return error("UNAUTHENTICATED", 401, "Authentication required"); }
  if (!takeTestGenerationSlot(uid)) return error("RATE_LIMITED", 429, "Too many test generation requests");

  let body: unknown;
  try { body = await request.json(); } catch { return error("INVALID_REQUEST", 400, "Invalid test request"); }
  if (JSON.stringify(body).length > MAX_BODY_BYTES) return error("INVALID_REQUEST", 400, "Invalid test request");
  const parsed = testGenerationRequestSchema.safeParse(body);
  if (!parsed.success) return error("INVALID_REQUEST", 400, "Invalid test request");

  try {
    const requestId = parsed.data.requestId ?? randomUUID();
    const token = await signTestGeneratorJwt(uid, requestId);
    const edgeBody = {
      mode: parsed.data.mode,
      board_id: parsed.data.boardId,
      class_id: parsed.data.classId,
      subject_id: parsed.data.subjectId,
      ...(parsed.data.mode === "custom" ? { spec: parsed.data.spec } : {}),
      seed: requestId,
    };
    return jsonNoStore(await callTestGeneratorEdge(token, edgeBody));
  } catch (caught) {
    if ((caught as { name?: unknown })?.name === "TimeoutError") return error("TEST_GENERATOR_TIMEOUT", 504, "Test generator timed out");
    if (caught instanceof TestGeneratorUpstreamError) {
      const code = typeof (caught.payload as { error?: { code?: unknown } })?.error?.code === "string"
        ? (caught.payload as { error: { code: string } }).error.code : "";
      if (SAFE_CODES.has(code)) return error(code, caught.status === 409 ? 409 : 400, "Test generation could not be completed");
    }
    return error("TEST_GENERATOR_UNAVAILABLE", 503, "Test generator is temporarily unavailable");
  }
}
