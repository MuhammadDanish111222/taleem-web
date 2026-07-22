import "server-only";
import { getUploadConfig } from "../../uploads/config";
import { getCleanupRequiredTransactions, updateUploadTransactionState } from "../../repositories/firestore/uploadTransactionRepository";
import { StorageProvider } from "../../storage/StorageProvider";
import { writeAuditLogTransactionally } from "../../repositories/firestore/adminAuditLogRepository";
import { getAdminFirestore } from "../../firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export class UploadCleanupService {
  constructor(private storageProvider: StorageProvider) {}

  async processCleanupRequiredTransactions(adminUid: string): Promise<void> {
    const config = getUploadConfig();
    const transactions = await getCleanupRequiredTransactions(config.cleanupBatchSize);
    const adminDb = getAdminFirestore();

    for (const tx of transactions) {
      if (!tx.storageKey) {
        // Cannot cleanup without storage key
        await updateUploadTransactionState(tx.id, "failed", {
          sanitizedErrorMessage: "Missing storage key for cleanup",
          cleanupAttemptCount: tx.cleanupAttemptCount + 1,
        });
        continue;
      }

      if (tx.cleanupAttemptCount >= config.maxCleanupAttempts) {
        await updateUploadTransactionState(tx.id, "failed", {
          sanitizedErrorMessage: "Max cleanup attempts reached",
        });
        continue;
      }

      let success = false;
      let errMessage = "";

      try {
        await this.storageProvider.delete(tx.storageKey);
        success = true;
      } catch (err: any) {
        // Treat 404 Not Found as success (already cleaned)
        if (err.code === "STORAGE_NOT_FOUND" || err.message.includes("Not Found") || err.message.includes("404")) {
          success = true;
        } else {
          errMessage = err.message;
        }
      }

      const updates: any = {
        cleanupAttemptCount: tx.cleanupAttemptCount + 1,
        cleanupLastAttemptAt: FieldValue.serverTimestamp(),
      };

      if (success) {
        // Mark as failed terminally but cleanup is complete
        updates.cleanupCompletedAt = FieldValue.serverTimestamp();
        await updateUploadTransactionState(tx.id, "failed", updates);

        // Audit log for cleanup completion
        await adminDb.runTransaction(async (t) => {
          writeAuditLogTransactionally(t, {
            actorUid: adminUid,
            requestId: null,
            action: "content.cleanup_completed",
            entityType: "upload_transaction",
            entityId: tx.id,
            before: { state: "cleanup_required" },
            after: { state: "failed", cleanupCompleted: true },
          });
        });
      } else {
        updates.sanitizedErrorMessage = `Cleanup failed: ${errMessage}`;
        await updateUploadTransactionState(tx.id, "cleanup_required", updates);
      }
    }
  }
}

