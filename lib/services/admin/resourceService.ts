import "server-only";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { Resource, ResourceVersion } from "../../resources/types";
import { ResourceError } from "../../resources/errors";
import {
  createResourceInputSchema,
  resourceVersionMetadataSchema,
} from "../../resources/validation";
import { validateCatalogueHierarchy } from "../catalogue/catalogueHierarchyService";
import {
  generateResourceId,
  generateVersionId,
  getResourceRef,
  getResourceVersionRef,
  runResourceTransaction,
  createResourceTransactionally,
  createVersionTransactionally,
  updateResourceTransactionally,
} from "../../repositories/firestore/resourceRepository";
import { writeAuditLogTransactionally } from "../../repositories/firestore/adminAuditLogRepository";
import { computeSearchFields } from "../../search/normalize";

export interface AdminActorContext {
  uid: string;
  requestId?: string;
}

export async function createDraftResourceWithInitialVersion(
  actor: AdminActorContext,
  input: z.infer<typeof createResourceInputSchema>,
  versionInput: z.infer<typeof resourceVersionMetadataSchema>
): Promise<Resource> {
  const data = createResourceInputSchema.parse(input);
  const versionData = resourceVersionMetadataSchema.parse(versionInput);

  await validateCatalogueHierarchy(data.boardId, data.classId, data.subjectId, data.chapterId);

  const searchFields = computeSearchFields(data.title);

  return runResourceTransaction(async (transaction) => {
    const resourceId = generateResourceId();
    const versionId = generateVersionId();

    const newResource: Omit<Resource, "id"> = {
      type: data.type,
      title: data.title,
      boardId: data.boardId,
      classId: data.classId,
      subjectId: data.subjectId,
      chapterId: data.chapterId,
      examinationBoardId: data.examinationBoardId ?? null,
      paperYear: data.paperYear ?? null,
      paperSession: data.paperSession ?? null,
      paperType: data.paperType ?? null,
      status: "draft",
      currentVersionId: versionId,
      language: data.language,
      curriculumVersion: data.curriculumVersion,
      displayOrder: data.displayOrder,
      createdBy: actor.uid,
      updatedBy: actor.uid,
      createdAt: Timestamp.now() as any,
      updatedAt: Timestamp.now() as any,
      publishedAt: null,
      hiddenAt: null,
      archivedAt: null,
      searchTokens: searchFields.searchTokens,
      searchPrefixes: searchFields.searchPrefixes,
      searchSchemaVersion: searchFields.searchSchemaVersion,
      schemaVersion: 1,
    };

    const newVersion: Omit<ResourceVersion, "id"> = {
      resourceId,
      storageProvider: "google_drive",
      storageKey: versionData.storageKey,
      originalFilename: versionData.originalFilename,
      mimeType: "application/pdf",
      sizeBytes: versionData.sizeBytes,
      sha256: versionData.sha256,
      providerRevision: versionData.providerRevision,
      pageCount: versionData.pageCount,
      supersedesVersionId: null,
      createdBy: actor.uid,
      createdAt: Timestamp.now() as any,
      schemaVersion: 1,
    };

    createResourceTransactionally(transaction, newResource, resourceId);
    createVersionTransactionally(transaction, newVersion, versionId);

    writeAuditLogTransactionally(transaction, {
      actorUid: actor.uid,
      requestId: actor.requestId ?? null,
      action: "resource.created",
      entityType: "resource",
      entityId: resourceId,
      before: null,
      after: { ...newResource, id: resourceId },
    });

    return { ...newResource, id: resourceId } as Resource;
  });
}

export async function addResourceVersion(
  actor: AdminActorContext,
  resourceId: string,
  versionInput: z.infer<typeof resourceVersionMetadataSchema>
): Promise<Resource> {
  const versionData = resourceVersionMetadataSchema.parse(versionInput);

  return runResourceTransaction(async (transaction) => {
    const resourceRef = getResourceRef(resourceId);
    const doc = await transaction.get(resourceRef);

    if (!doc.exists) {
      throw new ResourceError("NOT_FOUND", "Resource not found");
    }
    const resource = doc.data() as Resource;

    if (resource.status === "archived") {
      throw new ResourceError("INVALID_TRANSITION", "Cannot replace version for an archived resource");
    }
    if (resource.status === "published") {
      throw new ResourceError("INVALID_TRANSITION", "Resource must be hidden before version replacement");
    }

    const versionId = generateVersionId();
    const newVersion: Omit<ResourceVersion, "id"> = {
      resourceId,
      storageProvider: "google_drive",
      storageKey: versionData.storageKey,
      originalFilename: versionData.originalFilename,
      mimeType: "application/pdf",
      sizeBytes: versionData.sizeBytes,
      sha256: versionData.sha256,
      providerRevision: versionData.providerRevision,
      pageCount: versionData.pageCount,
      supersedesVersionId: resource.currentVersionId,
      createdBy: actor.uid,
      createdAt: Timestamp.now() as any,
      schemaVersion: 1,
    };

    createVersionTransactionally(transaction, newVersion, versionId);

    const updates = {
      currentVersionId: versionId,
      updatedBy: actor.uid,
      updatedAt: Timestamp.now() as any,
    };
    updateResourceTransactionally(transaction, resourceId, updates);

    writeAuditLogTransactionally(transaction, {
      actorUid: actor.uid,
      requestId: actor.requestId ?? null,
      action: "resource.version_added",
      entityType: "resource",
      entityId: resourceId,
      before: { currentVersionId: resource.currentVersionId },
      after: { currentVersionId: versionId },
    });

    return { ...resource, ...updates } as Resource;
  });
}

export async function publishResource(actor: AdminActorContext, resourceId: string): Promise<Resource> {
  return runResourceTransaction(async (transaction) => {
    const resourceRef = getResourceRef(resourceId);
    const doc = await transaction.get(resourceRef);

    if (!doc.exists) {
      throw new ResourceError("NOT_FOUND", "Resource not found");
    }
    const resource = doc.data() as Resource;

    if (resource.status === "published") {
      throw new ResourceError("INVALID_TRANSITION", "Resource is already published");
    }
    if (resource.status === "archived") {
      throw new ResourceError("INVALID_TRANSITION", "Cannot publish archived resource");
    }
    
    // Check version
    if (!resource.currentVersionId) {
      throw new ResourceError("MISSING_VERSION", "Resource has no current version");
    }
    const versionRef = getResourceVersionRef(resourceId, resource.currentVersionId);
    const versionDoc = await transaction.get(versionRef);
    if (!versionDoc.exists) {
      throw new ResourceError("MISSING_VERSION", "Current version document not found");
    }

    // Must await the validation since it uses other gets (outside transaction for catalogue config, which is cached)
    await validateCatalogueHierarchy(resource.boardId, resource.classId, resource.subjectId, resource.chapterId);

    const updates = {
      status: "published" as const,
      publishedAt: Timestamp.now() as any,
      updatedBy: actor.uid,
      updatedAt: Timestamp.now() as any,
    };

    updateResourceTransactionally(transaction, resourceId, updates);

    writeAuditLogTransactionally(transaction, {
      actorUid: actor.uid,
      requestId: actor.requestId ?? null,
      action: "resource.published",
      entityType: "resource",
      entityId: resourceId,
      before: { status: resource.status },
      after: { status: "published" },
    });

    return { ...resource, ...updates } as Resource;
  });
}

export async function hideResource(actor: AdminActorContext, resourceId: string): Promise<Resource> {
  return runResourceTransaction(async (transaction) => {
    const resourceRef = getResourceRef(resourceId);
    const doc = await transaction.get(resourceRef);

    if (!doc.exists) {
      throw new ResourceError("NOT_FOUND", "Resource not found");
    }
    const resource = doc.data() as Resource;

    if (resource.status !== "published") {
      throw new ResourceError("INVALID_TRANSITION", "Only published resources can be hidden");
    }

    const updates = {
      status: "hidden" as const,
      hiddenAt: Timestamp.now() as any,
      updatedBy: actor.uid,
      updatedAt: Timestamp.now() as any,
    };

    updateResourceTransactionally(transaction, resourceId, updates);

    writeAuditLogTransactionally(transaction, {
      actorUid: actor.uid,
      requestId: actor.requestId ?? null,
      action: "resource.hidden",
      entityType: "resource",
      entityId: resourceId,
      before: { status: resource.status },
      after: { status: "hidden" },
    });

    return { ...resource, ...updates } as Resource;
  });
}

export async function archiveResource(actor: AdminActorContext, resourceId: string): Promise<Resource> {
  return runResourceTransaction(async (transaction) => {
    const resourceRef = getResourceRef(resourceId);
    const doc = await transaction.get(resourceRef);

    if (!doc.exists) {
      throw new ResourceError("NOT_FOUND", "Resource not found");
    }
    const resource = doc.data() as Resource;

    if (resource.status === "archived") {
      throw new ResourceError("INVALID_TRANSITION", "Resource is already archived");
    }

    const updates = {
      status: "archived" as const,
      archivedAt: Timestamp.now() as any,
      updatedBy: actor.uid,
      updatedAt: Timestamp.now() as any,
    };

    updateResourceTransactionally(transaction, resourceId, updates);

    writeAuditLogTransactionally(transaction, {
      actorUid: actor.uid,
      requestId: actor.requestId ?? null,
      action: "resource.archived",
      entityType: "resource",
      entityId: resourceId,
      before: { status: resource.status },
      after: { status: "archived" },
    });

    return { ...resource, ...updates } as Resource;
  });
}

export async function restoreArchivedResource(actor: AdminActorContext, resourceId: string): Promise<Resource> {
  return runResourceTransaction(async (transaction) => {
    const resourceRef = getResourceRef(resourceId);
    const doc = await transaction.get(resourceRef);

    if (!doc.exists) {
      throw new ResourceError("NOT_FOUND", "Resource not found");
    }
    const resource = doc.data() as Resource;

    if (resource.status !== "archived") {
      throw new ResourceError("INVALID_TRANSITION", "Only archived resources can be restored");
    }

    const updates = {
      status: "draft" as const,
      updatedBy: actor.uid,
      updatedAt: Timestamp.now() as any,
    };

    updateResourceTransactionally(transaction, resourceId, updates);

    writeAuditLogTransactionally(transaction, {
      actorUid: actor.uid,
      requestId: actor.requestId ?? null,
      action: "resource.restored",
      entityType: "resource",
      entityId: resourceId,
      before: { status: resource.status },
      after: { status: "draft" },
    });

    return { ...resource, ...updates } as Resource;
  });
}
