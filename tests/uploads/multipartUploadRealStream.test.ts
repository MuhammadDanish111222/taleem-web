import { describe, it, expect } from "vitest";
import { parseMultipartRequest } from "../../lib/security/multipartUpload";
import { validatePdf } from "../../lib/security/pdfValidation";
import { UploadError } from "../../lib/uploads/errors";
import { Readable } from "stream";
import * as fs from "fs";

function createMockRequest(boundary: string, bodyParts: Buffer[]): { req: Request; headers: Headers } {
  const stream = new Readable({
    read() {
      if (bodyParts.length > 0) {
        this.push(bodyParts.shift());
      } else {
        this.push(null);
      }
    },
  });

  const req = {
    body: Readable.toWeb(stream) as any,
  } as Request;

  const headers = new Headers();
  headers.set("content-type", `multipart/form-data; boundary=${boundary}`);

  return { req, headers };
}

describe("Multipart Upload Parser (Real fs.WriteStream)", () => {
  it("should process invalid magic bytes using real fs.WriteStream and cleanup temp file on rejection", async () => {
    const boundary = "----WebKitFormBoundaryRealStreamTest";
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bad.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
    );

    const chunk1 = Buffer.from("H");
    const chunk2 = Buffer.from("T");
    const chunk3 = Buffer.from("M");
    const chunk4 = Buffer.from("L");
    const chunk5 = Buffer.from("5");
    const chunk6 = Buffer.from("...");
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

    const { req, headers } = createMockRequest(boundary, [
      header,
      chunk1,
      chunk2,
      chunk3,
      chunk4,
      chunk5,
      chunk6,
      footer,
    ]);

    const result = await parseMultipartRequest(req, headers);
    expect(result.file.magicBytesValid).toBe(false);
    expect(fs.existsSync(result.file.tempFile.filepath)).toBe(true);

    // Validate PDF should reject prompt 422 error
    await expect(validatePdf(result.file)).rejects.toThrowError(UploadError);
    await expect(validatePdf(result.file)).rejects.toThrow("Invalid PDF magic bytes");

    // Perform cleanup as API route does in finally block
    await result.file.tempFile.cleanup();
    expect(fs.existsSync(result.file.tempFile.filepath)).toBe(false);
  });
});
