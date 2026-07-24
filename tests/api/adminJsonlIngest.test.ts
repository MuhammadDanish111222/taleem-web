/**
 * Unit test for Admin JSONL Ingestion Route POST /api/admin/ingest/jsonl.
 *
 * Environment: Verified against a mocked fetch / HTTP handler and mocked admin session.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/admin/ingest/jsonl/route';
import { NextRequest } from 'next/server';
import { generateKeyPair, exportPKCS8, decodeJwt } from 'jose';

vi.mock('@/lib/auth/session', () => ({
  requireAdminSession: vi.fn().mockResolvedValue({
    uid: 'admin-user-999',
    admin: true,
  }),
}));

describe('Admin JSONL Ingest Route POST /api/admin/ingest/jsonl', () => {
  let privateKeyPem: string;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    privateKeyPem = await exportPKCS8(privateKey);
    process.env.INTERNAL_JWT_PRIVATE_KEY = privateKeyPem;
    process.env.INTERNAL_JWT_KEY_ID = 'ingest-kid';
    process.env.AI_SERVICE_INTERNAL_URL = 'http://localhost:8000';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('rejects empty or missing jsonl_content with status 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/ingest/jsonl', {
      method: 'POST',
      body: JSON.stringify({ jsonl_content: '' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.message).toContain('Missing or empty jsonl_content');
  });

  it('authenticates admin session, signs internal JWT, and forwards jsonl payload to AI service', async () => {
    const sampleJsonl = '{"board_id":"fbise","class_id":"class_9","subject_id":"physics","chapter_id":"ch_1","topic_no":"1.1","topic_title":"Title","chunk_order":0,"content_type":"explanation","chunk_text":"Sample text"}';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'queued',
        job_id: 'job-uuid-12345',
        job_type: 'jsonl_ingest',
        idempotency_key: 'idempotent-key-100',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const req = new NextRequest('http://localhost:3000/api/admin/ingest/jsonl', {
      method: 'POST',
      body: JSON.stringify({
        jsonl_content: sampleJsonl,
        idempotency_key: 'idempotent-key-100',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.data.job_id).toBe('job-uuid-12345');
    expect(data.data.status).toBe('queued');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/internal/ingest/jsonl');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toContain('Bearer ');

    const token = init.headers['Authorization'].replace('Bearer ', '');
    const payload = decodeJwt(token);
    expect(payload.uid).toBe('admin-user-999');
    expect(payload.admin).toBe(true);
    expect(payload.feature).toBe('jsonl_ingest');

    const reqBody = JSON.parse(init.body);
    expect(reqBody.jsonl_content).toBe(sampleJsonl);
    expect(reqBody.idempotency_key).toBe('idempotent-key-100');
  });
});
