import { describe, it, expect, beforeAll, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { GoogleDriveProvider } from '../../lib/storage/googleDriveProvider';
import { Readable } from 'stream';

const runSmoke = process.env.RUN_DRIVE_SMOKE_TEST === 'true';
const itif = runSmoke ? it : it.skip;

describe('Google Drive Live Smoke Test', () => {
  let provider: GoogleDriveProvider;

  beforeAll(() => {
    if (runSmoke) {
      provider = new GoogleDriveProvider();
    }
  });

  itif('should upload, read metadata, read range, and delete a small PDF', async () => {
    // 1. Upload
    const buffer = Buffer.from('%PDF-1.4\n%Fake PDF for smoke test\n', 'utf-8');
    const stream = Readable.from(buffer);

    const metadata = await provider.upload({
      filename: 'smoke_test.pdf',
      mimeType: 'application/pdf',
      sizeBytes: buffer.length,
      body: stream
    });

    expect(metadata.storageKey).toBeDefined();
    expect(metadata.mimeType).toBe('application/pdf');

    const fileId = metadata.storageKey;

    try {
      // 2. Read Metadata
      const meta = await provider.getMetadata(fileId);
      expect(meta.name).toBe('smoke_test.pdf');
      
      // 3. Read Range
      const rangeRes = await provider.readRange(fileId, { start: 0, end: 4 });
      expect(rangeRes.status).toBe(206);
      expect(rangeRes.contentRange?.start).toBe(0);
      expect(rangeRes.contentRange?.end).toBe(4);
    } finally {
      // 4. Delete
      await provider.delete(fileId);
    }
  });
});
