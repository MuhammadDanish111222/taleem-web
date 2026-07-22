import "server-only";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { Chapter } from "@/lib/firestore/types";
import { PublicResourceDto, Resource, ResourceStatus } from "@/lib/resources/types";

export interface ContentNodeTreeItem {
  id: string;
  title: string;
  slug: string;
  chapter_number: number | null;
  parentNodeId: string | null;
  display_order: number;
  resources: PublicResourceDto[];
  children: ContentNodeTreeItem[];
  hasContentInSubtree: boolean;
}

export interface PastPaperGroup {
  examinationBoardId: string | null;
  years: {
    year: number | null;
    papers: PublicResourceDto[];
  }[];
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
    publishedAt: resource.publishedAt
      ? new Date(resource.publishedAt.seconds * 1000).toISOString()
      : null,
  };
}

export async function getSubjectNotesTree(
  boardId: string,
  classId: string,
  subjectId: string,
  statusFilter: ResourceStatus = "published"
): Promise<ContentNodeTreeItem[]> {
  const db = getAdminFirestore();

  // 1. ONE Query for content nodes (chapters)
  const chaptersSnapshot = await db
    .collection(`boards/${boardId}/classes/${classId}/subjects/${subjectId}/chapters`)
    .where("active", "==", true)
    .orderBy("display_order", "asc")
    .get();

  // 2. ONE Query for published notes resources
  const resourcesSnapshot = await db
    .collection("resources")
    .where("boardId", "==", boardId)
    .where("classId", "==", classId)
    .where("subjectId", "==", subjectId)
    .where("type", "==", "note")
    .where("status", "==", statusFilter)
    .orderBy("displayOrder", "asc")
    .get();

  const resources = resourcesSnapshot.docs.map((doc) =>
    toPublicDto({ ...doc.data(), id: doc.id } as Resource)
  );

  // Map resources by chapterId
  const resourcesByChapter = new Map<string, PublicResourceDto[]>();
  for (const res of resources) {
    if (res.chapterId) {
      const existing = resourcesByChapter.get(res.chapterId) || [];
      existing.push(res);
      resourcesByChapter.set(res.chapterId, existing);
    }
  }

  // Create node map
  const nodeMap = new Map<string, ContentNodeTreeItem>();
  const nodesList: ContentNodeTreeItem[] = [];

  for (const doc of chaptersSnapshot.docs) {
    const data = doc.data() as Chapter;
    const nodeItem: ContentNodeTreeItem = {
      id: doc.id,
      title: data.title,
      slug: data.slug || doc.id,
      chapter_number: data.chapter_number ?? null,
      parentNodeId: (data as any).parentNodeId ?? null,
      display_order: data.display_order ?? 0,
      resources: resourcesByChapter.get(doc.id) || [],
      children: [],
      hasContentInSubtree: false,
    };
    nodeMap.set(doc.id, nodeItem);
    nodesList.push(nodeItem);
  }

  // Assemble parent-children hierarchy
  const rootNodes: ContentNodeTreeItem[] = [];
  for (const node of nodesList) {
    if (node.parentNodeId && nodeMap.has(node.parentNodeId)) {
      const parent = nodeMap.get(node.parentNodeId)!;
      parent.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // Recursive bottom-up pass computing hasContentInSubtree and pruning false branches
  function computeAndPrune(node: ContentNodeTreeItem): boolean {
    const hasDirect = node.resources.length > 0;
    
    // Prune children first
    node.children = node.children.filter((child) => computeAndPrune(child));
    const hasChildrenContent = node.children.length > 0;

    node.hasContentInSubtree = hasDirect || hasChildrenContent;
    return node.hasContentInSubtree;
  }

  return rootNodes.filter((root) => computeAndPrune(root));
}

export async function getSubjectPastPapersGrouped(
  boardId: string,
  classId: string,
  subjectId: string
): Promise<PastPaperGroup[]> {
  const db = getAdminFirestore();

  // ONE Query for published past_paper resources
  const snapshot = await db
    .collection("resources")
    .where("status", "==", "published")
    .where("boardId", "==", boardId)
    .where("classId", "==", classId)
    .where("subjectId", "==", subjectId)
    .where("type", "==", "past_paper")
    .orderBy("displayOrder", "asc")
    .get();

  const resources = snapshot.docs.map((doc) =>
    toPublicDto({ ...doc.data(), id: doc.id } as Resource)
  );

  // Group by examinationBoardId -> paperYear
  const boardMap = new Map<string | null, Map<number | null, PublicResourceDto[]>>();

  for (const res of resources) {
    const boardKey = res.examinationBoardId ?? null;
    const yearKey = res.paperYear ?? null;

    if (!boardMap.has(boardKey)) {
      boardMap.set(boardKey, new Map());
    }
    const yearMap = boardMap.get(boardKey)!;

    if (!yearMap.has(yearKey)) {
      yearMap.set(yearKey, []);
    }
    yearMap.get(yearKey)!.push(res);
  }

  const result: PastPaperGroup[] = [];

  for (const [boardIdKey, yearMap] of boardMap.entries()) {
    const yearsArray: { year: number | null; papers: PublicResourceDto[] }[] = [];
    for (const [year, papers] of yearMap.entries()) {
      yearsArray.push({ year, papers });
    }
    // Sort years descending
    yearsArray.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

    result.push({
      examinationBoardId: boardIdKey,
      years: yearsArray,
    });
  }

  return result;
}
