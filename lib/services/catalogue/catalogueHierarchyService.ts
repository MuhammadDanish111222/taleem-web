import "server-only";
import { getBoardServer, getClassServer, getSubjectServer, getChaptersServer } from "../../firestore/catalogue.server";
import { ResourceError } from "../../resources/errors";

export async function validateCatalogueHierarchy(
  boardId: string,
  classId: string,
  subjectId?: string | null,
  chapterId?: string | null
): Promise<void> {
  const board = await getBoardServer(boardId);
  if (!board) {
    throw new ResourceError("HIERARCHY_INACTIVE", `Board ${boardId} does not exist or is inactive.`);
  }

  const cls = await getClassServer(boardId, classId);
  if (!cls) {
    throw new ResourceError("HIERARCHY_INACTIVE", `Class ${classId} does not exist or is inactive.`);
  }

  if (subjectId) {
    const subject = await getSubjectServer(boardId, classId, subjectId);
    if (!subject) {
      throw new ResourceError("HIERARCHY_INACTIVE", `Subject ${subjectId} does not exist or is inactive.`);
    }

    if (chapterId) {
      const chapters = await getChaptersServer(boardId, classId, subjectId);
      const chapter = chapters.find((c) => c.slug === chapterId);
      if (!chapter) {
        throw new ResourceError("HIERARCHY_INACTIVE", `Chapter ${chapterId} does not exist or is inactive.`);
      }
    }
  }
}
