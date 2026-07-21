export type ResourceType = "book" | "note" | "past_paper";

export type ResourceStatus = "draft" | "published" | "hidden" | "archived";

export interface FirebaseTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
}

export interface Resource {
  id: string; // derived from document ID in application DTOs
  type: ResourceType;
  title: string;

  boardId: string;
  classId: string;
  subjectId: string;
  chapterId: string | null;

  status: ResourceStatus;
  currentVersionId: string;

  language: string;
  curriculumVersion: string;
  displayOrder: number;

  createdBy: string;
  updatedBy: string;

  createdAt: FirebaseTimestamp;
  updatedAt: FirebaseTimestamp;

  publishedAt?: FirebaseTimestamp | null;
  hiddenAt?: FirebaseTimestamp | null;
  archivedAt?: FirebaseTimestamp | null;

  schemaVersion: 1;
}

export interface ResourceVersion {
  id: string;
  resourceId: string;

  storageProvider: "google_drive";
  storageKey: string;

  originalFilename: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  sha256: string;

  providerRevision: string;
  pageCount: number;

  supersedesVersionId: string | null;

  createdBy: string;
  createdAt: FirebaseTimestamp;

  schemaVersion: 1;
}

export interface PublicResourceDto {
  id: string;
  type: ResourceType;
  title: string;
  boardId: string;
  classId: string;
  subjectId: string;
  chapterId: string | null;
  language: string;
  curriculumVersion: string;
  displayOrder: number;
  publishedAt: string | null;
}
