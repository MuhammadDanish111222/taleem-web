// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import MultipleAskPage from "@/app/ai/multiple-ask/page";
import { resolveMultipleAskState } from "@/lib/features/multipleAskStateResolver";
import { notFound } from "next/navigation";

vi.mock("@/lib/features/multipleAskStateResolver", () => ({
  resolveMultipleAskState: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/components/ai/MultipleAskClient", () => ({
  MultipleAskClient: () => <div data-testid="multiple-ask-client">Multiple Ask Client</div>,
}));

describe("MultipleAskPage lifecycle rendering", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders MultipleAskClient when state is enabled", async () => {
    vi.mocked(resolveMultipleAskState).mockResolvedValueOnce("enabled");
    const Page = await MultipleAskPage();
    render(Page);
    expect(screen.getByTestId("multiple-ask-client")).toBeDefined();
    expect(screen.queryByText("Coming Soon")).toBeNull();
  });

  it("renders Coming Soon placeholder without client controls when state is coming_soon", async () => {
    vi.mocked(resolveMultipleAskState).mockResolvedValueOnce("coming_soon");
    const Page = await MultipleAskPage();
    render(Page);
    expect(screen.queryByTestId("multiple-ask-client")).toBeNull();
    expect(screen.getByText("Coming Soon")).toBeDefined();
  });

  it("calls notFound() when state is disabled", async () => {
    vi.mocked(resolveMultipleAskState).mockResolvedValueOnce("disabled");
    const Page = await MultipleAskPage();
    expect(() => render(Page)).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
