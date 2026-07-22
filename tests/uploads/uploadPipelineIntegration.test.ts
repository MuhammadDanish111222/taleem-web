import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadService } from "../../lib/services/admin/uploadService";
import { StorageProvider } from "../../lib/storage/StorageProvider";
import { createTempFile } from "../../lib/security/tempFile";
import { validatePdf } from "../../lib/security/pdfValidation";
import { PDFDocument } from "pdf-lib";
import * as crypto from "crypto";

// In-Memory Firestore Document Stores for Integration Testing
const txStore = new Map<string, any>();
const resourceStore = new Map<string, any>();

vi.mock("../../lib/repositories/firestore/uploadTransactionRepository", () => ({
  createUploadTransaction: vi.fn().mockImplementation(async (tx: any) => {
    txStore.set(tx.id, { ...tx, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }),
  getUploadTransaction: vi.fn().mockImplementation(async (id: string) => {
    return txStore.get(id) || null;
  }),
  updateUploadTransactionState: vi.fn().mockImplementation(async (id: string, state: string, updates: any) => {
    const existing = txStore.get(id);
    if (existing) {
      txStore.set(id, { ...existing, state, ...updates, updatedAt: new Date().toISOString() });
    }
  }),
}));

vi.mock("../../lib/repositories/firestore/resourceRepository", () => ({
  checkDuplicateResourceContent: vi.fn().mockResolvedValue(null),
  checkDuplicateResourceVersion: vi.fn().mockResolvedValue(null),
  getResource: vi.fn().mockImplementation(async (id: string) => {
    return resourceStore.get(id) || null;
  }),
}));

vi.mock("../../lib/services/admin/resourceService", () => ({
  createDraftResourceWithInitialVersion: vi.fn().mockImplementation(async (session: any, input: any, versionInput: any) => {
    const resId = `res_${Date.now()}`;
    const verId = `ver_${Date.now()}`;
    const resourceDoc = {
      id: resId,
      title: input.title,
      type: input.type,
      boardId: input.boardId,
      classId: input.classId,
      subjectId: input.subjectId,
      currentVersionId: verId,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    resourceStore.set(resId, resourceDoc);
    return resourceDoc;
  }),
  addResourceVersion: vi.fn(),
}));

class MockDriveProvider implements StorageProvider {
  async upload(input: any): Promise<any> {
    if (input.body && typeof input.body.destroy === "function") {
      input.body.destroy();
    }
    return {
      provider: "google_drive",
      storageKey: "mock-drive-key-123",
      name: input.filename,
      mimeType: "application/pdf",
      sizeBytes: input.sizeBytes,
      providerRevision: "rev-1",
      canDownload: true,
    };
  }
  async getMetadata(): Promise<any> { return null; }
  async readRange(): Promise<any> { return null as any; }
  async delete(): Promise<void> {}
}

describe("Full End-to-End Upload Service Pipeline (State Machine Verification)", () => {
  beforeEach(() => {
    txStore.clear();
    resourceStore.clear();
  });

  it("should execute full upload pipeline, commit Firestore transaction & resource, and support idempotency replay", async () => {
    const service = new UploadService(new MockDriveProvider());

    // 1. Create a minimal valid 1-page PDF document using pdf-lib
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    const actualSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    // Write to real temp file
    const tempFile = await createTempFile();
    await new Promise<void>((resolve) => {
      tempFile.writeStream.write(pdfBuffer, () => {
        tempFile.writeStream.end(() => resolve());
      });
    });

    // Run PDF validation (magic bytes check + worker thread pdf-lib parsing)
    const validatedPdf = await validatePdf({
      tempFile,
      sha256: actualSha256,
      sizeBytes: pdfBuffer.length,
      originalFilename: "full_pipeline_test.pdf",
      mimeType: "application/pdf",
      magicBytesValid: true,
    });

    expect(validatedPdf.pageCount).toBe(1);
    expect(validatedPdf.sha256).toBe(actualSha256);

    const adminUid = "admin-user-999";
    const requestId = "req-uuid-12345";
    const idempotencyKey = `e2e-idempotency-${Date.now()}`;
    const metadataFields = {
      operation: "create_resource",
      type: "book",
      title: "Complete Physics Guide Class 9",
      boardId: "fbise",
      classId: "class-9",
      subjectId: "physics",
      language: "en",
      curriculumVersion: "2024",
      displayOrder: "1",
    };

    // 2. Process Upload through UploadService
    const result = await service.processUpload(
      adminUid,
      requestId,
      idempotencyKey,
      metadataFields,
      validatedPdf,
      tempFile
    );

    expect(result.transactionId).toBeDefined();
    expect(result.resourceId).toBeDefined();
    expect(result.versionId).toBeDefined();

    // 3. Inspect committed transaction record
    const txDoc = txStore.get(result.transactionId);
    expect(txDoc).not.toBeUndefined();
    expect(txDoc?.state).toBe("committed");
    expect(txDoc?.adminUid).toBe(adminUid);
    expect(txDoc?.committedResourceId).toBe(result.resourceId);
    expect(txDoc?.committedVersionId).toBe(result.versionId);
    expect(txDoc?.pageCount).toBe(1);
    expect(txDoc?.sha256).toBe(actualSha256);

    // 4. Inspect committed resource record
    const resourceDoc = resourceStore.get(result.resourceId);
    expect(resourceDoc).not.toBeUndefined();
    expect(resourceDoc?.title).toBe("Complete Physics Guide Class 9");
    expect(resourceDoc?.boardId).toBe("fbise");
    expect(resourceDoc?.classId).toBe("class-9");
    expect(resourceDoc?.subjectId).toBe("physics");
    expect(resourceDoc?.currentVersionId).toBe(result.versionId);

    // 5. Test Idempotency Replay (Sending exact same idempotency key returns replayed status)
    const replayedResult = await service.processUpload(
      adminUid,
      requestId,
      idempotencyKey,
      metadataFields,
      validatedPdf,
      tempFile
    );

    expect(replayedResult.replayed).toBe(true);
    expect(replayedResult.transactionId).toBe(result.transactionId);
    expect(replayedResult.resourceId).toBe(result.resourceId);
    expect(replayedResult.versionId).toBe(result.versionId);

    // Cleanup temp file
    await tempFile.cleanup();
  });
});
