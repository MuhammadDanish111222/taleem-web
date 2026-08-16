import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMultipleAskState } from "@/lib/features/multipleAskStateResolver";
import { resolveTestGenerationState } from "@/lib/features/testGenerationStateResolver";
import { callAiService } from "@/lib/internalApi/callAiService";
import { callTestGeneratorEdge } from "@/lib/tests/edgeClient";

vi.mock("@/lib/internalApi/callAiService", () => ({ callAiService: vi.fn() }));
vi.mock("@/lib/internalAuth/signInternalJwt", () => ({
  signTestGeneratorJwt: vi.fn().mockResolvedValue("mock-jwt"),
}));
vi.mock("@/lib/tests/edgeClient", () => ({ callTestGeneratorEdge: vi.fn() }));

describe("Feature Lifecycle Resolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveMultipleAskState", () => {
    it("resolves enabled state from AI service", async () => {
      vi.mocked(callAiService).mockResolvedValueOnce({ state: "enabled" });
      const state = await resolveMultipleAskState();
      expect(state).toBe("enabled");
      expect(callAiService).toHaveBeenCalledWith(
        "/api/v1/internal/feature-state/multiple_ask",
        "GET",
        null,
        "server-render",
        false,
        "feature_state_read"
      );
    });

    it("resolves coming_soon state from AI service", async () => {
      vi.mocked(callAiService).mockResolvedValueOnce({ state: "coming_soon" });
      const state = await resolveMultipleAskState();
      expect(state).toBe("coming_soon");
    });

    it("resolves disabled state from AI service", async () => {
      vi.mocked(callAiService).mockResolvedValueOnce({ state: "disabled" });
      const state = await resolveMultipleAskState();
      expect(state).toBe("disabled");
    });

    it("fails closed to disabled when AI service throws", async () => {
      vi.mocked(callAiService).mockRejectedValueOnce(new Error("Railway unavailable"));
      const state = await resolveMultipleAskState();
      expect(state).toBe("disabled");
    });

    it("fails closed to disabled on unexpected response payload", async () => {
      vi.mocked(callAiService).mockResolvedValueOnce({ state: "corrupted_state" });
      const state = await resolveMultipleAskState();
      expect(state).toBe("disabled");
    });
  });

  describe("resolveTestGenerationState", () => {
    it("resolves enabled state from Edge", async () => {
      vi.mocked(callTestGeneratorEdge).mockResolvedValueOnce({ state: "enabled" });
      const state = await resolveTestGenerationState();
      expect(state).toBe("enabled");
      expect(callTestGeneratorEdge).toHaveBeenCalledWith(
        "mock-jwt",
        expect.objectContaining({ operation: "feature_state" })
      );
    });

    it("resolves coming_soon state from Edge", async () => {
      vi.mocked(callTestGeneratorEdge).mockResolvedValueOnce({ state: "coming_soon" });
      const state = await resolveTestGenerationState();
      expect(state).toBe("coming_soon");
    });

    it("resolves disabled state from Edge", async () => {
      vi.mocked(callTestGeneratorEdge).mockResolvedValueOnce({ state: "disabled" });
      const state = await resolveTestGenerationState();
      expect(state).toBe("disabled");
    });

    it("fails open to enabled for page visibility when Edge throws", async () => {
      vi.mocked(callTestGeneratorEdge).mockRejectedValueOnce(new Error("Supabase unavailable"));
      const state = await resolveTestGenerationState();
      expect(state).toBe("enabled");
    });

    it("fails open to enabled on unexpected response payload", async () => {
      vi.mocked(callTestGeneratorEdge).mockResolvedValueOnce({ state: "invalid_state" });
      const state = await resolveTestGenerationState();
      expect(state).toBe("enabled");
    });
  });
});
