import "server-only";

export interface StorageUploadInput {
  filename: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  body: NodeJS.ReadableStream;
  signal?: AbortSignal;
}

export interface ByteRange {
  start: number;
  end?: number;
}

export interface StorageRequestOptions {
  signal?: AbortSignal;
  requestId?: string;
}

export interface StoredObjectMetadata {
  provider: "google_drive";
  storageKey: string;
  name: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  providerRevision: string;
  etag?: string;
  canDownload: boolean;
}

export interface StorageReadResult {
  stream: NodeJS.ReadableStream;
  status: 200 | 206;
  mimeType: "application/pdf";
  contentLength: number;
  totalSize: number;
  etag?: string;
  contentRange?: {
    start: number;
    end: number;
    total: number;
  };
}

export interface StorageProvider {
  upload(input: StorageUploadInput): Promise<StoredObjectMetadata>;

  getMetadata(
    storageKey: string,
    options?: StorageRequestOptions
  ): Promise<StoredObjectMetadata>;

  readRange(
    storageKey: string,
    range?: ByteRange,
    options?: StorageRequestOptions
  ): Promise<StorageReadResult>;

  delete(
    storageKey: string,
    options?: StorageRequestOptions
  ): Promise<void>;
}
