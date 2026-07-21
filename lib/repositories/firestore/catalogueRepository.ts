import "server-only";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { FieldValue, Transaction, WriteBatch } from "firebase-admin/firestore";
import { Board, ClassDoc, Subject, Chapter } from "@/lib/firestore/types";
import { CreateMutation, UpdateMutation, ToggleMutation } from "@/lib/validation/catalogue";

export class CatalogueRepository {
  private get db() {
    return getAdminFirestore();
  }

  // --- Helpers for constructing safe paths ---
  getBoardRef(boardId: string) {
    return this.db.collection("boards").doc(boardId);
  }
  
  getClassRef(boardId: string, classId: string) {
    return this.getBoardRef(boardId).collection("classes").doc(classId);
  }

  getSubjectRef(boardId: string, classId: string, subjectId: string) {
    return this.getClassRef(boardId, classId).collection("subjects").doc(subjectId);
  }

  getChapterRef(boardId: string, classId: string, subjectId: string, chapterId: string) {
    return this.getSubjectRef(boardId, classId, subjectId).collection("chapters").doc(chapterId);
  }

  getCollectionRefForLevel(mutation: CreateMutation) {
    switch (mutation.level) {
      case "board":
        return this.db.collection("boards");
      case "class":
        return this.getBoardRef(mutation.boardId).collection("classes");
      case "subject":
        return this.getClassRef(mutation.boardId, mutation.classId).collection("subjects");
      case "chapter":
        return this.getSubjectRef(mutation.boardId, mutation.classId, mutation.subjectId).collection("chapters");
    }
  }

  getDocRef(mutation: CreateMutation | UpdateMutation | ToggleMutation) {
    switch (mutation.level) {
      case "board": return this.getBoardRef(mutation.boardId);
      case "class": return this.getClassRef(mutation.boardId, mutation.classId);
      case "subject": return this.getSubjectRef(mutation.boardId, mutation.classId, mutation.subjectId);
      case "chapter": return this.getChapterRef(mutation.boardId, mutation.classId, mutation.subjectId, mutation.chapterId);
    }
  }

  // --- Transactions / Operations ---

  async runTransaction<T>(updateFunction: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(updateFunction);
  }

  batch(): WriteBatch {
    return this.db.batch();
  }

  // Used by create to determine the next display_order in the transaction
  async getNextDisplayOrder(transaction: Transaction, collectionRef: FirebaseFirestore.CollectionReference): Promise<number> {
    // Note: To find the max display_order, we can query order by display_order desc limit 1.
    // However, in a transaction, queries require locking the entire queried set.
    // This is acceptable here because create operations on the same parent are infrequent.
    const snapshot = await transaction.get(
      collectionRef.orderBy("display_order", "desc").limit(1)
    );
    if (snapshot.empty) {
      return 0;
    }
    const maxDoc = snapshot.docs[0].data();
    return (maxDoc.display_order ?? 0) + 1;
  }
}
