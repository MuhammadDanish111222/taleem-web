import "server-only";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { writeAuditLogTransactionally } from "@/lib/repositories/firestore/adminAuditLogRepository";
import {
  academySettingsMutationSchema,
  type AcademySettingsMutation,
} from "@/lib/validation/academySettings";

export { academySettingsMutationSchema, type AcademySettingsMutation };

export type ManagedAcademyFields = {
  visible: boolean;
  whatsapp_number: string;
  whatsapp_message_template: string;
};

export function sanitizeAcademySettings(
  data: Record<string, unknown> | null | undefined
): ManagedAcademyFields | null {
  if (!data) return null;
  return {
    visible: data.visible === true,
    whatsapp_number: typeof data.whatsapp_number === "string" ? data.whatsapp_number : "",
    whatsapp_message_template:
      typeof data.whatsapp_message_template === "string" ? data.whatsapp_message_template : "",
  };
}

export async function readAcademySettingsAdmin(): Promise<ManagedAcademyFields | null> {
  const snap = await getAdminFirestore().doc("academy_settings/default").get();
  return sanitizeAcademySettings(snap.exists ? snap.data() : null);
}

export async function writeAcademySettingsAtomically(
  after: AcademySettingsMutation,
  actorUid: string,
  requestId: string
): Promise<ManagedAcademyFields> {
  const db = getAdminFirestore();
  const settingsRef = db.doc("academy_settings/default");

  await db.runTransaction(async (tx) => {
    // 1. Read INSIDE the transaction (Firestore read-before-write rule)
    const snap = await tx.get(settingsRef);
    const sanitizedBefore = sanitizeAcademySettings(snap.exists ? snap.data() : null);

    // 2. Write settings — merge: true preserves academy_name and unmanaged fields
    tx.set(
      settingsRef,
      {
        visible: after.visible,
        whatsapp_number: after.whatsapp_number,
        whatsapp_message_template: after.whatsapp_message_template,
      },
      { merge: true }
    );

    // 3. Write audit atomically in the same transaction
    writeAuditLogTransactionally(tx, {
      actorUid,
      requestId,
      action: "academy_settings.updated",
      entityType: "academy_settings",
      entityId: "default",
      before: sanitizedBefore as Record<string, unknown> | null,
      after: sanitizeAcademySettings(after) as Record<string, unknown>,
    });
  });

  return {
    visible: after.visible,
    whatsapp_number: after.whatsapp_number,
    whatsapp_message_template: after.whatsapp_message_template,
  };
}
