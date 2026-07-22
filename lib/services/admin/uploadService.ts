import "server-only";
import * as crypto from "crypto";
import { getUploadConfig } from "../../uploads/config";
import { UploadTransaction, UploadOperation } from "../../uploads/types";
import { UploadError } from "../../uploads/errors";
import { createUploadTransaction, getUploadTransaction, updateUploadTransactionState } from "../../repositories/firestore/uploadTransactionRepository";
import { ValidatedPdf } from "../../security/pdfValidation";
import { StorageProvider } from "../../storage/StorageProvider";
import { createDraftResourceWithInitialVersion, addResourceVersion } from "./resourceService";
import { checkDuplicateResourceContent, checkDuplicateResourceVersion } from "../../repositories/firestore/resourceRepository";
import { z } from "zod";
import { uploadMetadataSchema } from "../../uploads/validation";
import { TempFile } from "../../security/tempFile";
import * as fs from "fs";

export function generateIdempotencyHash(adminUid: string, idempotencyKey: string): string {
  const config = getUploadConfig();
  const input = `content-upload:v1:${adminUid}:${idempotencyKey}`;
  return crypto.createHmac("sha256", config.idempotencySecret).update(input).digest("hex");
}

export function generateRequestFingerprint(
  operation: string,
  resourceId: string | null,
  type: string,
  boardId: string,
  classId: string,
  subjectId: string,
  chapterId: string | null,
  sha256: string
): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    operation, resourceId, type, boardId, classId, subjectId, chapterId, sha256
  })).digest("hex");
}

export class UploadService {
  constructor(private storageProvider: StorageProvider) {}

  async processUpload(
    adminUid: string,
    requestId: string,
    idempotencyKey: string,
    metadataFields: Record<string, string>,
    validatedPdf: ValidatedPdf,
    tempFile: TempFile
  ): Promise<any> {
    const config = getUploadConfig();
    const hash = generateIdempotencyHash(adminUid, idempotencyKey);
    const transactionId = hash; // Using hash as document ID for atomic reservation

    // 1. Reserve Idempotency Transaction (Pending)
    const existingTx = await getUploadTransaction(transactionId);
    
    // Parse metadata
    const parsedMetadata = uploadMetadataSchema.parse(metadataFields);
    const fingerprint = generateRequestFingerprint(
      parsedMetadata.operation,
      parsedMetadata.resourceId || null,
      parsedMetadata.type,
      parsedMetadata.boardId,
      parsedMetadata.classId,
      parsedMetadata.subjectId,
      parsedMetadata.chapterId || null,
      validatedPdf.sha256
    );

    if (existingTx) {
      if (existingTx.state === "pending" || existingTx.state === "uploaded") {
        throw new UploadError("IDEMPOTENCY_IN_PROGRESS", "A request with this idempotency key is already in progress.");
      }
      if (existingTx.state === "failed" || existingTx.state === "cleanup_required") {
        throw new UploadError("IDEMPOTENCY_CONFLICT", `Transaction is in terminal/cleanup state: ${existingTx.state}. Please use a new key.`);
      }
      if (existingTx.state === "committed") {
        if (existingTx.requestFingerprint !== fingerprint) {
          throw new UploadError("IDEMPOTENCY_CONFLICT", "Idempotency key reused with different payload.");
        }
        return { replayed: true, transactionId, resourceId: existingTx.committedResourceId, versionId: existingTx.committedVersionId };
      }
    }

    const newTx: UploadTransaction = {
      id: transactionId,
      idempotencyKeyHash: hash,
      adminUid,
      requestId,
      requestFingerprint: fingerprint,
      operation: parsedMetadata.operation,
      resourceId: parsedMetadata.resourceId || null,
      resourceType: parsedMetadata.type,
      boardId: parsedMetadata.boardId,
      classId: parsedMetadata.classId,
      subjectId: parsedMetadata.subjectId,
      chapterId: parsedMetadata.chapterId || null,
      state: "pending",
      originalFilename: validatedPdf.originalFilename,
      mimeType: validatedPdf.mimeType,
      sizeBytes: validatedPdf.sizeBytes,
      sha256: validatedPdf.sha256,
      pageCount: validatedPdf.pageCount,
      storageProvider: null,
      storageKey: null,
      providerRevision: null,
      committedResourceId: null,
      committedVersionId: null,
      duplicateOfTransactionId: null,
      errorCode: null,
      sanitizedErrorMessage: null,
      cleanupAttemptCount: 0,
      cleanupLastAttemptAt: null,
      cleanupCompletedAt: null,
      createdAt: null as any, // handled by Firestore/repo
      updatedAt: null as any,
      uploadedAt: null,
      committedAt: null,
      failedAt: null,
      schemaVersion: 1,
    };

    try {
      await createUploadTransaction(newTx);
    } catch (err: any) {
      if (err.code === 6 || err.code === "ALREADY_EXISTS") {
         throw new UploadError("IDEMPOTENCY_IN_PROGRESS", "A request with this idempotency key is already in progress.");
      }
      throw err;
    }

    // 2. Duplicate Policy Check
    if (parsedMetadata.operation === "create_resource") {
      const duplicate = await checkDuplicateResourceContent(
        validatedPdf.sha256,
        parsedMetadata.type,
        parsedMetadata.boardId,
        parsedMetadata.classId,
        parsedMetadata.subjectId,
        parsedMetadata.chapterId || null
      );
      if (duplicate) {
        await this.failTransaction(transactionId, "DUPLICATE_CONTENT", `Duplicate content found in resource ${duplicate.resourceId}`);
        throw new UploadError("DUPLICATE_CONTENT", "Duplicate content within the same scope.");
      }
    } else if (parsedMetadata.operation === "replace_version") {
      const duplicateVersionId = await checkDuplicateResourceVersion(
        parsedMetadata.resourceId!,
        validatedPdf.sha256
      );
      if (duplicateVersionId) {
        await this.failTransaction(transactionId, "DUPLICATE_CONTENT", `Duplicate content found in version ${duplicateVersionId}`);
        throw new UploadError("DUPLICATE_CONTENT", "Duplicate content in version history.");
      }
    }

    // 3. Drive Upload
    let storageMetadata;
    const fileStream = fs.createReadStream(tempFile.filepath);
    fileStream.on("error", (err) => {
      // Prevent unhandled stream error events from unlinked temp files
    });

    try {
      storageMetadata = await this.storageProvider.upload({
        filename: validatedPdf.originalFilename,
        mimeType: "application/pdf",
        sizeBytes: validatedPdf.sizeBytes,
        body: fileStream,
      });
    } catch (err: any) {
      fileStream.destroy();
      await this.failTransaction(transactionId, "INTERNAL_ERROR", err.message);
      throw new UploadError("INTERNAL_ERROR", "Storage provider upload failed.");
    }

    try {
      await updateUploadTransactionState(transactionId, "uploaded", {
        storageProvider: "google_drive",
        storageKey: storageMetadata.storageKey,
        providerRevision: storageMetadata.providerRevision,
      });
    } catch (err: any) {
      // 15.2 Failure while marking uploaded
      // "If Drive succeeds but the Firestore update to state `uploaded` fails: Attempt immediate Drive deletion"
      try {
        await this.storageProvider.delete(storageMetadata.storageKey);
      } catch (delErr) {
        // Log sanitized operational failure
        console.error(`Orphaned Drive object: ${storageMetadata.storageKey}`);
      }
      throw new UploadError("INTERNAL_ERROR", "Failed to update transaction state to uploaded.");
    }

    // 4. Resource Metadata Commit
    let committedResource;
    try {
      if (parsedMetadata.operation === "create_resource") {
        committedResource = await createDraftResourceWithInitialVersion(
          { uid: adminUid, requestId },
          {
            type: parsedMetadata.type,
            title: parsedMetadata.title,
            boardId: parsedMetadata.boardId,
            classId: parsedMetadata.classId,
            subjectId: parsedMetadata.subjectId,
            chapterId: parsedMetadata.chapterId || null,
            language: parsedMetadata.language,
            curriculumVersion: parsedMetadata.curriculumVersion,
            displayOrder: parsedMetadata.displayOrder,
          },
          {
            storageKey: storageMetadata.storageKey,
            originalFilename: validatedPdf.originalFilename,
            sizeBytes: validatedPdf.sizeBytes,
            sha256: validatedPdf.sha256,
            providerRevision: storageMetadata.providerRevision,
            pageCount: validatedPdf.pageCount,
          }
        );
      } else {
        committedResource = await addResourceVersion(
          { uid: adminUid, requestId },
          parsedMetadata.resourceId!,
          {
            storageKey: storageMetadata.storageKey,
            originalFilename: validatedPdf.originalFilename,
            sizeBytes: validatedPdf.sizeBytes,
            sha256: validatedPdf.sha256,
            providerRevision: storageMetadata.providerRevision,
            pageCount: validatedPdf.pageCount,
          }
        );
      }

      await updateUploadTransactionState(transactionId, "committed", {
        committedResourceId: committedResource.id,
        committedVersionId: committedResource.currentVersionId,
      });

      return {
        transactionId,
        resourceId: committedResource.id,
        versionId: committedResource.currentVersionId,
      };

    } catch (err: any) {
      // 15.1 Failure after Drive success (Immediate Compensation)
      const isConflict = err.message && err.message.includes("Duplicate");
      const errCode = isConflict ? "DUPLICATE_RESOURCE_VERSION" : "INTERNAL_ERROR";
      
      let deletedDrive = false;
      try {
        await this.storageProvider.delete(storageMetadata.storageKey);
        deletedDrive = true;
      } catch (delErr) {
        // Compensation deletion failed
      }

      if (deletedDrive) {
        await updateUploadTransactionState(transactionId, "failed", {
          errorCode: errCode,
          sanitizedErrorMessage: err.message,
        });
      } else {
        await updateUploadTransactionState(transactionId, "cleanup_required", {
          errorCode: errCode,
          sanitizedErrorMessage: err.message,
          cleanupAttemptCount: 1,
        });
      }

      throw new UploadError(errCode, err.message);
    }
  }

  private async failTransaction(transactionId: string, errorCode: string, message: string) {
    await updateUploadTransactionState(transactionId, "failed", {
      errorCode,
      sanitizedErrorMessage: message,
    });
  }
}
