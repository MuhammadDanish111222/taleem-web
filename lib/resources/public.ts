import "server-only";
import { getAdminFirestore } from "../firebase/admin";
import { PublicResourceDto, Resource } from "./types";
import { publicResourceQuerySchema } from "./validation";
import { validateCatalogueHierarchy } from "../services/catalogue/catalogueHierarchyService";
import { ResourceError } from "./errors";

export interface PublicResourceQuery {
  boardId: string;
  classId: string;
  subjectId: string;
  chapterId?: string;
  type?: "book" | "note" | "past_paper";
  examinationBoardId?: string;
  paperYear?: number;
  paperSession?: string;
  paperType?: string;
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
    examinationBoardId: resource.examinationBoardId ?? null,
    paperYear: resource.paperYear ?? null,
    paperSession: resource.paperSession ?? null,
    paperType: resource.paperType ?? null,
    language: resource.language,
    curriculumVersion: resource.curriculumVersion,
    displayOrder: resource.displayOrder,
    publishedAt: resource.publishedAt ? new Date(resource.publishedAt.seconds * 1000).toISOString() : null,
  };
}

export const MAX_CANDIDATE_BATCHES_PER_REQUEST = 5;

function parseCursor(cursorStr: string): { displayOrder: number; id: string } {
  try {
    const decoded = Buffer.from(cursorStr, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (e) {
    throw new ResourceError("VALIDATION_FAILED", "Invalid cursor format");
  }
}

function encodeCursor(cursorData: { displayOrder: number; id: string }): string {
  return Buffer.from(JSON.stringify(cursorData)).toString("base64");
}

function matchesPastPaperFilters(dto: PublicResourceDto, query: PublicResourceQuery): boolean {
  if (query.examinationBoardId && dto.examinationBoardId !== query.examinationBoardId) {
    return false;
  }
  if (query.paperYear !== undefined && dto.paperYear !== query.paperYear) {
    return false;
  }
  if (query.paperSession && dto.paperSession !== query.paperSession) {
    return false;
  }
  if (query.paperType && dto.paperType !== query.paperType) {
    return false;
  }
  return true;
}

export async function listPublicResources(input: PublicResourceQuery): Promise<PublicResourceResponse> {
  const query = publicResourceQuerySchema.parse(input);

  await validateCatalogueHierarchy(query.boardId, query.classId, query.subjectId, query.chapterId ?? null);

  const db = getAdminFirestore();
  const buildBaseQuery = () => {
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
    return dbQuery.orderBy("displayOrder", "asc").orderBy("__name__", "asc");
  };

  const hasPastPaperFilter = !!(
    query.examinationBoardId ||
    query.paperYear !== undefined ||
    query.paperSession ||
    query.paperType
  );

  // Single-batch behavior if no past paper filters are set
  if (!hasPastPaperFilter) {
    let dbQuery = buildBaseQuery().limit(query.limit);
    if (query.cursor) {
      const cursorData = parseCursor(query.cursor);
      dbQuery = dbQuery.startAfter(cursorData.displayOrder, cursorData.id);
    }

    const snapshot = await dbQuery.get();
    const data = snapshot.docs.map(doc => toPublicDto({ ...doc.data(), id: doc.id } as Resource));

    let nextCursor: string | null = null;
    if (snapshot.docs.length === query.limit) {
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      nextCursor = encodeCursor({
        displayOrder: lastDoc.data().displayOrder,
        id: lastDoc.id,
      });
    }

    return { data, nextCursor };
  }

  // Bounded candidate loop when in-memory past paper filtering is active
  let accumulatedMatches: PublicResourceDto[] = [];
  let currentCursorData = query.cursor ? parseCursor(query.cursor) : null;
  let nextCursor: string | null = null;

  for (let batchCount = 0; batchCount < MAX_CANDIDATE_BATCHES_PER_REQUEST; batchCount++) {
    let dbQuery = buildBaseQuery().limit(query.limit);
    if (currentCursorData) {
      dbQuery = dbQuery.startAfter(currentCursorData.displayOrder, currentCursorData.id);
    }

    const snapshot = await dbQuery.get();
    if (snapshot.empty) {
      nextCursor = null;
      break;
    }

    const rawDocs = snapshot.docs;
    const lastRawDoc = rawDocs[rawDocs.length - 1];
    const lastRawCursorData = {
      displayOrder: lastRawDoc.data().displayOrder,
      id: lastRawDoc.id,
    };

    // Filter raw batch in memory
    for (const doc of rawDocs) {
      const dto = toPublicDto({ ...doc.data(), id: doc.id } as Resource);
      if (matchesPastPaperFilters(dto, query)) {
        accumulatedMatches.push(dto);
      }
    }

    currentCursorData = lastRawCursorData;

    if (accumulatedMatches.length >= query.limit) {
      accumulatedMatches = accumulatedMatches.slice(0, query.limit);
      nextCursor = encodeCursor(lastRawCursorData);
      break;
    }

    if (rawDocs.length < query.limit) {
      nextCursor = null;
      break;
    }

    nextCursor = encodeCursor(lastRawCursorData);
  }

  return {
    data: accumulatedMatches,
    nextCursor,
  };
}
