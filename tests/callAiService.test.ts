import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callAiService } from '../lib/internalApi/callAiService';
import { generateKeyPair, exportPKCS8, decodeJwt } from 'jose';

describe('callAiService', () => {
  let privateKeyPem: string;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    privateKeyPem = await exportPKCS8(privateKey);
    process.env.INTERNAL_JWT_PRIVATE_KEY = privateKeyPem;
    process.env.INTERNAL_JWT_KEY_ID = 'test-kid-1';
    process.env.AI_SERVICE_INTERNAL_URL = 'http://localhost:8000';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('makes request to AI service with Authorization header and parses successful response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { result: 'ok' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await callAiService('/api/v1/test', 'POST', { query: 'test' }, 'user-456', true, 'ingestion', { requestId: 'req-custom-123' });

    expect(result).toEqual({ status: 'success', data: { result: 'ok' } });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/test');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Authorization']).toContain('Bearer ');

    const token = init.headers['Authorization'].replace('Bearer ', '');
    const payload = decodeJwt(token);
    expect(payload.uid).toBe('user-456');
    expect(payload.admin).toBe(true);
    expect(payload.feature).toBe('ingestion');
    expect(payload.request_id).toBe('req-custom-123');
  });

  it('handles error response from AI service properly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ detail: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid token' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      callAiService('/api/v1/test', 'GET', null, 'user-456')
    ).rejects.toThrow('AI Service Error (401)');
  });

  it('throws error if AI_SERVICE_INTERNAL_URL is missing', async () => {
    delete process.env.AI_SERVICE_INTERNAL_URL;
    await expect(
      callAiService('/api/v1/test', 'GET', null, 'user-456')
    ).rejects.toThrow('AI_SERVICE_INTERNAL_URL is not defined');
  });
});
