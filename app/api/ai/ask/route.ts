import { NextRequest } from "next/server";
import { callAiService } from "@/lib/internalApi/callAiService";
import {
  askBrowserRequestSchema,
  askInternalResponseSchema,
  toBrowserAskResponse,
  toInternalAskRequest,
} from "@/lib/ai/contracts";
import {
  authenticateAskRequest,
  jsonNoStore,
  mapAiServiceError,
  validateSameOrigin,
} from "@/lib/ai/bff";

export async function POST(request: NextRequest) {
  if (!validateSameOrigin(request)) {
    return jsonNoStore(
      { error: { code: "INVALID_ORIGIN", message: "Invalid request origin" } },
      403,
    );
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return jsonNoStore(
      { error: { code: "JSON_REQUIRED", message: "JSON request required" } },
      415,
    );
  }
  const identity = await authenticateAskRequest(request);
  if (!identity.ok) return identity.response;

  let parsedBody;
  try {
    parsedBody = askBrowserRequestSchema.safeParse(await request.json());
  } catch {
    return jsonNoStore(
      { error: { code: "INVALID_REQUEST", message: "Invalid Ask request" } },
      400,
    );
  }
  if (!parsedBody.success) {
    const textOnlyFailure = parsedBody.error.issues.some(
      (issue) => issue.message === "ASK_TEXT_ONLY",
    );
    return jsonNoStore(
      {
        error: {
          code: textOnlyFailure ? "ASK_TEXT_ONLY" : "INVALID_REQUEST",
          message: textOnlyFailure
            ? "Single Ask accepts typed text only"
            : "Invalid Ask request",
        },
      },
      400,
    );
  }

  try {
    const result = await callAiService(
      "/api/v1/internal/ask",
      "POST",
      toInternalAskRequest(parsedBody.data),
      identity.uid,
      false,
      "ask",
      {
        requestId: parsedBody.data.requestId,
        accountTier: identity.accountTier,
      },
    );
    const validated = askInternalResponseSchema.safeParse(result);
    if (!validated.success) throw new Error("INVALID_AI_SERVICE_RESPONSE");
    return jsonNoStore(toBrowserAskResponse(validated.data));
  } catch (error) {
    return mapAiServiceError(error);
  }
}
