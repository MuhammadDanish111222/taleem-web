import "server-only";
import { getAdminFirestore } from "../firebase/admin";
import { Board, ClassDoc, Subject, Chapter } from "./types";
import { cacheLife, cacheTag } from "next/cache";

export async function getBoardServer(boardId: string): Promise<Board | null> {
  "use cache";
  cacheTag("catalogue");
  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  });

  const db = getAdminFirestore();
  const doc = await db.collection("boards").doc(boardId).get();
  
  if (!doc.exists) return null;
  const data = doc.data() as Board;
  if (!data.active) return null;

  return {
    name: data.name,
    slug: data.slug,
    active: data.active,
    display_order: data.display_order,
  };
}

export async function getClassServer(boardId: string, classId: string): Promise<ClassDoc | null> {
  "use cache";
  cacheTag("catalogue");
  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  });

  const db = getAdminFirestore();
  const doc = await db.collection(`boards/${boardId}/classes`).doc(classId).get();
  
  if (!doc.exists) return null;
  const data = doc.data() as ClassDoc;
  if (!data.active) return null;

  return {
    name: data.name,
    slug: data.slug,
    active: data.active,
    display_order: data.display_order,
  };
}

export async function getSubjectServer(boardId: string, classId: string, subjectId: string): Promise<Subject | null> {
  "use cache";
  cacheTag("catalogue");
  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  });

  const db = getAdminFirestore();
  const doc = await db.collection(`boards/${boardId}/classes/${classId}/subjects`).doc(subjectId).get();
  
  if (!doc.exists) return null;
  const data = doc.data() as Subject;
  if (!data.active) return null;

  return {
    name: data.name,
    slug: data.slug,
    active: data.active,
    display_order: data.display_order,
    icon: data.icon,
  };
}

export async function getChaptersServer(boardId: string, classId: string, subjectId: string): Promise<Chapter[]> {
  "use cache";
  cacheTag("catalogue", `catalogue:${boardId}:${classId}:${subjectId}`);
  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  });

  const db = getAdminFirestore();
  const snapshot = await db.collection(`boards/${boardId}/classes/${classId}/subjects/${subjectId}/chapters`)
    .where("active", "==", true)
    .orderBy("display_order", "asc")
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data() as Chapter;
    return {
      title: data.title,
      slug: data.slug,
      chapter_number: data.chapter_number,
      active: data.active,
      display_order: data.display_order,
      parentNodeId: (data as any).parentNodeId ?? null,
    };
  });
}

export async function getSubjectNotesTreeServer(boardId: string, classId: string, subjectId: string) {
  "use cache";
  cacheTag("catalogue", `catalogue:${boardId}:${classId}:${subjectId}`, `resources:${boardId}:${classId}:${subjectId}`);
  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  });
  const { getSubjectNotesTree } = await import("../services/catalogue/catalogueTreeService");
  return getSubjectNotesTree(boardId, classId, subjectId, "published");
}

export async function getSubjectPastPapersGroupedServer(boardId: string, classId: string, subjectId: string) {
  "use cache";
  cacheTag(`resources:${boardId}:${classId}:${subjectId}`);
  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  });
  const { getSubjectPastPapersGrouped } = await import("../services/catalogue/catalogueTreeService");
  return getSubjectPastPapersGrouped(boardId, classId, subjectId);
}

