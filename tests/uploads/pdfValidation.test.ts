import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { validatePdf } from "../../lib/security/pdfValidation";
import { UploadError } from "../../lib/uploads/errors";
import { getUploadConfig } from "../../lib/uploads/config";
import { PDFDocument } from "pdf-lib";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let mockWorkerMessage: any = null;

vi.mock("worker_threads", () => {
  const { EventEmitter } = require("events");
  const { PDFDocument } = require("pdf-lib");
  const fs = require("fs");

  class MockWorker extends EventEmitter {
    constructor(public workerPath: string, public options: any) {
      super();
      (this as any).terminate = vi.fn();

      setImmediate(async () => {
        if (mockWorkerMessage) {
          const msg = mockWorkerMessage;
          mockWorkerMessage = null; // reset
          this.emit("message", msg);
          return;
        }

        const filepath = options?.workerData?.filepath;
        try {
          const buffer = fs.readFileSync(filepath);
          const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
          if (doc.isEncrypted) {
            this.emit("message", { success: true, isEncrypted: true });
          } else {
            this.emit("message", { success: true, pageCount: doc.getPageCount(), isEncrypted: false });
          }
        } catch (err: any) {
          this.emit("message", { success: false, error: err.message });
        }
      });
    }
  }

  return { Worker: MockWorker };
});

describe("PDF Validation", () => {
  let validPdfPath: string;
  let corruptPdfPath: string;

  beforeAll(async () => {
    // Generate valid PDF (1 page)
    const doc = await PDFDocument.create();
    doc.addPage();
    const pdfBytes = await doc.save();

    validPdfPath = path.join(os.tmpdir(), `valid-${Date.now()}.pdf`);
    fs.writeFileSync(validPdfPath, pdfBytes);

    // Generate corrupt PDF
    corruptPdfPath = path.join(os.tmpdir(), `corrupt-${Date.now()}.pdf`);
    fs.writeFileSync(corruptPdfPath, Buffer.from("random invalid bytes not a pdf"));
  });

  afterAll(() => {
    if (fs.existsSync(validPdfPath)) fs.unlinkSync(validPdfPath);
    if (fs.existsSync(corruptPdfPath)) fs.unlinkSync(corruptPdfPath);
  });

  const createMockFile = (filepath: string, magicBytesValid: boolean = true, sizeBytes: number = 1000): any => ({
    tempFile: { filepath, writeStream: {} as any, cleanup: vi.fn() },
    sha256: "dummyhash",
    sizeBytes,
    originalFilename: "test.pdf",
    mimeType: "application/pdf",
    magicBytesValid,
  });

  it("should validate a good PDF and return page count", async () => {
    const fileInfo = createMockFile(validPdfPath);
    const result = await validatePdf(fileInfo);
    expect(result.pageCount).toBe(1);
    expect(result.mimeType).toBe("application/pdf");
  });

  it("should reject a file with spoofed MIME type (invalid magic bytes)", async () => {
    const fileInfo = createMockFile(validPdfPath, false); // magicBytesValid = false
    await expect(validatePdf(fileInfo)).rejects.toThrowError(
      new UploadError("VALIDATION_ERROR", "Invalid PDF magic bytes")
    );
  });

  it("should reject an oversized file (413)", async () => {
    const fileInfo = createMockFile(validPdfPath, true, 100 * 1024 * 1024); // 100MB, config max is 50MB
    await expect(validatePdf(fileInfo)).rejects.toThrowError(
      new UploadError("PAYLOAD_TOO_LARGE", "File size exceeded limit")
    );
  });

  it("should reject a corrupt PDF", async () => {
    const fileInfo = createMockFile(corruptPdfPath);
    await expect(validatePdf(fileInfo)).rejects.toThrowError(/Invalid or corrupt PDF structure/);
  });

  it("should reject an encrypted PDF when worker detects encryption", async () => {
    mockWorkerMessage = { success: true, isEncrypted: true };
    const fileInfo = createMockFile(validPdfPath);
    await expect(validatePdf(fileInfo)).rejects.toThrowError(
      new UploadError("VALIDATION_ERROR", "PDF_ENCRYPTED")
    );
  });

  it("should reject a PDF exceeding maxPdfPages limit", async () => {
    const config = getUploadConfig();
    const pageLimit = config.maxPdfPages; // e.g. 500

    const overLimitDoc = await PDFDocument.create();
    for (let i = 0; i < pageLimit + 1; i++) {
      overLimitDoc.addPage();
    }
    const pdfBytes = await overLimitDoc.save();
    const overLimitPath = path.join(os.tmpdir(), `overlimit-${Date.now()}.pdf`);
    fs.writeFileSync(overLimitPath, pdfBytes);

    try {
      const fileInfo = createMockFile(overLimitPath, true, pdfBytes.length);
      await expect(validatePdf(fileInfo)).rejects.toThrowError(
        new UploadError("VALIDATION_ERROR", "PDF_PAGE_LIMIT_EXCEEDED")
      );
    } finally {
      if (fs.existsSync(overLimitPath)) fs.unlinkSync(overLimitPath);
    }
  });

  it("should accept a PDF with exactly maxPdfPages limit (boundary case)", async () => {
    const config = getUploadConfig();
    const pageLimit = config.maxPdfPages;

    mockWorkerMessage = { success: true, pageCount: pageLimit, isEncrypted: false };
    const fileInfo = createMockFile(validPdfPath);
    const result = await validatePdf(fileInfo);
    expect(result.pageCount).toBe(pageLimit);
  });
});
