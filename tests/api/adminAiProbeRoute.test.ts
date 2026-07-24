import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/admin/ai-probe/route';
import { NextRequest } from 'next/server';
import { generateKeyPair, exportPKCS8, decodeJwt } from 'jose';

vi.mock('@/lib/auth/session', () => ({
  requireAdminSession: vi.fn().mockResolvedValue({
    uid: 'admin-user-777',
    admin: true,
  }),
}));

describe('Admin AI Probe Route GET /api/admin/ai-probe', () => {
  let privateKeyPem: string;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    privateKeyPem = await exportPKCS8(privateKey);
    process.env.INTERNAL_JWT_PRIVATE_KEY = privateKeyPem;
    process.env.INTERNAL_JWT_KEY_ID = 'probe-kid';
    process.env.AI_SERVICE_INTERNAL_URL = 'http://localhost:8000';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('authenticates admin session, signs internal JWT via callAiService, and returns AI service probe result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'authenticated',
        uid: 'admin-user-777',
        is_admin: true,
        feature: 'admin_probe',
        request_id: 'req-probe-1',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const req = new NextRequest('http://localhost:3000/api/admin/ai-probe');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.aiServiceResponse.uid).toBe('admin-user-777');
    expect(data.aiServiceResponse.is_admin).toBe(true);
    expect(data.aiServiceResponse.feature).toBe('admin_probe');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/internal/verify');
    expect(init.headers['Authorization']).toContain('Bearer ');

    const token = init.headers['Authorization'].replace('Bearer ', '');
    const payload = decodeJwt(token);
    expect(payload.uid).toBe('admin-user-777');
    expect(payload.admin).toBe(true);
    expect(payload.feature).toBe('admin_probe');
    expect(payload.request_id).toBeDefined();
  });
});
