import { NextRequest } from "next/server";
import { authenticateAskRequest, jsonNoStore, validateSameOrigin } from "@/lib/ai/bff";
import { isMultipleAskRun1Enabled } from "@/lib/config/multipleAsk";
import { callAiService } from "@/lib/internalApi/callAiService";
import { mapMultipleAskServiceError } from "@/lib/multipleAsk/bff";
import {
  multipleAskJobInternalResponseSchema,
  multipleAskTextBrowserRequestSchema,
  toBrowserJobResponse,
  toInternalTextRequest,
} from "@/lib/multipleAsk/contracts";

export async function POST(request: NextRequest) {
  if (!isMultipleAskRun1Enabled()) return jsonNoStore({ error: { code: "NOT_FOUND" } }, 404);
  if (!validateSameOrigin(request)) return jsonNoStore({ error: { code: "INVALID_ORIGIN" } }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return jsonNoStore({ error: { code: "JSON_REQUIRED" } }, 415);
  const identity = await authenticateAskRequest(request);
  if (!identity.ok) return identity.response;
  const parsed = multipleAskTextBrowserRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonNoStore({ error: { code: "INVALID_REQUEST" } }, 400);
  try {
    const upstream = await callAiService("/api/v1/internal/multiple-ask/text", "POST", toInternalTextRequest(parsed.data), identity.uid, false, "multiple_ask", { requestId: parsed.data.requestId, accountTier: identity.accountTier });
    const validated = multipleAskJobInternalResponseSchema.safeParse(upstream);
    if (!validated.success) throw new Error("INVALID_AI_SERVICE_RESPONSE");
    return jsonNoStore(toBrowserJobResponse(validated.data), 202);
  } catch (error) {
    return mapMultipleAskServiceError(error);
  }
}
