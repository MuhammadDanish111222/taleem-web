import "server-only";
import { getAdminFirestore } from "../../firebase/admin";
import { Resource, ResourceVersion } from "../../resources/types";
import { DocumentSnapshot, Timestamp, Transaction } from "firebase-admin/firestore";
import { ResourceError } from "../../resources/errors";
import * as crypto from "crypto";

const db = () => getAdminFirestore();

export function getResourceRef(resourceId: string) {
  return db().collection("resources").doc(resourceId);
}

export function getResourceVersionRef(resourceId: string, versionId: string) {
  return getResourceRef(resourceId).collection("versions").doc(versionId);
}

function parseResource(doc: DocumentSnapshot): Resource {
  if (!doc.exists) {
    throw new ResourceError("NOT_FOUND", `Resource ${doc.id} not found.`);
  }
  const data = doc.data() as any;
  return {
    ...data,
    id: doc.id,
  };
}

function parseResourceVersion(doc: DocumentSnapshot): ResourceVersion {
  if (!doc.exists) {
    throw new ResourceError("NOT_FOUND", `Resource version ${doc.id} not found.`);
  }
  const data = doc.data() as any;
  return {
    ...data,
    id: doc.id,
  };
}

export async function runResourceTransaction<T>(
  updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> {
  return db().runTransaction(updateFunction);
}

export async function getResource(resourceId: string): Promise<Resource> {
  const doc = await getResourceRef(resourceId).get();
  return parseResource(doc);
}

export async function getResourceVersion(
  resourceId: string,
  versionId: string
): Promise<ResourceVersion> {
  const doc = await getResourceVersionRef(resourceId, versionId).get();
  return parseResourceVersion(doc);
}

export function generateResourceId(): string {
  return crypto.randomUUID();
}

export function generateVersionId(): string {
  return crypto.randomUUID();
}

export function createResourceTransactionally(
  transaction: Transaction,
  resource: Omit<Resource, "id">,
  resourceId: string
) {
  const ref = getResourceRef(resourceId);
  transaction.set(ref, {
    ...resource,
    id: resourceId,
  });
}

export function createVersionTransactionally(
  transaction: Transaction,
  version: Omit<ResourceVersion, "id">,
  versionId: string
) {
  const ref = getResourceVersionRef(version.resourceId, versionId);
  transaction.set(ref, {
    ...version,
    id: versionId,
  });
}

export function updateResourceTransactionally(
  transaction: Transaction,
  resourceId: string,
  updates: Partial<Resource>
) {
  const ref = getResourceRef(resourceId);
  transaction.update(ref, updates);
}

export async function checkDuplicateResourceContent(
  sha256: string,
  resourceType: string,
  boardId: string,
  classId: string,
  subjectId: string,
  chapterId: string | null
): Promise<{ resourceId: string, versionId: string } | null> {
  // First, check resources collection for exact match scope
  let query = db().collection("resources")
    .where("type", "==", resourceType)
    .where("boardId", "==", boardId)
    .where("classId", "==", classId)
    .where("subjectId", "==", subjectId);

  if (chapterId) {
    query = query.where("chapterId", "==", chapterId);
  } else {
    query = query.where("chapterId", "==", null);
  }

  const matchingResources = await query.get();
  if (matchingResources.empty) return null;

  // For each matching resource, check its versions for the sha256
  for (const doc of matchingResources.docs) {
    const versionsSnapshot = await doc.ref.collection("versions")
      .where("sha256", "==", sha256)
      .limit(1)
      .get();
    
    if (!versionsSnapshot.empty) {
      return {
        resourceId: doc.id,
        versionId: versionsSnapshot.docs[0].id
      };
    }
  }

  return null;
}

export async function checkDuplicateResourceVersion(
  resourceId: string,
  sha256: string
): Promise<string | null> {
  const versionsSnapshot = await getResourceRef(resourceId).collection("versions")
    .where("sha256", "==", sha256)
    .limit(1)
    .get();

  if (!versionsSnapshot.empty) {
    return versionsSnapshot.docs[0].id;
  }
  return null;
}
