// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestGeneratorClient } from "@/components/tests/TestGeneratorClient";
import { useCatalogueSelection } from "@/lib/state/catalogueSelection";

vi.mock("@/lib/auth/useAuth", () => ({ useAuth: () => ({ loading: false, user: { getIdToken: vi.fn().mockResolvedValue("firebase-token") }, signInGoogle: vi.fn() }) }));
vi.mock("@/components/selectors/BoardSelector", () => ({ BoardSelector: () => <span>Board selector</span> }));
vi.mock("@/components/selectors/ClassSelector", () => ({ ClassSelector: () => <span>Class selector</span> }));
vi.mock("@/components/selectors/SubjectSelector", () => ({ SubjectSelector: () => <span>Subject selector</span> }));
vi.mock("@/lib/hooks/useCatalogueOptions", () => ({ useCatalogueOptions: () => ({ data: [{ slug: "atoms", chapter_number: 1, title: "Atoms", active: true, display_order: 1 }], loading: false, error: null, retry: vi.fn() }) }));
vi.mock("@/lib/firestore/catalogue", () => ({ getChapters: vi.fn() }));

const paper = { mode: "board", board_id: "punjab", class_id: "class-9", subject_id: "physics", duration_minutes: 120, total_marks: 1, seed: "seed", sections: [{ key: "A", title: "MCQs", type: "mcq", select_count: 1, attempt_count: 1, marks_each: 1, questions: [{ id: "q1", question: "A question", marks: 1, chapter_id: "atoms", difficulty: "easy", options: [{ key: "A", text: "Option" }], visuals: [] }] }] };

describe("TestGeneratorClient", () => {
  beforeEach(() => {
    useCatalogueSelection.getState().hydrate({ boardId: "punjab", classId: "class-9", subjectId: "physics", chapterId: null });
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("123e4567-e89b-42d3-a456-426614174000") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => paper }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); useCatalogueSelection.getState().resetAll(); });

  it("defaults to Board Paper Pattern and sends Firebase-authenticated same-origin board request", async () => {
    render(<TestGeneratorClient />);
    expect(screen.getByRole("button", { name: "Board Paper Pattern" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Generate Paper" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/tests/generate", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer firebase-token" }) }));
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ mode: "board", boardId: "punjab", classId: "class-9", subjectId: "physics" });
  });

  it("builds and sends the existing custom selection spec", async () => {
    render(<TestGeneratorClient />);
    fireEvent.click(screen.getByRole("button", { name: "Custom Paper" }));
    fireEvent.click(screen.getByLabelText("1. Atoms"));
    fireEvent.click(screen.getByRole("button", { name: "Generate Paper" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const request = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(request.mode).toBe("custom");
    expect(request.spec.sections).toEqual(expect.arrayContaining([expect.objectContaining({ type: "mcq", marks_each: 1, attempt_count: 10, chapter_distribution: { atoms: 10 } }), expect.objectContaining({ type: "short", marks_each: 2 }), expect.objectContaining({ type: "long", marks_each: 4 })]));
  });

  it("prevents duplicate in-flight requests", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; }));
    render(<TestGeneratorClient />);
    const generate = screen.getByRole("button", { name: "Generate Paper" });
    fireEvent.click(generate);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(generate);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve({ ok: true, json: async () => paper } as Response);
    await screen.findByRole("button", { name: "Download PDF" });
  });
});
