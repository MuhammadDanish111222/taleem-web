import "server-only";
import { callAiService } from "@/lib/internalApi/callAiService";

export type FeatureState = "enabled" | "coming_soon" | "disabled";

export async function resolveMultipleAskState(): Promise<FeatureState> {
  try {
    const result = await callAiService(
      "/api/v1/internal/feature-state/multiple_ask",
      "GET",
      null,
      "server-render",
      false,
      "feature_state_read"
    );
    const state = result?.state;
    if (state === "enabled" || state === "coming_soon" || state === "disabled") {
      return state;
    }
    return "disabled";
  } catch {
    return "disabled"; // fail closed on Railway outage or service error
  }
}
