import { NextRequest } from "next/server";
import { authenticateAskRequest, jsonNoStore, validateSameOrigin } from "@/lib/ai/bff";
import { isMultipleAskRun1Enabled } from "@/lib/config/multipleAsk";
import { callAiService } from "@/lib/internalApi/callAiService";
import { mapMultipleAskServiceError } from "@/lib/multipleAsk/bff";
import { multipleAskStatusInternalResponseSchema, toBrowserStatusResponse } from "@/lib/multipleAsk/contracts";

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  if (!isMultipleAskRun1Enabled()) return jsonNoStore({ error: { code: "NOT_FOUND" } }, 404);
  if (!validateSameOrigin(request)) return jsonNoStore({ error: { code: "INVALID_ORIGIN" } }, 403);
  const identity = await authenticateAskRequest(request);
  if (!identity.ok) return identity.response;
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return jsonNoStore({ error: { code: "INVALID_REQUEST" } }, 400);
  try {
    const upstream = await callAiService(`/api/v1/internal/multiple-ask/jobs/${jobId}`, "GET", undefined, identity.uid, false, "multiple_ask", { accountTier: identity.accountTier });
    const validated = multipleAskStatusInternalResponseSchema.safeParse(upstream);
    if (!validated.success) throw new Error("INVALID_AI_SERVICE_RESPONSE");
    return jsonNoStore(toBrowserStatusResponse(validated.data));
  } catch (error) { return mapMultipleAskServiceError(error); }
}
