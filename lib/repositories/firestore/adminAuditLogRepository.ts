import "server-only";
import { getAdminFirestore } from "../../firebase/admin";
import { Timestamp, Transaction } from "firebase-admin/firestore";
import * as crypto from "crypto";

export type AuditAction =
  | "resource.created"
  | "resource.version_added"
  | "resource.published"
  | "resource.hidden"
  | "resource.archived"
  | "resource.restored";

export interface AdminAuditLog {
  id: string;
  actorUid: string;
  requestId: string | null;
  action: AuditAction;
  entityType: "resource";
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: Timestamp;
}

export function writeAuditLogTransactionally(
  transaction: Transaction,
  log: Omit<AdminAuditLog, "id" | "createdAt">
) {
  const db = getAdminFirestore();
  const id = crypto.randomUUID();
  const ref = db.collection("admin_audit_logs").doc(id);

  transaction.set(ref, {
    ...log,
    id,
    createdAt: Timestamp.now(),
  });
}
