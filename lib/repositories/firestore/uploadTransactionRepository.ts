import "server-only";
import { getAdminFirestore } from "../../firebase/admin";
import { UploadTransaction, UploadTransactionState } from "../../uploads/types";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "./adminAuditLogRepository";

const COLLECTION = "upload_transactions";

export function getUploadTransactionRef(id: string) {
  const adminDb = getAdminFirestore();
  return adminDb.collection(COLLECTION).doc(id);
}

export async function createUploadTransaction(transaction: UploadTransaction): Promise<void> {
  const ref = getUploadTransactionRef(transaction.id);
  await ref.create(transaction as any);
  
  await writeAuditLog({
    actorUid: transaction.adminUid,
    requestId: transaction.requestId,
    action: "upload_transaction.created",
    entityType: "upload_transaction",
    entityId: transaction.id,
    before: null,
    after: { ...transaction, createdAt: null, updatedAt: null },
  });
}

export async function getUploadTransaction(id: string): Promise<UploadTransaction | null> {
  const doc = await getUploadTransactionRef(id).get();
  if (!doc.exists) return null;
  return doc.data() as UploadTransaction;
}

export async function updateUploadTransactionState(
  id: string,
  newState: UploadTransactionState,
  updates: Partial<UploadTransaction> = {}
): Promise<void> {
  const ref = getUploadTransactionRef(id);
  const data: any = {
    ...updates,
    state: newState,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (newState === "uploaded" && !updates.uploadedAt) {
    data.uploadedAt = FieldValue.serverTimestamp();
  } else if (newState === "committed" && !updates.committedAt) {
    data.committedAt = FieldValue.serverTimestamp();
  } else if (newState === "failed" && !updates.failedAt) {
    data.failedAt = FieldValue.serverTimestamp();
  } else if (newState === "cleanup_required" && updates.cleanupCompletedAt) {
    data.cleanupCompletedAt = FieldValue.serverTimestamp();
  }

  const oldDoc = await ref.get();
  const oldState = oldDoc.exists ? oldDoc.data()?.state : null;
  const adminUid = oldDoc.exists ? oldDoc.data()?.adminUid : "unknown";
  const requestId = oldDoc.exists ? oldDoc.data()?.requestId : null;

  await ref.update(data);
  
  if (oldState && oldState !== newState) {
    await writeAuditLog({
      actorUid: adminUid,
      requestId,
      action: "upload_transaction.state_changed",
      entityType: "upload_transaction",
      entityId: id,
      before: { state: oldState },
      after: { state: newState, updates: { ...updates, createdAt: null, updatedAt: null } },
    });
  }
}

export async function getCleanupRequiredTransactions(limit: number = 10): Promise<UploadTransaction[]> {
  const adminDb = getAdminFirestore();
  const snapshot = await adminDb
    .collection(COLLECTION)
    .where("state", "==", "cleanup_required")
    .orderBy("updatedAt", "asc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as UploadTransaction);
}

export async function checkDuplicateContent(
  sha256: string,
  resourceType: string,
  boardId: string,
  classId: string,
  subjectId: string,
  chapterId: string | null
): Promise<UploadTransaction | null> {
  const adminDb = getAdminFirestore();
  let query = adminDb.collection(COLLECTION)
    .where("sha256", "==", sha256)
    .where("resourceType", "==", resourceType)
    .where("boardId", "==", boardId)
    .where("classId", "==", classId)
    .where("subjectId", "==", subjectId);

  if (chapterId) {
    query = query.where("chapterId", "==", chapterId);
  } else {
    query = query.where("chapterId", "==", null);
  }

  const snapshot = await query.where("state", "==", "committed").limit(1).get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as UploadTransaction;
}
