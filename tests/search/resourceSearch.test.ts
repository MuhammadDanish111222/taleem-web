import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { searchResourceQuerySchema } from "../../lib/search/resourceSearch";

describe("searchResourceQuerySchema Zod validation", () => {
  it("validates mandatory boardId, classId, and query length bounds", () => {
    const valid = searchResourceQuerySchema.safeParse({
      boardId: "punjab",
      classId: "class-9",
      query: "physics",
    });
    expect(valid.success).toBe(true);

    const invalidShortQuery = searchResourceQuerySchema.safeParse({
      boardId: "punjab",
      classId: "class-9",
      query: "a", // <2 chars
    });
    expect(invalidShortQuery.success).toBe(false);

    const invalidMissingBoard = searchResourceQuerySchema.safeParse({
      boardId: "",
      classId: "class-9",
      query: "physics",
    });
    expect(invalidMissingBoard.success).toBe(false);
  });

  it("accepts optional subjectId and type parameters", () => {
    const validWithOptions = searchResourceQuerySchema.safeParse({
      boardId: "punjab",
      classId: "class-9",
      subjectId: "physics",
      type: "book",
      query: "motion",
      limit: 10,
    });
    expect(validWithOptions.success).toBe(true);
    if (validWithOptions.success) {
      expect(validWithOptions.data.subjectId).toBe("physics");
      expect(validWithOptions.data.type).toBe("book");
      expect(validWithOptions.data.limit).toBe(10);
    }
  });
});
