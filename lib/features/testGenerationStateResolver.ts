import "server-only";
import { signTestGeneratorJwt } from "@/lib/internalAuth/signInternalJwt";
import { callTestGeneratorEdge } from "@/lib/tests/edgeClient";

export type FeatureState = "enabled" | "coming_soon" | "disabled";

export async function resolveTestGenerationState(): Promise<FeatureState> {
  try {
    const requestId = "server-render-req";
    const token = await signTestGeneratorJwt("server-render", requestId);
    const result = (await callTestGeneratorEdge(token, {
      operation: "feature_state",
      seed: requestId,
    })) as { state?: unknown };
    const state = result?.state;
    if (state === "enabled" || state === "coming_soon" || state === "disabled") {
      return state;
    }
    return "enabled"; // fail open for page visibility (Module 6 Railway independence)
  } catch {
    return "enabled"; // fail open for page visibility
  }
}
