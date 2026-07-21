import "server-only";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { Board, ClassDoc, Subject, Chapter } from "./types";
import { requireAdminSession } from "@/lib/auth/session";

export async function getAdminBoards(): Promise<Board[]> {
  await requireAdminSession();
  
  const db = getAdminFirestore();
  const snapshot = await db.collection("boards").orderBy("display_order", "asc").get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data() as Board;
    return {
      name: data.name,
      slug: data.slug,
      active: data.active,
      display_order: data.display_order,
    };
  });
}

export async function getAdminClasses(boardId: string): Promise<ClassDoc[]> {
  await requireAdminSession();
  
  const db = getAdminFirestore();
  const snapshot = await db.collection(`boards/${boardId}/classes`).orderBy("display_order", "asc").get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data() as ClassDoc;
    return {
      name: data.name,
      slug: data.slug,
      active: data.active,
      display_order: data.display_order,
    };
  });
}

export async function getAdminSubjects(boardId: string, classId: string): Promise<Subject[]> {
  await requireAdminSession();
  
  const db = getAdminFirestore();
  const snapshot = await db.collection(`boards/${boardId}/classes/${classId}/subjects`).orderBy("display_order", "asc").get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data() as Subject;
    return {
      name: data.name,
      slug: data.slug,
      active: data.active,
      display_order: data.display_order,
      icon: data.icon,
    };
  });
}

export async function getAdminChapters(boardId: string, classId: string, subjectId: string): Promise<Chapter[]> {
  await requireAdminSession();
  
  const db = getAdminFirestore();
  const snapshot = await db.collection(`boards/${boardId}/classes/${classId}/subjects/${subjectId}/chapters`).orderBy("display_order", "asc").get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data() as Chapter;
    return {
      title: data.title,
      slug: data.slug,
      chapter_number: data.chapter_number,
      active: data.active,
      display_order: data.display_order,
    };
  });
}

export async function getFullAdminTree() {
  await requireAdminSession();
  
  const boards = await getAdminBoards();
  const tree = [];
  
  for (const board of boards) {
    const classes = await getAdminClasses(board.slug);
    const classesWithChildren = [];
    
    for (const cls of classes) {
      const subjects = await getAdminSubjects(board.slug, cls.slug);
      const subjectsWithChildren = [];
      
      for (const sub of subjects) {
        const chapters = await getAdminChapters(board.slug, cls.slug, sub.slug);
        subjectsWithChildren.push({ ...sub, chapters });
      }
      
      classesWithChildren.push({ ...cls, subjects: subjectsWithChildren });
    }
    
    tree.push({ ...board, classes: classesWithChildren });
  }
  
  return tree;
}

