export type StorageErrorCode =
  | "STORAGE_NOT_FOUND"
  | "STORAGE_PERMISSION_DENIED"
  | "STORAGE_DOWNLOAD_DISABLED"
  | "STORAGE_RANGE_INVALID"
  | "STORAGE_TIMEOUT"
  | "STORAGE_RATE_LIMITED"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_INVALID_METADATA"
  | "STORAGE_DELETE_FAILED";

export class StorageError extends Error {
  constructor(public readonly code: StorageErrorCode, message: string, public readonly providerReason?: string) {
    super(message);
    this.name = "StorageError";
  }
}
