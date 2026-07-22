import "server-only";
import { z } from "zod";
import { getAdminFirestore } from "../firebase/admin";
import { PublicResourceDto, Resource } from "../resources/types";
import { validateCatalogueHierarchy } from "../services/catalogue/catalogueHierarchyService";
import { tokenize } from "./normalize";

export const CANDIDATE_LIMIT = 50;

export const searchResourceQuerySchema = z.object({
  boardId: z.string().min(1, "Board ID is required"),
  classId: z.string().min(1, "Class ID is required"),
  query: z.string().min(2, "Search query must be at least 2 characters").max(100, "Search query max length is 100 characters"),
  subjectId: z.string().min(1).optional(),
  type: z.enum(["book", "note", "past_paper"]).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type SearchResourceQueryInput = z.input<typeof searchResourceQuerySchema>;
export type SearchResourceQuery = z.infer<typeof searchResourceQuerySchema>;

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

export async function searchPublicResources(input: SearchResourceQueryInput): Promise<{ data: PublicResourceDto[] }> {
  const query = searchResourceQuerySchema.parse(input);

  // Validate hierarchy (board + class mandatory, subject optional)
  await validateCatalogueHierarchy(query.boardId, query.classId, query.subjectId ?? null);

  const tokens = tokenize(query.query);
  // Zero-token query short-circuit (e.g. punctuation-only queries like "!?" or "---")
  if (tokens.length === 0) {
    return { data: [] };
  }

  // Pick primary selective token (longest token)
  const primaryToken = tokens.reduce(
    (longest, current) => (current.length > longest.length ? current : longest),
    tokens[0]
  );

  const db = getAdminFirestore();
  let dbQuery = db.collection("resources")
    .where("status", "==", "published")
    .where("boardId", "==", query.boardId)
    .where("classId", "==", query.classId);

  if (query.subjectId) {
    dbQuery = dbQuery.where("subjectId", "==", query.subjectId);
  }
  if (query.type) {
    dbQuery = dbQuery.where("type", "==", query.type);
  }

  dbQuery = dbQuery
    .where("searchPrefixes", "array-contains", primaryToken)
    .orderBy("displayOrder", "asc")
    .limit(CANDIDATE_LIMIT);

  const snapshot = await dbQuery.get();
  const candidates = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as Resource));

  // In-memory AND verification & scoring
  interface ScoredCandidate {
    resource: Resource;
    exactMatches: number;
    prefixMatches: number;
  }

  const verifiedScored: ScoredCandidate[] = [];

  for (const resource of candidates) {
    const resTokens = new Set(resource.searchTokens ?? []);
    const resPrefixes = new Set(resource.searchPrefixes ?? []);

    let matchesAll = true;
    let exactMatches = 0;
    let prefixMatches = 0;

    for (const t of tokens) {
      const isExact = resTokens.has(t);
      const isPrefix = resPrefixes.has(t);

      if (!isExact && !isPrefix) {
        matchesAll = false;
        break;
      }

      if (isExact) {
        exactMatches++;
      } else {
        prefixMatches++;
      }
    }

    if (matchesAll) {
      verifiedScored.push({
        resource,
        exactMatches,
        prefixMatches,
      });
    }
  }

  // Deterministic ranking
  verifiedScored.sort((a, b) => {
    // 1. Exact match count descending
    if (b.exactMatches !== a.exactMatches) {
      return b.exactMatches - a.exactMatches;
    }
    // 2. Prefix match count descending
    if (b.prefixMatches !== a.prefixMatches) {
      return b.prefixMatches - a.prefixMatches;
    }
    // 3. displayOrder ascending
    if (a.resource.displayOrder !== b.resource.displayOrder) {
      return a.resource.displayOrder - b.resource.displayOrder;
    }
    // 4. Document id ascending (tie breaker)
    return a.resource.id.localeCompare(b.resource.id);
  });

  const sliced = verifiedScored.slice(0, query.limit);
  return {
    data: sliced.map((item) => toPublicDto(item.resource)),
  };
}
