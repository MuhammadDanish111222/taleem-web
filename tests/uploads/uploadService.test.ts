import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UploadService } from "../../lib/services/admin/uploadService";
import { StorageProvider } from "../../lib/storage/StorageProvider";
import { UploadError } from "../../lib/uploads/errors";
import { ValidatedPdf } from "../../lib/security/pdfValidation";
import { TempFile } from "../../lib/security/tempFile";

const mockStorageProvider: StorageProvider = {
  upload: vi.fn(),
  delete: vi.fn(),
  getMetadata: vi.fn(),
  readRange: vi.fn(),
};

vi.mock("../../lib/repositories/firestore/uploadTransactionRepository", () => ({
  createUploadTransaction: vi.fn(),
  getUploadTransaction: vi.fn(),
  updateUploadTransactionState: vi.fn(),
  checkDuplicateContent: vi.fn(),
}));

vi.mock("../../lib/services/admin/resourceService", () => ({
  createDraftResourceWithInitialVersion: vi.fn(),
  addResourceVersion: vi.fn(),
}));

import { getUploadTransaction, createUploadTransaction, updateUploadTransactionState, checkDuplicateContent } from "../../lib/repositories/firestore/uploadTransactionRepository";
import { createDraftResourceWithInitialVersion } from "../../lib/services/admin/resourceService";

describe("Upload Service Failure Paths", () => {
  let uploadService: UploadService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    uploadService = new UploadService(mockStorageProvider);
  });

  const dummyPdf: ValidatedPdf = {
    sizeBytes: 1024,
    sha256: "dummyhash",
    pageCount: 5,
    mimeType: "application/pdf",
    originalFilename: "test.pdf",
  };

  const dummyTempFile: TempFile = {
    filepath: "dummy",
    writeStream: {} as any,
    cleanup: vi.fn(),
  };

  const metadata = {
    operation: "create_resource",
    type: "past_paper",
    title: "Test Resource",
    boardId: "b1",
    classId: "c1",
    subjectId: "s1",
    language: "en",
    curriculumVersion: "2023",
    displayOrder: "1",
  };

  it("should reject duplicate idempotency key (IDEMPOTENCY_IN_PROGRESS)", async () => {
    vi.mocked(getUploadTransaction).mockResolvedValueOnce({ state: "pending" } as any);
    
    await expect(uploadService.processUpload(
      "admin1", "req1", "idem1", metadata, dummyPdf, dummyTempFile
    )).rejects.toThrowError(new UploadError("IDEMPOTENCY_IN_PROGRESS", "A request with this idempotency key is already in progress."));
  });

  it("should reject duplicate content payload", async () => {
    vi.mocked(getUploadTransaction).mockResolvedValueOnce(null);
    vi.mocked(checkDuplicateContent).mockResolvedValueOnce({ committedResourceId: "res123" } as any);

    await expect(uploadService.processUpload(
      "admin1", "req1", "idem1", metadata, dummyPdf, dummyTempFile
    )).rejects.toThrowError(new UploadError("DUPLICATE_CONTENT", "Duplicate content within the same scope."));
  });

  it("should trigger immediate compensation (delete from Drive) if Firestore metadata commit fails", async () => {
    vi.mocked(getUploadTransaction).mockResolvedValueOnce(null);
    vi.mocked(checkDuplicateContent).mockResolvedValueOnce(null);
    vi.mocked(mockStorageProvider.upload).mockResolvedValueOnce({ 
      provider: "google_drive",
      storageKey: "file_123",
      name: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      providerRevision: "1",
      canDownload: true
    });
    
    // Simulate Firestore failure during resource commit
    vi.mocked(createDraftResourceWithInitialVersion).mockRejectedValueOnce(new Error("Firestore commit failed"));

    await expect(uploadService.processUpload(
      "admin1", "req1", "idem1", metadata, dummyPdf, dummyTempFile
    )).rejects.toThrowError(new UploadError("INTERNAL_ERROR", "Firestore commit failed"));

    // Verify it attempted to delete the orphaned Drive file
    expect(mockStorageProvider.delete).toHaveBeenCalledWith("file_123");
    
    // Verify it updated the transaction state to failed (since Drive delete succeeded)
    expect(updateUploadTransactionState).toHaveBeenCalledWith(expect.any(String), "failed", expect.anything());
  });

  it("should mark cleanup_required if compensation Drive deletion ALSO fails", async () => {
    vi.mocked(getUploadTransaction).mockResolvedValueOnce(null);
    vi.mocked(checkDuplicateContent).mockResolvedValueOnce(null);
    vi.mocked(mockStorageProvider.upload).mockResolvedValueOnce({ 
      provider: "google_drive",
      storageKey: "file_123",
      name: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      providerRevision: "1",
      canDownload: true
    });
    
    vi.mocked(createDraftResourceWithInitialVersion).mockRejectedValueOnce(new Error("Firestore commit failed"));
    vi.mocked(mockStorageProvider.delete).mockRejectedValueOnce(new Error("Drive delete failed"));

    await expect(uploadService.processUpload(
      "admin1", "req1", "idem1", metadata, dummyPdf, dummyTempFile
    )).rejects.toThrowError(new UploadError("INTERNAL_ERROR", "Firestore commit failed"));

    // Verify it updated the transaction state to cleanup_required
    expect(updateUploadTransactionState).toHaveBeenCalledWith(expect.any(String), "cleanup_required", expect.objectContaining({
      errorCode: "INTERNAL_ERROR",
      cleanupAttemptCount: 1,
    }));
  });
});
