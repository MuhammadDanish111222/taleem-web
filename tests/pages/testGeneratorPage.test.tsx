// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TestGeneratorPage from "@/app/tests/generate/page";
import { resolveTestGenerationState } from "@/lib/features/testGenerationStateResolver";
import { notFound } from "next/navigation";

vi.mock("@/lib/features/testGenerationStateResolver", () => ({
  resolveTestGenerationState: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/components/tests/TestGeneratorClient", () => ({
  TestGeneratorClient: () => <div data-testid="test-generator-client">Test Generator Client</div>,
}));

describe("TestGeneratorPage lifecycle rendering", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders TestGeneratorClient when state is enabled", async () => {
    vi.mocked(resolveTestGenerationState).mockResolvedValueOnce("enabled");
    const Page = await TestGeneratorPage();
    render(Page);
    expect(screen.getByTestId("test-generator-client")).toBeDefined();
    expect(screen.queryByText("Coming Soon")).toBeNull();
  });

  it("renders Coming Soon placeholder without client controls when state is coming_soon", async () => {
    vi.mocked(resolveTestGenerationState).mockResolvedValueOnce("coming_soon");
    const Page = await TestGeneratorPage();
    render(Page);
    expect(screen.queryByTestId("test-generator-client")).toBeNull();
    expect(screen.getByText("Coming Soon")).toBeDefined();
  });

  it("calls notFound() when state is disabled", async () => {
    vi.mocked(resolveTestGenerationState).mockResolvedValueOnce("disabled");
    const Page = await TestGeneratorPage();
    expect(() => render(Page)).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
