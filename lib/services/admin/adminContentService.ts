import "server-only";
import { getAdminFirestore } from "../../firebase/admin";
import {
  AdminResourceDto,
  AdminResourceVersionDto,
  Resource,
  ResourceVersion,
} from "../../resources/types";

function iso(timestamp: { toDate?: () => Date; seconds?: number } | null | undefined): string {
  if (timestamp?.toDate) return timestamp.toDate().toISOString();
  if (typeof timestamp?.seconds === "number") return new Date(timestamp.seconds * 1000).toISOString();
  return new Date(0).toISOString();
}

function toAdminResource(doc: FirebaseFirestore.DocumentSnapshot): AdminResourceDto {
  const resource = doc.data() as Resource;
  return {
    id: doc.id,
    type: resource.type,
    title: resource.title,
    boardId: resource.boardId,
    classId: resource.classId,
    subjectId: resource.subjectId,
    chapterId: resource.chapterId,
    examinationBoardId: resource.examinationBoardId ?? null,
    paperYear: resource.paperYear ?? null,
    paperSession: resource.paperSession ?? null,
    paperType: resource.paperType ?? null,
    language: resource.language,
    curriculumVersion: resource.curriculumVersion,
    displayOrder: resource.displayOrder,
    publishedAt: resource.publishedAt ? iso(resource.publishedAt) : null,
    status: resource.status,
    currentVersionId: resource.currentVersionId,
    createdAt: iso(resource.createdAt),
    updatedAt: iso(resource.updatedAt),
  };
}

function toAdminVersion(doc: FirebaseFirestore.DocumentSnapshot): AdminResourceVersionDto {
  const version = doc.data() as ResourceVersion;
  return {
    id: doc.id,
    originalFilename: version.originalFilename,
    sizeBytes: version.sizeBytes,
    pageCount: version.pageCount,
    supersedesVersionId: version.supersedesVersionId,
    createdAt: iso(version.createdAt),
  };
}

export async function listAdminResources(cursor?: string, limit: number = 20) {
  const adminDb = getAdminFirestore();
  let query = adminDb.collection("resources")
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (cursor) {
    const doc = await adminDb.collection("resources").doc(cursor).get();
    if (doc.exists) {
      query = query.startAfter(doc);
    }
  }

  const snapshot = await query.get();
  return {
    resources: snapshot.docs.map(toAdminResource),
    nextCursor: snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null
  };
}

export async function getAdminResourceDetail(resourceId: string) {
  const adminDb = getAdminFirestore();
  const doc = await adminDb.collection("resources").doc(resourceId).get();
  if (!doc.exists) return null;
  
  const versionsSnapshot = await adminDb.collection("resources").doc(resourceId).collection("versions").orderBy("createdAt", "desc").get();
  const versions = versionsSnapshot.docs.map(toAdminVersion);

  return {
    resource: toAdminResource(doc),
    versions
  };
}
