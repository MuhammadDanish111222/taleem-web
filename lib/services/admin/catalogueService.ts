import "server-only";
import { CatalogueRepository } from "@/lib/repositories/firestore/catalogueRepository";
import { CatalogueMutation, CreateMutation, ReorderMutation, ToggleMutation, UpdateMutation } from "@/lib/validation/catalogue";
import { FieldValue } from "firebase-admin/firestore";

export class DomainError extends Error {
  constructor(public code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class CatalogueService {
  private repo: CatalogueRepository;

  constructor() {
    this.repo = new CatalogueRepository();
  }

  // Ensures the parent document actually exists before proceeding.
  private async assertParentExists(mutation: CatalogueMutation) {
    if (mutation.level === "board") return;
    
    // For Class, Subject, Chapter, ExaminationBoard, the Board must exist
    const boardRef = this.repo.getBoardRef(mutation.boardId);
    const boardDoc = await boardRef.get();
    if (!boardDoc.exists) throw new DomainError("NOT_FOUND", `Parent board ${mutation.boardId} not found`);

    if (mutation.level === "examinationBoard") return;

    // For Subject, Chapter, the Class must exist
    if (mutation.level === "subject" || mutation.level === "chapter") {
      const classRef = this.repo.getClassRef(mutation.boardId, mutation.classId);
      const classDoc = await classRef.get();
      if (!classDoc.exists) throw new DomainError("NOT_FOUND", `Parent class ${mutation.classId} not found`);
    }

    // For Chapter, the Subject must exist
    if (mutation.level === "chapter") {
      const subjectRef = this.repo.getSubjectRef(mutation.boardId, mutation.classId, mutation.subjectId);
      const subjectDoc = await subjectRef.get();
      if (!subjectDoc.exists) throw new DomainError("NOT_FOUND", `Parent subject ${mutation.subjectId} not found`);
    }
  }

  async handleMutation(mutation: CatalogueMutation) {
    switch (mutation.operation) {
      case "create": return this.create(mutation);
      case "update": return this.update(mutation);
      case "toggle": return this.toggle(mutation);
      case "reorder": return this.reorder(mutation);
      default:
        throw new DomainError("VALIDATION", "Invalid operation");
    }
  }

  private async create(mutation: CreateMutation) {
    await this.assertParentExists(mutation);

    const collectionRef = this.repo.getCollectionRefForLevel(mutation);
    const targetSlug = mutation.level === "board" ? mutation.boardId :
                       mutation.level === "examinationBoard" ? mutation.examinationBoardId :
                       mutation.level === "class" ? mutation.classId :
                       mutation.level === "subject" ? mutation.subjectId :
                       mutation.chapterId;
                       
    const docRef = collectionRef.doc(targetSlug);

    if (mutation.level === "chapter" && mutation.parentNodeId) {
      try {
        await this.repo.validateNodeParentage(
          mutation.boardId,
          mutation.classId,
          mutation.subjectId,
          targetSlug,
          mutation.parentNodeId
        );
      } catch (err) {
        throw new DomainError("VALIDATION", err instanceof Error ? err.message : "Invalid node parentage");
      }
    }

    return this.repo.runTransaction(async (transaction) => {
      // 1. Check for duplicate slug atomically
      const docSnapshot = await transaction.get(docRef);
      if (docSnapshot.exists) {
        throw new DomainError("CONFLICT", `A ${mutation.level} with slug '${targetSlug}' already exists.`);
      }

      // 2. Calculate next display_order atomically
      const display_order = await this.repo.getNextDisplayOrder(transaction, collectionRef);

      // 3. Construct payload (excluding forbidden fields like path)
      const payload: any = {
        slug: targetSlug,
        active: true, // Always active on create
        display_order,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };

      if (mutation.level === "board" || mutation.level === "examinationBoard" || mutation.level === "class" || mutation.level === "subject") {
        payload.name = mutation.name;
      }
      if (mutation.level === "subject" && mutation.icon) {
        payload.icon = mutation.icon;
      }
      if (mutation.level === "chapter") {
        payload.title = mutation.title;
        payload.chapter_number = mutation.chapter_number ?? null;
        payload.parentNodeId = mutation.parentNodeId ?? null;
      }

      // 4. Create document
      transaction.set(docRef, payload);
    });
  }

  private async update(mutation: UpdateMutation) {
    if (mutation.level === "chapter" && mutation.parentNodeId !== undefined && mutation.parentNodeId !== null) {
      try {
        await this.repo.validateNodeParentage(
          mutation.boardId,
          mutation.classId,
          mutation.subjectId,
          mutation.chapterId,
          mutation.parentNodeId
        );
      } catch (err) {
        throw new DomainError("VALIDATION", err instanceof Error ? err.message : "Invalid node parentage");
      }
    }

    const docRef = this.repo.getDocRef(mutation);
    
    return this.repo.runTransaction(async (transaction) => {
      const docSnapshot = await transaction.get(docRef);
      if (!docSnapshot.exists) {
        throw new DomainError("NOT_FOUND", `${mutation.level} not found`);
      }

      const payload: any = {
        updated_at: FieldValue.serverTimestamp(),
      };

      if (mutation.level === "board" || mutation.level === "examinationBoard" || mutation.level === "class" || mutation.level === "subject") {
        payload.name = mutation.name;
      }
      if (mutation.level === "subject") {
        payload.icon = mutation.icon ?? null;
      }
      if (mutation.level === "chapter") {
        payload.title = mutation.title;
        if (mutation.chapter_number !== undefined) payload.chapter_number = mutation.chapter_number ?? null;
        if (mutation.parentNodeId !== undefined) payload.parentNodeId = mutation.parentNodeId ?? null;
      }

      transaction.update(docRef, payload);
    });
  }


  private async toggle(mutation: ToggleMutation) {
    const docRef = this.repo.getDocRef(mutation);
    
    return this.repo.runTransaction(async (transaction) => {
      const docSnapshot = await transaction.get(docRef);
      if (!docSnapshot.exists) {
        throw new DomainError("NOT_FOUND", `${mutation.level} not found`);
      }

      transaction.update(docRef, {
        active: mutation.active,
        updated_at: FieldValue.serverTimestamp(),
      });
    });
  }

  private async reorder(mutation: ReorderMutation) {
    const collectionRef = (() => {
       // Using a dummy CreateMutation to reuse getCollectionRefForLevel
       const base = { ...mutation, operation: "create" as const, name: "dummy" };
       return this.repo.getCollectionRefForLevel(base as any);
    })();
    
    return this.repo.runTransaction(async (transaction) => {
      const siblingsSnapshot = await transaction.get(collectionRef);
      const existingIds = new Set(siblingsSnapshot.docs.map(doc => doc.id));
      
      const requestedIds = mutation.orderedIds;
      const requestedSet = new Set(requestedIds);

      // Validate orderedIds contains no duplicates
      if (requestedIds.length !== requestedSet.size) {
        throw new DomainError("VALIDATION", "Duplicate IDs found in reorder payload");
      }

      // Validate lengths match
      if (requestedIds.length !== existingIds.size) {
        throw new DomainError("VALIDATION", `Expected exactly ${existingIds.size} IDs, but got ${requestedIds.length}`);
      }

      // Validate all IDs match exactly
      for (const id of requestedIds) {
        if (!existingIds.has(id)) {
          throw new DomainError("VALIDATION", `ID '${id}' is not a valid sibling in this parent`);
        }
      }

      // Apply the new order
      requestedIds.forEach((id, index) => {
        const docRef = collectionRef.doc(id);
        transaction.update(docRef, { 
          display_order: index,
          updated_at: FieldValue.serverTimestamp(),
        });
      });
    });
  }
}

export const catalogueService = new CatalogueService();
