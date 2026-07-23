import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import { callAiService } from '@/lib/internalApi/callAiService';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

describe('Genuine BFF -> callAiService.ts -> HTTP -> FastAPI Protected Endpoint Integration Test', () => {
  let privateKeyPem: string;
  let publicKeyPem: string;
  let serverProcess: ChildProcess | null = null;
  const originalEnv = process.env;
  const PORT = 8199;
  const KEY_ID = 'http-integration-kid';

  beforeEach(async () => {
    process.env = { ...originalEnv };
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    privateKeyPem = await exportPKCS8(privateKey);
    publicKeyPem = await exportSPKI(publicKey);

    process.env.INTERNAL_JWT_PRIVATE_KEY = privateKeyPem;
    process.env.INTERNAL_JWT_KEY_ID = KEY_ID;
    process.env.AI_SERVICE_INTERNAL_URL = `http://127.0.0.1:${PORT}`;

    const aiServiceDir = path.resolve(__dirname, '../../taleem-ai-service');
    serverProcess = spawn('uv', ['run', 'python', 'tests/run_fastapi_server.py', KEY_ID, String(PORT)], {
      cwd: aiServiceDir,
      env: { ...process.env, MOCK_PUBLIC_KEY_PEM: publicKeyPem },
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    serverProcess.stdin?.write(publicKeyPem);
    serverProcess.stdin?.end();

    // Wait for FastAPI server to start listening (up to 10s)
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/health`);
        if (res.ok) break;
      } catch {}
    }
  }, 20000);

  afterEach(() => {
    if (serverProcess) {
      serverProcess.kill('SIGKILL');
      serverProcess = null;
    }
    process.env = originalEnv;
  });

  it('calls callAiService over real HTTP and verifies claim preservation in FastAPI endpoint', async () => {
    const result = await callAiService(
      '/api/v1/internal/verify',
      'GET',
      null,
      'http-user-777',
      true,
      'bff_http_integration',
      { requestId: 'req-http-888' }
    );

    expect(result.status).toBe('authenticated');
    expect(result.uid).toBe('http-user-777');
    expect(result.is_admin).toBe(true);
    expect(result.feature).toBe('bff_http_integration');
    expect(result.request_id).toBe('req-http-888');
  }, 10000);
});
