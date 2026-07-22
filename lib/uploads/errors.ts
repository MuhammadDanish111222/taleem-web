export type UploadErrorCode =
  | "IDEMPOTENCY_IN_PROGRESS"
  | "IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_CONTENT"
  | "DUPLICATE_RESOURCE_VERSION"
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CLEANUP_REQUIRED";

export class UploadError extends Error {
  public code: UploadErrorCode;
  public details?: any;

  constructor(code: UploadErrorCode, message: string, details?: any) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, UploadError.prototype);
  }
}
