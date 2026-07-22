import "server-only";
import { Worker } from "worker_threads";
import * as path from "path";
import { getUploadConfig } from "../uploads/config";
import { UploadError } from "../uploads/errors";
import { TempFile } from "./tempFile";

export interface ValidatedPdf {
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  mimeType: "application/pdf";
  originalFilename: string;
}

/**
 * Validates the PDF structure in an isolated worker thread.
 * The parser selection (pdf-lib) requires loading the file into memory (Buffer).
 * However, by isolating this in a worker thread:
 * 1. The main Node.js event loop is not blocked by heavy parsing CPU work.
 * 2. We can enforce a strict hard-timeout and terminate the worker if it hangs.
 * 3. The main thread memory is not bloated by the parsed AST.
 */
export async function validatePdfStructure(tempFile: TempFile, config = getUploadConfig()): Promise<{ pageCount: number }> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, "pdfParserWorker.js");
    
    const worker = new Worker(workerPath, {
      workerData: { filepath: tempFile.filepath },
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new UploadError("VALIDATION_ERROR", "PDF parsing timed out"));
    }, config.parseTimeoutMs);

    worker.on("message", (msg) => {
      clearTimeout(timeout);
      if (msg.success) {
        if (msg.isEncrypted) {
          reject(new UploadError("VALIDATION_ERROR", "PDF_ENCRYPTED"));
        } else {
          resolve({ pageCount: msg.pageCount });
        }
      } else {
        reject(new UploadError("VALIDATION_ERROR", "Invalid or corrupt PDF structure: " + msg.error));
      }
      worker.terminate();
    });

    worker.on("error", (err) => {
      clearTimeout(timeout);
      reject(new UploadError("VALIDATION_ERROR", "Worker error: " + err.message));
    });

    worker.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new UploadError("VALIDATION_ERROR", `Worker stopped with exit code ${code}`));
      }
    });
  });
}

export async function validatePdf(
  fileInfo: { tempFile: TempFile; sha256: string; sizeBytes: number; originalFilename: string; mimeType: string; magicBytesValid: boolean }
): Promise<ValidatedPdf> {
  const config = getUploadConfig();

  if (!fileInfo.magicBytesValid) {
    throw new UploadError("VALIDATION_ERROR", "Invalid PDF magic bytes");
  }

  if (fileInfo.sizeBytes === 0) {
    throw new UploadError("VALIDATION_ERROR", "File is empty");
  }

  if (fileInfo.sizeBytes > config.maxPdfBytes) {
    throw new UploadError("PAYLOAD_TOO_LARGE", "File size exceeded limit");
  }

  const { pageCount } = await validatePdfStructure(fileInfo.tempFile, config);

  if (pageCount === 0) {
    throw new UploadError("VALIDATION_ERROR", "PDF has 0 pages");
  }

  if (pageCount > config.maxPdfPages) {
    throw new UploadError("VALIDATION_ERROR", "PDF_PAGE_LIMIT_EXCEEDED");
  }

  return {
    sizeBytes: fileInfo.sizeBytes,
    sha256: fileInfo.sha256,
    pageCount,
    mimeType: "application/pdf",
    originalFilename: fileInfo.originalFilename,
  };
}
