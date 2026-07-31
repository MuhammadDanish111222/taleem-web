import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { GoogleDriveProvider } from '../../lib/storage/googleDriveProvider';
import { StorageError } from '../../lib/storage/errors';
import * as retry from '../../lib/storage/retry';
import { drive_v3 } from 'googleapis';

describe('GoogleDriveProvider (Unit)', () => {
  const mockConfig = {
    authMode: 'shared_drive' as const,
    clientEmail: 'test@example.com',
    privateKey: 'key',
    sharedDriveId: 'drive1',
    contentFolderId: 'folder1',
    requestTimeoutMs: 15000,
    maxAttempts: 3,
  };

  let mockDrive: any;
  let provider: GoogleDriveProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set sleep to a no-op for fast tests
    retry.setSleepForTesting(async () => {});

    mockDrive = {
      files: {
        create: vi.fn(),
        list: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      }
    };

    provider = new GoogleDriveProvider(mockDrive as any, mockConfig);
  });

  it('uploads a file successfully', async () => {
    mockDrive.files.create.mockResolvedValueOnce({
      data: {
        id: 'file1',
        name: 'test.pdf',
        mimeType: 'application/pdf',
        size: '1024',
        headRevisionId: 'rev1',
        driveId: 'drive1',
        capabilities: { canDownload: true }
      }
    });

    const stream = {} as any; // fake stream
    const metadata = await provider.upload({
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      body: stream
    });

    expect(metadata.storageKey).toBe('file1');
    expect(metadata.providerRevision).toBe('rev1');
    
    expect(mockDrive.files.create).toHaveBeenCalledWith(
      expect.objectContaining({
        supportsAllDrives: true,
        requestBody: { name: 'test.pdf', parents: ['folder1'] },
      }),
      expect.anything()
    );
  });

  it('fails upload if MIME type is not PDF', async () => {
    await expect(provider.upload({
      filename: 'test.jpg',
      mimeType: 'image/jpeg' as any,
      sizeBytes: 1024,
      body: {} as any
    })).rejects.toThrow(StorageError);
  });

  it('getMetadata returns normalized metadata', async () => {
    mockDrive.files.get.mockResolvedValueOnce({
      data: {
        id: 'file1',
        name: 'test.pdf',
        mimeType: 'application/pdf',
        size: '1024',
        headRevisionId: 'rev1',
        driveId: 'drive1',
        capabilities: { canDownload: true }
      }
    });

    const meta = await provider.getMetadata('file1');
    expect(meta.storageKey).toBe('file1');
    expect(mockDrive.files.get).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'file1', supportsAllDrives: true }),
      expect.anything()
    );
  });

  it('getMetadata rejects trashed file', async () => {
    mockDrive.files.get.mockResolvedValueOnce({
      data: {
        id: 'file1',
        trashed: true,
      }
    });

    await expect(provider.getMetadata('file1')).rejects.toThrow(/trashed/);
  });

  it('getMetadata rejects wrong shared drive', async () => {
    mockDrive.files.get.mockResolvedValueOnce({
      data: {
        id: 'file1',
        mimeType: 'application/pdf',
        driveId: 'wrong_drive',
      }
    });

    await expect(provider.getMetadata('file1')).rejects.toThrow(/outside configured/);
  });

  it('readRange requests exact bytes and parses Content-Range', async () => {
    mockDrive.files.get.mockResolvedValueOnce({
      status: 206,
      headers: {
        'content-range': 'bytes 0-99/1024',
        'content-length': '100',
        'content-type': 'application/pdf',
      },
      data: {} as any, // stream
    });

    const result = await provider.readRange('file1', { start: 0, end: 99 });
    
    expect(result.status).toBe(206);
    expect(result.contentRange).toEqual({ start: 0, end: 99, total: 1024 });
    
    expect(mockDrive.files.get).toHaveBeenCalledWith(
      expect.objectContaining({ alt: 'media', supportsAllDrives: true }),
      expect.objectContaining({ headers: { Range: 'bytes=0-99' } })
    );
  });

  it('uploads a paired cropped visual only when its MIME and content hash are allowlisted', async () => {
    mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
    mockDrive.files.create.mockResolvedValueOnce({ data: { id: 'image1', mimeType: 'image/png', driveId: 'drive1', trashed: false } });
    const result = await provider.uploadPairedVisual({ filename: 'paired.png', mimeType: 'image/png', body: Buffer.from('png'), contentHash: 'a'.repeat(64) });
    expect(result).toEqual({ storageKey: 'image1', created: true });
    expect(mockDrive.files.create).toHaveBeenCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ appProperties: { taleem_paired_visual_sha256: 'a'.repeat(64) } }) }), expect.anything());
    const uploadBody = mockDrive.files.create.mock.calls[0][0].media.body;
    expect(typeof uploadBody.pipe).toBe('function');
  });

  it('reuses the content-addressed visual on retry and rejects unsupported image MIME', async () => {
    mockDrive.files.list.mockResolvedValueOnce({ data: { files: [{ id: 'image1', mimeType: 'image/png', driveId: 'drive1', trashed: false }] } });
    await expect(provider.uploadPairedVisual({ filename: 'paired.png', mimeType: 'image/svg+xml' as any, body: Buffer.from('x'), contentHash: 'a'.repeat(64) })).rejects.toThrow(StorageError);
    const result = await provider.uploadPairedVisual({ filename: 'paired.png', mimeType: 'image/png', body: Buffer.from('png'), contentHash: 'a'.repeat(64) });
    expect(result.created).toBe(false); expect(mockDrive.files.create).not.toHaveBeenCalled();
  });

  it('lists only importer-owned paired visuals across pages', async () => {
    mockDrive.files.list
      .mockResolvedValueOnce({ data: { nextPageToken: 'next', files: [
        { id: 'paired-1', createdTime: '2026-01-01T00:00:00Z', driveId: 'drive1', appProperties: { taleem_paired_visual_sha256: 'a'.repeat(64) } },
        { id: 'ordinary-pdf', createdTime: '2026-01-01T00:00:00Z', driveId: 'drive1' },
      ] } })
      .mockResolvedValueOnce({ data: { files: [
        { id: 'paired-2', createdTime: '2026-01-02T00:00:00Z', driveId: 'drive1', appProperties: { taleem_paired_visual_sha256: 'b'.repeat(64) } },
      ] } });
    await expect(provider.listPairedVisuals()).resolves.toEqual([
      { storageKey: 'paired-1', createdAt: '2026-01-01T00:00:00Z' },
      { storageKey: 'paired-2', createdAt: '2026-01-02T00:00:00Z' },
    ]);
    expect(mockDrive.files.list).toHaveBeenCalledTimes(2);
  });

  it('refuses to delete a file without the paired-import ownership marker', async () => {
    mockDrive.files.get.mockResolvedValueOnce({ data: { id: 'ordinary-pdf', driveId: 'drive1' } });
    await expect(provider.deletePairedVisual('ordinary-pdf')).rejects.toThrow(/not an importer-owned visual/);
    expect(mockDrive.files.delete).not.toHaveBeenCalled();
  });

  it('derives a partial range from trusted metadata when Drive omits response headers', async () => {
    mockDrive.files.get
      .mockResolvedValueOnce({ status: 206, headers: {}, data: {} as any })
      .mockResolvedValueOnce({ data: {
        id: 'file1', name: 'test.pdf', mimeType: 'application/pdf', size: '12',
        headRevisionId: 'rev1', driveId: 'drive1', capabilities: { canDownload: true },
      } });

    const result = await provider.readRange('file1', { start: 0, end: 4 });

    expect(result.contentRange).toEqual({ start: 0, end: 4, total: 12 });
    expect(result.contentLength).toBe(5);
  });

  it('uses trusted immutable size without a second Drive metadata request', async () => {
    mockDrive.files.get.mockResolvedValueOnce({ status: 206, headers: {}, data: {} as any });

    const result = await provider.readRange(
      'file1',
      { start: 5, end: 9 },
      { trustedSizeBytes: 12 },
    );

    expect(result.contentRange).toEqual({ start: 5, end: 9, total: 12 });
    expect(result.contentLength).toBe(5);
    expect(mockDrive.files.get).toHaveBeenCalledTimes(1);
  });

  it('streams an allowlisted image only after Drive metadata validation', async () => {
    mockDrive.files.get
      .mockResolvedValueOnce({ data: { id: 'image1', mimeType: 'image/png', size: '12', driveId: 'drive1', capabilities: { canDownload: true } } })
      .mockResolvedValueOnce({ headers: { 'content-type': 'image/png', 'content-length': '12' }, data: {} as any });
    const image = await provider.readImage('image1');
    expect(image.mimeType).toBe('image/png');
    expect(image.contentLength).toBe(12);
    expect(mockDrive.files.get).toHaveBeenLastCalledWith(expect.objectContaining({ fileId: 'image1', alt: 'media' }), expect.anything());
  });

  it('uses verified metadata when Drive omits image response headers', async () => {
    mockDrive.files.get
      .mockResolvedValueOnce({ data: { id: 'image1', mimeType: 'image/png', size: '12', driveId: 'drive1', capabilities: { canDownload: true } } })
      .mockResolvedValueOnce({ headers: {}, data: {} as any });

    const image = await provider.readImage('image1');

    expect(image.mimeType).toBe('image/png');
    expect(image.contentLength).toBe(12);
  });

  it('rejects unsupported visual MIME types before reading media', async () => {
    mockDrive.files.get.mockResolvedValueOnce({ data: { id: 'image1', mimeType: 'image/svg+xml', driveId: 'drive1', capabilities: { canDownload: true } } });
    await expect(provider.readImage('image1')).rejects.toMatchObject({ code: 'STORAGE_INVALID_METADATA' });
    expect(mockDrive.files.get).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 error', async () => {
    // Fail once with 500, then succeed
    mockDrive.files.delete.mockRejectedValueOnce({ status: 500 });
    mockDrive.files.delete.mockResolvedValueOnce({});

    await provider.delete('file1');

    expect(mockDrive.files.delete).toHaveBeenCalledTimes(2);
  });

  it('fails after max retries', async () => {
    mockDrive.files.delete.mockRejectedValue({ status: 500 });

    await expect(provider.delete('file1')).rejects.toThrow(StorageError);
    expect(mockDrive.files.delete).toHaveBeenCalledTimes(3);
  });

  it('does not retry 403', async () => {
    mockDrive.files.delete.mockRejectedValue({ status: 403 });

    await expect(provider.delete('file1')).rejects.toThrow(StorageError);
    expect(mockDrive.files.delete).toHaveBeenCalledTimes(1);
  });
});
