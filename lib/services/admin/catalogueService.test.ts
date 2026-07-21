import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { CatalogueService, DomainError } from "./catalogueService";
import { CatalogueRepository } from "../../repositories/firestore/catalogueRepository";
import { ReorderMutation } from "../../validation/catalogue";

// Mock the repository
vi.mock("../../repositories/firestore/catalogueRepository", () => {
  return {
    CatalogueRepository: class {
      getCollectionRefForLevel = vi.fn().mockReturnValue({
        doc: vi.fn(),
      });
      runTransaction = vi.fn().mockImplementation(async (callback) => {
        // Mock a transaction object
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({
            docs: [
              { id: "class-9", data: () => ({ display_order: 0 }) },
              { id: "class-10", data: () => ({ display_order: 1 }) },
            ]
          }),
          update: vi.fn(),
        };
        return callback(mockTransaction);
      });
    },
  };
});

describe("CatalogueService Reorder Logic", () => {
  it("throws VALIDATION error if orderedIds length doesn't match db sibling count", async () => {
    const service = new CatalogueService();
    const mutation: ReorderMutation = {
      operation: "reorder",
      level: "class",
      boardId: "punjab",
      orderedIds: ["class-9"], // missing class-10
    };

    await expect(service.handleMutation(mutation)).rejects.toThrowError(
      new DomainError("VALIDATION", "Expected exactly 2 IDs, but got 1")
    );
  });

  it("throws VALIDATION error if orderedIds contains duplicates", async () => {
    const service = new CatalogueService();
    const mutation: ReorderMutation = {
      operation: "reorder",
      level: "class",
      boardId: "punjab",
      orderedIds: ["class-9", "class-9"], 
    };

    await expect(service.handleMutation(mutation)).rejects.toThrowError(
      new DomainError("VALIDATION", "Duplicate IDs found in reorder payload")
    );
  });

  it("throws VALIDATION error if orderedIds contains unknown ID", async () => {
    const service = new CatalogueService();
    const mutation: ReorderMutation = {
      operation: "reorder",
      level: "class",
      boardId: "punjab",
      orderedIds: ["class-9", "class-11"], // class-11 is unknown
    };

    await expect(service.handleMutation(mutation)).rejects.toThrowError(
      new DomainError("VALIDATION", "ID 'class-11' is not a valid sibling in this parent")
    );
  });

  it("succeeds when orderedIds matches exactly", async () => {
    const service = new CatalogueService();
    const mutation: ReorderMutation = {
      operation: "reorder",
      level: "class",
      boardId: "punjab",
      orderedIds: ["class-10", "class-9"], // Valid reorder
    };

    await expect(service.handleMutation(mutation)).resolves.toBeUndefined();
  });
});
