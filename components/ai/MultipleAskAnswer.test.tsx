// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MultipleAskItem } from "@/lib/api/multipleAsk";
import { MultipleAskAnswer } from "./MultipleAskAnswer";

function item(overrides: Partial<MultipleAskItem> = {}): MultipleAskItem {
  return {
    itemId: "item-1",
    itemIndex: 0,
    displayLabel: "1",
    sectionContext: null,
    itemStatus: "answered",
    normalizedQuestion: "internal normalized text",
    questionText: "What is graphite?",
    answerMode: "mcq",
    mcqOptions: [
      { label: "A", text: "Diamond" },
      { label: "B", text: "Graphite" },
    ],
    unclearReason: null,
    extractionVersion: 1,
    correctionVersion: 0,
    correctedAt: null,
    result: {
      answerSource: "general_knowledge",
      blocks: [],
      citations: [],
      visualIds: [],
      approvedRevisionId: null,
      topicNames: [],
      visuals: [],
      mcqResult: {
        selectedOption: "B",
        correctAnswerText: "Graphite",
        explanation: "It conducts electricity.",
      },
    },
    ...overrides,
  };
}

describe("MultipleAskAnswer", () => {
  afterEach(cleanup);

  it("keeps MCQs structured and marks the selected dynamic option accessibly", () => {
    render(<MultipleAskAnswer item={item()} jobId="job-1" getToken={vi.fn()} />);
    expect(screen.getByText("Graphite")).toBeInTheDocument();
    expect(screen.getByLabelText("Correct option")).toBeInTheDocument();
    expect(screen.getByText("It conducts electricity.")).toBeInTheDocument();
    expect(screen.queryByText("Not from book")).not.toBeInTheDocument();
  });

  it("renders a zero-option MCQ direct answer", () => {
    render(
      <MultipleAskAnswer
        item={item({ mcqOptions: [], result: { ...item().result!, mcqResult: { selectedOption: null, correctAnswerText: "Plasma", explanation: "It is ionized matter." } } })}
        jobId="job-1"
        getToken={vi.fn()}
      />,
    );
    expect(screen.getByText("Plasma")).toBeInTheDocument();
  });

  it("uses clean book and general provenance for written answers", () => {
    const { rerender } = render(
      <MultipleAskAnswer
        item={item({ answerMode: "long", mcqOptions: [], result: { ...item().result!, answerSource: "syllabus_grounded", topicNames: ["Allotropy", "Carbon"], mcqResult: null, blocks: [{ type: "paragraph", text: "Carbon has allotropes." }] } })}
        jobId="job-1"
        getToken={vi.fn()}
      />,
    );
    expect(screen.getByText("Answer from book · Allotropy · Carbon")).toBeInTheDocument();
    rerender(
      <MultipleAskAnswer
        item={item({ answerMode: "short", mcqOptions: [], result: { ...item().result!, mcqResult: null, blocks: [{ type: "paragraph", text: "A general answer." }] } })}
        jobId="job-1"
        getToken={vi.fn()}
      />,
    );
    expect(screen.getByText("Not from book")).toBeInTheDocument();
  });
});
