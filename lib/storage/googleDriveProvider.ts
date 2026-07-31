import "server-only";
import { drive_v3, google } from "googleapis";
import { Readable } from "stream";
import { StorageProvider, StorageUploadInput, StoredObjectMetadata, StorageRequestOptions, ByteRange, StorageReadResult, SafeImageMimeType, StorageImageReadResult } from "./StorageProvider";
import { DriveConfig, getDriveConfig } from "./config";
import { StorageError } from "./errors";
import { withBoundedRetry } from "./retry";

export class GoogleDriveProvider implements StorageProvider {
  private drive: drive_v3.Drive;
  private config: DriveConfig;

  constructor(injectedDrive?: drive_v3.Drive, configOverride?: DriveConfig) {
    this.config = configOverride || getDriveConfig();

    if (injectedDrive) {
      this.drive = injectedDrive;
    } else {
      let auth: any;
      if (this.config.authMode === "oauth_user") {
        const oauth2Client = new google.auth.OAuth2(
          this.config.clientId,
          this.config.clientSecret
        );
        oauth2Client.setCredentials({
          refresh_token: this.config.refreshToken,
        });
        auth = oauth2Client;
      } else if (this.config.authMode === "delegated") {
        const jwtClient = new google.auth.JWT({
          email: this.config.clientEmail,
          key: this.config.privateKey,
          scopes: ["https://www.googleapis.com/auth/drive.file"],
          subject: this.config.delegatedUser,
        });
        auth = jwtClient;
      } else {
        // "shared_drive"
        auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: this.config.clientEmail,
            private_key: this.config.privateKey,
          },
          scopes: ["https://www.googleapis.com/auth/drive.file"],
        });
      }

      this.drive = google.drive({ version: "v3", auth });
    }
  }

  async upload(input: StorageUploadInput): Promise<StoredObjectMetadata> {
    if (input.mimeType !== "application/pdf") {
      throw new StorageError("STORAGE_INVALID_METADATA", "Only application/pdf is allowed");
    }

    return withBoundedRetry(async () => {
      const res = await this.drive.files.create({
        requestBody: {
          name: input.filename,
          parents: [this.config.contentFolderId],
        },
        media: {
          mimeType: input.mimeType,
          body: input.body,
        },
        fields: "id, name, mimeType, size, headRevisionId, version, capabilities, driveId, trashed",
        supportsAllDrives: true,
      }, {
        signal: input.signal,
      });

      const file = res.data;
      if (!file.id) {
        throw new StorageError("STORAGE_INVALID_METADATA", "No file ID returned");
      }
      
      return this.mapToFileMetadata(file);
    }, this.config.maxAttempts, input.signal);
  }

  async getMetadata(storageKey: string, options?: StorageRequestOptions): Promise<StoredObjectMetadata> {
    return withBoundedRetry(async () => {
      const res = await this.drive.files.get({
        fileId: storageKey,
        fields: "id, name, mimeType, size, headRevisionId, version, capabilities, driveId, trashed",
        supportsAllDrives: true,
      }, {
        signal: options?.signal,
      });

      return this.mapToFileMetadata(res.data);
    }, this.config.maxAttempts, options?.signal);
  }

  async readRange(storageKey: string, range?: ByteRange, options?: StorageRequestOptions): Promise<StorageReadResult> {
    if (range && range.start < 0) {
      throw new StorageError("STORAGE_RANGE_INVALID", "Range start must be non-negative");
    }
    if (range && range.end !== undefined && range.end < range.start) {
      throw new StorageError("STORAGE_RANGE_INVALID", "Range end cannot be before start");
    }

    return withBoundedRetry(async () => {
      const headers: Record<string, string> = {};
      if (range) {
        if (range.end !== undefined) {
          headers["Range"] = `bytes=${range.start}-${range.end}`;
        } else {
          headers["Range"] = `bytes=${range.start}-`;
        }
      }

      const res = await this.drive.files.get({
        fileId: storageKey,
        alt: "media",
        supportsAllDrives: true,
      }, {
        headers,
        responseType: "stream",
        signal: options?.signal,
      });

      const contentRangeStr = res.headers["content-range"];
      let contentRange;
      let metadata: StoredObjectMetadata | undefined;
      const metadataForFallback = async () => {
        metadata ??= await this.getMetadata(storageKey, options);
        return metadata;
      };
      const trustedSize =
        Number.isSafeInteger(options?.trustedSizeBytes) && (options?.trustedSizeBytes ?? 0) > 0
          ? options!.trustedSizeBytes
          : undefined;
      const sizeForFallback = async () => trustedSize ?? (await metadataForFallback()).sizeBytes;
      if (contentRangeStr) {
        const match = contentRangeStr.match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
        if (match) {
          contentRange = {
            start: parseInt(match[1], 10),
            end: parseInt(match[2], 10),
            total: match[3] === "*" ? 0 : parseInt(match[3], 10),
          };
        } else {
          throw new StorageError("STORAGE_INVALID_METADATA", "Malformed Content-Range");
        }
      } else if (res.status === 206) {
        // The live Google Drive API can return a 206 stream while the
        // googleapis client exposes no response headers. Derive the exact
        // range from trusted Drive metadata and our requested bounds instead.
        const sizeBytes = await sizeForFallback();
        const start = range?.start ?? 0;
        const end = Math.min(range?.end ?? sizeBytes - 1, sizeBytes - 1);
        if (sizeBytes <= 0 || start > end) {
          throw new StorageError("STORAGE_RANGE_INVALID", "Requested byte range is invalid");
        }
        contentRange = { start, end, total: sizeBytes };
      }

      // Public routes have already verified an immutable PDF resource version.
      // When Drive omits media response headers, trustedSizeBytes lets us avoid
      // an otherwise redundant metadata request while retaining the PDF-only
      // contract. Other callers still perform Drive metadata validation.
      const mimeType =
        res.headers["content-type"]
        || (trustedSize ? "application/pdf" : (await metadataForFallback()).mimeType);
      if (mimeType !== "application/pdf") {
        throw new StorageError("STORAGE_INVALID_METADATA", "MIME type is not application/pdf");
      }

      const contentLength = parseInt(res.headers["content-length"] || "", 10) ||
        (contentRange ? contentRange.end - contentRange.start + 1 : await sizeForFallback());

      return {
        stream: res.data as NodeJS.ReadableStream,
        status: res.status === 206 ? 206 : 200,
        mimeType: "application/pdf",
        contentLength,
        totalSize: contentRange ? contentRange.total : await sizeForFallback(),
        contentRange,
      };
    }, this.config.maxAttempts, options?.signal);
  }

  /**
   * Narrow local-admin-only capability for paired chapter imports.  It is
   * deliberately separate from upload(): PDFs retain their existing contract.
   * A SHA-256 content fingerprint is stored as a private Drive app property so
   * a browser retry cannot create a second visual object.
   */
  async uploadPairedVisual(input: {
    filename: string;
    mimeType: SafeImageMimeType;
    body: Buffer;
    contentHash: string;
    signal?: AbortSignal;
  }): Promise<{ storageKey: string; created: boolean }> {
    const allowed = new Set<SafeImageMimeType>(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (!allowed.has(input.mimeType) || !/^[a-f0-9]{64}$/.test(input.contentHash) || !input.body.length) {
      throw new StorageError("STORAGE_INVALID_METADATA", "Invalid paired visual metadata");
    }
    const escapedHash = input.contentHash.replace(/'/g, "\\'");
    const existing = await withBoundedRetry(async () => this.drive.files.list({
      q: `'${this.config.contentFolderId.replace(/'/g, "\\'")}' in parents and trashed = false and appProperties has { key='taleem_paired_visual_sha256' and value='${escapedHash}' }`,
      fields: "files(id,mimeType,driveId,trashed)",
      pageSize: 2,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    }, { signal: input.signal }), this.config.maxAttempts, input.signal);
    const found = existing.data.files || [];
    if (found.length > 1) throw new StorageError("STORAGE_INVALID_METADATA", "Paired visual idempotency conflict");
    if (found.length === 1) {
      const file = found[0];
      if (!file.id || file.mimeType !== input.mimeType || file.trashed || (this.config.sharedDriveId && file.driveId && file.driveId !== this.config.sharedDriveId)) {
        throw new StorageError("STORAGE_INVALID_METADATA", "Paired visual metadata invalid");
      }
      return { storageKey: file.id, created: false };
    }
    const result = await withBoundedRetry(async () => this.drive.files.create({
      requestBody: {
        name: input.filename,
        parents: [this.config.contentFolderId],
        appProperties: { taleem_paired_visual_sha256: input.contentHash },
      },
      // googleapis multipart uploads require a readable stream. Create it
      // inside the retry callback so every attempt receives a fresh stream.
      media: { mimeType: input.mimeType, body: Readable.from(input.body) },
      fields: "id,mimeType,driveId,trashed",
      supportsAllDrives: true,
    }, { signal: input.signal }), this.config.maxAttempts, input.signal);
    const file = result.data;
    if (!file.id || file.mimeType !== input.mimeType || file.trashed || (this.config.sharedDriveId && file.driveId && file.driveId !== this.config.sharedDriveId)) {
      throw new StorageError("STORAGE_INVALID_METADATA", "Paired visual upload validation failed");
    }
    return { storageKey: file.id, created: true };
  }

  /** Lists only importer-owned visual objects in the configured private folder. */
  async listPairedVisuals(options?: StorageRequestOptions): Promise<Array<{ storageKey: string; createdAt: string }>> {
    const objects: Array<{ storageKey: string; createdAt: string }> = [];
    let pageToken: string | undefined;
    do {
      const page = await withBoundedRetry(async () => this.drive.files.list({
        q: `'${this.config.contentFolderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,createdTime,appProperties,driveId,trashed)",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      }, { signal: options?.signal }), this.config.maxAttempts, options?.signal);
      for (const file of page.data.files || []) {
        if (
          !file.id
          || !file.createdTime
          || file.trashed
          || !file.appProperties?.taleem_paired_visual_sha256
          || (this.config.sharedDriveId && file.driveId && file.driveId !== this.config.sharedDriveId)
        ) continue;
        objects.push({ storageKey: file.id, createdAt: file.createdTime });
      }
      pageToken = page.data.nextPageToken || undefined;
    } while (pageToken);
    return objects;
  }

  /** Deletes only an object positively identified as importer-owned. */
  async deletePairedVisual(storageKey: string, options?: StorageRequestOptions): Promise<void> {
    const metadata = await withBoundedRetry(async () => this.drive.files.get({
      fileId: storageKey,
      fields: "id,appProperties,driveId,trashed",
      supportsAllDrives: true,
    }, { signal: options?.signal }), this.config.maxAttempts, options?.signal);
    const file = metadata.data;
    if (
      !file.id
      || file.trashed
      || !file.appProperties?.taleem_paired_visual_sha256
      || (this.config.sharedDriveId && file.driveId && file.driveId !== this.config.sharedDriveId)
    ) {
      throw new StorageError("STORAGE_INVALID_METADATA", "Object is not an importer-owned visual");
    }
    await this.delete(storageKey, options);
  }

  /** Local-admin visual streaming only.  PDF paths continue to use readRange. */
  async readImage(storageKey: string, options?: StorageRequestOptions): Promise<StorageImageReadResult> {
    const allowed = new Set<SafeImageMimeType>(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    return withBoundedRetry(async () => {
      const metadata = await this.drive.files.get({
        fileId: storageKey,
        fields: "id,mimeType,size,capabilities,driveId,trashed",
        supportsAllDrives: true,
      }, { signal: options?.signal });
      const file = metadata.data;
      if (file.trashed) throw new StorageError("STORAGE_NOT_FOUND", "Visual is trashed");
      if (this.config.sharedDriveId && file.driveId && file.driveId !== this.config.sharedDriveId) {
        throw new StorageError("STORAGE_PERMISSION_DENIED", "Visual is outside configured shared drive");
      }
      if (file.capabilities?.canDownload === false) throw new StorageError("STORAGE_DOWNLOAD_DISABLED", "Visual download is disabled");
      if (!file.mimeType || !allowed.has(file.mimeType as SafeImageMimeType)) {
        throw new StorageError("STORAGE_INVALID_METADATA", "Visual MIME type is not allowed");
      }
      const media = await this.drive.files.get({ fileId: storageKey, alt: "media", supportsAllDrives: true }, {
        responseType: "stream", signal: options?.signal,
      });
      const actualType = media.headers["content-type"] || file.mimeType;
      if (!actualType || !allowed.has(actualType as SafeImageMimeType)) {
        throw new StorageError("STORAGE_INVALID_METADATA", "Visual response MIME type is not allowed");
      }
      return {
        stream: media.data as NodeJS.ReadableStream,
        mimeType: actualType as SafeImageMimeType,
        contentLength: parseInt(media.headers["content-length"] || "", 10) || parseInt(file.size || "0", 10),
      };
    }, this.config.maxAttempts, options?.signal);
  }

  async delete(storageKey: string, options?: StorageRequestOptions): Promise<void> {
    return withBoundedRetry(async () => {
      await this.drive.files.delete({
        fileId: storageKey,
        supportsAllDrives: true,
      }, {
        signal: options?.signal,
      });
    }, this.config.maxAttempts, options?.signal);
  }

  private mapToFileMetadata(file: drive_v3.Schema$File): StoredObjectMetadata {
    if (file.trashed) {
      throw new StorageError("STORAGE_NOT_FOUND", "File is trashed");
    }
    if (file.mimeType !== "application/pdf") {
      throw new StorageError("STORAGE_INVALID_METADATA", "File is not application/pdf");
    }
    if (this.config.sharedDriveId && file.driveId && file.driveId !== this.config.sharedDriveId) {
      throw new StorageError("STORAGE_PERMISSION_DENIED", "File is outside configured shared drive");
    }
    const canDownload = file.capabilities?.canDownload ?? true;
    if (!canDownload) {
      throw new StorageError("STORAGE_DOWNLOAD_DISABLED", "File download is disabled");
    }
    
    return {
      provider: "google_drive",
      storageKey: file.id!,
      name: file.name || "",
      mimeType: "application/pdf",
      sizeBytes: parseInt(file.size || "0", 10),
      providerRevision: file.headRevisionId || file.version || "",
      canDownload: true,
    };
  }
}

let sharedProvider: GoogleDriveProvider | undefined;

/**
 * Reuses the Google auth client within a server process. In particular this
 * preserves its short-lived access token instead of refreshing OAuth for every
 * PDF range requested by the browser viewer.
 */
export function getSharedGoogleDriveProvider(): GoogleDriveProvider {
  sharedProvider ??= new GoogleDriveProvider();
  return sharedProvider;
}
