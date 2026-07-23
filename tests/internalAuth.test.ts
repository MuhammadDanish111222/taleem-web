import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signInternalJwt } from '../lib/internalAuth/signInternalJwt';
import { generateKeyPair, exportPKCS8, exportSPKI, decodeJwt, decodeProtectedHeader } from 'jose';

describe('signInternalJwt', () => {
  let privateKeyPem: string;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    privateKeyPem = await exportPKCS8(privateKey);
    process.env.INTERNAL_JWT_PRIVATE_KEY = privateKeyPem;
    process.env.INTERNAL_JWT_KEY_ID = 'test-kid-1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('mints a valid RS256 JWT with all mandatory claims and 60s expiration', async () => {
    const token = await signInternalJwt('user-123', true, 'ingestion', 'req-999');
    expect(token).toBeTypeOf('string');

    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe('test-kid-1');

    const payload = decodeJwt(token);
    expect(payload.uid).toBe('user-123');
    expect(payload.admin).toBe(true);
    expect(payload.feature).toBe('ingestion');
    expect(payload.request_id).toBe('req-999');
    expect(payload.aud).toBe('taleem-ai-service');
    expect(payload.iss).toBe('taleem-web');
    expect(payload.jti).toBeDefined();
    expect(typeof payload.jti).toBe('string');
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
  });

  it('generates fresh jti for each invocation', async () => {
    const token1 = await signInternalJwt('user-123');
    const token2 = await signInternalJwt('user-123');

    const payload1 = decodeJwt(token1);
    const payload2 = decodeJwt(token2);

    expect(payload1.jti).not.toBe(payload2.jti);
  });

  it('throws an error if INTERNAL_JWT_PRIVATE_KEY is missing', async () => {
    delete process.env.INTERNAL_JWT_PRIVATE_KEY;
    await expect(signInternalJwt('user-123')).rejects.toThrow('INTERNAL_JWT_PRIVATE_KEY is not defined');
  });

  it('throws an error if INTERNAL_JWT_KEY_ID is missing', async () => {
    delete process.env.INTERNAL_JWT_KEY_ID;
    await expect(signInternalJwt('user-123')).rejects.toThrow('INTERNAL_JWT_KEY_ID is not defined');
  });
});
