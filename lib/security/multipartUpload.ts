import "server-only";
import busboy from "busboy";
import { Readable } from "stream";
import { createTempFile, TempFile } from "./tempFile";
import { getUploadConfig } from "../uploads/config";
import { UploadError } from "../uploads/errors";
import * as crypto from "crypto";

export interface MultipartParseResult {
  fields: Record<string, string>;
  file: {
    originalFilename: string;
    mimeType: string;
    tempFile: TempFile;
    sha256: string;
    sizeBytes: number;
    magicBytesValid: boolean;
  };
}

export function parseMultipartRequest(
  request: Request,
  headers: Headers
): Promise<MultipartParseResult> {
  return new Promise((resolve, reject) => {
    const config = getUploadConfig();
    const contentType = headers.get("content-type") || "";

    const bb = busboy({
      headers: { "content-type": contentType },
      limits: {
        fields: config.maxFields,
        fieldSize: config.maxFieldBytes,
        files: 1,
        fileSize: config.maxPdfBytes,
      },
    });

    const result: Partial<MultipartParseResult> = {
      fields: {},
    };

    let tempFile: TempFile | null = null;
    let fileError: Error | null = null;
    let sha256Hash = crypto.createHash("sha256");
    let sizeBytes = 0;
    let magicBytesValid = false;
    let magicBytesChecked = false;
    let fileProcessed = false;
    let magicBytesBuffer = Buffer.alloc(0);

    bb.on("field", (name, val, info) => {
      if (info.nameTruncated || info.valueTruncated) {
        fileError = new UploadError("PAYLOAD_TOO_LARGE", `Field ${name} exceeded size limits`);
        bb.destroy(fileError);
        return;
      }
      result.fields![name] = val;
    });

    bb.on("file", async (name, file, info) => {
      if (fileProcessed) {
        // Discard any additional files
        file.resume();
        return;
      }
      fileProcessed = true;

      if (info.mimeType !== "application/pdf") {
        fileError = new UploadError("VALIDATION_ERROR", "Only application/pdf is allowed");
        file.resume();
        bb.destroy(fileError);
        return;
      }

      if (info.filename.length > config.maxFilenameBytes) {
        fileError = new UploadError("VALIDATION_ERROR", "Filename is too long");
        file.resume();
        bb.destroy(fileError);
        return;
      }

      try {
        tempFile = await createTempFile();
        result.file = {
          originalFilename: info.filename,
          mimeType: info.mimeType,
          tempFile,
          sha256: "",
          sizeBytes: 0,
          magicBytesValid: false,
        };

        file.on("data", (data: Buffer) => {
          if (!magicBytesChecked) {
            magicBytesBuffer = Buffer.concat([magicBytesBuffer, data]);
            if (magicBytesBuffer.length >= 5) {
              const magicBytes = magicBytesBuffer.toString("ascii", 0, 5);
              if (magicBytes === "%PDF-") {
                magicBytesValid = true;
              }
              magicBytesChecked = true;
            }
          }

          sizeBytes += data.length;
          sha256Hash.update(data);

          // If size exceeds config (busboy limits.fileSize should also catch this, but just in case)
          if (sizeBytes > config.maxPdfBytes) {
            fileError = new UploadError("PAYLOAD_TOO_LARGE", "File size exceeded limit");
            file.pause();
            bb.destroy(fileError);
          }
        });

        file.pipe(tempFile.writeStream, { end: false });
      } catch (err) {
        fileError = err as Error;
        file.resume();
        bb.destroy(fileError);
      }
    });

    bb.on("partsLimit", () => {
      fileError = new UploadError("PAYLOAD_TOO_LARGE", "Too many parts");
      bb.destroy(fileError);
    });

    bb.on("filesLimit", () => {
      fileError = new UploadError("PAYLOAD_TOO_LARGE", "Only one file is allowed");
      bb.destroy(fileError);
    });

    bb.on("fieldsLimit", () => {
      fileError = new UploadError("PAYLOAD_TOO_LARGE", "Too many fields");
      bb.destroy(fileError);
    });

    bb.on("error", (err: unknown) => {
      rejectWithError(err instanceof Error ? err : new Error(String(err)));
    });

    bb.on("close", () => {
      if (fileError) {
        return rejectWithError(fileError);
      }
      if (!result.file) {
        return rejectWithError(new UploadError("VALIDATION_ERROR", "No file uploaded"));
      }

      const stream = result.file.tempFile.writeStream;
      if (stream.writableEnded || stream.writableFinished) {
        result.file!.sha256 = sha256Hash.digest("hex");
        result.file!.sizeBytes = sizeBytes;
        result.file!.magicBytesValid = magicBytesValid;
        resolve(result as MultipartParseResult);
      } else {
        stream.on("finish", () => {
          result.file!.sha256 = sha256Hash.digest("hex");
          result.file!.sizeBytes = sizeBytes;
          result.file!.magicBytesValid = magicBytesValid;
          resolve(result as MultipartParseResult);
        });
        stream.on("error", (err: unknown) => {
          rejectWithError(err instanceof Error ? err : new Error(String(err)));
        });
        stream.end();
      }
    });

    // Helper to clean up and reject
    const rejectWithError = async (err: Error) => {
      if (tempFile) {
        tempFile.writeStream.destroy();
        await tempFile.cleanup();
      }
      reject(err);
    };

    // Convert Next.js Request stream to Node stream and pipe to busboy
    if (request.body) {
      const nodeStream = Readable.fromWeb(request.body as import("stream/web").ReadableStream);
      nodeStream.on("error", (err) => {
        bb.destroy(err);
      });
      nodeStream.pipe(bb);
    } else {
      bb.end();
    }
  });
}
