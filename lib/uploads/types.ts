import { FirebaseTimestamp } from "../resources/types";

export type UploadTransactionState =
  | "pending"
  | "uploaded"
  | "committed"
  | "cleanup_required"
  | "failed";

export type UploadOperation = "create_resource" | "replace_version";

export interface UploadTransaction {
  id: string;

  idempotencyKeyHash: string;
  adminUid: string;
  requestId: string;
  requestFingerprint: string;

  operation: UploadOperation;
  resourceId: string | null;

  resourceType: "book" | "note" | "past_paper";
  boardId: string;
  classId: string;
  subjectId: string;
  chapterId: string | null;

  state: UploadTransactionState;

  originalFilename: string | null;
  mimeType: "application/pdf" | null;
  sizeBytes: number | null;
  sha256: string | null;
  pageCount: number | null;

  storageProvider: "google_drive" | null;
  storageKey: string | null;
  providerRevision: string | null;

  committedResourceId: string | null;
  committedVersionId: string | null;

  duplicateOfTransactionId: string | null;

  errorCode: string | null;
  sanitizedErrorMessage: string | null;

  cleanupAttemptCount: number;
  cleanupLastAttemptAt: FirebaseTimestamp | null;
  cleanupCompletedAt: FirebaseTimestamp | null;

  createdAt: FirebaseTimestamp;
  updatedAt: FirebaseTimestamp;
  uploadedAt: FirebaseTimestamp | null;
  committedAt: FirebaseTimestamp | null;
  failedAt: FirebaseTimestamp | null;

  schemaVersion: 1;
}
