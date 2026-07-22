import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseMultipartRequest } from "../../lib/security/multipartUpload";
import { UploadError } from "../../lib/uploads/errors";
import { Readable } from "stream";

// Mock config
vi.mock("../../lib/uploads/config", () => ({
  getUploadConfig: vi.fn().mockReturnValue({
    maxFields: 10,
    maxFieldBytes: 1024 * 1024,
    maxPdfBytes: 50 * 1024 * 1024,
    maxFilenameBytes: 255,
  }),
}));

// Mock tempFile to avoid actual disk IO
vi.mock("../../lib/security/tempFile", () => {
  return {
    createTempFile: vi.fn().mockResolvedValue({
      filepath: "dummy/path",
      writeStream: new (require("stream").PassThrough)(),
      cleanup: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

describe("Multipart Upload Parser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockRequest(boundary: string, bodyParts: Buffer[]): { req: Request, headers: Headers } {
    const stream = new Readable({
      read() {
        if (bodyParts.length > 0) {
          this.push(bodyParts.shift());
        } else {
          this.push(null);
        }
      }
    });

    const req = {
      body: Readable.toWeb(stream) as any,
    } as Request;

    const headers = new Headers();
    headers.set("content-type", `multipart/form-data; boundary=${boundary}`);

    return { req, headers };
  }

  it("should accumulate magic bytes across multiple small chunks and accept valid PDF", async () => {
    const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
    
    // Send magic bytes one byte at a time to test accumulator
    const chunk1 = Buffer.from("%");
    const chunk2 = Buffer.from("P");
    const chunk3 = Buffer.from("D");
    const chunk4 = Buffer.from("F");
    const chunk5 = Buffer.from("-");
    const chunk6 = Buffer.from("1.4...");
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

    const { req, headers } = createMockRequest(boundary, [header, chunk1, chunk2, chunk3, chunk4, chunk5, chunk6, footer]);

    const result = await parseMultipartRequest(req, headers);
    expect(result.file.magicBytesValid).toBe(true);
    expect(result.file.sizeBytes).toBe(11); // size of the chunks
  });

  it("should accumulate magic bytes across multiple small chunks and reject invalid PDF", async () => {
    const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
    
    // Send magic bytes one byte at a time to test accumulator
    const chunk1 = Buffer.from("H");
    const chunk2 = Buffer.from("T");
    const chunk3 = Buffer.from("M");
    const chunk4 = Buffer.from("L");
    const chunk5 = Buffer.from("5");
    const chunk6 = Buffer.from("...");
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

    const { req, headers } = createMockRequest(boundary, [header, chunk1, chunk2, chunk3, chunk4, chunk5, chunk6, footer]);

    const result = await parseMultipartRequest(req, headers);
    expect(result.file.magicBytesValid).toBe(false);
  });
});
