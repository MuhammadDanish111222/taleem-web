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
