import "server-only";
import { getAdminFirestore } from "../firebase/admin";
import { PublicResourceDto, Resource } from "./types";
import { publicResourceQuerySchema } from "./validation";
import { validateCatalogueHierarchy } from "../services/catalogue/catalogueHierarchyService";

export interface PublicResourceQuery {
  boardId: string;
  classId: string;
  subjectId: string;
  chapterId?: string;
  type?: "book" | "note" | "past_paper";
  limit?: number;
  cursor?: string; // Base64 encoded JSON string
}

export interface PublicResourceResponse {
  data: PublicResourceDto[];
  nextCursor: string | null;
}

function toPublicDto(resource: Resource): PublicResourceDto {
  return {
    id: resource.id,
    type: resource.type,
    title: resource.title,
    boardId: resource.boardId,
    classId: resource.classId,
    subjectId: resource.subjectId,
    chapterId: resource.chapterId,
    language: resource.language,
    curriculumVersion: resource.curriculumVersion,
    displayOrder: resource.displayOrder,
    publishedAt: resource.publishedAt ? new Date(resource.publishedAt.seconds * 1000).toISOString() : null,
  };
}

export async function listPublicResources(input: PublicResourceQuery): Promise<PublicResourceResponse> {
  const query = publicResourceQuerySchema.parse(input);

  await validateCatalogueHierarchy(query.boardId, query.classId, query.subjectId, query.chapterId ?? null);

  const db = getAdminFirestore();
  let dbQuery = db.collection("resources")
    .where("status", "==", "published")
    .where("boardId", "==", query.boardId)
    .where("classId", "==", query.classId)
    .where("subjectId", "==", query.subjectId);

  if (query.chapterId) {
    dbQuery = dbQuery.where("chapterId", "==", query.chapterId);
  }
  if (query.type) {
    dbQuery = dbQuery.where("type", "==", query.type);
  }

  dbQuery = dbQuery.orderBy("displayOrder", "asc").orderBy("__name__", "asc").limit(query.limit);

  if (query.cursor) {
    try {
      const decoded = Buffer.from(query.cursor, "base64").toString("utf-8");
      const cursorData = JSON.parse(decoded);
      dbQuery = dbQuery.startAfter(cursorData.displayOrder, cursorData.id);
    } catch (e) {
      // Invalid cursor
      throw new Error("Invalid cursor format");
    }
  }

  const snapshot = await dbQuery.get();
  
  const data = snapshot.docs.map(doc => toPublicDto({ ...doc.data(), id: doc.id } as Resource));
  
  let nextCursor: string | null = null;
  if (snapshot.docs.length === query.limit) {
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const cursorData = {
      displayOrder: lastDoc.data().displayOrder,
      id: lastDoc.id,
    };
    nextCursor = Buffer.from(JSON.stringify(cursorData)).toString("base64");
  }

  return {
    data,
    nextCursor,
  };
}
