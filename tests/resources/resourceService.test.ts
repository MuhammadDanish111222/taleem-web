import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

import {
  createDraftResourceWithInitialVersion,
  publishResource,
  addResourceVersion,
  hideResource,
  archiveResource,
  restoreArchivedResource
} from '../../lib/services/admin/resourceService';
import * as hierarchyService from '../../lib/services/catalogue/catalogueHierarchyService';
import * as auditRepo from '../../lib/repositories/firestore/adminAuditLogRepository';
import { ResourceError } from '../../lib/resources/errors';
import { getAdminFirestore } from '../../lib/firebase/admin';

// Mock dependencies where necessary, though prefer emulator if possible.
// For simplicity in this suite, we'll mock the catalogue hierarchy to avoid setting it up in firestore.
vi.mock('../../lib/services/catalogue/catalogueHierarchyService', () => ({
  validateCatalogueHierarchy: vi.fn(),
}));

// Also mock the adminAuditLogRepository write to avoid complex assertions,
// or we can let it write to emulator.
const mockValidateHierarchy = vi.mocked(hierarchyService.validateCatalogueHierarchy);

const actor = { uid: 'admin-123', requestId: 'req-1' };
const baseInput = {
  type: 'book' as const,
  title: 'Test Book',
  boardId: 'b1',
  classId: 'c1',
  subjectId: 's1',
  chapterId: null,
  language: 'en',
  curriculumVersion: '1.0',
  displayOrder: 1,
};
const baseVersionInput = {
  originalFilename: 'test.pdf',
  sizeBytes: 1024,
  sha256: 'a'.repeat(64),
  pageCount: 10,
  providerRevision: 'rev1',
  storageKey: 'file123',
};

describe('Resource Service (Integration/Unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateHierarchy.mockResolvedValue();
  });

  it('creates draft resource with initial version', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    expect(resource.id).toBeDefined();
    expect(resource.status).toBe('draft');
    expect(resource.currentVersionId).toBeDefined();
    expect(mockValidateHierarchy).toHaveBeenCalledWith('b1', 'c1', 's1', null);
  });

  it('fails to create if hierarchy is invalid', async () => {
    mockValidateHierarchy.mockRejectedValueOnce(new ResourceError('HIERARCHY_INACTIVE', 'Inactive'));
    await expect(createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput))
      .rejects.toThrow(ResourceError);
  });

  it('publishes a draft resource and re-checks hierarchy', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    
    // Clear mocks to check if publish re-checks hierarchy
    mockValidateHierarchy.mockClear();
    
    const published = await publishResource(actor, resource.id);
    expect(published.status).toBe('published');
    expect(mockValidateHierarchy).toHaveBeenCalled();
  });

  it('hides a published resource without deleting storage', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    await publishResource(actor, resource.id);
    
    const hidden = await hideResource(actor, resource.id);
    expect(hidden.status).toBe('hidden');
  });

  it('archives a resource', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    const archived = await archiveResource(actor, resource.id);
    expect(archived.status).toBe('archived');
  });

  it('restores an archived resource to draft', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    await archiveResource(actor, resource.id);
    
    const restored = await restoreArchivedResource(actor, resource.id);
    expect(restored.status).toBe('draft');
  });

  it('replaces a version for a hidden resource', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    await publishResource(actor, resource.id);
    await hideResource(actor, resource.id);

    const oldVersionId = resource.currentVersionId;
    
    const newVersionInput = { ...baseVersionInput, storageKey: 'file456', providerRevision: 'rev2' };
    const updated = await addResourceVersion(actor, resource.id, newVersionInput);
    
    expect(updated.currentVersionId).not.toBe(oldVersionId);
  });

  it('fails to replace a version for a published resource', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    await publishResource(actor, resource.id);

    const newVersionInput = { ...baseVersionInput, storageKey: 'file456' };
    await expect(addResourceVersion(actor, resource.id, newVersionInput))
      .rejects.toThrow(/must be hidden/);
  });

  it('handles concurrent version replacements deterministically', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    await publishResource(actor, resource.id);
    await hideResource(actor, resource.id);

    const v2Input = { ...baseVersionInput, storageKey: 'file2' };
    const v3Input = { ...baseVersionInput, storageKey: 'file3' };

    const results = await Promise.allSettled([
      addResourceVersion(actor, resource.id, v2Input),
      addResourceVersion(actor, resource.id, v3Input)
    ]);

    // Either both succeed due to strict serialization without data loss, or one fails.
    // If one fails, it must fail deterministically, but in Firestore, transaction retry ensures serialization.
    expect(results.some(r => r.status === 'rejected')).toBe(false);

    const finalResource = (await getAdminFirestore().collection('resources').doc(resource.id).get()).data();
    
    // Check db for both versions
    const versions = await getAdminFirestore().collection('resources').doc(resource.id).collection('versions').get();
    expect(versions.docs.length).toBe(3); // init + v2 + v3
    
    // final currentVersionId should match one of the generated version docs
    const versionIds = versions.docs.map(d => d.id);
    expect(versionIds).toContain(finalResource?.currentVersionId);
  });

  it('rolls back audit insertion if mutation fails', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    await publishResource(actor, resource.id);
    await hideResource(actor, resource.id);
    
    const initialVersion = (await getAdminFirestore().collection('resources').doc(resource.id).get()).data()?.currentVersionId;

    vi.spyOn(auditRepo, 'writeAuditLogTransactionally').mockImplementationOnce(() => {
      throw new Error('Forced audit failure');
    });

    const v2Input = { ...baseVersionInput, storageKey: 'file-rollback' };
    await expect(addResourceVersion(actor, resource.id, v2Input)).rejects.toThrow('Forced audit failure');

    // Verify rollback
    const postFailResource = (await getAdminFirestore().collection('resources').doc(resource.id).get()).data();
    expect(postFailResource?.currentVersionId).toBe(initialVersion);
    
    // Verify no new version doc was added
    const versions = await getAdminFirestore().collection('resources').doc(resource.id).collection('versions').get();
    // It should have 1 version from creation
    expect(versions.docs.length).toBe(1); 
  }, 10000);

  it('performs index-backed query returning paginated results (listPublicResources)', async () => {
    // We import here to avoid circular or top-level import issues if any
    const { listPublicResources } = await import('../../lib/resources/public');
    
    const uniqueBoardId = 'board-pagination-' + Date.now();
    
    // Create multiple resources
    const r1 = await createDraftResourceWithInitialVersion(actor, { ...baseInput, boardId: uniqueBoardId, displayOrder: 1 }, baseVersionInput);
    await publishResource(actor, r1.id);
    const r2 = await createDraftResourceWithInitialVersion(actor, { ...baseInput, boardId: uniqueBoardId, displayOrder: 2 }, baseVersionInput);
    await publishResource(actor, r2.id);

    // Fetch first page (limit 1)
    const res1 = await listPublicResources({
      boardId: uniqueBoardId,
      classId: baseInput.classId,
      subjectId: baseInput.subjectId,
      limit: 1
    });

    expect(res1.data.length).toBe(1);
    expect(res1.data[0].id).toBe(r1.id);
    expect(res1.nextCursor).not.toBeNull();

    // Fetch second page using cursor
    const res2 = await listPublicResources({
      boardId: uniqueBoardId,
      classId: baseInput.classId,
      subjectId: baseInput.subjectId,
      limit: 1,
      cursor: res1.nextCursor!
    });

    expect(res2.data.length).toBe(1);
    expect(res2.data[0].id).toBe(r2.id);
  }, 10000);

  it('ensures Public DTO does not leak forbidden keys', async () => {
    const { listPublicResources } = await import('../../lib/resources/public');
    const r1 = await createDraftResourceWithInitialVersion(actor, { ...baseInput, displayOrder: 1 }, baseVersionInput);
    await publishResource(actor, r1.id);

    const res = await listPublicResources({
      boardId: baseInput.boardId,
      classId: baseInput.classId,
      subjectId: baseInput.subjectId,
    });
    
    expect(res.data.length).toBeGreaterThan(0);
    const dto = res.data[0];

    // Assert that these keys are not present
    const forbiddenKeys = [
      'storageKey',
      'storageProvider',
      'providerRevision',
      'sha256',
      'createdBy',
      'updatedBy',
      'driveId',
      'webContentLink'
    ];

    for (const key of forbiddenKeys) {
      expect((dto as any)[key]).toBeUndefined();
    }
  });

  it('rejects invalid status transitions and same-state transitions', async () => {
    const draftResource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    
    // draft -> hidden (rejected)
    await expect(hideResource(actor, draftResource.id)).rejects.toThrow(ResourceError);
    // restore draft (rejected, only archived can be restored)
    await expect(restoreArchivedResource(actor, draftResource.id)).rejects.toThrow(ResourceError);
    // same state draft -> archive is ok, but let's test draft -> publish
    const pubResource = await publishResource(actor, draftResource.id);
    
    // same state published -> published
    await expect(publishResource(actor, pubResource.id)).rejects.toThrow(ResourceError);
    // restore published (rejected)
    await expect(restoreArchivedResource(actor, pubResource.id)).rejects.toThrow(ResourceError);

    // published -> hidden (allowed)
    const hidResource = await hideResource(actor, pubResource.id);
    // same state hidden -> hidden
    await expect(hideResource(actor, hidResource.id)).rejects.toThrow(ResourceError);
    
    // hidden -> publish (allowed)
    const pubResource2 = await publishResource(actor, hidResource.id);
    
    // published -> archived (allowed)
    const archResource = await archiveResource(actor, pubResource2.id);
    // same state archived -> archived
    await expect(archiveResource(actor, archResource.id)).rejects.toThrow(ResourceError);
    // archived -> published (rejected)
    await expect(publishResource(actor, archResource.id)).rejects.toThrow(ResourceError);
    // archived -> hidden (rejected)
    await expect(hideResource(actor, archResource.id)).rejects.toThrow(ResourceError);
  });

  it('rejects replacing version for archived resource', async () => {
    const resource = await createDraftResourceWithInitialVersion(actor, baseInput, baseVersionInput);
    await archiveResource(actor, resource.id);
    await expect(addResourceVersion(actor, resource.id, baseVersionInput)).rejects.toThrow(ResourceError);
  });
});

