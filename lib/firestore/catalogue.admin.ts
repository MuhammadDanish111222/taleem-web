import "server-only";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { Board, ClassDoc, Subject, Chapter, ExaminationBoard } from "./types";
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

  // This screen is refreshed after every catalogue mutation.  Fetch each
  // independent branch in parallel instead of making one remote Firestore
  // request at a time.  The public helpers retain their own session checks;
  // this orchestration has already performed one check above.
  const db = getAdminFirestore();
  const boardsSnapshot = await db.collection("boards").orderBy("display_order", "asc").get();
  const boards = boardsSnapshot.docs.map((doc) => {
    const data = doc.data() as Board;
    return {
      name: data.name,
      slug: data.slug,
      active: data.active,
      display_order: data.display_order,
    };
  });

  return Promise.all(
    boards.map(async (board) => {
      const [classesSnapshot, examinationBoardsSnapshot] = await Promise.all([
        db.collection(`boards/${board.slug}/classes`).orderBy("display_order", "asc").get(),
        db.collection(`boards/${board.slug}/examinationBoards`).orderBy("display_order", "asc").get(),
      ]);
      const examinationBoards = examinationBoardsSnapshot.docs.map((doc) => {
        const data = doc.data() as ExaminationBoard;
        return {
          name: data.name,
          slug: data.slug,
          active: data.active,
          display_order: data.display_order,
        };
      });
      const classes = classesSnapshot.docs.map((doc) => {
        const data = doc.data() as ClassDoc;
        return {
          name: data.name,
          slug: data.slug,
          active: data.active,
          display_order: data.display_order,
        };
      });

      const classesWithChildren = await Promise.all(
        classes.map(async (cls) => {
          const subjectsSnapshot = await db
            .collection(`boards/${board.slug}/classes/${cls.slug}/subjects`)
            .orderBy("display_order", "asc")
            .get();
          const subjects = subjectsSnapshot.docs.map((doc) => {
            const data = doc.data() as Subject;
            return {
              name: data.name,
              slug: data.slug,
              active: data.active,
              display_order: data.display_order,
              icon: data.icon,
            };
          });

          const subjectsWithChildren = await Promise.all(
            subjects.map(async (subject) => {
              const chaptersSnapshot = await db
                .collection(`boards/${board.slug}/classes/${cls.slug}/subjects/${subject.slug}/chapters`)
                .orderBy("display_order", "asc")
                .get();
              const chapters = chaptersSnapshot.docs.map((doc) => {
                const data = doc.data() as Chapter;
                return {
                  title: data.title,
                  slug: data.slug,
                  chapter_number: data.chapter_number,
                  active: data.active,
                  display_order: data.display_order,
                };
              });
              return { ...subject, chapters };
            })
          );

          return { ...cls, subjects: subjectsWithChildren };
        })
      );

      return { ...board, examinationBoards, classes: classesWithChildren };
    })
  );
}
