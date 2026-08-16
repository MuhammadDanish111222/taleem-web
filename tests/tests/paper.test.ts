import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { balancedChapterDistribution, buildCustomSelectionSpec, buildPaperPresentationModel, safePaperFilename, testPaperResponseSchema } from "@/lib/tests/paper";
import { generatePaperPdf } from "@/lib/tests/pdf";

const response = {
  mode: "custom" as const, board_id: "punjab", class_id: "class-9", subject_id: "chemistry", duration_minutes: 120, total_marks: 18, seed: "seed-1",
  sections: [
    { key: "A", title: "Multiple Choice Questions", type: "mcq" as const, select_count: 2, attempt_count: 2, marks_each: 1, questions: [{ id: "q1", question: "Which particle has a negative charge?", marks: 1, chapter_id: "atoms", difficulty: "easy" as const, options: [{ key: "A", text: "Electron" }, { key: "B", text: "Proton" }], visuals: [] }] },
    { key: "B", title: "Short Questions", type: "short" as const, select_count: 2, attempt_count: 1, marks_each: 2, questions: [{ id: "q2", question: "Define an atom.", marks: 2, chapter_id: "atoms", difficulty: "medium" as const, options: [], visuals: [{ visual_id: "v1", visual_type: "image", title: "Atomic structure", description: "A reviewed diagram" }] }] },
  ],
};

describe("student test paper helpers", () => {
  it("builds a deterministic balanced Stage 2 custom selection spec", () => {
    expect(balancedChapterDistribution(["c1", "c2", "c3"], 10)).toEqual({ c1: 4, c2: 3, c3: 3 });
    const spec = buildCustomSelectionSpec({ chapterIds: ["c1", "c2"], mcqCount: 10, shortCount: 5, longCount: 2 });
    expect(spec.sections.map((section) => [section.type, section.marks_each, section.select_count, section.attempt_count])).toEqual([["mcq", 1, 10, 10], ["short", 2, 5, 5], ["long", 4, 2, 2]]);
    expect(spec.sections[0].chapter_distribution).toEqual({ c1: 5, c2: 5 });
  });

  it("rejects invalid custom configuration before a request", () => {
    expect(() => buildCustomSelectionSpec({ chapterIds: [], mcqCount: 1, shortCount: 0, longCount: 0 })).toThrow();
    expect(() => buildCustomSelectionSpec({ chapterIds: ["c1"], mcqCount: -1, shortCount: 0, longCount: 0 })).toThrow();
    expect(() => buildCustomSelectionSpec({ chapterIds: ["c1"], mcqCount: 0, shortCount: 0, longCount: 0 })).toThrow();
  });

  it("rejects unexpected answer data from the paper-safe response", () => {
    expect(testPaperResponseSchema.safeParse(response).success).toBe(true);
    expect(testPaperResponseSchema.safeParse({ ...response, sections: [{ ...response.sections[0], questions: [{ ...response.sections[0].questions[0], correct_option: "A" }] }] }).success).toBe(false);
    expect(testPaperResponseSchema.safeParse({ ...response, sections: [{ ...response.sections[0], questions: [{ ...response.sections[0].questions[0], answer_visuals: [{ visual_id: "private-answer-image" }] }] }] }).success).toBe(false);
  });

  it("keeps section order, numbering, attempt rules, options, visuals and filename in one model", () => {
    const paper = buildPaperPresentationModel(response);
    expect(paper.sections.map((section) => section.key)).toEqual(["A", "B"]);
    expect(paper.sections.flatMap((section) => section.questions.map((question) => question.number))).toEqual([1, 2]);
    expect(paper.sections[0].instruction).toBe("Attempt all questions.");
    expect(paper.sections[1].instruction).toBe("Attempt 1 question.");
    expect(paper.sections[0].questions[0].options.map((option) => option.key)).toEqual(["A", "B"]);
    expect(paper.sections[1].questions[0].visuals[0].visual_id).toBe("v1");
    expect(safePaperFilename({ ...response, board_id: "Punjab / Board" })).toBe("punjab-board-class-9-chemistry-custom-paper.pdf");
  });

  it("generates a non-empty client-side A4 PDF", async () => {
    const blob = await generatePaperPdf(buildPaperPresentationModel(response));
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
    const document = await PDFDocument.load(await blob.arrayBuffer());
    expect(document.getPage(0).getSize()).toMatchObject({ width: 595.28, height: 841.89 });
  });

  it("embeds a permitted question visual in the client-side PDF", async () => {
    const image = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+qI9N9wAAAABJRU5ErkJggg==", "base64"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(image, { headers: { "content-type": "image/png" } })));
    try {
      const blob = await generatePaperPdf(buildPaperPresentationModel(response), async () => "firebase-token");
      expect(blob.size).toBeGreaterThan(900);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
