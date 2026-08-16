import { describe, expect, it } from "vitest";
import {
  EMPTY_APPROVED_QUESTION,
  parseApprovedQuestion,
} from "@/components/admin/ask/ApprovedQuestionEditor";

function valid() {
  return {
    ...EMPTY_APPROVED_QUESTION,
    boardId: "punjab",
    classId: "class-9",
    subjectId: "physics",
    question: "What is force?",
    blocksJson: JSON.stringify([{ type: "paragraph", text: "Force is a push or pull." }]),
  };
}

describe("approved question editor contract", () => {
  it("fixes answer style to exam_style and accepts typed structured blocks", () => {
    const result = parseApprovedQuestion(valid());
    expect(result.answer_style).toBe("exam_style");
    expect(result.blocks).toEqual([{ type: "paragraph", text: "Force is a push or pull." }]);
  });

  it("requires exactly one correct MCQ option", () => {
    expect(() => parseApprovedQuestion({
      ...valid(),
      answerMode: "mcq",
      mcqOptionsJson: JSON.stringify([
        { key: "A", text: "Push", is_correct: true },
        { key: "B", text: "Pull", is_correct: true },
      ]),
    })).toThrow(/exactly one correct/i);
  });

  it("requires reviewed visual links to match ordered visual blocks", () => {
    expect(() => parseApprovedQuestion({
      ...valid(),
      blocksJson: JSON.stringify([{ type: "visual_ref", visual_id: "diagram-1" }]),
      answerVisualIds: "diagram-2",
    })).toThrow(/must match Answer Visual IDs/i);
  });

  it("rejects unsafe LaTeX commands before submission", () => {
    expect(() => parseApprovedQuestion({
      ...valid(),
      blocksJson: JSON.stringify([{ type: "equation", latex: "\\href{https://example.com}{x}" }]),
    })).toThrow(/unsafe command/i);
  });
});
