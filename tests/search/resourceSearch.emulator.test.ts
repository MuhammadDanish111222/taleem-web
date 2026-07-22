import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { getAdminFirestore } from "../../lib/firebase/admin";
import { searchPublicResources } from "../../lib/search/resourceSearch";
import { computeSearchFields, CURRENT_SEARCH_SCHEMA_VERSION } from "../../lib/search/normalize";
import * as hierarchyService from "../../lib/services/catalogue/catalogueHierarchyService";

// Mock hierarchy validation so test setup doesn't require seeding full catalogue tree
vi.mock("../../lib/services/catalogue/catalogueHierarchyService", () => ({
  validateCatalogueHierarchy: vi.fn().mockResolvedValue(undefined),
}));

describe("searchPublicResources (Emulator Integration)", () => {
  const db = getAdminFirestore();

  beforeEach(async () => {
    // Clear resources collection in emulator
    const snapshot = await db.collection("resources").get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  });

  it("finds published resource by exact token match", async () => {
    const searchFields = computeSearchFields("Physics Fundamentals");
    const ref = db.collection("resources").doc("res-1");
    await ref.set({
      type: "book",
      title: "Physics Fundamentals",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "physics",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 1,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...searchFields,
      schemaVersion: 1,
    });

    const result = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      query: "physics",
    });

    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe("res-1");
    expect(result.data[0].title).toBe("Physics Fundamentals");
  });

  it("finds published resource by prefix match", async () => {
    const searchFields = computeSearchFields("Chemistry Principles");
    await db.collection("resources").doc("res-2").set({
      type: "book",
      title: "Chemistry Principles",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "chemistry",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 1,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...searchFields,
      schemaVersion: 1,
    });

    const result = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      query: "chem", // prefix for chemistry
    });

    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe("res-2");
  });

  it("handles mixed case, punctuation, and zero-token inputs", async () => {
    const searchFields = computeSearchFields("Mathematics: Algebra & Geometry!");
    await db.collection("resources").doc("res-3").set({
      type: "book",
      title: "Mathematics: Algebra & Geometry!",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "math",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 1,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...searchFields,
      schemaVersion: 1,
    });

    // Mixed-case with punctuation search query
    const result = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      query: "ALGEBRA!!",
    });
    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe("res-3");

    // Punctuation-only search query short-circuits to empty array
    const zeroTokenResult = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      query: "!! ?? --",
    });
    expect(zeroTokenResult.data).toEqual([]);
  });

  it("enforces multiword AND verification (filters candidates matching primary word but missing secondary word)", async () => {
    // Candidate 1: matches "physics" and "motion"
    const sf1 = computeSearchFields("Physics Laws of Motion");
    await db.collection("resources").doc("res-physics-motion").set({
      type: "book",
      title: "Physics Laws of Motion",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "physics",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 1,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...sf1,
      schemaVersion: 1,
    });

    // Candidate 2: matches "physics" but NOT "motion" (contains "astronomy")
    const sf2 = computeSearchFields("Physics Astronomy Guide");
    await db.collection("resources").doc("res-physics-astro").set({
      type: "book",
      title: "Physics Astronomy Guide",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "physics",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 2,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...sf2,
      schemaVersion: 1,
    });

    const result = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      query: "physics motion",
    });

    // Proves AND verification filtered out Candidate 2 even though it matched the primary token "physics"
    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe("res-physics-motion");
  });

  it("never returns non-published resources or resources from wrong board/class", async () => {
    const sf = computeSearchFields("Biology Textbook");

    // Draft status
    await db.collection("resources").doc("res-draft").set({
      type: "book",
      title: "Biology Textbook",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "biology",
      chapterId: null,
      status: "draft",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 1,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...sf,
      schemaVersion: 1,
    });

    // Hidden status
    await db.collection("resources").doc("res-hidden").set({
      type: "book",
      title: "Biology Textbook",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "biology",
      chapterId: null,
      status: "hidden",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 2,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...sf,
      schemaVersion: 1,
    });

    // Different board
    await db.collection("resources").doc("res-other-board").set({
      type: "book",
      title: "Biology Textbook",
      boardId: "federal",
      classId: "class-9",
      subjectId: "biology",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 3,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...sf,
      schemaVersion: 1,
    });

    const result = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      query: "biology",
    });

    expect(result.data.length).toBe(0);
  });

  it("applies optional server-side subjectId and type filters correctly", async () => {
    const sf = computeSearchFields("Computer Science Guide");

    // Book type in CS
    await db.collection("resources").doc("res-cs-book").set({
      type: "book",
      title: "Computer Science Guide",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "cs",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 1,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...sf,
      schemaVersion: 1,
    });

    // Note type in CS
    await db.collection("resources").doc("res-cs-note").set({
      type: "note",
      title: "Computer Science Guide",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "cs",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 2,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...sf,
      schemaVersion: 1,
    });

    // Search with type="book" filter
    const bookResult = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      type: "book",
      query: "computer",
    });
    expect(bookResult.data.length).toBe(1);
    expect(bookResult.data[0].id).toBe("res-cs-book");

    // Search with subjectId="cs" & type="note"
    const noteResult = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      subjectId: "cs",
      type: "note",
      query: "computer",
    });
    expect(noteResult.data.length).toBe(1);
    expect(noteResult.data[0].id).toBe("res-cs-note");
  });

  it("ranks exact token matches above prefix matches deterministically", async () => {
    // Candidate A: prefix match for "phys" ("physical science")
    const sfA = computeSearchFields("Physical Science");
    await db.collection("resources").doc("res-prefix").set({
      type: "book",
      title: "Physical Science",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "physics",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 1,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...sfA,
      schemaVersion: 1,
    });

    // Candidate B: exact match for "phys" ("Phys Notes")
    const sfB = computeSearchFields("Phys Notes");
    await db.collection("resources").doc("res-exact").set({
      type: "book",
      title: "Phys Notes",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "physics",
      chapterId: null,
      status: "published",
      currentVersionId: "v1",
      language: "en",
      curriculumVersion: "1.0",
      displayOrder: 2,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
      ...sfB,
      schemaVersion: 1,
    });

    const result = await searchPublicResources({
      boardId: "punjab",
      classId: "class-9",
      query: "phys",
    });

    expect(result.data.length).toBe(2);
    expect(result.data[0].id).toBe("res-exact"); // Exact match ranked first despite higher displayOrder
    expect(result.data[1].id).toBe("res-prefix");
  });
});
