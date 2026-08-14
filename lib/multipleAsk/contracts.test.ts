import { describe, expect, it } from "vitest";

import { multipleAskCorrectionBrowserRequestSchema } from "./contracts";

const base = {
  requestId: "00000000-0000-4000-8000-000000000001",
  questionText: "Select one.",
  answerMode: "mcq" as const,
};
const options = (labels: string) =>
  labels.split("").map((label) => ({ label, text: `option ${label}` }));

describe("Multiple Ask Stage 4 correction options", () => {
  it.each(["", "AB", "ABC", "ABCD", "ABCDE"])(
    "accepts MCQ options %s",
    (labels) => {
      expect(
        multipleAskCorrectionBrowserRequestSchema.safeParse({
          ...base,
          mcqOptions: options(labels),
        }).success,
      ).toBe(true);
    },
  );

  it.each(["A", "AC", "ABBC"])("rejects malformed options %s", (labels) => {
    expect(
      multipleAskCorrectionBrowserRequestSchema.safeParse({
        ...base,
        mcqOptions: options(labels),
      }).success,
    ).toBe(false);
  });

  it("rejects options for non-MCQ corrections", () => {
    expect(
      multipleAskCorrectionBrowserRequestSchema.safeParse({
        ...base,
        answerMode: "short",
        mcqOptions: options("AB"),
      }).success,
    ).toBe(false);
    expect(
      multipleAskCorrectionBrowserRequestSchema.safeParse({
        ...base,
        answerMode: "long",
        mcqOptions: options("AB"),
      }).success,
    ).toBe(false);
  });
});
