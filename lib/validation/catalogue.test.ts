import { describe, it, expect } from "vitest";
import { catalogueMutationSchema } from "./catalogue";

describe("Catalogue Validation Schema", () => {
  it("rejects forbidden fields natively (active, display_order, path)", () => {
    const payload = {
      operation: "create",
      level: "board",
      boardId: "punjab",
      name: "Punjab Board",
      active: true, // Forbidden
      display_order: 1, // Forbidden
      path: "some/path", // Forbidden
    };

    const result = catalogueMutationSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errorKeys = result.error.errors.map(e => (e as any).keys || (e.path)).flat();
      expect(result.error.errors[0].message).toContain("Unrecognized key(s)");
    }
  });

  it("accepts valid create payload", () => {
    const payload = {
      operation: "create",
      level: "board",
      boardId: "punjab",
      name: "Punjab Board",
    };

    const result = catalogueMutationSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects missing immutable identifiers (slug) during update", () => {
    const payload = {
      operation: "update",
      level: "board",
      // boardId missing
      name: "Updated Name",
    };

    const result = catalogueMutationSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
  
  it("rejects missing new parent IDs (cannot move nodes)", () => {
    const payload = {
      operation: "update",
      level: "class",
      boardId: "punjab",
      classId: "class-9",
      newBoardId: "federal", // Unrecognized key
      name: "Class 9 Updated",
    };

    const result = catalogueMutationSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("validates reorder payload correctly", () => {
    const payload = {
      operation: "reorder",
      level: "class",
      boardId: "punjab",
      orderedIds: ["class-9", "class-10"],
    };

    const result = catalogueMutationSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects reorder payload with missing orderedIds", () => {
    const payload = {
      operation: "reorder",
      level: "class",
      boardId: "punjab",
      orderedIds: [], // Min 1 length
    };

    const result = catalogueMutationSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
