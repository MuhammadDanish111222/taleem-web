import "server-only";

import { createHash } from "crypto";
import sharp from "sharp";
import yauzl from "yauzl";
import { DOMParser } from "@xmldom/xmldom";

export const SAFE_VISUAL_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type SafeVisualMimeType = typeof SAFE_VISUAL_MIME_TYPES[number];
const VISUAL_TYPES = new Set(["diagram", "figure", "table", "graph", "chemical-structure", "equation"]);
const MAX_DOCX_BYTES = 25 * 1024 * 1024;
const MAX_JSONL_BYTES = 5 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 80 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 12_000;
const MAX_IMAGE_PIXELS = 40_000_000;

export class PairedImportError extends Error {
  constructor(public readonly code: string, message?: string) { super(message || code); }
}

export type VisualCard = { visualId: string; title: string; description: string; originalPage: string; image: Buffer; mimeType: SafeVisualMimeType; imageHash: string };
export type ExternalVisual = { visual_id: string; visual_type: string; title: string; description: string };
export type ExternalChunk = Record<string, unknown> & { board_id: string; class_id: string; subject_id: string; chapter_id: string; topic_no: string | number; topic_title: string; chunk_order: number; chunk_text: string; expected_questions: string[]; visuals: ExternalVisual[] };

function normalized(value: string) { return value.replace(/\r\n?/g, "\n").trim(); }
function localName(node: any) { return node.localName || node.nodeName.split(":").pop() || ""; }
function elementChildren(node: any): Element[] { return (Array.from(node.childNodes) as Node[]).filter((child): child is Element => child.nodeType === 1); }
function descendants(node: any, name: string): Element[] {
  const found: Element[] = [];
  const walk = (current: Node) => { for (const child of elementChildren(current)) { if (localName(child) === name) found.push(child); walk(child); } };
  walk(node); return found;
}
function textContent(node: Node) { return descendants(node, "t").map((item) => item.textContent || "").join(""); }
function getAttr(node: Element, name: string) { return node.getAttribute(name) ?? node.getAttribute(`r:${name}`) ?? ""; }

async function zipEntries(source: Buffer): Promise<Map<string, Buffer>> {
  if (source.length === 0 || source.length > MAX_DOCX_BYTES || source.subarray(0, 4).toString("binary") !== "PK\x03\x04") throw new PairedImportError("DOCX_INVALID_TYPE");
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(source, { lazyEntries: true }, (openError, zip) => {
      if (openError || !zip) return reject(new PairedImportError("DOCX_INVALID_ZIP"));
      const output = new Map<string, Buffer>(); let total = 0; let entries = 0;
      const fail = (code: string) => { zip.close(); reject(new PairedImportError(code)); };
      zip.on("error", () => fail("DOCX_INVALID_ZIP"));
      zip.on("entry", (entry) => {
        entries += 1;
        if (entries > 500 || entry.fileName.includes("\\") || entry.fileName.startsWith("/") || entry.fileName.includes("..") || entry.uncompressedSize > MAX_IMAGE_BYTES || total + entry.uncompressedSize > MAX_UNZIPPED_BYTES) return fail("DOCX_ZIP_LIMIT");
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail("DOCX_INVALID_ZIP");
          const chunks: Buffer[] = []; let size = 0;
          stream.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_IMAGE_BYTES || total + size > MAX_UNZIPPED_BYTES) stream.destroy(new Error("limit")); else chunks.push(Buffer.from(chunk)); });
          stream.on("error", () => fail("DOCX_ZIP_LIMIT"));
          stream.on("end", () => { total += size; output.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.on("end", () => resolve(output));
      zip.readEntry();
    });
  });
}

function parseRelationships(xml: string) {
  if (xml.includes("<!DOCTYPE")) throw new PairedImportError("DOCX_INVALID_XML");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const result = new Map<string, string>();
  for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id"); const target = rel.getAttribute("Target");
    if (id && target) result.set(id, target);
  }
  return result;
}

function parseCard(table: Element): Omit<VisualCard, "image" | "mimeType" | "imageHash"> | null {
  const text = textContent(table).replace(/\u00a0/g, " ");
  if (!/Visual\s*ID\s*:/i.test(text)) return null;
  const match = text.match(/Visual\s*ID\s*:\s*([\s\S]+?)\s*Title\s*:\s*([\s\S]+?)\s*Description\s*:\s*([\s\S]+?)\s*Original\s*Page\s*:\s*([\s\S]+?)\s*$/i);
  if (!match) throw new PairedImportError("DOCX_METADATA_CARD_INVALID");
  const [, visualId, title, description, originalPage] = match.map((value) => normalized(value));
  if (!visualId || !title || !description || !originalPage || visualId.length > 240 || title.length > 240 || description.length > 4000) throw new PairedImportError("DOCX_METADATA_CARD_INVALID");
  return { visualId, title, description, originalPage };
}

function drawingReference(node: Element) {
  const drawings = descendants(node, "drawing");
  if (drawings.length !== 1) throw new PairedImportError("DOCX_DRAWING_PAIR_INVALID");
  const blips = descendants(drawings[0], "blip"); const crops = descendants(drawings[0], "srcRect");
  if (blips.length !== 1 || crops.length !== 1) throw new PairedImportError("DOCX_DRAWING_INVALID");
  const relationshipId = getAttr(blips[0], "embed");
  if (!relationshipId) throw new PairedImportError("DOCX_RELATIONSHIP_MISSING");
  const crop = Object.fromEntries(["l", "t", "r", "b"].map((field) => [field, Number(crops[0].getAttribute(field) ?? "0")]));
  if (Object.values(crop).some((value) => !Number.isInteger(value) || value < 0 || value >= 100000) || crop.l + crop.r >= 100000 || crop.t + crop.b >= 100000) throw new PairedImportError("DOCX_CROP_INVALID");
  return { relationshipId, crop };
}

async function cropImage(source: Buffer, crop: Record<string, number>): Promise<{ image: Buffer; mimeType: SafeVisualMimeType }> {
  if (source.length === 0 || source.length > MAX_IMAGE_BYTES) throw new PairedImportError("DOCX_IMAGE_INVALID");
  let metadata: sharp.Metadata;
  try { metadata = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false }).metadata(); } catch { throw new PairedImportError("DOCX_IMAGE_INVALID"); }
  const mimeByFormat: Record<string, SafeVisualMimeType> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  if (!metadata.format || !mimeByFormat[metadata.format] || !metadata.width || !metadata.height || metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw new PairedImportError("DOCX_IMAGE_INVALID");
  const left = Math.round(metadata.width * crop.l / 100000); const top = Math.round(metadata.height * crop.t / 100000);
  const width = metadata.width - left - Math.round(metadata.width * crop.r / 100000); const height = metadata.height - top - Math.round(metadata.height * crop.b / 100000);
  if (width <= 0 || height <= 0) throw new PairedImportError("DOCX_CROP_INVALID");
  try { return { image: await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS }).extract({ left, top, width, height }).png().toBuffer(), mimeType: "image/png" }; } catch { throw new PairedImportError("DOCX_CROP_INVALID"); }
}

/** Parses only Word's ordered metadata-table + following-drawing cards. */
export async function parseVisualExtractsDocx(source: Buffer): Promise<Map<string, VisualCard>> {
  const entries = await zipEntries(source); const documentBytes = entries.get("word/document.xml"); const relBytes = entries.get("word/_rels/document.xml.rels");
  if (!documentBytes || !relBytes) throw new PairedImportError("DOCX_REQUIRED_PART_MISSING");
  const documentXml = documentBytes.toString("utf8"); if (documentXml.includes("<!DOCTYPE")) throw new PairedImportError("DOCX_INVALID_XML");
  const relationships = parseRelationships(relBytes.toString("utf8")); const doc = new DOMParser().parseFromString(documentXml, "application/xml");
  const body = descendants(doc, "body")[0]; if (!body) throw new PairedImportError("DOCX_INVALID_XML");
  const cards = new Map<string, VisualCard>(); const children = elementChildren(body);
  for (let index = 0; index < children.length; index += 1) {
    if (localName(children[index]) !== "tbl") continue;
    const card = parseCard(children[index]); if (!card) continue;
    let drawingHost: Element | undefined;
    for (let next = index + 1; next < children.length; next += 1) {
      if (localName(children[next]) === "tbl" && parseCard(children[next])) break;
      if (descendants(children[next], "drawing").length) { drawingHost = children[next]; break; }
    }
    if (!drawingHost) throw new PairedImportError("DOCX_DRAWING_MISSING");
    const { relationshipId, crop } = drawingReference(drawingHost); const target = relationships.get(relationshipId);
    if (!target || target.startsWith("/") || target.includes("..")) throw new PairedImportError("DOCX_RELATIONSHIP_MISSING");
    const entryName = `word/${target.replace(/^\.\//, "")}`; const original = entries.get(entryName);
    if (!original) throw new PairedImportError("DOCX_IMAGE_MISSING");
    if (cards.has(card.visualId)) throw new PairedImportError("DOCX_DUPLICATE_VISUAL_ID");
    const cropped = await cropImage(original, crop); const imageHash = createHash("sha256").update(cropped.image).digest("hex");
    cards.set(card.visualId, { ...card, ...cropped, imageHash }); index = children.indexOf(drawingHost);
  }
  if (!cards.size) throw new PairedImportError("DOCX_METADATA_CARD_MISSING");
  return cards;
}

export function validateExternalJsonl(source: string, scope: { board_id: string; class_id: string; subject_id: string }): ExternalChunk[] {
  if (!source.trim()) throw new PairedImportError("EXTERNAL_JSONL_INVALID", "JSONL file is empty.");
  if (Buffer.byteLength(source, "utf8") > MAX_JSONL_BYTES) throw new PairedImportError("EXTERNAL_JSONL_INVALID", "JSONL file exceeds maximum size (5MB).");
  const chunks: ExternalChunk[] = []; let chapter: string | undefined;
  let lineNum = 0;
  for (const line of source.split(/\r?\n/)) {
    lineNum += 1;
    if (!line.trim()) continue;
    let value: unknown; try { value = JSON.parse(line); } catch (err: any) { throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Invalid JSON syntax (${err.message}).`); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Row must be a JSON object.`);
    const row = value as Record<string, unknown>;
    if ("content_type" in row || "storage_key" in row) throw new PairedImportError("EXTERNAL_JSONL_SERVER_FIELDS_FORBIDDEN", `Line ${lineNum}: Server fields 'content_type' or 'storage_key' are forbidden.`);
    const requiredStrings = ["board_id", "class_id", "subject_id", "chapter_id", "topic_title", "chunk_text"];
    for (const field of requiredStrings) {
      if (typeof row[field] !== "string" || !String(row[field]).trim()) throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Field '${field}' must be a non-empty string.`);
    }
    for (const field of ["board_id", "class_id", "subject_id"] as const) {
      if (String(row[field]).trim().toLowerCase() !== String(scope[field]).trim().toLowerCase()) throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Scope mismatch for '${field}'. File has '${row[field]}', selected dropdown has '${scope[field]}'.`);
    }
    if ((typeof row.topic_no !== "string" && typeof row.topic_no !== "number") || !String(row.topic_no).trim()) throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Field 'topic_no' must be a non-empty string or number.`);
    if (!Number.isInteger(row.chunk_order) || (row.chunk_order as number) < 0) throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Field 'chunk_order' must be a non-negative integer.`);
    if (!Array.isArray(row.expected_questions) || !row.expected_questions.every((item) => typeof item === "string" && item.trim())) throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Field 'expected_questions' must be an array of non-empty strings.`);
    if (!Array.isArray(row.visuals)) throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Field 'visuals' must be an array.`);
    const currentChapter = String(row.chapter_id).trim().toLowerCase();
    chapter ??= currentChapter; if (chapter !== currentChapter) throw new PairedImportError("EXTERNAL_JSONL_SCOPE_MISMATCH", `Line ${lineNum}: Chapter ID '${row.chapter_id}' does not match first row chapter ID '${chapter}'.`);
    const seen = new Set<string>();
    for (const visual of row.visuals) {
      if (!visual || typeof visual !== "object" || Array.isArray(visual)) throw new PairedImportError("EXTERNAL_JSONL_INVALID", `Line ${lineNum}: Each visual item must be an object.`);
      const candidate = visual as Record<string, unknown>;
      if ("storage_key" in candidate) throw new PairedImportError("EXTERNAL_JSONL_VISUAL_INVALID", `Line ${lineNum}: Visual '${candidate.visual_id}' cannot contain 'storage_key'.`);
      if (typeof candidate.visual_id !== "string" || !candidate.visual_id.trim()) throw new PairedImportError("EXTERNAL_JSONL_VISUAL_INVALID", `Line ${lineNum}: Visual missing valid string 'visual_id'.`);
      if (seen.has(candidate.visual_id.trim())) throw new PairedImportError("EXTERNAL_JSONL_VISUAL_INVALID", `Line ${lineNum}: Duplicate visual_id '${candidate.visual_id}' in row.`);
      if (!VISUAL_TYPES.has(String(candidate.visual_type))) throw new PairedImportError("EXTERNAL_JSONL_VISUAL_INVALID", `Line ${lineNum}: Invalid visual_type '${candidate.visual_type}'. Valid types: ${[...VISUAL_TYPES].join(", ")}.`);
      if (typeof candidate.title !== "string" || !candidate.title.trim()) throw new PairedImportError("EXTERNAL_JSONL_VISUAL_INVALID", `Line ${lineNum}: Visual '${candidate.visual_id}' missing 'title'.`);
      if (typeof candidate.description !== "string" || !candidate.description.trim()) throw new PairedImportError("EXTERNAL_JSONL_VISUAL_INVALID", `Line ${lineNum}: Visual '${candidate.visual_id}' missing 'description'.`);
      seen.add(candidate.visual_id.trim());
    }
    chunks.push(row as ExternalChunk);
  }
  if (!chunks.length) throw new PairedImportError("EXTERNAL_JSONL_INVALID", "No valid JSONL chunk rows found in file.");
  return chunks;
}

export function enrichExternalChunks(
  chunks: ExternalChunk[],
  cards: Map<string, VisualCard>,
  storageKeys: Map<string, string>,
  existingVisuals?: Map<string, { visual_id: string; title: string; description: string; storage_key: string }>,
) {
  const referenced = new Set<string>();
  const enriched = chunks.map((chunk) => ({
    board_id: String(chunk.board_id).trim().toLowerCase(),
    class_id: String(chunk.class_id).trim().toLowerCase(),
    subject_id: String(chunk.subject_id).trim().toLowerCase(),
    chapter_id: String(chunk.chapter_id).trim().toLowerCase(),
    topic_no: String(chunk.topic_no).trim(),
    topic_title: normalized(chunk.topic_title),
    chunk_order: chunk.chunk_order,
    content_type: "explanation",
    chunk_text: chunk.chunk_text,
    expected_questions: chunk.expected_questions,
    visuals: chunk.visuals.map((visual) => {
      const id = visual.visual_id.trim();
      const card = cards.get(id);
      const existing = existingVisuals?.get(id);
      const storageKey = storageKeys.get(id) || existing?.storage_key;
      if (!card && !existing) {
        throw new PairedImportError("EXTERNAL_VISUAL_UNKNOWN", `Missing visual ${id}. Upload the visual DOCX or remove this reference.`);
      }
      if (!storageKey) {
        throw new PairedImportError("PAIRED_IMPORT_UPLOAD_INCOMPLETE");
      }
      const title = card ? card.title : existing!.title;
      const description = card ? card.description : existing!.description;
      if (card && normalized(visual.title) !== normalized(card.title)) {
        throw new PairedImportError("EXTERNAL_VISUAL_TITLE_MISMATCH");
      }
      if (card && normalized(visual.description) !== normalized(card.description)) {
        throw new PairedImportError("EXTERNAL_VISUAL_DESCRIPTION_MISMATCH");
      }
      referenced.add(id);
      return { visual_id: id, visual_type: visual.visual_type, title: normalized(title), description: normalized(description), storage_key: storageKey };
    }),
  }));
  return { enriched: enriched.map((row) => JSON.stringify(row)).join("\n"), referenced, unused: [...cards.keys()].filter((id) => !referenced.has(id)) };
}

/**
 * Hashes the meaning of an import, not the ZIP bytes of the two source files.
 * Re-saving the same DOCX or changing JSON whitespace must not create another
 * corpus version. Only fields persisted by enrichExternalChunks and the
 * referenced cropped visual bytes participate in the hash.
 */
export function sourceHash(
  chunks: ExternalChunk[],
  cards: Map<string, VisualCard>,
  scope: { board_id: string; class_id: string; subject_id: string },
) {
  const canonicalChunks = chunks.map((chunk) => ({
    board_id: chunk.board_id,
    class_id: chunk.class_id,
    subject_id: chunk.subject_id,
    chapter_id: chunk.chapter_id,
    topic_no: String(chunk.topic_no).trim(),
    topic_title: normalized(chunk.topic_title),
    chunk_order: chunk.chunk_order,
    chunk_text: normalized(chunk.chunk_text),
    expected_questions: chunk.expected_questions.map(normalized),
    visuals: chunk.visuals.map((visual) => {
      const visualId = visual.visual_id.trim();
      const card = cards.get(visualId);
      if (!card) throw new PairedImportError("EXTERNAL_VISUAL_UNKNOWN");
      return {
        visual_id: visualId,
        visual_type: visual.visual_type,
        title: normalized(card.title),
        description: normalized(card.description),
        image_hash: card.imageHash,
      };
    }),
  }));
  return createHash("sha256")
    .update(JSON.stringify({ scope, chunks: canonicalChunks }))
    .digest("hex");
}
