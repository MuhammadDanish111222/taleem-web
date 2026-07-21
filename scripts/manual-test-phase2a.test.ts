import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {}
}));

import { getApps, initializeApp } from 'firebase-admin/app';
import { getAdminFirestore } from '../lib/firebase/admin';
import { 
  createDraftResourceWithInitialVersion, 
  publishResource, 
  hideResource, 
  archiveResource,
  addResourceVersion
} from '../lib/services/admin/resourceService';
import * as hierarchyService from '../lib/services/catalogue/catalogueHierarchyService';

async function setupMockHierarchy() {
  const db = getAdminFirestore();
  console.log("🛠️ Setting up mock hierarchy data...");
  await db.collection('boards').doc('b1').set({ active: true, name: 'Board 1' });
  await db.collection('boards/b1/classes').doc('c1').set({ active: true, name: 'Class 1' });
  await db.collection('boards/b1/classes/c1/subjects').doc('s1').set({ active: true, name: 'Subject 1' });
}

async function runManualTest() {
  console.log("🚀 Starting Phase 2A Manual Test...");
  console.log("Connecting to Firestore Emulator at 127.0.0.1:8080\n");

  await setupMockHierarchy();

  const actor = { uid: 'admin-manual-tester', requestId: 'req-' + Date.now() };

  // 1. Create a draft resource
  console.log("📝 1. Creating a new Draft Resource...");
  const draft = await createDraftResourceWithInitialVersion(
    actor, 
    {
      type: 'book',
      title: 'Manual Test Physics Book',
      boardId: 'b1',
      classId: 'c1',
      subjectId: 's1',
      chapterId: null,
      language: 'en',
      curriculumVersion: '2026',
      displayOrder: 1
    }, 
    {
      originalFilename: 'physics_book.pdf',
      sizeBytes: 5000000,
      sha256: 'a'.repeat(64),
      pageCount: 150,
      providerRevision: 'rev1',
      storageKey: 'fake_drive_file_id_123'
    }
  );

  // 2. Publish the resource
  console.log("📢 2. Publishing the Resource...");
  const published = await publishResource(actor, draft.id);

  // 3. Hide the resource
  console.log("👁️‍🗨️ 3. Hiding the Resource...");
  const hidden = await hideResource(actor, draft.id);

  // 4. Add Replacement Version
  console.log("🔄 4. Adding replacement version...");
  const v1 = (await getAdminFirestore().collection('resources').doc(draft.id).collection('versions').doc(draft.currentVersionId).get()).data();
  const replaced = await addResourceVersion(actor, draft.id, {
    originalFilename: 'physics_book_v2.pdf',
    sizeBytes: 6000000,
    sha256: 'b'.repeat(64),
    pageCount: 160,
    providerRevision: 'rev2',
    storageKey: 'fake_drive_file_id_456'
  });

  // 5. Archive the resource
  console.log("📦 5. Archiving the Resource...");
  const archived = await archiveResource(actor, draft.id);

  // 6. Verify Database State
  console.log("🔍 6. Verifying Firestore Database State...");
  const doc = await getAdminFirestore().collection('resources').doc(draft.id).get();
  const finalData = doc.data();
  
  const versionsSnapshot = await getAdminFirestore().collection('resources').doc(draft.id).collection('versions').get();
  
  const auditLogsSnapshot = await getAdminFirestore().collection('admin_audit_logs')
    .where('entityId', '==', draft.id)
    .where('entityType', '==', 'resource')
    .orderBy('createdAt', 'asc')
    .get();

  // Assertions
  expect(versionsSnapshot.size).toBe(2);
  const v1Unchanged = (await getAdminFirestore().collection('resources').doc(draft.id).collection('versions').doc(draft.currentVersionId).get()).data();
  expect(v1Unchanged).toEqual(v1); // V1 is unchanged
  const v2 = (await getAdminFirestore().collection('resources').doc(draft.id).collection('versions').doc(finalData?.currentVersionId).get()).data();
  expect(v2?.supersedesVersionId).toBe(draft.currentVersionId);
  expect(finalData?.currentVersionId).toBe(v2?.id || finalData?.currentVersionId);
  expect(v1Unchanged?.storageKey).toBe('fake_drive_file_id_123');
  expect(v2?.storageKey).toBe('fake_drive_file_id_456');

  // Audit Logs
  expect(auditLogsSnapshot.size).toBe(5); // created, published, hidden, version_added, archived
  const actions = auditLogsSnapshot.docs.map(d => d.data().action);
  expect(actions).toEqual([
    "resource.created",
    "resource.published",
    "resource.hidden",
    "resource.version_added",
    "resource.archived",
  ]);

  auditLogsSnapshot.docs.forEach(d => {
    const data = d.data();
    expect(data.actorUid).toBe(actor.uid);
    expect(data.entityId).toBe(draft.id);
    expect(data.createdAt).toBeDefined();
    if (data.action === 'resource.created') {
      expect(data.before).toBeNull();
      expect(data.after?.id).toBe(draft.id);
    } else {
      expect(data.before).toBeDefined();
      expect(data.after).toBeDefined();
    }
  });

  console.log("\n🎉 Phase 2A Manual Test Completed Successfully!");
}

import { describe, it, expect } from 'vitest';

describe('Manual Test Phase 2A', () => {
  it('runs the manual test end-to-end', async () => {
    await runManualTest();
  }, 30000); // 30 seconds timeout
});
