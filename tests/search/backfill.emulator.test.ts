import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { getAdminFirestore } from "../../lib/firebase/admin";
import { runBackfillResourceSearch } from "../../scripts/backfill-resource-search";
import { CURRENT_SEARCH_SCHEMA_VERSION } from "../../lib/search/normalize";

describe("runBackfillResourceSearch (Idempotency & Migration)", () => {
  const db = getAdminFirestore();

  beforeEach(async () => {
    const snapshot = await db.collection("resources").get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  });

  it("backfills un-backfilled resources and produces identical 0-update output on rerun", async () => {
    // Seed 2 resources missing search fields
    await db.collection("resources").doc("bf-1").set({
      title: "Punjab Physics Textbook",
      boardId: "punjab",
      classId: "class-9",
      status: "published",
      displayOrder: 1,
    });

    await db.collection("resources").doc("bf-2").set({
      title: "Federal Chemistry Notes",
      boardId: "federal",
      classId: "class-9",
      status: "published",
      displayOrder: 2,
    });

    // Seed 1 resource already fully backfilled
    await db.collection("resources").doc("bf-3").set({
      title: "Biology Manual",
      boardId: "punjab",
      classId: "class-9",
      status: "published",
      displayOrder: 3,
      searchTokens: ["biology", "manual"],
      searchPrefixes: ["bi", "bio", "biol", "biolo", "biolog", "biology", "ma", "man", "manu", "manua", "manual"],
      searchSchemaVersion: CURRENT_SEARCH_SCHEMA_VERSION,
    });

    // First backfill run
    const run1 = await runBackfillResourceSearch();
    expect(run1.totalDocs).toBe(3);
    expect(run1.updatedDocs).toBe(2);
    expect(run1.skippedDocs).toBe(1);

    // Verify backfilled document fields
    const doc1 = await db.collection("resources").doc("bf-1").get();
    const data1 = doc1.data()!;
    expect(data1.searchSchemaVersion).toBe(CURRENT_SEARCH_SCHEMA_VERSION);
    expect(data1.searchTokens).toEqual(["punjab", "physics", "textbook"]);
    expect(data1.searchPrefixes).toContain("phys");

    // Second backfill run (idempotency verification)
    const run2 = await runBackfillResourceSearch();
    expect(run2.totalDocs).toBe(3);
    expect(run2.updatedDocs).toBe(0); // 0 updates on already-backfilled data
    expect(run2.skippedDocs).toBe(3);
  });
});
