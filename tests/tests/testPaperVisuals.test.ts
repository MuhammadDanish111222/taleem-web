import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPaperPresentationModel } from "@/lib/tests/paper";
import { loadTestPaperVisual } from "@/lib/tests/visuals";

const paper = buildPaperPresentationModel({
  mode: "board", board_id: "punjab", class_id: "class-9", subject_id: "chemistry", duration_minutes: 60, total_marks: 2, seed: "seed",
  sections: [{ key: "A", title: "Short", type: "short", select_count: 1, attempt_count: 1, marks_each: 2, questions: [{ id: "123e4567-e89b-42d3-a456-426614174000", question: "Name the structure", marks: 2, chapter_id: "organic", difficulty: "medium", options: [], visuals: [{ visual_id: "benzene", visual_type: "diagram", title: "Benzene", description: null }] }] }],
});

describe("test paper visual loader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the authenticated same-origin BFF and accepts only image data", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Blob(["png"], { type: "image/png" }), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetch);
    const image = await loadTestPaperVisual(paper, paper.sections[0].questions[0].id, "benzene", async () => "firebase-token");
    expect(image.type).toBe("image/png");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/tests/visual?"), expect.objectContaining({ headers: { Authorization: "Bearer firebase-token" } }));
  });
});
