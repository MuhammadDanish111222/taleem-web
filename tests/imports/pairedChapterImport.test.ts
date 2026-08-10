import { describe, expect, it } from "vitest";
import { PairedImportError, VisualCard, enrichExternalChunks, sourceHash, validateExternalJsonl } from "../../lib/imports/pairedChapterImport";

const scope = { board_id: "fbise", class_id: "class-9", subject_id: "chemistry" };
function mockCards(): Map<string, VisualCard> {
  return new Map([
    ["Unit1_Visual_001", { visualId: "Unit1_Visual_001", title: "Blue half", description: "Cropped blue image", originalPage: "1", imageHash: "hash123", image: Buffer.from("img"), mimeType: "image/png" }],
  ]);
}
function external(visuals: any[] = [{ visual_id: "Unit1_Visual_001", visual_type: "figure", title: "Blue half", description: "Cropped blue image" }]) {
  return JSON.stringify({
    board_id: "FBISE", class_id: "Class-9", subject_id: "Chemistry", chapter_id: "ch01",
    topic_no: "1.1", topic_title: "Atomic Structure", chunk_order: 0,
    chunk_text: "Matter consists of atoms.", expected_questions: ["What is an atom?"], visuals,
  });
}

describe("paired JSONL validation and enrichment", () => {
  it("validates valid external JSONL and normalizes case/strings", () => {
    const chunks = validateExternalJsonl(external(), scope);
    expect(chunks.length).toBe(1);
  });
  it("accepts empty visuals and reports unused DOCX assets", async () => {
    const cards = mockCards();
    cards.set("Unused_Visual_002", { visualId: "Unused_Visual_002", title: "Title", description: "Desc", originalPage: "2", imageHash: "h2", image: Buffer.from("img"), mimeType: "image/png" });
    const chunks = validateExternalJsonl(external(), scope);
    const result = enrichExternalChunks(chunks, cards, new Map([["Unit1_Visual_001", "key-123"]]));
    expect(result.unused).toEqual(["Unused_Visual_002"]);
  });
  it("uses a semantic hash that ignores JSON formatting but changes with persisted content", async () => {
    const cards = mockCards();
    const compact = validateExternalJsonl(external(), scope);
    const formatted = validateExternalJsonl(`${JSON.stringify(JSON.parse(external()), null, 2).replace(/\n/g, "")}\n`, scope);
    expect(sourceHash(compact, cards, scope)).toBe(sourceHash(formatted, cards, scope));
    const changed = validateExternalJsonl(external(), scope);
    changed[0].chunk_text = "Changed text";
    expect(sourceHash(changed, cards, scope)).not.toBe(sourceHash(compact, cards, scope));
  });
  it("reuses existing chapter visual storage keys when DOCX is omitted", async () => {
    const existing = new Map([
      ["ch01_atom", { visual_id: "ch01_atom", visual_type: "figure", title: "Atom diagram", description: "Atomic structure diagram", storage_key: "drive-key-atom-123", review_status: "approved", display_policy: "llm_decide" }],
    ]);
    const jsonl = JSON.stringify({
      board_id: "FBISE", class_id: "Class-9", subject_id: "Chemistry", chapter_id: "ch01",
      topic_no: "1.1", topic_title: "Atomic Structure", chunk_order: 0,
      chunk_text: "Matter consists of atoms.", expected_questions: ["What is an atom?"],
      visuals: [{ visual_id: "ch01_atom", visual_type: "figure", title: "Atom diagram", description: "Atomic structure diagram" }],
    });
    const chunks = validateExternalJsonl(jsonl, scope);
    const hash = sourceHash(chunks, new Map(), scope, existing);
    expect(hash).toBeTruthy();
    const enrichedResult = enrichExternalChunks(chunks, new Map(), new Map(), existing);
    expect(enrichedResult.enriched).toContain("drive-key-atom-123");
  });
  it("unchanged approved visual remains approved after JSONL-only replacement", () => {
    const existing = new Map([
      ["v1", { visual_id: "v1", visual_type: "diagram", title: "Cell Diagram", description: "Eukaryotic cell structure", storage_key: "drive-key-v1", review_status: "approved", display_policy: "always_show" }],
    ]);
    const chunks = validateExternalJsonl(JSON.stringify({
      board_id: "FBISE", class_id: "Class-9", subject_id: "Chemistry", chapter_id: "ch01",
      topic_no: "1.1", topic_title: "Cells", chunk_order: 0,
      chunk_text: "Cells are the basic unit of life.", expected_questions: ["What is a cell?"],
      visuals: [{ visual_id: "v1", visual_type: "diagram", title: "Cell Diagram", description: "Eukaryotic cell structure" }],
    }), scope);
    const result = enrichExternalChunks(chunks, new Map(), new Map(), existing);
    const enrichedRow = JSON.parse(result.enriched);
    const visual = enrichedRow.visuals[0];
    expect(visual.storage_key).toBe("drive-key-v1");
    expect(visual.review_status).toBe("approved");
    expect(visual.display_policy).toBe("always_show");
    expect(visual.title).toBe("Cell Diagram");
    expect(visual.description).toBe("Eukaryotic cell structure");
  });
  it("changed title/description uses JSONL metadata with existing image, still approved", () => {
    const existing = new Map([
      ["v1", { visual_id: "v1", visual_type: "diagram", title: "Old Title", description: "Old Description", storage_key: "drive-key-v1", review_status: "approved", display_policy: "llm_decide" }],
    ]);
    const chunks = validateExternalJsonl(JSON.stringify({
      board_id: "FBISE", class_id: "Class-9", subject_id: "Chemistry", chapter_id: "ch01",
      topic_no: "1.1", topic_title: "Cells", chunk_order: 0,
      chunk_text: "Cells are the basic unit of life.", expected_questions: ["What is a cell?"],
      visuals: [{ visual_id: "v1", visual_type: "diagram", title: "New Title", description: "New Description" }],
    }), scope);
    const result = enrichExternalChunks(chunks, new Map(), new Map(), existing);
    const enrichedRow = JSON.parse(result.enriched);
    const visual = enrichedRow.visuals[0];
    expect(visual.storage_key).toBe("drive-key-v1");
    expect(visual.title).toBe("New Title");
    expect(visual.description).toBe("New Description");
    expect(visual.review_status).toBe("approved");
    expect(visual.display_policy).toBe("llm_decide");
  });
  it("DOCX visual gets review_status=approved and display_policy=llm_decide", () => {
    const cards = new Map([
      ["v_new", { visualId: "v_new", title: "New Chart", description: "Bar chart of results", originalPage: "3", imageHash: "abc123", image: Buffer.from("img"), mimeType: "image/png" as const }],
    ]);
    const chunks = validateExternalJsonl(JSON.stringify({
      board_id: "FBISE", class_id: "Class-9", subject_id: "Chemistry", chapter_id: "ch01",
      topic_no: "1.1", topic_title: "Results", chunk_order: 0,
      chunk_text: "The experiment showed...", expected_questions: ["What were the results?"],
      visuals: [{ visual_id: "v_new", visual_type: "graph", title: "New Chart", description: "Bar chart of results" }],
    }), scope);
    const result = enrichExternalChunks(chunks, cards, new Map([["v_new", "drive-key-new"]]));
    const enrichedRow = JSON.parse(result.enriched);
    const visual = enrichedRow.visuals[0];
    expect(visual.storage_key).toBe("drive-key-new");
    expect(visual.review_status).toBe("approved");
    expect(visual.display_policy).toBe("llm_decide");
    expect(visual.title).toBe("New Chart");
    expect(visual.description).toBe("Bar chart of results");
  });
  it("missing visual without DOCX or existing still fails with EXTERNAL_VISUAL_UNKNOWN", () => {
    const chunks = validateExternalJsonl(JSON.stringify({
      board_id: "FBISE", class_id: "Class-9", subject_id: "Chemistry", chapter_id: "ch01",
      topic_no: "1.1", topic_title: "Cells", chunk_order: 0,
      chunk_text: "Cells are the basic unit of life.", expected_questions: ["What is a cell?"],
      visuals: [{ visual_id: "missing_v", visual_type: "diagram", title: "T", description: "D" }],
    }), scope);
    try {
      enrichExternalChunks(chunks, new Map(), new Map());
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PairedImportError);
      expect((error as PairedImportError).code).toBe("EXTERNAL_VISUAL_UNKNOWN");
    }
  });
  it.each([
    external([{ visual_id: "unknown", visual_type: "figure", title: "Blue half", description: "Cropped blue image" }]),
    external([{ visual_id: "Unit1_Visual_001", visual_type: "bad", title: "Blue half", description: "Cropped blue image" }]),
    external([{ visual_id: "Unit1_Visual_001", visual_type: "figure", title: "wrong", description: "Cropped blue image" }]),
    external([{ visual_id: "Unit1_Visual_001", visual_type: "figure", title: "Blue half", description: "wrong" }]),
    "{bad json",
  ])("rejects unknown, invalid, mismatched, or malformed external data safely", async (source) => {
    const cards = mockCards();
    try {
      const chunks = validateExternalJsonl(source, scope);
      enrichExternalChunks(chunks, cards, new Map([["Unit1_Visual_001", "key"]]));
    } catch (error) {
      expect(error).toBeInstanceOf(PairedImportError);
      return;
    }
    throw new Error("expected rejection");
  });
});
