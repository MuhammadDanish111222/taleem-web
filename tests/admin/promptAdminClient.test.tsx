// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PromptAdminClient from "@/app/admin/(protected)/ask/prompts/PromptAdminClient";
import { callAskAdmin } from "@/lib/client/askAdmin";

vi.mock("@/lib/client/askAdmin", () => ({ callAskAdmin: vi.fn() }));

describe("PromptAdminClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAskAdmin).mockResolvedValue({
      items: [{
        id: "11111111-1111-4111-8111-111111111111",
        prompt_key: "ask_grounded",
        answer_mode: "short",
        scope: { board_id: null, class_id: null, subject_id: null },
        version: 1,
        content: "A safe grounded prompt",
        status: "draft",
        created_by: "admin-1",
        created_at: "2026-07-31T00:00:00Z",
        activated_by: null,
        activated_at: null,
      }],
    });
  });

  it("clears a loaded prompt before a key, mode, or scope change can mutate it", async () => {
    render(<PromptAdminClient />);

    fireEvent.click(screen.getByRole("button", { name: "Load history" }));
    await waitFor(() => expect(callAskAdmin).toHaveBeenCalledTimes(1));

    const updateButton = screen.getByRole("button", { name: "Update selected draft" }) as HTMLButtonElement;
    await waitFor(() => expect(updateButton.disabled).toBe(false));

    fireEvent.change(screen.getByLabelText("Answer mode"), { target: { value: "long" } });

    await waitFor(() => expect(updateButton.disabled).toBe(true));
    expect((screen.getByLabelText("Prompt content") as HTMLTextAreaElement).value).toBe("");
  });
});
