import "server-only";

export interface UploadConfig {
  maxMultipartBytes: number;
  maxPdfBytes: number;
  maxPdfPages: number;
  maxFields: number;
  maxFieldBytes: number;
  maxFilenameBytes: number;
  parseTimeoutMs: number;
  idempotencySecret: string;
  tempDir?: string;
  cleanupBatchSize: number;
  maxCleanupAttempts: number;
}

export function getUploadConfig(): UploadConfig {
  const secret =
    process.env.CONTENT_UPLOAD_IDEMPOTENCY_SECRET ||
    (process.env.NODE_ENV !== "production" ? "dev-secret-key-12345" : "");
  if (!secret) {
    throw new Error("CONTENT_UPLOAD_IDEMPOTENCY_SECRET is required");
  }

  return {
    maxMultipartBytes: parseInt(process.env.CONTENT_UPLOAD_MAX_MULTIPART_BYTES || "52428800", 10), // 50MB
    maxPdfBytes: parseInt(process.env.CONTENT_UPLOAD_MAX_PDF_BYTES || "52428800", 10),
    maxPdfPages: parseInt(process.env.CONTENT_UPLOAD_MAX_PDF_PAGES || "500", 10),
    maxFields: parseInt(process.env.CONTENT_UPLOAD_MAX_FIELDS || "20", 10),
    maxFieldBytes: parseInt(process.env.CONTENT_UPLOAD_MAX_FIELD_BYTES || "10240", 10), // 10KB
    maxFilenameBytes: parseInt(process.env.CONTENT_UPLOAD_MAX_FILENAME_BYTES || "255", 10),
    parseTimeoutMs: parseInt(process.env.CONTENT_UPLOAD_PARSE_TIMEOUT_MS || "15000", 10),
    idempotencySecret: secret,
    tempDir: process.env.CONTENT_UPLOAD_TEMP_DIR, // undefined means use os.tmpdir()
    cleanupBatchSize: parseInt(process.env.CONTENT_UPLOAD_CLEANUP_BATCH_SIZE || "10", 10),
    maxCleanupAttempts: parseInt(process.env.CONTENT_UPLOAD_MAX_CLEANUP_ATTEMPTS || "5", 10),
  };
}
