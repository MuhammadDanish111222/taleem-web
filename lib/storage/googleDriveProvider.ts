import "server-only";
import { drive_v3, google } from "googleapis";
import { StorageProvider, StorageUploadInput, StoredObjectMetadata, StorageRequestOptions, ByteRange, StorageReadResult } from "./StorageProvider";
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
      let auth;
      if (this.config.authMode === "shared_drive") {
        auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: this.config.clientEmail,
            private_key: this.config.privateKey,
          },
          scopes: ["https://www.googleapis.com/auth/drive"],
        });
      } else {
        const jwtClient = new google.auth.JWT({
          email: this.config.clientEmail,
          key: this.config.privateKey,
          scopes: ["https://www.googleapis.com/auth/drive"],
          subject: this.config.delegatedUser
        });
        auth = jwtClient;
      }

      this.drive = google.drive({ version: "v3", auth });
    }
  }

  async upload(input: StorageUploadInput): Promise<StoredObjectMetadata> {
    if (input.mimeType !== "application/pdf") {
      throw new StorageError("STORAGE_INVALID_METADATA", "Only application/pdf is allowed");
    }

    try {
      return await withBoundedRetry(async () => {
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
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("⚠️ Local Google Drive API unconfigured. Using dev storage key.");
        return {
          provider: "google_drive",
          storageKey: `dev-drive-file-${Date.now()}`,
          name: input.filename,
          mimeType: "application/pdf",
          sizeBytes: input.sizeBytes,
          providerRevision: "dev-rev-1",
          canDownload: true,
        };
      }
      throw err;
    }
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
        throw new StorageError("STORAGE_INVALID_METADATA", "Missing Content-Range");
      }

      const mimeType = res.headers["content-type"];
      if (mimeType !== "application/pdf") {
        throw new StorageError("STORAGE_INVALID_METADATA", "MIME type is not application/pdf");
      }

      return {
        stream: res.data as NodeJS.ReadableStream,
        status: res.status === 206 ? 206 : 200,
        mimeType: "application/pdf",
        contentLength: parseInt(res.headers["content-length"] || "0", 10),
        totalSize: contentRange ? contentRange.total : parseInt(res.headers["content-length"] || "0", 10),
        contentRange,
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
    if (file.driveId && file.driveId !== this.config.sharedDriveId) {
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
