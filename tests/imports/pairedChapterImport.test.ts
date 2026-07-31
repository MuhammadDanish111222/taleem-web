import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { PairedImportError, enrichExternalChunks, parseVisualExtractsDocx, sourceHash, validateExternalJsonl } from "@/lib/imports/pairedChapterImport";

function crc32(input: Buffer) { let crc = 0xffffffff; for (const byte of input) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function zip(files: Record<string, Buffer>) {
  const locals: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const [name, data] of Object.entries(files)) { const filename = Buffer.from(name); const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26); const full = Buffer.concat([local, filename, data]); locals.push(full); const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt32LE(crc32(data), 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42); central.push(Buffer.concat([entry, filename])); offset += full.length; }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, directory, end]);
}
async function fixture(options: { missingDrawing?: boolean; target?: string; crop?: string; card?: string } = {}) {
  const source = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).composite([{ input: await sharp({ create: { width: 5, height: 10, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer(), left: 5, top: 0 }]).png().toBuffer();
  const card = options.card ?? "Visual ID: Unit1_Visual_001 Title: Blue half Description: Cropped blue image Original Page: 1";
  const drawing = options.missingDrawing ? "" : `<w:p><w:r><w:drawing><a:blip r:embed="rId1"/><a:srcRect ${options.crop ?? 'l="50000" t="0" r="0" b="0"'}/></w:drawing></w:r></w:p>`;
  const xml = `<w:document xmlns:w="w" xmlns:a="a" xmlns:r="r"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>${card}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>${drawing}</w:body></w:document>`;
  return zip({ "word/document.xml": Buffer.from(xml), "word/_rels/document.xml.rels": Buffer.from(`<Relationships><Relationship Id="rId1" Target="${options.target ?? "media/image1.png"}"/></Relationships>`), "word/media/image1.png": source });
}
const scope = { board_id: "punjab", class_id: "9", subject_id: "chemistry" };
const external = (visuals: unknown[] = []) => JSON.stringify({ ...scope, chapter_id: "chapter-1", topic_no: "1", topic_title: "Topic", chunk_order: 0, chunk_text: "Text", expected_questions: ["Question?"], visuals });

describe("paired Visual Extracts DOCX parser", () => {
  it("maps a metadata table to its following drawing and applies the exact source crop", async () => {
    const cards = await parseVisualExtractsDocx(await fixture()); const card = cards.get("Unit1_Visual_001")!;
    expect(cards.size).toBe(1); expect(card.title).toBe("Blue half"); expect(card.mimeType).toBe("image/png");
    const decoded = await sharp(card.image).raw().toBuffer({ resolveWithObject: true }); expect(decoded.info.width).toBe(5); expect(decoded.data[2]).toBeGreaterThan(200);
  });
  it.each([{ missingDrawing: true }, { target: "media/missing.png" }, { crop: 'l="100000" t="0" r="0" b="0"' }, { card: "Visual ID: Unit1_Visual_001 Title: incomplete" }])("rejects malformed DOCX card, drawing, relationship, or crop", async (options) => { await expect(parseVisualExtractsDocx(await fixture(options))).rejects.toBeInstanceOf(PairedImportError); });
});

describe("paired JSONL validation and enrichment", () => {
  it("adds internal explanation and private key only after exact card metadata mapping", async () => {
    const cards = await parseVisualExtractsDocx(await fixture()); const chunks = validateExternalJsonl(external([{ visual_id: "Unit1_Visual_001", visual_type: "figure", title: " Blue half ", description: "Cropped blue image" }]), scope);
    const result = enrichExternalChunks(chunks, cards, new Map([["Unit1_Visual_001", "drive-private-key"]])); const row = JSON.parse(result.enriched);
    expect(row.content_type).toBe("explanation"); expect(row.visuals[0].storage_key).toBe("drive-private-key"); expect(result.unused).toEqual([]);
  });
  it("accepts empty visuals and reports unused DOCX assets", async () => { const cards = await parseVisualExtractsDocx(await fixture()); const chunks = validateExternalJsonl(external(), scope); const result = enrichExternalChunks(chunks, cards, new Map()); expect(result.unused).toEqual(["Unit1_Visual_001"]); });
  it("uses a semantic hash that ignores JSON formatting but changes with persisted content", async () => {
    const cards = await parseVisualExtractsDocx(await fixture());
    const compact = validateExternalJsonl(external(), scope);
    const formatted = validateExternalJsonl(`${JSON.stringify(JSON.parse(external()), null, 2).replace(/\n/g, "")}\n`, scope);
    expect(sourceHash(compact, cards, scope)).toBe(sourceHash(formatted, cards, scope));
    const changed = validateExternalJsonl(external(), scope);
    changed[0].chunk_text = "Changed text";
    expect(sourceHash(changed, cards, scope)).not.toBe(sourceHash(compact, cards, scope));
  });
  it.each([
    external([{ visual_id: "unknown", visual_type: "figure", title: "Blue half", description: "Cropped blue image" }]),
    external([{ visual_id: "Unit1_Visual_001", visual_type: "bad", title: "Blue half", description: "Cropped blue image" }]),
    external([{ visual_id: "Unit1_Visual_001", visual_type: "figure", title: "wrong", description: "Cropped blue image" }]),
    external([{ visual_id: "Unit1_Visual_001", visual_type: "figure", title: "Blue half", description: "wrong" }]),
    "{bad json",
  ])("rejects unknown, invalid, mismatched, or malformed external data safely", async (source) => { const cards = await parseVisualExtractsDocx(await fixture()); try { const chunks = validateExternalJsonl(source, scope); enrichExternalChunks(chunks, cards, new Map([["Unit1_Visual_001", "key"]])); } catch (error) { expect(error).toBeInstanceOf(PairedImportError); return; } throw new Error("expected rejection"); });
});
