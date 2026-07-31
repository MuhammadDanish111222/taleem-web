import { NextRequest } from "next/server";
import { callAiService } from "@/lib/internalApi/callAiService";
import {
  toBrowserUsage,
  usageInternalResponseSchema,
} from "@/lib/ai/contracts";
import {
  authenticateAskRequest,
  jsonNoStore,
  mapAiServiceError,
} from "@/lib/ai/bff";

export async function GET(request: NextRequest) {
  const identity = await authenticateAskRequest(request);
  if (!identity.ok) return identity.response;
  try {
    const result = await callAiService(
      "/api/v1/internal/ask/usage",
      "GET",
      null,
      identity.uid,
      false,
      "ask_usage",
      { accountTier: identity.accountTier },
    );
    const validated = usageInternalResponseSchema.safeParse(result);
    if (!validated.success) throw new Error("INVALID_AI_SERVICE_RESPONSE");
    return jsonNoStore(toBrowserUsage(validated.data));
  } catch (error) {
    return mapAiServiceError(error);
  }
}
