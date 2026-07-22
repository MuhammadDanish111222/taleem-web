import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidateTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {}
}));

import { getAdminFirestore } from '../lib/firebase/admin';
import { UploadService } from '../lib/services/admin/uploadService';
import { StorageProvider } from '../lib/storage/StorageProvider';
import { createTempFile } from '../lib/security/tempFile';
import { validatePdf } from '../lib/security/pdfValidation';
import { PDFDocument } from 'pdf-lib';
import * as crypto from 'crypto';
import {
  publishResource,
  hideResource,
  addResourceVersion
} from '../lib/services/admin/resourceService';

class TestStorageProvider implements StorageProvider {
  public uploadedFiles = new Map<string, any>();
  public deletedFiles = new Set<string>();

  async upload(input: any): Promise<any> {
    if (input.body && typeof input.body.destroy === "function") {
      input.body.destroy();
    }
    const key = `drive-file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const metadata = {
      provider: "google_drive",
      storageKey: key,
      name: input.filename,
      mimeType: "application/pdf",
      sizeBytes: input.sizeBytes,
      providerRevision: "rev-1",
      canDownload: true,
    };
    this.uploadedFiles.set(key, metadata);
    return metadata;
  }

  async getMetadata(storageKey: string): Promise<any> {
    if (this.deletedFiles.has(storageKey)) return null;
    return this.uploadedFiles.get(storageKey) || null;
  }

  async readRange(): Promise<any> { return null as any; }

  async delete(storageKey: string): Promise<void> {
    this.deletedFiles.add(storageKey);
  }
}

async function setupMockHierarchy() {
  const db = getAdminFirestore();
  console.log("🛠️ 1. Setting up mock hierarchy in Firestore...");
  await db.collection('boards').doc('b1').set({ active: true, name: 'Board 1' });
  await db.collection('boards/b1/classes').doc('c1').set({ active: true, name: 'Class 1' });
  await db.collection('boards/b1/classes/c1/subjects').doc('s1').set({ active: true, name: 'Subject 1' });
}

async function runPhase2bE2ETest() {
  console.log("🚀 Starting Phase 2B Real Firestore & Storage E2E Test...");
  console.log("Connecting to Firestore Emulator at 127.0.0.1:8080\n");

  await setupMockHierarchy();

  const storageProvider = new TestStorageProvider();
  const uploadService = new UploadService(storageProvider);

  // A. Upload PDF Document
  console.log("📄 2. Generating valid PDF & executing UploadService...");
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595.28, 841.89]);
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const actualSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

  const tempFile = await createTempFile();
  await new Promise<void>((resolve) => {
    tempFile.writeStream.write(pdfBuffer, () => {
      tempFile.writeStream.end(() => resolve());
    });
  });

  const validatedPdf = await validatePdf({
    tempFile,
    sha256: actualSha256,
    sizeBytes: pdfBuffer.length,
    originalFilename: "phase2b_manual_test.pdf",
    mimeType: "application/pdf",
    magicBytesValid: true,
  });

  const adminUid = "admin-phase2b-tester";
  const requestId = "req-phase2b-" + Date.now();
  const idempotencyKey = "idem-phase2b-" + Date.now();
  const metadataFields = {
    operation: "create_resource",
    type: "book",
    title: "Phase 2B E2E Test Textbook",
    boardId: "b1",
    classId: "c1",
    subjectId: "s1",
    language: "en",
    curriculumVersion: "2026",
    displayOrder: "1",
  };

  const uploadResult = await uploadService.processUpload(
    adminUid,
    requestId,
    idempotencyKey,
    metadataFields,
    validatedPdf,
    tempFile
  );

  await tempFile.cleanup();

  console.log("   ✅ Upload committed. Transaction ID:", uploadResult.transactionId);
  console.log("   ✅ Created Resource ID:", uploadResult.resourceId);
  console.log("   ✅ Created Version ID:", uploadResult.versionId);

  // B. Verify Firestore Upload Transaction Record
  console.log("\n🔍 3. Verifying UploadTransaction record in Firestore...");
  const txDocSnap = await getAdminFirestore().collection("upload_transactions").doc(uploadResult.transactionId).get();
  expect(txDocSnap.exists).toBe(true);
  const txData = txDocSnap.data();
  expect(txData?.state).toBe("committed");
  expect(txData?.adminUid).toBe(adminUid);
  expect(txData?.committedResourceId).toBe(uploadResult.resourceId);
  expect(txData?.committedVersionId).toBe(uploadResult.versionId);
  expect(txData?.sha256).toBe(actualSha256);
  console.log("   ✅ UploadTransaction record verified in Firestore");

  // C. Verify Resource and Version Record
  console.log("\n🔍 4. Verifying Resource & Version documents in Firestore...");
  const resourceDocSnap = await getAdminFirestore().collection("resources").doc(uploadResult.resourceId).get();
  expect(resourceDocSnap.exists).toBe(true);
  const resourceData = resourceDocSnap.data();
  expect(resourceData?.status).toBe("draft");
  expect(resourceData?.title).toBe("Phase 2B E2E Test Textbook");
  expect(resourceData?.currentVersionId).toBe(uploadResult.versionId);

  const versionDocSnap = await getAdminFirestore()
    .collection("resources")
    .doc(uploadResult.resourceId)
    .collection("versions")
    .doc(uploadResult.versionId)
    .get();
  expect(versionDocSnap.exists).toBe(true);
  const v1Data = versionDocSnap.data();
  expect(v1Data?.storageKey).toBeDefined();
  expect(v1Data?.sha256).toBe(actualSha256);
  console.log("   ✅ Resource & Version 1 documents verified in Firestore");

  // D. Publish Resource
  console.log("\n📢 5. Publishing Resource...");
  const actor = { uid: adminUid, requestId };
  const publishedRes = await publishResource(actor, uploadResult.resourceId);
  expect(publishedRes.status).toBe("published");
  console.log("   ✅ Resource state updated to: 'published'");

  // E. Hide Resource
  console.log("\n👁️‍🗨️ 6. Hiding Resource...");
  const hiddenRes = await hideResource(actor, uploadResult.resourceId);
  expect(hiddenRes.status).toBe("hidden");
  console.log("   ✅ Resource state updated to: 'hidden'");

  // F. Add Replacement Version (Version 2)
  console.log("\n🔄 7. Adding Version 2 (Replacement PDF)...");
  const v2Result = await addResourceVersion(actor, uploadResult.resourceId, {
    originalFilename: "phase2b_manual_test_v2.pdf",
    sizeBytes: pdfBuffer.length + 100,
    sha256: "b".repeat(64),
    pageCount: 2,
    providerRevision: "rev-2",
    storageKey: "drive-file-version-2",
  });

  // Verify Version Immutability
  console.log("\n🔍 8. Verifying Version Immutability (v1 preserved, v2 supersedes v1)...");
  const versionsSnap = await getAdminFirestore()
    .collection("resources")
    .doc(uploadResult.resourceId)
    .collection("versions")
    .get();
  expect(versionsSnap.size).toBe(2);

  const v1PreservedSnap = await getAdminFirestore()
    .collection("resources")
    .doc(uploadResult.resourceId)
    .collection("versions")
    .doc(uploadResult.versionId)
    .get();
  expect(v1PreservedSnap.data()).toEqual(v1Data); // V1 unchanged!

  const v2Snap = await getAdminFirestore()
    .collection("resources")
    .doc(uploadResult.resourceId)
    .collection("versions")
    .doc(v2Result.currentVersionId)
    .get();
  expect(v2Snap.data()?.supersedesVersionId).toBe(uploadResult.versionId);
  console.log("   ✅ Version 1 remains unchanged; Version 2 correctly supersedes Version 1");

  // G. Verify Audit Logs in Firestore
  console.log("\n📜 9. Verifying Audit Logs in Firestore (`admin_audit_logs`)...");
  const auditLogsSnap = await getAdminFirestore()
    .collection("admin_audit_logs")
    .where("entityId", "==", uploadResult.resourceId)
    .orderBy("createdAt", "asc")
    .get();

  expect(auditLogsSnap.size).toBe(4); // created, published, hidden, version_added
  const actions = auditLogsSnap.docs.map((d) => d.data().action);
  expect(actions).toEqual([
    "resource.created",
    "resource.published",
    "resource.hidden",
    "resource.version_added",
  ]);
  console.log("   ✅ Audit Log records verified in Firestore:", actions.join(" -> "));

  console.log("\n🎉 Phase 2B End-to-End Real Firestore & Storage Test Completed Successfully!");
}

import { describe, it, expect } from "vitest";

describe("Manual Test Phase 2B (Real Firestore & Storage)", () => {
  it("runs Phase 2B end-to-end workflow against Firebase Emulator", async () => {
    await runPhase2bE2ETest();
  }, 30000);
});
